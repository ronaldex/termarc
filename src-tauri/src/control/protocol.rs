use serde::{Deserialize, Serialize};

use crate::subagents::{
    OutputChunk, OutputFormat, RegistryObservability, ReserveSubagent, SubagentListPage,
    SubagentProgressUpdate, SubagentResult, SubagentResultClear, SubagentResultUpdate,
    SubagentStatus, WaitResult,
};

pub(crate) const PROTOCOL_VERSION: u32 = 1;
pub(crate) const MAX_MESSAGE_BYTES: usize = 64 * 1024;
pub(crate) const MAX_BINARY_BYTES: usize = 12 * 1024;
pub(crate) const MAX_WAIT_MS: u64 = 24 * 60 * 60 * 1_000;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub(crate) enum ControlRequest {
    Status {
        #[serde(rename = "protocolVersion")]
        protocol_version: u32,
    },
    SubagentSpawn {
        #[serde(rename = "protocolVersion")]
        protocol_version: u32,
        #[serde(flatten)]
        request: ReserveSubagent,
    },
    SubagentList {
        #[serde(rename = "protocolVersion")]
        protocol_version: u32,
        #[serde(default, rename = "parentTerminalId")]
        parent_terminal_id: Option<String>,
        #[serde(default)]
        cursor: Option<String>,
        #[serde(default)]
        limit: Option<usize>,
    },
    SubagentStatus {
        #[serde(rename = "protocolVersion")]
        protocol_version: u32,
        id: String,
    },
    SubagentOutput {
        #[serde(rename = "protocolVersion")]
        protocol_version: u32,
        id: String,
        after: u64,
        format: OutputFormat,
        #[serde(default)]
        limit: Option<usize>,
    },
    SubagentResult {
        #[serde(rename = "protocolVersion")]
        protocol_version: u32,
        id: String,
    },
    SubagentResultUpdate {
        #[serde(rename = "protocolVersion")]
        protocol_version: u32,
        #[serde(flatten)]
        update: SubagentResultUpdate,
    },
    SubagentProgressUpdate {
        #[serde(rename = "protocolVersion")]
        protocol_version: u32,
        #[serde(flatten)]
        update: SubagentProgressUpdate,
    },
    SubagentResultClear {
        #[serde(rename = "protocolVersion")]
        protocol_version: u32,
        #[serde(flatten)]
        clear: SubagentResultClear,
    },
    SubagentInput {
        #[serde(rename = "protocolVersion")]
        protocol_version: u32,
        id: String,
        data: Vec<u8>,
    },
    SubagentWait {
        #[serde(rename = "protocolVersion")]
        protocol_version: u32,
        id: String,
        #[serde(rename = "timeoutMs")]
        timeout_ms: u64,
        #[serde(default, rename = "returnIfResultAvailable")]
        return_if_result_available: bool,
    },
    SubagentStop {
        #[serde(rename = "protocolVersion")]
        protocol_version: u32,
        id: String,
    },
    SubagentClose {
        #[serde(rename = "protocolVersion")]
        protocol_version: u32,
        id: String,
    },
}

impl ControlRequest {
    pub(crate) fn protocol_version(&self) -> u32 {
        match self {
            Self::Status { protocol_version }
            | Self::SubagentSpawn {
                protocol_version, ..
            }
            | Self::SubagentList {
                protocol_version, ..
            }
            | Self::SubagentStatus {
                protocol_version, ..
            }
            | Self::SubagentOutput {
                protocol_version, ..
            }
            | Self::SubagentResult {
                protocol_version, ..
            }
            | Self::SubagentResultUpdate {
                protocol_version, ..
            }
            | Self::SubagentProgressUpdate {
                protocol_version, ..
            }
            | Self::SubagentResultClear {
                protocol_version, ..
            }
            | Self::SubagentInput {
                protocol_version, ..
            }
            | Self::SubagentWait {
                protocol_version, ..
            }
            | Self::SubagentStop {
                protocol_version, ..
            }
            | Self::SubagentClose {
                protocol_version, ..
            } => *protocol_version,
        }
    }

    pub(crate) fn status() -> Self {
        Self::Status {
            protocol_version: PROTOCOL_VERSION,
        }
    }
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StatusResponse {
    pub(crate) protocol_version: u32,
    pub(crate) version: String,
    pub(crate) ready: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) subagents: Option<RegistryObservability>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub(crate) struct SpawnResponse {
    pub(crate) id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct EmptyResponse {}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(untagged)]
pub(crate) enum ControlResult {
    Status(StatusResponse),
    Spawn(SpawnResponse),
    List(SubagentListPage),
    SubagentStatus(SubagentStatus),
    Output(OutputChunk),
    SubagentResult(SubagentResult),
    Wait(WaitResult),
    Empty(EmptyResponse),
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ErrorResponse {
    pub(crate) code: String,
    pub(crate) message: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ControlResponse {
    pub(crate) ok: bool,
    pub(crate) protocol_version: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) result: Option<ControlResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) error: Option<ErrorResponse>,
}

impl ControlResponse {
    pub(crate) fn success(result: ControlResult) -> Self {
        Self {
            ok: true,
            protocol_version: PROTOCOL_VERSION,
            result: Some(result),
            error: None,
        }
    }

    pub(crate) fn error(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            ok: false,
            protocol_version: PROTOCOL_VERSION,
            result: None,
            error: Some(ErrorResponse {
                code: code.into(),
                message: message.into(),
            }),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::subagents::ProcessKind;

    #[test]
    fn process_kind_preserves_builtins_and_unknown_wire_values() {
        let pi: ProcessKind = serde_json::from_str(r#""pi""#).unwrap();
        let custom: ProcessKind = serde_json::from_str(r#""future-agent""#).unwrap();
        assert_eq!(pi, ProcessKind::Pi);
        assert_eq!(custom, ProcessKind::Custom("future-agent".into()));
        assert_eq!(serde_json::to_string(&custom).unwrap(), r#""future-agent""#);
    }

    #[test]
    fn protocol_requests_round_trip_independently_from_transport() {
        let legacy_report: ControlRequest = serde_json::from_str(
            r#"{"type":"subagentResultUpdate","protocolVersion":1,"subagentId":"subagent-1","terminalId":"terminal-child","text":"legacy"}"#,
        )
        .unwrap();
        let ControlRequest::SubagentResultUpdate { update, .. } = legacy_report else {
            panic!("expected result update");
        };
        assert_eq!(update.sequence, None);

        let request = ControlRequest::SubagentWait {
            protocol_version: PROTOCOL_VERSION,
            id: "subagent-1".into(),
            timeout_ms: 7_000,
            return_if_result_available: true,
        };
        let encoded = serde_json::to_string(&request).unwrap();
        assert!(encoded.contains(r#""type":"subagentWait""#));
        let decoded: ControlRequest = serde_json::from_str(&encoded).unwrap();
        assert_eq!(decoded.protocol_version(), PROTOCOL_VERSION);
    }
}
