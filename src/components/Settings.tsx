import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ipc, type AppInfo, type Config, type PluginInfo, type PluginLogEntry } from "../lib/ipc";
import { CheckIcon, CloseIcon, ExternalIcon, FolderIcon, ReloadIcon } from "./Icons";

const ACCENTS = ["#8b5cf6", "#3b82f6", "#06b6d4", "#10b981", "#84cc16", "#f59e0b", "#f97316", "#f43f5e", "#ec4899"];

interface LogEntry extends PluginLogEntry {
  at: number;
}

interface SettingsProps {
  config: Config;
  plugins: PluginInfo[];
  info: AppInfo | null;
  logs: LogEntry[];
  onClose: () => void;
  onChange: (patch: Partial<Config>) => void;
  onRefreshPlugins: () => void;
  onPluginEnabled: (id: string, enabled: boolean) => void;
  onPluginConfig: (id: string, value: Record<string, unknown>) => void;
}

export function Settings({
  config,
  plugins,
  info,
  logs,
  onClose,
  onChange,
  onRefreshPlugins,
  onPluginEnabled,
  onPluginConfig
}: SettingsProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const pluginNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const plugin of plugins) map.set(plugin.id, plugin.name);
    return map;
  }, [plugins]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-6 backdrop-blur-md">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-accent/20 blur-[120px]" />
      </div>

      <section className="relative flex max-h-[min(820px,calc(100vh-48px))] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-900/95 shadow-[0_30px_90px_rgba(0,0,0,0.65)]">
        <header className="flex items-center justify-between border-b border-white/[0.07] px-7 py-4">
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight text-white">Settings</h1>
            <p className="mt-0.5 text-[11px] text-white/35">
              {info ? `${info.name} ${info.version} · ${info.platform} ${info.arch}` : "SoundKloud"}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="grid h-8 w-8 place-items-center rounded-lg text-white/50 transition hover:bg-white/10 hover:text-white"
          >
            <CloseIcon size={16} />
          </button>
        </header>

        <div className="settings-scroll flex-1 space-y-8 overflow-y-auto px-7 py-6">
          <section>
            <SectionTitle title="Appearance" hint="Accent colors apply to controls and highlights." />
            <div className="card">
              <div className="flex flex-wrap items-center gap-2">
                {ACCENTS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Use accent ${color}`}
                    onClick={() => onChange({ accent: color })}
                    className="grid h-7 w-7 place-items-center rounded-full ring-1 ring-inset ring-white/20 transition hover:scale-110"
                    style={{ backgroundColor: color }}
                  >
                    {config.accent.toLowerCase() === color && <CheckIcon size={13} className="text-black/70" />}
                  </button>
                ))}
                <label className="ml-1 flex h-7 cursor-pointer items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-2 text-[11px] text-white/50 transition hover:border-white/20 hover:text-white/75">
                  <input
                    type="color"
                    value={config.accent}
                    className="h-4 w-5 cursor-pointer border-0 bg-transparent p-0"
                    onChange={(event) => onChange({ accent: event.currentTarget.value })}
                  />
                  Custom
                </label>
              </div>

              <Row
                title="Mini player"
                description="Show the always-on-bottom player bar with seek and volume."
              >
                <Toggle checked={config.miniPlayer} onChange={(value) => onChange({ miniPlayer: value })} />
              </Row>
            </div>
          </section>

          <section>
            <SectionTitle title="Behavior" hint="SoundKloud stays out of the way until you need it." />
            <div className="card">
              <Row
                title="Keep running in the menu bar"
                description="Closing the window hides it to the tray instead of quitting. Quit from the tray menu or ⌘Q."
              >
                <Toggle checked={config.hideToTray} onChange={(value) => onChange({ hideToTray: value })} />
              </Row>
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-end justify-between gap-3">
              <SectionTitle title="Plugins" hint="Sandboxed JavaScript. Disabled plugins never load." />
              <div className="mb-2 flex items-center gap-1">
                <button className="chip-button" onClick={() => void ipc.openPluginsDir()}>
                  <FolderIcon size={13} /> Open folder
                </button>
                <button className="chip-button" onClick={onRefreshPlugins}>
                  <ReloadIcon size={13} /> Reload
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {plugins.length === 0 && (
                <p className="rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-[12px] text-white/35">
                  No plugins installed yet. Open the plugins folder to add one.
                </p>
              )}
              {plugins.map((plugin) => (
                <PluginCard
                  key={plugin.id}
                  plugin={plugin}
                  onEnabled={onPluginEnabled}
                  onConfig={onPluginConfig}
                />
              ))}
            </div>
          </section>

          <section>
            <SectionTitle title="Recent plugin activity" hint="Warnings never stop playback." />
            <div className="logs">
              {logs.length === 0 ? (
                <p className="px-3 py-3 text-[11px] text-white/30">Nothing logged yet.</p>
              ) : (
                logs.map((entry, index) => (
                  <p key={`${entry.at}-${index}`} className="px-3 py-1">
                    <span className="mr-2 font-mono text-[10px] uppercase text-white/25">{entry.level}</span>
                    <span className="mr-2 text-white/40">{pluginNames.get(entry.pluginId) ?? entry.pluginId}</span>
                    <span className="text-white/65">{entry.message}</span>
                  </p>
                ))
              )}
            </div>
          </section>

          <section>
            <SectionTitle title="About" hint="Everything is stored locally." />
            <div className="card space-y-3 text-[11.5px]">
              <PathRow label="Config file" value={info?.configFile ?? "…"} />
              <PathRow label="Plugins" value={info?.pluginsDir ?? "…"} />
              <PathRow label="Tauri" value={info?.tauriVersion ?? "…"} />
              <div className="flex items-center justify-between pt-1">
                <p className="text-white/35">
                  Playback uses the official SoundCloud web player. No downloads, no DRM bypass.
                </p>
                <button
                  className="chip-button shrink-0"
                  onClick={() => void ipc.openExternal("https://soundcloud.com")}
                >
                  <ExternalIcon size={13} /> soundcloud.com
                </button>
              </div>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-2">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/45">{title}</h2>
      <p className="mt-1 text-[11.5px] text-white/30">{hint}</p>
    </div>
  );
}

function Row({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-2.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-[12.5px] font-medium text-white/85">{title}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-white/35">{description}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-[22px] w-[38px] rounded-full transition-colors duration-200 ${
        checked ? "bg-accent" : "bg-white/15"
      }`}
    >
      <span
        className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-transform duration-200 ${
          checked ? "translate-x-[18px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}

function PathRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="w-20 shrink-0 text-white/30">{label}</span>
      <code className="select-all break-all font-mono text-[10.5px] leading-relaxed text-white/60">{value}</code>
    </div>
  );
}

