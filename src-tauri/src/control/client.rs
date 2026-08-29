use std::{
    fmt, io,
    path::{Path, PathBuf},
    time::Duration,
};

use super::{
    protocol::{
        ControlRequest, ControlResponse, ControlResult, ErrorResponse, MAX_MESSAGE_BYTES,
        PROTOCOL_VERSION, StatusResponse,
    },
    socket::client_control_socket_path,
};

#[derive(Debug)]
pub(crate) enum ClientError {
    NotRunning(PathBuf),
    Io(io::Error),
    Protocol(String),
    Service {
        _code: String,
        message: String,
    },
    #[cfg(not(unix))]
    UnsupportedPlatform,
}

impl fmt::Display for ClientError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotRunning(path) => write!(
                formatter,
                "Termarc is not running (control service unavailable at {})",
                path.display()
            ),
            Self::Io(error) => write!(formatter, "control service request failed: {error}"),
            Self::Protocol(message) => {
                write!(formatter, "invalid control service response: {message}")
            }
            Self::Service { message, .. } => formatter.write_str(message),
            #[cfg(not(unix))]
            Self::UnsupportedPlatform => {
                formatter.write_str("the Termarc control service requires Unix/macOS")
            }
        }
    }
}

pub(crate) fn request_status() -> Result<StatusResponse, ClientError> {
    match request(ControlRequest::status(), Duration::from_secs(2))? {
        ControlResult::Status(status) => Ok(status),
        _ => Err(ClientError::Protocol(
            "status response has the wrong payload type".into(),
        )),
    }
}

pub(crate) fn request(
    request: ControlRequest,
    timeout: Duration,
) -> Result<ControlResult, ClientError> {
    request_at(&client_control_socket_path(), &request, timeout)
}

#[cfg(unix)]
pub(crate) fn request_at(
    path: &Path,
    request: &ControlRequest,
    timeout: Duration,
) -> Result<ControlResult, ClientError> {
    use std::io::{BufRead, BufReader, Read, Write};
    use std::os::unix::net::UnixStream;

    let message =
        serde_json::to_vec(request).map_err(|error| ClientError::Protocol(error.to_string()))?;
    if message.len() > MAX_MESSAGE_BYTES {
        return Err(ClientError::Protocol(format!(
            "request exceeds the {MAX_MESSAGE_BYTES}-byte frame limit"
        )));
    }
    let mut stream = UnixStream::connect(path).map_err(|error| match error.kind() {
        io::ErrorKind::NotFound | io::ErrorKind::ConnectionRefused => {
            ClientError::NotRunning(path.to_path_buf())
        }
        _ => ClientError::Io(error),
    })?;
    stream
        .set_read_timeout(Some(timeout.saturating_add(Duration::from_secs(2))))
        .map_err(ClientError::Io)?;
    stream.write_all(&message).map_err(ClientError::Io)?;
    stream.write_all(b"\n").map_err(ClientError::Io)?;

    let mut message = Vec::new();
    BufReader::new(stream)
        .take((MAX_MESSAGE_BYTES + 1) as u64)
        .read_until(b'\n', &mut message)
        .map_err(ClientError::Io)?;
    if message.last() != Some(&b'\n') {
        return Err(ClientError::Protocol(
            "response was not newline-terminated or exceeded the size limit".into(),
        ));
    }
    message.pop();
    let response: ControlResponse = serde_json::from_slice(&message)
        .map_err(|error| ClientError::Protocol(error.to_string()))?;
    if response.protocol_version != PROTOCOL_VERSION {
        return Err(ClientError::Protocol(format!(
            "protocol version {} is not supported",
            response.protocol_version
        )));
    }
    if !response.ok {
        let error = response.error.unwrap_or(ErrorResponse {
            code: "request_failed".into(),
            message: "request failed without an error message".into(),
        });
        return Err(ClientError::Service {
            _code: error.code,
            message: error.message,
        });
    }
    response
        .result
        .ok_or_else(|| ClientError::Protocol("response result is missing".into()))
}

#[cfg(not(unix))]
pub(crate) fn request_at(
    _path: &Path,
    _request: &ControlRequest,
    _timeout: Duration,
) -> Result<ControlResult, ClientError> {
    Err(ClientError::UnsupportedPlatform)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::control::socket::{client_socket_path_in, default_socket_path_in};

    #[test]
    fn client_socket_accepts_only_absolute_environment_overrides() {
        let directory = Path::new("/Users/example/.config/termarc");
        assert_eq!(
            client_socket_path_in(directory, Some(Path::new("/tmp/owner.sock")), false),
            Path::new("/tmp/owner.sock")
        );
        assert_eq!(
            client_socket_path_in(directory, Some(Path::new("relative.sock")), true),
            default_socket_path_in(directory, true)
        );
    }
}
