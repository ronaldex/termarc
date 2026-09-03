# Architecture and maintainability review plan

## Scope

This review covers the current staged, unstaged, and untracked implementation. It complements `PLAN.md`; it does not replace the existing feature plan.

The change set implements a substantial agent/subterminal workflow across the Vue application, Tauri backend, CLI, PTY runtime, and Pi extension. The existing direction is sound, but the feature has increased orchestration and lifecycle complexity in a few already-large modules. The next work should stabilize those boundaries before adding more process types, hierarchy levels, or sidebar modes.

## Implemented feature inventory

### Generic subagent/process control

- A versioned local Unix-socket control service with bounded JSON messages.
- CLI operations for spawn, list, status, wait, output/result retrieval, input, and stop.
- Spawn reservation, frontend routing, acknowledgement, timeout, and rollback.
- Parent/project validation and a one-level subagent rule.
- PTY ownership metadata, environment injection, output capture, ANSI-stripped output, cursors, lifecycle state, and structured results.

Primary files:

- `src-tauri/src/control_server.rs`
- `src-tauri/src/spawn_router.rs`
- `src-tauri/src/subagents.rs`
- `src-tauri/src/cli.rs`
- `src-tauri/src/pty.rs`

### Pi integration

- Pi OSC activity reporting and semantic processing/waiting/stopped state.
- Pi tools for spawning and controlling agent/process children.
- Result publication and asynchronous completion notifications.
- Bundled extension version/status/update handling.

Primary files:

- `extensions/pi/termarc-status.ts`
- `src-tauri/src/agent_extensions.rs`
- `src/utils/terminalAgentStatus.ts`
- `src/utils/terminalActivity.ts`

### Terminal families and workspace presentation

- Runtime subagents and persisted shell subterminals associated with a parent terminal.
- Stable xterm roots that can move between the workspace and right sidebar.
- Main-terminal promotion/maximization and family navigation.
- Right-sidebar modes for subterminals and Git changes.
- Parent-close choices to stop children, detach children, or cancel.
- Updated sidebar trees, filtering, selection, numbering, keyboard navigation, and persistence rules.

Primary files:

- `src/App.vue`
- `src/composables/useTerminalTabs.ts`
- `src/utils/terminalFamily.ts`
- `src/terminal/terminalMount.ts`
- `src/utils/projectTreeModel.ts`
- `src/components/sidebar/RightSidebar.vue`
- `src/components/terminal/SubterminalSidebar.vue`
- `src/utils/parentClose.ts`

## Architecture assessment

### Keep

The following design choices improve the codebase and should remain:

1. **Thin API wrappers**
   - `src/api/` contains narrow typed Tauri calls rather than application policy.
   - Spawn coordination lives in `src/services/subagentSpawns.ts` instead of the API layer.

2. **Pure domain helpers with tests**
   - Family, close-plan, tree, shortcut, sidebar-mode, and activity rules are mostly deterministic utilities.
   - This makes behavior testable without xterm, Vue, or Tauri.

3. **Serializable state separated from runtime resources**
   - `TerminalTabState` and `TerminalRuntime` are distinct in `src/types/terminal.ts`.
   - Runtime subagents are deliberately excluded from persisted project/workspace state.

4. **Stable xterm mounting**
   - `src/terminal/terminalMount.ts` isolates DOM relocation and avoids recreating terminal instances when presentation changes.

5. **Transactional backend spawn flow**
   - Reservation, attach, acknowledgement, timeout, and rollback are explicit.
   - Registry callbacks are generally invoked outside locks, reducing deadlock risk.

6. **Generic backend process control with Pi-specific semantics at the edge**
   - Generic lifecycle and output behavior is not tied to Pi.
   - Pi state/result handling is layered on top of the process control mechanism.

7. **Bounded/versioned local protocol**
   - Frame limits, protocol versions, socket permissions, and stale-socket handling provide a good base for future hardening.

### Improve now

#### 1. Correct spawn success semantics

`src/composables/useTerminalTabs.ts` currently treats both an early normal exit and a PTY error as `processExited`, then returns `true` from `startTab()`. `src/services/subagentSpawns.ts` interprets `true` as a successful spawn acknowledgement.

Replace the boolean with an explicit result, for example:

```ts
type TerminalStartResult =
  | { outcome: "running"; session: PtyStarted }
  | { outcome: "exited"; exitCode: number }
  | { outcome: "failed"; error: string }
  | { outcome: "cancelled" };
```

A process that starts and exits quickly may be accepted; a PTY setup/error event must be acknowledged as failure. Add race tests for events arriving before `startTerminal()` resolves.

#### 2. Define and enforce one hierarchy invariant

`src/utils/projectTreeModel.ts` builds and flattens recursive shell descendants, while `src/components/sidebar/SubterminalTreeRows.vue` renders only one level and `src/utils/terminalFamily.ts` resolves only direct children. This can produce items in keyboard order that are not rendered or focusable.

Recommended invariant: **all terminal families are one root plus direct children**, matching the workspace presentation and the existing subagent rule.

