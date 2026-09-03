mod agent_extensions;
pub mod cli;
mod control;
mod external_editor;
mod git;
mod notifications;
mod paths;
mod plugins;
mod project_local_config;
mod projects;
mod pty;
mod spawn_router;
mod subagents;
mod themes;
mod windows;

#[cfg(target_os = "macos")]
use plugins::mac_rounded_corners;
use pty::AppState;
use std::{
    collections::HashSet,
    sync::{Arc, Mutex},
};
use tauri::{Emitter, Manager, WindowEvent};

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
        .manage(AppState::default())
        .setup(|app| {
            windows::setup_menu(app)?;
            let subagents = app.state::<AppState>().subagents();
            let spawn_app_handle = app.handle().clone();
            let close_app_handle = app.handle().clone();
            let spawn_router =
                spawn_router::SpawnRouter::new(subagents.clone(), move |window_label, event| {
                    let window = spawn_app_handle
                        .get_webview_window(window_label)
                        .ok_or_else(|| format!("Termarc window is unavailable: {window_label}"))?;
                    window
                        .emit(spawn_router::SUBAGENT_SPAWN_EVENT, event)
                        .map_err(|error| format!("could not route spawn to window: {error}"))
                })
                .with_close_emitter(move |window_label, event| {
                    let window = close_app_handle
                        .get_webview_window(window_label)
                        .ok_or_else(|| format!("Termarc window is unavailable: {window_label}"))?;
                    window
                        .emit(spawn_router::SUBAGENT_CLOSE_EVENT, event)
                        .map_err(|error| format!("could not route close to window: {error}"))
                });
            app.manage(spawn_router.clone());
            #[cfg(unix)]
            app.manage(control::ControlServer::start(
                control::ControlDispatcher::new(subagents, spawn_router),
            )?);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pty::start_pty,
            spawn_router::register_top_level_terminals,
            spawn_router::acknowledge_subagent_spawn,
            spawn_router::detach_subagents,
            spawn_router::update_subagent_pi_state,
            notifications::notify_agent_ready,
            notifications::play_agent_ready_sound,
            paths::resolve_terminal_path,
            themes::load_custom_themes,
            external_editor::open_terminal_path,
            cli::install_symlink,
            cli::is_symlink_installed,
            cli::remove_symlink,
            agent_extensions::get_agent_extension_status,
            agent_extensions::install_agent_extension,
            agent_extensions::is_agent_extension_installed,
            agent_extensions::remove_agent_extension,
            projects::load_projects,
            projects::save_projects,
            projects::load_project_tree_state,
            projects::save_project_tree_state,
            projects::load_local_project_config,
            projects::save_local_project_commands,
            projects::save_local_project_agents,
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
                window
                    .state::<spawn_router::SpawnRouter>()
                    .unregister_window(window.label());
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Termarc")
        .run(|app_handle, event| {
            if matches!(event, tauri::RunEvent::Exit) {
                app_handle.state::<AppState>().shutdown();
            }
        });
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
