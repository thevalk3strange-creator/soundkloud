# SoundKloud plugins

SoundKloud plugins are small JavaScript files that react to player events. They
run inside a **Web Worker sandbox**: no DOM, no network, no filesystem and no
direct access to the SoundCloud page. Anything a plugin wants to do must go
through the small host API below.

## Folder layout

Plugins live in:

```
~/Library/Application Support/com.gamvoc.soundkloud/plugins/
  my-plugin/
    manifest.json
    index.js
```

Open that folder from **Settings → Plugins → Open plugins folder**, drop a new
folder in, then reopen Settings (or click *Reload plugins*). Nothing needs to
be rebuilt or reinstalled.

## manifest.json

```json
{
  "id": "my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "One line shown in Settings.",
  "author": "Your name",
  "main": "index.js",
  "hooks": ["onTrackChange", "onPlay", "onPause"],
  "settings": [
    {
      "key": "token",
      "label": "API token",
      "kind": "string",
      "placeholder": "optional",
      "default": ""
    }
  ],
  "enabledByDefault": false
}
```

| Field | Notes |
| --- | --- |
| `id` | Unique. Also the config keys used for enable/settings. Defaults to the folder name. |
| `main` | Entry file, relative to the plugin folder. Max 512 KB. |
| `hooks` | Any of `onTrackChange`, `onPlay`, `onPause`. Declaring a hook you do not implement is harmless. |
| `settings` | Optional. `kind` is `string`, `password` or `number`. A field appears in Settings for every entry. |
| `enabledByDefault` | Used only until the user flips the switch once. |

## index.js

```js
registerHooks({
  onTrackChange({ track, player }) {
    api.log("info", `Now playing: ${track.title}`);
  },
  onPlay({ track, player }) {
    // ...
  },
  onPause({ track, player }) {
    // ...
  }
});
```

Both callbacks receive:

```ts
{
  track: {
    title: string;
    artist: string;
    artwork: string;
    url: string;
    duration: number;
  };
  player: {
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
  };
}
```

`onTrackChange` fires when the track title/artist changes (including on the
first snapshot after launch). `onPlay` / `onPause` fire on actual transitions,
not on every progress tick.

## Host API

```js
api.log(level, message);      // level: "info" | "warn" | "error"
api.config                    // plain object with this plugin's saved settings
api.discord.setActivity({     // "Listening" activity; display only
  clientId: "123456789012345678",
  details: "Track title",
  state: "Artist",
  largeImage: "https://...",  // optional artwork URL
  largeText: "Tooltip",
  timestampStart: 1735689600, // optional; omit while paused
  paused: false,
  buttons: [{ label: "Open", url: "https://soundcloud.com/..." }]
});
api.discord.clear();
```

`api.log` output goes to the Settings plugin log and to the `pnpm tauri dev`
terminal. A plugin that throws or loops forever only kills its own worker; the
app keeps playing and the error is shown next to that plugin in Settings.

## Limits

- No `import`, `require`, `fetch`, `XMLHttpRequest` or WebSocket.
- No access to the user's SoundCloud session, cookies or audio stream.
- No DRM or download helpers, by design.
- Keep the entry file small; it is re-evaluated whenever plugins reload.

## Bundled example

`discord-rich-presence/` is installed on first launch. It reads the optional
`clientId` setting and publishes the current track to Discord over the local
Discord IPC socket (handled by the Rust host, not the plugin). It is disabled
until you enable it and paste an application ID from
<https://discord.com/developers/applications>.
