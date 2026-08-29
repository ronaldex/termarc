use serde::{Deserialize, Serialize};
use std::{
    env, fs,
    io::{self, Read, Write},
    path::{Path, PathBuf},
    process::{self, Command},
    time::Duration,
};

const VERSION: &str = env!("CARGO_PKG_VERSION");

const SUBAGENT_SKILL: &str = r#"# Termarc subagents

Use the Termarc CLI to run Pi agents in separate terminal tabs while retaining control from the parent agent.

## Workflow

1. Spawn a child and keep the returned `id`:
   - Pi agent: `termarc --json subagents spawn --name <label> --kind pi -- pi [--model <provider/model>] [--thinking <level>] -- <prompt>`
   - Generic process: `termarc --json subagents spawn --name <label> --kind process -- <command> [args...]`
   Use a Pi agent only when the child must interpret a prompt. For a direct command such as `npm run tauri build`, spawn a generic process. Omit Pi model and thinking options to use the child's normal Pi configuration.
2. Continue other work, or wait efficiently for a state change or an already-completed result:
   `termarc --json subagents wait <id> --result --timeout 300`
3. Inspect structured status when needed:
   `termarc --json subagents status <id>`
4. Retrieve the child's clean final assistant response:
   `termarc subagents result <id>`
   Use `termarc subagents output <id> --after <cursor>` only for diagnostics or as a fallback for processes without structured results.
5. Send a follow-up prompt:
   `termarc subagents send <id> --text <prompt>`
6. Stop a child that is no longer needed:
   `termarc subagents stop <id>`

`wait` reports state changes; it does not return the child's answer. For Pi subagents, always use `result` to retrieve the clean answer before responding to the user. Structured results are Pi-specific; generic processes continue to use `output`. Use output cursors for incremental diagnostic reads. A Pi transition from `processing` to `waiting` means its current turn has completed. The initial `waiting` state only means Pi is ready.

Inside a Termarc parent terminal, `TERMARC_TERMINAL_ID` supplies the parent automatically. Use the absolute executable in `TERMARC_CLI` when available rather than relying on PATH.
"#;

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
    /** Preserve fields owned by newer app versions during CLI mutations. */
    #[serde(flatten)]
    extra: serde_json::Map<String, serde_json::Value>,
}

