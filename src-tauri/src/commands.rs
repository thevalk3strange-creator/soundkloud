use crate::config::{Config, ConfigState};
use crate::discord::{self, Activity, DiscordState};
use crate::player::{self, PlayerState, PlayerStore};
use crate::plugins::{self, PluginInfo};
use serde::Serialize;
use serde_json::Value;
use std::process::Command;
use tauri::{AppHandle, Emitter, Manager, State};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub tauri_version: String,
    pub config_dir: String,
    pub config_file: String,
    pub plugins_dir: String,
    pub data_dir: String,
    pub platform: String,
    pub arch: String,
}

#[tauri::command]
pub fn get_config(config: State<ConfigState>) -> Config {
    config.get()
}

#[tauri::command]
pub fn save_config(
    app: AppHandle,
    config: State<ConfigState>,
    value: Config,
) -> Result<Config, String> {
    let saved = config.replace(value)?;
    let _ = app.emit("config:changed", &saved);
    Ok(saved)
}

#[tauri::command]
pub fn get_player_state(state: State<PlayerStore>) -> PlayerState {
    state.snapshot()
}

#[tauri::command]
pub fn player_command(app: AppHandle, action: String, value: Option<f64>) -> Result<(), String> {
    player::send(&app, &action, value)
}

#[tauri::command]
pub fn browser_reload(app: AppHandle) -> Result<(), String> {
    let webview = app.get_webview("soundcloud").ok_or("SoundCloud view is not ready")?;
    player::mark_loading(&app);
    webview.reload().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn browser_back(app: AppHandle) -> Result<(), String> {
    eval(&app, "history.back()")
}

#[tauri::command]
pub fn browser_forward(app: AppHandle) -> Result<(), String> {
    eval(&app, "history.forward()")
}

#[tauri::command]
pub fn browser_home(app: AppHandle) -> Result<(), String> {
    player::mark_loading(&app);
    eval(&app, "location.href = 'https://soundcloud.com'")
}

#[tauri::command]
pub fn set_browser_visible(app: AppHandle, visible: bool) {
    crate::layout::set_visible(&app, visible);
}

#[tauri::command]
pub fn set_layout(app: AppHandle, top: f64, bottom: f64) {
    crate::layout::set_layout(&app, top, bottom);
}

#[tauri::command]
pub fn open_external(url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if !(trimmed.starts_with("https://") || trimmed.starts_with("http://")) {
        return Err("only http(s) links can be opened".into());
    }
    Command::new("open")
        .arg(trimmed)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("cannot open link: {e}"))
}

#[tauri::command]
pub fn open_plugins_dir(app: AppHandle) -> Result<(), String> {
    let dir = plugins::plugin_dir(&app);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Command::new("open")
        .arg(&dir)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("cannot open plugins folder: {e}"))
}

#[tauri::command]
pub fn list_plugins(app: AppHandle, config: State<ConfigState>) -> Vec<PluginInfo> {
    plugins::list(&app, &config)
}

#[tauri::command]
pub fn set_plugin_enabled(
    app: AppHandle,
    config: State<ConfigState>,
    id: String,
    enabled: bool,
) -> Result<Config, String> {
    let mut next = config.get();
    next.plugins.insert(id.clone(), enabled);
    let saved = config.replace(next)?;
    let _ = app.emit("plugins:changed", &saved);
    Ok(saved)
}

#[tauri::command]
pub fn set_plugin_config(
    app: AppHandle,
    config: State<ConfigState>,
    id: String,
    value: Value,
) -> Result<Config, String> {
    let mut next = config.get();
    next.plugin_config.insert(id.clone(), value);
    let saved = config.replace(next)?;
    let _ = app.emit("plugins:changed", &saved);
    Ok(saved)
}

#[tauri::command]
pub fn plugin_log(app: AppHandle, plugin_id: String, level: String, message: String) {
    let clean: String = message.chars().take(1000).collect();
    eprintln!("[plugin:{plugin_id}] {}", clean);
    let _ = app.emit(
        "plugin:log",
        serde_json::json!({ "pluginId": plugin_id, "level": level, "message": clean }),
    );
}

#[tauri::command]
pub fn app_info(app: AppHandle) -> AppInfo {
    let info = app.package_info();
    let config_dir = app.path().app_config_dir().unwrap_or_default();
    let data_dir = app.path().app_data_dir().unwrap_or_default();
    AppInfo {
        name: info.name.clone(),
        version: info.version.to_string(),
        tauri_version: tauri::VERSION.to_string(),
        config_dir: config_dir.to_string_lossy().to_string(),
        config_file: config_dir.join("config.json").to_string_lossy().to_string(),
        plugins_dir: plugins::plugin_dir(&app).to_string_lossy().to_string(),
        data_dir: data_dir.to_string_lossy().to_string(),
        platform: match std::env::consts::OS {
            "macos" => "macOS".into(),
            "ios" => "iOS".into(),
            other => other.into(),
        },
        arch: std::env::consts::ARCH.to_string(),
    }
}

#[tauri::command]
pub fn discord_set_activity(app: AppHandle, activity: Activity) -> Result<(), String> {
    let state = app.state::<DiscordState>();
    discord::set_activity(&state, activity)
}

#[tauri::command]
pub fn discord_clear_activity(app: AppHandle) {
    let state = app.state::<DiscordState>();
    discord::clear(&state);
}

fn eval(app: &AppHandle, script: &str) -> Result<(), String> {
    let webview = app.get_webview("soundcloud").ok_or("SoundCloud view is not ready")?;
    webview.eval(script).map_err(|e| e.to_string())
}
