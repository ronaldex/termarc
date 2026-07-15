use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    io::Write,
    path::PathBuf,
    process::Command,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    thread,
};
mod plugins;
use plugins::mac_rounded_corners;

use tauri::{
    Manager, State, WindowEvent,
    ipc::{Channel, Response},
};

struct PtySession {
    pid: Option<u32>,
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    killer: Box<dyn ChildKiller + Send + Sync>,
}

#[derive(Default)]
struct AppState {
    next_id: AtomicU64,
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
}

impl AppState {
    fn stop_all(&self) {
        let Ok(mut sessions) = self.sessions.lock() else {
            return;
        };

        for session in sessions.values_mut() {
            let _ = session.killer.kill();
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct StartPtyRequest {
    rows: u16,
    cols: u16,
    #[serde(default)]
    cwd: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PtyStarted {
    id: String,
    pid: Option<u32>,
    shell: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PtyEvent {
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
fn start_pty(
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

    let shell = default_shell();
    let mut command = CommandBuilder::new(&shell);

    #[cfg(not(windows))]
    command.arg("-l");

    if let Some(cwd) = request.cwd.as_deref() {
        // A shell expands `~`, but CommandBuilder receives the path directly.
        // Expand it here so project directories such as `~/Development/foo` work.
        let expanded = if cwd == "~" {
            std::env::var_os("HOME")
                .map(PathBuf::from)
                .unwrap_or_else(|| PathBuf::from(cwd))
        } else if let Some(rest) = cwd.strip_prefix("~/") {
            std::env::var_os("HOME")
                .map(|home| PathBuf::from(home).join(rest))
                .unwrap_or_else(|| PathBuf::from(cwd))
        } else {
            PathBuf::from(cwd)
        };
        command.cwd(expanded);
    }
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
    command.env("TERM_PROGRAM", "Termdeck");

    let mut child = pair
        .slave
        .spawn_command(command)
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

    let id = format!("pty-{}", state.next_id.fetch_add(1, Ordering::Relaxed) + 1);

    state
        .sessions
        .lock()
        .map_err(|_| "PTY session state is poisoned".to_string())?
        .insert(
            id.clone(),
            PtySession {
                pid,
                master: pair.master,
                writer,
                killer,
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
            if let Ok(mut sessions) = sessions.lock() {
                sessions.remove(&session_id);
            }
            let _ = on_event.send(PtyEvent::exit(status.exit_code()));
        }
        Err(error) => {
            if let Ok(mut sessions) = sessions.lock() {
                sessions.remove(&session_id);
            }
            let _ = on_event.send(PtyEvent::error(format!(
                "could not wait for shell: {error}"
            )));
        }
    });

    Ok(PtyStarted { id, pid, shell })
}

#[tauri::command]
fn write_to_pty(id: String, data: Vec<u8>, state: State<'_, AppState>) -> Result<(), String> {
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
fn resize_pty(id: String, rows: u16, cols: u16, state: State<'_, AppState>) -> Result<(), String> {
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

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitDiff {
    directory: String,
    repository: Option<String>,
    diff: String,
    error: Option<String>,
}

#[tauri::command]
fn get_git_diff_directory(directory: String) -> Result<GitDiff, String> {
    // Git is launched directly rather than through a shell, so expand the
    // user-relative path stored in project configuration first.
    let expanded = expand_user_path(&directory);
    let directory_text = expanded.display().to_string();
    let repository = Command::new("git")
        .args(["-C", &directory_text, "rev-parse", "--show-toplevel"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string());
    let Some(repository) = repository else {
        return Ok(GitDiff {
            directory: directory_text,
            repository: None,
            diff: String::new(),
            error: None,
        });
    };
    let has_head = Command::new("git")
        .args(["-C", &directory_text, "rev-parse", "--verify", "HEAD"])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if !has_head {
        return Ok(GitDiff {
            directory: directory_text,
            repository: None,
            diff: String::new(),
            error: None,
        });
    }
    let output = Command::new("git")
        .args([
            "-C",
            &directory_text,
            "diff",
            "--no-ext-diff",
            "--no-color",
            "HEAD",
            "--",
        ])
        .output()
        .map_err(|e| format!("could not run git diff: {e}"))?;
    let mut diff = String::from_utf8_lossy(&output.stdout).into_owned();
    if diff.len() > 1_000_000 {
        diff.truncate(1_000_000);
        diff.push_str("\n\n[Diff truncated at 1 MB]\n");
    }
    Ok(GitDiff {
        directory: directory_text,
        repository: Some(repository),
        diff,
        error: (!output.status.success())
            .then(|| String::from_utf8_lossy(&output.stderr).trim().to_string()),
    })
}

#[tauri::command]
fn get_git_diff(id: String, state: State<'_, AppState>) -> Result<GitDiff, String> {
    let sessions = state
        .sessions
        .lock()
        .map_err(|_| "PTY session state is poisoned".to_string())?;
    let pid = sessions
        .get(&id)
        .ok_or_else(|| format!("unknown PTY session: {id}"))?
        .pid;
    let directory = terminal_working_directory(pid);
    let directory_text = directory.display().to_string();

    let repository = Command::new("git")
        .args(["-C", &directory_text, "rev-parse", "--show-toplevel"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| String::from_utf8_lossy(&output.stdout).trim().to_string());

    let Some(repository) = repository else {
        return Ok(GitDiff {
            directory: directory_text,
            repository: None,
            diff: String::new(),
            error: None,
        });
    };

    let output = Command::new("git")
        .args([
            "-C",
            &directory_text,
            "diff",
            "--no-ext-diff",
            "--no-color",
            "HEAD",
            "--",
        ])
        .output()
        .map_err(|error| format!("could not run git diff: {error}"))?;
    let mut diff = String::from_utf8_lossy(&output.stdout).into_owned();
    const MAX_DIFF_BYTES: usize = 1_000_000;
    if diff.len() > MAX_DIFF_BYTES {
        diff.truncate(MAX_DIFF_BYTES);
        diff.push_str("\n\n[Diff truncated at 1 MB]\n");
    }

    Ok(GitDiff {
        directory: directory_text,
        repository: Some(repository),
        diff,
        error: (!output.status.success())
            .then(|| String::from_utf8_lossy(&output.stderr).trim().to_string()),
    })
}

#[cfg(target_os = "linux")]
fn terminal_working_directory(pid: Option<u32>) -> PathBuf {
    pid.and_then(|pid| std::fs::read_link(format!("/proc/{pid}/cwd")).ok())
        .unwrap_or_else(current_working_directory)
}

#[cfg(target_os = "macos")]
fn terminal_working_directory(pid: Option<u32>) -> PathBuf {
    let Some(pid) = pid else {
        return current_working_directory();
    };
    Command::new("lsof")
        .args(["-a", "-p", &pid.to_string(), "-d", "cwd", "-Fn"])
        .output()
        .ok()
        .and_then(|output| String::from_utf8(output.stdout).ok())
        .and_then(|output| {
            output
                .lines()
                .find_map(|line| line.strip_prefix('n').map(PathBuf::from))
        })
        .unwrap_or_else(current_working_directory)
}

#[cfg(not(any(target_os = "linux", target_os = "macos")))]
fn terminal_working_directory(_pid: Option<u32>) -> PathBuf {
    current_working_directory()
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectConfig {
    id: String,
    name: String,
    directory: String,
    terminal_open: bool,
    commands_open: bool,
}

fn projects_path() -> PathBuf {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".config")
        .join("termdeck")
        .join("projects.json")
}

#[tauri::command]
fn load_projects() -> Result<Vec<ProjectConfig>, String> {
    let path = projects_path();
    if !path.exists() {
        return Ok(Vec::new());
    }
    serde_json::from_str(&std::fs::read_to_string(path).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn save_projects(projects: Vec<ProjectConfig>) -> Result<(), String> {
    let path = projects_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(
        path,
        serde_json::to_string_pretty(&projects).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

fn expand_user_path(path: &str) -> PathBuf {
    if path == "~" {
        std::env::var_os("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(path))
    } else if let Some(rest) = path.strip_prefix("~/") {
        std::env::var_os("HOME")
            .map(|home| PathBuf::from(home).join(rest))
            .unwrap_or_else(|| PathBuf::from(path))
    } else {
        PathBuf::from(path)
    }
}

fn current_working_directory() -> PathBuf {
    std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

#[tauri::command]
fn stop_pty(id: String, state: State<'_, AppState>) -> Result<(), String> {
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

#[cfg(windows)]
fn default_shell() -> String {
    std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".to_string())
}

#[cfg(not(windows))]
fn default_shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            start_pty,
            load_projects,
            save_projects,
            write_to_pty,
            resize_pty,
            get_git_diff,
            get_git_diff_directory,
            stop_pty,
            mac_rounded_corners::enable_rounded_corners,
            mac_rounded_corners::enable_modern_window_style,
            mac_rounded_corners::reposition_traffic_lights
        ])
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::Destroyed) {
                window.state::<AppState>().stop_all();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Termdeck");
}