#[tauri::command]
pub fn install_symlink() -> Result<String, String> {
    let executable = current_app_executable()?;
    if !executable
        .components()
        .any(|component| component.as_os_str() == "Contents")
    {
        return Err("install the Termarc app before adding its CLI to PATH".into());
    }
    let link = cli_symlink_path();
    let directory = link
        .parent()
        .ok_or_else(|| format!("CLI path has no parent: {}", link.display()))?;
    fs::create_dir_all(directory)
        .map_err(|error| format!("could not create {}: {error}", directory.display()))?;
    if link.symlink_metadata().is_ok() {
        if symlink_targets(&link, &executable) {
            return Ok(link.to_string_lossy().into_owned());
        }
        return Err(format!(
            "{} already exists; remove it before installing the Termarc CLI",
            link.display()
        ));
    }
    create_symlink(&executable, &link)?;
    Ok(link.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn is_symlink_installed() -> Result<bool, String> {
    Ok(symlink_targets(
        &cli_symlink_path(),
        &current_app_executable()?,
    ))
}

#[tauri::command]
pub fn remove_symlink() -> Result<String, String> {
    let link = cli_symlink_path();
    if link.symlink_metadata().is_err() {
        return Ok(link.to_string_lossy().into_owned());
    }
    if !symlink_targets(&link, &current_app_executable()?) {
        return Err(format!(
            "{} is not the Termarc CLI symlink and was not removed",
            link.display()
        ));
    }
    fs::remove_file(&link)
        .map_err(|error| format!("could not remove {}: {error}", link.display()))?;
    Ok(link.to_string_lossy().into_owned())
}

pub(crate) fn current_app_executable() -> Result<PathBuf, String> {
    env::current_exe().map_err(|error| format!("could not locate Termarc: {error}"))
}

fn cli_symlink_path() -> PathBuf {
    env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".local/bin/termarc")
}

fn symlink_targets(link: &Path, executable: &Path) -> bool {
    link.symlink_metadata()
        .is_ok_and(|metadata| metadata.file_type().is_symlink())
        && fs::read_link(link).is_ok_and(|target| target == executable)
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
    let (arguments, json) = split_global_options(env::args().skip(1));
    let result = execute(&arguments, json);
    if let Err(error) = result {
        if json {
            eprintln!(
                "{}",
                serde_json::json!({
                    "ok": false,
                    "error": { "code": "cli_error", "message": error }
                })
            );
        } else {
            eprintln!("termarc: {error}");
        }
        process::exit(1);
    }
}

fn split_global_options(arguments: impl IntoIterator<Item = String>) -> (Vec<String>, bool) {
    let mut filtered = Vec::new();
    let mut json = false;
    let mut command_payload = false;
    for argument in arguments {
        if argument == "--" {
            command_payload = true;
            filtered.push(argument);
        } else if argument == "--json" && !command_payload {
            json = true;
        } else {
            filtered.push(argument);
        }
    }
    (filtered, json)
}

fn execute(arguments: &[String], json: bool) -> Result<(), String> {
    execute_with_control(arguments, json, &crate::control::request)
}

fn execute_with_control(
    arguments: &[String],
    json: bool,
    control_request: &dyn Fn(
        crate::control::ControlRequest,
        Duration,
    )
        -> Result<crate::control::ControlResult, crate::control::ClientError>,
) -> Result<(), String> {
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
        [command] if command == "subagents" => {
            let status = crate::control::request_status().map_err(|error| error.to_string())?;
            print_value(&status, json);
            Ok(())
        }
        [group, help] if group == "subagents" && matches!(help.as_str(), "help" | "--help") => {
            print_subagents_help();
            Ok(())
        }
        [group, skill] if group == "subagents" && skill == "skill" => {
            println!("{SUBAGENT_SKILL}");
            Ok(())
        }
        [group, rest @ ..] if group == "subagents" => {
            execute_subagents_with_control(rest, json, control_request)
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
            let _guard = crate::projects::project_config_write_lock()?;
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
                extra: serde_json::Map::new(),
            };
            projects.push(project.clone());
            save_projects(&projects)?;
            print_value(&project, json);
            Ok(())
        }
        [group, command, id, name] if group == "projects" && command == "rename" => {
            let _guard = crate::projects::project_config_write_lock()?;
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
            let _guard = crate::projects::project_config_write_lock()?;
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
        _ => Err("unknown command; run `termarc --help`".into()),
    }
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum SubagentOutputMode {
    Value,
    List { aggregate: bool },
    Output { raw: bool },
    Result,
}

#[derive(Debug)]
struct ParsedSubagentCommand {
    request: crate::control::ControlRequest,
    timeout: Duration,
    output_mode: SubagentOutputMode,
}

fn execute_subagents_with_control(
    arguments: &[String],
    json: bool,
    control_request: &dyn Fn(
        crate::control::ControlRequest,
        Duration,
    )
        -> Result<crate::control::ControlResult, crate::control::ClientError>,
) -> Result<(), String> {
    if arguments
        .first()
        .is_some_and(|value| value == "report-result")
    {
        let sequence = parse_result_sequence(&arguments[1..])?;
        let owner = result_owner("report-result")?;
        return report_subagent_result(
            json,
            sequence,
            owner,
            &mut io::stdin().lock(),
            control_request,
        );
    }
    if arguments
        .first()
        .is_some_and(|value| value == "clear-result")
    {
        let sequence =
            parse_result_sequence(&arguments[1..])?.ok_or("clear-result requires --sequence")?;
        return clear_subagent_result(
            json,
            sequence,
            result_owner("clear-result")?,
            control_request,
        );
    }
    let parent = env::var("TERMARC_TERMINAL_ID").ok();
    let cwd = env::current_dir().map_err(|error| format!("could not determine cwd: {error}"))?;
    let parsed = parse_subagent_command(arguments, parent.as_deref(), &cwd)?;
    if let SubagentOutputMode::List { aggregate } = parsed.output_mode {
        return execute_subagent_list(
            parsed.request,
            parsed.timeout,
            aggregate,
            json,
            control_request,
        );
    }
    let result =
        control_request(parsed.request, parsed.timeout).map_err(|error| error.to_string())?;
    match (parsed.output_mode, &result) {
        (SubagentOutputMode::Output { raw }, crate::control::ControlResult::Output(output))
            if !json =>
        {
            if raw {
                io::stdout()
                    .write_all(&output.data)
                    .map_err(|error| format!("could not write output: {error}"))?;
            } else {
                print!("{}", String::from_utf8_lossy(&output.data));
            }
            Ok(())
        }
        (SubagentOutputMode::Result, crate::control::ControlResult::SubagentResult(result))
            if !json =>
        {
            print!("{}", result.text);
            Ok(())
        }
        (SubagentOutputMode::Output { .. }, _) if !json => {
            Err("control service returned invalid output data".into())
        }
        (SubagentOutputMode::Result, _) if !json => {
            Err("control service returned an invalid subagent result".into())
        }
        _ => {
            print_value(&result, json);
            Ok(())
        }
    }
}

fn parse_subagent_command(
    arguments: &[String],
    environment_parent: Option<&str>,
    cwd: &Path,
) -> Result<ParsedSubagentCommand, String> {
    let protocol_version = crate::control::PROTOCOL_VERSION;
    let result = match arguments {
        [command, rest @ ..] if command == "list" => parse_list_command(rest)?,
        [command, id] if command == "status" => ParsedSubagentCommand {
            request: crate::control::ControlRequest::SubagentStatus {
                protocol_version,
                id: id.clone(),
            },
            timeout: Duration::from_secs(2),
            output_mode: SubagentOutputMode::Value,
        },
        [command, id] if command == "result" => ParsedSubagentCommand {
            request: crate::control::ControlRequest::SubagentResult {
                protocol_version,
                id: id.clone(),
            },
            timeout: Duration::from_secs(2),
            output_mode: SubagentOutputMode::Result,
        },
        [command, id] if command == "stop" => ParsedSubagentCommand {
            request: crate::control::ControlRequest::SubagentStop {
                protocol_version,
                id: id.clone(),
            },
            timeout: Duration::from_secs(2),
            output_mode: SubagentOutputMode::Value,
        },
        [command, id, flag, text] if command == "send" && flag == "--text" => {
            let mut data = text.as_bytes().to_vec();
            data.push(b'\r');
            ParsedSubagentCommand {
                request: crate::control::ControlRequest::SubagentInput {
                    protocol_version,
                    id: id.clone(),
                    data,
                },
                timeout: Duration::from_secs(2),
                output_mode: SubagentOutputMode::Value,
            }
        }
        [command, rest @ ..] if command == "output" => parse_output_command(rest)?,
        [command, rest @ ..] if command == "wait" => parse_wait_command(rest)?,
        [command, rest @ ..] if command == "spawn" => {
            parse_spawn_command(rest, environment_parent, cwd)?
        }
        _ => return Err("invalid subagents command; run `termarc --help`".into()),
    };
    Ok(result)
}

fn parse_list_command(arguments: &[String]) -> Result<ParsedSubagentCommand, String> {
    let mut parent_terminal_id = None;
    let mut cursor = None;
    let mut limit = None;
    let mut paged = false;
    let mut index = 0;
    while index < arguments.len() {
        let flag = arguments[index].as_str();
        if !matches!(flag, "--parent" | "--cursor" | "--limit") {
            return Err(format!("unknown list option: {flag}"));
        }
        index += 1;
        let value = arguments
            .get(index)
            .ok_or_else(|| format!("{flag} requires a value"))?;
        match flag {
            "--parent" => parent_terminal_id = Some(value.clone()),
            "--cursor" => {
                cursor = Some(value.clone());
                paged = true;
            }
            "--limit" => {
                limit = Some(
                    value
                        .parse::<usize>()
                        .map_err(|_| "invalid value for --limit".to_string())?,
                );
                paged = true;
            }
            _ => unreachable!(),
        }
        index += 1;
    }
    Ok(ParsedSubagentCommand {
        request: crate::control::ControlRequest::SubagentList {
            protocol_version: crate::control::PROTOCOL_VERSION,
            parent_terminal_id,
            cursor,
            limit,
        },
        timeout: Duration::from_secs(2),
        output_mode: SubagentOutputMode::List { aggregate: !paged },
    })
}

fn execute_subagent_list(
    mut request: crate::control::ControlRequest,
    timeout: Duration,
    aggregate: bool,
    json: bool,
    control_request: &dyn Fn(
        crate::control::ControlRequest,
        Duration,
    )
        -> Result<crate::control::ControlResult, crate::control::ClientError>,
) -> Result<(), String> {
    let mut all = Vec::new();
    let mut seen_cursors = std::collections::HashSet::new();
    loop {
        let result =
            control_request(request.clone(), timeout).map_err(|error| error.to_string())?;
        let crate::control::ControlResult::List(page) = result else {
            return Err("control service returned an invalid subagent list".into());
        };
        if !aggregate {
            print_value(&page, json);
            return Ok(());
        }
        all.try_reserve(page.items.len())
            .map_err(|_| "subagent list is too large to aggregate safely")?;
        all.extend(page.items);
        let Some(next_cursor) = page.next_cursor else {
            break;
        };
        if !seen_cursors.insert(next_cursor.clone()) {
            return Err("control service returned a repeated subagent list cursor".into());
        }
        let crate::control::ControlRequest::SubagentList { cursor, .. } = &mut request else {
            unreachable!("list execution requires a list request")
        };
        *cursor = Some(next_cursor);
    }
    print_value(&all, json);
    Ok(())
}

fn result_owner(command: &str) -> Result<(String, String), String> {
    let subagent_id = env::var("TERMARC_SUBAGENT_ID")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| format!("{command} requires TERMARC_SUBAGENT_ID"))?;
    let terminal_id = env::var("TERMARC_TERMINAL_ID")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| format!("{command} requires TERMARC_TERMINAL_ID"))?;
    Ok((subagent_id, terminal_id))
}

