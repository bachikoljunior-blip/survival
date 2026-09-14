#!/usr/bin/env node
/** Read the single work budget and refuse unsupported completion claims.
 * These checks validate the evidence record; they do not perform a blind comparison.
 */
import { readFileSync, existsSync, readdirSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../.kit/lib/state/yaml.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
export const WORK_FILE = 'AI_DEVELOPMENT/SESSION_STATE.yaml';
export const ELEMENTS_FILE = 'AI_DEVELOPMENT/BENCHMARKS/elements.json';
export const VERDICTS = new Set(['satisfied', 'not satisfied', 'not measured']);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const time = (value) => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  && Number.isFinite(Date.parse(value));
const normal = (value) => String(value).replace(/\*\*|`/g, '').trim().replace(/\s+/g, ' ');

export function continuation(work = {}, elements = [], now = new Date()) {
  const requested = work.units_requested === undefined ? 1 : work.units_requested;
  const completed = work.units_completed ?? 0;
  if (requested !== 'continuous' && (!Number.isSafeInteger(requested) || requested < 1)) {
    throw new Error('work.units_requested must be a positive integer or continuous');
  }
  if (!Number.isSafeInteger(completed) || completed < 0) throw new Error('invalid work.units_completed');
  if (!Array.isArray(elements) || !elements.length) throw new Error('the concept must have elements');
  if (elements.some(element => !element || !VERDICTS.has(element.status))) throw new Error('unknown element verdict');
  const remaining = elements.filter((element) => element.status !== 'satisfied').map((element) => element.id);
  const complete = elements.length > 0 && remaining.length === 0;
  return {
    units_requested: requested, units_completed: completed, complete,
    continue: !complete && (requested === 'continuous' || completed < requested),
    remaining, deadline_reached: time(work.deadline_at) && Number(now) >= Date.parse(work.deadline_at),
  };
}

/** Bind both the source inputs and the actual distributable bytes.
 * A checkout without dist uses its byte-identical Pages root mirror under dist/ names.
 */
export function currentBuildHash({ root = ROOT, readBytes = (path) => readFileSync(join(root, path)) } = {}) {
  const entries = [];
  const add = (path, name = path) => entries.push([name, hash(readBytes(path))]);
  const walk = (directory, name = directory) => {
    const full = join(root, directory);
    if (!existsSync(full)) throw new Error(`build input missing: ${directory}`);
    for (const child of readdirSync(full).sort()) {
      const path = `${directory}/${child}`;
      const label = `${name}/${child}`;
      const stat = lstatSync(join(root, path));
      if (stat.isSymbolicLink()) throw new Error(`build input is a symlink: ${path}`);
      if (stat.isDirectory()) walk(path, label);
      else if (stat.isFile()) add(path, label);
    }
  };
  walk('src'); walk('public');
  for (const path of ['build.mjs', 'package.json', 'package-lock.json']) add(path);
  if (existsSync(join(root, 'dist'))) walk('dist');
  else {
    for (const name of ['index.html', 'styles.css', 'manifest.webmanifest', 'icon.svg', '.nojekyll']) add(name, `dist/${name}`);
    const bundles = readdirSync(root).filter((name) => /^cinderline\.[A-Za-z0-9._-]+\.js$/.test(name));
    if (bundles.length !== 1) throw new Error(`expected one Pages root bundle, found ${bundles.length}`);
    add(bundles[0], `dist/${bundles[0]}`);
  }
  if (!entries.some(([name]) => /^dist\/cinderline\..+\.js$/.test(name))) throw new Error('current distributable bundle missing');
  return hash(JSON.stringify(entries.sort(([left], [right]) => left.localeCompare(right))));
}

/** The evaluator receives only the labelled material, not the provenance mapping. */
export function comparisonPacketHash(materials) {
  return hash(JSON.stringify(materials.map(({ label, sha256 }) => ({ label, sha256 }))
    .sort((left, right) => left.label.localeCompare(right.label))));
}

export function inspectWork({ root = ROOT, readText, exists, readBytes, now = new Date() } = {}) {
  const errors = [];
  const read = readText ?? ((path) => readFileSync(join(root, path), 'utf8'));
  const present = exists ?? ((path) => existsSync(join(root, path)));
  const bytes = readBytes ?? ((path) => readFileSync(join(root, path)));
  let state = null, catalog = null, initial_execution_commit = null;
  const fail = (message) => errors.push(message);
  const localPath = (path) => typeof path === 'string' && path.length > 0 && !isAbsolute(path)
    && !relative(resolve(root), resolve(root, path)).startsWith('..') && !path.includes('\\');
  const json = (path) => {
    if (!localPath(path)) throw new Error(`invalid repository evidence path: ${path}`);
    if (!present(path)) throw new Error(`evidence missing: ${path}`);
    return JSON.parse(read(path));
  };
  try { state = parseYaml(read(WORK_FILE), { path: WORK_FILE }); }
  catch (error) { fail(`${WORK_FILE}: ${error.message}`); }
  try { catalog = json(ELEMENTS_FILE); }
  catch (error) { fail(`${ELEMENTS_FILE}: ${error.message}`); }
  if (!state || !catalog) return { errors, state, catalog, decision: null, initial_execution_commit };
  const work = state.work ?? {};
  const rawElements = Array.isArray(catalog.elements) ? catalog.elements : [];
  const elements = rawElements.filter((element) => element !== null && typeof element === 'object' && !Array.isArray(element));
  if (!Array.isArray(catalog.elements) || rawElements.length !== elements.length) fail('catalogue elements must be records');
  if (state.schema_version !== 1) fail('unsupported work state schema');
  if (!(work.units_requested === undefined || work.units_requested === 'continuous'
    || (Number.isSafeInteger(work.units_requested) && work.units_requested > 0))) fail('work.units_requested must be a positive integer or continuous');
  if (!Number.isSafeInteger(work.units_completed) || work.units_completed < 0) fail('work.units_completed must be a non-negative integer');
  if (!Array.isArray(work.units)) fail('work.units must be an array');
  if (Array.isArray(work.units) && work.units_completed !== work.units.length) fail('units_completed does not match the completed comparison ledger');
  try {
    if (present('AI_DEVELOPMENT/STATE.yaml') && /^work\s*:/m.test(read('AI_DEVELOPMENT/STATE.yaml'))) {
      fail('legacy STATE.yaml work is a duplicate authority; migrate it to SESSION_STATE.yaml');
    }
  } catch (error) { fail(`legacy state check: ${error.message}`); }
  if (!time(work.started_at) || !time(work.deadline_at)) fail('start and deadline must include a valid timezone');
  if (Date.parse(work.deadline_at) - Date.parse(work.started_at) !== 168 * 3600000) fail('deadline must be exactly 168 hours after the first start');
  if (work.timezone !== 'Asia/Tokyo' || !String(work.started_at).endsWith('+09:00') || !String(work.deadline_at).endsWith('+09:00')) {
    fail('start and deadline must be recorded in Japan time (+09:00, Asia/Tokyo)');
  }
  try {
    const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    if (git('rev-parse', '--is-shallow-repository') === 'true') throw new Error('shallow history cannot establish the first execution anchor');
    const commits = git('log', '--reverse', '--diff-filter=A', '--format=%H', '--', WORK_FILE).split(/\s+/).filter(Boolean);
    if (!commits.length) throw new Error('the first work state has not been committed');
    initial_execution_commit = commits[0];
    const initial = parseYaml(git('show', `${initial_execution_commit}:${WORK_FILE}`), { path: `${initial_execution_commit}:${WORK_FILE}` });
    for (const key of ['started_at', 'deadline_at', 'timezone']) {
      if (initial.work?.[key] !== work[key]) fail(`work.${key} differs from the first execution anchor ${initial_execution_commit}`);
    }
  } catch (error) { fail(`initial execution anchor unavailable: ${error.message}`); }

  // The catalogue is a projection of the inherited concept/element document, not a way
  // to delete an unmeasured element so that all remaining elements appear complete.
  try {
    const document = read('docs/benchmarks.md');
    const declared = [...document.matchAll(/^### (E-\d+)\s+(.+?)\s*—\s*(W\d+)\s+(.+)$/gm)]
      .map((match) => ({ id: match[1], name: normal(match[2]), reference_id: match[3], reference_work: normal(match[4]) }));
    if (!declared.length) fail('benchmark document contains no elements');
    const revision = document.match(/<!--\s*concept_revision:\s*(.+?)\s*-->/)?.[1];
    if (!revision || catalog.concept_revision !== revision) fail('catalogue concept revision differs from the benchmark document');
    const byId = new Map(elements.map((element) => [element.id, element]));
    if (byId.size !== elements.length) fail('catalogue contains duplicate element ids');
    if (new Set(declared.map((element) => element.id)).size !== declared.length) fail('benchmark document contains duplicate element ids');
    if (elements.length !== declared.length) fail('catalogue element count differs from the benchmark document');
    for (const expected of declared) {
      const actual = byId.get(expected.id);
      if (!actual) { fail(`catalogue omits ${expected.id}`); continue; }
      for (const key of ['name', 'reference_id', 'reference_work']) {
        if (normal(actual[key]) !== expected[key]) fail(`${expected.id} ${key} differs from the benchmark document`);
      }
    }
    for (const element of elements) if (!declared.some((expected) => expected.id === element.id)) fail(`catalogue invents ${element.id}`);
    const lock = json('AI_DEVELOPMENT/BENCHMARKS/criteria.lock.json');
    const criteria = [...document.matchAll(/^\|\s*(BM-[A-Z]+-\d+)\s*\|/gm)].map((match) => match[1]);
    for (const id of Object.keys(lock.digests ?? {})) if (!criteria.includes(id)) fail(`benchmark document omits locked criterion ${id}`);
  } catch (error) { fail(`element roster check: ${error.message}`); }
  const coverage = catalog.coverage;
  if (!coverage || Array.isArray(coverage) || typeof coverage !== 'object' || !Object.keys(coverage).length) fail('concept coverage is missing');
  else {
    const covered = new Set();
    for (const [part, ids] of Object.entries(coverage)) {
      if (!part.trim() || !Array.isArray(ids) || !ids.length) { fail('concept coverage has an empty part'); continue; }
      for (const id of ids) {
        covered.add(id);
        if (!elements.some((element) => element.id === id)) fail(`concept coverage references missing ${id}`);
      }
    }
    for (const element of elements) if (!covered.has(element.id)) fail(`${element.id} is absent from concept coverage`);
  }
  const records = new Map();
  const packets = new Map();
  const identities = (evaluator, at) => {
    if (!evaluator || evaluator.independent !== true || evaluator.source_identity_known !== false
      || evaluator.source_identity_disclosed !== false) fail(`${at}: evaluator has not confirmed source blindness and independence`);
  };
  const comparison = (path) => {
    if (records.has(path)) return records.get(path);
    try {
      const record = json(path);
      records.set(path, record);
      if (!elements.some((element) => element.id === record.element)) fail(`${path}: unknown comparison element`);
      if (record.valid !== true) fail(`${path}: comparison is not valid`);
      if (!time(record.completed_at) || Date.parse(record.completed_at) < Date.parse(work.started_at)
        || Date.parse(record.completed_at) > Number(now)) fail(`${path}: invalid comparison completion time`);
      if (!['A', 'B'].includes(record.development_label) || !['A', 'B', 'equal'].includes(record.selected)) fail(`${path}: invalid selection labels`);
      if (!sha(record.build_sha256)) fail(`${path}: missing comparison build sha256`);
      identities(record.evaluator, path);
      const materials = record.materials;
      if (!Array.isArray(materials) || materials.length < 2 || new Set(materials.map((item) => item.label)).size !== 2
        || materials.some((item) => !['A', 'B'].includes(item.label))) fail(`${path}: material labels must be exactly A and B`);
      else {
        const materialPaths = new Set();
        for (const material of materials) {
          if (!localPath(material.path) || !present(material.path) || !sha(material.sha256)) fail(`${path}: material is missing or malformed`);
          else {
            const resolved = resolve(root, material.path);
            if (materialPaths.has(resolved)) fail(`${path}: duplicate comparison material path`);
            materialPaths.add(resolved);
            if (hash(bytes(material.path)) !== material.sha256) fail(`${path}: material bytes differ from their recorded sha256`);
          }
        }
        if (record.packet_sha256 !== comparisonPacketHash(materials)) fail(`${path}: packet digest does not match its materials`);
      }
      if (localPath(record.evaluation_path) && resolve(root, record.evaluation_path) === resolve(root, path)) {
        fail(`${path}: the source-mapped comparison record is not a separate evaluator result`);
      }
      const evaluation = json(record.evaluation_path);
      for (const key of ['element', 'completed_at', 'selected', 'packet_sha256']) {
        if (evaluation[key] !== record[key]) fail(`${path}: evaluator result disagrees on ${key}`);
      }
      identities(evaluation.evaluator, record.evaluation_path);
      if (JSON.stringify(evaluation.evaluator) !== JSON.stringify(record.evaluator)) fail(`${path}: evaluator identity assertions disagree`);
      const signature = `${record.element}:${record.build_sha256}:${record.packet_sha256}`;
      if (packets.has(signature) && packets.get(signature) !== path) fail(`${path}: unchanged comparison packet was evaluated again`);
      packets.set(signature, path);
      return record;
    } catch (error) { fail(`comparison ${path}: ${error.message}`); records.set(path, null); return null; }
  };
  const ledger = new Set();
  for (const unit of Array.isArray(work.units) ? work.units : []) {
    if (!unit || !localPath(unit.comparison)) { fail('work unit does not name a comparison record'); continue; }
    if (ledger.has(unit.comparison)) fail(`duplicate work unit: ${unit.comparison}`);
    ledger.add(unit.comparison);
    const record = comparison(unit.comparison);
    if (record && unit.completed_at !== record.completed_at) fail(`work unit completion time disagrees: ${unit.comparison}`);
  }
  let currentBuild = null;
  if (elements.some((element) => element.status !== 'not measured')) {
    try { currentBuild = currentBuildHash({ root, readBytes: bytes }); }
    catch (error) { fail(`current build: ${error.message}`); }
  }
  for (const element of elements) {
    if (typeof element.comparison_method !== 'string' || !element.comparison_method.trim()) fail(`${element.id}: comparison method is missing`);
    if (!VERDICTS.has(element.status)) { fail(`${element.id}: unsupported verdict ${element.status}`); continue; }
    if (element.status === 'not measured') continue;
    const record = comparison(element.comparison);
    if (!record) continue;
    if (!ledger.has(element.comparison)) fail(`${element.id}: decided comparison is absent from the work unit ledger`);
    if (record.element !== element.id) fail(`${element.id}: comparison belongs to a different element`);
    if (element.build !== record.build_sha256 || record.build_sha256 !== currentBuild) fail(`${element.id}: evidence does not apply to the current build`);
    const verdict = record.selected === 'equal' || record.selected === record.development_label ? 'satisfied' : 'not satisfied';
    if (element.status !== verdict) fail(`${element.id}: verdict contradicts the evaluator selection`);
  }
  return { errors, state, catalog, decision: errors.length ? null : continuation(work, elements, now), initial_execution_commit };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = inspectWork();
  console.log(JSON.stringify(result.errors.length ? { errors: result.errors } : { ...result.decision, initial_execution_commit: result.initial_execution_commit }, null, 2));
  process.exitCode = result.errors.length ? 1 : 0;
}
