import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const original = resolve(root, '../c38-integration-code-review-ultra/fixture');
const fixture = resolve(root, 'fixture');
const checks = [];
const checked = (name, fn) => { fn(); checks.push(name); };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const candidate = readFileSync(resolve(root, 'candidate/tools/test-ios-safari.mjs'));
assert.equal(digest(candidate), '12490ace8e7a7344dc7e2bf5aa316b499b68e6ca4f222bbcb03b2eb9c07eceae');
for (const path of ['tools/webdriver-request.mjs', 'tools/ios-pointer-coordinates.mjs', 'tools/ios_audio_transfer.mjs',
  'tools/ios_audio_capture.mjs', 'tools/frame_work_probe.mjs', 'tools/mobile_audio_capture.mjs',
  'cinderline.1.0.0.js', 'dist/cinderline.1.0.0.js']) {
  mkdirSync(dirname(resolve(fixture, path)), { recursive: true });
  copyFileSync(resolve(original, path), resolve(fixture, path));
}
writeFileSync(resolve(fixture, 'tools/test-ios-safari.mjs'), candidate);
const index = '<!doctype html><title>synthetic fixture; no game execution</title>';
writeFileSync(resolve(fixture, 'dist/index.html'), index);
writeFileSync(resolve(fixture, 'dist/asset.js'), '/* ordinary fixture asset */');
checked('fixture contains original pinned root and recorder; candidate harness is exact', () => {
  assert.equal(digest(readFileSync(resolve(fixture, 'cinderline.1.0.0.js'))), '1094c1d96bed6b953c1655ce65549c484b8f09e275f055bff283499cece110f7');
  const recorder = readFileSync(resolve(fixture, 'tools/mobile_audio_capture.mjs'));
  assert.equal(createHash('sha1').update(`blob ${recorder.length}\0`).update(recorder).digest('hex'), '785541d3beaed0e35e8bcf042973eabb7bdb5d6c');
});

