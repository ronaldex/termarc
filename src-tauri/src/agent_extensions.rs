use serde::Serialize;
use std::{
    env, fs,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
};

const VERSION: &str = env!("CARGO_PKG_VERSION");
const LEGACY_PI_ENTRYPOINTS: &[&str] = &["termarc.ts", "index.ts"];
const LEGACY_PI_MODULE_DIRECTORY: &str = "termarc-status";
static EXTENSION_LOCK: Mutex<()> = Mutex::new(());

const PI_EXTENSION_FILES: &[(&str, &str)] = &[
    (
        "termarc/index.ts",
        include_str!("../../extensions/pi/termarc/index.ts"),
    ),
    (
        "termarc/cli.ts",
        include_str!("../../extensions/pi/termarc/cli.ts"),
    ),
    (
        "termarc/environment.ts",
        include_str!("../../extensions/pi/termarc/environment.ts"),
    ),
    (
        "termarc/osc.ts",
        include_str!("../../extensions/pi/termarc/osc.ts"),
    ),
    (
        "termarc/results.ts",
        include_str!("../../extensions/pi/termarc/results.ts"),
    ),
    (
        "termarc/watchers.ts",
        include_str!("../../extensions/pi/termarc/watchers.ts"),
    ),
    (
        "termarc/subagent/agents.ts",
        include_str!("../../extensions/pi/termarc/subagent/agents.ts"),
    ),
    (
        "termarc/subagent/render.ts",
        include_str!("../../extensions/pi/termarc/subagent/render.ts"),
    ),
    (
        "termarc/subagent/runner-events.ts",
        include_str!("../../extensions/pi/termarc/subagent/runner-events.ts"),
    ),
    (
        "termarc/subagent/settings.ts",
        include_str!("../../extensions/pi/termarc/subagent/settings.ts"),
    ),
    (
        "termarc/subagent/types.ts",
        include_str!("../../extensions/pi/termarc/subagent/types.ts"),
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
                filename: "termarc/index.ts",
                files: PI_EXTENSION_FILES,
            }),
            _ => Err(format!("unsupported agent extension: {id}")),
        }
    }
}

#[tauri::command]
pub async fn install_agent_extension(agent: String) -> Result<String, String> {
    let home = home_directory()?;
    run_blocking_extension("install extension", move || install(&agent, home)).await
}

#[tauri::command]
pub async fn is_agent_extension_installed(agent: String) -> Result<bool, String> {
    let home = home_directory()?;
    run_blocking_extension("inspect extension", move || {
        Ok(extension_status(&agent, home)?.current)
    })
    .await
}

#[tauri::command]
pub async fn get_agent_extension_status(agent: String) -> Result<AgentExtensionStatus, String> {
    let home = home_directory()?;
    run_blocking_extension("inspect extension", move || extension_status(&agent, home)).await
}

#[tauri::command]
pub async fn remove_agent_extension(agent: String) -> Result<String, String> {
    let home = home_directory()?;
    run_blocking_extension("remove extension", move || remove(&agent, home)).await
}

