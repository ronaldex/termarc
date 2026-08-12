use std::sync::{
    OnceLock,
    atomic::{AtomicUsize, Ordering},
};
use tauri::{Emitter, Manager, Window};

const MAX_PENDING_NOTIFICATION_THREADS: usize = 8;
static PENDING_NOTIFICATION_THREADS: AtomicUsize = AtomicUsize::new(0);

struct PendingNotificationGuard;

impl PendingNotificationGuard {
    fn reserve() -> Option<Self> {
        PENDING_NOTIFICATION_THREADS
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |count| {
                (count < MAX_PENDING_NOTIFICATION_THREADS).then_some(count + 1)
            })
            .ok()
            .map(|_| Self)
    }
}

impl Drop for PendingNotificationGuard {
    fn drop(&mut self) {
        PENDING_NOTIFICATION_THREADS.fetch_sub(1, Ordering::AcqRel);
    }
}

fn configure_notification_application() -> bool {
    use mac_notification_sys::{get_bundle_identifier, set_application};

    // mac-notification-sys permits this only once per process.
    static CONFIGURED: OnceLock<bool> = OnceLock::new();
    *CONFIGURED.get_or_init(|| {
        let Some(bundle_identifier) = get_bundle_identifier("Termarc") else {
            return false;
        };
        if let Err(error) = set_application(&bundle_identifier) {
            eprintln!("Could not configure notification application: {error}");
            return false;
        }
        true
    })
}

fn show_fallback_notification(window: &Window, body: &str, sound: bool) {
    use tauri_plugin_notification::NotificationExt;

    let mut notification = window
        .app_handle()
        .notification()
        .builder()
        .title("Pi is ready")
        .body(body);
    if sound {
        notification = notification.sound("Ping");
    }
    if let Err(error) = notification.show() {
        eprintln!("Could not show agent-ready notification: {error}");
    }
}

pub(super) fn play_agent_ready_sound() -> bool {
    let mut command = Command::new("afplay");
    command.arg("/System/Library/Sounds/Ping.aiff");
    spawn_and_reap(command)
}

pub(super) fn notify_agent_ready(
    window: Window,
    tab_id: String,
    body: String,
    sound: bool,
) -> bool {
    use mac_notification_sys::{Notification, NotificationResponse};

    // Development binaries may have no bundle identifier to activate.
    if !configure_notification_application() {
        return false;
    }

    let Some(pending_guard) = PendingNotificationGuard::reserve() else {
        show_fallback_notification(&window, &body, sound);
        return true;
    };

    std::thread::spawn(move || {
        let _pending_guard = pending_guard;
        let mut notification = Notification::new();
        notification
            .title("Pi is ready")
            .message(&body)
            .wait_for_click(true);
        if sound {
            notification.sound("Ping");
        }

        match notification.send() {
            Ok(NotificationResponse::Click) => {
                let _ = window.emit("agent-ready-notification-clicked", tab_id);
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            Ok(_) => {}
            Err(error) => {
                eprintln!("Could not show clickable agent-ready notification: {error}");
                show_fallback_notification(&window, &body, sound);
            }
        }
    });
    true
}

use std::process::Command;

fn spawn_and_reap(mut command: Command) -> bool {
    match command.spawn() {
        Ok(mut child) => {
            std::thread::spawn(move || {
                let _ = child.wait();
            });
            true
        }
        Err(_) => false,
    }
}
