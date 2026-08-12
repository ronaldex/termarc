#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;

use tauri::Window;

#[tauri::command]
pub fn play_agent_ready_sound() -> bool {
    #[cfg(target_os = "linux")]
    return linux::play_agent_ready_sound();

    #[cfg(target_os = "macos")]
    return macos::play_agent_ready_sound();

    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    false
}

#[tauri::command]
pub fn notify_agent_ready(window: Window, tab_id: String, body: String, sound: bool) -> bool {
    #[cfg(target_os = "linux")]
    {
        let _ = (window, tab_id, sound);
        return linux::notify_agent_ready(body);
    }

    #[cfg(target_os = "macos")]
    return macos::notify_agent_ready(window, tab_id, body, sound);

    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        let _ = (window, tab_id, body, sound);
        false
    }
}
