use super::PtyStatus;
use std::collections::{HashMap, HashSet};

#[derive(Debug, PartialEq, Eq)]
struct Process {
    pid: u32,
    parent_pid: u32,
    process_group: i32,
    foreground_group: i32,
    command: String,
    arguments: String,
}

pub(super) fn inspect(requested: &[(String, Option<u32>)]) -> HashMap<String, PtyStatus> {
    inspect_platform(requested)
}

#[cfg(unix)]
fn inspect_platform(requested: &[(String, Option<u32>)]) -> HashMap<String, PtyStatus> {
    use std::process::Command;

    let processes = Command::new("ps")
        .args(["-axo", "pid=,ppid=,pgid=,tpgid=,comm=,args="])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| parse_processes(&String::from_utf8_lossy(&output.stdout)))
        .unwrap_or_default();

    let pids = requested
        .iter()
        .filter_map(|(_, pid)| *pid)
        .collect::<HashSet<_>>();
    let working_directories = inspect_working_directories(&pids);

    requested
        .iter()
        .map(|(id, pid)| {
            let status = pid
                .map(|pid| status_for(pid, &processes, working_directories.get(&pid).cloned()))
                .unwrap_or_else(empty_status);
            (id.clone(), status)
        })
        .collect()
}

#[cfg(unix)]
fn inspect_working_directories(pids: &HashSet<u32>) -> HashMap<u32, String> {
    use std::process::Command;

    if pids.is_empty() {
        return HashMap::new();
    }

    let pid_list = pids
        .iter()
        .map(u32::to_string)
        .collect::<Vec<_>>()
        .join(",");
    Command::new("lsof")
        .args(["-a", "-d", "cwd", "-p", &pid_list, "-Fn"])
        .output()
        .ok()
        .filter(|output| output.status.success())
        .map(|output| parse_working_directories(&String::from_utf8_lossy(&output.stdout)))
        .unwrap_or_default()
}

#[cfg(not(unix))]
fn inspect_platform(requested: &[(String, Option<u32>)]) -> HashMap<String, PtyStatus> {
    requested
        .iter()
        .map(|(id, _)| (id.clone(), empty_status()))
        .collect()
}

fn parse_processes(snapshot: &str) -> Vec<Process> {
    snapshot
        .lines()
        .filter_map(|line| {
            let mut fields = line.split_whitespace();
            Some(Process {
                pid: fields.next()?.parse().ok()?,
                parent_pid: fields.next()?.parse().ok()?,
                process_group: fields.next()?.parse().ok()?,
                foreground_group: fields.next()?.parse().ok()?,
                command: fields.next()?.to_string(),
                arguments: fields.collect::<Vec<_>>().join(" "),
            })
        })
        .collect()
}

fn parse_working_directories(snapshot: &str) -> HashMap<u32, String> {
    let mut current_pid = None;
    let mut directories = HashMap::new();

    for line in snapshot.lines() {
        if let Some(value) = line.strip_prefix('p') {
            current_pid = value.parse().ok();
        } else if let (Some(pid), Some(path)) = (current_pid, line.strip_prefix('n')) {
            directories.insert(pid, path.to_string());
        }
    }

    directories
}

fn status_for(shell_pid: u32, processes: &[Process], cwd: Option<String>) -> PtyStatus {
    let foreground_group = processes
        .iter()
        .find(|process| process.pid == shell_pid)
        .map(|process| process.foreground_group)
        .unwrap_or(-1);
    let descendants = descendants_of(shell_pid, processes);
    let foreground = processes.iter().filter(|process| {
        process.pid != shell_pid
            && descendants.contains(&process.pid)
            && foreground_group > 0
            && process.process_group == foreground_group
    });

    let process_name = foreground
        .clone()
        .max_by_key(|process| process.pid)
        .map(|process| executable_name(&process.command).to_string());
    let agent = foreground
        .filter(|process| is_pi_process(&process.command, &process.arguments))
        .map(|_| "pi".to_string())
        .next();

    PtyStatus {
        process_name,
        agent,
        cwd,
    }
}

fn descendants_of(shell_pid: u32, processes: &[Process]) -> HashSet<u32> {
    let mut descendants = HashSet::from([shell_pid]);
    let mut changed = true;
    while changed {
        changed = false;
        for process in processes {
            if descendants.contains(&process.parent_pid) && descendants.insert(process.pid) {
                changed = true;
            }
        }
    }
    descendants
}

fn executable_name(command: &str) -> &str {
    command
        .rsplit('/')
        .next()
        .unwrap_or(command)
        .trim_start_matches('-')
}

fn is_pi_process(command: &str, arguments: &str) -> bool {
    if executable_name(command).eq_ignore_ascii_case("pi") {
        return true;
    }

    let arguments = arguments.to_ascii_lowercase();
    arguments.contains("@earendil-works/pi-coding-agent")
        || arguments.contains("/pi-coding-agent/")
        || arguments.contains("/pi-coding-agent/dist/")
}

fn empty_status() -> PtyStatus {
    PtyStatus {
        process_name: None,
        agent: None,
        cwd: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PROCESS_FIXTURE: &str = include_str!("fixtures/processes.txt");
    const LSOF_FIXTURE: &str = include_str!("fixtures/lsof.txt");

    #[test]
    fn parses_process_snapshot_and_ignores_malformed_rows() {
        let processes = parse_processes(PROCESS_FIXTURE);

        assert_eq!(processes.len(), 7);
        assert_eq!(processes[0].pid, 201);
        assert_eq!(processes[0].arguments, "helper --mode child");
        assert_eq!(processes[2].command, "/bin/zsh");
    }

    #[test]
    fn selects_only_foreground_descendants() {
        let processes = parse_processes(PROCESS_FIXTURE);
        let status = status_for(100, &processes, Some("/tmp/project".to_string()));

        assert_eq!(status.process_name.as_deref(), Some("helper"));
        assert_eq!(status.agent.as_deref(), Some("pi"));
        assert_eq!(status.cwd.as_deref(), Some("/tmp/project"));

        let descendants = descendants_of(100, &processes);
        assert!(descendants.contains(&201));
        assert!(descendants.contains(&300));
        assert!(!descendants.contains(&400));
    }

    #[test]
    fn detects_pi_from_executable_and_package_arguments() {
        assert!(is_pi_process("/opt/bin/pi", "pi"));
        assert!(is_pi_process(
            "/usr/local/bin/node",
            "node /pkg/@earendil-works/pi-coding-agent/dist/cli.js"
        ));
        assert!(!is_pi_process("/usr/bin/python3", "python3 app.py"));
    }

    #[test]
    fn parses_batched_working_directories() {
        let directories = parse_working_directories(LSOF_FIXTURE);

        assert_eq!(
            directories.get(&100).map(String::as_str),
            Some("/tmp/project")
        );
        assert_eq!(
            directories.get(&500).map(String::as_str),
            Some("/Users/example")
        );
    }
}