async fn run_blocking_extension<T, F>(operation: &'static str, task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| format!("{operation} task failed: {error}"))?
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
    let _guard = extension_lock()?;
    let directory = home.join(extension.directory);
    let destination = extension_path(agent, home.clone())?;
    let legacy_installed = legacy_entrypoints(&directory)
        .iter()
        .any(|path| is_termarc_entrypoint(path));
    let installed = destination.symlink_metadata().is_ok() || legacy_installed;
    let current = !legacy_installed
        && extension.files.iter().all(|(relative, source)| {
            fs::read_to_string(directory.join(relative)).is_ok_and(|installed| installed == *source)
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
    let _guard = extension_lock()?;
    let directory = home.join(extension.directory);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("could not create {}: {error}", directory.display()))?;

    let destination = directory.join(extension.filename);
    if extension.files.iter().all(|(relative, source)| {
        fs::read_to_string(directory.join(relative)).is_ok_and(|contents| contents == *source)
    }) {
        remove_legacy_entrypoints(&directory)?;
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

    remove_legacy_entrypoints(&directory)?;
    Ok(destination.to_string_lossy().into_owned())
}

fn remove(agent: &str, home: PathBuf) -> Result<String, String> {
    let extension = AgentExtension::for_id(agent)?;
    let _guard = extension_lock()?;
    let directory = home.join(extension.directory);
    let destination = extension_path(agent, home)?;
    let module_directory = destination
        .parent()
        .ok_or_else(|| format!("extension path has no parent: {}", destination.display()))?;
    if destination.symlink_metadata().is_ok() {
        fs::remove_file(&destination)
            .map_err(|error| format!("could not remove {}: {error}", destination.display()))?;
    }
    if module_directory.is_dir() {
        fs::remove_dir_all(module_directory)
            .map_err(|error| format!("could not remove {}: {error}", module_directory.display()))?;
    }
    remove_legacy_entrypoints(&directory)?;
    Ok(destination.to_string_lossy().into_owned())
}

fn extension_lock() -> Result<MutexGuard<'static, ()>, String> {
    EXTENSION_LOCK
        .lock()
        .map_err(|_| "agent extension lock is poisoned".to_string())
}

fn legacy_entrypoints(directory: &Path) -> Vec<PathBuf> {
    LEGACY_PI_ENTRYPOINTS
        .iter()
        .map(|filename| directory.join(filename))
        .collect()
}

fn is_termarc_entrypoint(path: &Path) -> bool {
    fs::read_to_string(path).is_ok_and(|source| {
        source.contains("termarc-subagent-watcher-ledger") && source.contains("termarc_subagent")
    })
}

fn remove_legacy_entrypoints(directory: &Path) -> Result<(), String> {
    let mut recognized_legacy_extension = false;
    for path in legacy_entrypoints(directory) {
        if !is_termarc_entrypoint(&path) {
            continue;
        }
        recognized_legacy_extension = true;
        fs::remove_file(&path)
            .map_err(|error| format!("could not remove legacy {}: {error}", path.display()))?;
    }

    if recognized_legacy_extension {
        let module_directory = directory.join(LEGACY_PI_MODULE_DIRECTORY);
        if module_directory.is_dir() {
            fs::remove_dir_all(&module_directory).map_err(|error| {
                format!(
                    "could not remove legacy {}: {error}",
                    module_directory.display()
                )
            })?;
        }
    }
    Ok(())
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
        let destination = home.join(".pi/agent/extensions/termarc/index.ts");

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
        let destination = home.join(".pi/agent/extensions/termarc/index.ts");
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

        let helper = home.join(".pi/agent/extensions/termarc/watchers.ts");
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
        let destination = home.join(".pi/agent/extensions/termarc/index.ts");
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
    fn migrates_recognized_legacy_entrypoints_without_touching_unrelated_extensions() {
        let home = temporary_home();
        let directory = home.join(".pi/agent/extensions");
        fs::create_dir_all(&directory).expect("extension directory should be created");
        let legacy = directory.join("index.ts");
        let unrelated = directory.join("custom.ts");
        let legacy_modules = directory.join(LEGACY_PI_MODULE_DIRECTORY);
        fs::create_dir_all(&legacy_modules).expect("legacy module directory should be created");
        fs::write(legacy_modules.join("watchers.ts"), "legacy helper")
            .expect("legacy module should be writable");
        fs::write(
            &legacy,
            "const marker = 'termarc-subagent-watcher-ledger'; const tool = 'termarc_subagent';",
        )
        .expect("legacy extension should be writable");
        fs::write(&unrelated, "export default () => undefined;")
            .expect("unrelated extension should be writable");

        let outdated = extension_status("pi", home.clone()).expect("status should load");
        assert!(outdated.installed);
        assert!(outdated.update_available);

        install("pi", home.clone()).expect("extension should migrate");
        assert!(!legacy.exists());
        assert!(unrelated.exists());
        assert!(!directory.join(LEGACY_PI_MODULE_DIRECTORY).exists());
        assert!(directory.join("termarc/index.ts").exists());

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
        assert!(
            !destination
                .parent()
                .expect("destination should have a parent")
                .exists()
        );
        fs::remove_dir_all(home).expect("temporary home should be removable");
    }

    #[test]
    fn rejects_unknown_agents() {
        let home = temporary_home();
        let error = install("unknown", home).expect_err("unknown agent should be rejected");

        assert_eq!(error, "unsupported agent extension: unknown");
    }
}
