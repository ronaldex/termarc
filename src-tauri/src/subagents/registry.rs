use std::{
    collections::HashMap,
    fmt,
    sync::{
        Arc, Condvar, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{Receiver, SyncSender, sync_channel},
    },
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

#[cfg(test)]
use std::sync::atomic::AtomicUsize;

use super::{
    model::*,
    output::SubagentOutput,
    runtime::{InputHandler, StopHandler, SubagentRuntime},
};

const DEFAULT_COMPLETED_RECORD_LIMIT: usize = 64;
const DEFAULT_COMPLETED_RECORD_TTL: Duration = Duration::from_secs(24 * 60 * 60);
const MAX_COMPLETED_RECORD_LIMIT: usize = 10_000;
const MAX_COMPLETED_RECORD_TTL: Duration = Duration::from_secs(30 * 24 * 60 * 60);
const COMPLETED_LIMIT_ENV: &str = "TERMARC_SUBAGENT_COMPLETED_LIMIT";
const COMPLETED_TTL_ENV: &str = "TERMARC_SUBAGENT_COMPLETED_TTL_SECONDS";

#[derive(Debug)]
pub(crate) struct RegistryError {
    pub(crate) code: &'static str,
    message: String,
}

impl RegistryError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl fmt::Display for RegistryError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

#[derive(Clone, Default)]
pub(crate) struct SubagentRegistry {
    inner: Arc<RegistryInner>,
}

#[derive(Clone, Debug)]
struct RegistryConfig {
    completed_record_limit: usize,
    completed_record_ttl: Duration,
}

impl RegistryConfig {
    fn from_environment() -> Self {
        let completed_record_limit = environment_usize(COMPLETED_LIMIT_ENV)
            .filter(|value| *value <= MAX_COMPLETED_RECORD_LIMIT)
            .unwrap_or(DEFAULT_COMPLETED_RECORD_LIMIT);
        let completed_record_ttl = environment_u64(COMPLETED_TTL_ENV)
            .map(Duration::from_secs)
            .filter(|value| *value <= MAX_COMPLETED_RECORD_TTL)
            .unwrap_or(DEFAULT_COMPLETED_RECORD_TTL);
        Self {
            completed_record_limit,
            completed_record_ttl,
        }
    }

    fn policy(&self) -> RetentionPolicy {
        RetentionPolicy {
            completed_record_limit: self.completed_record_limit,
            completed_record_ttl_seconds: self.completed_record_ttl.as_secs(),
            output_bytes_per_format: OUTPUT_BUFFER_CAPACITY,
        }
    }
}

fn environment_usize(name: &str) -> Option<usize> {
    std::env::var(name).ok()?.parse().ok()
}

fn environment_u64(name: &str) -> Option<u64> {
    std::env::var(name).ok()?.parse().ok()
}

struct RegistryInner {
    state: Mutex<RegistryState>,
    changed: Condvar,
    next_subagent_id: AtomicU64,
    config: RegistryConfig,
    #[cfg(test)]
    active_control_waits: AtomicUsize,
}

impl Default for RegistryInner {
    fn default() -> Self {
        Self {
            state: Mutex::new(RegistryState::default()),
            changed: Condvar::new(),
            next_subagent_id: AtomicU64::new(0),
            config: RegistryConfig::from_environment(),
            #[cfg(test)]
            active_control_waits: AtomicUsize::new(0),
        }
    }
}

#[derive(Default)]
struct RegistryState {
    records: HashMap<String, SubagentRecord>,
    top_level_terminals: HashMap<String, RegisteredTerminal>,
    reservations: HashMap<String, Reservation>,
}

struct RegisteredTerminal {
    metadata: TopLevelTerminalMetadata,
    window_label: String,
}

struct Reservation {
    event: SubagentSpawnEvent,
    window_label: String,
    created_at: u64,
    acknowledgement: SyncSender<SpawnAcknowledgement>,
    detached: bool,
}

struct SubagentRecord {
    status: SubagentStatus,
    window_label: String,
    output: SubagentOutput,
    runtime: SubagentRuntime,
    latest_result: Option<SubagentResult>,
    latest_result_sequence: Option<u64>,
    revision: u64,
}

pub(crate) struct ReservedSubagent {
    pub(crate) event: SubagentSpawnEvent,
    pub(crate) window_label: String,
    pub(crate) acknowledgement: Receiver<SpawnAcknowledgement>,
}

#[cfg(test)]
struct ActiveControlWait<'a>(&'a AtomicUsize);

#[cfg(test)]
impl ActiveControlWait<'_> {
    fn new(count: &AtomicUsize) -> ActiveControlWait<'_> {
        count.fetch_add(1, Ordering::AcqRel);
        ActiveControlWait(count)
    }
}

#[cfg(test)]
impl Drop for ActiveControlWait<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::AcqRel);
    }
}

pub(crate) struct AttachSubagent {
    pub(crate) owner: SubagentPtyOwner,
    pub(crate) terminal_id: String,
    pub(crate) pty_id: String,
    pub(crate) pid: Option<u32>,
    pub(crate) command: String,
    pub(crate) cwd: String,
    pub(crate) input: InputHandler,
    pub(crate) stop: StopHandler,
}

impl SubagentRegistry {
    pub(crate) fn register_top_level_terminals(
        &self,
        window_label: &str,
        terminals: Vec<TopLevelTerminalMetadata>,
    ) -> Result<(), RegistryError> {
        validate_identifier("window label", window_label)?;
        for terminal in &terminals {
            validate_identifier("terminal id", &terminal.terminal_id)?;
            validate_identifier("project id", &terminal.project_id)?;
        }
        let mut state = self.lock()?;
        // Validate the complete replacement before mutating the previous
        // registration. A failed refresh must not make a healthy window stale.
        for metadata in &terminals {
            if state
                .records
                .values()
                .any(|record| record.status.terminal_id == metadata.terminal_id)
            {
                return Err(RegistryError::new(
                    "invalid_parent",
                    format!(
                        "subagent terminal cannot be registered as top-level: {}",
                        metadata.terminal_id
                    ),
                ));
            }
            if let Some(existing) = state.top_level_terminals.get(&metadata.terminal_id)
                && existing.window_label != window_label
            {
                return Err(RegistryError::new(
                    "terminal_conflict",
                    format!(
                        "terminal {} is already registered by another window",
                        metadata.terminal_id
                    ),
                ));
            }
        }
        state
            .top_level_terminals
            .retain(|_, terminal| terminal.window_label != window_label);
        for metadata in terminals {
            state.top_level_terminals.insert(
                metadata.terminal_id.clone(),
                RegisteredTerminal {
                    metadata,
                    window_label: window_label.into(),
                },
            );
        }
        Ok(())
    }

    pub(crate) fn unregister_window(&self, window_label: &str) {
        if let Ok(mut state) = self.inner.state.lock() {
            state
                .top_level_terminals
                .retain(|_, terminal| terminal.window_label != window_label);
        }
    }

    pub(crate) fn reserve(
        &self,
        request: ReserveSubagent,
    ) -> Result<ReservedSubagent, RegistryError> {
        validate_identifier("parent terminal id", &request.parent_terminal_id)?;
        if !request.project_id.is_empty() {
            validate_identifier("project id", &request.project_id)?;
        }
        validate_identifier("subagent name", &request.name)?;
        validate_identifier("command", &request.command)?;
        validate_identifier("cwd", &request.cwd)?;
        validate_identifier("process kind", request.process_kind.as_str())?;

        let cwd = crate::paths::expand_user_path(&request.cwd)
            .to_string_lossy()
            .into_owned();
        let mut state = self.lock()?;
        let parent = state
            .top_level_terminals
            .get(&request.parent_terminal_id)
            .ok_or_else(|| {
                let is_subagent = state
                    .records
                    .values()
                    .any(|record| record.status.terminal_id == request.parent_terminal_id);
                RegistryError::new(
                    if is_subagent {
                        "invalid_parent"
                    } else {
                        "parent_not_found"
                    },
                    if is_subagent {
                        "subagents cannot be parents".into()
                    } else {
                        format!(
                            "unknown top-level parent terminal: {}",
                            request.parent_terminal_id
                        )
                    },
                )
            })?;
        let project_id = if request.project_id.is_empty() {
            parent.metadata.project_id.clone()
        } else {
            if parent.metadata.project_id != request.project_id {
                return Err(RegistryError::new(
                    "project_mismatch",
                    format!(
                        "parent terminal belongs to project {}, not {}",
                        parent.metadata.project_id, request.project_id
                    ),
                ));
            }
            request.project_id
        };
        let window_label = parent.window_label.clone();
        let sequence = self.inner.next_subagent_id.fetch_add(1, Ordering::Relaxed) + 1;
        let subagent_id = format!("subagent-{sequence}");
        let event = SubagentSpawnEvent {
            subagent_id: subagent_id.clone(),
            parent_terminal_id: request.parent_terminal_id,
            project_id,
            name: request.name,
            command: request.command,
            cwd,
            process_kind: request.process_kind,
        };
        let (acknowledgement, receiver) = sync_channel(1);
        state.reservations.insert(
            subagent_id,
            Reservation {
                event: event.clone(),
                window_label: window_label.clone(),
                created_at: timestamp_millis(),
                acknowledgement,
                detached: false,
            },
        );
        Ok(ReservedSubagent {
            event,
            window_label,
            acknowledgement: receiver,
        })
    }

