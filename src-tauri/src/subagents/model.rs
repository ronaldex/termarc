use serde::{Deserialize, Deserializer, Serialize, Serializer};
use serde_json::Value;
use std::fmt;

pub(crate) const DEFAULT_OUTPUT_LIMIT: usize = 12 * 1024;
pub(crate) const MAX_OUTPUT_READ: usize = 12 * 1024;
pub(crate) const MAX_RESULT_BYTES: usize = 24 * 1024;
pub(crate) const MAX_PROGRESS_BYTES: usize = 24 * 1024;
pub(crate) const OUTPUT_BUFFER_CAPACITY: usize = 1024 * 1024;
pub(crate) const DEFAULT_LIST_LIMIT: usize = 32;
pub(crate) const MAX_LIST_LIMIT: usize = 128;
/// Leaves room for the response envelope and JSON escaping inside a 64 KiB frame.
pub(crate) const MAX_LIST_ITEMS_BYTES: usize = 48 * 1024;

/// Stable built-in process kinds plus a forward-compatible custom kind.
///
/// The wire representation remains a single string for protocol-v1 and
/// frontend migration compatibility. Unknown strings deserialize as `Custom`
/// and serialize unchanged.
#[derive(Clone, Debug, Eq, PartialEq, Hash)]
pub(crate) enum ProcessKind {
    Pi,
    Process,
    Custom(String),
}

impl ProcessKind {
    pub(crate) fn as_str(&self) -> &str {
        match self {
            Self::Pi => "pi",
            Self::Process => "process",
            Self::Custom(value) => value,
        }
    }
}

impl Default for ProcessKind {
    fn default() -> Self {
        Self::Process
    }
}

impl From<&str> for ProcessKind {
    fn from(value: &str) -> Self {
        match value {
            "pi" => Self::Pi,
            "process" => Self::Process,
            custom => Self::Custom(custom.to_owned()),
        }
    }
}

impl From<String> for ProcessKind {
    fn from(value: String) -> Self {
        match value.as_str() {
            "pi" => Self::Pi,
            "process" => Self::Process,
            _ => Self::Custom(value),
        }
    }
}

impl fmt::Display for ProcessKind {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.as_str())
    }
}

impl Serialize for ProcessKind {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.as_str())
    }
}

impl<'de> Deserialize<'de> for ProcessKind {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        String::deserialize(deserializer).map(Self::from)
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SubagentPtyOwner {
    pub(crate) id: String,
    pub(crate) parent_terminal_id: String,
    pub(crate) project_id: String,
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) process_kind: ProcessKind,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum OutputFormat {
    Raw,
    Plain,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum SubagentLifecycle {
    Running,
    Exited,
    Stopped,
    Error,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum PiState {
    Processing,
    Waiting,
    Stopped,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SubagentPiStateUpdate {
    pub(crate) subagent_id: String,
    pub(crate) terminal_id: String,
    pub(crate) pi_state: PiState,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SubagentStatus {
    pub(crate) id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) parent_terminal_id: Option<String>,
    pub(crate) terminal_id: String,
    pub(crate) pty_id: String,
    pub(crate) project_id: String,
    pub(crate) name: String,
    pub(crate) process_kind: ProcessKind,
    pub(crate) command: String,
    pub(crate) cwd: String,
    pub(crate) lifecycle: SubagentLifecycle,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) pi_state: Option<PiState>,
    pub(crate) pid: Option<u32>,
    pub(crate) exit_code: Option<u32>,
    pub(crate) error: Option<String>,
    pub(crate) created_at: u64,
    pub(crate) started_at: u64,
    pub(crate) ended_at: Option<u64>,
    pub(crate) raw_output_cursor: u64,
    pub(crate) plain_output_cursor: u64,
    pub(crate) result_available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) result_updated_at: Option<u64>,
    /// Sanitized, bounded activity snapshot published by an owned Pi child.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) progress: Option<Value>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct SubagentListPage {
    pub(crate) items: Vec<SubagentStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) next_cursor: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SubagentResult {
    pub(crate) id: String,
    pub(crate) text: String,
    pub(crate) updated_at: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SubagentResultUpdate {
    pub(crate) subagent_id: String,
    pub(crate) terminal_id: String,
    pub(crate) text: String,
    /// Monotonic child-authored turn sequence. Optional for protocol-v1 CLI
    /// compatibility; sequenced mutations prevent an older report from
    /// overtaking a later clear.
    #[serde(default)]
    pub(crate) sequence: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SubagentProgressUpdate {
    pub(crate) subagent_id: String,
    pub(crate) terminal_id: String,
    pub(crate) progress: Value,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SubagentResultClear {
    pub(crate) subagent_id: String,
    pub(crate) terminal_id: String,
    pub(crate) sequence: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OutputChunk {
    pub(crate) format: OutputFormat,
    pub(crate) after: u64,
    pub(crate) cursor: u64,
    pub(crate) truncated: bool,
    pub(crate) data: Vec<u8>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TopLevelTerminalMetadata {
    pub(crate) terminal_id: String,
    pub(crate) project_id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReserveSubagent {
    pub(crate) parent_terminal_id: String,
    pub(crate) project_id: String,
    pub(crate) name: String,
    pub(crate) command: String,
    pub(crate) cwd: String,
    #[serde(default)]
    pub(crate) process_kind: ProcessKind,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SubagentSpawnEvent {
    pub(crate) subagent_id: String,
    pub(crate) parent_terminal_id: String,
    pub(crate) project_id: String,
    pub(crate) name: String,
    pub(crate) command: String,
    pub(crate) cwd: String,
    pub(crate) process_kind: ProcessKind,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SubagentCloseEvent {
    pub(crate) subagent_id: String,
    pub(crate) terminal_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SubagentSpawnAcknowledgement {
    pub(crate) subagent_id: String,
    pub(crate) success: bool,
    #[serde(default)]
    pub(crate) error: Option<String>,
}

#[derive(Clone, Debug)]
pub(crate) struct SpawnAcknowledgement {
    pub(crate) success: bool,
    pub(crate) error: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WaitResult {
    pub(crate) timed_out: bool,
    pub(crate) status: SubagentStatus,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RetentionPolicy {
    pub(crate) completed_record_limit: usize,
    pub(crate) completed_record_ttl_seconds: u64,
    pub(crate) output_bytes_per_format: usize,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RegistryObservability {
    pub(crate) active_records: usize,
    pub(crate) completed_records: usize,
    pub(crate) pending_reservations: usize,
    pub(crate) retention: RetentionPolicy,
}
