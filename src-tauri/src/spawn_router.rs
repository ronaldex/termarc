use std::{sync::Arc, time::Duration};
use tauri::{State, Window};

use crate::subagents::{
    ReserveSubagent, SubagentCloseEvent, SubagentPiStateUpdate, SubagentRegistry,
    SubagentSpawnAcknowledgement, SubagentSpawnEvent, TopLevelTerminalMetadata,
};

pub(crate) const SUBAGENT_SPAWN_EVENT: &str = "termarc://subagent-spawn-request";
pub(crate) const SUBAGENT_CLOSE_EVENT: &str = "termarc://subagent-close-request";
const SPAWN_ACK_TIMEOUT: Duration = Duration::from_secs(5);

type EventEmitter = dyn Fn(&str, &SubagentSpawnEvent) -> Result<(), String> + Send + Sync + 'static;
type CloseEventEmitter =
    dyn Fn(&str, &SubagentCloseEvent) -> Result<(), String> + Send + Sync + 'static;

#[derive(Clone)]
pub(crate) struct SpawnRouter {
    registry: SubagentRegistry,
    emit: Arc<EventEmitter>,
    close_emit: Option<Arc<CloseEventEmitter>>,
    timeout: Duration,
}

#[tauri::command]
pub(crate) fn register_top_level_terminals(
    terminals: Vec<TopLevelTerminalMetadata>,
    window: Window,
    router: State<'_, SpawnRouter>,
) -> Result<(), String> {
    router.register_top_level_terminals(window.label(), terminals)
}