interface PluginCardProps {
  plugin: PluginInfo;
  onEnabled: (id: string, enabled: boolean) => void;
  onConfig: (id: string, value: Record<string, unknown>) => void;
}

function PluginCard({ plugin, onEnabled, onConfig }: PluginCardProps) {
  const [values, setValues] = useState<Record<string, unknown>>(plugin.config ?? {});

  useEffect(() => {
    setValues(plugin.config ?? {});
  }, [plugin.config]);

  const save = (key: string, raw: string, kind: string) => {
    const next = { ...values, [key]: kind === "number" ? Number(raw) || 0 : raw };
    setValues(next);
    onConfig(plugin.id, next);
  };

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="truncate text-[12.5px] font-medium text-white/85">{plugin.name}</p>
            <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[9.5px] text-white/35">
              v{plugin.version}
            </span>
            {plugin.error && (
              <span className="rounded bg-rose-500/15 px-1.5 py-0.5 text-[9.5px] font-medium text-rose-300">
                error
              </span>
            )}
          </div>
          {plugin.description && (
            <p className="mt-1 text-[11px] leading-snug text-white/35">{plugin.description}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1">
            {plugin.hooks.map((hook) => (
              <span key={hook} className="rounded bg-white/[0.05] px-1.5 py-0.5 font-mono text-[9.5px] text-white/30">
                {hook}
              </span>
            ))}
            {plugin.author && <span className="px-1 text-[9.5px] text-white/20">by {plugin.author}</span>}
          </div>
        </div>
        <Toggle checked={plugin.enabled} onChange={(value) => onEnabled(plugin.id, value)} />
      </div>

      {plugin.error && (
        <p className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200/80">
          {plugin.error}
        </p>
      )}

      {plugin.enabled && plugin.settings.length > 0 && !plugin.error && (
        <div className="mt-3 grid gap-2 border-t border-white/[0.06] pt-3">
          {plugin.settings.map((setting) => (
            <label key={setting.key} className="flex items-center gap-3">
              <span className="w-40 shrink-0 text-[11px] text-white/40">{setting.label}</span>
              <input
                className="field"
                type={setting.kind === "password" ? "password" : setting.kind === "number" ? "number" : "text"}
                placeholder={setting.placeholder}
                value={String(values[setting.key] ?? "")}
                onChange={(event) =>
                  setValues((previous) => ({ ...previous, [setting.key]: event.currentTarget.value }))
                }
                onBlur={(event) => save(setting.key, event.currentTarget.value, setting.kind)}
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
