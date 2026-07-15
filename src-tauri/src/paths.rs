use std::path::PathBuf;

pub(crate) fn expand_user_path(path: &str) -> PathBuf {
    if path == "~" {
        home_directory().unwrap_or_else(|| PathBuf::from(path))
    } else if let Some(rest) = path.strip_prefix("~/") {
        home_directory()
            .map(|home| home.join(rest))
            .unwrap_or_else(|| PathBuf::from(path))
    } else {
        PathBuf::from(path)
    }
}

pub(crate) fn projects_path() -> PathBuf {
    home_directory()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".config")
        .join("termdeck")
        .join("projects.json")
}

fn home_directory() -> Option<PathBuf> {
    std::env::var_os("HOME").map(PathBuf::from)
}
