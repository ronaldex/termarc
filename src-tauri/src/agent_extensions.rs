use serde::Serialize;
use std::{env, fs, path::PathBuf};

const VERSION: &str = env!("CARGO_PKG_VERSION");

const PI_EXTENSION_FILES: &[(&str, &str)] = &[
    (
        "index.ts",
        include_str!("../../extensions/pi/index.ts"),
    ),
    (
        "termarc-status/cli.ts",
        include_str!("../../extensions/pi/termarc-status/cli.ts"),
    ),
    (
        "termarc-status/environment.ts",
        include_str!("../../extensions/pi/termarc-status/environment.ts"),
    ),
    (
        "termarc-status/osc.ts",
        include_str!("../../extensions/pi/termarc-status/osc.ts"),
    ),
    (
        "termarc-status/results.ts",
        include_str!("../../extensions/pi/termarc-status/results.ts"),
    ),
    (
        "termarc-status/watchers.ts",
        include_str!("../../extensions/pi/termarc-status/watchers.ts"),
    ),
    (
        "termarc-status/subagent/agents.ts",
        include_str!("../../extensions/pi/termarc-status/subagent/agents.ts"),
    ),
    (
        "termarc-status/subagent/render.ts",
        include_str!("../../extensions/pi/termarc-status/subagent/render.ts"),
    ),
    (
        "termarc-status/subagent/runner-events.ts",
        include_str!("../../extensions/pi/termarc-status/subagent/runner-events.ts"),
    ),
    (
        "termarc-status/subagent/settings.ts",
        include_str!("../../extensions/pi/termarc-status/subagent/settings.ts"),
    ),
    (
        "termarc-status/subagent/types.ts",
        include_str!("../../extensions/pi/termarc-status/subagent/types.ts"),
    ),
];

struct AgentExtension {
    directory: &'static str,
    filename: &'static str,
    files: &'static [(&'static str, &'static str)],
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentExtensionStatus {
    path: String,
    installed: bool,
    current: bool,
    update_available: bool,
    bundled_version: &'static str,
}

impl AgentExtension {
    fn for_id(id: &str) -> Result<Self, String> {
        match id {
            "pi" => Ok(Self {
                directory: ".pi/agent/extensions",
                filename: "index.ts",
                files: PI_EXTENSION_FILES,
            }),
            _ => Err(format!("unsupported agent extension: {id}")),
        }
    }
}

#[tauri::command]
pub fn install_agent_extension(agent: String) -> Result<String, String> {
    install(&agent, home_directory()?)
}

#[tauri::command]
pub fn is_agent_extension_installed(agent: String) -> Result<bool, String> {
    Ok(extension_status(&agent, home_directory()?)?.current)
}

#[tauri::command]
pub fn get_agent_extension_status(agent: String) -> Result<AgentExtensionStatus, String> {
    extension_status(&agent, home_directory()?)
}

#[tauri::command]
pub fn remove_agent_extension(agent: String) -> Result<String, String> {
    remove(&agent, home_directory()?)
}

fn home_directory() -> Result<PathBuf, String> {
    env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| "could not locate your home directory".to_string())
}

fn extension_path(agent: &str, home: PathBuf) -> Result<PathBuf, String> {
    let extension = AgentExtension::for_id(agent)?;
    Ok(home.join(extension.directory).join(extension.filename))
}

fn extension_status(agent: &str, home: PathBuf) -> Result<AgentExtensionStatus, String> {
    let extension = AgentExtension::for_id(agent)?;
    let destination = extension_path(agent, home.clone())?;
    let installed = destination.symlink_metadata().is_ok();
    let current = extension.files.iter().all(|(relative, source)| {
        fs::read_to_string(home.join(extension.directory).join(relative))
            .is_ok_and(|installed| installed == *source)
    });
    Ok(AgentExtensionStatus {
        path: destination.to_string_lossy().into_owned(),
        installed,
        current,
        update_available: installed && !current,
        bundled_version: VERSION,
    })
}

fn install(agent: &str, home: PathBuf) -> Result<String, String> {
    let extension = AgentExtension::for_id(agent)?;
    let directory = home.join(extension.directory);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("could not create {}: {error}", directory.display()))?;

    let destination = directory.join(extension.filename);
    if extension.files.iter().all(|(relative, source)| {
        fs::read_to_string(directory.join(relative)).is_ok_and(|contents| contents == *source)
    }) {
        return Ok(destination.to_string_lossy().into_owned());
    }

    // Install imported modules first and the entrypoint last. Each file is
    // replaced atomically, so an older standalone entry remains usable until
    // every dependency required by the new entrypoint is present.
    for (relative, source) in extension
        .files
        .iter()
        .skip(1)
        .chain(extension.files.iter().take(1))
    {
        let target = directory.join(relative);
        let parent = target
            .parent()
            .ok_or_else(|| format!("extension path has no parent: {}", target.display()))?;
        fs::create_dir_all(parent)
            .map_err(|error| format!("could not create {}: {error}", parent.display()))?;
        let filename = target
            .file_name()
            .ok_or_else(|| format!("extension path has no filename: {}", target.display()))?;
        let temporary = parent.join(format!(".{}.termarc-tmp", filename.to_string_lossy()));
        fs::write(&temporary, source)
            .map_err(|error| format!("could not write {}: {error}", temporary.display()))?;
        if let Err(error) = fs::rename(&temporary, &target) {
            let _ = fs::remove_file(&temporary);
            return Err(format!(
                "could not install extension at {}: {error}",
                target.display()
            ));
        }
    }

    Ok(destination.to_string_lossy().into_owned())
}

