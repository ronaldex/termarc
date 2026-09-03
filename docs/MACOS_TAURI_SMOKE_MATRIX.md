# macOS/Tauri manual smoke matrix

Automated Phase 4 coverage now crosses the real CLI parser/client/Unix socket/server/dispatcher/registry boundary, uses `pty.rs` with native PTY allocation for child I/O/output/result/lifecycle cleanup, mounts the real project tree/right sidebar/subterminal components, round-trips project persistence through the API loading boundary, and exercises overlapping Pi watcher ledgers. This matrix is limited to behavior that still requires the signed Tauri application, native windows/xterm rendering, macOS integration, or a separately installed Pi executable.

## Setup

1. Run `npm run tauri dev` on macOS with Pi and the bundled Termarc extension available.
2. Create two projects with different directories; make one a Git repository with staged and unstaged changes.
3. Keep Console and the terminal visible. For CLI cases, use the exact executable from `TERMARC_CLI`/App settings and verify `TERMARC_CONTROL_SOCKET` points at this app instance.

Record macOS version, architecture, Termarc version, Pi version, pass/fail, and diagnostics for every row.

| Native boundary             | Scenario                                                                                                                        | Expected result                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Installed Pi/Tauri spawn    | Spawn several real Pi and generic children concurrently from the packaged app                                                   | Each request owns one native PTY/xterm and sidebar row; Pi processing/waiting and structured results follow the installed Pi runtime.                        |
| Multi-window routing        | Spawn with an explicit top-level parent in another native window/project, including closing that window during acknowledgement  | The request routes to the owning window or rolls back cleanly; no orphan native process/window remains.                                                      |
| Native parent close         | Exercise cancel, detach, and stop while real children exit concurrently                                                         | The dialog and native PTYs resolve once; detached children remain usable and stopped children leave no process or stale surface.                             |
| xterm focus/rendering       | Keyboard between the left tree, workspace xterm, right-sidebar xterm, Git controls, then rapidly maximize/move/resize terminals | Focus/input reaches only the visible PTY; WebGL/canvas state, selection, scrollback, and process survive DOM relocation without duplicate/blank surfaces.    |
| App restart/shutdown        | Quit/relaunch during spawn acknowledgement, long wait, heavy PTY output, and stop                                               | Native children terminate, windows close promptly, the socket is removed, persisted shell families normalize on reload, and no stale process/socket remains. |
| Real Pi extension lifecycle | Reload, `/new`, `/resume`, `/fork`, and tree-switch a real Pi session while children complete                                   | Watchers reconcile across actual Pi session managers; overlapping transitions do not lose tracked/notified state or duplicate a follow-up/result.            |
| macOS notification          | Complete a child while the app is unfocused, then click its native notification                                                 | Notification content is current and clicking activates the owning native window and terminal.                                                                |

## Evidence to retain

For failures, retain the CLI JSON response, Termarc/Pi logs, relevant child IDs, a screenshot of both sidebars, and whether retrying after app restart changes the result. Native notification delivery/click routing, signed-app window ownership, installed-Pi lifecycle hooks, xterm renderer preservation, PTY resize/signal behavior, and OS-level process cleanup remain manual.