fn parse_result_sequence(arguments: &[String]) -> Result<Option<u64>, String> {
    match arguments {
        [] => Ok(None),
        [flag, value] if flag == "--sequence" => value
            .parse()
            .map(Some)
            .map_err(|_| "invalid value for --sequence".into()),
        _ => Err("result mutation accepts only --sequence <number>".into()),
    }
}

fn report_subagent_result(
    json: bool,
    sequence: Option<u64>,
    (subagent_id, terminal_id): (String, String),
    input: &mut dyn Read,
    control_request: &dyn Fn(
        crate::control::ControlRequest,
        Duration,
    )
        -> Result<crate::control::ControlResult, crate::control::ClientError>,
) -> Result<(), String> {
    let mut text = Vec::new();
    input
        .take((crate::subagents::MAX_RESULT_BYTES + 1) as u64)
        .read_to_end(&mut text)
        .map_err(|error| format!("could not read subagent result: {error}"))?;
    if text.len() > crate::subagents::MAX_RESULT_BYTES {
        return Err(format!(
            "subagent result exceeds {} bytes",
            crate::subagents::MAX_RESULT_BYTES
        ));
    }
    let text = String::from_utf8(text).map_err(|_| "subagent result must be UTF-8")?;
    let result = control_request(
        crate::control::ControlRequest::SubagentResultUpdate {
            protocol_version: crate::control::PROTOCOL_VERSION,
            update: crate::subagents::SubagentResultUpdate {
                subagent_id,
                terminal_id,
                text,
                sequence,
            },
        },
        Duration::from_secs(2),
    )
    .map_err(|error| error.to_string())?;
    if json {
        print_value(&result, true);
    }
    Ok(())
}

