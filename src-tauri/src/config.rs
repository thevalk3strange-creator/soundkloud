use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

/// User settings persisted as JSON in the standard macOS app-support folder:
/// ~/Library/Application Support/com.gamvoc.soundkloud/config.json
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    pub accent: String,
    pub mini_player: bool,
    pub volume: f64,
    pub hide_to_tray: bool,
    /// plugin id -> enabled
    pub plugins: HashMap<String, bool>,
    /// plugin id -> arbitrary plugin-owned settings (e.g. a Discord client id)
    pub plugin_config: HashMap<String, Value>,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            accent: "#8b5cf6".into(),
            mini_player: true,
            volume: 0.8,
            hide_to_tray: true,
            plugins: HashMap::new(),
            plugin_config: HashMap::new(),
        }
    }
}

impl Config {
    /// Keeps persisted values safe to hand to the UI and the shell.
    pub fn sanitize(&mut self) {
        self.accent = normalize_hex(&self.accent).unwrap_or_else(|| "#8b5cf6".into());
        if !self.volume.is_finite() {
            self.volume = 0.8;
        }
        self.volume = self.volume.clamp(0.0, 1.0);
    }
}

fn normalize_hex(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.len() != 7 || !trimmed.starts_with('#') {
        return None;
    }
    if trimmed[1..].chars().all(|c| c.is_ascii_hexdigit()) {
        Some(trimmed.to_ascii_lowercase())
    } else {
        None
    }
}

pub struct ConfigState {
    pub path: PathBuf,
    data: Mutex<Config>,
}

impl ConfigState {
    pub fn load(app: &AppHandle) -> Self {
        let dir = app
            .path()
            .app_config_dir()
            .unwrap_or_else(|_| PathBuf::from("."));
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("config.json");
        let existed = path.exists();

        let mut data = fs::read_to_string(&path)
            .ok()
            .and_then(|raw| serde_json::from_str::<Config>(&raw).ok())
            .unwrap_or_default();
        data.sanitize();

        let state = Self {
            path,
            data: Mutex::new(data),
        };
        if !existed {
            // Materialise defaults so the documented config path exists.
            let _ = state.save(&state.get());
        }
        state
    }

    pub fn get(&self) -> Config {
        self.data.lock().map(|c| c.clone()).unwrap_or_default()
    }

    pub fn replace(&self, mut next: Config) -> Result<Config, String> {
        next.sanitize();
        {
            let mut guard = self.data.lock().map_err(|_| "config lock poisoned")?;
            *guard = next.clone();
        }
        self.save(&next)?;
        Ok(next)
    }

    fn save(&self, data: &Config) -> Result<(), String> {
        let json = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;
        let tmp = self.path.with_extension("json.tmp");
        fs::write(&tmp, json).map_err(|e| format!("cannot write config: {e}"))?;
        fs::rename(&tmp, &self.path).map_err(|e| format!("cannot replace config: {e}"))?;
        Ok(())
    }
}
