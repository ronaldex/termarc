use tauri::{Emitter, Manager, Window};

#[cfg(target_os = "macos")]
use std::sync::atomic::{AtomicUsize, Ordering};

#[cfg(target_os = "macos")]
const MAX_PENDING_NOTIFICATION_THREADS: usize = 8;
#[cfg(target_os = "macos")]
static PENDING_NOTIFICATION_THREADS: AtomicUsize = AtomicUsize::new(0);

#[cfg(target_os = "macos")]
struct PendingNotificationGuard;

#[cfg(target_os = "macos")]
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

#[cfg(target_os = "macos")]
impl Drop for PendingNotificationGuard {
    fn drop(&mut self) {
        PENDING_NOTIFICATION_THREADS.fetch_sub(1, Ordering::AcqRel);
    }
}

#[cfg(target_os = "macos")]
fn configure_notification_application() -> bool {
    use mac_notification_sys::{get_bundle_identifier, set_application};
    use std::sync::OnceLock;

    // mac-notification-sys only permits set_application to be called once per
    // process. Cache that first result; treating its later AlreadySet response
    // as a failure caused every notification after the first to lose click handling.
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

#[cfg(target_os = "macos")]
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

#[cfg(target_os = "macos")]
fn spawn_and_reap(mut command: std::process::Command) -> bool {
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

#[tauri::command]
pub fn play_agent_ready_sound() -> bool {
    #[cfg(target_os = "macos")]
    {
        let mut command = std::process::Command::new("afplay");
        command.arg("/System/Library/Sounds/Ping.aiff");
        spawn_and_reap(command)
    }

    #[cfg(not(target_os = "macos"))]
    false
}

#[tauri::command]
pub fn notify_agent_ready(window: Window, tab_id: String, body: String, sound: bool) -> bool {
    #[cfg(target_os = "macos")]
    {
        use mac_notification_sys::{Notification, NotificationResponse};

        // A dev binary is not an installed macOS application, so it may have no
        // bundle identifier to activate. In that case retain the display-only
        // plugin fallback rather than making macOS ask which app to open.
        if !configure_notification_application() {
            // Let the frontend use the Web Notification API in development. Its
            // onclick callback can preserve the tab id, unlike the desktop
            // fallback in tauri-plugin-notification.
            return false;
        }

        let Some(pending_guard) = PendingNotificationGuard::reserve() else {
            // Keep ignored notifications from accumulating an unbounded number
            // of click-waiting threads. The fallback remains visible but cannot
            // route a click to a particular terminal.
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
                    // Route the click before focusing the window. The frontend uses the
                    // notification's own tab id, so concurrent notifications cannot select
                    // whichever terminal happened to notify most recently.
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

    #[cfg(not(target_os = "macos"))]
    {
        let _ = (window, tab_id, body, sound);
        false
    }
}
