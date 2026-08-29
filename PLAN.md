# Subagent terminals and control API

## Goal

Allow a Pi agent running in a Termarc terminal to asynchronously spawn and control Pi subagents. Each subagent receives a separate PTY-backed terminal, appears beneath its parent in the sidebar, and can be inspected or controlled through the `termarc` CLI.

The process-control layer should be generic enough to support other process types later, while the initial product integration targets Pi.

## Product decisions

- Initial agent integration: Pi.
- Main agents can obtain subagent status and incremental output through an efficient CLI/API.
- The underlying process-control API is generic rather than Pi-only.
- When closing a parent terminal with active children, ask the user whether to stop children, detach them, or cancel.
- Hierarchy has one child level only: main agents and their subagents. A subagent cannot create another subagent.
- Runtime subagents do not survive an application restart.
- Access is initially unrestricted. A CLI caller launched inside Termarc infers its parent terminal from environment; callers outside Termarc must pass a parent terminal ID.

## CLI contract

```bash
# TERMARC_TERMINAL_ID supplies --parent for a Termarc-launched caller.
termarc subagents spawn --name "Research authentication" -- pi [pi arguments...]

# Explicit parent for callers outside a Termarc terminal.
termarc subagents spawn --parent <terminal-id> --name "Research authentication" -- pi [...]

termarc subagents list --parent <terminal-id> --json
termarc subagents status <subagent-id> --json
termarc subagents output <subagent-id> --after <cursor> --json
termarc subagents send <subagent-id> --text "Continue with tests"
termarc subagents wait <subagent-id> --timeout 300 --json
termarc subagents stop <subagent-id>
```

`spawn` returns once Termarc accepts creation. `output` returns only bytes after a cursor and a new cursor. `wait` blocks until a state change or timeout, avoiding polling.

## Delivery slices

### 1. Domain foundation

Define runtime-only subagent domain types and pure, tested rules before adding IPC or UI.

- Add stable IDs, parent terminal IDs, project IDs, labels, generic process metadata, lifecycle, Pi state, completion information, timestamps, and output cursors.
- Extend `TerminalLaunch` with a distinct subagent launch variant.
- Add pure validation for allowed parents and a one-level hierarchy.
- Add pure lifecycle/output cursor transitions with unit tests.
- Keep this runtime state out of persisted project configuration and restart restoration.

### 2. Local runtime control service

The standalone CLI cannot currently reach a running Tauri process. Add a local macOS Unix-domain socket service.

- Start/remove the socket with the application.
- Use bounded newline-delimited JSON messages and structured responses.
- Support concurrent calls and blocking waits.
- Define a narrow service interface so authentication can be added later.
- Return a clear error when Termarc is not running.

Likely modules: `src-tauri/src/subagents.rs`, `src-tauri/src/control_server.rs`, registration in `src-tauri/src/lib.rs`, and CLI-client additions in `src-tauri/src/cli.rs`.

### 3. PTY ownership and output capture

Refactor PTY lifecycle so a PTY can optionally belong to a subagent.

- Associate subagent records with the public UI terminal ID and internal PTY ID.
- Mirror PTY output to the existing Tauri channel and a bounded registry buffer.
- Expose raw output and ANSI-stripped plain output for agent consumption.
- Track cursors and report output truncation.
- Route input, stop, exit, and error events through the registry.
- Inject `TERMARC_TERMINAL_ID`, `TERMARC_PARENT_TERMINAL_ID`, and `TERMARC_SUBAGENT_ID` where applicable.

### 4. Asynchronous spawn routing

A CLI request must result in a frontend-owned xterm tab and backend-owned PTY.

1. The CLI sends a spawn request.
2. The backend validates the parent and reserves a subagent ID.
3. The backend emits a spawn request to an active Termarc window.
4. The frontend creates a subagent tab via focused orchestration outside the large `useTerminalTabs.ts` facade.
5. Normal PTY startup attaches the reserved ID.
6. The frontend acknowledges success/failure; backend rolls back timed-out reservations.

### 5. CLI commands and efficient agent workflow

Implement `spawn`, `list`, `status`, `output`, `send`, `wait`, and `stop` in `src-tauri/src/cli.rs`, with stable `--json` output.

`wait` wakes on Pi readiness, process exit, process error, or timeout. The main-agent workflow is: spawn, do other work, wait, retrieve incremental output, then send more input or stop.

### 6. Pi semantic-state integration

Extend the existing OSC 777 integration without making generic process control Pi-specific.

- Associate parsed Pi `processing`, `waiting`, and `stopped` markers with subagent records.
- Forward transitions to the control registry.
- Ensure OSC remains invisible in the terminal and does not corrupt Pi structured-output modes.
- Preserve lifecycle behavior when no Pi marker exists.

Relevant files include `extensions/pi/termarc-status.ts`, `src/utils/terminalAgentStatus.ts`, `src/utils/terminalActivity.ts`, and `src/composables/useTerminalTabs.ts`.

### 7. Sidebar hierarchy and workspace activation

Show runtime subagents below their parent under **AGENTS**:

```text
AGENTS
  Main agent
    Research authentication   processing
    Add integration tests     waiting
```

- Add focused child-row UI, lifecycle indicators, and actions.
- Selecting a child opens its xterm terminal.
- Update tree models, selection types, keyboard navigation, filtering, shortcut order, and restoration validation.
- Do not mix runtime subagent ordering with persistent project terminal ordering.

### 8. Parent-close behavior

When a parent has active children, offer:

- Stop parent and subagents
- Keep subagents as standalone terminals
- Cancel

Detached children remain runtime agents. On application exit, use one aggregate confirmation and then stop all app-owned PTYs as today.

### 9. Tests and hardening

Rust tests:

- Socket parsing, request bounds, concurrency, and unavailable-app behavior
- Registry/lifecycle transitions
- Output cursors/truncation
- Spawn timeout/rollback
- Input/stop/wait and shutdown cleanup
- Parent validation and one-level limit

Frontend tests:

- Domain transitions and parent validation
- Tree nesting, filtering, flattened keyboard order, and selection
- Pi OSC state updates
- Parent-close choices and dynamic cleanup

End-to-end scenarios:

1. Main Pi spawns one or multiple children.
2. Parent reads incremental output and status.
3. Parent sends a follow-up prompt.
4. Child succeeds, errors, or is stopped.
5. User opens the child terminal from the sidebar.
6. Parent-close choices work.
7. Explicit external `--parent` works.
8. Invalid parents and subagent parents are rejected.

Run frontend format, tests, and build plus Rust format, check, and tests after structural stages.
