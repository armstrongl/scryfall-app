// Draws the app icons as PNG files with no dependencies. The design matches
// icons/icon.svg: original art, no Scryfall or Wizards marks.
// Run: node scripts/make-icons.js
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const BG = hex("#2b4c7e"), BACK = hex("#9fb7d9"), FRONT = hex("#f6f4ef"), DOT = hex("#e0a43a");

function inRoundRect(x, y, rx, ry, w, h, r) {
  if (x < rx || y < ry || x > rx + w || y > ry + h) return false;
  const cx = Math.min(Math.max(x, rx + r), rx + w - r);
  const cy = Math.min(Math.max(y, ry + r), ry + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** Color at a point in the 64 × 64 design space, or null for transparent. */
function sample(x, y, maskable) {
  if (maskable) {
    // Fill the whole square; scale the art into the 80% safe zone.
    const s = 0.8, o = 32 * (1 - s);
    const ux = (x - o) / s, uy = (y - o) / s;
    return art(ux, uy) ?? BG;
  }
  if (!inRoundRect(x, y, 0, 0, 64, 64, 14)) return null;
  return art(x, y) ?? BG;
}

function art(x, y) {
  if ((x - 36) ** 2 + (y - 34) ** 2 <= 49) return DOT;
  if (inRoundRect(x, y, 22, 14, 28, 40, 4)) return FRONT;
  // Back card: rotate the point by +12 degrees around (28, 30).
  const a = (12 * Math.PI) / 180, dx = x - 28, dy = y - 30;
  const bx = 28 + dx * Math.cos(a) - dy * Math.sin(a);
  const by = 30 + dx * Math.sin(a) + dy * Math.cos(a);
  if (inRoundRect(bx, by, 14, 10, 28, 40, 4)) return BACK;
  return null;
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (const b of buf) {
    c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, maskable) {
  const SS = 4; // Supersampling for smooth edges.
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const c = sample(((px + (sx + 0.5) / SS) / size) * 64, ((py + (sy + 0.5) / SS) / size) * 64, maskable);
        if (c) { r += c[0]; g += c[1]; b += c[2]; a += 1; }
      }
      const i = py * (size * 4 + 1) + 1 + px * 4;
      raw[i] = a ? Math.round(r / a) : 0;
      raw[i + 1] = a ? Math.round(g / a) : 0;
      raw[i + 2] = a ? Math.round(b / a) : 0;
      raw[i + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const out = new URL("../icons/", import.meta.url);
writeFileSync(new URL("icon-180.png", out), png(180, true)); // iOS adds its own rounding.
writeFileSync(new URL("icon-192.png", out), png(192, false));
writeFileSync(new URL("icon-512.png", out), png(512, false));
writeFileSync(new URL("icon-512-maskable.png", out), png(512, true));
console.log("Wrote icons.");
