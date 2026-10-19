import { ipc, type PlayerState } from "../lib/ipc";
import {
  BackIcon,
  ForwardIcon,
  HomeIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PreviousIcon,
  ReloadIcon,
  SettingsIcon
} from "./Icons";

interface TopBarProps {
  player: PlayerState;
  onOpenSettings: () => void;
}

const iconButton =
  "grid h-7 w-7 place-items-center rounded-md text-white/55 transition-colors duration-150 hover:bg-white/10 hover:text-white active:scale-95 disabled:opacity-30 disabled:hover:bg-transparent";

export function TopBar({ player, onOpenSettings }: TopBarProps) {
  const toggle = () => {
    void ipc.playerCommand("toggle").catch(() => undefined);
  };

  return (
    <header
      data-tauri-drag-region
      className="fixed inset-x-0 top-0 z-30 flex h-11 items-center gap-2 border-b border-white/[0.06] bg-ink-900/95 pl-[78px] pr-3 backdrop-blur-xl"
    >
      <div className="flex items-center gap-0.5" data-tauri-drag-region>
        <button className={iconButton} title="Back" aria-label="Back" onClick={() => void ipc.browserBack()}>
          <BackIcon size={16} />
        </button>
        <button
          className={iconButton}
          title="Forward"
          aria-label="Forward"
          onClick={() => void ipc.browserForward()}
        >
          <ForwardIcon size={16} />
        </button>
        <button className={iconButton} title="Reload" aria-label="Reload" onClick={() => void ipc.browserReload()}>
          <ReloadIcon size={15} />
        </button>
        <button className={iconButton} title="SoundCloud home" aria-label="SoundCloud home" onClick={() => void ipc.browserHome()}>
          <HomeIcon size={15} />
        </button>
      </div>

      <div className="mx-2 h-4 w-px bg-white/10" data-tauri-drag-region />

      <div className="flex min-w-0 flex-1 items-center gap-2" data-tauri-drag-region>
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full transition-colors ${
            player.playing ? "bg-accent shadow-[0_0_8px_rgb(var(--accent-rgb)/0.9)]" : "bg-white/20"
          }`}
        />
        <p className="truncate text-[12px] font-medium leading-none text-white/75" data-tauri-drag-region>
          {player.title || "SoundCloud"}
          {player.artist && (
            <span className="ml-2 font-normal text-white/35" data-tauri-drag-region>
              {player.artist}
            </span>
          )}
        </p>
      </div>

      <div className="flex items-center gap-1">
        <button
          className={iconButton}
          title="Previous"
          aria-label="Previous track"
          onClick={() => void ipc.playerCommand("prev")}
        >
          <PreviousIcon size={15} />
        </button>
        <button
          className="grid h-7 w-7 place-items-center rounded-full bg-accent text-[#0b0714] shadow-[0_2px_10px_rgb(var(--accent-rgb)/0.35)] transition-transform duration-150 hover:brightness-110 active:scale-95"
          title={player.playing ? "Pause" : "Play"}
          aria-label={player.playing ? "Pause" : "Play"}
          onClick={toggle}
        >
          {player.playing ? <PauseIcon size={13} /> : <PlayIcon size={13} />}
        </button>
        <button
          className={iconButton}
          title="Next"
          aria-label="Next track"
          onClick={() => void ipc.playerCommand("next")}
        >
          <NextIcon size={15} />
        </button>
      </div>

      <div className="mx-1 h-4 w-px bg-white/10" data-tauri-drag-region />

      <button
        className={iconButton}
        title="Settings"
        aria-label="Settings"
        onClick={onOpenSettings}
      >
        <SettingsIcon size={16} />
      </button>
    </header>
  );
}
