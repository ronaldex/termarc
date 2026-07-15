# Termdeck

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
`src-tauri/target/release/bundle/macos/Termdeck.app`.

To build only the web frontend, run `npm run build`.

## Formatting

```sh
npm run format:check
npm run format
```

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
Termdeck resolves that directory from the shell process; other platforms fall
back to Termdeck's launch directory.

The frontend includes a focused xterm.js 6.0 compatibility shim that encodes
`Shift+Enter` as Kitty keyboard sequence `CSI 13;2u`, allowing Pi to distinguish
it from plain Enter. This can be removed once Kitty keyboard support reaches a
stable xterm.js release.

## Roadmap

- explicit backpressure and output batching for many simultaneous PTYs
- process-group/job-object cleanup
- bounded backend log storage
- session persistence
- command trust and validation
- integration tests on macOS, Windows, X11, and Wayland