#[tauri::command]
pub(crate) fn update_subagent_pi_state(
    update: SubagentPiStateUpdate,
    router: State<'_, SpawnRouter>,
) -> Result<(), String> {
    router
        .registry
        .update_pi_state(update)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub(crate) fn acknowledge_subagent_spawn(
    acknowledgement: SubagentSpawnAcknowledgement,
    router: State<'_, SpawnRouter>,
) -> Result<(), String> {
    router.acknowledge(acknowledgement)
}

#[tauri::command]
pub(crate) fn detach_subagents(
    parent_terminal_id: String,
    subagent_ids: Vec<String>,
    router: State<'_, SpawnRouter>,
) -> Result<(), String> {
    router
        .registry
        .detach(&parent_terminal_id, &subagent_ids)
        .map_err(|error| error.to_string())
}

impl SpawnRouter {
    pub(crate) fn new(
        registry: SubagentRegistry,
        emit: impl Fn(&str, &SubagentSpawnEvent) -> Result<(), String> + Send + Sync + 'static,
    ) -> Self {
        Self {
            registry,
            emit: Arc::new(emit),
            close_emit: None,
            timeout: SPAWN_ACK_TIMEOUT,
        }
    }

    pub(crate) fn with_close_emitter(
        mut self,
        emit: impl Fn(&str, &SubagentCloseEvent) -> Result<(), String> + Send + Sync + 'static,
    ) -> Self {
        self.close_emit = Some(Arc::new(emit));
        self
    }

    #[cfg(test)]
    fn with_timeout(
        registry: SubagentRegistry,
        timeout: Duration,
        emit: impl Fn(&str, &SubagentSpawnEvent) -> Result<(), String> + Send + Sync + 'static,
    ) -> Self {
        Self {
            registry,
            emit: Arc::new(emit),
            close_emit: None,
            timeout,
        }
    }

    pub(crate) fn close(&self, id: &str) -> Result<(), (&'static str, String)> {
        let (window_label, event) = self
            .registry
            .close_target(id)
            .map_err(|error| (error.code, error.to_string()))?;
        let emit = self.close_emit.as_ref().ok_or_else(|| {
            (
                "window_unavailable",
                "subagent close routing is unavailable".to_string(),
            )
        })?;
        self.registry
            .stop(id)
            .map_err(|error| (error.code, error.to_string()))?;
        emit(&window_label, &event).map_err(|error| ("window_unavailable", error))
    }

    pub(crate) fn route(&self, request: ReserveSubagent) -> Result<String, (&'static str, String)> {
        let reservation = self
            .registry
            .reserve(request)
            .map_err(|error| (error.code, error.to_string()))?;
        let id = reservation.event.subagent_id.clone();

        if let Err(error) = (self.emit)(&reservation.window_label, &reservation.event) {
            self.registry.rollback_reservation(&id);
            return Err(("window_unavailable", error));
        }

        match reservation.acknowledgement.recv_timeout(self.timeout) {
            Ok(acknowledgement) if acknowledgement.success => {
                if self.registry.status(&id).is_err() {
                    self.registry.rollback_reservation(&id);
                    return Err((
                        "spawn_failed",
                        "frontend acknowledged spawn before the PTY was attached".into(),
                    ));
                }
                self.registry
                    .finish_reservation(&id)
                    .map_err(|error| (error.code, error.to_string()))?;
                Ok(id)
            }
            Ok(acknowledgement) => {
                self.registry.rollback_reservation(&id);
                Err((
                    "spawn_failed",
                    acknowledgement.error.unwrap_or_else(|| {
                        "frontend could not create the subagent terminal".into()
                    }),
                ))
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                self.registry.rollback_reservation(&id);
                Err((
                    "spawn_timeout",
                    format!(
                        "frontend did not acknowledge subagent spawn within {}ms",
                        self.timeout.as_millis()
                    ),
                ))
            }
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                self.registry.rollback_reservation(&id);
                Err((
                    "spawn_failed",
                    "frontend acknowledgement channel closed".into(),
                ))
            }
        }
    }

    pub(crate) fn register_top_level_terminals(
        &self,
        window_label: &str,
        terminals: Vec<TopLevelTerminalMetadata>,
    ) -> Result<(), String> {
        self.registry
            .register_top_level_terminals(window_label, terminals)
            .map_err(|error| error.to_string())
    }

    pub(crate) fn unregister_window(&self, window_label: &str) {
        self.registry.unregister_window(window_label);
    }

    pub(crate) fn acknowledge(
        &self,
        acknowledgement: SubagentSpawnAcknowledgement,
    ) -> Result<(), String> {
        self.registry
            .acknowledge(acknowledgement)
            .map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::subagents::{AttachSubagent, SubagentPtyOwner};
    use std::{
        sync::{
            Arc, Mutex,
            atomic::{AtomicBool, Ordering},
        },
        thread,
    };

    fn request(parent_terminal_id: &str, project_id: &str) -> ReserveSubagent {
        ReserveSubagent {
            parent_terminal_id: parent_terminal_id.into(),
            project_id: project_id.into(),
            name: "Research".into(),
            command: "pi --mode rpc".into(),
            cwd: "/tmp/project".into(),
            process_kind: "pi".into(),
        }
    }

    #[test]
    fn validates_parent_project_and_one_level_rule() {
        let registry = SubagentRegistry::default();
        registry
            .register_top_level_terminals(
                "main",
                vec![TopLevelTerminalMetadata {
                    terminal_id: "parent-1".into(),
                    project_id: "project-1".into(),
                }],
            )
            .unwrap();
        let router =
            SpawnRouter::with_timeout(registry.clone(), Duration::from_millis(10), |_, _| Ok(()));

        assert_eq!(
            router.route(request("missing", "project-1")).unwrap_err().0,
            "parent_not_found"
        );
        assert_eq!(
            router.route(request("parent-1", "other")).unwrap_err().0,
            "project_mismatch"
        );

        let reserved = registry.reserve(request("parent-1", "project-1")).unwrap();
        let child_terminal_id = "child-terminal";
        registry
            .attach(AttachSubagent {
                owner: SubagentPtyOwner {
                    id: reserved.event.subagent_id.clone(),
                    parent_terminal_id: "parent-1".into(),
                    project_id: "project-1".into(),
                    name: "Research".into(),
                    process_kind: "pi".into(),
                },
                terminal_id: child_terminal_id.into(),
                pty_id: "pty-1".into(),
                pid: None,
                command: "pi --mode rpc".into(),
                cwd: "/tmp/project".into(),
                input: Arc::new(|_| Ok(())),
                stop: Arc::new(|| Ok(())),
            })
            .unwrap();
        assert_eq!(
            router
                .route(request(child_terminal_id, "project-1"))
                .unwrap_err()
                .0,
            "invalid_parent"
        );
    }

    #[test]
    fn successful_ack_finishes_reservation() {
        let registry = SubagentRegistry::default();
        registry
            .register_top_level_terminals(
                "main",
                vec![TopLevelTerminalMetadata {
                    terminal_id: "parent-1".into(),
                    project_id: "project-1".into(),
                }],
            )
            .unwrap();
        let acknowledgement_registry = registry.clone();
        let attach_registry = registry.clone();
        let router =
            SpawnRouter::with_timeout(registry.clone(), Duration::from_secs(1), move |_, event| {
                let event = event.clone();
                let acknowledgement_registry = acknowledgement_registry.clone();
                let attach_registry = attach_registry.clone();
                thread::spawn(move || {
                    attach_registry
                        .attach(AttachSubagent {
                            owner: SubagentPtyOwner {
                                id: event.subagent_id.clone(),
                                parent_terminal_id: event.parent_terminal_id,
                                project_id: event.project_id,
                                name: event.name,
                                process_kind: event.process_kind,
                            },
                            terminal_id: "child-terminal".into(),
                            pty_id: "pty-1".into(),
                            pid: None,
                            command: event.command,
                            cwd: event.cwd,
                            input: Arc::new(|_| Ok(())),
                            stop: Arc::new(|| Ok(())),
                        })
                        .unwrap();
                    acknowledgement_registry
                        .acknowledge(SubagentSpawnAcknowledgement {
                            subagent_id: event.subagent_id,
                            success: true,
                            error: None,
                        })
                        .unwrap();
                });
                Ok(())
            });

        let id = router.route(request("parent-1", "project-1")).unwrap();
        assert_eq!(registry.status(&id).unwrap().terminal_id, "child-terminal");
        assert!(registry.finish_reservation(&id).is_err());
    }

    #[test]
    fn close_stops_the_child_and_routes_its_terminal_to_the_owning_window() {
        let registry = SubagentRegistry::default();
        registry
            .register_top_level_terminals(
                "main-window",
                vec![TopLevelTerminalMetadata {
                    terminal_id: "parent-1".into(),
                    project_id: "project-1".into(),
                }],
            )
            .unwrap();
        let reserved = registry.reserve(request("parent-1", "project-1")).unwrap();
        let id = reserved.event.subagent_id.clone();
        let stopped = Arc::new(AtomicBool::new(false));
        let stopped_by_runtime = stopped.clone();
        registry
            .attach(AttachSubagent {
                owner: SubagentPtyOwner {
                    id: id.clone(),
                    parent_terminal_id: "parent-1".into(),
                    project_id: "project-1".into(),
                    name: "Research".into(),
                    process_kind: "pi".into(),
                },
                terminal_id: "child-terminal".into(),
                pty_id: "pty-1".into(),
                pid: None,
                command: "pi --mode rpc".into(),
                cwd: "/tmp/project".into(),
                input: Arc::new(|_| Ok(())),
                stop: Arc::new(move || {
                    stopped_by_runtime.store(true, Ordering::Release);
                    Ok(())
                }),
            })
            .unwrap();
        let routed = Arc::new(Mutex::new(None));
        let routed_event = routed.clone();
        let router = SpawnRouter::new(registry, |_, _| Ok(())).with_close_emitter(
            move |window_label, event| {
                *routed_event.lock().unwrap() = Some((window_label.to_string(), event.clone()));
                Ok(())
            },
        );

        router.close(&id).unwrap();

        assert!(stopped.load(Ordering::Acquire));
        let (window_label, event) = routed.lock().unwrap().clone().unwrap();
        assert_eq!(window_label, "main-window");
        assert_eq!(event.subagent_id, id);
        assert_eq!(event.terminal_id, "child-terminal");
    }

    #[test]
    fn timeout_and_emit_failure_roll_back_reservations() {
        let registry = SubagentRegistry::default();
        registry
            .register_top_level_terminals(
                "main",
                vec![TopLevelTerminalMetadata {
                    terminal_id: "parent-1".into(),
                    project_id: "project-1".into(),
                }],
            )
            .unwrap();
        let timeout_router =
            SpawnRouter::with_timeout(registry.clone(), Duration::from_millis(5), |_, _| Ok(()));
        assert_eq!(
            timeout_router
                .route(request("parent-1", "project-1"))
                .unwrap_err()
                .0,
            "spawn_timeout"
        );
        assert_eq!(registry.reservation_count(), 0);

        let failed_router =
            SpawnRouter::with_timeout(registry.clone(), Duration::from_secs(1), |_, _| {
                Err("window closed".into())
            });
        assert_eq!(
            failed_router
                .route(request("parent-1", "project-1"))
                .unwrap_err()
                .0,
            "window_unavailable"
        );
        assert_eq!(registry.reservation_count(), 0);
    }
}