    pub(crate) fn acknowledge(
        &self,
        acknowledgement: SubagentSpawnAcknowledgement,
    ) -> Result<(), RegistryError> {
        let sender = {
            let state = self.lock()?;
            state
                .reservations
                .get(&acknowledgement.subagent_id)
                .map(|reservation| reservation.acknowledgement.clone())
                .ok_or_else(|| unknown_subagent(&acknowledgement.subagent_id))?
        };
        sender
            .try_send(SpawnAcknowledgement {
                success: acknowledgement.success,
                error: acknowledgement.error,
            })
            .map_err(|_| {
                RegistryError::new("invalid_acknowledgement", "spawn was already acknowledged")
            })
    }

    pub(crate) fn finish_reservation(&self, id: &str) -> Result<(), RegistryError> {
        let mut state = self.lock()?;
        if state.reservations.remove(id).is_none() {
            return Err(unknown_subagent(id));
        }
        Ok(())
    }

    pub(crate) fn rollback_reservation(&self, id: &str) {
        let stop = if let Ok(mut state) = self.inner.state.lock() {
            state.reservations.remove(id);
            let stop = state
                .records
                .remove(id)
                .and_then(|mut record| record.runtime.stop.take());
            self.inner.changed.notify_all();
            stop
        } else {
            None
        };
        if let Some(stop) = stop {
            let _ = stop();
        }
    }

    #[cfg(test)]
    pub(crate) fn runtime_released(&self, id: &str) -> bool {
        self.inner
            .state
            .lock()
            .ok()
            .and_then(|state| {
                state
                    .records
                    .get(id)
                    .map(|record| record.runtime.input.is_none() && record.runtime.stop.is_none())
            })
            .unwrap_or(false)
    }

    #[cfg(test)]
    pub(crate) fn reservation_count(&self) -> usize {
        self.inner
            .state
            .lock()
            .map(|state| state.reservations.len())
            .unwrap_or_default()
    }

    pub(crate) fn attach(&self, attachment: AttachSubagent) -> Result<(), RegistryError> {
        validate_identifier("subagent id", &attachment.owner.id)?;
        validate_identifier("parent terminal id", &attachment.owner.parent_terminal_id)?;
        validate_identifier("terminal id", &attachment.terminal_id)?;

        let mut state = self.lock()?;
        if state.records.contains_key(&attachment.owner.id) {
            return Err(RegistryError::new(
                "already_exists",
                format!("subagent already exists: {}", attachment.owner.id),
            ));
        }
        let reservation = state
            .reservations
            .get(&attachment.owner.id)
            .ok_or_else(|| RegistryError::new("not_reserved", "subagent ID is not reserved"))?;
        if reservation.event.parent_terminal_id != attachment.owner.parent_terminal_id
            || reservation.event.project_id != attachment.owner.project_id
            || reservation.event.name != attachment.owner.name
            || reservation.event.process_kind != attachment.owner.process_kind
            || reservation.event.command != attachment.command
            || reservation.event.cwd != attachment.cwd
        {
            return Err(RegistryError::new(
                "reservation_mismatch",
                "PTY ownership does not match the spawn reservation",
            ));
        }
        if !reservation.detached
            && !state
                .top_level_terminals
                .contains_key(&attachment.owner.parent_terminal_id)
        {
            return Err(RegistryError::new(
                "parent_not_found",
                "parent terminal was closed before the subagent PTY attached",
            ));
        }
        if state
            .records
            .values()
            .any(|record| record.status.terminal_id == attachment.terminal_id)
        {
            return Err(RegistryError::new(
                "already_exists",
                format!(
                    "terminal already owns a subagent: {}",
                    attachment.terminal_id
                ),
            ));
        }
        let created_at = reservation.created_at;
        let window_label = reservation.window_label.clone();
        let parent_terminal_id =
            (!reservation.detached).then(|| attachment.owner.parent_terminal_id.clone());
        let status = SubagentStatus {
            id: attachment.owner.id.clone(),
            parent_terminal_id,
            terminal_id: attachment.terminal_id,
            pty_id: attachment.pty_id,
            project_id: attachment.owner.project_id,
            name: attachment.owner.name,
            process_kind: attachment.owner.process_kind,
            command: attachment.command,
            cwd: attachment.cwd,
            lifecycle: SubagentLifecycle::Running,
            pi_state: None,
            pid: attachment.pid,
            exit_code: None,
            error: None,
            created_at,
            started_at: timestamp_millis(),
            ended_at: None,
            raw_output_cursor: 0,
            plain_output_cursor: 0,
            result_available: false,
            result_updated_at: None,
            progress: None,
        };
        state.records.insert(
            attachment.owner.id,
            SubagentRecord {
                status,
                window_label,
                output: SubagentOutput::new(OUTPUT_BUFFER_CAPACITY),
                runtime: SubagentRuntime::new(attachment.input, attachment.stop),
                latest_result: None,
                latest_result_sequence: None,
                revision: 0,
            },
        );
        self.inner.changed.notify_all();
        Ok(())
    }

    pub(crate) fn list_page(
        &self,
        parent_terminal_id: Option<&str>,
        cursor: Option<&str>,
        limit: usize,
    ) -> Result<SubagentListPage, RegistryError> {
        let after = cursor.map(parse_list_cursor).transpose()?;
        let state = self.lock()?;
        let mut statuses = state
            .records
            .values()
            .filter(|record| {
                parent_terminal_id.is_none_or(|parent| {
                    record.status.parent_terminal_id.as_deref() == Some(parent)
                })
            })
            .filter(|record| {
                after
                    .as_ref()
                    .is_none_or(|after| status_sequence(&record.status) > *after)
            })
            .map(|record| record.status.clone())
            .collect::<Vec<_>>();
        statuses.sort_by_key(status_sequence);

        let mut items = Vec::new();
        let mut item_bytes = 0_usize;
        for status in statuses {
            if items.len() == limit {
                break;
            }
            let bytes = serde_json::to_vec(&status)
                .map_err(|error| {
                    RegistryError::new(
                        "serialization_failed",
                        format!("could not serialize subagent status: {error}"),
                    )
                })?
                .len();
            if bytes > MAX_LIST_ITEMS_BYTES {
                return Err(RegistryError::new(
                    "record_too_large",
                    format!(
                        "subagent status {} cannot fit in a control frame",
                        status.id
                    ),
                ));
            }
            let separator = usize::from(!items.is_empty());
            if item_bytes.saturating_add(separator).saturating_add(bytes) > MAX_LIST_ITEMS_BYTES {
                break;
            }
            item_bytes += separator + bytes;
            items.push(status);
        }

        let next_cursor = items.last().and_then(|last| {
            state
                .records
                .values()
                .any(|record| {
                    parent_terminal_id.is_none_or(|parent| {
                        record.status.parent_terminal_id.as_deref() == Some(parent)
                    }) && status_sequence(&record.status) > status_sequence(last)
                })
                .then(|| list_cursor(last))
        });
        Ok(SubagentListPage { items, next_cursor })
    }

    #[cfg(test)]
    pub(crate) fn list(
        &self,
        parent_terminal_id: Option<&str>,
    ) -> Result<Vec<SubagentStatus>, RegistryError> {
        let mut items = Vec::new();
        let mut cursor = None;
        loop {
            let page = self.list_page(parent_terminal_id, cursor.as_deref(), MAX_LIST_LIMIT)?;
            items.extend(page.items);
            let Some(next) = page.next_cursor else { break };
            cursor = Some(next);
        }
        Ok(items)
    }

