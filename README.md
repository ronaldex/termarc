# Termarc

A native terminal workspace built with:

- Tauri 2
- Vue 3
- xterm.js 6 with its WebGL2 renderer
- `portable-pty` in Rust

The Rust backend owns each shell process and PTY. The frontend supports multiple independent terminal tabs, receives their byte chunks over raw binary Tauri channels, and writes them directly to the matching xterm.js instance.

## Requirements

- Node.js 20+
- Rust
- Tauri's platform prerequisites

On macOS, Xcode Command Line Tools are sufficient.

## Run

```sh
npm install
npm run tauri dev
```

## Build

```sh
npm run tauri build
```

On macOS, the application bundle is written to
`src-tauri/target/release/bundle/macos/Termarc.app`.

To build only the web frontend, run `npm run build`.

## CLI

Termarc's app executable also provides a lightweight macOS CLI for launching
the app and managing the local project registry. Add a symlink from **App
settings**, or install it into `~/.local/bin` (or set `TERMARC_BIN_DIR`):

```sh
npm run cli:install
```

This symlinks the executable inside `/Applications/Termarc.app` as `termarc`.
Add that directory to your `PATH`, then use:

```sh
termarc --help
termarc launch
termarc projects list
termarc projects create "Termarc" ~/Development/termarc
```

Use `--json` with list/status commands for machine-readable output.

### Subagent history retention

The local control service releases live PTY input/stop ownership immediately
when a subagent completes, while retaining bounded status, result, and output
history. Active records are never pruned. Completed history defaults to 64
records for 24 hours and can be configured before launching Termarc:

- `TERMARC_SUBAGENT_COMPLETED_LIMIT` (maximum 10000)
- `TERMARC_SUBAGENT_COMPLETED_TTL_SECONDS` (maximum 2592000)

`termarc --json subagents` reports active/completed/pending counts and the
effective retention policy in its additive `subagents` field. Each retained
record keeps at most 1 MiB per raw/plain output format.

### Pi subagent completion delivery

The Pi extension persists each parent completion as `pending`, queues the stable
completion key as a Pi follow-up message, and then persists `delivered`. Pending
entries are retried during session reload/reconciliation; delivered entries and
process-local ownership claims suppress duplicate delivery. Session shutdown
cancels the old generation and awaits its list, watcher, persistence, and
delivery tasks, so an old session cannot deliver after its replacement starts.
Only subagents durably tracked by the active Pi session are eligible.

Pi's extension API exposes separate `appendEntry()` and `sendMessage()` calls; it
has no transaction spanning them and `sendMessage()` accepts no idempotency key.
Consequently a process crash after Pi accepts the follow-up but before the
`delivered` append reaches the session file can replay that one completion after
restart. The pending-before-send ordering prevents loss, and all non-crash
shutdown/reload paths are reconciled and deduplicated, but this narrow
process-crash duplicate window cannot be made atomic with the available Pi API.

## Custom themes

Create `~/.config/termarc/themes` and copy [theme.json](examples/theme.json) into that
directory. Its lowercase filename (for example, `my-theme.json`) becomes the theme ID. Edit
the `label`, `colorScheme` (`light` or `dark`), and color tokens;
every token is required. The surface colors progress from `surface-base` through
`surface-raised`, `surface-active`, and `surface-emphasis` to distinguish nested and
interactive UI layers. Restart Termarc after saving the file, then select the theme in
**App settings**. Invalid theme files are ignored, and custom theme IDs cannot replace the
built-in themes.

## Testing and formatting

```sh
npm test
npm run build
npm run format:check
npm run format
```

Native macOS/Tauri, PTY, notification, and Pi restart scenarios that cannot run reliably in
headless CI are tracked in [the manual smoke matrix](docs/MACOS_TAURI_SMOKE_MATRIX.md).

## Architecture

```text
shell process ↔ portable-pty ↔ Rust commands/channel ↔ xterm.js ↔ WebGL2
```

PTY input is sent through Tauri commands. Output is streamed through a raw binary Tauri channel. `ResizeObserver` and `FitAddon` keep the kernel PTY size synchronized with the visible terminal grid.

Use the sidebar `+` button to open another terminal and `×` to close one. The
keyboard shortcuts are `Cmd+T` / `Cmd+W` on macOS and `Ctrl+Shift+T` /
`Ctrl+Shift+W` elsewhere. The toolbar buttons can collapse either sidebar.

The Git changes sidebar refreshes every two seconds and displays `git diff HEAD`
for the active terminal shell's current working directory with the
`@git-diff-view/vue` unified diff renderer. On macOS and Linux,
Termarc resolves that directory from the shell process; other platforms fall
back to Termarc's launch directory.

The frontend includes a focused xterm.js 6.0 compatibility shim that encodes
`Shift+Enter` as Kitty keyboard sequence `CSI 13;2u`, allowing Pi to distinguish
it from plain Enter. This can be removed once Kitty keyboard support reaches a
stable xterm.js release.
