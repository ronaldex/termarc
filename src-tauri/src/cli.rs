use serde::{Deserialize, Serialize};
use std::{
    env, fs,
    path::{Path, PathBuf},
    process::{self, Command},
};

const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Project {
    id: String,
    name: String,
    directory: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    commands: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    terminals: Option<serde_json::Value>,
}

#[tauri::command]
pub fn install_symlink() -> Result<String, String> {
    let executable =
        env::current_exe().map_err(|error| format!("could not locate Termdeck: {error}"))?;
    if !executable
        .components()
        .any(|component| component.as_os_str() == "Contents")
    {
        return Err("install the Termdeck app before adding its CLI to PATH".into());
    }
    let directory = env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".local/bin");
    fs::create_dir_all(&directory)
        .map_err(|error| format!("could not create {}: {error}", directory.display()))?;
    let link = directory.join("termdeck");
    if link.exists() || link.symlink_metadata().is_ok() {
        let target = fs::read_link(&link).ok();
        if target.as_deref() == Some(executable.as_path()) {
            return Ok(link.to_string_lossy().into_owned());
        }
        return Err(format!(
            "{} already exists; remove it before installing the Termdeck CLI",
            link.display()
        ));
    }
    create_symlink(&executable, &link)?;
    Ok(link.to_string_lossy().into_owned())
}

#[cfg(unix)]
fn create_symlink(target: &Path, link: &Path) -> Result<(), String> {
    std::os::unix::fs::symlink(target, link)
        .map_err(|error| format!("could not create {}: {error}", link.display()))
}

#[cfg(not(unix))]
fn create_symlink(_target: &Path, _link: &Path) -> Result<(), String> {
    Err("CLI symlink installation is supported on Unix platforms only".into())
}

pub fn run() {
    let arguments = env::args().skip(1).collect::<Vec<_>>();
    let json = arguments.iter().any(|argument| argument == "--json");
    let arguments = arguments
        .into_iter()
        .filter(|argument| argument != "--json")
        .collect::<Vec<_>>();
    let result = execute(&arguments, json);
    if let Err(error) = result {
        eprintln!("termdeck: {error}");
        process::exit(1);
    }
}

fn execute(arguments: &[String], json: bool) -> Result<(), String> {
    match arguments {
        [] => {
            print_help();
            Ok(())
        }
        [command] if matches!(command.as_str(), "help" | "--help") => {
            print_help();
            Ok(())
        }
        [command] if matches!(command.as_str(), "--version" | "version") => {
            print_value(&serde_json::json!({ "version": VERSION }), json);
            Ok(())
        }
        [command] if command == "status" => {
            let projects = load_projects()?;
            print_value(
                &serde_json::json!({
                    "version": VERSION,
                    "projects": projects.len(),
                    "dataDirectory": data_directory(),
                }),
                json,
            );
            Ok(())
        }
        [command] if matches!(command.as_str(), "launch" | "open") => launch(),
        [group, command] if group == "projects" && command == "list" => {
            let projects = load_projects()?;
            print_value(&projects, json);
            Ok(())
        }
        [group, command, id] if group == "projects" && command == "get" => {
            let project = load_projects()?
                .into_iter()
                .find(|project| project.id == *id)
                .ok_or_else(|| format!("project not found: {id}"))?;
            print_value(&project, json);
            Ok(())
        }
        [group, command, name, directory] if group == "projects" && command == "create" => {
            let mut projects = load_projects()?;
            let directory = expand_user_path(directory);
            if !directory.is_dir() {
                return Err(format!(
                    "project directory does not exist: {}",
                    directory.display()
                ));
            }
            let id = next_project_id(&projects);
            let project = Project {
                id,
                name: name.clone(),
                directory: directory.to_string_lossy().into_owned(),
                commands: None,
                terminals: Some(serde_json::json!([])),
            };
            projects.push(project.clone());
            save_projects(&projects)?;
            print_value(&project, json);
            Ok(())
        }
        [group, command, id, name] if group == "projects" && command == "rename" => {
            let mut projects = load_projects()?;
            let project = projects
                .iter_mut()
                .find(|project| project.id == *id)
                .ok_or_else(|| format!("project not found: {id}"))?;
            project.name = name.clone();
            let output = project.clone();
            save_projects(&projects)?;
            print_value(&output, json);
            Ok(())
        }
        [group, command, id] if group == "projects" && command == "delete" => {
            let mut projects = load_projects()?;
            if projects.len() <= 1 {
                return Err("cannot delete the only project".into());
            }
            let count = projects.len();
            projects.retain(|project| project.id != *id);
            if projects.len() == count {
                return Err(format!("project not found: {id}"));
            }
            save_projects(&projects)?;
            print_value(&serde_json::json!({ "deleted": id }), json);
            Ok(())
        }
        _ => Err("unknown command; run `termdeck --help`".into()),
    }
}

