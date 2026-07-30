#!/usr/bin/env node
/**
 * Luma statistics for captured frames.
 *
 * Reads real PNGs written by the shot/vantage harness — the point of the tool
 * is that every claim about the image is made against the image, not against
 * the code that produced it. Decoding happens in the browser's own 2D canvas
 * because a WebGL front buffer cannot be read back after compositing.
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: lumastats.mjs <png...>'); process.exit(1); }

const browser = await chromium.launch();
const page = await browser.newPage();
const rows = [];
for (const f of files) {
  const b64 = readFileSync(f).toString('base64');
  const r = await page.evaluate(async (src) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    c.getContext('2d').drawImage(img, 0, 0);
    // Sample the top 62% only: the bottom is the title/HUD overlay in most
    // captures and would skew the statistics with interface pixels.
    const h = Math.floor(img.height * 0.62);
    const d = c.getContext('2d').getImageData(0, 0, img.width, h).data;
    const lum = [];
    let black = 0, warm = 0, cool = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * 5) {
      const R = d[i], G = d[i + 1], B = d[i + 2];
      lum.push(0.2126 * R + 0.7152 * G + 0.0722 * B);
      if (R + G + B < 6) black++;
      if (R - B > 6) warm++;
      if (B - R > 6) cool++;
      n++;
    }
    lum.sort((a, b) => a - b);
    const q = (p) => Math.round(lum[Math.floor(lum.length * p)]);
    return { p05: q(0.05), p25: q(0.25), p50: q(0.5), p75: q(0.75), p95: q(0.95),
             iqr: q(0.75) - q(0.25),
             black: +(black / n * 100).toFixed(1),
             warm: +(warm / n * 100).toFixed(0), cool: +(cool / n * 100).toFixed(0) };
  }, `data:image/png;base64,${b64}`);
  rows.push({ file: basename(f), ...r });
}
await browser.close();

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('frame', 24) + ['p05', 'p25', 'p50', 'p75', 'p95', 'IQR', '%blk', '%warm', '%cool']
  .map((h) => h.padStart(6)).join(''));
for (const r of rows) {
  console.log(pad(r.file.replace(/\.png$/, ''), 24) +
    [r.p05, r.p25, r.p50, r.p75, r.p95, r.iqr, r.black, r.warm, r.cool]
      .map((v) => String(v).padStart(6)).join(''));
}
