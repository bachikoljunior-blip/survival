#!/usr/bin/env node
// Transport existing CI output only. No browser launch or image transformation.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

const files = ['report.json', ...[
  'stacks', 'marrow', 'arcade', 'cinder', 'survey', 'ventfield', 'south', 'plant', 'marrow_roof',
].map(name => `visual-${name}-frame.png`)];
const output = process.env.CINDERLINE_WEBKIT_OUTPUT || 'test-results/iphone-webkit';
if (process.env.CINDERLINE_LIGHT_DIRECTION_TRIAL === '1') {
  files.push(...readdirSync(output).filter(file => /^light-direction-(stacks|marrow|arcade|cinder|survey|ventfield|south|plant)-(before|trial|restored)\.png$/.test(file)).sort());
}
if (process.env.CINDERLINE_GRAIN_TRIAL === '1') {
  files.push(...readdirSync(output).filter(file => /^grain-(stacks|marrow|arcade|cinder|survey|ventfield|south|plant)-(before|trial|restored)\.png$/.test(file)).sort());
}
const cap = 2 * 1024 * 1024;
let failed = false;
for (const file of files) {
  try {
    const path = `${output}/${file}`;
    const before = statSync(path);
    const data = readFileSync(path);
    const after = statSync(path);
    const sha256 = createHash('sha256').update(data).digest('hex');
    const stableDuringRead = before.size === after.size && before.mtimeMs === after.mtimeMs && data.length === after.size;
    const complete = data.length <= cap && stableDuringRead;
    console.log('[webkit-material-meta] ' + JSON.stringify({ file, commit: process.env.GITHUB_SHA || null,
      bytes: data.length, sha256, stableDuringRead, complete, cap }));
    if (!complete) { failed = true; continue; }
    for (let offset = 0; offset < data.length; offset += 3000) {
      console.log('[webkit-material-chunk] ' + JSON.stringify({ file, offset,
        base64: data.subarray(offset, offset + 3000).toString('base64') }));
    }
    console.log('[webkit-material-end] ' + JSON.stringify({ file, bytes: data.length, sha256 }));
  } catch (error) {
    failed = true;
    console.log('[webkit-material-error] ' + JSON.stringify({ file, code: error.code || null, message: error.message }));
  }
}
// Missing, changing and oversized output stays a failed acquisition; do not
// truncate/recompress pictures or turn failed gameplay into passing evidence.
process.exitCode = failed ? 1 : 0;
