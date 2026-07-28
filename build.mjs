#!/usr/bin/env node
/**
 * CINDERLINE build script.
 *
 * Produces a fully static, relative-path build in dist/ that can be served from
 * any subdirectory (e.g. a GitHub Pages project site at /<repo>/).
 *
 *   node build.mjs            -> production build
 *   node build.mjs --dev      -> unminified build with sourcemaps
 *   node build.mjs --watch    -> dev build + rebuild on change
 *   node build.mjs --serve    -> dev build + local static server on :8080
 */
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, 'dist');

const args = process.argv.slice(2);
const DEV = args.includes('--dev') || args.includes('--watch') || args.includes('--serve');
const WATCH = args.includes('--watch') || args.includes('--serve');
const SERVE = args.includes('--serve');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

/** Build identifier, used for cache-busting and shown on the title screen. */
const BUILD_ID = process.env.CINDERLINE_BUILD_ID || `${pkg.version}`;

const options = {
  entryPoints: [join(ROOT, 'src', 'main.js')],
  bundle: true,
  format: 'iife',
  target: ['es2020', 'safari15', 'chrome90'],
  outfile: join(OUT, `cinderline.${BUILD_ID}.js`),
  minify: !DEV,
  sourcemap: DEV ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'info',
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __DEV__: JSON.stringify(DEV),
  },
};

function emitStatic() {
  // index.html is templated so the script filename carries the build id.
  const html = readFileSync(join(ROOT, 'public', 'index.html'), 'utf8')
    .replace(/__SCRIPT__/g, `cinderline.${BUILD_ID}.js`)
    .replace(/__BUILD_ID__/g, BUILD_ID);
  writeFileSync(join(OUT, 'index.html'), html);

  for (const f of ['styles.css', 'manifest.webmanifest', 'icon.svg', '.nojekyll']) {
    const src = join(ROOT, 'public', f);
    if (existsSync(src)) cpSync(src, join(OUT, f));
  }
}

if (WATCH) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  emitStatic();
  console.log('[cinderline] watching…');
} else {
  await esbuild.build(options);
  emitStatic();
  console.log(`[cinderline] built ${DEV ? 'dev' : 'production'} bundle -> dist/`);
}

if (SERVE) {
  const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
  };
  const port = Number(process.env.PORT || 8080);
  createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = join(OUT, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    try {
      const body = readFileSync(file);
      res.writeHead(200, {
        'Content-Type': MIME[extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404');
    }
  }).listen(port, () => console.log(`[cinderline] http://localhost:${port}/`));
}
