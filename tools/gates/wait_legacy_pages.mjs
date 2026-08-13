#!/usr/bin/env node
/**
 * Serialize the custom Pages deployment after the repository's legacy
 * branch-source deployment for the same main commit.
 *
 * This repository still has Pages configured as main/(root). A main push can
 * therefore start two publishers. The custom artifact carries the commit SHA,
 * while the branch mirror deliberately does not. Deploying the custom artifact
 * before the legacy build finishes would allow that legacy build to overwrite
 * a successful F6 result afterwards.
 *
 * The gate waits until the Pages Builds API reports the legacy build for the
 * exact intended SHA as built and no same-SHA build remains pending. If the
 * site has since been migrated to Actions (`build_type: workflow`), there is no
 * branch-source competitor and the gate passes immediately.
 */

const argv = process.argv.slice(2);
const arg = (name, fallback = '') => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const has = (name) => argv.includes(`--${name}`);

const EXPECTED_SHA = arg('sha', process.env.PAGES_EXPECT_SHA || '');
const REPOSITORY = arg('repository', process.env.GITHUB_REPOSITORY || '');
const API_BASE = arg('api-base', process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, '');
const TOKEN = process.env.GITHUB_TOKEN || '';
const TIMEOUT_MS = Number(arg('timeout-ms', '1200000'));
const POLL_MS = Number(arg('poll-ms', '10000'));

function assess(site, builds, expectedSha) {
  if (!site || typeof site !== 'object') return { state: 'fatal', detail: 'Pages site response is not an object' };
  if (site.build_type === 'workflow') {
    return { state: 'ready', detail: 'Pages source is Actions-only; no legacy branch deployment can race it' };
  }
  if (site.build_type !== 'legacy') {
    return { state: 'fatal', detail: `unknown Pages build_type ${String(site.build_type)}` };
  }
  if (site.source?.branch !== 'main' || site.source?.path !== '/') {
    return {
      state: 'fatal',
      detail: `unmodelled legacy Pages source ${String(site.source?.branch)}/${String(site.source?.path)}`,
    };
  }
  if (!Array.isArray(builds)) return { state: 'fatal', detail: 'Pages builds response is not an array' };

  const matching = builds.filter((build) => build && build.commit === expectedSha);
  if (!matching.length) return { state: 'wait', detail: `legacy build for ${expectedSha} has not appeared` };

  const pending = matching.filter((build) => !['built', 'errored'].includes(build.status));
  if (pending.length) {
    return { state: 'wait', detail: `legacy build for ${expectedSha} is ${pending.map((b) => b.status).join(',')}` };
  }

  const newest = matching
    .slice()
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))[0];
  if (newest.status === 'errored') {
    return { state: 'fatal', detail: `newest legacy build for ${expectedSha} errored` };
  }
  if (newest.status !== 'built') {
    return { state: 'wait', detail: `newest legacy build for ${expectedSha} is ${String(newest.status)}` };
  }
  return {
    state: 'ready',
    detail: `legacy main/(root) build for ${expectedSha} completed at ${String(newest.updated_at || 'unknown time')}`,
  };
}

function selfTest() {
  const sha = 'a'.repeat(40);
  const legacy = { build_type: 'legacy', source: { branch: 'main', path: '/' } };
  const cases = [
    ['Actions-only passes', { build_type: 'workflow' }, [], 'ready'],
    ['matching built passes', legacy, [{ commit: sha, status: 'built', created_at: '2026-01-01' }], 'ready'],
    ['missing exact SHA waits', legacy, [{ commit: 'b'.repeat(40), status: 'built' }], 'wait'],
    ['queued exact SHA waits', legacy, [{ commit: sha, status: 'queued' }], 'wait'],
    ['mixed built and pending waits', legacy, [
      { commit: sha, status: 'built', created_at: '2026-01-01' },
      { commit: sha, status: 'building', created_at: '2026-01-02' },
    ], 'wait'],
    ['newest errored fails', legacy, [
      { commit: sha, status: 'built', created_at: '2026-01-01' },
      { commit: sha, status: 'errored', created_at: '2026-01-02' },
    ], 'fatal'],
    ['unexpected legacy source fails', { build_type: 'legacy', source: { branch: 'gh-pages', path: '/' } }, [], 'fatal'],
    ['unknown source mode fails', { build_type: 'mystery' }, [], 'fatal'],
  ];
  let failed = 0;
  for (const [name, site, builds, expected] of cases) {
    const got = assess(site, builds, sha).state;
    if (got === expected) console.log(`ok  ${name} — ${got}`);
    else { console.error(`FAIL ${name} — expected ${expected}, got ${got}`); failed += 1; }
  }
  if (failed) {
    console.error(`Pages ordering self-test FAILED — ${cases.length - failed}/${cases.length}`);
    process.exit(1);
  }
  console.log(`Pages ordering self-test OK — ${cases.length}/${cases.length}`);
  process.exit(0);
}

if (has('self-test')) selfTest();

if (!/^[0-9a-f]{40}$/.test(EXPECTED_SHA)) {
  console.error('Pages ordering gate FAILED: --sha/PAGES_EXPECT_SHA must be one full lowercase commit SHA.');
  process.exit(1);
}
if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(REPOSITORY)) {
  console.error('Pages ordering gate FAILED: --repository/GITHUB_REPOSITORY must be owner/name.');
  process.exit(1);
}
if (!Number.isFinite(TIMEOUT_MS) || TIMEOUT_MS < 0 || !Number.isFinite(POLL_MS) || POLL_MS < 1) {
  console.error('Pages ordering gate FAILED: timeout and poll intervals must be finite positive durations.');
  process.exit(1);
}

const headers = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'User-Agent': 'cinderline-pages-order-gate',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

async function getJson(path) {
  const response = await fetch(`${API_BASE}${path}`, { headers, cache: 'no-store' });
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`);
  return response.json();
}

const started = Date.now();
let lastDetail = '';
for (;;) {
  try {
    const site = await getJson(`/repos/${REPOSITORY}/pages`);
    const builds = site.build_type === 'legacy'
      ? await getJson(`/repos/${REPOSITORY}/pages/builds?per_page=100`)
      : [];
    const result = assess(site, builds, EXPECTED_SHA);
    if (result.detail !== lastDetail) console.log(`Pages ordering gate: ${result.detail}`);
    lastDetail = result.detail;
    if (result.state === 'ready') process.exit(0);
    if (result.state === 'fatal') {
      console.error(`Pages ordering gate FAILED: ${result.detail}`);
      process.exit(1);
    }
  } catch (error) {
    lastDetail = `Pages API unavailable: ${error.message}`;
    console.log(`Pages ordering gate: ${lastDetail}`);
  }

  if (Date.now() - started >= TIMEOUT_MS) {
    console.error(`Pages ordering gate FAILED after ${TIMEOUT_MS}ms: ${lastDetail}`);
    console.error('The custom artifact was not deployed, so an unobserved legacy build cannot overwrite a successful F6 result.');
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, POLL_MS));
}
