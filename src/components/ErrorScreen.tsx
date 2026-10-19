import { WarningIcon } from "./Icons";

interface ErrorScreenProps {
  message?: string;
  onReload: () => void;
  onOpenSettings: () => void;
}

export function ErrorScreen({ message, onReload, onOpenSettings }: ErrorScreenProps) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink-950 px-8">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute left-1/2 top-1/3 h-72 w-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-rose-500/10 blur-[120px]" />
        <div className="absolute bottom-0 left-1/2 h-64 w-[30rem] -translate-x-1/2 rounded-full bg-accent/10 blur-[110px]" />
      </div>

      <div className="relative w-full max-w-md text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/10 bg-white/[0.04] text-rose-300 shadow-2xl">
          <WarningIcon size={26} />
        </div>

        <h1 className="mt-5 text-[19px] font-semibold tracking-tight text-white">
          SoundCloud didn’t load
        </h1>
        <p className="mt-2 text-[12.5px] leading-relaxed text-white/45">
          The embedded web player stopped responding. Check your internet connection, then reload.
        </p>
        {message && (
          <p className="mx-auto mt-3 max-w-sm rounded-lg border border-white/[0.07] bg-white/[0.03] px-3 py-2 font-mono text-[10.5px] leading-relaxed text-white/35">
            {message}
          </p>
        )}

        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            onClick={onReload}
            className="rounded-lg bg-accent px-4 py-2 text-[12px] font-semibold text-[#0b0714] shadow-[0_6px_24px_rgb(var(--accent-rgb)/0.35)] transition hover:brightness-110 active:scale-[0.98]"
          >
            Reload SoundCloud
          </button>
          <button
            onClick={onOpenSettings}
            className="rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-[12px] font-medium text-white/70 transition hover:border-white/20 hover:text-white"
          >
            Settings
          </button>
        </div>

        <p className="mt-8 text-[10.5px] leading-relaxed text-white/25">
          If you are offline, SoundKloud keeps running in the menu bar. Media keys resume working
          after the page reconnects.
        </p>
      </div>
    </div>
  );
}
