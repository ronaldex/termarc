mod git;
mod paths;
mod plugins;
mod projects;
mod pty;

use plugins::mac_rounded_corners;
use pty::AppState;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use tauri::{Manager, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_document_loaded = Arc::new(AtomicBool::new(false));
    let loaded_for_navigation = Arc::clone(&app_document_loaded);
    let loaded_for_page = Arc::clone(&app_document_loaded);

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri::plugin::Builder::<tauri::Wry>::new("navigation-guard")
                .on_navigation(move |_webview, url| {
                    // Permit the initial app document only. Links are opened explicitly by
                    // the frontend and must never navigate or reload the application webview.
                    is_app_navigation(url) && !loaded_for_navigation.load(Ordering::Acquire)
                })
                .on_page_load(move |_webview, _payload| {
                    loaded_for_page.store(true, Ordering::Release);
                })
                .build(),
        )
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            pty::start_pty,
            paths::resolve_terminal_path,
            paths::open_terminal_path,
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

fn is_app_navigation(url: &tauri::Url) -> bool {
    if matches!(url.scheme(), "tauri" | "about") || url.host_str() == Some("tauri.localhost") {
        return true;
    }

    cfg!(debug_assertions)
        && matches!(url.scheme(), "http" | "https")
        && matches!(url.host_str(), Some("localhost" | "127.0.0.1"))
        && url.port() == Some(1420)
}