fn clear_subagent_result(
    json: bool,
    sequence: u64,
    (subagent_id, terminal_id): (String, String),
    control_request: &dyn Fn(
        crate::control::ControlRequest,
        Duration,
    )
        -> Result<crate::control::ControlResult, crate::control::ClientError>,
) -> Result<(), String> {
    let result = control_request(
        crate::control::ControlRequest::SubagentResultClear {
            protocol_version: crate::control::PROTOCOL_VERSION,
            clear: crate::subagents::SubagentResultClear {
                subagent_id,
                terminal_id,
                sequence,
            },
        },
        Duration::from_secs(2),
    )
    .map_err(|error| error.to_string())?;
    if json {
        print_value(&result, true);
    }
    Ok(())
}

fn parse_output_command(arguments: &[String]) -> Result<ParsedSubagentCommand, String> {
    let id = arguments.first().ok_or("output requires a subagent ID")?;
    if id.starts_with('-') {
        return Err("output requires a subagent ID before its options".into());
    }
    let mut after = 0_u64;
    let mut limit = None;
    let mut raw = false;
    let mut index = 1;
    while index < arguments.len() {
        match arguments[index].as_str() {
            "--raw" => raw = true,
            "--after" | "--limit" => {
                let flag = arguments[index].as_str();
                index += 1;
                let number = arguments
                    .get(index)
                    .ok_or_else(|| format!("{flag} requires a value"))?
                    .parse::<u64>()
                    .map_err(|_| format!("invalid value for {flag}"))?;
                if flag == "--after" {
                    after = number;
                } else {
                    limit = Some(number);
                }
            }
            flag => return Err(format!("unknown output option: {flag}")),
        }
        index += 1;
    }
    Ok(ParsedSubagentCommand {
        request: crate::control::ControlRequest::SubagentOutput {
            protocol_version: crate::control::PROTOCOL_VERSION,
            id: id.clone(),
            after,
            format: if raw {
                crate::subagents::OutputFormat::Raw
            } else {
                crate::subagents::OutputFormat::Plain
            },
            limit: limit
                .map(|value| usize::try_from(value).map_err(|_| "output limit is too large"))
                .transpose()?,
        },
        timeout: Duration::from_secs(2),
        output_mode: SubagentOutputMode::Output { raw },
    })
}

