import { ipc, type DiscordActivity, type PlayerState, type PluginInfo } from "./ipc";

export type HookName = "onTrackChange" | "onPlay" | "onPause";

export interface PlayerPayload {
  track: {
    title: string;
    artist: string;
    artwork: string;
    url: string;
    duration: number;
  };
  player: PlayerState;
}

interface RunningWorker {
  id: string;
  worker: Worker;
  url: string;
}

const WORKER_PRELUDE = `"use strict";
// Workers already have no DOM, but they do expose network primitives. Remove
// them so the host API is the only way a plugin can affect the outside world.
try {
  self.fetch = undefined;
  self.XMLHttpRequest = undefined;
  self.WebSocket = undefined;
  self.EventSource = undefined;
  self.importScripts = undefined;
  self.WebTransport = undefined;
} catch (error) { /* ignore */ }
var __config = {};
var __hooks = {};
function __send(message) {
  try { self.postMessage(message); } catch (error) { /* host is gone */ }
}
function registerHooks(hooks) {
  __hooks = hooks || {};
}
var api = {
  get config() { return __config; },
  log: function (level) {
    var parts = Array.prototype.slice.call(arguments, 1).map(function (value) {
      if (typeof value === "string") return value;
      try { return JSON.stringify(value); } catch (error) { return String(value); }
    });
    __send({ type: "log", level: String(level || "info"), message: parts.join(" ") });
  },
  discord: {
    setActivity: function (activity) {
      __send({ type: "discord", activity: activity });
      return Promise.resolve();
    },
    clear: function () {
      __send({ type: "discord", activity: null });
      return Promise.resolve();
    }
  }
};
`;

const WORKER_EPILOGUE = `
self.onmessage = function (event) {
  var data = event.data || {};
  if (data.type === "config") {
    __config = data.config && typeof data.config === "object" ? data.config : {};
    return;
  }
  if (data.type !== "hook") return;
  var handler = __hooks[data.hook];
  if (typeof handler !== "function") return;
  try {
    var result = handler(data.payload || {});
    if (result && typeof result.catch === "function") {
      result.catch(function (error) {
        __send({ type: "error", hook: data.hook, message: String(error && error.message || error) });
      });
    }
  } catch (error) {
    __send({ type: "error", hook: data.hook, message: String(error && error.message || error) });
  }
};
`;

/**
 * Runs enabled plugins inside one Web Worker each. A broken plugin can only
 * kill its own worker; the app and the SoundCloud view keep running.
 */
export class PluginRuntime {
  private running: RunningWorker[] = [];
  private plugins = new Map<string, PluginInfo>();

  load(plugins: PluginInfo[]) {
    this.stop();
    for (const plugin of plugins) {
      if (!plugin.enabled || plugin.error || !plugin.source.trim()) continue;
      this.start(plugin);
    }
  }

  stop() {
    for (const entry of this.running) {
      entry.worker.terminate();
      URL.revokeObjectURL(entry.url);
    }
    this.running = [];
    this.plugins.clear();
  }

  dispatch(hook: HookName, payload: PlayerPayload) {
    for (const entry of this.running) {
      if (!this.plugins.get(entry.id)?.hooks.includes(hook)) continue;
      entry.worker.postMessage({ type: "hook", hook, payload });
    }
  }

  private start(plugin: PluginInfo) {
    const source = `${WORKER_PRELUDE}\ntry {\n${plugin.source}\n} catch (error) {\n  __send({ type: "fatal", message: String(error && error.stack || error) });\n}\n${WORKER_EPILOGUE}`;

    let url = "";
    try {
      url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      const worker = new Worker(url);
      worker.onmessage = (event: MessageEvent) => this.handle(plugin.id, event.data);
      worker.onerror = (event) => {
        this.report(plugin.id, "error", event.message || "plugin worker crashed");
        worker.terminate();
      };
      worker.postMessage({ type: "config", config: plugin.config ?? {} });

      this.running.push({ id: plugin.id, worker, url });
      this.plugins.set(plugin.id, plugin);
    } catch (error) {
      if (url) URL.revokeObjectURL(url);
      this.report(plugin.id, "error", `cannot start plugin: ${String(error)}`);
    }
  }

  private handle(id: string, message: unknown) {
    if (!message || typeof message !== "object") return;
    const data = message as {
      type?: string;
      level?: string;
      message?: string;
      activity?: DiscordActivity | null;
      hook?: string;
    };

    switch (data.type) {
      case "log":
        this.report(id, normalizeLevel(data.level), data.message ?? "");
        break;
      case "error":
        this.report(id, "warn", `${data.hook ?? "hook"} failed: ${data.message ?? "unknown error"}`);
        break;
      case "fatal":
        this.report(id, "error", data.message ?? "plugin crashed while loading");
        break;
      case "discord":
        if (data.activity) {
          ipc
            .discordSetActivity(data.activity)
            .catch((error) => this.report(id, "warn", String(error)));
        } else {
          ipc.discordClearActivity().catch(() => undefined);
        }
        break;
      default:
        break;
    }
  }

  private report(id: string, level: string, message: string) {
    void ipc.pluginLog(id, level, message).catch(() => undefined);
  }
}

function normalizeLevel(level: string | undefined): string {
  return level === "warn" || level === "error" ? level : "info";
}

export function payloadFor(player: PlayerState): PlayerPayload {
  return {
    track: {
      title: player.title,
      artist: player.artist,
      artwork: player.artwork,
      url: player.url,
      duration: player.duration
    },
    player
  };
}
