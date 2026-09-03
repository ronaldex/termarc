use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    io::Write,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{Receiver, SyncSender, sync_channel},
    },
    thread::{self, JoinHandle},
    time::{Duration, Instant},
};
use tauri::{
    State, Window,
    ipc::{Channel, Response},
};

use crate::{
    paths::expand_user_path,
    subagents::{AttachSubagent, SubagentPtyOwner, SubagentRegistry},
};

mod process_status;

const PTY_INPUT_QUEUE_CAPACITY: usize = 64;

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    input: SyncSender<Vec<u8>>,
    killer: Arc<Mutex<Box<dyn ChildKiller + Send + Sync>>>,
    pid: Option<u32>,
    window_label: String,
    subagent_id: Option<String>,
}

#[derive(Default)]
pub(crate) struct AppState {
    next_id: AtomicU64,
    sessions: Arc<Mutex<HashMap<String, PtySession>>>,
    subagents: SubagentRegistry,
}

impl AppState {
    pub(crate) fn subagents(&self) -> SubagentRegistry {
        self.subagents.clone()
    }

    pub(crate) fn stop_for_window(&self, window_label: &str) {
        let targets = {
            let Ok(sessions) = self.sessions.lock() else {
                return;
            };
            sessions
                .iter()
                .filter(|(_, session)| session.window_label == window_label)
                .map(|(id, session)| {
                    (
                        id.clone(),
                        session.subagent_id.clone(),
                        Arc::clone(&session.killer),
                    )
                })
                .collect::<Vec<_>>()
        };

        // Child termination and registry callbacks must not run while the
        // session map is locked; the child waiter removes from that map.
        for (session_id, subagent_id, killer) in targets {
            if let Some(subagent_id) = subagent_id {
                let _ = self.subagents.stop(&subagent_id);
            } else {
                kill_child(&killer);
            }
            remove_session(&self.sessions, &session_id);
        }
    }

