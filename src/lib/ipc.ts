import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

export interface PlayerState {
  alive: boolean;
  playing: boolean;
  title: string;
  artist: string;
  artwork: string;
  position: number;
  duration: number;
  volume: number;
  hasAudio: boolean;
  url: string;
}

export const EMPTY_PLAYER: PlayerState = {
  alive: false,
  playing: false,
  title: "",
  artist: "",
  artwork: "",
  position: 0,
  duration: 0,
  volume: 0.8,
  hasAudio: false,
  url: ""
};

export interface Config {
  accent: string;
  miniPlayer: boolean;
  volume: number;
  hideToTray: boolean;
  plugins: Record<string, boolean>;
  pluginConfig: Record<string, unknown>;
}

export interface PluginSetting {
  key: string;
  label: string;
  kind: "string" | "password" | "number" | string;
  placeholder: string;
  default?: unknown;
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  hooks: string[];
  settings: PluginSetting[];
  source: string;
  enabled: boolean;
  config: Record<string, unknown>;
  directory: string;
  error: string | null;
}

export interface AppInfo {
  name: string;
  version: string;
  tauriVersion: string;
  configDir: string;
  configFile: string;
  pluginsDir: string;
  dataDir: string;
  platform: string;
  arch: string;
}

export interface DiscordActivityButton {
  label: string;
  url: string;
}

export interface DiscordActivity {
  clientId: string;
  details: string;
  state: string;
  largeImage: string;
  largeText: string;
  timestampStart: number | null;
  paused: boolean;
  buttons: DiscordActivityButton[];
}

export interface PluginLogEntry {
  pluginId: string;
  level: string;
  message: string;
}

export const ipc = {
  getConfig: () => invoke<Config>("get_config"),
  saveConfig: (value: Config) => invoke<Config>("save_config", { value }),
  getPlayerState: () => invoke<PlayerState>("get_player_state"),
  playerCommand: (action: string, value?: number) =>
    invoke<void>("player_command", { action, value: value ?? null }),

  browserReload: () => invoke<void>("browser_reload"),
  browserBack: () => invoke<void>("browser_back"),
  browserForward: () => invoke<void>("browser_forward"),
  browserHome: () => invoke<void>("browser_home"),
  setBrowserVisible: (visible: boolean) => invoke<void>("set_browser_visible", { visible }),
  setLayout: (top: number, bottom: number) => invoke<void>("set_layout", { top, bottom }),

  openExternal: (url: string) => invoke<void>("open_external", { url }),
  openPluginsDir: () => invoke<void>("open_plugins_dir"),

  listPlugins: () => invoke<PluginInfo[]>("list_plugins"),
  setPluginEnabled: (id: string, enabled: boolean) =>
    invoke<Config>("set_plugin_enabled", { id, enabled }),
  setPluginConfig: (id: string, value: unknown) =>
    invoke<Config>("set_plugin_config", { id, value }),

  pluginLog: (pluginId: string, level: string, message: string) =>
    invoke<void>("plugin_log", { pluginId, level, message }),

  appInfo: () => invoke<AppInfo>("app_info"),

  discordSetActivity: (activity: DiscordActivity) =>
    invoke<void>("discord_set_activity", { activity }),
  discordClearActivity: () => invoke<void>("discord_clear_activity")
};

export function onEvent<T>(name: string, handler: (payload: T) => void): Promise<UnlistenFn> {
  return listen<T>(name, (event) => handler(event.payload));
}
