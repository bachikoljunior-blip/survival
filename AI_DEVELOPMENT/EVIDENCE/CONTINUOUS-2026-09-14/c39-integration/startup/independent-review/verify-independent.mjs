import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer, request } from 'node:http';
import { connect } from 'node:net';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const out = dirname(fileURLToPath(import.meta.url));
const root = resolve(out, '..');
const peer = resolve(root, 'c38-pr-safari-results-ultra');
const read = p => readFileSync(p, 'utf8');
const digest = x => createHash('sha256').update(x).digest('hex');
const pin = p => { const b = readFileSync(p); return { path: p.slice(root.length + 1), bytes: b.length,
  sha256: digest(b), gitBlob: createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex') }; };
const sourcePath = join(peer, 'source/tools/test-ios-safari.mjs');
const candidatePath = join(peer, 'candidate/tools/test-ios-safari.mjs');
const source = read(sourcePath), candidate = read(candidatePath);
const checks = [];
const check = async (name, fn) => { const detail = await fn(); checks.push({ name, status: 'passed', ...(detail === undefined ? {} : { detail }) }); };
const between = (s, a, b) => { const i = s.indexOf(a); assert(i >= 0, a); const j = s.indexOf(b, i); assert(j > i, b); return s.slice(i, j); };
const tree = JSON.parse(read(join(root, 'c38-narrative-r2-result-ultra/independent-review/canonical-c38-tree.json')));

await check('baseline harness equals independently accepted C38 canonical tree blob', () => {
  const entry = tree.tree.find(x => x.path === 'tools/test-ios-safari.mjs');
  assert.equal(pin(sourcePath).gitBlob, entry.sha); assert.equal(pin(sourcePath).bytes, entry.size);
});
await check('exact unified patch reconstructs candidate from canonical baseline with five bounded hunks', () => {
  const patch = read(join(peer, 'candidate.patch')).split('\n');
  assert.equal(patch[0], '--- a/tools/test-ios-safari.mjs'); assert.equal(patch[1], '+++ b/tools/test-ios-safari.mjs');
  const old = source.split('\n'), result = []; let cursor = 0, hunks = 0, removed = 0, added = 0;
  for (let i = 2; i < patch.length;) {
    if (i === patch.length - 1 && patch[i] === '') break;
    const h = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(patch[i++]); assert(h);
    const start = Number(h[1]) - 1; assert(start >= cursor);
    result.push(...old.slice(cursor, start)); cursor = start; let used = 0, produced = 0; hunks++;
    while (i < patch.length && !patch[i].startsWith('@@ ')) {
      const line = patch[i++]; if (line === '' && i === patch.length) break;
      if (line[0] === ' ' || line[0] === '-') { assert.equal(old[cursor++], line.slice(1)); used++; }
      if (line[0] === ' ' || line[0] === '+') { result.push(line.slice(1)); produced++; }
      if (line[0] === '-') removed++; if (line[0] === '+') added++;
      assert([' ', '-', '+'].includes(line[0]));
    }
    assert.equal(used, Number(h[2] ?? 1)); assert.equal(produced, Number(h[4] ?? 1));
  }
  result.push(...old.slice(cursor)); assert.equal(result.join('\n'), candidate);
  assert.equal(hunks, 5); assert.equal(removed, 0);
  return { hunks, addedLines: added, removedLines: removed };
});
await check('all post-bootstrap game flow, input, capture, 5% clocks, cleanup and export bytes unchanged', () => {
  const tail = "  await webdriver(sessionPath('/orientation'), { body: { orientation: 'LANDSCAPE' } });";
  assert.equal(source.slice(source.indexOf(tail)), candidate.slice(candidate.indexOf(tail)));
  const helpersStart = 'async function waitForHttp'; const helpersEnd = '\nlet localServer = null;';
  assert.equal(between(source, helpersStart, helpersEnd), between(candidate, helpersStart, helpersEnd));
  assert.match(candidate, /const SESSION_REQUEST_TIMEOUT = 900000;/);
  assert.match(candidate, /const BOOT_TIMEOUT = Number\(process.env.CINDERLINE_IOS_TIMEOUT \|\| 240000\);/);
});
await check('all 10 recovered original diagnostic bytes equal peer transport receipt', () => {
  const r = JSON.parse(read(join(peer, 'startup-recovery-receipt.json'))); assert.equal(r.files.length, 10);
  for (const f of r.files) { const p = pin(join(peer, 'original', f.group, f.file));
    assert.equal(p.sha256, f.sha256); assert.equal(p.bytes, f.bytes); assert.equal(f.complete, true); }
});
await check('both original logs retain WDA success then 5000ms empty-application failure before game navigation', () => {
  for (const group of ['pr', 'standalone']) { const s = read(join(peer, 'original', group, 'appium.log'));
    const wda = s.indexOf('WDA session startup took'); const err = s.indexOf('did not report any active web applications within 5000ms');
    assert(wda > 0 && err > wda); assert.match(s, /Remote Debugger version 16\.0\.3/);
    assert.match(s, /WebDriverAgent version: '16\.1\.0'/);
  }
  const s = read(join(peer, 'original/standalone/appium.log'));
  assert(s.indexOf('Debugger socket connected') < s.indexOf('Timed out waiting for applications to be reported'));
  assert.match(s, /No applications currently connected\./); assert.match(s, /20 retries/);
});

const constants = between(candidate, 'const SAFARI_BOOTSTRAP_PATH', '\n\nmkdirSync');
const serverSource = between(candidate, 'function startServer()', '\nasync function waitForHttp');
const fixtureDist = join(out, 'fixture-dist'); mkdirSync(fixtureDist, { recursive: true });
writeFileSync(join(fixtureDist, 'index.html'), '<!doctype html><title>independent HTTP fixture only</title>');
writeFileSync(join(fixtureDist, 'asset.js'), '/* independent static fixture only */');
writeFileSync(join(fixtureDist, '__ios_safari_bootstrap__.html'), 'THIS FILE MUST NOT SHADOW THE HARNESS DOCUMENT');
const startServer = vm.runInNewContext(`${constants}\n${serverSource}\nstartServer`, {
  createServer, CAPTURE_AUDIO: false, URL, readFileSync, extname, join, normalize, DIST: fixtureDist,
});
const get = (url, options = {}) => new Promise((done, reject) => {
  const req = request(url, options, res => { const chunks = []; res.on('data', b => chunks.push(b));
    res.on('end', () => done({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) })); });
  req.on('error', reject); req.end();
});
const pause = ms => new Promise(r => setTimeout(r, ms));
const server = await startServer();
try {
  const url = new URL('/__ios_safari_bootstrap__.html', server.url);
  await check('real HTTP GET returns exact no-JS no-store HTML before any game navigation', async () => {
    const r = await get(url); const html = vm.runInNewContext(`${constants}\nSAFARI_BOOTSTRAP_HTML`);
    assert.equal(r.status, 200); assert.equal(r.body.toString(), html);
    assert.equal(r.headers['content-type'], 'text/html; charset=utf-8'); assert.equal(r.headers['cache-control'], 'no-store');
    assert(!/<script|\b(?:src|href|on\w+)\s*=|<iframe|<object|<embed/i.test(html));
    assert.match(html, /id="ios-safari-bootstrap"/); return { bytes: r.body.length, sha256: digest(r.body) };
  });
  await check('real HTTP HEAD, method rejection and Host rejection', async () => {
    const head = await get(url, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(head.body.length, 0);
    for (const method of ['POST', 'PUT', 'OPTIONS']) { const r = await get(url, { method }); assert.equal(r.status, 405); assert.equal(r.headers.allow, 'GET, HEAD'); }
    for (const host of ['localhost:' + url.port, 'foreign.invalid']) assert.equal((await get(url, { headers: { host } })).status, 421);
  });
  await check('ordinary static root/assets/missing-file behavior is preserved', async () => {
    assert.equal((await get(server.url)).body.toString(), read(join(fixtureDist, 'index.html')));
    assert.equal((await get(new URL('/asset.js', server.url))).body.toString(), read(join(fixtureDist, 'asset.js')));
    assert.equal((await get(new URL('/missing.js', server.url))).status, 404);
  });
} finally { await new Promise(r => server.server.close(r)); }

for (const mode of ['rejected-method', 'rejected-host', 'allowed-get', 'allowed-head']) {
  await check(`incomplete body socket cleanup: ${mode}`, async () => {
    const local = await startServer(), u = new URL(local.url), socket = connect({ host: u.hostname, port: u.port });
    let response = '', closed = false; socket.on('data', b => response += b); socket.on('error', () => {});
    await new Promise(r => socket.once('connect', r));
    const method = mode === 'rejected-method' ? 'POST' : mode === 'allowed-head' ? 'HEAD' : 'GET';
    const host = mode === 'rejected-host' ? 'foreign.invalid' : u.host;
    socket.write(`${method} /__ios_safari_bootstrap__.html HTTP/1.1\r\nHost: ${host}\r\nContent-Length: 10000\r\nConnection: keep-alive\r\n\r\nx`);
    await pause(70); const done = new Promise(r => local.server.close(() => { closed = true; r(); }));
    await pause(250); const observed = { closedWithin250ms: closed, socketDestroyed: socket.destroyed, statusLine: response.split('\r\n')[0] };
    socket.destroy(); await done;
    assert.match(observed.statusLine, new RegExp(`HTTP/1.1 ${mode === 'rejected-method' ? 405 : mode === 'rejected-host' ? 421 : 200}`));
    assert.equal(observed.closedWithin250ms, true); assert.equal(observed.socketDestroyed, true); return observed;
  });
}

const creation = between(candidate, "  const created = await webdriver('session'", '\n  sessionId = created?.sessionId');
async function capabilities(bootstrapUrl) {
  let result;
  const context = { bootstrapUrl, UDID: 'fixture-only', PLATFORM_VERSION: '18.5', webdriver: async (path, options) => {
    assert.equal(path, 'session'); result = options.body.capabilities; return { sessionId: 'fixture-only' }; } };
  await vm.runInNewContext(`(async()=>{${creation}})()`, context);
  return structuredClone(result);
}
const localCaps = await capabilities('http://127.0.0.1:49152/__ios_safari_bootstrap__.html');
const externalCaps = await capabilities(null);
await check('actual capability expression changes only local initialDeeplinkUrl and forceAppLaunch', () => {
  const a = structuredClone(localCaps); delete a.alwaysMatch['appium:initialDeeplinkUrl']; delete a.alwaysMatch['appium:forceAppLaunch'];
  assert.deepEqual(a, externalCaps); assert.equal(localCaps.alwaysMatch['appium:noReset'], true);
  assert.equal(localCaps.alwaysMatch['appium:forceAppLaunch'], true);
  assert.equal(localCaps.alwaysMatch['appium:wdaLaunchTimeout'], 240000); assert.equal(localCaps.alwaysMatch['appium:newCommandTimeout'], 300);
  assert(!('appium:webviewConnectTimeout' in a.alwaysMatch)); assert(!('appium:webviewConnectRetries' in a.alwaysMatch));
});
const baselineCreation = between(source, "  const created = await webdriver('session'", '\n  sessionId = created?.sessionId');
await check('external capabilities equal exact baseline expression at runtime', async () => {
  let result; await vm.runInNewContext(`(async()=>{${baselineCreation}})()`, { UDID: 'fixture-only', PLATFORM_VERSION: '18.5',
    webdriver: async (path, options) => { result = structuredClone(options.body.capabilities); return {}; } });
  assert.deepEqual(externalCaps, result);
});
const bootGuard = between(candidate, '  if (bootstrapUrl) {\n    const page = await execute', '\n  await calibratePointerCoordinates();');
for (const mode of ['correct-local', 'wrong-origin', 'wrong-path', 'missing-marker', 'external']) {
  await check(`actual initialization guard/order: ${mode}`, async () => {
    const bootstrapUrl = mode === 'external' ? null : 'http://127.0.0.1:49152/__ios_safari_bootstrap__.html';
    const events = [], report = { safariStartup: { verified: false } };
    const location = { href: mode === 'wrong-origin' ? 'http://foreign.invalid/__ios_safari_bootstrap__.html' : mode === 'wrong-path' ? 'http://127.0.0.1:49152/other.html' : bootstrapUrl };
    const document = { getElementById: id => mode !== 'missing-marker' && id === 'ios-safari-bootstrap' ? {} : null };
    const context = { bootstrapUrl, baseUrl: 'http://127.0.0.1:49152/', report, BOOT_TIMEOUT: 240000, sessionPath: p => p,
      execute: async script => { events.push(script.includes('ios-safari-bootstrap') ? 'bootstrap' : 'storage-clear');
        return script.includes('ios-safari-bootstrap') ? vm.runInNewContext(`(()=>{${script}})()`, { location, document }) : true; },
      webdriver: async path => { events.push(path); }, waitForScript: async (script, timeout) => { assert.equal(timeout, 240000); events.push('ready'); } };
    let error; try { await vm.runInNewContext(`(async()=>{${bootGuard}})()`, context); } catch (e) { error = e; }
    if (['wrong-origin', 'wrong-path', 'missing-marker'].includes(mode)) {
      assert.match(error?.message ?? '', /Safari session bootstrap mismatch/); assert.deepEqual(events, ['bootstrap']); assert.equal(report.safariStartup.verified, false);
    } else {
      assert.equal(error, undefined); assert.deepEqual(events, [...(mode === 'external' ? [] : ['bootstrap']), '/orientation', '/url', 'ready', 'storage-clear', '/refresh', 'ready']);
      assert.equal(report.safariStartup.verified, mode !== 'external');
    }
    return { events, simulatedProtocolOnly: true };
  });
}

const officialStartup = read(join(peer, 'official-source/xcuitest-v12.1.3/lib/commands/wda/startup.ts'));
const wdaBody = between(officialStartup, '  if (driver.opts.noReset) {', '\n  const timer = new timing.Timer().start();')
  .replace('const wdaCaps: StringRecord', 'const wdaCaps').replaceAll('(driver.opts as StringRecord)', 'driver.opts');
for (const [name, caps] of [['local-cold-or-foreground', localCaps], ['external-existing-noReset', externalCaps]]) {
  await check(`fixed official XCUITest 12.1.3 executable WDA capability construction: ${name}`, () => {
    const opts = Object.fromEntries(Object.entries(caps.alwaysMatch).map(([k,v]) => [k.replace(/^appium:/, ''), v]));
    const result = vm.runInNewContext(`(()=>{${wdaBody}\nreturn wdaCaps;})()`, { driver: { opts, log: { info() {} } },
      args: [], env: {}, bundleId: 'com.apple.mobilesafari', util: { hasValue: x => x !== undefined && x !== null } });
    assert.equal(result.shouldTerminateApp, false);
    assert.equal(result.forceAppLaunch, name.startsWith('local'));
    assert.equal(result.initialUrl, caps.alwaysMatch['appium:initialDeeplinkUrl']);
    return { initialUrl: result.initialUrl ?? null, forceAppLaunch: result.forceAppLaunch, shouldTerminateApp: result.shouldTerminateApp,
      actualWdaExecution: false, typescriptOnlyTypeErasure: true };
  });
}
await check('fixed source startup ordering and WDA cold/foreground URL branches are present', () => {
  const driver = read(join(peer, 'official-source/xcuitest-v12.1.3/lib/driver.ts'));
  assert(driver.indexOf('await this.startWda();') < driver.indexOf('await this.activateRecentWebview();'));
  const wda = read(join(peer, 'official-source/wda-v16.1.0/WebDriverAgentLib/Commands/FBSessionCommands.m'));
  assert.match(wda, /if \(!isAppRunning \|\| \(isAppRunning && forceAppLaunch\)\)/);
  assert.match(wda, /if \(nil != initialUrl\) \{\s+if \(app.running\) \{\s+\[app terminate\];/);
  assert.match(wda, /openDeepLink:initialUrl/);
  const context = read(join(peer, 'official-source/xcuitest-v12.1.3/lib/commands/context.ts'));
  assert.match(context, /DEFAULT_REMOTE_DEBUGGER_CONNECT_TIMEOUT_MS = 5000/);
  assert.match(context, /DEFAULT_LIST_WEB_FRAMES_RETRIES = 20/);
});

const receipt = { status: 'passed', reviewType: 'independent source/HTTP/VM fixture; no Appium or Safari execution',
  checkedAt: new Date().toISOString(), source: pin(sourcePath), candidate: pin(candidatePath), patch: pin(join(peer, 'candidate.patch')),
  checks, count: checks.length, remoteMutations: 0, ciStarts: 0, browserRuns: 0, qualityComparisons: 0, validBlind: 0, units: 0,
  fixedState: { criteria: 71, all19: 'not measured', continuous: true, start: '2026-09-13T20:56:49+09:00', deadline: '2026-09-20T20:56:49+09:00' } };
writeFileSync(join(out, 'independent-verification.json'), JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ status: receipt.status, count: checks.length, candidate: receipt.candidate }));
