import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorScreen } from "./components/ErrorScreen";
import { MiniPlayer } from "./components/MiniPlayer";
import { Settings } from "./components/Settings";
import { TopBar } from "./components/TopBar";
import {
  EMPTY_PLAYER,
  ipc,
  onEvent,
  type AppInfo,
  type Config,
  type PlayerState,
  type PluginInfo,
  type PluginLogEntry
} from "./lib/ipc";
import { payloadFor, PluginRuntime } from "./lib/pluginHost";
import { hexToRgb } from "./lib/format";

const CHROME_TOP = 44;
const CHROME_BOTTOM = 76;
const WATCHDOG_MS = 25_000;

interface LogEntry extends PluginLogEntry {
  at: number;
}

export default function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [player, setPlayer] = useState<PlayerState>(EMPTY_PLAYER);
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [browserUrl, setBrowserUrl] = useState("https://soundcloud.com");

  const runtime = useMemo(() => new PluginRuntime(), []);
  const isSoundCloudPage = useMemo(() => {
    try {
      const host = new URL(browserUrl).hostname;
      return host === "soundcloud.com" || host.endsWith(".soundcloud.com");
    } catch {
      return true;
    }
  }, [browserUrl]);
  const previousPlayer = useRef<PlayerState | null>(null);
  const configRef = useRef<Config | null>(null);
  const savedOnce = useRef(false);

  const refreshPlugins = useCallback(async () => {
    try {
      setPlugins(await ipc.listPlugins());
    } catch (cause) {
      console.warn("cannot list plugins", cause);
    }
  }, []);

  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    const sub = <T,>(name: string, handler: (payload: T) => void) => {
      void onEvent<T>(name, handler).then((off) => {
        if (disposed) off();
        else unlisteners.push(off);
      });
    };

    const boot = async () => {
      try {
        const [loadedConfig, state, installed, appInfo] = await Promise.all([
          ipc.getConfig(),
          ipc.getPlayerState(),
          ipc.listPlugins(),
          ipc.appInfo()
        ]);
        if (disposed) return;
        configRef.current = loadedConfig;
        setConfig(loadedConfig);
        setPlayer(state);
        setPlugins(installed);
        setInfo(appInfo);
      } catch (cause) {
        if (!disposed) setError(String(cause));
      }
    };
    void boot();

    sub<PlayerState>("player:state", (next) => {
      setPlayer(next);
      if (next.alive) setError(null);
    });
    sub("player:online", () => setError(null));
    sub<string>("browser:load", (url) => {
      setError(null);
      setBrowserUrl(url);
    });
    sub<string>("browser:error", (message) => setError(message));
    sub("ui:open-settings", () => setSettingsOpen(true));
    sub<Config>("plugins:changed", (next) => {
      configRef.current = next;
      setConfig(next);
      void refreshPlugins();
    });
    sub<PluginLogEntry>("plugin:log", (entry) => {
      setLogs((previous) => [{ ...entry, at: Date.now() }, ...previous].slice(0, 60));
    });

    return () => {
      disposed = true;
      unlisteners.forEach((off) => off());
      runtime.stop();
    };
  }, [refreshPlugins, runtime]);

  useEffect(() => {
    configRef.current = config;
    if (!config) return;
    if (!savedOnce.current) {
      savedOnce.current = true;
      return;
    }
    const timer = window.setTimeout(() => {
      void ipc.saveConfig(config).catch((cause) => console.warn("cannot save settings", cause));
    }, 180);
    return () => window.clearTimeout(timer);
  }, [config]);

  const bottom = config === null || config.miniPlayer ? CHROME_BOTTOM : 0;

  useEffect(() => {
    if (!config) return;
    void ipc.setLayout(CHROME_TOP, bottom).catch(() => undefined);
  }, [bottom, config]);

  useEffect(() => {
    void ipc.setBrowserVisible(!settingsOpen && error === null).catch(() => undefined);
  }, [settingsOpen, error]);

  useEffect(() => {
    const accent = config?.accent ?? "#8b5cf6";
    const [r, g, b] = hexToRgb(accent);
    document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.style.setProperty("--accent-rgb", `${r} ${g} ${b}`);
  }, [config?.accent]);

  useEffect(() => {
    runtime.load(plugins);
  }, [plugins, runtime]);

  useEffect(() => {
    const discord = plugins.find((plugin) => plugin.id === "discord-rich-presence");
    if (discord && !discord.enabled) {
      void ipc.discordClearActivity().catch(() => undefined);
    }
  }, [plugins]);

  useEffect(() => {
    const previous = previousPlayer.current;
    previousPlayer.current = player;
    if (!player.alive) return;

    const payload = payloadFor(player);
    if (!previous) {
      if (player.title) runtime.dispatch("onTrackChange", payload);
      return;
    }
    if (player.title !== previous.title || player.artist !== previous.artist || player.url !== previous.url) {
      runtime.dispatch("onTrackChange", payload);
    }
    if (player.playing && !previous.playing) runtime.dispatch("onPlay", payload);
    if (!player.playing && previous.playing) runtime.dispatch("onPause", payload);
  }, [player, runtime]);

  useEffect(() => {
    if (player.alive || settingsOpen || !isSoundCloudPage) return;
    const timer = window.setTimeout(() => {
      setError((current) => current ?? "No response from the embedded SoundCloud view.");
    }, WATCHDOG_MS);
    return () => window.clearTimeout(timer);
  }, [player.alive, settingsOpen, attempt, isSoundCloudPage]);

  const changeConfig = useCallback((patch: Partial<Config>) => {
    const current = configRef.current;
    if (!current) return;
    const next = { ...current, ...patch };
    configRef.current = next;
    setConfig(next);
  }, []);

  const reload = useCallback(() => {
    setError(null);
    setAttempt((value) => value + 1);
    void ipc.browserReload().catch((cause) => setError(String(cause)));
  }, []);

  const setPluginEnabled = useCallback(
    (id: string, enabled: boolean) => {
      void ipc.setPluginEnabled(id, enabled).catch((cause) => {
        setLogs((previous) => [
          { pluginId: id, level: "error", message: String(cause), at: Date.now() },
          ...previous
        ].slice(0, 60));
      });
    },
    []
  );

  const setPluginConfig = useCallback(
    (id: string, value: Record<string, unknown>) => {
      void ipc.setPluginConfig(id, value).catch((cause) => {
        setLogs((previous) => [
          { pluginId: id, level: "error", message: String(cause), at: Date.now() },
          ...previous
        ].slice(0, 60));
      });
    },
    []
  );

  if (!config) {
    return (
      <div className="fixed inset-0 grid place-items-center bg-ink-950">
        <div className="flex flex-col items-center gap-4">
          <div className="flex items-end gap-1">
            {[0, 1, 2, 3, 4].map((index) => (
              <span
                key={index}
                className="w-1.5 animate-pulse rounded-full bg-accent"
                style={{ height: `${10 + [8, 18, 26, 16, 10][index]}px`, animationDelay: `${index * 120}ms` }}
              />
            ))}
          </div>
          <p className="text-[11px] tracking-wide text-white/30">Loading SoundCloud…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full">
      <TopBar player={player} onOpenSettings={() => setSettingsOpen(true)} />

      {config.miniPlayer && (
        <MiniPlayer player={player} onOpenSettings={() => setSettingsOpen(true)} />
      )}

      {error !== null && !settingsOpen && (
        <ErrorScreen
          message={error}
          onReload={reload}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}

      {settingsOpen && (
        <Settings
          config={config}
          plugins={plugins}
          info={info}
          logs={logs}
          onClose={() => setSettingsOpen(false)}
          onChange={changeConfig}
          onRefreshPlugins={() => void refreshPlugins()}
          onPluginEnabled={setPluginEnabled}
          onPluginConfig={setPluginConfig}
        />
      )}
    </div>
  );
}