- Reject or normalize child-of-child relationships when creating/restoring shell subterminals.
- Promote stale, cyclic, or too-deep children to roots during restoration.
- Make tree building, rendering, family lookup, close behavior, and shortcut ordering consume the same normalized structure.
- If recursive families are a product requirement instead, make rendering, focus registration, presentation, close semantics, and tests recursive together; do not support recursion in only the model.

#### 3. Release completed backend runtime resources

Completed records in `src-tauri/src/subagents.rs` retain output buffers and runtime input/stop handlers. Separate:

- retained status/result/output history; and
- live PTY input/stop ownership.

On exit/error:

- clear input and stop handles;
- close channels so PTY writer tasks/threads can terminate;
- retain only bounded history;
- prune completed records by count and/or TTL;
- keep active records exempt from pruning.

Add cleanup tests that prove handlers and channels are released after exit, error, stop, rollback, and app shutdown.

#### 4. Recover Pi completion watchers

The watcher map in `extensions/pi/termarc-status.ts` is in-memory and is aborted on extension shutdown. A reload/session replacement can therefore lose completion notifications for active children.

- Reconcile active children with `termarc subagents list` during `session_start`.
- Recreate missing watchers idempotently.
- Ensure stopped/completed children do not create duplicate notifications.
- Clear or replace stale pending assistant results so tool-only/empty final messages cannot publish an older response.

#### 5. Restore a clean delivery baseline

The worktree is partially staged, including files with both staged and unstaged versions. Before committing:

- review the combined `HEAD` to worktree diff, not only the index;
- stage coherent vertical slices;
- ensure new tests and Pi extension changes are included with their implementation;
- fix formatting in changed feature files.

Review-time verification:

- Frontend tests: passed (185 tests).
- Frontend build: passed.
- Rust format/check/tests: passed (55 tests).
- Pi extension tests: passed (9 tests).
- `npm run format:check`: failed, including changed feature files and two unrelated existing files.

## Target architecture

### Frontend

#### Application shell

Keep `src/App.vue` responsible for composition only:

- instantiate top-level composables/services;
- connect layout components;
- adapt domain events to UI notifications/dialogs;
- own application mount/unmount.

Move these responsibilities out of `App.vue`:

1. `useTerminalPresentation`
   - main-terminal selection;
   - family switching and promotion;
   - main/sidebar focus routing;
   - fit-after-layout behavior.

2. `useTerminalFamilyClose`
   - obtain the pure close plan;
   - stop or detach children;
   - close the parent;
   - choose the next presented terminal;
   - report failures through injected callbacks.

3. `useRightSidebarController`
   - combine availability, selected mode, open/closed layout state, preview/toggle behavior, and focus movement;
   - reuse `useRightSidebarModes.ts` or absorb it if the standalone abstraction no longer adds value.

Do not move code merely to reduce line count. Each extracted module must own a stable workflow and have focused tests.

#### Terminal runtime facade

Keep `useTerminalTabs.ts` as the public terminal-tab facade, but extract internal responsibilities when touched:

- PTY start/stop lifecycle and typed start outcomes;
- xterm presentation/mounting;
- activity/OSC event handling;
- restart policy.

Store a complete `TerminalMount` on `TerminalRuntime` rather than reconstructing a temporary object around `mountElement`. Use both mount and unmount operations through the same owner and test rapid target replacement/unmount races.

#### Tree and row reuse

Create one normalized display model that supplies:

- visible terminal-like nodes;
- parent/child relationships;
- aggregate active/total counts;
- flattened focus/shortcut order;
- stable selection IDs.

Then:

- extract a reusable subagent-row list/node from the three repeated blocks in `ProjectTree.vue`;
- register every visible terminal row with the same focus mechanism;
- reuse `TerminalLikeTreeRow.vue` for child/detached terminal presentation;
- keep root-only sorting behavior in a small wrapper rather than duplicating row content;
- move active/total count calculations out of the template and into the display model.

Remove production-unused domain types/helpers only after confirming they are not the intended canonical model. In particular, reconcile `src/types/subagent.ts` and `src/utils/subagents.ts` with the backend/API representation rather than maintaining parallel models.

### Backend

Split modules by responsibility while preserving current behavior:

```text
src-tauri/src/control/
  protocol.rs        request/response types, versions, limits
  client.rs          CLI-side request transport
  server.rs          socket lifecycle and connection handling
  dispatch.rs        request-to-service routing

src-tauri/src/subagents/
  model.rs           IDs, lifecycle, process kind, status/result DTOs
  registry.rs        state transitions, waits, parent association
  output.rs          bounded raw/plain output and cursors
  runtime.rs         optional live PTY input/stop handles and cleanup
```

Additional rules:

- Replace free-form process-kind comparisons with a serialized `ProcessKind` enum that supports an explicit unknown/custom variant if extensibility is required.
- Prefer typed protocol request/response structures over repeated `serde_json::Value` construction.
- Keep socket transport independent from registry policy.
- Bound concurrent socket work with async tasks, a semaphore, or a fixed worker pool; long waits must not create unlimited OS threads.
- Keep PTY session management in `pty.rs`; expose lifecycle events through a narrow registry interface.