fn parse_wait_command(arguments: &[String]) -> Result<ParsedSubagentCommand, String> {
    let id = arguments.first().ok_or("wait requires a subagent ID")?;
    if id.starts_with('-') {
        return Err("wait requires a subagent ID before its options".into());
    }
    let mut timeout_seconds = 300_u64;
    let mut return_if_result_available = false;
    let mut index = 1;
    while index < arguments.len() {
        match arguments[index].as_str() {
            "--result" => return_if_result_available = true,
            "--timeout" => {
                index += 1;
                timeout_seconds = arguments
                    .get(index)
                    .ok_or("--timeout requires a value")?
                    .parse::<u64>()
                    .map_err(|_| "invalid value for --timeout".to_string())?;
            }
            flag => return Err(format!("unknown wait option: {flag}")),
        }
        index += 1;
    }
    let timeout_ms = timeout_seconds
        .checked_mul(1_000)
        .ok_or("wait timeout is too large")?;
    Ok(ParsedSubagentCommand {
        request: crate::control::ControlRequest::SubagentWait {
            protocol_version: crate::control::PROTOCOL_VERSION,
            id: id.clone(),
            timeout_ms,
            return_if_result_available,
        },
        timeout: Duration::from_millis(timeout_ms),
        output_mode: SubagentOutputMode::Value,
    })
}

fn parse_spawn_command(
    arguments: &[String],
    environment_parent: Option<&str>,
    cwd: &Path,
) -> Result<ParsedSubagentCommand, String> {
    let separator = arguments
        .iter()
        .position(|argument| argument == "--")
        .ok_or("spawn requires `--` before the command")?;
    let (options, command_with_separator) = arguments.split_at(separator);
    let command_arguments = &command_with_separator[1..];
    if command_arguments.is_empty() {
        return Err("spawn requires a command after `--`".into());
    }
    let mut parent = None;
    let mut name = None;
    let mut project = None;
    let mut spawn_cwd = None;
    let mut process_kind = None;
    let mut index = 0;
    while index < options.len() {
        let flag = options[index].as_str();
        if !matches!(
            flag,
            "--parent" | "--name" | "--project" | "--cwd" | "--kind"
        ) {
            return Err(format!("unknown spawn option: {flag}"));
        }
        index += 1;
        let option_value = options
            .get(index)
            .ok_or_else(|| format!("{flag} requires a value"))?
            .clone();
        match flag {
            "--parent" => parent = Some(option_value),
            "--name" => name = Some(option_value),
            "--project" => project = Some(option_value),
            "--cwd" => spawn_cwd = Some(option_value),
            "--kind" => process_kind = Some(option_value),
            _ => unreachable!(),
        }
        index += 1;
    }
    let parent = parent
        .or_else(|| environment_parent.map(str::to_owned))
        .filter(|parent| !parent.trim().is_empty())
        .ok_or("spawn requires --parent outside a Termarc terminal")?;
    let name = name
        .filter(|name| !name.trim().is_empty())
        .ok_or("spawn requires --name")?;
    let command = command_arguments
        .iter()
        .map(|argument| shell_quote(argument))
        .collect::<Vec<_>>()
        .join(" ");
    let process_kind = process_kind.unwrap_or_else(|| {
        Path::new(&command_arguments[0])
            .file_name()
            .is_some_and(|name| name == "pi")
            .then_some("pi")
            .unwrap_or("process")
            .into()
    });
    Ok(ParsedSubagentCommand {
        request: crate::control::ControlRequest::SubagentSpawn {
            protocol_version: crate::control::PROTOCOL_VERSION,
            request: crate::subagents::ReserveSubagent {
                parent_terminal_id: parent,
                project_id: project.unwrap_or_default(),
                name,
                command,
                cwd: spawn_cwd.unwrap_or_else(|| cwd.to_string_lossy().into_owned()),
                process_kind: process_kind.into(),
            },
        },
        timeout: Duration::from_secs(12),
        output_mode: SubagentOutputMode::Value,
    })
}

fn shell_quote(argument: &str) -> String {
    if !argument.is_empty()
        && argument
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"_@%+=:,./-".contains(&byte))
    {
        argument.into()
    } else {
        format!("'{}'", argument.replace('\'', "'\\''"))
    }
}