    pub(crate) fn shutdown(&self) {
        let killers = if let Ok(mut sessions) = self.sessions.lock() {
            let killers = sessions
                .values()
                .map(|session| Arc::clone(&session.killer))
                .collect::<Vec<_>>();
            sessions.clear();
            killers
        } else {
            Vec::new()
        };
        self.subagents.shutdown();
        for killer in killers {
            kill_child(&killer);
        }
    }
}

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum PtyLaunch {
    Shell,
    Command {
        command: String,
    },
    #[cfg(test)]
    Fixture {
        mode: String,
    },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct StartPtyRequest {
    rows: u16,
    cols: u16,
    #[serde(default)]
    cwd: Option<String>,
    launch: PtyLaunch,
    /// Public frontend terminal identity. Omitted for existing callers.
    #[serde(default)]
    terminal_id: Option<String>,
    /// Runtime ownership metadata. Omitted for normal frontend PTYs.
    #[serde(default)]
    subagent: Option<SubagentPtyOwner>,
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
    window: Window,
    state: State<'_, AppState>,
) -> Result<PtyStarted, String> {
    start_pty_session(
        request,
        move |data| {
            on_output
                .send(Response::new(data))
                .map_err(|error| error.to_string())
        },
        move |event| on_event.send(event).map_err(|error| error.to_string()),
        window.label(),
        &state,
    )
}

fn start_pty_session(
    request: StartPtyRequest,
    on_output: impl Fn(Vec<u8>) -> Result<(), String> + Send + 'static,
    on_event: impl Fn(PtyEvent) -> Result<(), String> + Send + 'static,
    window_label: &str,
    state: &AppState,
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
    #[cfg(test)]
    let fixture = matches!(&request.launch, PtyLaunch::Fixture { .. });
    #[cfg(test)]
    let executable = if fixture {
        std::env::current_exe()
            .map_err(|error| format!("could not locate PTY fixture: {error}"))?
            .to_string_lossy()
            .into_owned()
    } else {
        shell.clone()
    };
    #[cfg(not(test))]
    let executable = shell.clone();
    let mut process = CommandBuilder::new(&executable);

    match &request.launch {
        PtyLaunch::Command { command } => configure_fixed_command(&mut process, &shell, command),
        PtyLaunch::Shell => {
            // Start the user's shell without proxy startup files or shell hooks.
            // This preserves its native init sequence, ZDOTDIR, and history behavior.
            #[cfg(not(windows))]
            process.arg("-l");
        }
        #[cfg(test)]
        PtyLaunch::Fixture { mode } => {
            process.args(["--exact", "pty::tests::fixed_pty_fixture", "--nocapture"]);
            process.env("TERMARC_PTY_FIXTURE", mode);
        }
    }

    if let Some(cwd) = request.cwd.as_deref() {
        process.cwd(expand_user_path(cwd));
    }
    process.env("TERM", "xterm-256color");
    process.env("COLORTERM", "truecolor");
    process.env("TERM_PROGRAM", "Termarc");
    process.env(
        "TERMARC_CONTROL_SOCKET",
        crate::control::server_control_socket_path(),
    );
    // Pi extensions must use this exact executable rather than resolving a
    // potentially stale `termarc` from PATH.
    process.env("TERMARC_CLI", crate::cli::current_app_executable()?);
    if let Some(terminal_id) = request.terminal_id.as_deref() {
        if terminal_id.trim().is_empty() {
            return Err("terminalId must not be empty".into());
        }
        process.env("TERMARC_TERMINAL_ID", terminal_id);
    }
    if let Some(owner) = request.subagent.as_ref() {
        let terminal_id = request
            .terminal_id
            .as_deref()
            .ok_or_else(|| "subagent PTYs require terminalId".to_string())?;
        process.env("TERMARC_TERMINAL_ID", terminal_id);
        process.env("TERMARC_PARENT_TERMINAL_ID", &owner.parent_terminal_id);
        process.env("TERMARC_SUBAGENT_ID", &owner.id);
        process.env("TERMARC_SUBAGENT_NAME", &owner.name);
    }

    let mut child = pair
        .slave
        .spawn_command(process)
        .map_err(|error| format!("could not start {shell}: {error}"))?;
    let pid = child.process_id();
    let killer = Arc::new(Mutex::new(child.clone_killer()));
    drop(pair.slave);

    let mut reader = match pair.master.try_clone_reader() {
        Ok(reader) => reader,
        Err(error) => {
            kill_child(&killer);
            let _ = child.wait();
            return Err(format!("could not open PTY reader: {error}"));
        }
    };
    let mut writer = match pair.master.take_writer() {
        Ok(writer) => writer,
        Err(error) => {
            kill_child(&killer);
            let _ = child.wait();
            return Err(format!("could not open PTY writer: {error}"));
        }
    };
    let (input, input_receiver) = sync_channel::<Vec<u8>>(PTY_INPUT_QUEUE_CAPACITY);
    let subagent_id = request.subagent.as_ref().map(|owner| owner.id.clone());

    let mut sessions = match state.sessions.lock() {
        Ok(sessions) => sessions,
        Err(_) => {
            kill_child(&killer);
            let _ = child.wait();
            return Err("PTY session state is poisoned".to_string());
        }
    };
    sessions.insert(
        id.clone(),
        PtySession {
            master: pair.master,
            input: input.clone(),
            killer: Arc::clone(&killer),
            pid,
            window_label: window_label.to_string(),
            subagent_id: subagent_id.clone(),
        },
    );
    drop(sessions);

    if let Some(owner) = request.subagent {
        let registered_command = match &request.launch {
            PtyLaunch::Shell => shell.clone(),
            PtyLaunch::Command { command } => command.clone(),
            #[cfg(test)]
            PtyLaunch::Fixture { mode } => format!("fixed PTY fixture: {mode}"),
        };
        let registered_cwd = request
            .cwd
            .as_deref()
            .map(expand_user_path)
            .or_else(|| std::env::current_dir().ok())
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        let registry_input = input.clone();
        let registry_killer = Arc::clone(&killer);
        if let Err(error) = state.subagents.attach(AttachSubagent {
            owner,
            terminal_id: request.terminal_id.expect("validated subagent terminal id"),
            pty_id: id.clone(),
            pid,
            command: registered_command,
            cwd: registered_cwd,
            input: Arc::new(move |data| {
                registry_input.try_send(data).map_err(|error| match error {
                    std::sync::mpsc::TrySendError::Full(_) => "PTY input queue is full".into(),
                    std::sync::mpsc::TrySendError::Disconnected(_) => {
                        "PTY input channel is closed".into()
                    }
                })
            }),
            stop: Arc::new(move || {
                let mut killer = registry_killer
                    .lock()
                    .map_err(|_| "PTY stop state is poisoned".to_string())?;
                killer
                    .kill()
                    .map_err(|error| format!("could not stop PTY: {error}"))
            }),
        }) {
            remove_session(&state.sessions, &id);
            kill_child(&killer);
            let _ = child.wait();
            return Err(format!("could not attach subagent PTY: {error}"));
        }
    }

    let output_subagents = state.subagents.clone();
    let output_subagent_id = subagent_id.clone();
    let reader_cancelled = Arc::new(AtomicBool::new(false));
    let reader_cancellation = Arc::clone(&reader_cancelled);
    let (reader_done, reader_done_receiver) = sync_channel(1);
    let reader_thread = thread::spawn(move || {
        let mut buffer = vec![0_u8; 16 * 1024];
        while !reader_cancellation.load(Ordering::Acquire) {
            match std::io::Read::read(&mut reader, &mut buffer) {
                Ok(0) => break,
                Ok(count) => {
                    if let Some(subagent_id) = output_subagent_id.as_deref() {
                        output_subagents.append_output(subagent_id, &buffer[..count]);
                    }
                    if on_output(buffer[..count].to_vec()).is_err() && output_subagent_id.is_none()
                    {
                        break;
                    }
                }
                // Unix PTYs commonly report EIO when the slave closes. The child
                // waiter below sends the authoritative exit event.
                Err(_) => break,
            }
        }
        let _ = reader_done.send(());
    });

    thread::spawn(move || {
        while let Ok(data) = input_receiver.recv() {
            if writer
                .write_all(&data)
                .and_then(|_| writer.flush())
                .is_err()
            {
                break;
            }
        }
    });

    let session_id = id.clone();
    let sessions = Arc::clone(&state.sessions);
    let lifecycle_subagents = state.subagents.clone();
    thread::spawn(move || {
        let outcome = child.wait();
        // A normal foreground process closes the final slave and lets the reader
        // drain to EOF immediately. A background descendant may retain a slave
        // forever, so bound that drain, remove the master/session, and interrupt
        // the blocked read before publishing lifecycle completion.
        finish_pty_reader(
            &sessions,
            &session_id,
            reader_thread,
            reader_done_receiver,
            &reader_cancelled,
        );
        match outcome {
            Ok(status) => {
                if let Some(subagent_id) = subagent_id.as_deref() {
                    lifecycle_subagents.exited(subagent_id, status.exit_code());
                }
                let _ = on_event(PtyEvent::exit(status.exit_code()));
            }
            Err(error) => {
                let message = format!("could not wait for shell: {error}");
                if let Some(subagent_id) = subagent_id.as_deref() {
                    lifecycle_subagents.failed(subagent_id, &message);
                }
                let _ = on_event(PtyEvent::error(message));
            }
        }
    });

    Ok(PtyStarted { id, pid, shell })
}

#[tauri::command]
pub(crate) async fn write_to_pty(
    id: String,
    data: Vec<u8>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    const MAX_INPUT_BYTES: usize = 1024 * 1024;
    if data.len() > MAX_INPUT_BYTES {
        return Err(format!("PTY input exceeds {MAX_INPUT_BYTES} bytes"));
    }

    let input = {
        let sessions = state
            .sessions
            .lock()
            .map_err(|_| "PTY session state is poisoned".to_string())?;
        sessions
            .get(&id)
            .map(|session| session.input.clone())
            .ok_or_else(|| format!("unknown PTY session: {id}"))?
    };

    tauri::async_runtime::spawn_blocking(move || input.send(data))
        .await
        .map_err(|error| format!("could not queue PTY input: {error}"))?
        .map_err(|_| "PTY input channel is closed".to_string())
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
    stop_pty_session(&id, &state)
}

fn stop_pty_session(id: &str, state: &AppState) -> Result<(), String> {
    let (subagent_id, killer) = {
        let mut sessions = state
            .sessions
            .lock()
            .map_err(|_| "PTY session state is poisoned".to_string())?;
        let Some(session) = sessions.remove(id) else {
            return Ok(());
        };
        (session.subagent_id, session.killer)
    };

    if let Some(subagent_id) = subagent_id {
        return state
            .subagents
            .stop(&subagent_id)
            .map_err(|error| error.to_string());
    }
    let mut killer = killer
        .lock()
        .map_err(|_| "PTY stop state is poisoned".to_string())?;
    killer
        .kill()
        .map_err(|error| format!("could not stop PTY: {error}"))
}

#[cfg(not(windows))]
fn configure_fixed_command(process: &mut CommandBuilder, _shell: &str, command: &str) {
    // Commands run in a PTY and should inherit the same startup environment as
    // an interactive terminal, including PATH changes configured in ~/.zshrc.
    process.arg("-lic");
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

const PTY_EXIT_DRAIN_TIMEOUT: Duration = Duration::from_millis(250);
const PTY_READER_CANCEL_TIMEOUT: Duration = Duration::from_millis(250);

fn finish_pty_reader(
    sessions: &Arc<Mutex<HashMap<String, PtySession>>>,
    session_id: &str,
    reader_thread: JoinHandle<()>,
    reader_done: Receiver<()>,
    cancelled: &AtomicBool,
) {
    if reader_done.recv_timeout(PTY_EXIT_DRAIN_TIMEOUT).is_ok() {
        remove_session(sessions, session_id);
        let _ = reader_thread.join();
        return;
    }

    // Dropping the stored master closes resize/input ownership. The cloned
    // reader descriptor is interrupted separately because closing another dup
    // does not reliably wake a blocking read on every Unix PTY implementation.
    remove_session(sessions, session_id);
    cancelled.store(true, Ordering::Release);
    let deadline = Instant::now() + PTY_READER_CANCEL_TIMEOUT;
    while !reader_thread.is_finished() && Instant::now() < deadline {
        interrupt_pty_reader(&reader_thread);
        thread::sleep(Duration::from_millis(5));
    }
    if reader_thread.is_finished() {
        let _ = reader_thread.join();
    }
}

#[cfg(unix)]
fn interrupt_pty_reader(thread: &JoinHandle<()>) {
    use std::{os::unix::thread::JoinHandleExt, sync::Once};

    static INSTALL_HANDLER: Once = Once::new();
    extern "C" fn interrupt_handler(_: libc::c_int) {}

    INSTALL_HANDLER.call_once(|| unsafe {
        let mut action: libc::sigaction = std::mem::zeroed();
        action.sa_sigaction = interrupt_handler as *const () as usize;
        action.sa_flags = 0;
        libc::sigemptyset(&mut action.sa_mask);
        libc::sigaction(libc::SIGURG, &action, std::ptr::null_mut());
    });
    unsafe {
        libc::pthread_kill(thread.as_pthread_t(), libc::SIGURG);
    }
}

#[cfg(not(unix))]
fn interrupt_pty_reader(_thread: &JoinHandle<()>) {}

fn remove_session(sessions: &Arc<Mutex<HashMap<String, PtySession>>>, session_id: &str) {
    if let Ok(mut sessions) = sessions.lock() {
        sessions.remove(session_id);
    }
}

fn kill_child(killer: &Arc<Mutex<Box<dyn ChildKiller + Send + Sync>>>) {
    if let Ok(mut killer) = killer.lock() {
        let _ = killer.kill();
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

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use crate::{
        control::{ControlDispatcher, ControlRequest},
        spawn_router::SpawnRouter,
        subagents::{
            OutputFormat, ProcessKind, ReserveSubagent, SubagentLifecycle, SubagentResultUpdate,
            SubagentSpawnAcknowledgement, SubagentSpawnEvent, TopLevelTerminalMetadata,
        },
    };
    use std::{sync::mpsc, time::Duration};

    fn reserve(state: &AppState, name: &str, command: &str) -> SubagentPtyOwner {
        state
            .subagents
            .register_top_level_terminals(
                "pty-test-window",
                vec![TopLevelTerminalMetadata {
                    terminal_id: "pty-test-parent".into(),
                    project_id: "pty-test-project".into(),
                }],
            )
            .unwrap();
        let reserved = state
            .subagents
            .reserve(ReserveSubagent {
                parent_terminal_id: "pty-test-parent".into(),
                project_id: "pty-test-project".into(),
                name: name.into(),
                command: command.into(),
                cwd: std::env::current_dir()
                    .unwrap()
                    .to_string_lossy()
                    .into_owned(),
                process_kind: "pi".into(),
            })
            .unwrap();
        SubagentPtyOwner {
            id: reserved.event.subagent_id,
            parent_terminal_id: reserved.event.parent_terminal_id,
            project_id: reserved.event.project_id,
            name: reserved.event.name,
            process_kind: ProcessKind::Pi,
        }
    }

    #[test]
    fn shared_ipc_fixture_overlaps_spawn_event_ack_and_start_pty_ownership() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../extensions/pi/fixtures/subagent-spawn-ipc.json"
        ))
        .unwrap();
        let event: SubagentSpawnEvent = serde_json::from_value(fixture["event"].clone()).unwrap();
        let acknowledgement: SubagentSpawnAcknowledgement =
            serde_json::from_value(fixture["acknowledgement"].clone()).unwrap();
        let request: StartPtyRequest =
            serde_json::from_value(fixture["startPtyRequest"].clone()).unwrap();
        let owner = request.subagent.expect("fixture must carry PTY ownership");

        assert_eq!(
            fixture["eventName"],
            crate::spawn_router::SUBAGENT_SPAWN_EVENT
        );
        assert_eq!(serde_json::to_value(&event).unwrap(), fixture["event"]);
        assert_eq!(acknowledgement.subagent_id, event.subagent_id);
        assert!(acknowledgement.success);
        assert_eq!(owner.id, event.subagent_id);
        assert_eq!(owner.parent_terminal_id, event.parent_terminal_id);
        assert_eq!(owner.project_id, event.project_id);
        assert_eq!(owner.name, event.name);
        assert_eq!(owner.process_kind, event.process_kind);
        assert_eq!(request.terminal_id.as_deref(), Some("terminal-child"));
        assert_eq!(request.cwd.as_deref(), Some(event.cwd.as_str()));
        assert!(matches!(
            request.launch,
            PtyLaunch::Command { command } if command == event.command
        ));
    }

    fn receive_until(receiver: &mpsc::Receiver<Vec<u8>>, expected: &[u8]) -> Vec<u8> {
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        let mut output = Vec::new();
        while !output
            .windows(expected.len())
            .any(|window| window == expected)
        {
            let remaining = deadline.saturating_duration_since(std::time::Instant::now());
            assert!(
                !remaining.is_zero(),
                "timed out waiting for PTY output: {output:?}"
            );
            output.extend(
                receiver
                    .recv_timeout(remaining)
                    .expect("PTY output channel closed"),
            );
        }
        output
    }

    #[test]
    fn fixed_pty_fixture() {
        let Ok(mode) = std::env::var("TERMARC_PTY_FIXTURE") else {
            return;
        };
        use std::io::{BufRead, Write};
        match mode.as_str() {
            "echo" => {
                print!("\u{1b}[32mREADY\u{1b}[0m\n");
                std::io::stdout().flush().unwrap();
                let mut line = String::new();
                std::io::stdin().lock().read_line(&mut line).unwrap();
                print!("ECHO:{}", line);
                std::io::stdout().flush().unwrap();
            }
            "stop" | "retainer" => {
                println!("STOP-READY");
                std::io::stdout().flush().unwrap();
                thread::sleep(Duration::from_secs(30));
            }
            "descendant" => {
                use std::os::unix::process::CommandExt;
                let mut command = std::process::Command::new(std::env::current_exe().unwrap());
                command
                    .args(["--exact", "pty::tests::fixed_pty_fixture", "--nocapture"])
                    .env("TERMARC_PTY_FIXTURE", "retainer");
                // Retain the inherited slave after the session leader exits.
                // Ignoring SIGHUP makes this deterministic without shell job
                // control or user startup configuration.
                unsafe {
                    command.pre_exec(|| {
                        libc::signal(libc::SIGHUP, libc::SIG_IGN);
                        Ok(())
                    });
                }
                let descendant = command.spawn().unwrap();
                println!("DESCENDANT-PID:{}", descendant.id());
                println!("FOREGROUND-TAIL");
                std::io::stdout().flush().unwrap();
            }
            other => panic!("unknown PTY fixture mode: {other}"),
        }
    }

    #[test]
    fn real_pty_child_covers_output_input_result_exit_and_session_cleanup() {
        let state = AppState::default();
        let command = "fixed PTY fixture: echo";
        let owner = reserve(&state, "PTY lifecycle", command);
        let subagent_id = owner.id.clone();
        let terminal_id = "pty-test-child".to_string();
        let (output_sender, output_receiver) = mpsc::channel();
        let (event_sender, event_receiver) = mpsc::channel();
        let started = start_pty_session(
            StartPtyRequest {
                rows: 24,
                cols: 80,
                cwd: Some(
                    std::env::current_dir()
                        .unwrap()
                        .to_string_lossy()
                        .into_owned(),
                ),
                launch: PtyLaunch::Fixture {
                    mode: "echo".into(),
                },
                terminal_id: Some(terminal_id.clone()),
                subagent: Some(owner),
            },
            move |data| output_sender.send(data).map_err(|error| error.to_string()),
            move |event| event_sender.send(event).map_err(|error| error.to_string()),
            "pty-test-window",
            &state,
        )
        .unwrap();

        let raw_ready = receive_until(&output_receiver, b"READY");
        assert!(raw_ready.windows(5).any(|window| window == b"\x1b[32m"));
        let status = state.subagents.status(&subagent_id).unwrap();
        assert_eq!(status.pty_id, started.id);
        assert!(status.pid.is_some());
        assert!(status.raw_output_cursor >= raw_ready.len() as u64);
        let plain = state
            .subagents
            .output(&subagent_id, OutputFormat::Plain, 0, 64 * 1024)
            .unwrap();
        assert!(String::from_utf8_lossy(&plain.data).contains("READY"));
        assert!(!plain.data.contains(&0x1b));

        let result_dispatcher = ControlDispatcher::new(
            state.subagents.clone(),
            SpawnRouter::new(state.subagents.clone(), |_, _| Ok(())),
        );
        let published = result_dispatcher.dispatch(ControlRequest::SubagentResultUpdate {
            protocol_version: crate::control::PROTOCOL_VERSION,
            update: SubagentResultUpdate {
                subagent_id: subagent_id.clone(),
                terminal_id,
                text: "structured answer".into(),
                sequence: Some(1),
            },
        });
        assert!(
            published.ok,
            "result publication failed: {:?}",
            published.error
        );
        state
            .subagents
            .send_input(&subagent_id, b"hello from stdin\r".to_vec())
            .unwrap();
        receive_until(&output_receiver, b"ECHO:hello from stdin");
        let completed = state
            .subagents
            .wait(&subagent_id, Duration::from_secs(5))
            .unwrap();
        assert_eq!(completed.status.lifecycle, SubagentLifecycle::Exited);
        assert_eq!(
            state.subagents.result(&subagent_id).unwrap().text,
            "structured answer"
        );
        let event = event_receiver.recv_timeout(Duration::from_secs(1)).unwrap();
        assert_eq!(event.event, "exit");
        assert!(!state.sessions.lock().unwrap().contains_key(&started.id));
        assert!(state.subagents.runtime_released(&subagent_id));
    }

    #[test]
    fn descendant_retaining_slave_does_not_delay_tail_completion_or_cleanup() {
        let state = AppState::default();
        let command = "fixed PTY fixture: descendant";
        let owner = reserve(&state, "PTY retained slave", command);
        let subagent_id = owner.id.clone();
        let (output_sender, output_receiver) = mpsc::channel();
        let (event_sender, event_receiver) = mpsc::channel();
        let started = start_pty_session(
            StartPtyRequest {
                rows: 24,
                cols: 80,
                cwd: None,
                launch: PtyLaunch::Fixture {
                    mode: "descendant".into(),
                },
                terminal_id: Some("pty-descendant-child".into()),
                subagent: Some(owner),
            },
            move |data| output_sender.send(data).map_err(|error| error.to_string()),
            move |event| event_sender.send(event).map_err(|error| error.to_string()),
            "pty-test-window",
            &state,
        )
        .unwrap();

        let output = receive_until(&output_receiver, b"FOREGROUND-TAIL");
        let output = String::from_utf8_lossy(&output);
        assert!(output.contains("FOREGROUND-TAIL"));
        let descendant_pid = output
            .split("DESCENDANT-PID:")
            .nth(1)
            .and_then(|suffix| suffix.lines().next())
            .and_then(|pid| pid.trim_end_matches('\r').parse::<i32>().ok())
            .expect("fixture should report its retained-slave descendant");
        let completed = state
            .subagents
            .wait(&subagent_id, Duration::from_secs(2))
            .expect("retained slave must not delay lifecycle completion");
        assert_eq!(completed.status.lifecycle, SubagentLifecycle::Exited);
        assert_eq!(completed.status.exit_code, Some(0));
        assert_eq!(
            event_receiver
                .recv_timeout(Duration::from_secs(1))
                .unwrap()
                .event,
            "exit"
        );
        assert!(!state.sessions.lock().unwrap().contains_key(&started.id));
        assert!(state.subagents.runtime_released(&subagent_id));
        assert!(
            state
                .subagents
                .send_input(&subagent_id, b"late".to_vec())
                .is_err()
        );
        unsafe {
            assert_eq!(libc::kill(descendant_pid, 0), 0, "descendant exited early");
            libc::kill(descendant_pid, libc::SIGKILL);
        }
    }

    #[test]
    fn real_pty_stop_releases_child_runtime_and_removes_session() {
        let state = AppState::default();
        let command = "fixed PTY fixture: stop";
        let owner = reserve(&state, "PTY stop", command);
        let subagent_id = owner.id.clone();
        let (output_sender, output_receiver) = mpsc::channel();
        let (event_sender, event_receiver) = mpsc::channel();
        let started = start_pty_session(
            StartPtyRequest {
                rows: 24,
                cols: 80,
                cwd: Some(
                    std::env::current_dir()
                        .unwrap()
                        .to_string_lossy()
                        .into_owned(),
                ),
                launch: PtyLaunch::Fixture {
                    mode: "stop".into(),
                },
                terminal_id: Some("pty-stop-child".into()),
                subagent: Some(owner),
            },
            move |data| output_sender.send(data).map_err(|error| error.to_string()),
            move |event| event_sender.send(event).map_err(|error| error.to_string()),
            "pty-test-window",
            &state,
        )
        .unwrap();
        receive_until(&output_receiver, b"STOP-READY");

        stop_pty_session(&started.id, &state).unwrap();
        let completed = state
            .subagents
            .wait(&subagent_id, Duration::from_secs(5))
            .unwrap();
        assert_eq!(completed.status.lifecycle, SubagentLifecycle::Stopped);
        assert!(!state.sessions.lock().unwrap().contains_key(&started.id));
        assert_eq!(
            event_receiver
                .recv_timeout(Duration::from_secs(1))
                .unwrap()
                .event,
            "exit"
        );
        assert!(
            state
                .subagents
                .send_input(&subagent_id, b"late".to_vec())
                .is_err()
        );
        assert!(state.subagents.runtime_released(&subagent_id));
    }
}
