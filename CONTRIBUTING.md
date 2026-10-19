# Contributing to SoundKloud

Thanks for wanting to improve SoundKloud. This document explains how the project is built, what kind of changes fit, and how to get a PR merged without a long review loop.

By participating you agree to keep discussions respectful and technical. There is no CLA: contributions are accepted under the project's [MIT license](LICENSE).

## Before you start

- **Open an issue first** for anything larger than a bug fix, a typo or a small UI tweak. Describe the problem, the proposed behaviour and which files you expect to touch.
- For bugs, include macOS version, whether you run `pnpm tauri dev` or a built `.app`, and the relevant lines from **Settings → Recent plugin activity** or the terminal running the dev build.
- Search existing issues and PRs. Duplicates are closed politely.

### What will not be merged

SoundKloud is a shell around the official SoundCloud player. The following are out of scope, regardless of implementation quality:

- downloading tracks, extracting stream URLs, or caching audio;
- DRM circumvention, region unlocking (proxies, VPN switching, `country` header spoofing, session borrowing);
- reading or exporting SoundCloud cookies/credentials;
- telemetry, analytics, ads or any silent network call;
- plugin capabilities that bypass the worker sandbox (network, filesystem, DOM).

If you are unsure, ask in an issue before writing code.

## Development setup

Requirements: macOS 11+, Xcode CLT, Node 20/22, pnpm 9/10, Rust stable ≥ 1.77, target `aarch64-apple-darwin`.

```bash
git clone https://github.com/<your-fork>/soundkloud.git
cd soundkloud
pnpm install
pnpm tauri dev
```

First Rust compile takes a few minutes. Vite hot-reloads the React chrome; Rust changes rebuild the app automatically.

Useful commands:

| Command | Purpose |
| --- | --- |
| `pnpm build` | TypeScript check + production bundle |
| `cd src-tauri && cargo check` | Fast Rust type check |
| `cd src-tauri && cargo clippy --all-targets` | Lints (warnings are not fatal yet) |
| `pnpm tauri build --target aarch64-apple-darwin` | Full `.app` + `.dmg` |
| `pnpm icons` | Regenerate icons from `app-icon.png` |

## Orientation

Read [`README.md`](README.md#architecture) first. The short version:

- **`src/`** — React chrome. It never touches the SoundCloud page directly; everything goes through `src/lib/ipc.ts`.
- **`src-tauri/src/player.rs`** — polls the injected bridge and turns snapshots into `player:state` events. Transport commands are evaluated inside the page.
- **`src-tauri/src/injected/bridge.js`** — the only code that runs on soundcloud.com. It must stay read-mostly: capture MediaSession handlers, fall back to `<audio>`, never rewrite the page.
- **`src-tauri/src/layout.rs`** — the two-webview geometry and the popup policy. `CHROME_TOP` / `CHROME_BOTTOM` must stay in sync with the React constants.
- **`plugins/`** — bundled samples, embedded into the binary with `include_str!` and installed on first run.
- **`docs/README.md`** — Vietnamese user guide. Keep it in sync when behaviour changes.

### Adding an IPC command

1. Write the command in `src-tauri/src/commands.rs` and register it in the `generate_handler!` list in `lib.rs`.
2. Add a typed wrapper in `src/lib/ipc.ts`.
3. Call the wrapper from components — never `invoke("...")` inline.
4. Custom commands do not need ACL entries; only `core:*` permissions belong in `capabilities/default.json`.

## Coding guidelines

**Rust**

- Return `Result<_, String>` from commands; do not panic on user input or missing files.
- Avoid holding a `Mutex` guard across an `eval` or any call back into Tauri.
- Keep the poll cheap: the snapshot script runs every 750 ms on the page's main thread.
- Log recoverable failures with `eprintln!`; the UI shows plugin errors, not backend noise.

**TypeScript / React**

- `strict` mode is on. No `any`, no non-null assertions unless the invariant is obvious and commented.
- Components stay presentational; app state lives in `App.tsx` and is passed down.
- Use the existing Tailwind tokens (`accent`, `white/10`, `text-[11px]`) instead of new one-off colors.
- Keep user-visible strings short and in English; the user guide stays Vietnamese.

**General**

- No new runtime dependency without a note in the PR explaining size and maintenance cost.
- No comments that restate the code. Comment the *why*, especially around WebKit quirks and SoundCloud DOM fallbacks.
- Format Rust with `cargo fmt`; the frontend is formatted by editor defaults (2 spaces, double quotes).

## Testing

There is no automated suite yet, so PRs include a manual verification note. Minimum checklist:

1. `pnpm build` passes.
2. `cargo check` passes.
3. `pnpm tauri dev`: SoundCloud loads, a track plays, mini player updates artwork/title/position.
4. Play/pause, next, previous, seek and volume work from the mini player **and** the media keys.
5. Closing the window hides to tray; the tray menu can restore it; Quit exits cleanly.
6. Open Settings, change accent, toggle the mini player, enable/disable the sample plugin, reopen Settings and confirm persistence.
7. If you touched `bridge.js` or `player.rs`: navigate between pages, reload, and confirm the mini player recovers.

Add a before/after screenshot or a short screen recording for UI changes.

## Plugin contributions

Plugins are welcome as separate folders under `plugins/` **only if they are useful as samples**. Personal integrations should live in your own plugins directory.

- Include a valid `manifest.json` (`id`, `name`, `version`, `main`, `hooks`, `settings`).
- Keep `index.js` dependency-free and under the 512 KB loader limit.
- Handle missing config gracefully — log a warning instead of throwing.
- The plugin must work with the documented host API only; `fetch`/`WebSocket`/`importScripts` are removed by the sandbox.
- Update [`plugins/README.md`](plugins/README.md) if you add a new pattern.

## Commit and PR workflow

1. Fork, then branch from `main`: `feat/mini-player-keyboard`, `fix/oauth-popup-close`, `docs/contributing`.
2. Keep commits focused; conventional prefixes (`feat:`, `fix:`, `docs:`, `refactor:`, `chore:`) are appreciated but not enforced.
3. Rebase on `main` before opening the PR; avoid merge commits.
4. Fill in the PR template: what changed, why, how it was tested, screenshots for UI, and known trade-offs.
5. One approval is enough for small changes. Architecture changes (webview layout, bridge contract, plugin API) need a discussion issue first.
6. Do not bump the version or edit the changelog in a feature PR; releases are cut separately.

## Releases

Maintainers build with:

```bash
pnpm tauri build --target aarch64-apple-darwin
```

The DMG is unsigned. Release notes must repeat the Gatekeeper instructions and the known limitations (passkeys, geo-blocked tracks).

## Security

Do not open a public issue for a vulnerability. Use GitHub's **Security → Report a vulnerability** advisory on this repository. Never include real cookies, tokens or account identifiers in reports; redact them.
