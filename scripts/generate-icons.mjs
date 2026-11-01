// Renders the product icon (same artwork as components/Logo.tsx) to PNG at the sizes Chrome
// needs, without any image tooling: shapes are rasterised with 4x4 supersampling and encoded
// with node:zlib. Run: pnpm icons
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

const OUT = resolve(import.meta.dirname, '../apps/extension/public/icons');
// Store-only artwork (not bundled in the extension), e.g. the 300x300 Edge Add-ons logo.
const STORE_OUT = resolve(import.meta.dirname, '../store-assets');
const ACCENT = [13, 128, 118];
const SIZES = [16, 32, 48, 128];

// Geometry in a 32x32 design space (matches Logo.tsx).
const shapes = [
  { kind: 'rrect', x: 1, y: 1, w: 30, h: 30, r: 8, color: ACCENT, alpha: 1 },
  { kind: 'rrect', x: 7, y: 8, w: 12, h: 3, r: 1.5, color: [255, 255, 255], alpha: 1 },
  { kind: 'rrect', x: 7, y: 14.5, w: 18, h: 3, r: 1.5, color: [255, 255, 255], alpha: 0.85 },
  { kind: 'rrect', x: 7, y: 21, w: 9, h: 3, r: 1.5, color: [255, 255, 255], alpha: 0.7 },
  { kind: 'circle', cx: 24, cy: 9.5, r: 3, color: [255, 255, 255], alpha: 0.95 },
];

function inside(shape, x, y) {
  if (shape.kind === 'circle') return (x - shape.cx) ** 2 + (y - shape.cy) ** 2 <= shape.r ** 2;
  const { x: sx, y: sy, w, h, r } = shape;
  if (x < sx || y < sy || x > sx + w || y > sy + h) return false;
  const cx = Math.min(Math.max(x, sx + r), sx + w - r);
  const cy = Math.min(Math.max(y, sy + r), sy + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
}

function render(size) {
  const ss = 4;
  const scale = 32 / size;
  const px = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let pxl = 0; pxl < size; pxl++) {
      let r = 0,
        g = 0,
        b = 0,
        a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = (pxl + (sx + 0.5) / ss) * scale;
          const y = (py + (sy + 0.5) / ss) * scale;
          // Composite shapes back-to-front ("over" operator) for this sample.
          let cr = 0,
            cg = 0,
            cb = 0,
            ca = 0;
          for (const s of shapes) {
            if (!inside(s, x, y)) continue;
            const sa = s.alpha;
            cr = s.color[0] * sa + cr * (1 - sa);
            cg = s.color[1] * sa + cg * (1 - sa);
            cb = s.color[2] * sa + cb * (1 - sa);
            ca = sa + ca * (1 - sa);
          }
          r += cr;
          g += cg;
          b += cb;
          a += ca;
        }
      }
      const n = ss * ss;
      const i = (py * size + pxl) * 4;
      const alpha = a / n;
      // Colours were accumulated premultiplied; un-premultiply for PNG.
      px[i] = alpha ? Math.round(r / n / alpha) : 0;
      px[i + 1] = alpha ? Math.round(g / n / alpha) : 0;
      px[i + 2] = alpha ? Math.round(b / n / alpha) : 0;
      px[i + 3] = Math.round(alpha * 255);
    }
  }
  return px;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT, { recursive: true });
for (const size of SIZES) {
  writeFileSync(resolve(OUT, `icon-${size}.png`), png(size, render(size)));
  console.log(`icons/icon-${size}.png`);
}

mkdirSync(STORE_OUT, { recursive: true });
for (const size of [128, 300]) {
  writeFileSync(resolve(STORE_OUT, `logo-${size}.png`), png(size, render(size)));
  console.log(`store-assets/logo-${size}.png`);
}