### Pi extension

Split `extensions/pi/termarc-status.ts` into cohesive modules:

```text
extensions/pi/
  termarc-status.ts          extension entry point and tool registration
  termarc-environment.ts     eligibility and executable resolution
  termarc-cli.ts             typed CLI invocation/parsing
  termarc-watchers.ts        child reconciliation and completion watching
  termarc-results.ts         assistant result capture/publication
  termarc-osc.ts             OSC status emission
```

Keep protocol command names and response fixtures synchronized with Rust using contract fixtures/tests. Avoid duplicating timeout and lifecycle interpretation across the extension, CLI client, and server.

## Phased execution plan

### Phase 0 — Stabilize correctness and repository state

1. Introduce typed terminal-start outcomes and fix spawn acknowledgement semantics.
2. Choose and enforce the terminal-family depth invariant.
3. Release live backend handles on completion and add record pruning.
4. Rebuild Pi watchers on session start and fix stale result capture.
5. Fix changed-file formatting and stage a coherent implementation.

Exit criteria:

- all frontend, extension, and Rust tests pass;
- build and format checks pass or unrelated baseline failures are explicitly isolated;
- no invisible-but-keyboard-selectable terminal descendants;
- PTY setup errors cannot be acknowledged as successful spawns;
- completed processes release live runtime ownership.

### Phase 1 — Consolidate frontend domain and presentation

1. Normalize terminal-family and project-tree data through one model.
2. Consolidate repeated subagent/terminal-like rows and focus registration.
3. Extract terminal presentation and family-close workflows from `App.vue`.
4. Make `TerminalMount` authoritative in runtime state.
5. Remove superseded helpers/types after callers migrate.

Exit criteria:

- tree rendering, filtering, focus order, and shortcut numbering use one source of truth;
- `App.vue` composes workflows instead of implementing them;
- terminal movement is covered by Vue lifecycle tests, not only fake-DOM utility tests.

### Phase 2 — Clarify backend ownership and protocol boundaries

1. Split control protocol/client/server/dispatch responsibilities.
2. Split subagent model/registry/output/runtime responsibilities.
3. Add typed process kinds and typed protocol payloads.
4. Bound server concurrency.
5. Add retention/cleanup configuration and observability for active/completed records.

Exit criteria:

- transport code does not mutate registry internals directly;
- completed records have a documented bounded retention policy;
- connection load cannot create unbounded waiting threads;
- protocol behavior is covered independently from socket transport.

### Phase 3 — Modularize and harden Pi integration

1. Extract CLI, watcher, result, environment, and OSC modules.
2. Reconcile watchers after reload/new/resume/fork session transitions.
3. Add shared protocol fixtures and malformed/older-version cases.
4. Verify structured-output modes remain free of OSC corruption.

Exit criteria:

- active child completion survives extension/session reload;
- one completion produces one parent notification;
- intermediate or stale assistant text cannot become the final child result.

### Phase 4 — Add integration coverage

Automate the highest-risk seams:

1. CLI client → Unix socket → dispatch → registry.
2. Spawn request → frontend event → PTY start → acknowledgement/rollback.
3. Controlled real child process → output cursor → input → result → exit/stop cleanup.
4. Mounted Vue components for right-sidebar modes, row focus/actions, parent-close dialog, and terminal relocation.
5. Persistence restoration with stale, cyclic, and too-deep shell-parent data.

Retain a macOS/Tauri smoke matrix for:

- one and multiple Pi children;
- wait/result/output/send/stop;
- stop/detach/cancel parent close choices;
- external explicit parent and invalid parents;
- right-sidebar Git/subterminal mode combinations;
- keyboard focus across left sidebar, workspace, and right sidebar;
- app and extension restart behavior.

## Reuse and maintainability rules for follow-up work

- Add policy to services/composables, not `api/` wrappers.
- Add deterministic rules to `utils/` with tests before wiring UI behavior.
- Keep runtime-only xterm, DOM, channel, and process handles out of serializable state.
- Reuse one terminal-family/tree model for rendering, focus, shortcuts, persistence validation, and close behavior.
- Prefer focused workflow extraction over generic helpers with only one unclear caller.
- Do not introduce a second frontend subagent lifecycle model unless it is the authoritative representation consumed by the UI.
- Keep generic process control independent from Pi; isolate Pi semantics in adapters.
- Require bounded resources: message sizes, output buffers, active waits, connection concurrency, runtime records, and retained history.
- Add integration tests at asynchronous ownership boundaries; pure unit tests alone are insufficient for spawn/PTY/UI races.

## Recommended delivery order

Complete Phase 0 before merging the feature. Phases 1 and 2 can then proceed as separate frontend and backend refactors, provided each preserves protocol and user-visible behavior. Complete Phase 3 before relying on subagent completion notifications as a durable workflow, and add Phase 4 tests alongside each refactor rather than postponing all integration coverage to the end.
