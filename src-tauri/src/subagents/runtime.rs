use std::sync::Arc;

pub(crate) type InputHandler = Arc<dyn Fn(Vec<u8>) -> Result<(), String> + Send + Sync>;
pub(crate) type StopHandler = Arc<dyn Fn() -> Result<(), String> + Send + Sync>;

/// Live PTY capabilities. This is deliberately separate from retained status,
/// result, and output history so completion can release process ownership.
pub(super) struct SubagentRuntime {
    pub(super) input: Option<InputHandler>,
    pub(super) stop: Option<StopHandler>,
    pub(super) stop_requested: bool,
}

impl SubagentRuntime {
    pub(super) fn new(input: InputHandler, stop: StopHandler) -> Self {
        Self {
            input: Some(input),
            stop: Some(stop),
            stop_requested: false,
        }
    }

    pub(super) fn release(&mut self) {
        self.input.take();
        self.stop.take();
    }
}