const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}/`)));
const close = server => new Promise(resolve => server.close(resolve));
const get = (url, options = {}) => new Promise((resolve, reject) => {
  const req = request(url, options, res => {
    const chunks = []; res.on('data', x => chunks.push(x));
    res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
  });
  req.on('error', reject); req.end();
});
const originalError = 'The remote debugger did not return any connected web applications after 5351ms.';
const sentinel = 'synthetic fixture stopped at existing pointer calibration';
const scenarios = [];

for (const name of ['cold', 'foreground', 'wrong-page', 'missing-marker', 'session-failure', 'cleanup-failure', 'external', 'external-audio']) {
  const audio = ['cold', 'wrong-page', 'session-failure', 'cleanup-failure', 'external-audio'].includes(name);
  const external = name.startsWith('external');
  const seen = [], transportErrors = [];
  let bootstrap, base, caps;
  const externalServer = createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(index); });
  const externalUrl = external ? await listen(externalServer) : '';
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
    seen.push({ method: req.method, path: req.url, body });
    const reply = (value, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify({ value })); };
    const fail = message => reply({ error: 'unknown error', message }, 500);
    try {
      if (req.url === '/status') return reply({ ready: true });
      if (req.url === '/session') {
        caps = body.capabilities.alwaysMatch;
        if (external) {
          checked(name + ': external target has no local bootstrap capabilities', () => {
            assert(!('appium:initialDeeplinkUrl' in caps)); assert(!('appium:forceAppLaunch' in caps));
          });
          base = externalUrl;
        } else {
          bootstrap = caps['appium:initialDeeplinkUrl']; base = new URL('/', bootstrap).href;
          checked(name + ': local origin and force launch preserve noReset and existing deadlines', () => {
            const u = new URL(bootstrap); assert.equal(u.protocol, 'http:'); assert.equal(u.hostname, '127.0.0.1');
            assert.equal(u.pathname, '/__ios_safari_bootstrap__.html');
            assert.equal(caps['appium:forceAppLaunch'], true); assert.equal(caps['appium:noReset'], true);
            assert.equal(caps['appium:wdaLaunchTimeout'], 240000); assert.equal(caps['appium:newCommandTimeout'], 300);
            assert(!('appium:webviewConnectTimeout' in caps)); assert(!('appium:webviewConnectRetries' in caps));
          });
          const page = await get(bootstrap);
          checked(name + ': actual server serves a no-script, no-store bootstrap', () => {
            assert.equal(page.status, 200); assert.equal(page.headers['content-type'], 'text/html; charset=utf-8');
            assert.equal(page.headers['cache-control'], 'no-store'); assert.match(page.body, /id="ios-safari-bootstrap"/);
            assert(!/<script|\bsrc=|\bhref=|\bon\w+=/i.test(page.body));
          });
          if (name === 'cold') {
            const head = await get(bootstrap, { method: 'HEAD' });
            const post = await get(bootstrap, { method: 'POST' });
            const wrongHost = await get(bootstrap, { headers: { host: 'foreign.invalid' } });
            const ordinary = await get(base), asset = await get(new URL('asset.js', base)), missing = await get(new URL('absent.js', base));
            checked('actual HTTP HEAD/POST/Host and ordinary asset boundaries', () => {
              assert.equal(head.status, 200); assert.equal(head.body, ''); assert.equal(post.status, 405);
              assert.equal(wrongHost.status, 421); assert.equal(ordinary.body, index);
              assert.equal(asset.body, '/* ordinary fixture asset */'); assert.equal(missing.status, 404);
            });
          }
        }
        if (name === 'session-failure') return fail(originalError);
        return reply({ sessionId: 'fixture-session', capabilities: {} });
      }
      if (req.method === 'DELETE') return name === 'cleanup-failure' ? fail('synthetic cleanup rejection') : reply(null);
      if (req.url.endsWith('/execute/sync')) {
        const script = body.script;
        if (script.includes('ios-safari-bootstrap')) return reply({ url: name === 'wrong-page' ? new URL('/wrong', base).href : bootstrap, ready: name !== 'missing-marker' });
        if (script.includes('Boolean(window.CINDERLINE')) return reply(true);
        if (script.includes('localStorage.clear()')) return reply(true);
        if (script.startsWith('mobile:')) return fail(sentinel);
        if (script.startsWith('var C=window.CINDERLINE;')) return reply({ ready: null, fixture: true });
        return fail('unexpected synthetic execute: ' + script.slice(0,80));
      }
      if (req.url.endsWith('/screenshot')) return reply(Buffer.from('synthetic screenshot bytes; not a real image').toString('base64'));
      if (req.url.endsWith('/orientation') || req.url.endsWith('/url') || req.url.endsWith('/refresh')) return reply(null);
      return fail('unexpected synthetic command');
    } catch (error) { transportErrors.push(error.stack); fail(error.message); }
  });
  const url = await listen(server);
  const output = resolve(fixture, 'results', name);
  const child = spawn(process.execPath, ['tools/test-ios-safari.mjs'], { cwd: fixture, env: {
    ...process.env, APPIUM_URL: url, CINDERLINE_TEST_URL: externalUrl, CINDERLINE_IOS_AUDIO_CAPTURE: audio ? '1' : '0',
    CINDERLINE_IOS_OUTPUT: output, IOS_SIMULATOR_UDID: 'synthetic-fixture', IOS_SIMULATOR_PLATFORM_VERSION: '18.5',
    GITHUB_SHA: '61e8f8c595bde13634fe709f979816011df165d0', GITHUB_RUN_ID: 'synthetic-local-only', GITHUB_RUN_ATTEMPT: '1',
  }, stdio: ['ignore','pipe','pipe'] });
  let stdout = '', stderr = '';
  child.stdout.on('data', x => { stdout += x; }); child.stderr.on('data', x => { stderr += x; });
  const exit = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
  await close(server); if (external) await close(externalServer);
  const report = JSON.parse(readFileSync(resolve(output, 'report.json'), 'utf8'));
  writeFileSync(resolve(output, 'stdout.log'), stdout); writeFileSync(resolve(output, 'stderr.log'), stderr);
  checked(name + ': primary failure, exit and transport protocol retained', () => {
    assert.equal(exit, 1); assert.equal(report.status, 'failed'); assert.equal(transportErrors.length, 0);
    assert.equal(report.transport.sessionRequestTimeoutMs, 900000); assert.equal(report.transport.commandRequestTimeoutMs, 90000);
    assert.equal(report.checks.length, 0); assert.equal(report.failures.length, 1);
  });
  if (name === 'external-audio') {
    checked('external capture remains rejected before session creation', () => {
      assert.match(report.failures[0], /Pinned iOS audio capture requires/); assert.equal(seen.length, 0);
    });
  } else if (name === 'session-failure') {
    checked('original POST session reason and preflight provenance survive unchanged', () => {
      assert(report.failures[0].includes(originalError)); assert.equal(report.audioCapture.status, 'not started');
      assert.equal(report.audioCapture.provenance.harnessSha256, digest(candidate)); assert.deepEqual(report.audioCapture.clips, []);
      assert(!seen.some(x => x.path.startsWith('/session/')));
    });
  } else if (name === 'wrong-page' || name === 'missing-marker') {
    checked(name + ': unexpected initial document fails before product navigation and cleans up', () => {
      assert.match(report.failures[0], /Safari session bootstrap mismatch/);
      assert(!seen.some(x => /\/(url|orientation)$/.test(x.path)));
      assert(seen.some(x => x.method === 'DELETE')); assert.equal(report.safariStartup.verified, false);
    });
  } else {
    checked(name + ': original landscape/navigation/ready/storage-clear/refresh order remains', () => {
      assert(report.failures[0].includes(sentinel));
      const init = seen.filter(x => x.path.endsWith('/orientation') || x.path.endsWith('/url') || x.path.endsWith('/refresh') || x.body?.script?.includes('Boolean(window.CINDERLINE') || x.body?.script?.includes('localStorage.clear()'));
      assert.deepEqual(init.map(x => x.path.split('/').at(-1)), ['orientation','url','sync','sync','refresh','sync']);
      assert.equal(init[0].body.orientation, 'LANDSCAPE'); assert.equal(init[1].body.url, base);
      assert.equal(report.safariStartup.verified, !external);
      assert(seen.some(x => x.method === 'DELETE'));
      if (name === 'cleanup-failure') assert(report.errors.some(x => x.includes('session cleanup:') && x.includes('synthetic cleanup rejection')));
    });
  }
  if (base && !external) {
    await assert.rejects(get(base)); checks.push(name + ': owned HTTP server is closed after failure');
  }
  scenarios.push({ name, audio, external, exit, firstFailure: report.failures[0].split('\n')[0], commands: seen.map(x => `${x.method} ${x.path}`), startup: report.safariStartup ?? null, actualSafari: false });
}
const result = { status: 'passed', candidateSha256: digest(candidate), finiteChecks: checks.length, checks, scenarios,
  limits: 'Actual candidate harness and HTTP server with synthetic WebDriver responses; pinned product bytes checked but game/Safari/WDA/WebInspector are not executed. Exact official source review covers the capability path; real Safari repair remains unmeasured.' };
writeFileSync(resolve(root, 'bootstrap-verification.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: result.status, scenarios: scenarios.length, finiteChecks: checks.length, candidateSha256: result.candidateSha256 }));
