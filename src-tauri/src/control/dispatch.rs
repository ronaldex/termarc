use std::{
    sync::{
        Arc,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};

use crate::{
    spawn_router::SpawnRouter,
    subagents::{
        DEFAULT_LIST_LIMIT, DEFAULT_OUTPUT_LIMIT, MAX_LIST_LIMIT, MAX_OUTPUT_READ, SubagentRegistry,
    },
};

use super::protocol::{
    ControlRequest, ControlResponse, ControlResult, EmptyResponse, MAX_BINARY_BYTES, MAX_WAIT_MS,
    PROTOCOL_VERSION, SpawnResponse, StatusResponse,
};

const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
type DispatchError = (&'static str, String);

/// Application-policy boundary for the generic control transport.
#[derive(Clone)]
pub(crate) struct ControlDispatcher {
    subagents: SubagentRegistry,
    spawn_router: SpawnRouter,
    shutdown: Arc<AtomicBool>,
}

impl ControlDispatcher {
    pub(crate) fn new(subagents: SubagentRegistry, spawn_router: SpawnRouter) -> Self {
        Self {
            subagents,
            spawn_router,
            shutdown: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Cancels in-flight control requests before the server joins its workers.
    pub(crate) fn shutdown(&self) {
        self.shutdown.store(true, Ordering::Release);
        self.subagents.notify_waiters();
    }

    pub(crate) fn dispatch_bytes(&self, message: &[u8]) -> Vec<u8> {
        let response = match serde_json::from_slice::<ControlRequest>(message) {
            Ok(request) => self.dispatch(request),
            Err(error) => {
                ControlResponse::error("invalid_request", format!("invalid request: {error}"))
            }
        };
        serde_json::to_vec(&response).unwrap_or_else(|error| {
            format!(
                "{{\"ok\":false,\"protocolVersion\":{PROTOCOL_VERSION},\"error\":{{\"code\":\"serialization_failed\",\"message\":\"{error}\"}}}}"
            )
            .into_bytes()
        })
    }

    pub(crate) fn dispatch(&self, request: ControlRequest) -> ControlResponse {
        if let Err(error) = check_protocol(request.protocol_version()) {
            return ControlResponse::error(error.0, error.1);
        }

        let result = match request {
            ControlRequest::Status { .. } => self
                .subagents
                .observability()
                .map(|observability| {
                    ControlResult::Status(StatusResponse {
                        protocol_version: PROTOCOL_VERSION,
                        version: APP_VERSION.into(),
                        ready: true,
                        subagents: Some(observability),
                    })
                })
                .map_err(registry_error),
            ControlRequest::SubagentSpawn { request, .. } => self
                .spawn_router
                .route(request)
                .map(|id| ControlResult::Spawn(SpawnResponse { id })),
            ControlRequest::SubagentList {
                parent_terminal_id,
                cursor,
                limit,
                ..
            } => {
                let limit = limit.unwrap_or(DEFAULT_LIST_LIMIT);
                if limit == 0 || limit > MAX_LIST_LIMIT {
                    Err((
                        "invalid_request",
                        format!("list limit must be between 1 and {MAX_LIST_LIMIT}"),
                    ))
                } else {
                    self.subagents
                        .list_page(parent_terminal_id.as_deref(), cursor.as_deref(), limit)
                        .map(ControlResult::List)
                        .map_err(registry_error)
                }
            }
            ControlRequest::SubagentStatus { id, .. } => self
                .subagents
                .status(&id)
                .map(ControlResult::SubagentStatus)
                .map_err(registry_error),
            ControlRequest::SubagentOutput {
                id,
                after,
                format,
                limit,
                ..
            } => {
                let limit = limit.unwrap_or(DEFAULT_OUTPUT_LIMIT);
                if limit == 0 || limit > MAX_OUTPUT_READ {
                    Err((
                        "invalid_request",
                        format!("output limit must be between 1 and {MAX_OUTPUT_READ}"),
                    ))
                } else {
                    self.subagents
                        .output(&id, format, after, limit)
                        .map(ControlResult::Output)
                        .map_err(registry_error)
                }
            }
            ControlRequest::SubagentResult { id, .. } => self
                .subagents
                .result(&id)
                .map(ControlResult::SubagentResult)
                .map_err(registry_error),
            ControlRequest::SubagentResultUpdate { update, .. } => self
                .subagents
                .update_result(update)
                .map(ControlResult::SubagentResult)
                .map_err(registry_error),
            ControlRequest::SubagentProgressUpdate { update, .. } => self
                .subagents
                .update_progress(update)
                .map(|()| ControlResult::Empty(EmptyResponse {}))
                .map_err(registry_error),
            ControlRequest::SubagentResultClear { clear, .. } => self
                .subagents
                .clear_result(clear)
                .map(|()| ControlResult::Empty(EmptyResponse {}))
                .map_err(registry_error),
            ControlRequest::SubagentInput { id, data, .. } => {
                if data.len() > MAX_BINARY_BYTES {
                    Err((
                        "invalid_request",
                        format!("subagent input exceeds {MAX_BINARY_BYTES} bytes"),
                    ))
                } else {
                    self.subagents
                        .send_input(&id, data)
                        .map(|()| ControlResult::Empty(EmptyResponse {}))
                        .map_err(registry_error)
                }
            }
            ControlRequest::SubagentWait {
                id,
                timeout_ms,
                return_if_result_available,
                ..
            } => {
                if timeout_ms > MAX_WAIT_MS {
                    Err((
                        "invalid_request",
                        format!("wait timeout must not exceed {MAX_WAIT_MS}ms"),
                    ))
                } else {
                    self.subagents
                        .wait_with_result_cancellable(
                            &id,
                            Duration::from_millis(timeout_ms),
                            return_if_result_available,
                            &self.shutdown,
                        )
                        .map(ControlResult::Wait)
                        .map_err(registry_error)
                }
            }
            ControlRequest::SubagentStop { id, .. } => self
                .subagents
                .stop(&id)
                .map(|()| ControlResult::Empty(EmptyResponse {}))
                .map_err(registry_error),
            ControlRequest::SubagentClose { id, .. } => self
                .spawn_router
                .close(&id)
                .map(|()| ControlResult::Empty(EmptyResponse {})),
        };

        match result {
            Ok(result) => ControlResponse::success(result),
            Err((code, message)) => ControlResponse::error(code, message),
        }
    }
}

fn registry_error(error: crate::subagents::RegistryError) -> DispatchError {
    (error.code, error.to_string())
}

fn check_protocol(protocol_version: u32) -> Result<(), DispatchError> {
    if protocol_version == PROTOCOL_VERSION {
        Ok(())
    } else {
        Err((
            "unsupported_protocol",
            format!("unsupported protocol version {protocol_version}; expected {PROTOCOL_VERSION}"),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::subagents::SubagentRegistry;

    fn dispatcher() -> ControlDispatcher {
        let registry = SubagentRegistry::default();
        let router = SpawnRouter::new(registry.clone(), |_, _| Ok(()));
        ControlDispatcher::new(registry, router)
    }

    #[test]
    fn shared_extension_protocol_fixtures_cover_all_operations_and_envelopes() {
        let fixtures: serde_json::Value = serde_json::from_str(include_str!(
            "../../../extensions/pi/fixtures/control-protocol.json"
        ))
        .unwrap();
        assert_eq!(fixtures["protocolVersion"], PROTOCOL_VERSION);

        let requests = fixtures["requests"].as_object().unwrap();
        for operation in [
            "status",
            "spawn",
            "list",
            "subagentStatus",
            "wait",
            "output",
            "result",
            "resultUpdate",
            "resultClear",
            "input",
            "stop",
            "close",
        ] {
            let request: ControlRequest = serde_json::from_value(requests[operation].clone())
                .unwrap_or_else(|error| {
                    panic!("{operation} request fixture must match Rust: {error}")
                });
            assert_eq!(request.protocol_version(), PROTOCOL_VERSION);
        }

        for malformed in fixtures["malformedRequests"].as_array().unwrap() {
            assert!(serde_json::from_value::<ControlRequest>(malformed.clone()).is_err());
        }
        let older: ControlRequest =
            serde_json::from_value(fixtures["olderVersion"].clone()).unwrap();
        let response = dispatcher().dispatch(older);
        assert_eq!(response.error.unwrap().code, "unsupported_protocol");

        let responses = fixtures["responses"].as_object().unwrap();
        for operation in [
            "status",
            "spawn",
            "list",
            "subagentStatus",
            "wait",
            "output",
            "result",
            "input",
            "stop",
            "close",
        ] {
            let response = responses[operation].as_object().unwrap();
            assert_eq!(response["ok"], true, "{operation} response must succeed");
            assert_eq!(response["protocolVersion"], PROTOCOL_VERSION);
            assert!(response.contains_key("result"));
            assert!(!response.contains_key("error"));
            let decoded: ControlResponse =
                serde_json::from_value(serde_json::Value::Object(response.clone())).unwrap_or_else(
                    |error| panic!("{operation} response fixture must match Rust: {error}"),
                );
            let result = decoded.result.unwrap();
            assert!(
                matches!(
                    (operation, result),
                    ("status", ControlResult::Status(_))
                        | ("spawn", ControlResult::Spawn(_))
                        | ("list", ControlResult::List(_))
                        | ("subagentStatus", ControlResult::SubagentStatus(_))
                        | ("wait", ControlResult::Wait(_))
                        | ("output", ControlResult::Output(_))
                        | ("result", ControlResult::SubagentResult(_))
                        | ("input" | "stop" | "close", ControlResult::Empty(_))
                ),
                "{operation} response decoded as the wrong Rust variant"
            );
        }
        let error = responses["error"].as_object().unwrap();
        assert_eq!(error["ok"], false);
        assert_eq!(error["protocolVersion"], PROTOCOL_VERSION);
        assert!(error["error"]["code"].is_string());
        assert!(error["error"]["message"].is_string());

        for malformed in fixtures["malformedResponses"].as_array().unwrap() {
            let response = malformed.as_object().unwrap();
            let structurally_valid = response.get("ok").and_then(serde_json::Value::as_bool)
                == Some(true)
                && response.contains_key("result")
                || response.get("ok").and_then(serde_json::Value::as_bool) == Some(false)
                    && response["error"]["code"].is_string()
                    && response["error"]["message"].is_string();
            assert!(!structurally_valid);
        }
    }

    #[test]
    fn paginated_list_validates_limits_and_malformed_cursors() {
        let invalid_cursor = dispatcher().dispatch(ControlRequest::SubagentList {
            protocol_version: PROTOCOL_VERSION,
            parent_terminal_id: None,
            cursor: Some("malformed".into()),
            limit: Some(1),
        });
        assert_eq!(invalid_cursor.error.unwrap().code, "invalid_cursor");

        for limit in [0, MAX_LIST_LIMIT + 1] {
            let invalid_limit = dispatcher().dispatch(ControlRequest::SubagentList {
                protocol_version: PROTOCOL_VERSION,
                parent_terminal_id: None,
                cursor: None,
                limit: Some(limit),
            });
            assert_eq!(invalid_limit.error.unwrap().code, "invalid_request");
        }
    }

    #[test]
    fn status_exposes_registry_observability_and_retention() {
        let response = dispatcher().dispatch(ControlRequest::status());
        let ControlResult::Status(status) = response.result.unwrap() else {
            panic!("expected status response");
        };
        let metrics = status.subagents.expect("observability should be exposed");
        assert_eq!(metrics.active_records, 0);
        assert_eq!(metrics.completed_records, 0);
        assert_eq!(metrics.pending_reservations, 0);
        assert!(metrics.retention.completed_record_limit > 0);
        assert!(metrics.retention.completed_record_ttl_seconds > 0);
    }
}
