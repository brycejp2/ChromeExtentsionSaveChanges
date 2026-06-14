/*
 * Generates the extension's PNG icons (16/48/128) with no external deps.
 * Draws a simple "diff" glyph: a dark rounded square with a red "-" and a
 * green "+" bar. Run with: node scripts/gen-icons.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// --- minimal PNG encoder (RGBA, no filtering) ------------------------------

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;   // bit depth
  ihdr[9] = 6;   // color type RGBA
  ihdr[10] = 0;  // compression
  ihdr[11] = 0;  // filter
  ihdr[12] = 0;  // interlace

  // raw image data: each row prefixed with filter byte 0
  const raw = Buffer.alloc((width * 4 + 1) * height);
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      raw[o++] = rgba[i];
      raw[o++] = rgba[i + 1];
      raw[o++] = rgba[i + 2];
      raw[o++] = rgba[i + 3];
    }
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// --- draw the glyph --------------------------------------------------------

function makeIcon(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = Math.round(size * 0.18);
  const bg = [38, 40, 47];      // dark panel
  const minus = [248, 81, 73];  // red
  const plus = [63, 185, 80];   // green

  function set(x, y, c) {
    const i = (y * size + x) * 4;
    rgba[i] = c[0];
    rgba[i + 1] = c[1];
    rgba[i + 2] = c[2];
    rgba[i + 3] = 255;
  }

  function inRounded(x, y) {
    const r = radius;
    if (x >= r && x < size - r) return true;
    if (y >= r && y < size - r) return true;
    // corners
    const cx = x < r ? r : size - 1 - r;
    const cy = y < r ? r : size - 1 - r;
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= r * r;
  }

  // background
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (inRounded(x, y)) set(x, y, bg);
    }
  }

  // bar geometry
  const barH = Math.max(2, Math.round(size * 0.11));
  const barX0 = Math.round(size * 0.26);
  const barX1 = Math.round(size * 0.74);

  // minus bar (upper third)
  const minusY = Math.round(size * 0.36);
  for (let y = minusY; y < minusY + barH; y++) {
    for (let x = barX0; x < barX1; x++) set(x, y, minus);
  }

  // plus sign (lower portion): horizontal + vertical bar
  const plusY = Math.round(size * 0.62);
  for (let y = plusY; y < plusY + barH; y++) {
    for (let x = barX0; x < barX1; x++) set(x, y, plus);
  }
  const plusCx = Math.round((barX0 + barX1) / 2);
  const vTop = Math.round(size * 0.5);
  const vBot = Math.round(size * 0.74);
  for (let y = vTop; y < vBot; y++) {
    for (let x = plusCx - Math.floor(barH / 2); x < plusCx - Math.floor(barH / 2) + barH; x++) {
      set(x, y, plus);
    }
  }

  return encodePNG(size, size, rgba);
}

const outDir = path.join(__dirname, '..', 'icons');
fs.mkdirSync(outDir, { recursive: true });
[16, 48, 128].forEach(function (size) {
  const png = makeIcon(size);
  fs.writeFileSync(path.join(outDir, 'icon' + size + '.png'), png);
  console.log('wrote icons/icon' + size + '.png (' + png.length + ' bytes)');
});
