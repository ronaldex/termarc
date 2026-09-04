#[cfg(unix)]
mod unix {
    use std::{
        fs,
        io::{self, BufRead, BufReader, Read, Write},
        os::unix::{
            fs::{FileTypeExt, PermissionsExt},
            net::{UnixListener, UnixStream},
        },
        path::{Path, PathBuf},
        sync::{
            Arc, Mutex,
            atomic::{AtomicBool, AtomicUsize, Ordering},
            mpsc::{self, TrySendError},
        },
        thread::{self, JoinHandle},
        time::Duration,
    };

    use crate::control::{
        dispatch::ControlDispatcher,
        protocol::{ControlResponse, MAX_MESSAGE_BYTES},
    };

    const MAX_CONCURRENT_CONNECTIONS: usize = 16;

    pub(crate) struct ControlServer {
        path: PathBuf,
        shutdown: Arc<AtomicBool>,
        listener_thread: Option<JoinHandle<()>>,
        dispatcher: ControlDispatcher,
        _worker_count: Arc<AtomicUsize>,
    }

    impl ControlServer {
        pub(crate) fn start(dispatcher: ControlDispatcher) -> io::Result<Self> {
            Self::start_at(
                super::super::socket::server_control_socket_path(),
                dispatcher,
                MAX_CONCURRENT_CONNECTIONS,
            )
        }

        pub(crate) fn start_at(
            path: PathBuf,
            dispatcher: ControlDispatcher,
            concurrency: usize,
        ) -> io::Result<Self> {
            if concurrency == 0 {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "control concurrency must be positive",
                ));
            }
            let directory = path.parent().ok_or_else(|| {
                io::Error::new(io::ErrorKind::InvalidInput, "socket path has no parent")
            })?;
            fs::create_dir_all(directory)?;
            remove_stale_socket(&path)?;
            let listener = UnixListener::bind(&path)?;
            fs::set_permissions(&path, fs::Permissions::from_mode(0o600))?;
            listener.set_nonblocking(true)?;

