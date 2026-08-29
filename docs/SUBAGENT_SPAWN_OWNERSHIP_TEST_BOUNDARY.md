# Subagent spawn ownership test boundary

A literal Rust backend and Vue webview cannot run in one in-process test: Tauri IPC channels, window event delivery, and managed Rust state are created by the desktop runtime and cross a process/webview boundary.

The ownership path is covered with overlapping integrations:

- `src/services/subagentSpawnOwnership.integration.test.ts` uses the production frontend event service, spawn API wrappers, `useTerminalTabs.createTab`, typed `useTerminalTabs.startTab`, terminal API/channel construction, acknowledgement, and close/stop rollback. Only the native Tauri event/core transport is replaced. It covers successful attach acknowledgement, an early PTY error before `start_pty` resolves, and acknowledgement after backend timeout rollback.
- Rust router tests in `src-tauri/src/spawn_router.rs` cover reservation, event routing, attach-before-successful-ack, timeout, emit failure, and registry rollback.
- Rust PTY tests in `src-tauri/src/pty.rs` run a real controllable PTY child and cover registry attachment, ownership, output, input, exit, stop, and runtime release.

`extensions/pi/fixtures/subagent-spawn-ipc.json` is consumed by both the frontend ownership integration and the Rust PTY contract test. It fixes the exact event name, camel-case spawn payload, acknowledgement, and `start_pty` ownership payload, so the separate suites overlap at both IPC contracts rather than leaving an unverified shape conversion between them.
