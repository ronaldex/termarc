use std::path::{Path, PathBuf};

const CONTROL_SOCKET_ENV: &str = "TERMARC_CONTROL_SOCKET";

pub(crate) fn server_control_socket_path() -> PathBuf {
    default_socket_path_in(&crate::paths::config_directory(), cfg!(debug_assertions))
}

pub(super) fn client_control_socket_path() -> PathBuf {
    client_socket_path_in(
        &crate::paths::config_directory(),
        std::env::var_os(CONTROL_SOCKET_ENV)
            .as_deref()
            .map(Path::new),
        cfg!(debug_assertions),
    )
}

pub(super) fn default_socket_path_in(directory: &Path, development: bool) -> PathBuf {
    directory.join(if development {
        "control-dev.sock"
    } else {
        "control.sock"
    })
}

pub(super) fn client_socket_path_in(
    directory: &Path,
    environment_path: Option<&Path>,
    development: bool,
) -> PathBuf {
    environment_path
        .filter(|path| path.is_absolute())
        .map(Path::to_path_buf)
        .unwrap_or_else(|| default_socket_path_in(directory, development))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn build_channels_use_distinct_config_sockets() {
        let directory = Path::new("/tmp/termarc");
        assert_eq!(
            default_socket_path_in(directory, false),
            directory.join("control.sock")
        );
        assert_eq!(
            default_socket_path_in(directory, true),
            directory.join("control-dev.sock")
        );
    }
}
