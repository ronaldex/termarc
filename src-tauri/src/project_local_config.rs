use serde::{Deserialize, Serialize};
use std::{fs, path::PathBuf};

use crate::projects::{ProjectCommand, atomic_write};

const CONFIG_FILE: &str = ".termarc.json";

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct LocalConfig {
    version: u8,
    #[serde(default)]
    commands: Vec<ProjectCommand>,
}

pub(crate) fn load(directory: &str) -> Result<Option<Vec<ProjectCommand>>, String> {
    let path = config_path(directory);
    if !path.exists() {
        return Ok(None);
    }
    let contents = fs::read_to_string(&path)
        .map_err(|error| format!("could not read {}: {error}", path.display()))?;
    let config: LocalConfig = serde_json::from_str(&contents)
        .map_err(|error| format!("could not parse {}: {error}", path.display()))?;
    if config.version != 1 {
        return Err(format!("{} must use version 1", path.display()));
    }
    validate(&config.commands)?;
    Ok(Some(config.commands))
}

pub(crate) fn save(directory: &str, mut commands: Vec<ProjectCommand>) -> Result<(), String> {
    validate(&commands)?;
    for command in &mut commands {
        command.storage = None;
    }
    let path = config_path(directory);
    let config = LocalConfig {
        version: 1,
        commands,
    };
    let contents = serde_json::to_vec_pretty(&config)
        .map_err(|error| format!("could not serialize {}: {error}", path.display()))?;
    atomic_write(&path, &contents)
}

fn config_path(directory: &str) -> PathBuf {
    crate::paths::expand_user_path(directory).join(CONFIG_FILE)
}

fn validate(commands: &[ProjectCommand]) -> Result<(), String> {
    crate::projects::validate_command_store(commands, "local", false)
}

#[cfg(test)]
mod tests {
    use super::LocalConfig;

    #[test]
    fn round_trips_command_order() {
        let config: LocalConfig = serde_json::from_str(
            r#"{"version":1,"commands":[{"id":"build","name":"Build","command":"npm run build","order":3}]}"#,
        )
        .expect("ordered local config should load");
        let serialized = serde_json::to_value(config).expect("local config should serialize");

        assert_eq!(serialized["commands"][0]["order"], 3);
    }
}
