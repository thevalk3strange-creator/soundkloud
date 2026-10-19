use crate::media;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PlayerState {
    pub alive: bool,
    pub playing: bool,
    pub title: String,
    pub artist: String,
    pub artwork: String,
    pub position: f64,
    pub duration: f64,
    pub volume: f64,
    pub has_audio: bool,
    pub url: String,
}

impl Default for PlayerState {
    fn default() -> Self {
        Self {
            alive: false,
            playing: false,
            title: String::new(),
            artist: String::new(),
            artwork: String::new(),
            position: 0.0,
            duration: 0.0,
            volume: 0.8,
            has_audio: false,
            url: String::new(),
        }
    }
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
struct Snapshot {
    ok: bool,
    playing: bool,
    title: String,
    artist: String,
    artwork: String,
    position: f64,
    duration: f64,
    volume: f64,
    has_audio: bool,
    url: String,
}

pub struct PlayerStore {
    state: Mutex<PlayerState>,
    last_ok: Mutex<Instant>,
    in_flight: AtomicBool,
    in_flight_at: Mutex<Option<Instant>>,
    offline: AtomicBool,
    ever_ok: AtomicBool,
}

impl Default for PlayerStore {
    fn default() -> Self {
        Self {
            state: Mutex::new(PlayerState::default()),
            last_ok: Mutex::new(Instant::now()),
            in_flight: AtomicBool::new(false),
            in_flight_at: Mutex::new(None),
            offline: AtomicBool::new(false),
            ever_ok: AtomicBool::new(false),
        }
    }
}

const SNAPSHOT_JS: &str = r#"
(function () {
  try {
    var bridge = window.__SOUNDKLOUD_BRIDGE_V1__;
    if (!bridge) return { ok: false, reason: "bridge-missing" };
    return bridge.snapshot();
  } catch (error) {
    return { ok: false, reason: String(error) };
  }
})()
"#;

const ACTIONS: [&str; 8] = [
    "play", "pause", "toggle", "next", "prev", "seek", "seekBy", "volume",
];

pub fn start_poller(app: AppHandle) {
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(900));
        loop {
            tick(&app);
            std::thread::sleep(Duration::from_millis(750));
        }
    });
}

impl PlayerStore {
    pub fn snapshot(&self) -> PlayerState {
        self.state.lock().map(|s| s.clone()).unwrap_or_default()
    }
}

/// Called right after a navigation/reload so the "not loading" timer restarts.
pub fn mark_loading(app: &AppHandle) {
    let store = app.state::<PlayerStore>();
    if let Ok(mut last) = store.last_ok.lock() {
        *last = Instant::now();
    }
    // The old JS context is gone; drop any in-flight probe.
    store.in_flight.store(false, Ordering::SeqCst);
    if let Ok(mut at) = store.in_flight_at.lock() {
        *at = None;
    }
    store.ever_ok.store(false, Ordering::SeqCst);
    store.offline.store(false, Ordering::SeqCst);
}

fn tick(app: &AppHandle) {
    let store = app.state::<PlayerStore>();
    let Some(webview) = app.get_webview("soundcloud") else {
        return;
    };
    if store.in_flight.swap(true, Ordering::SeqCst) {
        // A destroyed JS context can swallow the eval callback. Retry after a
        // few seconds instead of polling forever with no state updates.
        let stuck = store
            .in_flight_at
            .lock()
            .map(|at| at.map(|t| t.elapsed() > Duration::from_secs(3)).unwrap_or(true))
            .unwrap_or(true);
        if !stuck {
            check_stale(app);
            return;
        }
    }
    if let Ok(mut at) = store.in_flight_at.lock() {
        *at = Some(Instant::now());
    }

    let handle = app.clone();
    let result = webview.eval_with_callback(SNAPSHOT_JS, move |raw| {
        let store = handle.state::<PlayerStore>();
        store.in_flight.store(false, Ordering::SeqCst);
        if let Ok(mut at) = store.in_flight_at.lock() {
            *at = None;
        }
        handle_snapshot(&handle, &raw);
    });

    if result.is_err() {
        store.in_flight.store(false, Ordering::SeqCst);
        if let Ok(mut at) = store.in_flight_at.lock() {
            *at = None;
        }
    }
    check_stale(app);
}