fn launch() -> Result<(), String> {
    Command::new("open")
        .args(["-a", "Termarc"])
        .status()
        .map_err(|error| format!("could not launch Termarc: {error}"))?
        .success()
        .then_some(())
        .ok_or_else(|| "could not launch Termarc".into())
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
    let contents = serde_json::to_vec_pretty(projects)
        .map_err(|error| format!("could not serialize projects: {error}"))?;
    crate::projects::atomic_write(&path, &contents)
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
    crate::paths::config_directory()
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

#[cfg(test)]
mod tests {
    use super::{
        Project, SUBAGENT_SKILL, SubagentOutputMode, clear_subagent_result, execute_with_control,
        parse_subagent_command, report_subagent_result, split_global_options,
    };
    use std::{
        fs,
        path::{Path, PathBuf},
        sync::{
            Arc,
            atomic::{AtomicU64, Ordering},
        },
        time::Duration,
    };

    static CLI_TEST_SOCKET_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    #[cfg(unix)]
    #[test]
    fn real_cli_command_crosses_parser_unix_client_server_dispatch_and_registry() {
        use crate::{
            control::{ControlDispatcher, ControlServer, request_at},
            spawn_router::SpawnRouter,
            subagents::{
                AttachSubagent, SubagentPtyOwner, SubagentRegistry, TopLevelTerminalMetadata,
            },
        };

        let sequence = CLI_TEST_SOCKET_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let directory = PathBuf::from(format!("/tmp/tarc-cli-{}-{sequence}", std::process::id()));
        fs::create_dir_all(&directory).unwrap();
        let socket = directory.join("control.sock");
        let registry = SubagentRegistry::default();
        registry
            .register_top_level_terminals(
                "main",
                vec![TopLevelTerminalMetadata {
                    terminal_id: "parent-cli".into(),
                    project_id: "project-cli".into(),
                }],
            )
            .unwrap();
        let attached = registry.clone();
        let router = SpawnRouter::new(registry.clone(), move |_, event| {
            attached
                .attach(AttachSubagent {
                    owner: SubagentPtyOwner {
                        id: event.subagent_id.clone(),
                        parent_terminal_id: event.parent_terminal_id.clone(),
                        project_id: event.project_id.clone(),
                        name: event.name.clone(),
                        process_kind: event.process_kind.clone(),
                    },
                    terminal_id: format!("terminal-{}", event.subagent_id),
                    pty_id: format!("pty-{}", event.subagent_id),
                    pid: None,
                    command: event.command.clone(),
                    cwd: event.cwd.clone(),
                    input: Arc::new(|_| Ok(())),
                    stop: Arc::new(|| Ok(())),
                })
                .map_err(|error| error.to_string())?;
            attached
                .acknowledge(crate::subagents::SubagentSpawnAcknowledgement {
                    subagent_id: event.subagent_id.clone(),
                    success: true,
                    error: None,
                })
                .map_err(|error| error.to_string())
        });
        let server = ControlServer::start_at(
            socket.clone(),
            ControlDispatcher::new(registry.clone(), router),
            2,
        )
        .unwrap();
        let command = arguments(&[
            "subagents",
            "spawn",
            "--parent",
            "parent-cli",
            "--name",
            "CLI child",
            "--kind",
            "pi",
            "--",
            "printf",
            "a b",
        ]);

        execute_with_control(&command, true, &|request, timeout| {
            request_at(&socket, &request, timeout)
        })
        .unwrap();

        let statuses = registry.list(Some("parent-cli")).unwrap();
        assert_eq!(statuses.len(), 1);
        assert_eq!(statuses[0].name, "CLI child");
        assert_eq!(statuses[0].command, "printf 'a b'");
        assert_eq!(statuses[0].project_id, "project-cli");

        let owner = (statuses[0].id.clone(), statuses[0].terminal_id.clone());
        let transport = |request, timeout| request_at(&socket, &request, timeout);
        report_subagent_result(
            false,
            None,
            owner.clone(),
            &mut std::io::Cursor::new(b"legacy before sequencing"),
            &transport,
        )
        .unwrap();
        report_subagent_result(
            false,
            Some(100),
            owner.clone(),
            &mut std::io::Cursor::new(b"sequenced result"),
            &transport,
        )
        .unwrap();
        clear_subagent_result(false, 101, owner.clone(), &transport).unwrap();
        let late_legacy = report_subagent_result(
            false,
            None,
            owner,
            &mut std::io::Cursor::new(b"late legacy result"),
            &transport,
        )
        .unwrap_err();
        assert!(late_legacy.contains("unsequenced result mutation"));
        assert!(registry.result(&statuses[0].id).is_err());
        drop(server);
        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn project_mutations_preserve_app_owned_fields() {
        let mut project: Project = serde_json::from_str(
            r#"{"id":"p","name":"Old","directory":".","externalEditor":"vscode","future":{"enabled":true},"commands":[{"id":"build","order":2}],"terminals":[{"id":"terminal-a"}]}"#,
        )
        .expect("project should parse");
        project.name = "New".into();
        let value = serde_json::to_value(project).expect("project should serialize");
        assert_eq!(value["externalEditor"], "vscode");
        assert_eq!(value["future"]["enabled"], true);
        assert_eq!(value["commands"][0]["order"], 2);
        assert_eq!(value["terminals"][0]["id"], "terminal-a");
    }

    fn arguments(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).into()).collect()
    }

    fn request_value(request: &crate::control::ControlRequest) -> serde_json::Value {
        serde_json::to_value(request).expect("request should serialize")
    }

    #[test]
    fn spawn_infers_parent_and_builds_the_supported_request() {
        let parsed = parse_subagent_command(
            &arguments(&["spawn", "--name", "Research", "--", "pi", "a b"]),
            Some("terminal-7"),
            Path::new("/tmp/project"),
        )
        .expect("spawn should parse");

        assert_eq!(request_value(&parsed.request)["type"], "subagentSpawn");
        assert_eq!(
            request_value(&parsed.request)["parentTerminalId"],
            "terminal-7"
        );
        assert_eq!(request_value(&parsed.request)["projectId"], "");
        assert_eq!(request_value(&parsed.request)["name"], "Research");
        assert_eq!(request_value(&parsed.request)["command"], "pi 'a b'");
        assert_eq!(request_value(&parsed.request)["cwd"], "/tmp/project");
        assert_eq!(request_value(&parsed.request)["processKind"], "pi");
    }

    #[test]
    fn spawn_requires_or_accepts_an_explicit_parent() {
        let missing = parse_subagent_command(
            &arguments(&["spawn", "--name", "Research", "--", "pi"]),
            None,
            Path::new("/tmp"),
        )
        .expect_err("external spawn should require a parent");
        assert!(missing.contains("requires --parent"));

        let parsed = parse_subagent_command(
            &arguments(&[
                "spawn",
                "--parent",
                "terminal-2",
                "--name",
                "Research",
                "--",
                "pi",
            ]),
            Some("terminal-env"),
            Path::new("/tmp"),
        )
        .expect("explicit parent should parse");
        assert_eq!(
            request_value(&parsed.request)["parentTerminalId"],
            "terminal-2"
        );
    }

    #[test]
    fn output_and_wait_options_map_to_control_requests() {
        let output = parse_subagent_command(
            &arguments(&["output", "subagent-3", "--after", "42", "--raw"]),
            None,
            Path::new("/tmp"),
        )
        .unwrap();
        assert_eq!(request_value(&output.request)["format"], "raw");
        assert_eq!(request_value(&output.request)["after"], 42);
        assert_eq!(output.output_mode, SubagentOutputMode::Output { raw: true });

        let wait = parse_subagent_command(
            &arguments(&["wait", "subagent-3", "--timeout", "7"]),
            None,
            Path::new("/tmp"),
        )
        .unwrap();
        assert_eq!(request_value(&wait.request)["type"], "subagentWait");
        assert_eq!(request_value(&wait.request)["timeoutMs"], 7_000);
        assert_eq!(
            request_value(&wait.request)["returnIfResultAvailable"],
            false
        );
        assert_eq!(wait.timeout, Duration::from_secs(7));

        let completed = parse_subagent_command(
            &arguments(&["wait", "subagent-3", "--result", "--timeout", "7"]),
            None,
            Path::new("/tmp"),
        )
        .unwrap();
        assert_eq!(
            request_value(&completed.request)["returnIfResultAvailable"],
            true
        );
    }

    #[test]
    fn list_aggregates_typed_pages_and_rejects_cursor_cycles() {
        fn status(id: &str) -> crate::subagents::SubagentStatus {
            serde_json::from_value(serde_json::json!({
                "id": id,
                "parentTerminalId": "parent",
                "terminalId": format!("terminal-{id}"),
                "ptyId": format!("pty-{id}"),
                "projectId": "project",
                "name": id,
                "processKind": "pi",
                "command": "pi",
                "cwd": "/tmp",
                "lifecycle": "running",
                "pid": null,
                "exitCode": null,
                "error": null,
                "createdAt": 1,
                "startedAt": 1,
                "endedAt": null,
                "rawOutputCursor": 0,
                "plainOutputCursor": 0,
                "resultAvailable": false
            }))
            .unwrap()
        }

        let calls = std::sync::atomic::AtomicUsize::new(0);
        execute_with_control(&arguments(&["subagents", "list"]), true, &|request, _| {
            let call = calls.fetch_add(1, Ordering::Relaxed);
            let crate::control::ControlRequest::SubagentList { cursor, .. } = request else {
                panic!("expected list request")
            };
            if call == 0 {
                assert_eq!(cursor, None);
                Ok(crate::control::ControlResult::List(
                    crate::subagents::SubagentListPage {
                        items: vec![status("subagent-1")],
                        next_cursor: Some("v1:1".into()),
                    },
                ))
            } else {
                assert_eq!(cursor.as_deref(), Some("v1:1"));
                Ok(crate::control::ControlResult::List(
                    crate::subagents::SubagentListPage {
                        items: vec![status("subagent-2")],
                        next_cursor: None,
                    },
                ))
            }
        })
        .unwrap();
        assert_eq!(calls.load(Ordering::Relaxed), 2);

        let repeated = execute_with_control(&arguments(&["subagents", "list"]), true, &|_, _| {
            Ok(crate::control::ControlResult::List(
                crate::subagents::SubagentListPage {
                    items: Vec::new(),
                    next_cursor: Some("v1:1".into()),
                },
            ))
        })
        .unwrap_err();
        assert!(repeated.contains("repeated"));
    }

    #[test]
    fn global_json_does_not_consume_spawn_command_arguments() {
        let (parsed_arguments, json) = split_global_options(arguments(&[
            "--json",
            "subagents",
            "spawn",
            "--name",
            "Child",
            "--",
            "pi",
            "--json",
        ]));
        assert!(json);
        assert_eq!(
            parsed_arguments,
            arguments(&[
                "subagents",
                "spawn",
                "--name",
                "Child",
                "--",
                "pi",
                "--json"
            ])
        );
    }

    #[test]
    fn subagent_skill_explains_result_retrieval() {
        assert!(SUBAGENT_SKILL.contains("always use `result` to retrieve the clean answer"));
        assert!(SUBAGENT_SKILL.contains("Generic process"));
        assert!(SUBAGENT_SKILL.contains("npm run tauri build"));
        assert!(SUBAGENT_SKILL.contains("processing` to `waiting"));
        assert!(SUBAGENT_SKILL.contains("TERMARC_CLI"));
    }

    #[test]
    fn result_requests_clean_assistant_output() {
        let parsed = parse_subagent_command(
            &arguments(&["result", "subagent-1"]),
            None,
            Path::new("/tmp"),
        )
        .unwrap();
        assert_eq!(request_value(&parsed.request)["type"], "subagentResult");
        assert_eq!(parsed.output_mode, SubagentOutputMode::Result);
    }

    #[test]
    fn send_encodes_text_followed_by_terminal_enter() {
        let parsed = parse_subagent_command(
            &arguments(&["send", "subagent-1", "--text", "continue"]),
            None,
            Path::new("/tmp"),
        )
        .unwrap();
        assert_eq!(request_value(&parsed.request)["type"], "subagentInput");
        assert_eq!(
            request_value(&parsed.request)["data"],
            serde_json::json!(b"continue\r")
        );
    }
}