    pub(crate) fn detach(
        &self,
        parent_terminal_id: &str,
        subagent_ids: &[String],
    ) -> Result<(), RegistryError> {
        validate_identifier("parent terminal id", parent_terminal_id)?;
        let mut state = self.lock()?;

        for id in subagent_ids {
            validate_identifier("subagent id", id)?;
            let associated = state.records.get(id).is_some_and(|record| {
                record.status.parent_terminal_id.as_deref() == Some(parent_terminal_id)
            }) || state.reservations.get(id).is_some_and(|reservation| {
                reservation.event.parent_terminal_id == parent_terminal_id
            });
            if !associated {
                return Err(RegistryError::new(
                    "parent_mismatch",
                    format!("subagent {id} is not attached to parent {parent_terminal_id}"),
                ));
            }
        }

        for id in subagent_ids {
            if let Some(record) = state.records.get_mut(id) {
                record.status.parent_terminal_id = None;
                record.revision = record.revision.saturating_add(1);
            }
            if let Some(reservation) = state.reservations.get_mut(id) {
                reservation.detached = true;
            }
        }
        self.inner.changed.notify_all();
        Ok(())
    }

    pub(crate) fn status(&self, id: &str) -> Result<SubagentStatus, RegistryError> {
        let state = self.lock()?;
        state
            .records
            .get(id)
            .map(|record| record.status.clone())
            .ok_or_else(|| unknown_subagent(id))
    }

    pub(crate) fn output(
        &self,
        id: &str,
        format: OutputFormat,
        after: u64,
        limit: usize,
    ) -> Result<OutputChunk, RegistryError> {
        let state = self.lock()?;
        let record = state.records.get(id).ok_or_else(|| unknown_subagent(id))?;
        let output = match format {
            OutputFormat::Raw => &record.output.raw,
            OutputFormat::Plain => &record.output.plain,
        };
        if after > output.end_cursor() {
            return Err(RegistryError::new(
                "invalid_cursor",
                format!(
                    "output cursor {after} is beyond the current cursor {}",
                    output.end_cursor()
                ),
            ));
        }
        let (effective_after, data, cursor, truncated) =
            output.read(after, limit.clamp(1, MAX_OUTPUT_READ));
        Ok(OutputChunk {
            format,
            after: effective_after,
            cursor,
            truncated,
            data,
        })
    }

    pub(crate) fn append_output(&self, id: &str, bytes: &[u8]) {
        let Ok(mut state) = self.inner.state.lock() else {
            return;
        };
        let Some(record) = state.records.get_mut(id) else {
            return;
        };
        record.output.append(bytes);
        record.status.raw_output_cursor = record.output.raw.end_cursor();
        record.status.plain_output_cursor = record.output.plain.end_cursor();
    }

    pub(crate) fn update_pi_state(
        &self,
        update: SubagentPiStateUpdate,
    ) -> Result<(), RegistryError> {
        validate_identifier("subagent id", &update.subagent_id)?;
        validate_identifier("terminal id", &update.terminal_id)?;
        let mut state = self.lock()?;
        let record = state
            .records
            .get_mut(&update.subagent_id)
            .ok_or_else(|| unknown_subagent(&update.subagent_id))?;
        if record.status.terminal_id != update.terminal_id {
            return Err(RegistryError::new(
                "terminal_mismatch",
                format!(
                    "terminal {} is not associated with subagent {}",
                    update.terminal_id, update.subagent_id
                ),
            ));
        }
        if record.status.pi_state == Some(update.pi_state) {
            return Ok(());
        }
        record.status.pi_state = Some(update.pi_state);
        record.revision = record.revision.saturating_add(1);
        self.inner.changed.notify_all();
        Ok(())
    }

    pub(crate) fn update_progress(
        &self,
        update: SubagentProgressUpdate,
    ) -> Result<(), RegistryError> {
        validate_identifier("subagent id", &update.subagent_id)?;
        validate_identifier("terminal id", &update.terminal_id)?;
        let encoded = serde_json::to_vec(&update.progress).map_err(|error| {
            RegistryError::new(
                "invalid_progress",
                format!("could not serialize progress: {error}"),
            )
        })?;
        if encoded.len() > MAX_PROGRESS_BYTES {
            return Err(RegistryError::new(
                "progress_too_large",
                format!("subagent progress exceeds {MAX_PROGRESS_BYTES} bytes"),
            ));
        }
        let mut state = self.lock()?;
        let record = state
            .records
            .get_mut(&update.subagent_id)
            .ok_or_else(|| unknown_subagent(&update.subagent_id))?;
        validate_result_owner(record, &update.terminal_id)?;
        record.status.progress = Some(update.progress);
        record.revision = record.revision.saturating_add(1);
        self.inner.changed.notify_all();
        Ok(())
    }

    pub(crate) fn result(&self, id: &str) -> Result<SubagentResult, RegistryError> {
        let state = self.lock()?;
        let record = state.records.get(id).ok_or_else(|| unknown_subagent(id))?;
        record.latest_result.clone().ok_or_else(|| {
            RegistryError::new(
                "result_unavailable",
                format!("subagent has not produced a structured result: {id}"),
            )
        })
    }

    pub(crate) fn update_result(
        &self,
        update: SubagentResultUpdate,
    ) -> Result<SubagentResult, RegistryError> {
        validate_identifier("subagent id", &update.subagent_id)?;
        validate_identifier("terminal id", &update.terminal_id)?;
        validate_result_text(&update.text)?;
        let mut state = self.lock()?;
        let record = state
            .records
            .get_mut(&update.subagent_id)
            .ok_or_else(|| unknown_subagent(&update.subagent_id))?;
        validate_result_owner(record, &update.terminal_id)?;
        accept_result_sequence(record, update.sequence)?;
        let result = SubagentResult {
            id: update.subagent_id,
            text: update.text,
            updated_at: timestamp_millis(),
        };
        record.status.result_available = true;
        record.status.result_updated_at = Some(result.updated_at);
        record.latest_result = Some(result.clone());
        record.revision = record.revision.saturating_add(1);
        self.inner.changed.notify_all();
        Ok(result)
    }

    pub(crate) fn clear_result(&self, clear: SubagentResultClear) -> Result<(), RegistryError> {
        validate_identifier("subagent id", &clear.subagent_id)?;
        validate_identifier("terminal id", &clear.terminal_id)?;
        let mut state = self.lock()?;
        let record = state
            .records
            .get_mut(&clear.subagent_id)
            .ok_or_else(|| unknown_subagent(&clear.subagent_id))?;
        validate_result_owner(record, &clear.terminal_id)?;
        accept_result_sequence(record, Some(clear.sequence))?;
        record.status.result_available = false;
        record.status.result_updated_at = None;
        record.latest_result = None;
        record.revision = record.revision.saturating_add(1);
        self.inner.changed.notify_all();
        Ok(())
    }

    pub(crate) fn send_input(&self, id: &str, data: Vec<u8>) -> Result<(), RegistryError> {
        let input = {
            let state = self.lock()?;
            let record = state.records.get(id).ok_or_else(|| unknown_subagent(id))?;
            ensure_running(record)?;
            record
                .runtime
                .input
                .as_ref()
                .map(Arc::clone)
                .ok_or_else(|| {
                    RegistryError::new("not_running", format!("subagent is not running: {id}"))
                })?
        };
        input(data).map_err(|message| RegistryError::new("input_failed", message))
    }

    pub(crate) fn close_target(
        &self,
        id: &str,
    ) -> Result<(String, SubagentCloseEvent), RegistryError> {
        let state = self.lock()?;
        let record = state.records.get(id).ok_or_else(|| unknown_subagent(id))?;
        Ok((
            record.window_label.clone(),
            SubagentCloseEvent {
                subagent_id: record.status.id.clone(),
                terminal_id: record.status.terminal_id.clone(),
            },
        ))
    }

    pub(crate) fn stop(&self, id: &str) -> Result<(), RegistryError> {
        let stop = {
            let mut state = self.lock()?;
            let record = state
                .records
                .get_mut(id)
                .ok_or_else(|| unknown_subagent(id))?;
            if record.status.lifecycle != SubagentLifecycle::Running
                || record.runtime.stop_requested
            {
                return Ok(());
            }
            record.runtime.stop_requested = true;
            record
                .runtime
                .stop
                .as_ref()
                .map(Arc::clone)
                .ok_or_else(|| {
                    RegistryError::new("not_running", format!("subagent is not running: {id}"))
                })?
        };
        if let Err(message) = stop() {
            if let Ok(mut state) = self.inner.state.lock()
                && let Some(record) = state.records.get_mut(id)
                && record.status.lifecycle == SubagentLifecycle::Running
            {
                record.runtime.stop_requested = false;
            }
            return Err(RegistryError::new("stop_failed", message));
        }
        if let Ok(mut state) = self.inner.state.lock()
            && let Some(record) = state.records.get_mut(id)
            && record.runtime.stop_requested
        {
            record.runtime.input.take();
            record.runtime.stop.take();
        }
        Ok(())
    }

    #[cfg(test)]
    pub(crate) fn wait(&self, id: &str, timeout: Duration) -> Result<WaitResult, RegistryError> {
        self.wait_with_result(id, timeout, false)
    }

