use std::sync::Mutex;
use tauri::utils::config::BackgroundThrottlingPolicy;
use tauri::{AppHandle, Emitter, Manager};

/// Heights of the React chrome. The SoundCloud webview lives between them.
pub const CHROME_TOP: f64 = 44.0;
pub const CHROME_BOTTOM: f64 = 76.0;

const SOUNDCLOUD_URL: &str = "https://soundcloud.com";
const SAFARI_UA: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

pub struct LayoutState {
    top: Mutex<f64>,
    bottom: Mutex<f64>,
    visible: Mutex<bool>,
}

impl Default for LayoutState {
    fn default() -> Self {
        Self {
            top: Mutex::new(CHROME_TOP),
            bottom: Mutex::new(CHROME_BOTTOM),
            visible: Mutex::new(true),
        }
    }
}

pub fn set_layout(app: &AppHandle, top: f64, bottom: f64) {
    let state = app.state::<LayoutState>();
    if let Ok(mut value) = state.top.lock() {
        *value = top.max(0.0);
    }
    if let Ok(mut value) = state.bottom.lock() {
        *value = bottom.max(0.0);
    }
    apply(app);
}

pub fn set_visible(app: &AppHandle, visible: bool) {
    let state = app.state::<LayoutState>();
    if let Ok(mut value) = state.visible.lock() {
        *value = visible;
    }
    apply(app);
}

/// Positions the embedded browser between the top bar and the mini player.
pub fn apply(app: &AppHandle) {
    let Some(window) = app.get_window("main") else {
        return;
    };
    let Some(webview) = app.get_webview("soundcloud") else {
        return;
    };
    let state = app.state::<LayoutState>();

    let visible = state.visible.lock().map(|v| *v).unwrap_or(true);
    if !visible {
        let _ = webview.hide();
        return;
    }

    let top = state.top.lock().map(|v| *v).unwrap_or(CHROME_TOP);
    let bottom = state
        .bottom
        .lock()
        .map(|v| *v)
        .unwrap_or(CHROME_BOTTOM);
    let scale = window.scale_factor().unwrap_or(1.0);
    let size = match window.inner_size() {
        Ok(size) => size,
        Err(_) => return,
    };

    let width = size.width as f64 / scale;
    let height = (size.height as f64 / scale - top - bottom).max(1.0);

    let _ = webview.show();
    let _ = webview.set_position(tauri::LogicalPosition::new(0.0, top));
    let _ = webview.set_size(tauri::LogicalSize::new(width, height));
}

fn is_auth_host(host: &str) -> bool {
    matches!(
        host,
        "accounts.google.com"
            | "accounts.youtube.com"
            | "appleid.apple.com"
            | "facebook.com"
            | "www.facebook.com"
            | "m.facebook.com"
    )
}

pub fn create(app: &AppHandle) -> Result<(), String> {
    let window = app.get_window("main").ok_or("main window is missing")?;
    let scale = window.scale_factor().unwrap_or(1.0);
    let size = window.inner_size().map_err(|e| e.to_string())?;
    let width = size.width as f64 / scale;
    let height = (size.height as f64 / scale - CHROME_TOP - CHROME_BOTTOM).max(1.0);

    let bridge = include_str!("injected/bridge.js");
    let page_handle = app.clone();
    let popup_app = app.clone();

    window
        .add_child(
            tauri::webview::WebviewBuilder::new(
                "soundcloud",
                tauri::WebviewUrl::External(
                    SOUNDCLOUD_URL
                        .parse()
                        .map_err(|e| format!("invalid SoundCloud URL: {e}"))?,
                ),
            )
            .user_agent(SAFARI_UA)
            .initialization_script(bridge)
            .background_throttling(BackgroundThrottlingPolicy::Disabled)
            .disable_drag_drop_handler()
            .on_navigation(|url| matches!(url.scheme(), "http" | "https" | "about"))
            .on_page_load(move |_webview, payload| {
                if matches!(
                    payload.event(),
                    tauri::webview::PageLoadEvent::Finished
                ) {
                    crate::player::mark_loading(&page_handle);
                    let _ = page_handle.emit("browser:load", payload.url().to_string());
                }
            })
            .on_new_window(move |url, features| {
                eprintln!("[webview] popup requested: {url}");

                // Google One Tap opens an unactivated about:blank window on load.
                let host = url.host_str().unwrap_or_default();
                if url.scheme() == "about"
                    || (host == "accounts.google.com" && url.path().starts_with("/gsi/"))
                {
                    return tauri::webview::NewWindowResponse::Deny;
                }

                // OAuth providers must get a real browser popup: WebKit keeps the
                // opener link, so the callback can postMessage back and close
                // itself. A Tauri window has no opener and ignores window.close().
                if is_auth_host(host) {
                    return tauri::webview::NewWindowResponse::Allow;
                }

                static POPUP_INDEX: std::sync::atomic::AtomicUsize =
                    std::sync::atomic::AtomicUsize::new(0);
                let index = POPUP_INDEX.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                let label = format!("popup-{index}");

                match tauri::WebviewWindowBuilder::new(
                    &popup_app,
                    label,
                    tauri::WebviewUrl::External(url),
                )
                .window_features(features)
                .title("SoundKloud")
                .inner_size(520.0, 720.0)
                .build()
                {
                    Ok(window) => tauri::webview::NewWindowResponse::Create { window },
                    Err(_) => tauri::webview::NewWindowResponse::Deny,
                }
            }),
            tauri::LogicalPosition::new(0.0, CHROME_TOP),
            tauri::LogicalSize::new(width, height),
        )
        .map_err(|e| format!("cannot create SoundCloud webview: {e}"))?;

    Ok(())
}
