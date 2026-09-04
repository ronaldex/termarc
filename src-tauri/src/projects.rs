use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File, OpenOptions},
    io::Write,
    path::{Path, PathBuf},
    sync::{
        Mutex, MutexGuard,
        atomic::{AtomicU64, Ordering},
    },
};

#[cfg(unix)]
use std::os::fd::AsRawFd;

use crate::paths::{project_tree_state_path, projects_path};

static NEXT_TEMP_FILE_ID: AtomicU64 = AtomicU64::new(0);
static PROJECT_CONFIG_WRITE_LOCK: Mutex<()> = Mutex::new(());

pub(crate) struct ProjectConfigWriteGuard {
    _process_guard: MutexGuard<'static, ()>,
    lock_file: File,
}

impl Drop for ProjectConfigWriteGuard {
    fn drop(&mut self) {
        #[cfg(unix)]
        unsafe {
            libc::flock(self.lock_file.as_raw_fd(), libc::LOCK_UN);
        }
    }
}

pub(crate) fn project_config_write_lock() -> Result<ProjectConfigWriteGuard, String> {
    let process_guard = PROJECT_CONFIG_WRITE_LOCK
        .lock()
        .map_err(|_| "project configuration write lock is poisoned".to_string())?;
    let path = projects_path().with_extension("lock");
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("could not create {}: {error}", parent.display()))?;
    }
    let lock_file = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(&path)
        .map_err(|error| format!("could not open {}: {error}", path.display()))?;
    #[cfg(unix)]
    if unsafe { libc::flock(lock_file.as_raw_fd(), libc::LOCK_EX) } != 0 {
        return Err(format!(
            "could not lock {}: {}",
            path.display(),
            std::io::Error::last_os_error()
        ));
    }
    Ok(ProjectConfigWriteGuard {
        _process_guard: process_guard,
        lock_file,
    })
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectConfig {
    id: String,
    name: String,
    directory: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    external_editor: Option<crate::external_editor::ExternalEditor>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    commands: Option<Vec<ProjectCommand>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    agents: Option<Vec<ProjectCommand>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    terminals: Option<Vec<ProjectTerminal>>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ProjectTerminal {
    id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    cwd: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    custom_title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    parent_terminal_id: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectCommand {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) command: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) directory: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) order: Option<u32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) storage: Option<CommandStorage>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) autostart: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub(crate) auto_restart: Option<AutoRestartPolicy>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AutoRestartPolicy {
    pub(crate) max_retries: u32,
    pub(crate) retry_window_seconds: u32,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub(crate) enum CommandStorage {
    Global,
    Project,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProjectTreeStateConfig {
    project_open: bool,
    terminal_open: bool,
    commands_open: bool,
    #[serde(default = "default_true")]
    agents_open: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LoadedProjectConfig {
    id: String,
    name: String,
    directory: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    external_editor: Option<crate::external_editor::ExternalEditor>,
    commands: Vec<ProjectCommand>,
    agents: Vec<ProjectCommand>,
    global_commands: Vec<ProjectCommand>,
    local_commands: Vec<ProjectCommand>,
    global_agents: Vec<ProjectCommand>,
    local_agents: Vec<ProjectCommand>,
    #[serde(skip_serializing_if = "Option::is_none")]
    local_config_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    terminals: Option<Vec<ProjectTerminal>>,
}

#[tauri::command]
pub(crate) async fn load_projects() -> Result<Vec<LoadedProjectConfig>, String> {
    run_blocking_config("load projects", load_projects_blocking).await
}

fn load_projects_blocking() -> Result<Vec<LoadedProjectConfig>, String> {
    let path = projects_path();
    if !path.exists() {
        return Ok(Vec::new());
    }

    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("could not read {}: {error}", path.display()))?;
    let projects: Vec<ProjectConfig> = serde_json::from_str(&contents)
        .map_err(|error| format!("could not parse {}: {error}", path.display()))?;
    validate_projects(&projects)?;

    Ok(projects.into_iter().map(load_project).collect())
}

fn load_project(project: ProjectConfig) -> LoadedProjectConfig {
    let mut global_commands = project.commands.unwrap_or_default();
    let mut global_agents = project.agents.unwrap_or_default();
    for command in &mut global_commands {
        command.storage = Some(CommandStorage::Global);
    }
    for agent in &mut global_agents {
        agent.storage = Some(CommandStorage::Global);
    }
    let (mut local_commands, mut local_agents, local_config_error) =
        match crate::project_local_config::load(&project.directory) {
            Ok(Some(config)) => (config.commands, config.agents, None),
            Ok(None) => (Vec::new(), Vec::new(), None),
            Err(error) => (Vec::new(), Vec::new(), Some(error)),
        };
    for command in &mut local_commands {
        command.storage = Some(CommandStorage::Project);
    }
    for agent in &mut local_agents {
        agent.storage = Some(CommandStorage::Project);
    }
    let mut commands = global_commands.clone();
    let mut agents = global_agents.clone();
    for local in &local_commands {
        if let Some(index) = commands.iter().position(|global| global.id == local.id) {
            commands[index] = local.clone();
        } else {
            commands.push(local.clone());
        }
    }
    for local in &local_agents {
        if let Some(index) = agents.iter().position(|global| global.id == local.id) {
            agents[index] = local.clone();
        } else {
            agents.push(local.clone());
        }
    }
    commands.sort_by_key(|command| command.order.unwrap_or(u32::MAX));
    agents.sort_by_key(|agent| agent.order.unwrap_or(u32::MAX));
    global_agents.sort_by_key(|agent| agent.order.unwrap_or(u32::MAX));
    local_agents.sort_by_key(|agent| agent.order.unwrap_or(u32::MAX));
    global_commands.sort_by_key(|command| command.order.unwrap_or(u32::MAX));
    local_commands.sort_by_key(|command| command.order.unwrap_or(u32::MAX));
    LoadedProjectConfig {
        id: project.id,
        name: project.name,
        directory: project.directory,
        external_editor: project.external_editor,
        commands,
        agents,
        global_commands,
        local_commands,
        global_agents,
        local_agents,
        local_config_error,
        terminals: project.terminals,
    }
}

#[tauri::command]
pub(crate) async fn load_project_tree_state()
-> Result<std::collections::HashMap<String, ProjectTreeStateConfig>, String> {
    run_blocking_config("load project tree state", load_project_tree_state_blocking).await
}

fn load_project_tree_state_blocking()
-> Result<std::collections::HashMap<String, ProjectTreeStateConfig>, String> {
    let path = project_tree_state_path();
    if !path.exists() {
        return Ok(std::collections::HashMap::new());
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("could not read {}: {error}", path.display()))?;
    serde_json::from_str(&contents)
        .map_err(|error| format!("could not parse {}: {error}", path.display()))
}

#[tauri::command]
pub(crate) async fn save_project_tree_state(
    state: std::collections::HashMap<String, ProjectTreeStateConfig>,
) -> Result<(), String> {
    run_blocking_config("save project tree state", move || {
        save_project_tree_state_blocking(state)
    })
    .await
}

fn save_project_tree_state_blocking(
    state: std::collections::HashMap<String, ProjectTreeStateConfig>,
) -> Result<(), String> {
    let _guard = project_config_write_lock()?;
    let path = project_tree_state_path();
    let parent = path
        .parent()
        .ok_or_else(|| format!("state path has no parent: {}", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("could not create {}: {error}", parent.display()))?;
    let contents = serde_json::to_vec_pretty(&state)
        .map_err(|error| format!("could not serialize project tree state: {error}"))?;
    atomic_write(&path, &contents)
}

#[tauri::command]
pub(crate) async fn save_projects(projects: Vec<ProjectConfig>) -> Result<(), String> {
    run_blocking_config("save projects", move || save_projects_blocking(projects)).await
}

fn save_projects_blocking(projects: Vec<ProjectConfig>) -> Result<(), String> {
    let _guard = project_config_write_lock()?;
    validate_projects(&projects)?;
    let path = projects_path();
    let parent = path
        .parent()
        .ok_or_else(|| format!("project path has no parent: {}", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("could not create {}: {error}", parent.display()))?;

    let contents = serde_json::to_vec_pretty(&projects)
        .map_err(|error| format!("could not serialize projects: {error}"))?;
    atomic_write(&path, &contents)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LoadedLocalProjectConfig {
    commands: Vec<ProjectCommand>,
    agents: Vec<ProjectCommand>,
}

#[tauri::command]
pub(crate) async fn load_local_project_config(
    directory: String,
) -> Result<LoadedLocalProjectConfig, String> {
    run_blocking_config("load local project config", move || {
        load_local_project_config_blocking(directory)
    })
    .await
}

fn load_local_project_config_blocking(
    directory: String,
) -> Result<LoadedLocalProjectConfig, String> {
    let mut config = crate::project_local_config::load(&directory)?.unwrap_or_else(|| {
        crate::project_local_config::LocalConfig {
            version: 1,
            commands: Vec::new(),
            agents: Vec::new(),
        }
    });
    for executable in config.commands.iter_mut().chain(config.agents.iter_mut()) {
        executable.storage = Some(CommandStorage::Project);
    }
    Ok(LoadedLocalProjectConfig {
        commands: config.commands,
        agents: config.agents,
    })
}

#[tauri::command]
pub(crate) async fn save_local_project_agents(
    directory: String,
    agents: Vec<ProjectCommand>,
) -> Result<(), String> {
    run_blocking_config("save local project agents", move || {
        save_local_project_agents_blocking(directory, agents)
    })
    .await
}

fn save_local_project_agents_blocking(
    directory: String,
    agents: Vec<ProjectCommand>,
) -> Result<(), String> {
    let _guard = project_config_write_lock()?;
    validate_command_store(&agents, "local agent", false)?;
    let existing = crate::project_local_config::load(&directory)?.unwrap_or_else(|| {
        crate::project_local_config::LocalConfig {
            version: 1,
            commands: Vec::new(),
            agents: Vec::new(),
        }
    });
    crate::project_local_config::save(&directory, existing.commands, agents)
}

#[tauri::command]
pub(crate) async fn save_local_project_commands(
    directory: String,
    commands: Vec<ProjectCommand>,
) -> Result<(), String> {
    run_blocking_config("save local project commands", move || {
        save_local_project_commands_blocking(directory, commands)
    })
    .await
}

fn save_local_project_commands_blocking(
    directory: String,
    commands: Vec<ProjectCommand>,
) -> Result<(), String> {
    let _guard = project_config_write_lock()?;
    validate_command_store(&commands, "local", false)?;
    let existing = crate::project_local_config::load(&directory)?.unwrap_or_else(|| {
        crate::project_local_config::LocalConfig {
            version: 1,
            commands: Vec::new(),
            agents: Vec::new(),
        }
    });
    crate::project_local_config::save(&directory, commands, existing.agents)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CommandOrderFailure {
    stage: &'static str,
    message: String,
}

impl CommandOrderFailure {
    fn new(stage: &'static str, message: impl Into<String>) -> Self {
        Self {
            stage,
            message: message.into(),
        }
    }
}

#[tauri::command]
pub(crate) async fn save_project_command_order(
    project_id: String,
    directory: String,
    global_commands: Vec<ProjectCommand>,
    local_commands: Vec<ProjectCommand>,
) -> Result<(), CommandOrderFailure> {
    tauri::async_runtime::spawn_blocking(move || {
        save_project_command_order_blocking(project_id, directory, global_commands, local_commands)
    })
    .await
    .map_err(|error| {
        CommandOrderFailure::new("task", format!("save command order task failed: {error}"))
    })?
}

fn save_project_command_order_blocking(
    project_id: String,
    directory: String,
    mut global_commands: Vec<ProjectCommand>,
    mut local_commands: Vec<ProjectCommand>,
) -> Result<(), CommandOrderFailure> {
    let _guard =
        project_config_write_lock().map_err(|error| CommandOrderFailure::new("lock", error))?;
    validate_mixed_command_order(&global_commands, &local_commands)
        .map_err(|error| CommandOrderFailure::new("validation", error))?;
    global_commands
        .iter_mut()
        .for_each(|command| command.storage = None);
    local_commands
        .iter_mut()
        .for_each(|command| command.storage = None);
    let existing_local = crate::project_local_config::load(&directory)
        .map_err(|error| CommandOrderFailure::new("local", error))?;
    let should_write_local = existing_local.is_some() || !local_commands.is_empty();
    let local_agents = existing_local
        .map(|config| config.agents)
        .unwrap_or_default();

    let path = projects_path();
    let original = fs::read(&path).map_err(|error| {
        CommandOrderFailure::new(
            "global",
            format!("could not read {}: {error}", path.display()),
        )
    })?;
    let mut projects: Vec<ProjectConfig> = serde_json::from_slice(&original).map_err(|error| {
        CommandOrderFailure::new(
            "global",
            format!("could not parse {}: {error}", path.display()),
        )
    })?;
    let project = projects
        .iter_mut()
        .find(|project| project.id == project_id)
        .ok_or_else(|| {
            CommandOrderFailure::new("validation", format!("project not found: {project_id}"))
        })?;
    if project.directory != directory {
        return Err(CommandOrderFailure::new(
            "validation",
            "project directory changed while ordering commands",
        ));
    }
    project.commands = Some(global_commands);
    let contents = serde_json::to_vec_pretty(&projects).map_err(|error| {
        CommandOrderFailure::new("global", format!("could not serialize projects: {error}"))
    })?;
    atomic_write(&path, &contents).map_err(|error| CommandOrderFailure::new("global", error))?;

    if should_write_local
        && let Err(error) =
            crate::project_local_config::save(&directory, local_commands, local_agents)
    {
        return match atomic_write(&path, &original) {
            Ok(()) => Err(CommandOrderFailure::new("local", error)),
            Err(rollback) => Err(CommandOrderFailure::new(
                "rollback",
                format!("{error}; global rollback failed: {rollback}"),
            )),
        };
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn save_project_agent_order(
    project_id: String,
    directory: String,
    global_agents: Vec<ProjectCommand>,
    local_agents: Vec<ProjectCommand>,
) -> Result<(), CommandOrderFailure> {
    tauri::async_runtime::spawn_blocking(move || {
        save_project_agent_order_blocking(project_id, directory, global_agents, local_agents)
    })
    .await
    .map_err(|error| {
        CommandOrderFailure::new("task", format!("save agent order task failed: {error}"))
    })?
}

fn save_project_agent_order_blocking(
    project_id: String,
    directory: String,
    mut global_agents: Vec<ProjectCommand>,
    mut local_agents: Vec<ProjectCommand>,
) -> Result<(), CommandOrderFailure> {
    let _guard =
        project_config_write_lock().map_err(|error| CommandOrderFailure::new("lock", error))?;
    validate_mixed_command_order(&global_agents, &local_agents)
        .map_err(|error| CommandOrderFailure::new("validation", error))?;
    global_agents
        .iter_mut()
        .for_each(|agent| agent.storage = None);
    local_agents
        .iter_mut()
        .for_each(|agent| agent.storage = None);
    let existing_local = crate::project_local_config::load(&directory)
        .map_err(|error| CommandOrderFailure::new("local", error))?;
    let should_write_local = existing_local.is_some() || !local_agents.is_empty();
    let local_commands = existing_local
        .map(|config| config.commands)
        .unwrap_or_default();

    let path = projects_path();
    let original = fs::read(&path).map_err(|error| {
        CommandOrderFailure::new(
            "global",
            format!("could not read {}: {error}", path.display()),
        )
    })?;
    let mut projects: Vec<ProjectConfig> = serde_json::from_slice(&original).map_err(|error| {
        CommandOrderFailure::new(
            "global",
            format!("could not parse {}: {error}", path.display()),
        )
    })?;
    let project = projects
        .iter_mut()
        .find(|project| project.id == project_id)
        .ok_or_else(|| {
            CommandOrderFailure::new("validation", format!("project not found: {project_id}"))
        })?;
    if project.directory != directory {
        return Err(CommandOrderFailure::new(
            "validation",
            "project directory changed while ordering agents",
        ));
    }
    project.agents = Some(global_agents);
    let contents = serde_json::to_vec_pretty(&projects).map_err(|error| {
        CommandOrderFailure::new("global", format!("could not serialize projects: {error}"))
    })?;
    atomic_write(&path, &contents).map_err(|error| CommandOrderFailure::new("global", error))?;

    if should_write_local
        && let Err(error) =
            crate::project_local_config::save(&directory, local_commands, local_agents)
    {
        return match atomic_write(&path, &original) {
            Ok(()) => Err(CommandOrderFailure::new("local", error)),
            Err(rollback) => Err(CommandOrderFailure::new(
                "rollback",
                format!("{error}; global rollback failed: {rollback}"),
            )),
        };
    }
    Ok(())
}

async fn run_blocking_config<T, F>(operation: &'static str, task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| format!("{operation} task failed: {error}"))?
}

fn validate_projects(projects: &[ProjectConfig]) -> Result<(), String> {
    let mut project_ids = HashSet::new();
    let mut terminal_ids = HashSet::new();
    for project in projects {
        if project.id.trim().is_empty() || !project_ids.insert(&project.id) {
            return Err(format!("invalid or duplicate project id: {}", project.id));
        }
        if let Some(commands) = &project.commands {
            validate_command_store(commands, "global", false)?;
        }
        if let Some(agents) = &project.agents {
            validate_command_store(agents, "global agent", false)?;
        }
        if let Some(terminals) = &project.terminals {
            for terminal in terminals {
                if terminal.id.trim().is_empty() || !terminal_ids.insert(&terminal.id) {
                    return Err(format!(
                        "invalid or duplicate terminal id in project {}",
                        project.id
                    ));
                }
            }
        }
    }
    Ok(())
}

pub(crate) fn validate_command_store(
    commands: &[ProjectCommand],
    label: &str,
    require_rank: bool,
) -> Result<(), String> {
    let mut ids = HashSet::new();
    let mut ranks = HashSet::new();
    for command in commands {
        if command.id.trim().is_empty()
            || command.name.trim().is_empty()
            || command.command.trim().is_empty()
        {
            return Err(format!(
                "{label} commands require a non-empty id, name, and command"
            ));
        }
        if !ids.insert(&command.id) {
            return Err(format!("duplicate {label} command id: {}", command.id));
        }
        if let Some(policy) = &command.auto_restart
            && (policy.max_retries == 0 || policy.retry_window_seconds == 0)
        {
            return Err(format!(
                "{label} command {} requires positive auto-restart limits",
                command.id
            ));
        }
        match command.order {
            Some(rank) if !ranks.insert(rank) => {
                return Err(format!("duplicate {label} command rank: {rank}"));
            }
            None if require_rank => {
                return Err(format!("missing {label} command rank: {}", command.id));
            }
            _ => {}
        }
    }
    Ok(())
}

fn validate_mixed_command_order(
    global: &[ProjectCommand],
    local: &[ProjectCommand],
) -> Result<(), String> {
    validate_command_store(global, "global", true)?;
    validate_command_store(local, "local", true)?;
    let mut effective: HashMap<&str, u32> = global
        .iter()
        .map(|command| (command.id.as_str(), command.order.unwrap()))
        .collect();
    for command in local {
        effective.insert(command.id.as_str(), command.order.unwrap());
    }
    let mut ranks = HashSet::new();
    for (id, rank) in &effective {
        if !ranks.insert(*rank) {
            return Err(format!("duplicate mixed command rank {rank} at {id}"));
        }
    }
    let mut ordered = ranks.into_iter().collect::<Vec<_>>();
    ordered.sort_unstable();
    if ordered
        .iter()
        .enumerate()
        .any(|(index, rank)| *rank as usize != index)
    {
        return Err("mixed command ranks must be contiguous from zero".into());
    }
    Ok(())
}

pub(crate) fn atomic_write(path: &Path, contents: &[u8]) -> Result<(), String> {
    let temp_path = temporary_path(path);
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp_path)
            .map_err(|error| {
                format!(
                    "could not create temporary project file {}: {error}",
                    temp_path.display()
                )
            })?;
        file.write_all(contents).map_err(|error| {
            format!(
                "could not write temporary project file {}: {error}",
                temp_path.display()
            )
        })?;
        file.sync_all().map_err(|error| {
            format!(
                "could not sync temporary project file {}: {error}",
                temp_path.display()
            )
        })?;
        drop(file);
        fs::rename(&temp_path, path).map_err(|error| {
            format!(
                "could not replace {} with {}: {error}",
                path.display(),
                temp_path.display()
            )
        })?;
        #[cfg(unix)]
        if let Some(parent) = path.parent() {
            fs::File::open(parent)
                .and_then(|directory| directory.sync_all())
                .map_err(|error| format!("could not sync {}: {error}", parent.display()))?;
        }
        Ok(())
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    result
}

fn temporary_path(path: &Path) -> PathBuf {
    let id = NEXT_TEMP_FILE_ID.fetch_add(1, Ordering::Relaxed);
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("projects.json");
    path.with_file_name(format!(".{file_name}.{}.{id}.tmp", std::process::id()))
}

#[cfg(test)]
mod tests {
    use super::{ProjectCommand, ProjectConfig, validate_mixed_command_order, validate_projects};

    fn command(id: &str, order: Option<u32>) -> ProjectCommand {
        ProjectCommand {
            id: id.into(),
            name: id.into(),
            command: id.into(),
            directory: None,
            order,
            storage: None,
            autostart: None,
            auto_restart: None,
        }
    }

    #[test]
    fn loads_legacy_projects_without_an_editor_override() {
        let project: ProjectConfig =
            serde_json::from_str(r#"{"id":"project-1","name":"Project","directory":"."}"#)
                .expect("legacy project should load");

        assert!(project.external_editor.is_none());
    }

    #[test]
    fn round_trips_project_editor_overrides() {
        let project: ProjectConfig = serde_json::from_str(
            r#"{"id":"project-1","name":"Project","directory":".","externalEditor":"phpstorm"}"#,
        )
        .expect("project editor should load");
        let serialized = serde_json::to_value(project).expect("project should serialize");

        assert_eq!(serialized["externalEditor"], "phpstorm");
    }

    #[test]
    fn omits_missing_project_editor_overrides() {
        let project: ProjectConfig =
            serde_json::from_str(r#"{"id":"project-1","name":"Project","directory":"."}"#)
                .expect("project should load");
        let serialized = serde_json::to_value(project).expect("project should serialize");

        assert!(serialized.get("externalEditor").is_none());
    }

    #[test]
    fn coordinated_order_writes_require_unique_complete_mixed_ranks() {
        assert!(
            validate_mixed_command_order(
                &[command("global", Some(0))],
                &[command("local", Some(0))]
            )
            .is_err()
        );
        assert!(validate_mixed_command_order(&[command("legacy", None)], &[]).is_err());
    }

    #[test]
    fn rejects_terminal_ids_reused_across_projects() {
        let projects: Vec<ProjectConfig> = serde_json::from_str(
            r#"[{"id":"one","name":"One","directory":".","terminals":[{"id":"terminal-a"}]},{"id":"two","name":"Two","directory":".","terminals":[{"id":"terminal-a"}]}]"#,
        )
        .expect("projects should parse");

        assert!(validate_projects(&projects).is_err());
    }

    #[test]
    fn round_trips_command_order() {
        let project: ProjectConfig = serde_json::from_str(
            r#"{"id":"project-1","name":"Project","directory":".","commands":[{"id":"build","name":"Build","command":"npm run build","order":2}]}"#,
        )
        .expect("ordered command should load");
        let serialized = serde_json::to_value(project).expect("project should serialize");

        assert_eq!(serialized["commands"][0]["order"], 2);
    }
}
