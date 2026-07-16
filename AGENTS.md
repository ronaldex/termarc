# Termdeck

Termdeck is a macOS-focused terminal workspace built with Vue 3, TypeScript, Vite, Tauri 2, Rust, and xterm.js.

## Project layout

- `src/`: Vue frontend, composables, components, and Tauri API wrappers.
- `src-tauri/`: Rust backend, Tauri commands, capabilities, and application configuration.
- `src-tauri/src/pty.rs`: terminal process management.
- `src/composables/useTerminalTabs.ts`: terminal tabs, input, rendering, and links.

## Commands

- `npm run tauri dev`: run the desktop app in development.
- `npm run build`: type-check and build the frontend.
- `npm test`: run frontend tests.
- `npm run format:check`: check frontend formatting.
- `cd src-tauri && cargo check`: check the Rust backend.
- `cd src-tauri && cargo fmt --check`: check Rust formatting.

## Guidelines

- Keep frontend filesystem access behind narrow Tauri commands.
- Register new commands in `src-tauri/src/lib.rs` and add only required capabilities.
- Do not hand-edit generated Tauri schema files.
- Preserve unrelated working-tree changes.
