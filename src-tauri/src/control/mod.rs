mod client;
mod dispatch;
mod protocol;
mod server;
mod socket;

#[cfg(test)]
pub(crate) use client::request_at;
pub(crate) use client::{ClientError, request, request_status};
pub(crate) use dispatch::ControlDispatcher;
pub(crate) use protocol::{ControlRequest, ControlResult, PROTOCOL_VERSION};
#[cfg(test)]
pub(crate) use protocol::{ControlResponse, MAX_MESSAGE_BYTES};
#[cfg(unix)]
pub(crate) use server::ControlServer;
pub(crate) use socket::server_control_socket_path;
