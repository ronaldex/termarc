use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
        mpsc::{self, SyncSender},
    },
    time::Duration,
};
use tauri::{State, Window};

use crate::control::MAX_WAIT_MS;

pub(crate) const WORKSPACE_CONTROL_EVENT: &str = "termarc://workspace-control-request";
const ACK_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceTerminalSnapshot {
    pub(crate) id: String,
    pub(crate) project_id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceSnapshot {
    #[serde(default)]
    pub(crate) projects: Vec<String>,
    #[serde(default)]
    pub(crate) terminals: Vec<WorkspaceTerminalSnapshot>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceAction {
    pub(crate) resource: WorkspaceResource,
    pub(crate) action: WorkspaceOperation,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) project_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) parent_terminal_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) cwd: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) timeout_ms: Option<u64>,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum WorkspaceResource {
    Terminals,
    Subterminals,
    Agents,
    Commands,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum WorkspaceOperation {
    List,
    Status,
    Create,
    Run,
    Send,
    Wait,
    Stop,
    Close,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceControlEvent {
    pub(crate) request_id: String,
    pub(crate) protocol_version: u32,
    #[serde(flatten)]
    pub(crate) request: WorkspaceAction,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceAcknowledgement {
    pub(crate) request_id: String,
    #[serde(default)]
    pub(crate) result: Option<Value>,
    #[serde(default)]
    pub(crate) error: Option<WorkspaceError>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceError {
    pub(crate) code: String,
    pub(crate) message: String,
}

type RouteError = (&'static str, String);
type EventEmitter = dyn Fn(&str, &WorkspaceControlEvent) -> Result<(), String> + Send + Sync;
type AckResult = Result<Value, WorkspaceError>;

struct PendingRequest {
    window_label: String,
    sender: SyncSender<AckResult>,
}

#[derive(Default)]
struct RouterState {
    windows: HashMap<String, WorkspaceSnapshot>,
    pending: HashMap<String, PendingRequest>,
}

#[derive(Clone)]
pub(crate) struct WorkspaceRouter {
    state: Arc<Mutex<RouterState>>,
    next_request: Arc<AtomicU64>,
    emit: Arc<EventEmitter>,
    timeout: Duration,
}

#[tauri::command]
pub(crate) fn register_workspace(
    snapshot: WorkspaceSnapshot,
    window: Window,
    router: State<'_, WorkspaceRouter>,
) -> Result<(), String> {
    router.register(window.label(), snapshot)
}

#[tauri::command]
pub(crate) fn acknowledge_workspace_control(
    acknowledgement: WorkspaceAcknowledgement,
    window: Window,
    router: State<'_, WorkspaceRouter>,
) -> Result<(), String> {
    router.acknowledge(window.label(), acknowledgement)
}

impl WorkspaceRouter {
    pub(crate) fn new(
        emit: impl Fn(&str, &WorkspaceControlEvent) -> Result<(), String> + Send + Sync + 'static,
    ) -> Self {
        Self {
            state: Arc::new(Mutex::new(RouterState::default())),
            next_request: Arc::new(AtomicU64::new(0)),
            emit: Arc::new(emit),
            timeout: ACK_TIMEOUT,
        }
    }

    #[cfg(test)]
    fn with_timeout(
        timeout: Duration,
        emit: impl Fn(&str, &WorkspaceControlEvent) -> Result<(), String> + Send + Sync + 'static,
    ) -> Self {
        let mut router = Self::new(emit);
        router.timeout = timeout;
        router
    }

    pub(crate) fn register(
        &self,
        window_label: &str,
        snapshot: WorkspaceSnapshot,
    ) -> Result<(), String> {
        let mut state = self
            .state
            .lock()
            .map_err(|_| "workspace router is unavailable")?;
        state.windows.insert(window_label.to_string(), snapshot);
        Ok(())
    }

    pub(crate) fn unregister_window(&self, window_label: &str) {
        if let Ok(mut state) = self.state.lock() {
            state.windows.remove(window_label);
            let request_ids: Vec<_> = state
                .pending
                .iter()
                .filter(|(_, pending)| pending.window_label == window_label)
                .map(|(id, _)| id.clone())
                .collect();
            for id in request_ids {
                if let Some(pending) = state.pending.remove(&id) {
                    let _ = pending.sender.send(Err(WorkspaceError {
                        code: "window_unavailable".into(),
                        message: format!("Termarc window is unavailable: {window_label}"),
                    }));
                }
            }
        }
    }

    pub(crate) fn route(
        &self,
        protocol_version: u32,
        request: WorkspaceAction,
    ) -> Result<Value, RouteError> {
        if request
            .timeout_ms
            .is_some_and(|timeout| timeout > MAX_WAIT_MS)
        {
            return Err((
                "invalid_request",
                format!("workspace timeout must not exceed {MAX_WAIT_MS}ms"),
            ));
        }
        let window_label = self.target(&request)?;
        let sequence = self.next_request.fetch_add(1, Ordering::Relaxed) + 1;
        let request_id = format!("workspace-{sequence}");
        let event = WorkspaceControlEvent {
            request_id: request_id.clone(),
            protocol_version,
            request,
        };
        let (sender, receiver) = mpsc::sync_channel(1);
        self.state
            .lock()
            .map_err(|_| {
                (
                    "router_unavailable",
                    "workspace router is unavailable".into(),
                )
            })?
            .pending
            .insert(
                request_id.clone(),
                PendingRequest {
                    window_label: window_label.clone(),
                    sender,
                },
            );
        if let Err(error) = (self.emit)(&window_label, &event) {
            self.remove_pending(&request_id);
            return Err(("window_unavailable", error));
        }
        let timeout = event
            .request
            .timeout_ms
            .map(|milliseconds| Duration::from_millis(milliseconds).saturating_add(self.timeout))
            .unwrap_or(self.timeout);
        let result = receiver.recv_timeout(timeout);
        self.remove_pending(&request_id);
        match result {
            Ok(Ok(value)) => Ok(value),
            Ok(Err(error)) => Err((
                "frontend_error",
                format!("{}: {}", error.code, error.message),
            )),
            Err(mpsc::RecvTimeoutError::Timeout) => Err((
                "workspace_timeout",
                format!(
                    "frontend did not acknowledge workspace request within {}ms",
                    timeout.as_millis()
                ),
            )),
            Err(mpsc::RecvTimeoutError::Disconnected) => Err((
                "workspace_failed",
                "frontend acknowledgement channel closed".into(),
            )),
        }
    }

    fn target(&self, request: &WorkspaceAction) -> Result<String, RouteError> {
        let state = self.state.lock().map_err(|_| {
            (
                "router_unavailable",
                "workspace router is unavailable".into(),
            )
        })?;
        if let Some(terminal_id) = request.parent_terminal_id.as_deref().or_else(|| {
            (matches!(
                request.resource,
                WorkspaceResource::Terminals | WorkspaceResource::Subterminals
            ) && matches!(
                request.action,
                WorkspaceOperation::Status
                    | WorkspaceOperation::Run
                    | WorkspaceOperation::Send
                    | WorkspaceOperation::Wait
                    | WorkspaceOperation::Stop
                    | WorkspaceOperation::Close
            ))
            .then_some(request.id.as_deref())
            .flatten()
        }) {
            let owners: Vec<_> = state
                .windows
                .iter()
                .filter(|(_, snapshot)| {
                    snapshot
                        .terminals
                        .iter()
                        .any(|terminal| terminal.id == terminal_id)
                })
                .map(|(label, _)| label.clone())
                .collect();
            return unique(owners, "terminal", terminal_id);
        }
        if let Some(project_id) = request.project_id.as_deref() {
            let owners: Vec<_> = state
                .windows
                .iter()
                .filter(|(_, snapshot)| {
                    snapshot
                        .projects
                        .iter()
                        .any(|project| project == project_id)
                })
                .map(|(label, _)| label.clone())
                .collect();
            return unique(owners, "project", project_id);
        }
        unique(state.windows.keys().cloned().collect(), "ready window", "")
    }

    fn remove_pending(&self, request_id: &str) {
        if let Ok(mut state) = self.state.lock() {
            state.pending.remove(request_id);
        }
    }

    pub(crate) fn acknowledge(
        &self,
        source_window: &str,
        acknowledgement: WorkspaceAcknowledgement,
    ) -> Result<(), String> {
        let pending = self
            .state
            .lock()
            .map_err(|_| "workspace router is unavailable")?
            .pending
            .get(&acknowledgement.request_id)
            .map(|pending| (pending.window_label.clone(), pending.sender.clone()))
            .ok_or_else(|| format!("unknown workspace request: {}", acknowledgement.request_id))?;
        if pending.0 != source_window {
            return Err(format!(
                "workspace acknowledgement came from {source_window}; expected {}",
                pending.0
            ));
        }
        let result = match acknowledgement.error {
            Some(error) => Err(error),
            None => Ok(acknowledgement
                .result
                .unwrap_or(Value::Object(Default::default()))),
        };
        pending
            .1
            .send(result)
            .map_err(|_| "workspace request is no longer waiting".into())
    }
}

fn unique(mut labels: Vec<String>, kind: &str, id: &str) -> Result<String, RouteError> {
    labels.sort();
    labels.dedup();
    match labels.as_slice() {
        [label] => Ok(label.clone()),
        [] => Err((
            "window_unavailable",
            if id.is_empty() {
                "no ready Termarc window is available".into()
            } else {
                format!("no ready Termarc window contains {kind} {id}")
            },
        )),
        _ => Err((
            "ambiguous_window",
            if id.is_empty() {
                "multiple ready Termarc windows are available; specify --project or --parent".into()
            } else {
                format!("multiple Termarc windows contain {kind} {id}")
            },
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{sync::mpsc, thread};

    fn snapshot(project: &str, terminal: &str) -> WorkspaceSnapshot {
        WorkspaceSnapshot {
            projects: vec![project.into()],
            terminals: vec![WorkspaceTerminalSnapshot {
                id: terminal.into(),
                project_id: project.into(),
            }],
        }
    }
    fn action(resource: WorkspaceResource) -> WorkspaceAction {
        WorkspaceAction {
            resource,
            action: WorkspaceOperation::List,
            id: None,
            project_id: None,
            parent_terminal_id: None,
            cwd: None,
            name: None,
            text: None,
            timeout_ms: None,
        }
    }

    #[test]
    fn routes_terminal_and_project_ownership_and_rejects_ambiguity() {
        let router = WorkspaceRouter::new(|_, _| Ok(()));
        router.register("one", snapshot("p1", "t1")).unwrap();
        router.register("two", snapshot("p2", "t2")).unwrap();
        let mut request = action(WorkspaceResource::Terminals);
        request.action = WorkspaceOperation::Status;
        request.id = Some("t2".into());
        assert_eq!(router.target(&request).unwrap(), "two");
        request.id = None;
        request.project_id = Some("p1".into());
        assert_eq!(router.target(&request).unwrap(), "one");
        request.project_id = None;
        assert_eq!(router.target(&request).unwrap_err().0, "ambiguous_window");
    }

    #[test]
    fn acknowledgement_must_come_from_routed_window() {
        let (events, received) = mpsc::channel();
        let router =
            WorkspaceRouter::with_timeout(Duration::from_millis(100), move |window, event| {
                events
                    .send((window.to_string(), event.clone()))
                    .map_err(|e| e.to_string())
            });
        router.register("one", snapshot("p1", "t1")).unwrap();
        let worker = {
            let router = router.clone();
            thread::spawn(move || {
                let mut request = action(WorkspaceResource::Agents);
                request.project_id = Some("p1".into());
                router.route(1, request)
            })
        };
        let (_, event) = received.recv().unwrap();
        let acknowledgement = WorkspaceAcknowledgement {
            request_id: event.request_id.clone(),
            result: Some(serde_json::json!({"ok": true})),
            error: None,
        };
        assert!(router.acknowledge("two", acknowledgement.clone()).is_err());
        router.acknowledge("one", acknowledgement).unwrap();
        assert_eq!(worker.join().unwrap().unwrap()["ok"], true);
    }
}
