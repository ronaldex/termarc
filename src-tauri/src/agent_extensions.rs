use std::{env, fs, path::PathBuf};

const PI_EXTENSION_SOURCE: &str = include_str!("../../extensions/pi/termarc-status.ts");

struct AgentExtension {
    directory: &'static str,
    filename: &'static str,
    source: &'static str,
}

impl AgentExtension {
    fn for_id(id: &str) -> Result<Self, String> {
        match id {
            "pi" => Ok(Self {
                directory: ".pi/agent/extensions",
                filename: "termarc-status.ts",
                source: PI_EXTENSION_SOURCE,
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
    Ok(extension_path(&agent, home_directory()?)?
        .symlink_metadata()
        .is_ok())
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

fn install(agent: &str, home: PathBuf) -> Result<String, String> {
    let extension = AgentExtension::for_id(agent)?;
    let directory = home.join(extension.directory);
    fs::create_dir_all(&directory)
        .map_err(|error| format!("could not create {}: {error}", directory.display()))?;

    let destination = directory.join(extension.filename);
    if fs::read_to_string(&destination).is_ok_and(|contents| contents == extension.source) {
        return Ok(destination.to_string_lossy().into_owned());
    }

    // Write beside the destination first so replacing an older Termarc extension is atomic.
    let temporary = directory.join(format!(".{}.termarc-tmp", extension.filename));
    fs::write(&temporary, extension.source)
        .map_err(|error| format!("could not write {}: {error}", temporary.display()))?;
    if let Err(error) = fs::rename(&temporary, &destination) {
        let _ = fs::remove_file(&temporary);
        return Err(format!(
            "could not install extension at {}: {error}",
            destination.display()
        ));
    }

    Ok(destination.to_string_lossy().into_owned())
}

fn remove(agent: &str, home: PathBuf) -> Result<String, String> {
    let destination = extension_path(agent, home)?;
    if destination.symlink_metadata().is_err() {
        return Ok(destination.to_string_lossy().into_owned());
    }
    fs::remove_file(&destination)
        .map_err(|error| format!("could not remove {}: {error}", destination.display()))?;
    Ok(destination.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_home() -> PathBuf {
        env::temp_dir().join(format!(
            "termarc-agent-extension-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock should be after epoch")
                .as_nanos()
        ))
    }

    #[test]
    fn installs_pi_extension_and_creates_directories() {
        let home = temporary_home();
        let installed = install("pi", home.clone()).expect("extension should install");
        let destination = home.join(".pi/agent/extensions/termarc-status.ts");

        assert_eq!(PathBuf::from(installed), destination);
        assert_eq!(
            fs::read_to_string(&destination).expect("extension should be readable"),
            PI_EXTENSION_SOURCE
        );

        fs::remove_dir_all(home).expect("temporary home should be removable");
    }

    #[test]
    fn replaces_an_outdated_termarc_extension() {
        let home = temporary_home();
        let destination = home.join(".pi/agent/extensions/termarc-status.ts");
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
            PI_EXTENSION_SOURCE
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
        fs::remove_dir_all(home).expect("temporary home should be removable");
    }

    #[test]
    fn rejects_unknown_agents() {
        let home = temporary_home();
        let error = install("unknown", home).expect_err("unknown agent should be rejected");

        assert_eq!(error, "unsupported agent extension: unknown");
    }
}
