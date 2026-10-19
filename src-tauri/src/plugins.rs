use crate::config::ConfigState;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const MAX_PLUGIN_BYTES: u64 = 512 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PluginSetting {
    pub key: String,
    pub label: String,
    /// "string" | "password" | "number"
    pub kind: String,
    pub placeholder: String,
    pub default: Option<Value>,
}

impl Default for PluginSetting {
    fn default() -> Self {
        Self {
            key: String::new(),
            label: String::new(),
            kind: "string".into(),
            placeholder: String::new(),
            default: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Manifest {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub main: String,
    pub hooks: Vec<String>,
    pub settings: Vec<PluginSetting>,
    pub enabled_by_default: bool,
}

impl Default for Manifest {
    fn default() -> Self {
        Self {
            id: String::new(),
            name: "Unnamed plugin".into(),
            version: "0.0.0".into(),
            description: String::new(),
            author: String::new(),
            main: "index.js".into(),
            hooks: Vec::new(),
            settings: Vec::new(),
            enabled_by_default: false,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub author: String,
    pub hooks: Vec<String>,
    pub settings: Vec<PluginSetting>,
    /// Raw entry module source. It is executed inside a sandboxed Web Worker.
    pub source: String,
    pub enabled: bool,
    pub config: Value,
    pub directory: String,
    pub error: Option<String>,
}

pub fn plugin_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_config_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("plugins")
}

/// Installs the bundled example plugin on first run (never overwrites user edits).
pub fn install_bundled(app: &AppHandle) -> Result<(), String> {
    let dir = plugin_dir(app);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let readme = dir.join("README.md");
    if !readme.exists() {
        let _ = fs::write(readme, include_str!("../../plugins/README.md"));
    }

    let target = dir.join("discord-rich-presence");
    if !target.exists() {
        fs::create_dir_all(&target).map_err(|e| e.to_string())?;
        fs::write(
            target.join("manifest.json"),
            include_str!("../../plugins/discord-rich-presence/manifest.json"),
        )
        .map_err(|e| e.to_string())?;
        fs::write(
            target.join("index.js"),
            include_str!("../../plugins/discord-rich-presence/index.js"),
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

pub fn list(app: &AppHandle, cfg: &ConfigState) -> Vec<PluginInfo> {
    let dir = plugin_dir(app);
    let _ = fs::create_dir_all(&dir);
    let config = cfg.get();

    let mut entries: Vec<PathBuf> = match fs::read_dir(&dir) {
        Ok(iter) => iter
            .filter_map(|e| e.ok())
            .map(|e| e.path())
            .filter(|p| p.is_dir())
            .collect(),
        Err(_) => Vec::new(),
    };
    entries.sort();

    let mut out = Vec::new();
    for path in entries {
        out.push(read_plugin(&path, &config));
    }
    out
}

fn read_plugin(path: &Path, config: &crate::config::Config) -> PluginInfo {
    let folder = path
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let manifest_path = path.join("manifest.json");

    let mut info = PluginInfo {
        id: folder.clone(),
        name: folder.clone(),
        version: "0.0.0".into(),
        description: String::new(),
        author: String::new(),
        hooks: Vec::new(),
        settings: Vec::new(),
        source: String::new(),
        enabled: false,
        config: Value::Object(Default::default()),
        directory: path.to_string_lossy().to_string(),
        error: None,
    };

    let manifest = match fs::read_to_string(&manifest_path) {
        Ok(raw) => match serde_json::from_str::<Manifest>(&raw) {
            Ok(m) => m,
            Err(e) => {
                info.error = Some(format!("manifest.json is invalid: {e}"));
                return info;
            }
        },
        Err(_) => {
            info.error = Some("missing manifest.json".into());
            return info;
        }
    };

    if !manifest.id.is_empty() {
        info.id = manifest.id.clone();
    }
    info.name = if manifest.name.is_empty() {
        folder
    } else {
        manifest.name.clone()
    };
    info.version = manifest.version.clone();
    info.description = manifest.description.clone();
    info.author = manifest.author.clone();
    info.hooks = manifest.hooks.clone();
    info.settings = manifest.settings.clone();

    let main = if manifest.main.trim().is_empty() {
        "index.js".to_string()
    } else {
        manifest.main.clone()
    };
    let entry = path.join(&main);

    match fs::metadata(&entry) {
        Ok(meta) if meta.len() > MAX_PLUGIN_BYTES => {
            info.error = Some(format!("{main} is larger than 512 KB"));
        }
        Ok(_) => match fs::read_to_string(&entry) {
            Ok(source) => {
                info.source = source;
                info.enabled = config
                    .plugins
                    .get(&info.id)
                    .copied()
                    .unwrap_or(manifest.enabled_by_default);
                info.config = config
                    .plugin_config
                    .get(&info.id)
                    .cloned()
                    .unwrap_or_else(|| default_config(&manifest.settings));
            }
            Err(e) => info.error = Some(format!("cannot read {main}: {e}")),
        },
        Err(_) => info.error = Some(format!("missing entry file {main}")),
    }

    if info.error.is_none() && manifest.hooks.is_empty() {
        info.error = Some("manifest declares no hooks".into());
    }

    info
}

fn default_config(settings: &[PluginSetting]) -> Value {
    let mut map = serde_json::Map::new();
    for setting in settings {
        if !setting.key.is_empty() {
            map.insert(
                setting.key.clone(),
                setting.default.clone().unwrap_or(Value::String(String::new())),
            );
        }
    }
    Value::Object(map)
}
