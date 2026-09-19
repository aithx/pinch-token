import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const size = 256;
const pixels = new Uint8Array(size * size * 4);

function paint(x, y, r, g, b, a = 255) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= size || py >= size) return;
  const i = (py * size + px) * 4;
  const src = a / 255;
  const dst = pixels[i + 3] / 255;
  const out = src + dst * (1 - src);
  if (out === 0) return;
  pixels[i] = Math.round((r * src + pixels[i] * dst * (1 - src)) / out);
  pixels[i + 1] = Math.round((g * src + pixels[i + 1] * dst * (1 - src)) / out);
  pixels[i + 2] = Math.round((b * src + pixels[i + 2] * dst * (1 - src)) / out);
  pixels[i + 3] = Math.round(out * 255);
}

function circle(cx, cy, radius, color) {
  const [r, g, b, a] = color;
  const minX = Math.floor(cx - radius);
  const maxX = Math.ceil(cx + radius);
  const minY = Math.floor(cy - radius);
  const maxY = Math.ceil(cy + radius);
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= radius * radius) paint(x, y, r, g, b, a);
    }
  }
}

function ellipse(cx, cy, rx, ry, color) {
  const [r, g, b, a] = color;
  for (let y = Math.floor(cy - ry); y <= cy + ry; y += 1) {
    for (let x = Math.floor(cx - rx); x <= cx + rx; x += 1) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) paint(x, y, r, g, b, a);
    }
  }
}

const shell = [255, 45, 149, 255];
const shade = [176, 16, 96, 255];
const claw = [255, 122, 196, 255];
const eye = [255, 248, 236, 255];
const ink = [42, 8, 36, 255];

for (let y = 0; y < size; y += 1) {
  for (let x = 0; x < size; x += 1) paint(x, y, 26, 10, 46, 255);
}
circle(128, 128, 118, [255, 214, 236, 255]);
ellipse(128, 148, 78, 58, shade);
ellipse(128, 140, 74, 54, shell);
ellipse(116, 124, 28, 16, [255, 186, 224, 180]);

circle(54, 118, 34, shade);
circle(54, 112, 30, claw);
circle(40, 96, 16, shell);
circle(70, 100, 14, shell);
circle(202, 118, 34, shade);
circle(202, 112, 30, claw);
circle(216, 96, 16, shell);
circle(186, 100, 14, shell);

circle(108, 128, 16, eye);
circle(156, 128, 16, eye);
circle(112, 130, 7, ink);
circle(160, 130, 7, ink);
circle(114, 128, 2, eye);
circle(162, 128, 2, eye);
ellipse(128, 162, 16, 8, ink);

for (let i = 0; i < 8; i += 1) {
  circle(96 - i * 4, 78 - i * 7, 4, ink);
  circle(160 + i * 4, 78 - i * 7, 4, ink);
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let i = 0; i < 8; i += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const name = Buffer.from(type);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, checksum]);
}

const raw = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y += 1) {
  const row = y * (size * 4 + 1);
  raw[row] = 0;
  raw.set(pixels.subarray(y * size * 4, (y + 1) * size * 4), row + 1);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(size, 0);
ihdr.writeUInt32BE(size, 4);
ihdr[8] = 8;
ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk("IHDR", ihdr),
  chunk("IDAT", deflateSync(raw)),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "pinch.png");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, png);
console.log(out);
