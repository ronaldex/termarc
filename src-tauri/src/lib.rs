mod git;
mod paths;
mod plugins;
mod projects;
mod pty;

use plugins::mac_rounded_corners;
use pty::AppState;
use tauri::{Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            pty::start_pty,
            projects::load_projects,
            projects::save_projects,
            pty::write_to_pty,
            pty::resize_pty,
            git::get_git_diff_directory,
            pty::stop_pty,
            mac_rounded_corners::enable_rounded_corners,
            mac_rounded_corners::enable_modern_window_style,
            mac_rounded_corners::reposition_traffic_lights
        ])
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::Destroyed) {
                window.state::<AppState>().stop_all();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Termdeck");
}