fn parse_snapshot(raw: &str) -> Option<Snapshot> {
    let value: Value = serde_json::from_str(raw).ok()?;
    let value = match value {
        Value::String(inner) => serde_json::from_str::<Value>(&inner).ok()?,
        other => other,
    };
    if value.is_null() {
        return None;
    }
    serde_json::from_value::<Snapshot>(value).ok()
}

fn handle_snapshot(app: &AppHandle, raw: &str) {
    let Some(snapshot) = parse_snapshot(raw) else {
        return;
    };
    if !snapshot.ok {
        return;
    }

    let store = app.state::<PlayerStore>();
    let previous = store.state.lock().map(|s| s.clone()).unwrap_or_default();
    let next = PlayerState {
        alive: true,
        playing: snapshot.playing,
        title: snapshot.title.trim().to_string(),
        artist: snapshot.artist.trim().to_string(),
        artwork: snapshot.artwork.trim().to_string(),
        position: if snapshot.position.is_finite() {
            snapshot.position.max(0.0)
        } else {
            0.0
        },
        duration: if snapshot.duration.is_finite() {
            snapshot.duration.max(0.0)
        } else {
            0.0
        },
        volume: if snapshot.volume.is_finite() {
            snapshot.volume.clamp(0.0, 1.0)
        } else {
            0.8
        },
        has_audio: snapshot.has_audio,
        url: snapshot.url,
    };

    if let Ok(mut current) = store.state.lock() {
        *current = next.clone();
    }
    if let Ok(mut last) = store.last_ok.lock() {
        *last = Instant::now();
    }
    store.ever_ok.store(true, Ordering::SeqCst);

    if store.offline.swap(false, Ordering::SeqCst) {
        let _ = app.emit("player:online", ());
    }

    let _ = app.emit("player:state", &next);
    media::offer(app, next.clone());

    if previous.playing != next.playing || previous.title != next.title {
        // Keep the log useful in `tauri dev`, without spamming every tick.
        if !next.title.is_empty() {
            eprintln!(
                "[player] {} — {}{}",
                next.title,
                next.artist,
                if next.playing { " (playing)" } else { " (paused)" }
            );
        }
    }
}

fn check_stale(app: &AppHandle) {
    let store = app.state::<PlayerStore>();
    let elapsed = store
        .last_ok
        .lock()
        .map(|t| t.elapsed())
        .unwrap_or_default();
    let grace = if store.ever_ok.load(Ordering::SeqCst) {
        Duration::from_secs(7)
    } else {
        Duration::from_secs(16)
    };
    if elapsed < grace {
        return;
    }
    if store.offline.swap(true, Ordering::SeqCst) {
        return;
    }

    let mut snapshot = PlayerState::default();
    if let Ok(mut current) = store.state.lock() {
        current.alive = false;
        snapshot = current.clone();
    }
    eprintln!("[player] no response from the SoundCloud view for {elapsed:?}");
    let _ = app.emit("player:state", &snapshot);
}

pub fn send(app: &AppHandle, action: &str, value: Option<f64>) -> Result<(), String> {
    if !ACTIONS.contains(&action) {
        return Err(format!("unsupported player action: {action}"));
    }
    let Some(webview) = app.get_webview("soundcloud") else {
        return Err("SoundCloud view is not ready".into());
    };

    let action_json = serde_json::to_string(action).map_err(|e| e.to_string())?;
    let value_js = value
        .filter(|v| v.is_finite())
        .map(|v| v.to_string())
        .unwrap_or_else(|| "null".into());

    let js = format!(
        "(function(){{try{{var b=window.__SOUNDKLOUD_BRIDGE_V1__;if(!b)return 'no-bridge';return b.command({action_json},{value_js});}}catch(e){{return 'error';}}}})()"
    );

    webview.eval(js).map_err(|e| e.to_string())
}
