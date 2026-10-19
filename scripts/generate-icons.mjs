// Generates the SoundKloud app icon (1024x1024) and the macOS tray template icon.
// Pure Node, no image dependencies: pixels are drawn into an RGBA buffer and
// encoded as PNG by hand.
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i++) {
    crc ^= buffer[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4 + 1;
  const raw = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0; // filter: none
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function insideRoundedRect(px, py, x0, y0, x1, y1, radius) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false;
  const cx = Math.min(Math.max(px, x0 + radius), x1 - radius);
  const cy = Math.min(Math.max(py, y0 + radius), y1 - radius);
  const dx = px - cx;
  const dy = py - cy;
  return dx * dx + dy * dy <= radius * radius;
}

const lerp = (a, b, t) => a + (b - a) * t;

// 2x2 supersampling, returns coverage 0..1
function coverage(fn, x, y) {
  let hit = 0;
  for (let sy = 0.25; sy < 1; sy += 0.5) {
    for (let sx = 0.25; sx < 1; sx += 0.5) {
      if (fn(x + sx, y + sy)) hit++;
    }
  }
  return hit / 4;
}

function blend(dst, offset, r, g, b, a) {
  if (a <= 0) return;
  const da = dst[offset + 3] / 255;
  const outA = a + da * (1 - a);
  if (outA <= 0) return;
  dst[offset] = Math.round((r * a + dst[offset] * da * (1 - a)) / outA);
  dst[offset + 1] = Math.round((g * a + dst[offset + 1] * da * (1 - a)) / outA);
  dst[offset + 2] = Math.round((b * a + dst[offset + 2] * da * (1 - a)) / outA);
  dst[offset + 3] = Math.round(outA * 255);
}

function drawAppIcon() {
  const size = 1024;
  const data = Buffer.alloc(size * size * 4);
  const inset = 64;
  const radius = 228;
  const bars = [0.34, 0.58, 0.86, 0.64, 0.42];
  const barWidth = 74;
  const gap = 46;
  const totalWidth = bars.length * barWidth + (bars.length - 1) * gap;
  const startX = (size - totalWidth) / 2;
  const centerY = size / 2 + 6;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;

      const tile = coverage(
        (px, py) => insideRoundedRect(px, py, inset, inset, size - inset, size - inset, radius),
        x,
        y
      );
      if (tile > 0) {
        // Diagonal violet -> blue gradient with a soft top light.
        const t = Math.min(1, Math.max(0, (x + y) / (size * 1.7)));
        const r = lerp(139, 37, t);
        const g = lerp(92, 99, t);
        const b = lerp(246, 235, t);
        const light = 1 + 0.06 * (1 - y / size);
        blend(data, offset, Math.min(255, r * light), Math.min(255, g * light), Math.min(255, b * light), tile);
      }

      // Soundwave bars, everything clipped by the tile shape.
      let barAlpha = 0;
      for (let i = 0; i < bars.length; i++) {
        const cx = startX + i * (barWidth + gap) + barWidth / 2;
        const halfH = (bars[i] * 360) / 2;
        const hit = coverage(
          (px, py) =>
            insideRoundedRect(
              px,
              py,
              cx - barWidth / 2,
              centerY - halfH,
              cx + barWidth / 2,
              centerY + halfH,
              barWidth / 2
            ),
          x,
          y
        );
        if (hit > barAlpha) barAlpha = hit;
      }
      if (barAlpha > 0) {
        const clipped = barAlpha * (tile > 0 ? 1 : 0);
        blend(data, offset, 255, 255, 255, clipped * 0.96);
      }
    }
  }

  return encodePng(size, size, data);
}

function drawTrayIcon() {
  // Template image: only alpha matters, macOS tints it for light/dark menu bars.
  const size = 22;
  const data = Buffer.alloc(size * size * 4);
  const bars = [0.42, 0.72, 1, 0.78, 0.5];
  const barWidth = 2.6;
  const gap = 1.6;
  const totalWidth = bars.length * barWidth + (bars.length - 1) * gap;
  const startX = (size - totalWidth) / 2;
  const centerY = size / 2;
  const maxHeight = 15;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      let alpha = 0;
      for (let i = 0; i < bars.length; i++) {
        const cx = startX + i * (barWidth + gap) + barWidth / 2;
        const halfH = (bars[i] * maxHeight) / 2;
        const hit = coverage(
          (px, py) =>
            insideRoundedRect(
              px,
              py,
              cx - barWidth / 2,
              centerY - halfH,
              cx + barWidth / 2,
              centerY + halfH,
              barWidth / 2
            ),
          x,
          y
        );
        if (hit > alpha) alpha = hit;
      }
      if (alpha > 0) {
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
        data[offset + 3] = Math.round(alpha * 255);
      }
    }
  }

  return encodePng(size, size, data);
}

writeFileSync(resolve(root, "app-icon.png"), drawAppIcon());
const iconsDir = resolve(root, "src-tauri/icons");
mkdirSync(iconsDir, { recursive: true });
writeFileSync(resolve(iconsDir, "tray.png"), drawTrayIcon());
console.log("wrote app-icon.png and src-tauri/icons/tray.png");
