use tauri::{Emitter, Manager, Window};

#[cfg(target_os = "macos")]
fn configure_notification_application() -> bool {
    use mac_notification_sys::{get_bundle_identifier, set_application};
    use std::sync::OnceLock;

    // mac-notification-sys only permits set_application to be called once per
    // process. Cache that first result; treating its later AlreadySet response
    // as a failure caused every notification after the first to lose click handling.
    static CONFIGURED: OnceLock<bool> = OnceLock::new();
    *CONFIGURED.get_or_init(|| {
        let Some(bundle_identifier) = get_bundle_identifier("Termdeck") else {
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

#[tauri::command]
pub fn play_agent_ready_sound() -> bool {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("afplay")
            .arg("/System/Library/Sounds/Ping.aiff")
            .spawn()
            .is_ok()
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

        std::thread::spawn(move || {
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
