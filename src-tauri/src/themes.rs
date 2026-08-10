use serde::{Deserialize, Serialize};
use std::{collections::BTreeMap, fs};

const REQUIRED_TOKENS: &[&str] = &[
    "app-bg",
    "panel-bg",
    "sidebar-bg",
    "sidebar-bg-deep",
    "surface-base",
    "surface-raised",
    "surface-active",
    "surface-emphasis",
    "surface-hover",
    "border-muted",
    "border",
    "border-strong",
    "text",
    "text-strong",
    "text-muted",
    "text-subtle",
    "text-faint",
    "accent",
    "accent-hover",
    "accent-bg",
    "focus",
    "status-running",
    "status-starting",
    "status-error",
    "success-bg",
    "danger-bg",
    "selection",
    "terminal-black",
    "terminal-red",
    "terminal-green",
    "terminal-yellow",
    "terminal-blue",
    "terminal-magenta",
    "terminal-cyan",
    "terminal-white",
    "terminal-bright-black",
    "terminal-bright-white",
];

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ThemeFile {
    version: u8,
    label: String,
    color_scheme: String,
    tokens: BTreeMap<String, String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ThemeDefinition {
    id: String,
    label: String,
    color_scheme: String,
    tokens: BTreeMap<String, String>,
}

#[tauri::command]
pub(crate) fn load_custom_themes() -> Vec<ThemeDefinition> {
    let directory = crate::paths::themes_directory();
    let Ok(entries) = fs::read_dir(directory) else {
        return Vec::new();
    };

    let mut themes = entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            let id = path.file_stem()?.to_str()?;
            if path.extension().is_none_or(|extension| extension != "json") || !is_theme_id(id) {
                return None;
            }
            let contents = fs::read_to_string(&path).ok()?;
            let theme = serde_json::from_str::<ThemeFile>(&contents).ok()?;
            (theme.version == 1
                && !theme.label.trim().is_empty()
                && matches!(theme.color_scheme.as_str(), "light" | "dark")
                && REQUIRED_TOKENS.iter().all(|token| {
                    theme
                        .tokens
                        .get(*token)
                        .is_some_and(|value| !value.trim().is_empty())
                }))
            .then_some((id.to_owned(), theme))
        })
        .map(|(id, theme)| ThemeDefinition {
            id,
            label: theme.label,
            color_scheme: theme.color_scheme,
            tokens: theme.tokens,
        })
        .collect::<Vec<_>>();

    themes.sort_by(|first, second| first.label.cmp(&second.label));
    themes
}

fn is_theme_id(id: &str) -> bool {
    !id.is_empty()
        && !id.starts_with('-')
        && !id.ends_with('-')
        && id
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
}
