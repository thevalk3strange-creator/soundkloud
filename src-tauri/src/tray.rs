use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager};

const TRAY_ICON: &[u8] = include_bytes!("../icons/tray.png");

pub fn show_window(app: &AppHandle) {
    if let Some(window) = app.get_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
    #[cfg(target_os = "macos")]
    let _ = app.show();
    crate::layout::apply(app);
}

pub fn hide_window(app: &AppHandle) {
    if let Some(window) = app.get_window("main") {
        let _ = window.hide();
    }
}

pub fn toggle_window(app: &AppHandle) {
    match app.get_window("main") {
        Some(window) => {
            let visible = window.is_visible().unwrap_or(false);
            let minimized = window.is_minimized().unwrap_or(false);
            if visible && !minimized {
                hide_window(app);
            } else {
                show_window(app);
            }
        }
        None => {}
    }
}

/// Menu bar icon. Closing the window hides it here instead of quitting.
pub fn create(app: &AppHandle) -> Result<(), String> {
    let toggle = MenuItem::with_id(app, "toggle", "Show / Hide SoundKloud", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let play_pause = MenuItem::with_id(app, "play_pause", "Play / Pause", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let previous =
        MenuItem::with_id(app, "previous", "Previous Track", true, None::<&str>)
            .map_err(|e| e.to_string())?;
    let next = MenuItem::with_id(app, "next", "Next Track", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)
        .map_err(|e| e.to_string())?;
    let quit = MenuItem::with_id(app, "quit", "Quit SoundKloud", true, None::<&str>)
        .map_err(|e| e.to_string())?;

    let first_sep = PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?;
    let second_sep = PredefinedMenuItem::separator(app).map_err(|e| e.to_string())?;

    let menu = Menu::with_items(
        app,
        &[
            &toggle,
            &first_sep,
            &play_pause,
            &previous,
            &next,
            &second_sep,
            &settings,
            &quit,
        ],
    )
    .map_err(|e| e.to_string())?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("SoundKloud")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "toggle" => toggle_window(app),
            "play_pause" => send(app, "toggle"),
            "previous" => send(app, "prev"),
            "next" => send(app, "next"),
            "settings" => {
                show_window(app);
                let _ = app.emit("ui:open-settings", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_window(tray.app_handle());
            }
        });

    if let Ok(icon) = Image::from_bytes(TRAY_ICON) {
        builder = builder.icon(icon).icon_as_template(true);
    } else if let Some(icon) = app.default_window_icon().cloned() {
        builder = builder.icon(icon);
    }

    builder.build(app).map_err(|e| e.to_string())?;

    Ok(())
}

fn send(app: &AppHandle, action: &str) {
    if let Err(error) = crate::player::send(app, action, None) {
        eprintln!("[tray] {error}");
    }
}
