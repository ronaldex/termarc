use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    io::Write,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    thread,
};
use tauri::{
    State,
    ipc::{Channel, Response},
};

use crate::paths::expand_user_path;

mod process_status;

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
    pid: Option<u32>,
}

#[derive(Default)]
pub(crate) struct AppState {
    next_id: AtomicU64,
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}

impl AppState {
    pub(crate) fn stop_all(&self) {
        let Ok(mut sessions) = self.sessions.lock() else {
            return;
        };

        for session in sessions.values_mut() {
            let _ = session.killer.kill();
        }
    }
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum PtyLaunch {
    Shell,
    Command { command: String },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StartPtyRequest {
    rows: u16,
    cols: u16,
    #[serde(default)]
    cwd: Option<String>,
    launch: PtyLaunch,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PtyStarted {
    id: String,
    pid: Option<u32>,
    shell: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PtyStatus {
    process_name: Option<String>,
    agent: Option<String>,
    cwd: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PtyEvent {
    event: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    exit_code: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

impl PtyEvent {
    fn exit(exit_code: u32) -> Self {
        Self {
            event: "exit",
            exit_code: Some(exit_code),
            message: None,
        }
    }

    fn error(message: impl Into<String>) -> Self {
        Self {
            event: "error",
            exit_code: None,
            message: Some(message.into()),
        }
    }
}

#[tauri::command]
pub(crate) fn start_pty(
    request: StartPtyRequest,
    on_output: Channel<Response>,
    on_event: Channel<PtyEvent>,
    state: State<'_, AppState>,
) -> Result<PtyStarted, String> {
    let rows = request.rows.clamp(1, 1_000);
    let cols = request.cols.clamp(1, 1_000);
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("could not create PTY: {error}"))?;

    if matches!(&request.launch, PtyLaunch::Command { command } if command.trim().is_empty()) {
        return Err("command must not be empty".to_string());
    }

    let shell = default_shell();
    let id = format!("pty-{}", state.next_id.fetch_add(1, Ordering::Relaxed) + 1);
    let mut process = CommandBuilder::new(&shell);

    match &request.launch {
        PtyLaunch::Command { command } => configure_fixed_command(&mut process, &shell, command),
        PtyLaunch::Shell => {
            // Start the user's shell without proxy startup files or shell hooks.
            // This preserves its native init sequence, ZDOTDIR, and history behavior.
            #[cfg(not(windows))]
            process.arg("-l");
        }
    }

    if let Some(cwd) = request.cwd.as_deref() {
        process.cwd(expand_user_path(cwd));
    }
    process.env("TERM", "xterm-256color");
    process.env("COLORTERM", "truecolor");
    process.env("TERM_PROGRAM", "Termdeck");

    let mut child = pair
        .slave
        .spawn_command(process)
        .map_err(|error| format!("could not start {shell}: {error}"))?;
    let pid = child.process_id();
    let killer = child.clone_killer();
    drop(pair.slave);

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| format!("could not open PTY reader: {error}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| format!("could not open PTY writer: {error}"))?;

    state
        .sessions
        .lock()
        .map_err(|_| "PTY session state is poisoned".to_string())?
        .insert(
            id.clone(),
            PtySession {
                master: pair.master,
                writer,
                killer,
                pid,
            },
        );

    thread::spawn(move || {
        let mut buffer = vec![0_u8; 16 * 1024];
        loop {
            match std::io::Read::read(&mut reader, &mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    if on_output
                        .send(Response::new(buffer[..count].to_vec()))
                        .is_err()
                    {
                        break;
                    }
                }
                // Unix PTYs commonly report EIO when the slave closes. The child
                // waiter below sends the authoritative exit event.
                Err(_) => break,
            }
        }
    });

    let session_id = id.clone();
    let sessions = Arc::clone(&state.sessions);
    thread::spawn(move || match child.wait() {
        Ok(status) => {
            remove_session(&sessions, &session_id);
            let _ = on_event.send(PtyEvent::exit(status.exit_code()));
        }
        Err(error) => {
            remove_session(&sessions, &session_id);
            let _ = on_event.send(PtyEvent::error(format!(
                "could not wait for shell: {error}"
            )));
        }
    });

    Ok(PtyStarted { id, pid, shell })
}

#[tauri::command]
pub(crate) fn write_to_pty(
    id: String,
    data: Vec<u8>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    const MAX_INPUT_BYTES: usize = 1024 * 1024;
    if data.len() > MAX_INPUT_BYTES {
        return Err(format!("PTY input exceeds {MAX_INPUT_BYTES} bytes"));
    }

    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "PTY session state is poisoned".to_string())?;
    let session = sessions
        .get_mut(&id)
        .ok_or_else(|| format!("unknown PTY session: {id}"))?;

    session
        .writer
        .write_all(&data)
        .and_then(|_| session.writer.flush())
        .map_err(|error| format!("could not write to PTY: {error}"))
}

#[tauri::command]
pub(crate) fn resize_pty(
    id: String,
    rows: u16,
    cols: u16,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| "PTY session state is poisoned".to_string())?;
    let session = sessions
        .get(&id)
        .ok_or_else(|| format!("unknown PTY session: {id}"))?;

    session
        .master
        .resize(PtySize {
            rows: rows.clamp(1, 1_000),
            cols: cols.clamp(1, 1_000),
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("could not resize PTY: {error}"))
}

#[tauri::command]
pub(crate) async fn get_pty_status(
    id: String,
    state: State<'_, AppState>,
) -> Result<PtyStatus, String> {
    let mut statuses = get_pty_statuses(vec![id.clone()], state).await?;
    statuses
        .remove(&id)
        .ok_or_else(|| format!("unknown PTY session: {id}"))
}

#[tauri::command]
pub(crate) async fn get_pty_statuses(
    ids: Vec<String>,
    state: State<'_, AppState>,
) -> Result<HashMap<String, PtyStatus>, String> {
    let requested = {
        let sessions = state
            .sessions
            .lock()
            .map_err(|_| "PTY session state is poisoned".to_string())?;
        // Sessions can close while a frontend status refresh is in flight. Skip
        // stale ids so one closed terminal does not discard the whole batch.
        ids.into_iter()
            .filter_map(|id| sessions.get(&id).map(|session| (id, session.pid)))
            .collect::<Vec<_>>()
    };

    tauri::async_runtime::spawn_blocking(move || process_status::inspect(&requested))
        .await
        .map_err(|error| format!("could not inspect PTY processes: {error}"))
}

#[tauri::command]
pub(crate) fn stop_pty(id: String, state: State<'_, AppState>) -> Result<(), String> {
    let mut sessions = state
        .sessions
        .lock()
        .map_err(|_| "PTY session state is poisoned".to_string())?;
    let Some(session) = sessions.get_mut(&id) else {
        return Ok(());
    };

    session
        .killer
        .kill()
        .map_err(|error| format!("could not stop PTY: {error}"))
}

#[cfg(not(windows))]
fn configure_fixed_command(process: &mut CommandBuilder, _shell: &str, command: &str) {
    process.arg("-lc");
    process.arg(command);
}

#[cfg(windows)]
fn configure_fixed_command(process: &mut CommandBuilder, shell: &str, command: &str) {
    let shell_name = std::path::Path::new(shell)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(shell)
        .to_ascii_lowercase();
    if shell_name == "cmd" || shell_name == "cmd.exe" {
        process.args(["/D", "/S", "/C", command]);
    } else {
        process.args(["-NoLogo", "-Command", command]);
    }
}

fn remove_session(sessions: &Arc<Mutex<HashMap<String, PtySession>>>, session_id: &str) {
    if let Ok(mut sessions) = sessions.lock() {
        sessions.remove(session_id);
    }
}

#[cfg(windows)]
fn default_shell() -> String {
    std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".to_string())
}

#[cfg(not(windows))]
fn default_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
}
