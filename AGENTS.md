# Termarc

Termarc is a macOS-focused terminal workspace built with Vue 3, TypeScript, Vite, Tauri 2, Rust, and xterm.js.

## Project structure

### Frontend (`src/`)

- `api/`: narrow, typed wrappers around Tauri commands and plugins. Keep application policy out of this layer.
- `services/`: reusable application workflows that coordinate APIs, platform behavior, and events.
- `composables/`: Vue state and lifecycle orchestration. Keep composables focused and use them as facades over smaller domain modules.
- `components/`: reusable Vue UI. Prefer focused presentational components over large feature templates.
- `terminal/`: xterm-specific construction, rendering, links, and other terminal runtime helpers.
- `utils/`: pure domain transformations, parsers, reducers, and display models. Add unit tests alongside non-trivial utilities.
- `types/`: shared frontend domain and runtime types. Keep serializable state separate from runtime-only resources where practical.

Key terminal modules:

- `src/composables/useTerminalTabs.ts`: public terminal-tab orchestration facade.
- `src/terminal/createTerminal.ts`: xterm construction and font preparation.
- `src/terminal/terminalLinks.ts`: terminal URL, path, and OSC 8 link handling.
- `src/utils/terminalActivity.ts`: deterministic process and agent activity transitions.
- `src/services/agentNotifications.ts`: notification policy and click routing.

### Backend (`src-tauri/`)

- `src/`: Rust commands and backend modules.
- `src/pty.rs`: PTY session lifecycle and command entry points.
- `src/pty/process_status.rs`: batched process inspection and activity detection.
- `src/notifications.rs`: native notification delivery and click handling.
- `capabilities/`: explicit Tauri permissions. Add only capabilities required by the frontend.
- `tauri.conf.json`: application and bundle configuration.

### Integrations

- `extensions/pi/`: Pi agent integration and the Termarc OSC status protocol.

## Commands

- `npm run tauri dev`: run the desktop app in development.
- `npm run build`: type-check and build the frontend.
- `npm test`: run frontend tests.
- `npm run format:check`: check frontend formatting.
- `cd src-tauri && cargo check`: check the Rust backend.
- `cd src-tauri && cargo fmt --check`: check Rust formatting.
- `cd src-tauri && cargo test`: run Rust tests.

## Architecture and reuse guidelines

- Design new functionality as reusable domain logic, services, and focused components rather than adding it directly to large views or composables.
- Keep components small and cohesive. Extract repeated status indicators, rows, controls, and display behavior instead of duplicating templates or scoped CSS.
- Keep `useTerminalTabs.ts` as an orchestration facade; move terminal rendering, links, activity, shortcuts, and platform integrations into dedicated modules.
- Keep pure business rules in `utils/` and cover them with unit tests. Prefer reducers and typed display models over scattered conditional mutations.
- Separate serializable UI/domain state from xterm, DOM, Tauri, timers, and other runtime resources.
- Keep `api/` wrappers narrow. Put permission flows, fallbacks, event routing, and cross-API workflows in `services/` or focused composables.
- Batch backend work when operating on multiple terminals; avoid running full process or filesystem scans once per tab.
- Split Rust modules by responsibility. Keep PTY session management separate from process inspection and notification behavior.
- Reuse existing types, components, styles, and helpers before introducing parallel implementations.
- Avoid premature generic abstractions: extract code when it represents a stable responsibility or is reused, not merely to reduce line count.

## General guidelines

- Keep frontend filesystem access behind narrow Tauri commands.
- Register new commands in `src-tauri/src/lib.rs` and add only required capabilities.
- Do not hand-edit generated Tauri schema files.
- Preserve unrelated working-tree changes.
- Run the relevant frontend and Rust checks after structural changes.