    #[cfg(test)]
    pub(crate) fn wait_with_result(
        &self,
        id: &str,
        timeout: Duration,
        return_if_result_available: bool,
    ) -> Result<WaitResult, RegistryError> {
        let state = self.lock()?;
        let record = state.records.get(id).ok_or_else(|| unknown_subagent(id))?;
        if record.status.lifecycle != SubagentLifecycle::Running
            || (return_if_result_available && record.status.result_available)
        {
            return Ok(WaitResult {
                timed_out: false,
                status: record.status.clone(),
            });
        }
        let revision = record.revision;
        let still_waiting = |record: &SubagentRecord| {
            record.status.lifecycle == SubagentLifecycle::Running
                && if return_if_result_available {
                    !record.status.result_available
                } else {
                    record.revision == revision
                }
        };
        let (state, timeout_result) = self
            .inner
            .changed
            .wait_timeout_while(state, timeout, |state| {
                state
                    .records
                    .get(id)
                    .is_some_and(|record| still_waiting(record))
            })
            .map_err(|_| {
                RegistryError::new("registry_unavailable", "subagent registry is poisoned")
            })?;
        let record = state.records.get(id).ok_or_else(|| unknown_subagent(id))?;
        Ok(WaitResult {
            timed_out: timeout_result.timed_out() && still_waiting(record),
            status: record.status.clone(),
        })
    }

    /// Waits like `wait_with_result`, but returns promptly when the control
    /// server that owns this request is shutting down.
    #[cfg(test)]
    pub(crate) fn active_control_waits(&self) -> usize {
        self.inner.active_control_waits.load(Ordering::Acquire)
    }

    pub(crate) fn wait_with_result_cancellable(
        &self,
        id: &str,
        timeout: Duration,
        return_if_result_available: bool,
        cancelled: &AtomicBool,
    ) -> Result<WaitResult, RegistryError> {
        const CANCELLATION_POLL: Duration = Duration::from_millis(25);

        let mut state = self.lock()?;
        let record = state.records.get(id).ok_or_else(|| unknown_subagent(id))?;
        if record.status.lifecycle != SubagentLifecycle::Running
            || (return_if_result_available && record.status.result_available)
        {
            return Ok(WaitResult {
                timed_out: false,
                status: record.status.clone(),
            });
        }
        let revision = record.revision;
        #[cfg(test)]
        let _active_wait = ActiveControlWait::new(&self.inner.active_control_waits);
        let still_waiting = |record: &SubagentRecord| {
            record.status.lifecycle == SubagentLifecycle::Running
                && if return_if_result_available {
                    !record.status.result_available
                } else {
                    record.revision == revision
                }
        };
        let deadline = Instant::now() + timeout;

        loop {
            if cancelled.load(Ordering::Acquire) {
                return Err(RegistryError::new(
                    "server_shutdown",
                    "control server is shutting down",
                ));
            }
            let remaining = deadline.saturating_duration_since(Instant::now());
            if remaining.is_zero() {
                let record = state.records.get(id).ok_or_else(|| unknown_subagent(id))?;
                return Ok(WaitResult {
                    timed_out: still_waiting(record),
                    status: record.status.clone(),
                });
            }
            let (next_state, _) = self
                .inner
                .changed
                .wait_timeout_while(state, remaining.min(CANCELLATION_POLL), |state| {
                    !cancelled.load(Ordering::Acquire)
                        && state
                            .records
                            .get(id)
                            .is_some_and(|record| still_waiting(record))
                })
                .map_err(|_| {
                    RegistryError::new("registry_unavailable", "subagent registry is poisoned")
                })?;
            state = next_state;
            let record = state.records.get(id).ok_or_else(|| unknown_subagent(id))?;
            if !still_waiting(record) {
                return Ok(WaitResult {
                    timed_out: false,
                    status: record.status.clone(),
                });
            }
        }
    }

    pub(crate) fn notify_waiters(&self) {
        self.inner.changed.notify_all();
    }

    pub(crate) fn exited(&self, id: &str, exit_code: u32) {
        let Ok(mut state) = self.inner.state.lock() else {
            return;
        };
        let Some(record) = state.records.get_mut(id) else {
            return;
        };
        if record.status.lifecycle != SubagentLifecycle::Running {
            return;
        }
        record.status.lifecycle = if record.runtime.stop_requested {
            SubagentLifecycle::Stopped
        } else {
            SubagentLifecycle::Exited
        };
        record.status.exit_code = Some(exit_code);
        record.status.ended_at = Some(timestamp_millis());
        record.runtime.release();
        record.revision = record.revision.saturating_add(1);
        prune_completed_records(&mut state, &self.inner.config);
        self.inner.changed.notify_all();
    }

    pub(crate) fn failed(&self, id: &str, error: impl Into<String>) {
        let Ok(mut state) = self.inner.state.lock() else {
            return;
        };
        let Some(record) = state.records.get_mut(id) else {
            return;
        };
        if record.status.lifecycle != SubagentLifecycle::Running {
            return;
        }
        record.status.lifecycle = SubagentLifecycle::Error;
        record.status.error = Some(error.into());
        record.status.ended_at = Some(timestamp_millis());
        record.runtime.release();
        record.revision = record.revision.saturating_add(1);
        prune_completed_records(&mut state, &self.inner.config);
        self.inner.changed.notify_all();
    }

    pub(crate) fn observability(&self) -> Result<RegistryObservability, RegistryError> {
        let state = self.lock()?;
        let active_records = state
            .records
            .values()
            .filter(|record| record.status.lifecycle == SubagentLifecycle::Running)
            .count();
        Ok(RegistryObservability {
            active_records,
            completed_records: state.records.len().saturating_sub(active_records),
            pending_reservations: state.reservations.len(),
            retention: self.inner.config.policy(),
        })
    }

    pub(crate) fn shutdown(&self) {
        let stops = if let Ok(mut state) = self.inner.state.lock() {
            state.reservations.clear();
            let ended_at = timestamp_millis();
            let stops = state
                .records
                .values_mut()
                .filter_map(|record| {
                    record.runtime.input.take();
                    let stop = record.runtime.stop.take();
                    if record.status.lifecycle == SubagentLifecycle::Running {
                        record.runtime.stop_requested = true;
                        record.status.lifecycle = SubagentLifecycle::Stopped;
                        record.status.ended_at = Some(ended_at);
                        record.revision = record.revision.saturating_add(1);
                    }
                    stop
                })
                .collect::<Vec<_>>();
            prune_completed_records(&mut state, &self.inner.config);
            self.inner.changed.notify_all();
            stops
        } else {
            Vec::new()
        };
        for stop in stops {
            let _ = stop();
        }
    }

    #[cfg(test)]
    fn with_completed_record_limit(limit: usize) -> Self {
        Self::with_config(RegistryConfig {
            completed_record_limit: limit,
            completed_record_ttl: DEFAULT_COMPLETED_RECORD_TTL,
        })
    }

    #[cfg(test)]
    fn with_config(config: RegistryConfig) -> Self {
        Self {
            inner: Arc::new(RegistryInner {
                state: Mutex::new(RegistryState::default()),
                changed: Condvar::new(),
                next_subagent_id: AtomicU64::new(0),
                config,
                active_control_waits: AtomicUsize::new(0),
            }),
        }
    }

    fn lock(&self) -> Result<std::sync::MutexGuard<'_, RegistryState>, RegistryError> {
        let mut state = self.inner.state.lock().map_err(|_| {
            RegistryError::new("registry_unavailable", "subagent registry is poisoned")
        })?;
        prune_completed_records(&mut state, &self.inner.config);
        Ok(state)
    }
}

fn prune_completed_records(state: &mut RegistryState, config: &RegistryConfig) {
    let limit = config.completed_record_limit;
    let cutoff = timestamp_millis().saturating_sub(config.completed_record_ttl.as_millis() as u64);
    state.records.retain(|_, record| {
        record.status.lifecycle == SubagentLifecycle::Running
            || record.status.ended_at.unwrap_or(record.status.created_at) >= cutoff
    });
    let mut completed = state
        .records
        .iter()
        .filter(|(_, record)| record.status.lifecycle != SubagentLifecycle::Running)
        .map(|(id, record)| {
            (
                id.clone(),
                record.status.ended_at.unwrap_or(record.status.created_at),
                record.status.created_at,
            )
        })
        .collect::<Vec<_>>();
    if completed.len() <= limit {
        return;
    }
    completed.sort_by(|left, right| {
        left.1
            .cmp(&right.1)
            .then_with(|| left.2.cmp(&right.2))
            .then_with(|| left.0.cmp(&right.0))
    });
    let prune_count = completed.len() - limit;
    for (id, _, _) in completed.into_iter().take(prune_count) {
        if state
            .records
            .get(&id)
            .is_some_and(|record| record.status.lifecycle != SubagentLifecycle::Running)
        {
            state.records.remove(&id);
        }
    }
}