            let shutdown = Arc::new(AtomicBool::new(false));
            let listener_shutdown = Arc::clone(&shutdown);
            let listener_dispatcher = dispatcher.clone();
            let worker_count = Arc::new(AtomicUsize::new(0));
            let listener_worker_count = Arc::clone(&worker_count);
            let listener_thread = thread::Builder::new()
                .name("termarc-control-listener".into())
                .spawn(move || {
                    run_listener(
                        listener,
                        listener_shutdown,
                        listener_dispatcher,
                        concurrency,
                        listener_worker_count,
                    )
                })?;
            Ok(Self {
                path,
                shutdown,
                listener_thread: Some(listener_thread),
                dispatcher,
                _worker_count: worker_count,
            })
        }
    }

    #[cfg(test)]
    impl ControlServer {
        fn worker_count(&self) -> usize {
            self._worker_count.load(Ordering::Acquire)
        }
    }

    impl Drop for ControlServer {
        fn drop(&mut self) {
            self.shutdown.store(true, Ordering::Release);
            self.dispatcher.shutdown();
            if let Some(thread) = self.listener_thread.take() {
                let _ = thread.join();
            }
            let _ = fs::remove_file(&self.path);
        }
    }

    fn remove_stale_socket(path: &Path) -> io::Result<()> {
        let metadata = match fs::symlink_metadata(path) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(()),
            Err(error) => return Err(error),
        };
        if !metadata.file_type().is_socket() {
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                format!("control socket path is not a socket: {}", path.display()),
            ));
        }
        if UnixStream::connect(path).is_ok() {
            return Err(io::Error::new(
                io::ErrorKind::AddrInUse,
                format!(
                    "Termarc control service is already running at {}",
                    path.display()
                ),
            ));
        }
        fs::remove_file(path)
    }

    fn run_listener(
        listener: UnixListener,
        shutdown: Arc<AtomicBool>,
        dispatcher: ControlDispatcher,
        concurrency: usize,
        worker_count: Arc<AtomicUsize>,
    ) {
        let (connections, receiver) = mpsc::sync_channel::<UnixStream>(concurrency);
        let receiver = Arc::new(Mutex::new(receiver));
        let active_connections = Arc::new(AtomicUsize::new(0));
        let mut workers = Vec::with_capacity(concurrency);

        while !shutdown.load(Ordering::Acquire) {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let active = active_connections.load(Ordering::Acquire);
                    if active >= concurrency {
                        reject_busy(&mut stream);
                        continue;
                    }
                    if active >= workers.len() {
                        match spawn_worker(
                            workers.len(),
                            Arc::clone(&receiver),
                            Arc::clone(&shutdown),
                            dispatcher.clone(),
                            Arc::clone(&active_connections),
                        ) {
                            Ok(worker) => {
                                workers.push(worker);
                                worker_count.store(workers.len(), Ordering::Release);
                            }
                            Err(_) => {
                                reject_busy(&mut stream);
                                continue;
                            }
                        }
                    }
                    active_connections.fetch_add(1, Ordering::AcqRel);
                    match connections.try_send(stream) {
                        Ok(()) => {}
                        Err(TrySendError::Full(mut returned)) => {
                            active_connections.fetch_sub(1, Ordering::AcqRel);
                            reject_busy(&mut returned);
                        }
                        Err(TrySendError::Disconnected(_)) => {
                            active_connections.fetch_sub(1, Ordering::AcqRel);
                            break;
                        }
                    }
                }
                Err(error) if error.kind() == io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(10))
                }
                Err(_) => break,
            }
        }
        drop(connections);
        for worker in workers {
            let _ = worker.join();
        }
    }

    fn spawn_worker(
        index: usize,
        receiver: Arc<Mutex<mpsc::Receiver<UnixStream>>>,
        shutdown: Arc<AtomicBool>,
        dispatcher: ControlDispatcher,
        active_connections: Arc<AtomicUsize>,
    ) -> io::Result<JoinHandle<()>> {
        thread::Builder::new()
            .name(format!("termarc-control-worker-{index}"))
            .spawn(move || {
                loop {
                    let stream = receiver
                        .lock()
                        .ok()
                        .and_then(|receiver| receiver.recv().ok());
                    let Some(stream) = stream else { break };
                    handle_connection(stream, Arc::clone(&shutdown), &dispatcher);
                    active_connections.fetch_sub(1, Ordering::AcqRel);
                }
            })
    }

    fn reject_busy(stream: &mut UnixStream) {
        let response =
            ControlResponse::error("server_busy", "control service concurrency limit reached");
        let _ = write_response(stream, &serde_json::to_vec(&response).unwrap_or_default());
    }

    fn handle_connection(
        mut stream: UnixStream,
        shutdown: Arc<AtomicBool>,
        dispatcher: &ControlDispatcher,
    ) {
        let _ = stream.set_nonblocking(false);
        let _ = stream.set_read_timeout(Some(Duration::from_millis(250)));
        let reader_stream = match stream.try_clone() {
            Ok(stream) => stream,
            Err(_) => return,
        };
        let mut reader = BufReader::new(reader_stream);
        let mut message = Vec::new();
        while !shutdown.load(Ordering::Acquire) {
            let remaining = MAX_MESSAGE_BYTES + 1 - message.len();
            match reader
                .by_ref()
                .take(remaining as u64)
                .read_until(b'\n', &mut message)
            {
                Ok(0) if message.is_empty() => return,
                Ok(0) => {
                    let response = ControlResponse::error(
                        "invalid_request",
                        "request must be terminated by a newline",
                    );
                    let _ = write_response(
                        &mut stream,
                        &serde_json::to_vec(&response).unwrap_or_default(),
                    );
                    return;
                }
                Ok(_) if message.last() != Some(&b'\n') => {
                    let response = ControlResponse::error(
                        "message_too_large",
                        "request must be newline-terminated and at most 65536 bytes",
                    );
                    let _ = reader.get_ref().shutdown(std::net::Shutdown::Read);
                    let _ = write_response(
                        &mut stream,
                        &serde_json::to_vec(&response).unwrap_or_default(),
                    );
                    return;
                }
                Ok(_) => {
                    message.pop();
                    let response = dispatcher.dispatch_bytes(&message);
                    if write_response(&mut stream, &response).is_err() {
                        return;
                    }
                    message.clear();
                }
                Err(error)
                    if matches!(
                        error.kind(),
                        io::ErrorKind::WouldBlock | io::ErrorKind::TimedOut
                    ) =>
                {
                    let response = ControlResponse::error("request_timeout", "request timed out");
                    let _ = write_response(
                        &mut stream,
                        &serde_json::to_vec(&response).unwrap_or_default(),
                    );
                    return;
                }
                Err(_) => return,
            }
        }
    }

    fn write_response(stream: &mut UnixStream, response: &[u8]) -> io::Result<()> {
        let fallback;
        let response = if response.len() > MAX_MESSAGE_BYTES {
            fallback = serde_json::to_vec(&ControlResponse::error(
                "response_too_large",
                "response exceeds the control protocol frame limit",
            ))?;
            &fallback
        } else {
            response
        };
        stream.write_all(response)?;
        stream.write_all(b"\n")?;
        stream.flush()
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use crate::{
            control::{
                client::request_at,
                protocol::{ControlRequest, ControlResult},
            },
            spawn_router::SpawnRouter,
            subagents::{
                AttachSubagent, ReserveSubagent, SubagentPtyOwner, SubagentRegistry,
                TopLevelTerminalMetadata,
            },
        };
        use std::{
            io::{BufRead, BufReader, Write},
            sync::atomic::{AtomicU64, Ordering as AtomicOrdering},
            time::Instant,
        };

        static TEST_SOCKET_SEQUENCE: AtomicU64 = AtomicU64::new(0);

        struct TestSocket {
            directory: PathBuf,
            path: PathBuf,
        }

        impl TestSocket {
            fn new() -> Self {
                loop {
                    let sequence = TEST_SOCKET_SEQUENCE.fetch_add(1, AtomicOrdering::Relaxed);
                    let directory = std::env::temp_dir().join(format!(
                        "termarc-control-test-{}-{sequence}",
                        std::process::id()
                    ));
                    match fs::create_dir(&directory) {
                        Ok(()) => {
                            let path = directory.join("control.sock");
                            return Self { directory, path };
                        }
                        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
                        Err(error) => panic!("could not create test socket directory: {error}"),
                    }
                }
            }
        }

        impl Drop for TestSocket {
            fn drop(&mut self) {
                let _ = fs::remove_dir_all(&self.directory);
            }
        }

        fn dispatcher() -> ControlDispatcher {
            let registry = SubagentRegistry::default();
            ControlDispatcher::new(registry.clone(), SpawnRouter::new(registry, |_, _| Ok(())))
        }

        #[test]
        fn workers_are_created_lazily() {
            let socket = TestSocket::new();
            let path = socket.path.clone();
            let server = ControlServer::start_at(path.clone(), dispatcher(), 4).unwrap();

            assert_eq!(server.worker_count(), 0);
            assert!(matches!(
                request_at(&path, &ControlRequest::status(), Duration::from_secs(1)).unwrap(),
                ControlResult::Status(_)
            ));
            for _ in 0..100 {
                if server.worker_count() == 1 {
                    break;
                }
                thread::sleep(Duration::from_millis(5));
            }
            assert_eq!(server.worker_count(), 1);
        }

        #[test]
        fn socket_transport_accepts_split_frames_and_removes_socket() {
            let socket = TestSocket::new();
            let path = socket.path.clone();
            let server = ControlServer::start_at(path.clone(), dispatcher(), 2).unwrap();
            let mut stream = UnixStream::connect(&path).unwrap();
            stream.write_all(br#"{"type":"status","#).unwrap();
            stream.write_all(b"\"protocolVersion\":1}\n").unwrap();
            let mut response = String::new();
            BufReader::new(stream).read_line(&mut response).unwrap();
            let response: ControlResponse = serde_json::from_str(response.trim_end()).unwrap();
            assert!(response.ok);
            drop(server);
            assert!(!path.exists());
        }

        #[test]
        fn long_connections_are_rejected_at_the_fixed_concurrency_limit() {
            let socket = TestSocket::new();
            let path = socket.path.clone();
            let server = ControlServer::start_at(path.clone(), dispatcher(), 1).unwrap();
            let mut blocker = UnixStream::connect(&path).unwrap();
            blocker.write_all(b"{").unwrap();
            thread::sleep(Duration::from_millis(40));

            let result = request_at(&path, &ControlRequest::status(), Duration::from_secs(1));
            let error = result.expect_err("excess connection should be rejected");
            assert!(error.to_string().contains("concurrency limit"));

            drop(blocker);
            drop(server);
        }

        #[test]
        fn bounded_workers_still_serve_concurrent_calls() {
            let socket = TestSocket::new();
            let path = socket.path.clone();
            let server = ControlServer::start_at(path.clone(), dispatcher(), 4).unwrap();
            let clients = (0..4)
                .map(|_| {
                    let path = path.clone();
                    thread::spawn(move || {
                        request_at(&path, &ControlRequest::status(), Duration::from_secs(1))
                    })
                })
                .collect::<Vec<_>>();
            for client in clients {
                assert!(matches!(
                    client.join().unwrap().unwrap(),
                    ControlResult::Status(_)
                ));
            }
            drop(server);
        }

        #[test]
        fn dropping_server_cancels_a_long_subagent_wait_before_joining_workers() {
            let socket = TestSocket::new();
            let path = socket.path.clone();
            let registry = running_registry();
            let dispatcher = ControlDispatcher::new(
                registry.clone(),
                SpawnRouter::new(registry.clone(), |_, _| Ok(())),
            );
            let server = ControlServer::start_at(path.clone(), dispatcher, 1).unwrap();
            let client = thread::spawn({
                let path = path.clone();
                move || {
                    request_at(
                        &path,
                        &ControlRequest::SubagentWait {
                            protocol_version: 1,
                            id: "subagent-1".into(),
                            timeout_ms: 60_000,
                            return_if_result_available: false,
                        },
                        Duration::from_secs(65),
                    )
                }
            });
            for _ in 0..100 {
                if registry.active_control_waits() == 1 {
                    break;
                }
                thread::sleep(Duration::from_millis(5));
            }
            assert_eq!(
                registry.active_control_waits(),
                1,
                "subagent wait did not reach the registry"
            );
            let started = Instant::now();
            drop(server);
            assert!(started.elapsed() < Duration::from_secs(1));
            assert!(client.join().unwrap().is_err());
        }

        #[test]
        fn typed_client_crosses_real_socket_dispatch_and_registry_with_versions_errors_and_concurrency()
         {
            let socket = TestSocket::new();
            let path = socket.path.clone();
            let registry = SubagentRegistry::default();
            registry
                .register_top_level_terminals(
                    "main",
                    vec![TopLevelTerminalMetadata {
                        terminal_id: "parent".into(),
                        project_id: "project".into(),
                    }],
                )
                .unwrap();
            let event_registry = registry.clone();
            let router = SpawnRouter::new(registry.clone(), move |_, event| {
                event_registry
                    .attach(AttachSubagent {
                        owner: SubagentPtyOwner {
                            id: event.subagent_id.clone(),
                            parent_terminal_id: event.parent_terminal_id.clone(),
                            project_id: event.project_id.clone(),
                            name: event.name.clone(),
                            process_kind: event.process_kind.clone(),
                        },
                        terminal_id: format!("terminal-{}", event.subagent_id),
                        pty_id: format!("pty-{}", event.subagent_id),
                        pid: None,
                        command: event.command.clone(),
                        cwd: event.cwd.clone(),
                        input: Arc::new(|_| Ok(())),
                        stop: Arc::new(|| Ok(())),
                    })
                    .map_err(|error| error.to_string())?;
                event_registry
                    .acknowledge(crate::subagents::SubagentSpawnAcknowledgement {
                        subagent_id: event.subagent_id.clone(),
                        success: true,
                        error: None,
                    })
                    .map_err(|error| error.to_string())
            });
            let server = ControlServer::start_at(
                path.clone(),
                ControlDispatcher::new(registry.clone(), router),
                8,
            )
            .unwrap();

            let spawned = request_at(
                &path,
                &ControlRequest::SubagentSpawn {
                    protocol_version: crate::control::PROTOCOL_VERSION,
                    request: ReserveSubagent {
                        parent_terminal_id: "parent".into(),
                        project_id: "project".into(),
                        name: "socket child".into(),
                        command: "fixture".into(),
                        cwd: "/tmp".into(),
                        process_kind: "process".into(),
                    },
                },
                Duration::from_secs(1),
            )
            .unwrap();
            let ControlResult::Spawn(spawned) = spawned else {
                panic!("spawn returned the wrong typed result")
            };

            let requests = (0..6)
                .map(|index| {
                    let path = path.clone();
                    let id = spawned.id.clone();
                    thread::spawn(move || {
                        let request = if index % 2 == 0 {
                            ControlRequest::SubagentStatus {
                                protocol_version: crate::control::PROTOCOL_VERSION,
                                id,
                            }
                        } else {
                            ControlRequest::SubagentList {
                                protocol_version: crate::control::PROTOCOL_VERSION,
                                parent_terminal_id: Some("parent".into()),
                                cursor: None,
                                limit: None,
                            }
                        };
                        request_at(&path, &request, Duration::from_secs(1))
                    })
                })
                .collect::<Vec<_>>();
            for response in requests {
                assert!(matches!(
                    response.join().unwrap().unwrap(),
                    ControlResult::SubagentStatus(_) | ControlResult::List(_)
                ));
            }

            let missing = request_at(
                &path,
                &ControlRequest::SubagentStatus {
                    protocol_version: crate::control::PROTOCOL_VERSION,
                    id: "missing".into(),
                },
                Duration::from_secs(1),
            )
            .unwrap_err();
            assert!(missing.to_string().contains("unknown subagent"));
            let old_version = request_at(
                &path,
                &ControlRequest::Status {
                    protocol_version: crate::control::PROTOCOL_VERSION - 1,
                },
                Duration::from_secs(1),
            )
            .unwrap_err();
            assert!(
                old_version
                    .to_string()
                    .contains("unsupported protocol version")
            );

            assert_eq!(registry.list(Some("parent")).unwrap().len(), 1);
            drop(server);
        }

        fn running_registry() -> SubagentRegistry {
            let registry = SubagentRegistry::default();
            registry
                .register_top_level_terminals(
                    "main",
                    vec![TopLevelTerminalMetadata {
                        terminal_id: "parent".into(),
                        project_id: "project".into(),
                    }],
                )
                .unwrap();
            let reservation = registry
                .reserve(ReserveSubagent {
                    parent_terminal_id: "parent".into(),
                    project_id: "project".into(),
                    name: "waiter".into(),
                    command: "pi".into(),
                    cwd: "/tmp".into(),
                    process_kind: "pi".into(),
                })
                .unwrap();
            registry
                .attach(AttachSubagent {
                    owner: SubagentPtyOwner {
                        id: reservation.event.subagent_id,
                        parent_terminal_id: "parent".into(),
                        project_id: "project".into(),
                        name: "waiter".into(),
                        process_kind: "pi".into(),
                    },
                    terminal_id: "child".into(),
                    pty_id: "pty".into(),
                    pid: None,
                    command: "pi".into(),
                    cwd: "/tmp".into(),
                    input: Arc::new(|_| Ok(())),
                    stop: Arc::new(|| Ok(())),
                })
                .unwrap();
            registry
        }
    }
}

#[cfg(unix)]
pub(crate) use unix::ControlServer;