fn remove(agent: &str, home: PathBuf) -> Result<String, String> {
    let destination = extension_path(agent, home)?;
    let module_directory = destination.with_extension("");
    if destination.symlink_metadata().is_ok() {
        fs::remove_file(&destination)
            .map_err(|error| format!("could not remove {}: {error}", destination.display()))?;
    }
    if module_directory.is_dir() {
        fs::remove_dir_all(&module_directory)
            .map_err(|error| format!("could not remove {}: {error}", module_directory.display()))?;
    }
    Ok(destination.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT_TEMPORARY_HOME: AtomicU64 = AtomicU64::new(0);

    fn temporary_home() -> PathBuf {
        env::temp_dir().join(format!(
            "termarc-agent-extension-{}-{}",
            std::process::id(),
            NEXT_TEMPORARY_HOME.fetch_add(1, Ordering::Relaxed)
        ))
    }

    #[test]
    fn installs_pi_extension_and_creates_directories() {
        let home = temporary_home();
        let installed = install("pi", home.clone()).expect("extension should install");
        let destination = home.join(".pi/agent/extensions/index.ts");

        assert_eq!(PathBuf::from(installed), destination);
        assert_eq!(
            fs::read_to_string(&destination).expect("extension should be readable"),
            PI_EXTENSION_FILES[0].1
        );
        for (relative, source) in &PI_EXTENSION_FILES[1..] {
            assert_eq!(
                fs::read_to_string(home.join(".pi/agent/extensions").join(relative))
                    .expect("extension module should be readable"),
                *source
            );
        }

        fs::remove_dir_all(home).expect("temporary home should be removable");
    }

    #[test]
    fn installed_status_requires_the_current_extension_source() {
        let home = temporary_home();
        let destination = home.join(".pi/agent/extensions/index.ts");
        fs::create_dir_all(
            destination
                .parent()
                .expect("destination should have a parent"),
        )
        .expect("extension directory should be created");
        fs::write(&destination, "outdated").expect("outdated extension should be written");

        let outdated = extension_status("pi", home.clone()).expect("status should load");
        assert!(outdated.installed);
        assert!(!outdated.current);
        assert!(outdated.update_available);

        install("pi", home.clone()).expect("extension should update");
        let current = extension_status("pi", home.clone()).expect("status should load");
        assert!(current.installed);
        assert!(current.current);
        assert!(!current.update_available);
        assert_eq!(current.bundled_version, VERSION);

        let helper = home.join(".pi/agent/extensions/termarc-status/watchers.ts");
        fs::write(&helper, "outdated helper").expect("helper should be replaceable");
        let outdated_helper = extension_status("pi", home.clone()).expect("status should load");
        assert!(!outdated_helper.current);
        assert!(outdated_helper.update_available);
        install("pi", home.clone()).expect("extension helper should update");
        assert_eq!(
            fs::read_to_string(helper).expect("helper should be readable"),
            PI_EXTENSION_FILES[5].1
        );

        fs::remove_dir_all(home).expect("temporary home should be removable");
    }

    #[test]
    fn replaces_an_outdated_termarc_extension() {
        let home = temporary_home();
        let destination = home.join(".pi/agent/extensions/index.ts");
        fs::create_dir_all(
            destination
                .parent()
                .expect("destination should have a parent"),
        )
        .expect("extension directory should be created");
        fs::write(&destination, "outdated").expect("outdated extension should be written");

        install("pi", home.clone()).expect("extension should update");

        assert_eq!(
            fs::read_to_string(destination).expect("extension should be readable"),
            PI_EXTENSION_FILES[0].1
        );
        fs::remove_dir_all(home).expect("temporary home should be removable");
    }

    #[test]
    fn removes_an_installed_extension() {
        let home = temporary_home();
        let destination =
            PathBuf::from(install("pi", home.clone()).expect("extension should install"));

        let removed = remove("pi", home.clone()).expect("extension should be removed");

        assert_eq!(PathBuf::from(removed), destination);
        assert!(!destination.exists());
        assert!(!destination.with_extension("").exists());
        fs::remove_dir_all(home).expect("temporary home should be removable");
    }

    #[test]
    fn rejects_unknown_agents() {
        let home = temporary_home();
        let error = install("unknown", home).expect_err("unknown agent should be rejected");

        assert_eq!(error, "unsupported agent extension: unknown");
    }
}
