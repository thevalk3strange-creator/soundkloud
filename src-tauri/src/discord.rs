use serde::Deserialize;
use serde_json::{json, Map, Value};
use std::io::{Read, Write};
use std::sync::Mutex;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Activity {
    pub client_id: String,
    pub details: String,
    pub state: String,
    pub large_image: String,
    pub large_text: String,
    pub timestamp_start: Option<i64>,
    pub paused: bool,
    pub buttons: Vec<ActivityButton>,
}

#[derive(Debug, Clone, Deserialize, Default)]
pub struct ActivityButton {
    pub label: String,
    pub url: String,
}

#[derive(Default)]
pub struct DiscordState {
    inner: Mutex<Inner>,
}

#[derive(Default)]
struct Inner {
    conn: Option<Conn>,
    last_signature: String,
    last_sent: Option<Instant>,
}

struct Conn {
    stream: UnixStream,
    client_id: String,
}

#[cfg(unix)]
use std::os::unix::net::UnixStream;

#[cfg(not(unix))]
struct UnixStream;

#[cfg(unix)]
impl Conn {
    fn write(&mut self, op: u32, payload: &str) -> Result<(), String> {
        let mut frame = Vec::with_capacity(payload.len() + 8);
        frame.extend_from_slice(&op.to_le_bytes());
        frame.extend_from_slice(&(payload.len() as u32).to_le_bytes());
        frame.extend_from_slice(payload.as_bytes());
        self.stream
            .write_all(&frame)
            .map_err(|e| format!("discord write failed: {e}"))?;
        self.drain();
        Ok(())
    }

    /// Reads and discards pending replies so the socket never backs up.
    fn drain(&mut self) {
        let _ = self
            .stream
            .set_read_timeout(Some(Duration::from_millis(2)));
        let mut buf = [0u8; 8192];
        for _ in 0..4 {
            match self.stream.read(&mut buf) {
                Ok(0) => break,
                Ok(_) => continue,
                Err(_) => break,
            }
        }
    }
}

/// Discord exposes one local IPC socket per running client. Try the common
/// locations on macOS/Linux; there is nothing secret or remote about this.
#[cfg(unix)]
fn socket_candidates() -> Vec<std::path::PathBuf> {
    let mut out = Vec::new();
    let mut bases: Vec<std::path::PathBuf> = Vec::new();
    if let Ok(tmp) = std::env::var("TMPDIR") {
        bases.push(tmp.into());
    }
    if let Ok(run) = std::env::var("XDG_RUNTIME_DIR") {
        bases.push(run.into());
    }
    bases.push("/tmp".into());

    for base in bases {
        for index in 0..10 {
            out.push(base.join(format!("discord-ipc-{index}")));
        }
    }
    out
}

#[cfg(unix)]
fn connect(client_id: &str) -> Option<Conn> {
    for path in socket_candidates() {
        if let Ok(stream) = UnixStream::connect(&path) {
            let _ = stream.set_write_timeout(Some(Duration::from_millis(800)));
            let mut conn = Conn {
                stream,
                client_id: client_id.to_string(),
            };
            let handshake = json!({ "v": 1, "client_id": client_id }).to_string();
            if conn.write(0, &handshake).is_ok() {
                return Some(conn);
            }
        }
    }
    None
}

#[cfg(not(unix))]
fn connect(_client_id: &str) -> Option<Conn> {
    None
}

fn nonce() -> String {
    format!(
        "{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    )
}

fn clamp_text(value: &str, fallback: &str, max: usize) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return fallback.to_string();
    }
    let mut out: String = trimmed.chars().take(max).collect();
    if out.chars().count() < 2 {
        out.push(' ');
    }
    out
}

fn activity_json(activity: &Activity) -> Value {
    let mut map = Map::new();
    map.insert("type".into(), json!(2)); // 2 = "Listening"
    map.insert(
        "details".into(),
        json!(clamp_text(&activity.details, "SoundCloud", 128)),
    );
    if !activity.state.trim().is_empty() {
        map.insert("state".into(), json!(clamp_text(&activity.state, "SoundCloud", 128)));
    }
    if !activity.paused {
        if let Some(start) = activity.timestamp_start {
            map.insert("timestamps".into(), json!({ "start": start }));
        }
    }
    if !activity.large_image.trim().is_empty() {
        let mut assets = Map::new();
        assets.insert("large_image".into(), json!(activity.large_image.trim()));
        let text = clamp_text(&activity.large_text, "SoundCloud", 128);
        assets.insert("large_text".into(), json!(text));
        map.insert("assets".into(), Value::Object(assets));
    }

    let buttons: Vec<Value> = activity
        .buttons
        .iter()
        .filter(|b| b.url.starts_with("https://") || b.url.starts_with("http://"))
        .take(2)
        .map(|b| {
            json!({
                "label": clamp_text(&b.label, "Open", 32),
                "url": b.url,
            })
        })
        .collect();
    if !buttons.is_empty() {
        map.insert("buttons".into(), Value::Array(buttons));
    }
    map.insert("instance".into(), json!(false));
    Value::Object(map)
}

fn set_activity_frame(activity: Option<Value>) -> String {
    json!({
        "cmd": "SET_ACTIVITY",
        "args": { "pid": std::process::id(), "activity": activity },
        "nonce": nonce(),
    })
    .to_string()
}

pub fn set_activity(state: &DiscordState, activity: Activity) -> Result<(), String> {
    let client_id = activity.client_id.trim().to_string();
    if client_id.is_empty() {
        return Err("Discord client id is not configured".into());
    }
    if !client_id.chars().all(|c| c.is_ascii_digit()) || client_id.len() < 15 {
        return Err("Discord client id looks invalid (expected a numeric application id)".into());
    }

    let signature = format!(
        "{}|{}|{}|{}|{}",
        activity.details, activity.state, activity.large_image, activity.paused, activity.buttons.len()
    );

    let mut inner = state.inner.lock().map_err(|_| "discord lock poisoned")?;
    if inner.last_signature == signature {
        if let Some(sent) = inner.last_sent {
            if sent.elapsed() < Duration::from_secs(2) {
                return Ok(());
            }
        }
    } else if let Some(sent) = inner.last_sent {
        // Discord allows roughly one update per three seconds; drop bursts.
        if sent.elapsed() < Duration::from_millis(2500) {
            return Ok(());
        }
    }

    let frame = set_activity_frame(Some(activity_json(&activity)));
    let stale = inner
        .conn
        .as_ref()
        .map(|c| c.client_id != client_id)
        .unwrap_or(true);
    if stale {
        inner.conn = connect(&client_id);
    }

    let mut written = false;
    if let Some(conn) = inner.conn.as_mut() {
        written = conn.write(1, &frame).is_ok();
    }
    if !written {
        inner.conn = connect(&client_id);
        if let Some(conn) = inner.conn.as_mut() {
            conn.write(1, &frame)?;
            written = true;
        }
    }
    if !written {
        return Err("Discord is not running (or its IPC socket is unavailable)".into());
    }

    inner.last_signature = signature;
    inner.last_sent = Some(Instant::now());
    Ok(())
}

pub fn clear(state: &DiscordState) {
    let Ok(mut inner) = state.inner.lock() else {
        return;
    };
    if let Some(conn) = inner.conn.as_mut() {
        let _ = conn.write(1, &set_activity_frame(None));
    }
    inner.last_signature.clear();
    inner.last_sent = None;
}
