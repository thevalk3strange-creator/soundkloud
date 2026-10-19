/*
 * Discord Rich Presence — sample SoundKloud plugin.
 *
 * Runs inside a sandboxed Web Worker. It only reads the player snapshot and
 * forwards "now playing" data to the host; it has no access to the page, the
 * filesystem or playback controls.
 */
registerHooks({
  onTrackChange: publish,
  onPlay: publish,
  onPause: publish
});

function publish(payload) {
  var track = (payload && payload.track) || null;
  var player = (payload && payload.player) || null;

  if (!track || !track.title) {
    clear();
    return;
  }

  var clientId = readClientId();
  if (!clientId) {
    clear();
    api.log("warn", "Set a Discord application ID in Settings to enable Rich Presence.");
    return;
  }

  var details = track.title;
  var state = track.artist || "SoundCloud";
  var playing = !!(player && player.playing);
  var position = player && isFinite(player.position) ? Math.max(0, player.position) : 0;

  var activity = {
    clientId: clientId,
    details: details,
    state: state,
    largeImage: isRemoteImage(track.artwork) ? track.artwork : "",
    largeText: track.artist ? track.artist + " on SoundCloud" : "SoundCloud",
    timestampStart: playing ? Math.floor(Date.now() / 1000 - position) : null,
    paused: !playing,
    buttons: isSoundCloudUrl(track.url)
      ? [{ label: "Listen on SoundCloud", url: track.url }]
      : []
  };

  Promise.resolve(api.discord.setActivity(activity)).catch(function (error) {
    api.log("warn", "Discord rejected the activity: " + error);
  });
}

function clear() {
  Promise.resolve(api.discord.clear()).catch(function () {
    /* Discord is probably closed; nothing else to do. */
  });
}

function readClientId() {
  var config = api.config || {};
  var value = config.clientId;
  if (typeof value === "number") value = String(value);
  if (typeof value !== "string") return "";
  return value.trim();
}

function isRemoteImage(url) {
  return typeof url === "string" && /^https:\/\//i.test(url);
}

function isSoundCloudUrl(url) {
  return typeof url === "string" && /^https?:\/\/([a-z0-9-]+\.)?soundcloud\.com\//i.test(url);
}
