mod agent_extensions;
pub mod cli;
mod external_editor;
mod git;
mod notifications;
mod paths;
mod plugins;
mod project_local_config;
mod projects;
mod pty;
mod themes;
mod windows;

#[cfg(target_os = "macos")]
use plugins::mac_rounded_corners;
use pty::AppState;
use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
};
use tauri::{Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let loaded_app_windows = Arc::new(Mutex::new(HashSet::<String>::new()));
    let loaded_for_navigation = Arc::clone(&loaded_app_windows);
    let loaded_for_page = Arc::clone(&loaded_app_windows);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(
            tauri::plugin::Builder::<tauri::Wry>::new("navigation-guard")
                .on_navigation(move |webview, url| {
                    // Permit one initial app document per window. Links are opened explicitly
                    // by the frontend and must never navigate or reload an application webview.
                    is_app_navigation(url)
                        && loaded_for_navigation
                            .lock()
                            .is_ok_and(|loaded| !loaded.contains(webview.label()))
                })
                .on_page_load(move |webview, _payload| {
                    if let Ok(mut loaded) = loaded_for_page.lock() {
                        loaded.insert(webview.label().to_string());
                    }
                })
                .build(),
        )
        .setup(|app| {
            windows::setup_menu(app)?;
            Ok(())
        })
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            pty::start_pty,
            notifications::notify_agent_ready,
            notifications::play_agent_ready_sound,
            paths::resolve_terminal_path,
            themes::load_custom_themes,
            external_editor::open_terminal_path,
            cli::install_symlink,
            cli::is_symlink_installed,
            cli::remove_symlink,
            agent_extensions::install_agent_extension,
            agent_extensions::is_agent_extension_installed,
            agent_extensions::remove_agent_extension,
            projects::load_projects,
            projects::save_projects,
            projects::load_project_tree_state,
            projects::save_project_tree_state,
            projects::load_local_project_commands,
            projects::save_local_project_commands,
            projects::save_project_command_order,
            pty::write_to_pty,
            pty::resize_pty,
            pty::get_pty_status,
            pty::get_pty_statuses,
            git::get_git_diff_directory,
            git::get_git_diff_summary,
            pty::stop_pty,
            #[cfg(target_os = "macos")]
            mac_rounded_corners::enable_rounded_corners,
            #[cfg(target_os = "macos")]
            mac_rounded_corners::enable_modern_window_style,
            #[cfg(target_os = "macos")]
            mac_rounded_corners::reposition_traffic_lights,
            windows::create_window
        ])
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::Destroyed) {
                window.state::<AppState>().stop_for_window(window.label());
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running Termarc");
}

fn is_app_navigation(url: &tauri::Url) -> bool {
    if matches!(url.scheme(), "tauri" | "about") || url.host_str() == Some("tauri.localhost") {
        return true;
    }

    cfg!(debug_assertions)
        && matches!(url.scheme(), "http" | "https")
        && matches!(url.host_str(), Some("localhost" | "127.0.0.1"))
        && url.port() == Some(1420)
}