fn print_help() {
    println!(
        "Termarc command line interface\n\nUsage:\n  termarc [--json] <command> ...\n  termarc --help\n  termarc --version\n\nCommands:\n  launch | open                 Launch the Termarc macOS app.\n  status                        Show local Termarc configuration status.\n  subagents                     Verify the running subagent control service.\n  subagents help                Show subagent command grammar.\n  subagents skill               Show agent-oriented workflow guidance.\n  projects list                 List configured projects.\n  projects get <id>             Show a project.\n  projects create <name> <path> Add an existing directory as a project.\n  projects rename <id> <name>   Rename a project.\n  projects delete <id>          Delete a project (cannot delete the last one).\n\nOptions:\n  --help                        Show this help.\n  --version                     Print the CLI version.\n  --json                        Emit JSON output (before a spawn command's `--`)."
    );
}

fn print_subagents_help() {
    println!(
        "Usage:\n  termarc subagents skill\n  termarc subagents spawn [--parent <terminal-id>] --name <name> [--project <project-id>] [--cwd <path>] [--kind <kind>] -- <command> [args...]\n  termarc subagents list [--parent <terminal-id>] [--json]\n  termarc subagents status <subagent-id> [--json]\n  termarc subagents result <subagent-id> [--json]\n  termarc subagents output <subagent-id> [--after <cursor>] [--limit <bytes>] [--raw] [--json]\n  termarc subagents send <subagent-id> --text <text>\n  termarc subagents wait <subagent-id> [--result] [--timeout <seconds>] [--json]\n  termarc subagents stop <subagent-id>"
    );
}
