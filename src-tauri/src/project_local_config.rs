use serde::{Deserialize, Serialize};
use std::{collections::HashSet, fs, path::PathBuf};

use crate::projects::{ProjectCommand, atomic_write};

const CONFIG_FILE: &str = ".termdeck.json";

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
    let mut ids = HashSet::new();
    for command in commands {
        if command.id.trim().is_empty()
            || command.name.trim().is_empty()
            || command.command.trim().is_empty()
        {
            return Err("local commands require a non-empty id, name, and command".into());
        }
        if !ids.insert(&command.id) {
            return Err(format!("duplicate local command id: {}", command.id));
        }
    }
    Ok(())
}