fn status_sequence(status: &SubagentStatus) -> u64 {
    status
        .id
        .strip_prefix("subagent-")
        .and_then(|value| value.parse().ok())
        .unwrap_or(0)
}

fn list_cursor(status: &SubagentStatus) -> String {
    format!("v1:{}", status_sequence(status))
}

fn parse_list_cursor(cursor: &str) -> Result<u64, RegistryError> {
    cursor
        .strip_prefix("v1:")
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .ok_or_else(|| RegistryError::new("invalid_cursor", "list cursor is malformed"))
}

fn validate_result_owner(record: &SubagentRecord, terminal_id: &str) -> Result<(), RegistryError> {
    ensure_running(record)?;
    if record.status.process_kind != ProcessKind::Pi {
        return Err(RegistryError::new(
            "unsupported_result",
            "structured results are only supported for Pi subagents",
        ));
    }
    if record.status.terminal_id != terminal_id {
        return Err(RegistryError::new(
            "terminal_mismatch",
            format!(
                "terminal {terminal_id} is not associated with subagent {}",
                record.status.id
            ),
        ));
    }
    Ok(())
}

fn accept_result_sequence(
    record: &mut SubagentRecord,
    sequence: Option<u64>,
) -> Result<(), RegistryError> {
    match (sequence, record.latest_result_sequence) {
        // Legacy extensions remain compatible until this child first uses the
        // sequenced protocol. Afterwards an unsequenced report could be an old
        // in-flight mutation and must never overwrite a newer report or clear.
        (None, Some(latest)) => Err(RegistryError::new(
            "stale_result",
            format!(
                "unsequenced result mutation is not allowed after sequence {latest} was established"
            ),
        )),
        (Some(sequence), Some(latest)) if sequence <= latest => Err(RegistryError::new(
            "stale_result",
            format!("result mutation sequence {sequence} is not newer than {latest}"),
        )),
        (Some(sequence), _) => {
            record.latest_result_sequence = Some(sequence);
            Ok(())
        }
        (None, None) => Ok(()),
    }
}

fn ensure_running(record: &SubagentRecord) -> Result<(), RegistryError> {
    if record.status.lifecycle == SubagentLifecycle::Running {
        Ok(())
    } else {
        Err(RegistryError::new(
            "not_running",
            format!("subagent is not running: {}", record.status.id),
        ))
    }
}

fn unknown_subagent(id: &str) -> RegistryError {
    RegistryError::new("not_found", format!("unknown subagent: {id}"))
}

fn validate_result_text(text: &str) -> Result<(), RegistryError> {
    if text.is_empty() {
        return Err(RegistryError::new(
            "invalid_result",
            "subagent result must not be empty",
        ));
    }
    if text.len() > MAX_RESULT_BYTES {
        return Err(RegistryError::new(
            "invalid_result",
            format!("subagent result exceeds {MAX_RESULT_BYTES} bytes"),
        ));
    }
    if text
        .chars()
        .any(|character| character.is_control() && !matches!(character, '\n' | '\r' | '\t'))
    {
        return Err(RegistryError::new(
            "invalid_result",
            "subagent result contains unsupported control characters",
        ));
    }
    Ok(())
}

fn validate_identifier(label: &str, value: &str) -> Result<(), RegistryError> {
    const MAX_FIELD_BYTES: usize = 16 * 1024;
    if value.trim().is_empty() {
        Err(RegistryError::new(
            "invalid_subagent",
            format!("{label} must not be empty"),
        ))
    } else if value.len() > MAX_FIELD_BYTES {
        Err(RegistryError::new(
            "invalid_subagent",
            format!("{label} exceeds {MAX_FIELD_BYTES} bytes"),
        ))
    } else {
        Ok(())
    }
}

