/*
 * SoundKloud bridge — runs at document-start inside the SoundCloud webview.
 *
 * The app never injects UI and never touches audio streams. This script only:
 *   1. observes the Media Session state that SoundCloud already publishes,
 *   2. captures the Media Session action handlers SoundCloud registers,
 *   3. exposes play/pause/next/prev/seek/volume through those handlers
 *      (with DOM fallbacks), so the mini player and macOS media keys can drive
 *      the official web player exactly like a browser would.
 */
(function () {
  "use strict";

  var KEY = "__SOUNDKLOUD_BRIDGE_V1__";
  if (window[KEY]) return;
  if (!/(^|\.)soundcloud\.com$/i.test(location.hostname)) return;

  // --- Block background popups. Google One Tap opens an about:blank window
  // while the page loads; user-initiated sign-in popups still go through.
  try {
    var originalOpen = window.open;
    if (typeof originalOpen === "function") {
      window.open = function (url, name, features) {
        try {
          var active = navigator.userActivation ? navigator.userActivation.isActive : true;
          var target = String(url == null ? "" : url);
          if (
            !active &&
            (!target || target === "about:blank" || /accounts\.google\.com\/gsi\//i.test(target))
          ) {
            return null;
          }
        } catch (error) {
          /* fall through to the real implementation */
        }
        return originalOpen.apply(window, arguments);
      };
    }
  } catch (error) {
    /* ignore */
  }

  var state = {
    audio: null,
    handlers: Object.create(null),
    positionState: null,
    positionAt: 0,
    volume: 1
  };

  function now() {
    return window.performance && performance.now ? performance.now() : Date.now();
  }

  var mediaSession = null;
  try {
    mediaSession = navigator.mediaSession || null;
  } catch (error) {
    mediaSession = null;
  }

  // --- Capture the handlers SoundCloud registers, so we can invoke them later.
  if (mediaSession) {
    var originalSetHandler = mediaSession.setActionHandler;
    if (typeof originalSetHandler === "function") {
      try {
        mediaSession.setActionHandler = function (action, handler) {
          state.handlers[action] = typeof handler === "function" ? handler : null;
          try {
            return originalSetHandler.call(mediaSession, action, handler);
          } catch (error) {
            return undefined;
          }
        };
      } catch (error) {
        /* read-only in some engines; DOM fallbacks still work */
      }
    }

    // --- Track position updates without polling the page internals.
    var originalSetPosition = mediaSession.setPositionState;
    if (typeof originalSetPosition === "function") {
      try {
        mediaSession.setPositionState = function (details) {
          try {
            if (details && isFinite(details.position)) {
              state.positionState = {
                position: Math.max(0, Number(details.position) || 0),
                duration: Math.max(0, Number(details.duration) || 0),
                rate: Number(details.playbackRate) > 0 ? Number(details.playbackRate) : 1
              };
              state.positionAt = now();
            }
          } catch (error) {
            /* ignore malformed position state */
          }
          try {
            return originalSetPosition.call(mediaSession, details);
          } catch (error) {
            return undefined;
          }
        };
      } catch (error) {
        /* ignore */
      }
    }
  }

  // --- Capture the media element the page uses (if it uses one at all).
  try {
    var proto = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
    if (proto && typeof proto.play === "function") {
      var originalPlay = proto.play;
      proto.play = function () {
        try {
          if (this instanceof window.HTMLMediaElement) state.audio = this;
        } catch (error) {
          /* ignore */
        }
        return originalPlay.apply(this, arguments);
      };
    }
  } catch (error) {
    /* ignore */
  }

  function pickAudio() {
    try {
      var captured = state.audio;
      if (captured && captured.isConnected && isFinite(captured.currentTime)) {
        return captured;
      }
      var list = document.querySelectorAll("audio");
      for (var i = 0; i < list.length; i += 1) {
        var el = list[i];
        if (el && (el.currentSrc || el.src || el.readyState > 0)) {
          state.audio = el;
          return el;
        }
      }
      if (captured && isFinite(captured.currentTime)) return captured;
    } catch (error) {
      /* ignore */
    }
    return null;
  }

  function isPlaying() {
    var audio = pickAudio();
    if (audio) return !audio.paused && !audio.ended && audio.readyState > 0;
    return !!(mediaSession && mediaSession.playbackState === "playing");
  }

  function firstText(selectors) {
    for (var i = 0; i < selectors.length; i += 1) {
      try {
        var el = document.querySelector(selectors[i]);
        if (el && el.textContent && el.textContent.trim()) {
          return el.textContent.trim();
        }
      } catch (error) {
        /* ignore */
      }
    }
    return "";
  }

  function clean(value) {
    return String(value || "")
      .replace(/^Current track:\s*/i, "")
      .trim();
  }

  function artworkFromMeta(meta) {
    try {
      if (meta && meta.artwork && meta.artwork.length) {
        var last = meta.artwork[meta.artwork.length - 1];
        if (last && last.src) return last.src;
      }
    } catch (error) {
      /* ignore */
    }
    return "";
  }

  function artworkFromDom() {
    try {
      var node = document.querySelector(
        ".playbackSoundBadge__avatar .sc-artwork, .playbackSoundBadge__avatar span, .playbackSoundBadge img"
      );
      if (!node) return "";
      if (node.tagName === "IMG" && node.src) return node.src;
      var background = window.getComputedStyle(node).backgroundImage || "";
      var match = background.match(/url\(["']?(.*?)["']?\)/);
      if (match && match[1]) return match[1];
      var img = node.querySelector && node.querySelector("img");
      if (img && img.src) return img.src;
    } catch (error) {
      /* ignore */
    }
    return "";
  }

  function metadata() {
    var meta = mediaSession && mediaSession.metadata;
    if (meta && meta.title) {
      return {
        title: clean(meta.title),
        artist: clean(meta.artist),
        artwork: artworkFromMeta(meta)
      };
    }
    return {
      title: clean(
        firstText([
          ".playbackSoundBadge__titleLink span",
          ".playbackSoundBadge__titleLink",
          ".playbackSoundBadge__title",
          "[data-testid='track-title']"
        ])
      ),
      artist: clean(
        firstText([
          ".playbackSoundBadge__lightLink",
          ".playbackSoundBadge__subtitle a",
          ".playbackSoundBadge__usernameLink",
          "[data-testid='track-artist']"
        ])
      ),
      artwork: artworkFromDom()
    };
  }

  function position(audio, playing) {
    if (audio && isFinite(audio.currentTime) && audio.currentTime > 0) {
      return audio.currentTime;
    }
    if (state.positionState) {
      var extra = playing
        ? ((now() - state.positionAt) / 1000) * state.positionState.rate
        : 0;
      return Math.max(0, state.positionState.position + extra);
    }
    return audio && isFinite(audio.currentTime) ? audio.currentTime : 0;
  }

  function snapshot() {
    try {
      var audio = pickAudio();
      var info = metadata();
      var playing = isPlaying();
      var duration =
        audio && isFinite(audio.duration) && audio.duration > 0
          ? audio.duration
          : state.positionState
            ? state.positionState.duration
            : 0;
      var current = position(audio, playing);
      if (duration > 0) current = Math.min(current, duration);

      return {
        ok: true,
        playing: playing,
        title: info.title,
        artist: info.artist,
        artwork: info.artwork,
        position: current,
        duration: duration || 0,
        volume:
          audio && typeof audio.volume === "number" ? audio.volume : state.volume,
        hasAudio: !!audio,
        url: location.href,
        at: Date.now()
      };
    } catch (error) {
      return { ok: false, reason: String(error) };
    }
  }

  // --- Controls ---------------------------------------------------------

  function callHandler(action, details) {
    var handler = state.handlers[action];
    if (typeof handler !== "function") return false;
    try {
      handler(details || {});
      return true;
    } catch (error) {
      return false;
    }
  }

  function clickFirst(selectors) {
    for (var i = 0; i < selectors.length; i += 1) {
      try {
        var el = document.querySelector(selectors[i]);
        if (el) {
          el.click();
          return true;
        }
      } catch (error) {
        /* ignore */
      }
    }
    return false;
  }

  function play() {
    if (callHandler("play")) return "handler";
    var audio = pickAudio();
    if (audio) {
      try {
        audio.play();
        return "audio";
      } catch (error) {
        /* autoplay may be blocked until a user gesture */
      }
    }
    return clickFirst([
      ".playControls__control.sc-button-play",
      ".playControls__play",
      "button[aria-label='Play']",
      "[data-testid='play-button']"
    ])
      ? "dom"
      : "noop";
  }

  function pause() {
    if (callHandler("pause")) return "handler";
    var audio = pickAudio();
    if (audio) {
      try {
        audio.pause();
        return "audio";
      } catch (error) {
        /* ignore */
      }
    }
    return clickFirst([
      ".playControls__control.sc-button-pause",
      ".playControls__pause",
      "button[aria-label='Pause']",
      "[data-testid='pause-button']"
    ])
      ? "dom"
      : "noop";
  }

  function toggle() {
    return isPlaying() ? pause() : play();
  }

  function next() {
    if (callHandler("nexttrack")) return "handler";
    return clickFirst([
      ".playControls__next",
      ".skipControl__next",
      "button[aria-label='Next']",
      "[title='Next']"
    ])
      ? "dom"
      : "noop";
  }

  function previous() {
    if (callHandler("previoustrack")) return "handler";
    return clickFirst([
      ".playControls__prev",
      ".skipControl__previous",
      "button[aria-label='Previous']",
      "[title='Previous']"
    ])
      ? "dom"
      : "noop";
  }

  function dispatchAt(el, x, y) {
    var options = {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      view: window
    };
    var types = [
      "pointerover",
      "pointerenter",
      "pointermove",
      "pointerdown",
      "mousedown",
      "pointerup",
      "mouseup",
      "click"
    ];
    for (var i = 0; i < types.length; i += 1) {
      try {
        el.dispatchEvent(new MouseEvent(types[i], options));
      } catch (error) {
        /* ignore */
      }
    }
  }

  function seekBarClick(seconds) {
    var selectors = [
      ".playbackTimeline__progressWrapper",
      ".playbackTimeline__progressBackground",
      "[data-testid='progress-bar']"
    ];
    var audio = pickAudio();
    var duration =
      audio && isFinite(audio.duration) && audio.duration > 0
        ? audio.duration
        : state.positionState
          ? state.positionState.duration
          : 0;
    if (!duration) return false;

    for (var i = 0; i < selectors.length; i += 1) {
      try {
        var bar = document.querySelector(selectors[i]);
        if (!bar) continue;
        var rect = bar.getBoundingClientRect();
        if (rect.width <= 0) continue;
        var ratio = Math.min(1, Math.max(0, seconds / duration));
        dispatchAt(bar, rect.left + rect.width * ratio, rect.top + rect.height / 2);
        return true;
      } catch (error) {
        /* ignore */
      }
    }
    return false;
  }

  function seekTo(seconds) {
    var value = Math.max(0, Number(seconds) || 0);
    if (callHandler("seekto", { action: "seekto", seekTime: value, fastSeek: false })) {
      return "handler";
    }
    var audio = pickAudio();
    if (audio && isFinite(audio.duration) && audio.duration > 0) {
      try {
        audio.currentTime = Math.min(value, audio.duration);
        return "audio";
      } catch (error) {
        /* ignore */
      }
    }
    return seekBarClick(value) ? "dom" : "noop";
  }

  function seekBy(delta) {
    return seekTo(position(pickAudio(), isPlaying()) + (Number(delta) || 0));
  }

  function setVolume(value) {
    var volume = Math.min(1, Math.max(0, Number(value) || 0));
    state.volume = volume;
    var audio = pickAudio();
    if (audio) {
      try {
        audio.muted = false;
        audio.volume = volume;
        return "audio";
      } catch (error) {
        /* ignore */
      }
    }
    try {
      var slider =
        document.querySelector(".volume__sliderWrapper") ||
        document.querySelector(".volume__slider");
      if (slider) {
        var rect = slider.getBoundingClientRect();
        if (rect.width > 0) {
          dispatchAt(slider, rect.left + rect.width * volume, rect.top + rect.height / 2);
          return "dom";
        }
      }
    } catch (error) {
      /* ignore */
    }
    return "noop";
  }

  function command(name, value) {
    switch (name) {
      case "play":
        return play();
      case "pause":
        return pause();
      case "toggle":
        return toggle();
      case "next":
        return next();
      case "prev":
        return previous();
      case "seek":
        return seekTo(value);
      case "seekBy":
        return seekBy(value);
      case "volume":
        return setVolume(value);
      default:
        return "unknown";
    }
  }

  var bridge = { version: 1, snapshot: snapshot, command: command };
  try {
    Object.defineProperty(window, KEY, { value: bridge, configurable: true });
  } catch (error) {
    window[KEY] = bridge;
  }
})();
