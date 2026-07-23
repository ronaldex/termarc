use serde::Deserialize;
use std::path::Path;
use std::process::Command;

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ExternalEditor {
    Vscode,
    Vscodium,
    Phpstorm,
}

#[tauri::command]
pub(crate) fn open_terminal_path(path: String, editor: ExternalEditor) -> Result<(), String> {
    let canonical = Path::new(&path)
        .canonicalize()
        .map_err(|error| format!("Could not resolve path: {error}"))?;

    let mut command = platform_open_command(&canonical, editor);
    command
        .spawn()
        .map(|_| ())
        .map_err(|error| format!("Could not open path: {error}"))
}

#[cfg(target_os = "macos")]
fn platform_open_command(path: &Path, editor: ExternalEditor) -> Command {
    let mut command = Command::new("open");
    if path.is_file() {
        command.args(["-a", editor.application_name()]);
    }
    command.arg(path);
    command
}

#[cfg(target_os = "windows")]
fn platform_open_command(path: &Path, editor: ExternalEditor) -> Command {
    let mut command = if path.is_dir() {
        Command::new("explorer")
    } else {
        Command::new(editor.executable())
    };
    command.arg(path);
    command
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
fn platform_open_command(path: &Path, editor: ExternalEditor) -> Command {
    let mut command = if path.is_dir() {
        Command::new("xdg-open")
    } else {
        Command::new(editor.executable())
    };
    command.arg(path);
    command
}

#[cfg(target_os = "macos")]
impl ExternalEditor {
    fn application_name(self) -> &'static str {
        match self {
            Self::Vscode => "Visual Studio Code",
            Self::Vscodium => "VSCodium",
            Self::Phpstorm => "PhpStorm",
        }
    }
}

#[cfg(target_os = "windows")]
impl ExternalEditor {
    fn executable(self) -> &'static str {
        match self {
            Self::Vscode => "code",
            Self::Vscodium => "codium",
            Self::Phpstorm => "phpstorm64",
        }
    }
}

#[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
impl ExternalEditor {
    fn executable(self) -> &'static str {
        match self {
            Self::Vscode => "code",
            Self::Vscodium => "codium",
            Self::Phpstorm => "phpstorm",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_os = "macos")]
    #[test]
    fn maps_macos_editor_application_names() {
        assert_eq!(
            ExternalEditor::Vscode.application_name(),
            "Visual Studio Code"
        );
        assert_eq!(ExternalEditor::Vscodium.application_name(), "VSCodium");
        assert_eq!(ExternalEditor::Phpstorm.application_name(), "PhpStorm");
    }

    #[cfg(any(target_os = "windows", target_os = "linux"))]
    #[test]
    fn maps_editor_executables() {
        assert_eq!(ExternalEditor::Vscode.executable(), "code");
        assert_eq!(ExternalEditor::Vscodium.executable(), "codium");
    }
}
