#!/usr/bin/env node
/**
 * Mirror the production build into the repository root for installations whose
 * GitHub Pages source is still configured as main/(root).
 *
 * The normal Actions deployment continues to upload dist/. Keeping this mirror
 * byte-identical prevents the legacy branch-source deployment from overwriting
 * that artifact with a rendered README.
 */
import {
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const CHECK = process.argv.includes('--check');
const STATIC_FILES = ['index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg', '.nojekyll'];
const BUNDLE_RE = /^cinderline\.[A-Za-z0-9._-]+\.js$/;

function filesMatching(dir, pattern) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => pattern.test(name) && statSync(join(dir, name)).isFile())
    .sort();
}

function sameBytes(left, right) {
  return existsSync(left) && readFileSync(left).equals(readFileSync(right));
}

const distBundles = filesMatching(DIST, BUNDLE_RE);
if (distBundles.length !== 1) {
  throw new Error(`Expected exactly one production bundle in dist/, found ${distBundles.length}.`);
}

for (const name of STATIC_FILES) {
  if (!existsSync(join(DIST, name))) throw new Error(`Missing dist/${name}; run npm run build first.`);
}

const expectedNames = [...STATIC_FILES, distBundles[0]];
const rootBundles = filesMatching(ROOT, BUNDLE_RE);

if (CHECK) {
  const errors = [];
  for (const name of expectedNames) {
    if (!sameBytes(join(ROOT, name), join(DIST, name))) errors.push(`${name} differs from dist/${name}`);
  }
  for (const name of rootBundles) {
    if (name !== distBundles[0]) errors.push(`obsolete root bundle remains: ${name}`);
  }
  if (errors.length) throw new Error(`Pages root mirror is stale:\n- ${errors.join('\n- ')}`);
  console.log(`[cinderline] Pages root mirror matches dist/ (${expectedNames.length} files)`);
  process.exit(0);
}

for (const name of rootBundles) rmSync(join(ROOT, name));
for (const name of expectedNames) copyFileSync(join(DIST, name), join(ROOT, name));
console.log(`[cinderline] mirrored dist/ to Pages root (${expectedNames.length} files)`);
