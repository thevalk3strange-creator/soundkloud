mod commands;
mod config;
mod discord;
mod layout;
mod media;
mod player;
mod plugins;
mod tray;

use config::ConfigState;
use discord::DiscordState;
use player::PlayerStore;
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

pub fn run() {
    let app = tauri::Builder::default()
        .manage(DiscordState::default())
        .manage(layout::LayoutState::default())
        .manage(PlayerStore::default())
        .invoke_handler(tauri::generate_handler![
            commands::get_config,
            commands::save_config,
            commands::get_player_state,
            commands::player_command,
            commands::browser_reload,
            commands::browser_back,
            commands::browser_forward,
            commands::browser_home,
            commands::set_browser_visible,
            commands::set_layout,
            commands::open_external,
            commands::open_plugins_dir,
            commands::list_plugins,
            commands::set_plugin_enabled,
            commands::set_plugin_config,
            commands::plugin_log,
            commands::app_info,
            commands::discord_set_activity,
            commands::discord_clear_activity,
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            app.manage(ConfigState::load(&handle));

            if let Err(error) = plugins::install_bundled(&handle) {
                eprintln!("[plugins] {error}");
            }

            if let Err(error) = tray::create(&handle) {
                eprintln!("[tray] {error}");
            }

            // The SoundCloud view is a child webview layered between the React
            // top bar and the mini player.
            if let Err(error) = layout::create(&handle) {
                eprintln!("[webview] {error}");
                let _ = handle.emit("browser:error", error);
            }

            match media::init(&handle) {
                Ok(state) => {
                    app.manage(state);
                }
                Err(error) => eprintln!("[media] {error}"),
            }

            player::start_poller(handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            let app = window.app_handle();
            match event {
                WindowEvent::CloseRequested { api, .. } => {
                    let hide = app
                        .try_state::<ConfigState>()
                        .map(|cfg| cfg.get().hide_to_tray)
                        .unwrap_or(true);
                    if hide {
                        api.prevent_close();
                        let _ = window.hide();
                    }
                }
                WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => {
                    layout::apply(app);
                }
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build SoundKloud");

    app.run(|app, event| match event {
        RunEvent::Exit => {
            let state = app.state::<DiscordState>();
            discord::clear(&state);
        }
        #[cfg(target_os = "macos")]
        RunEvent::Reopen { .. } => tray::show_window(app),
        _ => {}
    });
}
