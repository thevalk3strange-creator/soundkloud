import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ipc, type PlayerState } from "../lib/ipc";
import { clamp, formatTime } from "../lib/format";
import { MusicIcon, NextIcon, PauseIcon, PlayIcon, PreviousIcon, VolumeIcon } from "./Icons";

interface MiniPlayerProps {
  player: PlayerState;
  onOpenSettings: () => void;
}

export function MiniPlayer({ player, onOpenSettings }: MiniPlayerProps) {
  const position = useSmoothPosition(player);
  const [dragging, setDragging] = useState<number | null>(null);

  const duration = player.duration > 0 ? player.duration : 0;
  const shown = dragging ?? position;
  const seekPercent = duration > 0 ? clamp((shown / duration) * 100, 0, 100) : 0;
  const volumePercent = clamp(player.volume * 100, 0, 100);

  const commitSeek = () => {
    if (dragging !== null) {
      void ipc.playerCommand("seek", dragging);
      setDragging(null);
    }
  };

  return (
    <footer className="fixed inset-x-0 bottom-0 z-30 flex h-[76px] flex-col border-t border-white/[0.07] bg-ink-900/95 backdrop-blur-2xl">
      <div className="grid h-[65px] grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 px-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenSettings}
            title="Settings"
            className="group relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-ink-800 shadow-lg transition-transform duration-200 hover:scale-[1.03]"
          >
            {player.artwork ? (
              <img
                src={player.artwork}
                alt=""
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <MusicIcon size={18} className="text-white/25" />
            )}
            <span className="absolute inset-0 rounded-lg ring-1 ring-inset ring-white/10" />
          </button>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight text-white/90">
              {player.title || "Nothing playing"}
            </p>
            <p className="mt-0.5 truncate text-[11px] leading-tight text-white/40">
              {player.artist || (player.alive ? "Browse SoundCloud to start listening" : "Connecting…")}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="grid h-8 w-8 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white active:scale-95"
            title="Previous"
            aria-label="Previous track"
            onClick={() => void ipc.playerCommand("prev")}
          >
            <PreviousIcon size={16} />
          </button>
          <button
            className="grid h-10 w-10 place-items-center rounded-full bg-accent text-[#0b0714] shadow-[0_4px_18px_rgb(var(--accent-rgb)/0.4)] transition hover:brightness-110 active:scale-95"
            title={player.playing ? "Pause" : "Play"}
            aria-label={player.playing ? "Pause" : "Play"}
            onClick={() => void ipc.playerCommand("toggle")}
          >
            {player.playing ? <PauseIcon size={17} /> : <PlayIcon size={17} />}
          </button>
          <button
            className="grid h-8 w-8 place-items-center rounded-full text-white/60 transition hover:bg-white/10 hover:text-white active:scale-95"
            title="Next"
            aria-label="Next track"
            onClick={() => void ipc.playerCommand("next")}
          >
            <NextIcon size={16} />
          </button>
        </div>

        <div className="flex min-w-0 items-center justify-end gap-3">
          <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-white/45">
            {formatTime(shown)}
            <span className="text-white/20"> / </span>
            {formatTime(duration)}
          </span>
          <div className="group flex items-center gap-1.5">
            <VolumeIcon level={volumePercent === 0 ? 0 : volumePercent < 50 ? 1 : 2} size={15} className="text-white/45" />
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(volumePercent)}
              aria-label="Volume"
              className="range w-[76px]"
              style={{ "--fill": `${volumePercent}%` } as CSSProperties}
              onChange={(event) => {
                const value = Number(event.currentTarget.value) / 100;
                void ipc.playerCommand("volume", value);
              }}
            />
          </div>
        </div>
      </div>

      <div className="relative flex h-[10px] items-center px-4">
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.5}
          value={shown}
          disabled={duration <= 0}
          aria-label="Seek"
          className="range range-seek w-full"
          style={{ "--fill": `${seekPercent}%` } as CSSProperties}
          onChange={(event) => setDragging(Number(event.currentTarget.value))}
          onPointerUp={commitSeek}
          onKeyUp={commitSeek}
        />
      </div>
    </footer>
  );
}

/** Interpolates between the ~750 ms snapshots that arrive from Rust. */
function useSmoothPosition(player: PlayerState): number {
  const [position, setPosition] = useState(player.position);
  const anchor = useRef({ position: player.position, at: performance.now() });

  useEffect(() => {
    anchor.current = { position: player.position, at: performance.now() };
    setPosition(player.position);
  }, [player.position, player.title]);

  useEffect(() => {
    if (!player.playing) return;
    let frame = 0;
    const step = () => {
      const next = anchor.current.position + (performance.now() - anchor.current.at) / 1000;
      setPosition(player.duration > 0 ? Math.min(next, player.duration) : next);
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [player.playing, player.duration, player.title]);

  return position;
}
