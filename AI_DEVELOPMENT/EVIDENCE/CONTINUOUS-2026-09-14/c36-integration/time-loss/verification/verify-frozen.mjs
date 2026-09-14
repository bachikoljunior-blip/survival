import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as baseline from '../source/tools/ios_audio_capture.mjs';
import * as candidate from './runtime/tools/ios_audio_capture.mjs';
const checks = [];
const check = (name, value) => { assert.ok(value, name); checks.push({ name, passed: true }); };
const source = name => readFileSync(new URL('../source/tools/' + name, import.meta.url));
const blob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
check('production pins exactly unchanged', JSON.stringify(baseline.IOS_AUDIO_PIN) === JSON.stringify(candidate.IOS_AUDIO_PIN));
for (const fn of ['safariAudioCapabilities', 'inspectIosAudioLifecycle']) {
  check(fn + ' function byte-identical', baseline[fn].toString() === candidate[fn].toString());
}
check('shared recorder exact pinned source', blob(source('mobile_audio_capture.mjs')) === candidate.IOS_AUDIO_PIN.recorderBlob);
check('only two tool candidate paths', JSON.stringify(readdirSync(new URL('../candidate/tools/', import.meta.url)).sort()) === JSON.stringify(['frame_work_probe.mjs', 'ios_audio_capture.mjs']));
for (const name of ['ios_audio_capture.mjs', 'frame_work_probe.mjs']) {
  const file = new URL('../candidate/tools/' + name, import.meta.url);
  const result = spawnSync(process.execPath, ['--check', file.pathname], { encoding: 'utf8' });
  check(name + ' syntax', result.status === 0);
  check(name + ' runtime fixture identical to candidate', readFileSync(file).equals(readFileSync(new URL('./runtime/tools/' + name, import.meta.url))));
}
writeFileSync(new URL('final-checks.json', import.meta.url), JSON.stringify({ status: 'pass', passed: checks.length, checks,
  scope: 'Finite frozen-source and syntax checks. Runtime timing and physical-device behavior not measured.' }, null, 2) + '\n');
console.log(JSON.stringify({ passed: checks.length, status: 'pass' }));