fn timestamp_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .try_into()
        .unwrap_or(u64::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::subagents::output::{AnsiStripper, BoundedOutput};
    use std::{
        io::{BufRead, Read, Write},
        process::{Command, Stdio},
        sync::atomic::{AtomicBool, Ordering},
        thread,
        time::{Duration, Instant},
    };

    fn registry_with_subagent() -> (SubagentRegistry, Arc<Mutex<Vec<u8>>>, Arc<AtomicBool>) {
        let registry = SubagentRegistry::default();
        registry
            .register_top_level_terminals(
                "main",
                vec![TopLevelTerminalMetadata {
                    terminal_id: "terminal-parent".into(),
                    project_id: "project-1".into(),
                }],
            )
            .unwrap();
        let reservation = registry
            .reserve(ReserveSubagent {
                parent_terminal_id: "terminal-parent".into(),
                project_id: "project-1".into(),
                name: "Research".into(),
                command: "pi".into(),
                cwd: "/tmp/project".into(),
                process_kind: "pi".into(),
            })
            .unwrap();
        let received = Arc::new(Mutex::new(Vec::new()));
        let input_received = Arc::clone(&received);
        let stopped = Arc::new(AtomicBool::new(false));
        let stop_called = Arc::clone(&stopped);
        registry
            .attach(AttachSubagent {
                owner: SubagentPtyOwner {
                    id: reservation.event.subagent_id,
                    parent_terminal_id: "terminal-parent".into(),
                    project_id: "project-1".into(),
                    name: "Research".into(),
                    process_kind: "pi".into(),
                },
                terminal_id: "terminal-child".into(),
                pty_id: "pty-2".into(),
                pid: Some(42),
                command: "pi".into(),
                cwd: "/tmp/project".into(),
                input: Arc::new(move |data| {
                    input_received.lock().unwrap().extend(data);
                    Ok(())
                }),
                stop: Arc::new(move || {
                    stop_called.store(true, Ordering::Release);
                    Ok(())
                }),
            })
            .unwrap();
        (registry, received, stopped)
    }

    fn attach_test_subagent(registry: &SubagentRegistry, name: &str) -> String {
        let reservation = registry
            .reserve(ReserveSubagent {
                parent_terminal_id: "terminal-parent".into(),
                project_id: "project-1".into(),
                name: name.into(),
                command: "pi".into(),
                cwd: "/tmp/project".into(),
                process_kind: "pi".into(),
            })
            .unwrap();
        let id = reservation.event.subagent_id;
        registry
            .attach(AttachSubagent {
                owner: SubagentPtyOwner {
                    id: id.clone(),
                    parent_terminal_id: "terminal-parent".into(),
                    project_id: "project-1".into(),
                    name: name.into(),
                    process_kind: "pi".into(),
                },
                terminal_id: format!("terminal-{id}"),
                pty_id: format!("pty-{id}"),
                pid: None,
                command: "pi".into(),
                cwd: "/tmp/project".into(),
                input: Arc::new(|_| Ok(())),
                stop: Arc::new(|| Ok(())),
            })
            .unwrap();
        id
    }

    fn assert_runtime_released(registry: &SubagentRegistry, id: &str) {
        let state = registry.inner.state.lock().unwrap();
        let record = state.records.get(id).unwrap();
        assert!(record.runtime.input.is_none());
        assert!(record.runtime.stop.is_none());
    }

    fn attach_controlled_child(
        registry: &SubagentRegistry,
        mode: &str,
        name: &str,
    ) -> (String, thread::JoinHandle<()>) {
        let reservation = registry
            .reserve(ReserveSubagent {
                parent_terminal_id: "terminal-parent".into(),
                project_id: "project-1".into(),
                name: name.into(),
                command: "controlled child fixture".into(),
                cwd: std::env::current_dir().unwrap().display().to_string(),
                process_kind: "pi".into(),
            })
            .unwrap();
        let id = reservation.event.subagent_id;
        let mut child = Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "subagents::registry::tests::controlled_child_fixture",
                "--nocapture",
            ])
            .env("TERMARC_CONTROLLED_CHILD", mode)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let pid = child.id();
        let stdin = Arc::new(Mutex::new(child.stdin.take()));
        let mut stdout = child.stdout.take().unwrap();
        let child = Arc::new(Mutex::new(child));
        let input = Arc::clone(&stdin);
        let killer = Arc::clone(&child);
        registry
            .attach(AttachSubagent {
                owner: SubagentPtyOwner {
                    id: id.clone(),
                    parent_terminal_id: "terminal-parent".into(),
                    project_id: "project-1".into(),
                    name: name.into(),
                    process_kind: "pi".into(),
                },
                terminal_id: format!("terminal-{id}"),
                pty_id: format!("pty-{id}"),
                pid: Some(pid),
                command: "controlled child fixture".into(),
                cwd: std::env::current_dir().unwrap().display().to_string(),
                input: Arc::new(move |data| {
                    let mut stdin = input
                        .lock()
                        .map_err(|_| "fixture input poisoned".to_string())?;
                    let stdin = stdin
                        .as_mut()
                        .ok_or_else(|| "fixture input closed".to_string())?;
                    stdin.write_all(&data).map_err(|error| error.to_string())?;
                    stdin.flush().map_err(|error| error.to_string())
                }),
                stop: Arc::new(move || {
                    killer
                        .lock()
                        .map_err(|_| "fixture child poisoned".to_string())?
                        .kill()
                        .map_err(|error| error.to_string())
                }),
            })
            .unwrap();

        let output_registry = registry.clone();
        let output_id = id.clone();
        let reader = thread::spawn(move || {
            let mut bytes = Vec::new();
            stdout.read_to_end(&mut bytes).unwrap();
            output_registry.append_output(&output_id, &bytes);
        });
        let lifecycle_registry = registry.clone();
        let lifecycle_id = id.clone();
        let lifecycle = thread::spawn(move || {
            loop {
                let status = child.lock().unwrap().try_wait().unwrap();
                if let Some(status) = status {
                    reader.join().unwrap();
                    lifecycle_registry.exited(
                        &lifecycle_id,
                        status.code().map(|code| code as u32).unwrap_or(1),
                    );
                    break;
                }
                thread::sleep(Duration::from_millis(5));
            }
        });
        (id, lifecycle)
    }

    #[test]
    fn controlled_child_fixture() {
        let Ok(mode) = std::env::var("TERMARC_CONTROLLED_CHILD") else {
            return;
        };
        print!("\u{1b}[32mREADY\u{1b}[0m\n");
        std::io::stdout().flush().unwrap();
        if mode == "echo" {
            let mut line = String::new();
            std::io::stdin().lock().read_line(&mut line).unwrap();
            print!("ECHO:{}", line);
            std::io::stdout().flush().unwrap();
        } else {
            thread::sleep(Duration::from_secs(30));
        }
    }

    #[test]
    fn terminal_registration_is_transactional_and_cannot_be_stolen_by_another_window() {
        let registry = SubagentRegistry::default();
        registry
            .register_top_level_terminals(
                "main",
                vec![TopLevelTerminalMetadata {
                    terminal_id: "terminal-parent".into(),
                    project_id: "project-1".into(),
                }],
            )
            .unwrap();

        let conflict = registry
            .register_top_level_terminals(
                "other",
                vec![TopLevelTerminalMetadata {
                    terminal_id: "terminal-parent".into(),
                    project_id: "project-1".into(),
                }],
            )
            .unwrap_err();
        assert_eq!(conflict.code, "terminal_conflict");

        // The failed replacement leaves the original parent routable.
        let reservation = registry
            .reserve(ReserveSubagent {
                parent_terminal_id: "terminal-parent".into(),
                project_id: "project-1".into(),
                name: "Research".into(),
                command: "pi".into(),
                cwd: "/tmp/project".into(),
                process_kind: "pi".into(),
            })
            .unwrap();
        assert_eq!(reservation.window_label, "main");
    }

    #[test]
    fn attach_rejects_a_parent_closed_after_reservation() {
        let registry = SubagentRegistry::default();
        registry
            .register_top_level_terminals(
                "main",
                vec![TopLevelTerminalMetadata {
                    terminal_id: "terminal-parent".into(),
                    project_id: "project-1".into(),
                }],
            )
            .unwrap();
        let reservation = registry
            .reserve(ReserveSubagent {
                parent_terminal_id: "terminal-parent".into(),
                project_id: "project-1".into(),
                name: "Research".into(),
                command: "pi".into(),
                cwd: "/tmp/project".into(),
                process_kind: "pi".into(),
            })
            .unwrap();
        registry.unregister_window("main");

        let error = registry
            .attach(AttachSubagent {
                owner: SubagentPtyOwner {
                    id: reservation.event.subagent_id,
                    parent_terminal_id: "terminal-parent".into(),
                    project_id: "project-1".into(),
                    name: "Research".into(),
                    process_kind: "pi".into(),
                },
                terminal_id: "terminal-child".into(),
                pty_id: "pty-2".into(),
                pid: None,
                command: "pi".into(),
                cwd: "/tmp/project".into(),
                input: Arc::new(|_| Ok(())),
                stop: Arc::new(|| Ok(())),
            })
            .unwrap_err();
        assert_eq!(error.code, "parent_not_found");
    }

    #[test]
    fn attach_and_rollback_are_atomic_under_race() {
        let registry = SubagentRegistry::default();
        registry
            .register_top_level_terminals(
                "main",
                vec![TopLevelTerminalMetadata {
                    terminal_id: "terminal-parent".into(),
                    project_id: "project-1".into(),
                }],
            )
            .unwrap();
        let reservation = registry
            .reserve(ReserveSubagent {
                parent_terminal_id: "terminal-parent".into(),
                project_id: "project-1".into(),
                name: "Research".into(),
                command: "pi".into(),
                cwd: "/tmp/project".into(),
                process_kind: "pi".into(),
            })
            .unwrap();
        let id = reservation.event.subagent_id;
        let barrier = Arc::new(std::sync::Barrier::new(2));
        let rollback_registry = registry.clone();
        let rollback_id = id.clone();
        let rollback_barrier = Arc::clone(&barrier);
        let rollback = std::thread::spawn(move || {
            rollback_barrier.wait();
            rollback_registry.rollback_reservation(&rollback_id);
        });
        let attach_registry = registry.clone();
        let attach_id = id.clone();
        let attach_barrier = Arc::clone(&barrier);
        let attach = std::thread::spawn(move || {
            attach_barrier.wait();
            attach_registry.attach(AttachSubagent {
                owner: SubagentPtyOwner {
                    id: attach_id,
                    parent_terminal_id: "terminal-parent".into(),
                    project_id: "project-1".into(),
                    name: "Research".into(),
                    process_kind: "pi".into(),
                },
                terminal_id: "terminal-child".into(),
                pty_id: "pty-2".into(),
                pid: None,
                command: "pi".into(),
                cwd: "/tmp/project".into(),
                input: Arc::new(|_| Ok(())),
                stop: Arc::new(|| Ok(())),
            })
        });

        rollback.join().unwrap();
        let _ = attach.join().unwrap();
        assert_eq!(registry.reservation_count(), 0);
        assert!(registry.status(&id).is_err());
    }

    #[test]
    fn output_is_incremental_bounded_and_reports_truncation() {
        let mut output = BoundedOutput::new(5);
        output.append(b"abc");
        assert_eq!(output.read(0, 2), (0, b"ab".to_vec(), 2, false));
        output.append(b"defg");
        assert_eq!(output.end_cursor(), 7);
        assert_eq!(output.read(0, 10), (2, b"cdefg".to_vec(), 7, true));
        assert_eq!(output.read(4, 2), (4, b"ef".to_vec(), 6, false));
    }

    #[test]
    fn strips_ansi_and_control_sequences_across_chunks() {
        let mut stripper = AnsiStripper::default();
        assert_eq!(stripper.strip(b"hello\x1b[31"), b"hello");
        assert_eq!(
            stripper.strip(b"m red\x1b[0m\x1b]0;title\x07!\x08\n"),
            b" red!\n"
        );
    }

    #[test]
    fn progress_updates_are_owned_bounded_and_wake_waiters() {
        let (registry, _, _) = registry_with_subagent();
        let id = "subagent-1";
        registry
            .update_progress(SubagentProgressUpdate {
                subagent_id: id.into(),
                terminal_id: "terminal-child".into(),
                progress: serde_json::json!({ "activities": [{ "type": "tool", "status": "running" }] }),
            })
            .unwrap();
        assert_eq!(
            registry.status(id).unwrap().progress,
            Some(serde_json::json!({ "activities": [{ "type": "tool", "status": "running" }] }))
        );
        let error = registry
            .update_progress(SubagentProgressUpdate {
                subagent_id: id.into(),
                terminal_id: "wrong-terminal".into(),
                progress: serde_json::json!({}),
            })
            .unwrap_err();
        assert_eq!(error.code, "terminal_mismatch");
    }

    #[test]
    fn registry_routes_io_and_records_stopped_exit() {
        let (registry, received, stopped) = registry_with_subagent();
        registry.append_output("subagent-1", b"\x1b[32mok\x1b[0m");
        let raw = registry
            .output("subagent-1", OutputFormat::Raw, 0, 100)
            .unwrap();
        let plain = registry
            .output("subagent-1", OutputFormat::Plain, 0, 100)
            .unwrap();
        assert_eq!(raw.data, b"\x1b[32mok\x1b[0m");
        assert_eq!(plain.data, b"ok");

        registry
            .send_input("subagent-1", b"continue\n".to_vec())
            .unwrap();
        assert_eq!(*received.lock().unwrap(), b"continue\n");
        registry.stop("subagent-1").unwrap();
        assert!(stopped.load(Ordering::Acquire));
        registry.exited("subagent-1", 9);
        let status = registry.status("subagent-1").unwrap();
        assert_eq!(status.lifecycle, SubagentLifecycle::Stopped);
        assert_eq!(status.exit_code, Some(9));
        assert!(registry.send_input("subagent-1", Vec::new()).is_err());
    }

    #[test]
    fn real_child_runtime_crosses_output_input_result_exit_stop_and_cleanup_boundaries() {
        let registry = SubagentRegistry::default();
        registry
            .register_top_level_terminals(
                "main",
                vec![TopLevelTerminalMetadata {
                    terminal_id: "terminal-parent".into(),
                    project_id: "project-1".into(),
                }],
            )
            .unwrap();

        let (echo_id, echo_lifecycle) = attach_controlled_child(&registry, "echo", "echo child");
        registry
            .update_result(SubagentResultUpdate {
                subagent_id: echo_id.clone(),
                terminal_id: format!("terminal-{echo_id}"),
                text: "structured fixture result".into(),
                sequence: Some(1),
            })
            .unwrap();
        registry.send_input(&echo_id, b"ping\n".to_vec()).unwrap();
        echo_lifecycle.join().unwrap();

        let first = registry
            .output(&echo_id, OutputFormat::Plain, 0, 6)
            .unwrap();
        let second = registry
            .output(&echo_id, OutputFormat::Plain, first.cursor, 4096)
            .unwrap();
        let combined = [first.data, second.data].concat();
        assert!(String::from_utf8_lossy(&combined).contains("READY"));
        assert!(String::from_utf8_lossy(&combined).contains("ECHO:ping"));
        assert_eq!(
            registry.result(&echo_id).unwrap().text,
            "structured fixture result"
        );
        assert_eq!(
            registry.status(&echo_id).unwrap().lifecycle,
            SubagentLifecycle::Exited
        );
        assert_runtime_released(&registry, &echo_id);
        assert!(registry.send_input(&echo_id, b"late".to_vec()).is_err());

        let (stop_id, stop_lifecycle) = attach_controlled_child(&registry, "sleep", "stop child");
        registry.stop(&stop_id).unwrap();
        stop_lifecycle.join().unwrap();
        assert_eq!(
            registry.status(&stop_id).unwrap().lifecycle,
            SubagentLifecycle::Stopped
        );
        assert_runtime_released(&registry, &stop_id);
    }

    #[test]
    fn structured_results_are_clean_latest_values_and_wake_waiters() {
        let (registry, _, _) = registry_with_subagent();
        assert!(registry.result("subagent-1").is_err());

        let waiting_registry = registry.clone();
        let waiter = std::thread::spawn(move || {
            waiting_registry
                .wait("subagent-1", Duration::from_secs(2))
                .expect("wait should succeed")
        });
        std::thread::sleep(Duration::from_millis(20));

        let first = registry
            .update_result(SubagentResultUpdate {
                subagent_id: "subagent-1".into(),
                terminal_id: "terminal-child".into(),
                text: "clean assistant response".into(),
                sequence: None,
            })
            .unwrap();
        assert_eq!(first.text, "clean assistant response");
        assert!(!waiter.join().unwrap().timed_out);
        let immediate = registry
            .wait_with_result("subagent-1", Duration::from_secs(2), true)
            .expect("available result should return immediately");
        assert!(!immediate.timed_out);
        assert!(immediate.status.result_available);

        registry
            .update_result(SubagentResultUpdate {
                subagent_id: "subagent-1".into(),
                terminal_id: "terminal-child".into(),
                text: "newer response".into(),
                sequence: None,
            })
            .unwrap();
        assert_eq!(
            registry.result("subagent-1").unwrap().text,
            "newer response"
        );
        let status = registry.status("subagent-1").unwrap();
        assert!(status.result_available);
        assert!(status.result_updated_at.is_some());
    }

    #[test]
    fn sequenced_clear_invalidates_old_results_and_rejects_late_reports() {
        let (registry, _, _) = registry_with_subagent();
        registry
            .update_result(SubagentResultUpdate {
                subagent_id: "subagent-1".into(),
                terminal_id: "terminal-child".into(),
                text: "old turn".into(),
                sequence: Some(100),
            })
            .unwrap();
        registry
            .clear_result(SubagentResultClear {
                subagent_id: "subagent-1".into(),
                terminal_id: "terminal-child".into(),
                sequence: 102,
            })
            .unwrap();

        assert!(registry.result("subagent-1").is_err());
        let status = registry.status("subagent-1").unwrap();
        assert!(!status.result_available);
        assert_eq!(status.result_updated_at, None);

        let late = registry
            .update_result(SubagentResultUpdate {
                subagent_id: "subagent-1".into(),
                terminal_id: "terminal-child".into(),
                text: "late old turn".into(),
                sequence: Some(101),
            })
            .unwrap_err();
        assert_eq!(late.code, "stale_result");
        let late_legacy = registry
            .update_result(SubagentResultUpdate {
                subagent_id: "subagent-1".into(),
                terminal_id: "terminal-child".into(),
                text: "late legacy extension".into(),
                sequence: None,
            })
            .unwrap_err();
        assert_eq!(late_legacy.code, "stale_result");
        assert!(late_legacy.to_string().contains("unsequenced"));
        assert!(registry.result("subagent-1").is_err());
    }

    #[test]
    fn result_wait_ignores_intermediate_pi_state_changes() {
        let (registry, _, _) = registry_with_subagent();
        registry
            .update_pi_state(SubagentPiStateUpdate {
                subagent_id: "subagent-1".into(),
                terminal_id: "terminal-child".into(),
                pi_state: PiState::Processing,
            })
            .unwrap();
        let result = registry
            .wait_with_result("subagent-1", Duration::from_millis(30), true)
            .unwrap();
        assert!(result.timed_out);
        assert!(!result.status.result_available);
    }

    #[test]
    fn structured_results_validate_terminal_and_content() {
        let (registry, _, _) = registry_with_subagent();
        let mismatch = registry
            .update_result(SubagentResultUpdate {
                subagent_id: "subagent-1".into(),
                terminal_id: "wrong-terminal".into(),
                text: "response".into(),
                sequence: None,
            })
            .unwrap_err();
        assert_eq!(mismatch.code, "terminal_mismatch");

        for text in [
            String::new(),
            "bad\u{0007}value".into(),
            "x".repeat(MAX_RESULT_BYTES + 1),
        ] {
            let error = registry
                .update_result(SubagentResultUpdate {
                    subagent_id: "subagent-1".into(),
                    terminal_id: "terminal-child".into(),
                    text,
                    sequence: None,
                })
                .unwrap_err();
            assert_eq!(error.code, "invalid_result");
        }
    }

    #[test]
    fn detaching_keeps_the_subagent_running_and_removes_parent_filter_association() {
        let (registry, _, stopped) = registry_with_subagent();
        registry
            .detach("terminal-parent", &["subagent-1".into()])
            .unwrap();

        let status = registry.status("subagent-1").unwrap();
        assert_eq!(status.parent_terminal_id, None);
        assert_eq!(status.lifecycle, SubagentLifecycle::Running);
        assert!(!stopped.load(Ordering::Relaxed));
        assert!(registry.list(Some("terminal-parent")).unwrap().is_empty());
        assert_eq!(registry.list(None).unwrap().len(), 1);
    }

    #[test]
    fn completion_stop_rollback_and_shutdown_release_runtime_handlers() {
        let (registry, _, _) = registry_with_subagent();
        registry.exited("subagent-1", 0);
        assert_runtime_released(&registry, "subagent-1");

        let (registry, _, _) = registry_with_subagent();
        registry.failed("subagent-1", "reader failed");
        assert_runtime_released(&registry, "subagent-1");

        let (registry, _, _) = registry_with_subagent();
        registry.stop("subagent-1").unwrap();
        assert_runtime_released(&registry, "subagent-1");

        let (registry, _, _) = registry_with_subagent();
        registry.rollback_reservation("subagent-1");
        assert!(registry.status("subagent-1").is_err());

        let (registry, _, _) = registry_with_subagent();
        registry.shutdown();
        assert_runtime_released(&registry, "subagent-1");
        assert_eq!(
            registry.status("subagent-1").unwrap().lifecycle,
            SubagentLifecycle::Stopped
        );
    }

    #[test]
    fn paginated_listing_bounds_maximal_records_rejects_bad_cursors_and_keeps_all_active() {
        let registry = SubagentRegistry::default();
        registry
            .register_top_level_terminals(
                "main",
                vec![TopLevelTerminalMetadata {
                    terminal_id: "terminal-parent".into(),
                    project_id: "project-1".into(),
                }],
            )
            .unwrap();
        let mut expected = std::collections::HashSet::new();
        expected.insert(attach_test_subagent(&registry, &"x".repeat(16 * 1024)));
        for index in 0..300 {
            expected.insert(attach_test_subagent(
                &registry,
                &format!("active-{index:04}"),
            ));
        }

        let mut found = std::collections::HashSet::new();
        let mut cursor = None;
        let mut pages = 0;
        loop {
            let page = registry
                .list_page(None, cursor.as_deref(), MAX_LIST_LIMIT)
                .unwrap();
            let framed = crate::control::ControlResponse::success(
                crate::control::ControlResult::List(page.clone()),
            );
            assert!(
                serde_json::to_vec(&framed).unwrap().len() <= crate::control::MAX_MESSAGE_BYTES,
                "list page exceeded the control frame"
            );
            found.extend(page.items.into_iter().map(|status| status.id));
            pages += 1;
            if pages == 1 {
                // IDs are monotonic cursor keys, so a concurrently added active
                // record remains discoverable on a later page.
                expected.insert(attach_test_subagent(&registry, "concurrent-active"));
            }
            let Some(next) = page.next_cursor else { break };
            assert_ne!(cursor.as_deref(), Some(next.as_str()));
            cursor = Some(next);
        }
        assert!(pages > 2, "fixture should require multiple pages");
        assert_eq!(found, expected);
        assert!(
            found
                .iter()
                .all(|id| { registry.status(id).unwrap().lifecycle == SubagentLifecycle::Running })
        );

        for malformed in ["", "not-a-cursor", "v1:x", "v1:0", "v1:1:2"] {
            let error = registry.list_page(None, Some(malformed), 1).unwrap_err();
            assert_eq!(error.code, "invalid_cursor");
        }
    }

    #[test]
    fn completed_record_pruning_is_bounded_and_keeps_active_records() {
        let registry = SubagentRegistry::with_completed_record_limit(1);
        registry
            .register_top_level_terminals(
                "main",
                vec![TopLevelTerminalMetadata {
                    terminal_id: "terminal-parent".into(),
                    project_id: "project-1".into(),
                }],
            )
            .unwrap();
        let oldest = attach_test_subagent(&registry, "oldest");
        registry.exited(&oldest, 0);
        let newest = attach_test_subagent(&registry, "newest");
        registry.failed(&newest, "failed");
        let active = attach_test_subagent(&registry, "active");

        assert!(registry.status(&oldest).is_err());
        assert_eq!(
            registry.status(&newest).unwrap().lifecycle,
            SubagentLifecycle::Error
        );
        assert_eq!(
            registry.status(&active).unwrap().lifecycle,
            SubagentLifecycle::Running
        );
        assert_eq!(registry.list(None).unwrap().len(), 2);
    }

    #[test]
    fn retention_ttl_prunes_only_completed_records_and_observability_reports_ownership() {
        let registry = SubagentRegistry::with_config(RegistryConfig {
            completed_record_limit: 10,
            completed_record_ttl: Duration::from_secs(1),
        });
        registry
            .register_top_level_terminals(
                "main",
                vec![TopLevelTerminalMetadata {
                    terminal_id: "terminal-parent".into(),
                    project_id: "project-1".into(),
                }],
            )
            .unwrap();

        let completed = attach_test_subagent(&registry, "completed");
        registry.finish_reservation(&completed).unwrap();
        registry.exited(&completed, 0);
        registry
            .inner
            .state
            .lock()
            .unwrap()
            .records
            .get_mut(&completed)
            .unwrap()
            .status
            .ended_at = Some(0);

        let active = attach_test_subagent(&registry, "active");
        registry.finish_reservation(&active).unwrap();
        let _pending = registry
            .reserve(ReserveSubagent {
                parent_terminal_id: "terminal-parent".into(),
                project_id: "project-1".into(),
                name: "pending".into(),
                command: "echo pending".into(),
                cwd: "/tmp/project".into(),
                process_kind: ProcessKind::Process,
            })
            .unwrap();

        let metrics = registry.observability().unwrap();
        assert_eq!(metrics.active_records, 1);
        assert_eq!(metrics.completed_records, 0);
        assert_eq!(metrics.pending_reservations, 1);
        assert_eq!(metrics.retention.completed_record_limit, 10);
        assert_eq!(metrics.retention.completed_record_ttl_seconds, 1);
        assert!(registry.status(&completed).is_err());
        assert_eq!(
            registry.status(&active).unwrap().lifecycle,
            SubagentLifecycle::Running
        );
    }

    #[test]
    fn registry_records_normal_exit_and_wait_errors() {
        let (registry, _, _) = registry_with_subagent();
        registry.exited("subagent-1", 0);
        assert_eq!(
            registry.status("subagent-1").unwrap().lifecycle,
            SubagentLifecycle::Exited
        );

        let (registry, _, _) = registry_with_subagent();
        registry.failed("subagent-1", "wait failed");
        let status = registry.status("subagent-1").unwrap();
        assert_eq!(status.lifecycle, SubagentLifecycle::Error);
        assert_eq!(status.error.as_deref(), Some("wait failed"));
    }

    #[test]
    fn pi_state_updates_validate_terminal_association_and_serialize_in_status() {
        let (registry, _, _) = registry_with_subagent();
        assert_eq!(registry.status("subagent-1").unwrap().pi_state, None);

        let mismatch = registry
            .update_pi_state(SubagentPiStateUpdate {
                subagent_id: "subagent-1".into(),
                terminal_id: "another-terminal".into(),
                pi_state: PiState::Processing,
            })
            .unwrap_err();
        assert_eq!(mismatch.code, "terminal_mismatch");

        registry
            .update_pi_state(SubagentPiStateUpdate {
                subagent_id: "subagent-1".into(),
                terminal_id: "terminal-child".into(),
                pi_state: PiState::Waiting,
            })
            .unwrap();
        let status = registry.status("subagent-1").unwrap();
        assert_eq!(status.pi_state, Some(PiState::Waiting));
        assert_eq!(
            serde_json::to_value(status).unwrap()["piState"],
            serde_json::json!("waiting")
        );

        registry.exited("subagent-1", 0);
        registry
            .update_pi_state(SubagentPiStateUpdate {
                subagent_id: "subagent-1".into(),
                terminal_id: "terminal-child".into(),
                pi_state: PiState::Stopped,
            })
            .unwrap();
        let status = registry.status("subagent-1").unwrap();
        assert_eq!(status.lifecycle, SubagentLifecycle::Exited);
        assert_eq!(status.pi_state, Some(PiState::Stopped));
    }

    #[test]
    fn wait_wakes_on_pi_state_change() {
        let (registry, _, _) = registry_with_subagent();
        let waiting_registry = registry.clone();
        let waiter = std::thread::spawn(move || {
            waiting_registry
                .wait("subagent-1", Duration::from_secs(2))
                .expect("wait should succeed")
        });

        std::thread::sleep(Duration::from_millis(20));
        registry
            .update_pi_state(SubagentPiStateUpdate {
                subagent_id: "subagent-1".into(),
                terminal_id: "terminal-child".into(),
                pi_state: PiState::Waiting,
            })
            .unwrap();

        let result = waiter.join().expect("waiter should not panic");
        assert!(!result.timed_out);
        assert_eq!(result.status.lifecycle, SubagentLifecycle::Running);
        assert_eq!(result.status.pi_state, Some(PiState::Waiting));
    }

    #[test]
    fn wait_wakes_on_lifecycle_change_without_holding_the_registry_lock() {
        let (registry, received, _) = registry_with_subagent();
        let waiting_registry = registry.clone();
        let waiter = std::thread::spawn(move || {
            waiting_registry
                .wait("subagent-1", Duration::from_secs(2))
                .expect("wait should succeed")
        });

        std::thread::sleep(Duration::from_millis(20));
        registry
            .send_input("subagent-1", b"while waiting".to_vec())
            .expect("registry should remain available while waiting");
        registry.exited("subagent-1", 0);

        let result = waiter.join().expect("waiter should not panic");
        assert!(!result.timed_out);
        assert_eq!(result.status.lifecycle, SubagentLifecycle::Exited);
        assert_eq!(*received.lock().unwrap(), b"while waiting");
    }

    #[test]
    fn wait_times_out_without_a_state_change() {
        let (registry, _, _) = registry_with_subagent();
        let started = Instant::now();
        let result = registry
            .wait("subagent-1", Duration::from_millis(40))
            .expect("wait should succeed");

        assert!(result.timed_out);
        assert_eq!(result.status.lifecycle, SubagentLifecycle::Running);
        assert!(started.elapsed() >= Duration::from_millis(30));
    }
}
