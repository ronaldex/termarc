use std::sync::atomic::{AtomicU64, Ordering};
use tauri::{AppHandle, WebviewWindowBuilder};

static NEXT_WINDOW_ID: AtomicU64 = AtomicU64::new(1);
const NEW_WINDOW_MENU_ID: &str = "new_window";

#[tauri::command]
pub(crate) fn create_window(app: AppHandle) -> Result<(), String> {
    open_window(&app)
}

fn open_window(app: &AppHandle) -> Result<(), String> {
    let mut config = app
        .config()
        .app
        .windows
        .first()
        .cloned()
        .ok_or_else(|| "Termarc has no window configuration".to_string())?;
    config.label = format!("termarc-{}", NEXT_WINDOW_ID.fetch_add(1, Ordering::Relaxed));

    WebviewWindowBuilder::from_config(app, &config)
        .map_err(|error| format!("could not configure Termarc window: {error}"))?
        .build()
        .map_err(|error| format!("could not create Termarc window: {error}"))?;

    Ok(())
}

#[cfg(target_os = "macos")]
pub(crate) fn setup_menu(app: &mut tauri::App) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};

    let new_window = MenuItem::with_id(
        app,
        NEW_WINDOW_MENU_ID,
        "New Window",
        true,
        Some("CmdOrCtrl+N"),
    )?;
    let menu = Menu::with_items(
        app,
        &[
            &Submenu::with_items(
                app,
                "Termarc",
                true,
                &[
                    &PredefinedMenuItem::about(app, None, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::services(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::hide(app, None)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::show_all(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "File",
                true,
                &[
                    &new_window,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "View",
                true,
                &[&PredefinedMenuItem::fullscreen(app, None)?],
            )?,
            &Submenu::with_items(
                app,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(app, None)?,
                    &PredefinedMenuItem::maximize(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::close_window(app, None)?,
                ],
            )?,
            &Submenu::with_items(app, "Help", true, &[])?,
        ],
    )?;

    app.set_menu(menu)?;
    app.on_menu_event(|app, event| {
        if event.id().as_ref() == NEW_WINDOW_MENU_ID {
            if let Err(error) = open_window(app) {
                eprintln!("{error}");
            }
        }
    });

    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn setup_menu(_app: &mut tauri::App) -> tauri::Result<()> {
    Ok(())
}