fn launch() -> Result<(), String> {
    Command::new("open")
        .args(["-a", "Termdeck"])
        .status()
        .map_err(|error| format!("could not launch Termdeck: {error}"))?
        .success()
        .then_some(())
        .ok_or_else(|| "could not launch Termdeck".into())
}

fn load_projects() -> Result<Vec<Project>, String> {
    let path = projects_path();
    if !path.exists() {
        return Ok(Vec::new());
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("could not read {}: {error}", path.display()))?;
    serde_json::from_str(&contents)
        .map_err(|error| format!("could not parse {}: {error}", path.display()))
}

fn save_projects(projects: &[Project]) -> Result<(), String> {
    let path = projects_path();
    let parent = path
        .parent()
        .ok_or_else(|| format!("project path has no parent: {}", path.display()))?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("could not create {}: {error}", parent.display()))?;
    fs::write(
        &path,
        serde_json::to_vec_pretty(projects)
            .map_err(|error| format!("could not serialize projects: {error}"))?,
    )
    .map_err(|error| format!("could not write {}: {error}", path.display()))
}

fn next_project_id(projects: &[Project]) -> String {
    let mut suffix = projects.len() + 1;
    loop {
        let id = format!("project-{suffix}");
        if projects.iter().all(|project| project.id != id) {
            return id;
        }
        suffix += 1;
    }
}

fn data_directory() -> PathBuf {
    env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".config")
        .join("termdeck")
}

fn projects_path() -> PathBuf {
    data_directory().join("projects.json")
}

fn expand_user_path(path: &str) -> PathBuf {
    if path == "~" {
        env::var_os("HOME")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from(path))
    } else if let Some(rest) = path.strip_prefix("~/") {
        env::var_os("HOME")
            .map(|home| PathBuf::from(home).join(rest))
            .unwrap_or_else(|| PathBuf::from(path))
    } else {
        PathBuf::from(path)
    }
}

fn print_value(value: &impl Serialize, json: bool) {
    if json {
        println!(
            "{}",
            serde_json::to_string_pretty(value).unwrap_or_default()
        );
    } else {
        println!(
            "{}",
            serde_json::to_string_pretty(value).unwrap_or_default()
        );
    }
}

fn print_help() {
    println!(
        "Termdeck command line interface\n\nUsage:\n  termdeck [--json] <command> ...\n  termdeck --help\n  termdeck --version\n\nCommands:\n  launch | open                 Launch the Termdeck macOS app.\n  status                        Show local Termdeck configuration status.\n  projects list                 List configured projects.\n  projects get <id>             Show a project.\n  projects create <name> <path> Add an existing directory as a project.\n  projects rename <id> <name>   Rename a project.\n  projects delete <id>          Delete a project (cannot delete the last one).\n\nOptions:\n  --help                        Show this help.\n  --version                     Print the CLI version.\n  --json                        Emit JSON output."
    );
}
