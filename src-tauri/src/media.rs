use crate::player::PlayerState;
use souvlaki::{
    MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig,
    SeekDirection,
};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager};

/// Owns the macOS Now Playing / media-key integration. Metadata updates are done
/// on a single worker thread because the platform backend may fetch artwork.
pub struct MediaState {
    shared: Arc<Shared>,
}

struct Shared {
    controls: Mutex<Option<MediaControls>>,
    latest: Mutex<Option<PlayerState>>,
    last_track: Mutex<String>,
}

pub fn init(app: &AppHandle) -> Result<MediaState, String> {
    let shared = Arc::new(Shared {
        controls: Mutex::new(None),
        latest: Mutex::new(None),
        last_track: Mutex::new(String::new()),
    });

    let mut controls = MediaControls::new(PlatformConfig {
        display_name: "SoundKloud",
        dbus_name: "soundkloud",
        hwnd: None,
    })
    .map_err(|e| format!("media controls unavailable: {e}"))?;

    let handle = app.clone();
    controls
        .attach(move |event| handle_media_event(&handle, event))
        .map_err(|e| format!("cannot attach media keys: {e}"))?;

    if let Ok(mut guard) = shared.controls.lock() {
        *guard = Some(controls);
    }

    let worker = shared.clone();
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_millis(400));
        let next = worker
            .latest
            .lock()
            .ok()
            .and_then(|mut slot| slot.take());
        if let Some(state) = next {
            apply(&worker, &state);
        }
    });

    Ok(MediaState { shared })
}

/// Queues the newest player snapshot for the media worker (non-blocking).
pub fn offer(app: &AppHandle, state: PlayerState) {
    if let Some(media) = app.try_state::<MediaState>() {
        if let Ok(mut slot) = media.shared.latest.lock() {
            *slot = Some(state);
        }
    }
}

fn handle_media_event(app: &AppHandle, event: MediaControlEvent) {
    let result: Result<(), String> = match event {
        MediaControlEvent::Play => crate::player::send(app, "play", None),
        MediaControlEvent::Pause => crate::player::send(app, "pause", None),
        MediaControlEvent::Toggle => crate::player::send(app, "toggle", None),
        MediaControlEvent::Next => crate::player::send(app, "next", None),
        MediaControlEvent::Previous => crate::player::send(app, "prev", None),
        MediaControlEvent::Stop => crate::player::send(app, "pause", None),
        MediaControlEvent::Seek(direction) => {
            let delta = if matches!(direction, SeekDirection::Forward) {
                10.0
            } else {
                -10.0
            };
            crate::player::send(app, "seekBy", Some(delta))
        }
        MediaControlEvent::SeekBy(direction, duration) => {
            let seconds = duration.as_secs_f64();
            let delta = if matches!(direction, SeekDirection::Forward) {
                seconds
            } else {
                -seconds
            };
            crate::player::send(app, "seekBy", Some(delta))
        }
        MediaControlEvent::SetPosition(position) => {
            crate::player::send(app, "seek", Some(position.0.as_secs_f64()))
        }
        MediaControlEvent::SetVolume(volume) => {
            crate::player::send(app, "volume", Some(volume.clamp(0.0, 1.0)))
        }
        MediaControlEvent::Raise => {
            if let Some(window) = app.get_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
            Ok(())
        }
        MediaControlEvent::Quit => {
            app.exit(0);
            Ok(())
        }
        _ => Ok(()),
    };

    if let Err(error) = result {
        eprintln!("[media] {error}");
    }
}

fn apply(shared: &Shared, state: &PlayerState) {
    let track_key = format!(
        "{}\u{1}{}\u{1}{}",
        state.title, state.artist, state.artwork
    );
    let changed = match shared.last_track.lock() {
        Ok(mut last) => {
            if *last != track_key {
                *last = track_key;
                true
            } else {
                false
            }
        }
        Err(_) => false,
    };

    let Ok(mut guard) = shared.controls.lock() else {
        return;
    };
    let Some(controls) = guard.as_mut() else {
        return;
    };

    if state.title.is_empty() && !state.playing {
        let _ = controls.set_playback(MediaPlayback::Stopped);
        return;
    }

    if changed {
        let _ = controls.set_metadata(MediaMetadata {
            title: if state.title.is_empty() {
                Some("SoundCloud")
            } else {
                Some(state.title.as_str())
            },
            artist: if state.artist.is_empty() {
                None
            } else {
                Some(state.artist.as_str())
            },
            album: None,
            cover_url: if state.artwork.starts_with("https://") {
                Some(state.artwork.as_str())
            } else {
                None
            },
            duration: if state.duration > 0.0 {
                Some(Duration::from_secs_f64(state.duration))
            } else {
                None
            },
        });
    }

    let progress = if state.duration > 0.0 {
        let position = state.position.clamp(0.0, state.duration);
        Some(MediaPosition(Duration::from_secs_f64(position)))
    } else {
        None
    };

    let _ = controls.set_playback(if state.playing {
        MediaPlayback::Playing { progress }
    } else {
        MediaPlayback::Paused { progress }
    });
}
