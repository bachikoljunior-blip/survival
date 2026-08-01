#!/usr/bin/env node
/**
 * Luma statistics for captured frames.
 *
 * Reads real PNGs written by the shot/vantage harness — the point of the tool
 * is that every claim about the image is made against the image, not against
 * the code that produced it.
 *
 * It used to launch a whole Chromium to borrow a 2D canvas for `getImageData`.
 * The decode now goes through `.kit/lib/image/png.mjs`, which needs `node:zlib`
 * and nothing else, so a measurement tool no longer has to boot the thing it is
 * measuring. Verified byte-identical against the browser version on 18 real
 * vantage frames.
 *
 * The statistics themselves are deliberately **not** `lib/image/measureLuma`.
 * They are not the same statistics: this tool rounds percentiles off a sorted
 * sample where `measureLuma` truncates into a 256-bin histogram, it counts
 * black as `R+G+B < 6` where `measureLuma` counts luma below 16, and it reads
 * one pixel in five. Substituting them would silently move every number in
 * survival's review history. `measureLuma` is the right tool for a new
 * measurement; this one exists to stay comparable with the old ones.
 *
 *   node tools/lumastats.mjs shots/v-*.png
 *   node tools/lumastats.mjs --rows 1 shots/v-stacks_yard.png   # no crop (ablation)
 *   node tools/lumastats.mjs --json shots/v-*.png
 */
import { readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const { decodePNG } = await import(pathToFileURL(join(ROOT, '.kit/lib/image/png.mjs')).href);

/** Columns, in the order they are printed. */
export const COLUMNS = ['p05', 'p25', 'p50', 'p75', 'p95', 'iqr', 'black', 'warm', 'cool'];

/**
 * @param {string} file  Path to a PNG.
 * @param {object} [options]
 * @param {number} [options.topFraction] Rows to sample, from the top. The default 0.62
 *   drops the title/HUD overlay, which is authored ink and would otherwise show up in the
 *   statistics as crushed shadows that are not in the render at all. `1` disables the crop
 *   and is the ablation: if the numbers do not move, this function is not the one running.
 * @param {number} [options.stride] Sample one pixel in `stride`. 5 matches the browser
 *   version byte for byte.
 */
export function lumaStats(file, { topFraction = 0.62, stride = 5 } = {}) {
  const { width, height, channels, data } = decodePNG(readFileSync(file));
  const rows = Math.floor(height * topFraction);
  const lum = [];
  let black = 0, warm = 0, cool = 0, n = 0;

  for (let px = 0; px < width * rows; px += stride) {
    const i = px * channels;
    const R = data[i], G = data[i + 1], B = data[i + 2];
    lum.push(0.2126 * R + 0.7152 * G + 0.0722 * B);
    if (R + G + B < 6) black++;
    if (R - B > 6) warm++;
    if (B - R > 6) cool++;
    n++;
  }
  if (!n) throw new Error(`lumaStats: no pixels sampled in ${file}`);

  lum.sort((a, b) => a - b);
  const q = (p) => Math.round(lum[Math.floor(lum.length * p)]);
  return {
    p05: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95),
    iqr: q(0.75) - q(0.25),
    black: +(black / n * 100).toFixed(1),
    warm: +(warm / n * 100).toFixed(0),
    cool: +(cool / n * 100).toFixed(0),
  };
}

export function lumaTable(files, options) {
  return files.map((f) => ({ file: basename(f), ...lumaStats(f, options) }));
}

export function formatTable(rows) {
  const pad = (s, n) => String(s).padEnd(n);
  const head = ['p05', 'p25', 'p50', 'p75', 'p95', 'IQR', '%blk', '%warm', '%cool'];
  const lines = [pad('frame', 24) + head.map((h) => h.padStart(6)).join('')];
  for (const r of rows) {
    lines.push(pad(r.file.replace(/\.png$/, ''), 24) +
      COLUMNS.map((k) => String(r[k]).padStart(6)).join(''));
  }
  return lines.join('\n');
}

// Guarded: importing this module must not measure anything. `tools/capture.mjs` in the
// sibling project is a top-level-await script, and importing it to check that it resolves
// starts a real capture.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const argv = process.argv.slice(2);
  const arg = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const topFraction = Number(arg('rows', 0.62));
  const asJson = argv.includes('--json');
  const files = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--rows');

  if (!files.length) { console.error('usage: lumastats.mjs [--rows <frac>] [--json] <png...>'); process.exit(1); }
  const rows = lumaTable(files, { topFraction });
  console.log(asJson ? JSON.stringify(rows, null, 2) : formatTable(rows));
}
