#!/usr/bin/env node

/**
 * Own the Appium/video lifecycle for the Mobile Safari CI gate and permit one
 * fresh-session retry for one observed infrastructure failure: WDA compiled,
 * but never started listening before Appium's 180 second startup deadline.
 *
 * Product failures and any failure after a WebDriver session exists are never
 * retried. The first attempt keeps the historical root artifact layout. Only
 * when the exact classifier accepts it is that evidence moved to attempt-1 and
 * a second full harness run written at the root.
 */

import { spawn, spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import { request as httpRequest } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = resolve(ROOT, 'test-results/ios-safari');
const APPIUM_URL = new URL('http://127.0.0.1:4723/');
const APPIUM_STATUS_URL = new URL('status', APPIUM_URL);
const MAX_ATTEMPTS = 2;
const APPIUM_READY_TIMEOUT_MS = 60000;
const PROCESS_STOP_TIMEOUT_MS = 10000;
const RETRY_REASON = 'exact-pre-session-wda-never-listened';
const REPORT_TARGET = 'iPhone SE (3rd generation) iOS Simulator / Mobile Safari / landscape';

const WDA_FAILURE_LINE = 'Error: WebDriver POST session: Unable to start WebDriverAgent session. Original error: Could not proxy command to the remote server. Original error: connect ECONNREFUSED 127.0.0.1:8100';

const REQUIRED_APPIUM_MARKERS = [
  '** TEST BUILD SUCCEEDED **',
  'Waiting up to 180000ms',
  '180000ms timeout',
  "Event 'wdaStartFailed'",
  "Event 'wdaSessionFailed'",
  'connect ECONNREFUSED 127.0.0.1:8100',
  'POST /session 500',
];

const FORBIDDEN_APPIUM_MARKERS = [
  "Event 'wdaSessionStarted'",
  "Event 'wdaStarted'",
  'New XCUITestDriver session created successfully',
  "Cached the protocol value 'W3C' for the new session",
  'Responding to client with driver.createSession() result:',
  'POST /session 200',
  '[Default] Running tests...',
  'ServerURLHere->',
  'WebDriverAgent is ready to accept commands',
];

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const isEmptyArray = (value) => Array.isArray(value) && value.length === 0;
const isEmptyObject = (value) => Boolean(value)
  && typeof value === 'object'
  && !Array.isArray(value)
  && Object.keys(value).length === 0;

function hasExactKeys(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

/**
 * Fail closed unless both the report and Appium log prove that no product or
 * session-level work began. The returned reasons are artifact telemetry, not a
 * fuzzy score: every reason must be absent before a retry is allowed.
 */
export function classifyExactPreSessionWdaFailure(report, appiumLog) {
  const reasons = [];
  const reject = (condition, reason) => {
    if (condition) reasons.push(reason);
  };

  reject(!report || typeof report !== 'object' || Array.isArray(report), 'report is not an object');
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    return { matched: false, reasons };
  }

  reject(!hasExactKeys(report, [
    'schemaVersion', 'checkedAt', 'target', 'checks', 'device',
    'coordinateCalibration', 'coordinateCalibrationStages',
    'coordinateCalibrationAttempts', 'coordinateCalibrationEvents',
    'orientationTransitions', 'nativeSafariEducation', 'layout', 'interaction',
    'persistence', 'soak', 'screenshots', 'runtimeErrorCapture', 'errors',
    'diagnostics', 'failures', 'status', 'baseUrl',
  ]), 'report telemetry shape changed');
  reject(report.schemaVersion !== 1, 'report schema is not 1');
  reject(report.target !== REPORT_TARGET, 'report target changed');
  reject(report.status !== 'failed', 'report status is not failed');
  reject(!isEmptyArray(report.checks), 'a harness check was recorded');
  reject(report.device !== null, 'device evidence was recorded');
  reject(!isEmptyArray(report.coordinateCalibration), 'coordinate calibration began');
  reject(!isEmptyArray(report.coordinateCalibrationStages), 'coordinate calibration stage began');
  reject(!isEmptyArray(report.coordinateCalibrationAttempts), 'coordinate calibration attempt began');
  reject(!isEmptyArray(report.coordinateCalibrationEvents), 'coordinate calibration event was recorded');
  reject(!isEmptyArray(report.orientationTransitions), 'orientation work began');
  reject(report.layout !== null, 'layout work began');
  reject(!isEmptyObject(report.interaction), 'interaction work began');
  reject(report.persistence !== null, 'persistence work began');
  reject(report.soak !== null, 'soak work began');
  reject(!isEmptyObject(report.screenshots), 'a harness screenshot was recorded');
  reject(!isEmptyArray(report.errors), 'a runtime error was recorded');
  reject(typeof report.baseUrl !== 'string' || report.baseUrl.length === 0,
    'the pre-session base URL was not recorded');

  const educationKeys = [
    'checked', 'present', 'dismissed', 'markers', 'closeCandidates', 'buttonCount',
    'selectedButton', 'maxActuations', 'actuationsStarted', 'fallbackAuthorized',
    'dismissalAttempts', 'contextRestoration', 'nativeSource', 'screenshot',
  ];
  const education = report.nativeSafariEducation;
  reject(!hasExactKeys(education, educationKeys), 'Safari education telemetry shape changed');
  if (hasExactKeys(education, educationKeys)) {
    reject(education.checked !== false, 'Safari education work began');
    reject(education.present !== null || education.dismissed !== null,
      'Safari education presence was observed');
    reject(!isEmptyArray(education.markers) || !isEmptyArray(education.closeCandidates),
      'Safari education controls were observed');
    reject(education.buttonCount !== null || education.selectedButton !== null,
      'Safari education button work began');
    reject(education.maxActuations !== 2 || education.actuationsStarted !== 0,
      'Safari education actuation state changed');
    reject(education.fallbackAuthorized !== null || !isEmptyArray(education.dismissalAttempts),
      'Safari education dismissal work began');
    reject(education.contextRestoration !== null || education.nativeSource !== null
      || education.screenshot !== null, 'Safari education native evidence was recorded');
  }

  const diagnostics = report.diagnostics;
  reject(!hasExactKeys(diagnostics, ['pollErrorCount', 'pollErrors', 'cleanupErrors']),
    'diagnostics telemetry shape changed');
  if (hasExactKeys(diagnostics, ['pollErrorCount', 'pollErrors', 'cleanupErrors'])) {
    reject(diagnostics.pollErrorCount !== 0 || !isEmptyArray(diagnostics.pollErrors),
      'harness polling began');
    reject(!isEmptyArray(diagnostics.cleanupErrors), 'session cleanup was attempted');
  }

  reject(!hasExactKeys(report.runtimeErrorCapture, ['stages', 'limitation']),
    'runtime error telemetry shape changed');
  reject(!report.runtimeErrorCapture || !isEmptyArray(report.runtimeErrorCapture.stages),
    'runtime error capture began');
  reject(!Array.isArray(report.failures) || report.failures.length !== 1,
    'report does not contain exactly one failure');
  if (Array.isArray(report.failures) && report.failures.length === 1) {
    const failure = report.failures[0];
    const lines = typeof failure === 'string' ? failure.split('\n') : [];
    reject(lines.length < 2 || lines[0] !== WDA_FAILURE_LINE,
      'failure first line is not the exact WDA ECONNREFUSED session-start error');
    reject(lines.slice(1).some((line) => !line.startsWith('    at ')),
      'failure contains a non-stack suffix');
    reject(!/^    at webdriver \(file:\/\/\/[^\r\n]*\/tools\/test-ios-safari\.mjs:\d+:\d+\)$/.test(lines[1] || ''),
      'failure first frame is not the Mobile Safari webdriver call');
  }

  const log = typeof appiumLog === 'string' ? appiumLog : '';
  for (const marker of REQUIRED_APPIUM_MARKERS) {
    reject(!log.includes(marker), `Appium log is missing ${JSON.stringify(marker)}`);
  }
  for (const marker of FORBIDDEN_APPIUM_MARKERS) {
    reject(log.includes(marker), `Appium log contains session marker ${JSON.stringify(marker)}`);
  }
  reject(/\[HTTP\][^\r\n]*-->\s+[A-Z]+\s+\/session\//.test(log),
    'Appium log contains a command for an established session');

  return { matched: reasons.length === 0, reasons };
}

function statusRequest() {
  return new Promise((resolveRequest) => {
    const request = httpRequest(APPIUM_STATUS_URL, { method: 'GET', timeout: 1000 }, (response) => {
      response.resume();
      response.once('end', () => resolveRequest(response.statusCode === 200));
    });
    request.once('timeout', () => request.destroy());
    request.once('error', () => resolveRequest(false));
    request.end();
  });
}

async function spawnDetached(command, args, logPath) {
  const logFd = openSync(logPath, 'a');
  let child;
  try {
    child = spawn(command, args, {
      cwd: ROOT,
      detached: true,
      env: process.env,
      stdio: ['ignore', logFd, logFd],
    });
  } finally {
    closeSync(logFd);
  }
  await new Promise((resolveSpawn, rejectSpawn) => {
    child.once('spawn', resolveSpawn);
    child.once('error', rejectSpawn);
  });
  if (!Number.isSafeInteger(child.pid) || child.pid <= 1) {
    throw new Error(`${command} did not return a safe process-group id`);
  }
  return { command, child, pid: child.pid };
}

function groupIsAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error.code === 'ESRCH') return false;
    if (error.code === 'EPERM') return true;
    throw error;
  }
}

async function waitForGroupExit(pid, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (groupIsAlive(pid) && Date.now() < deadline) await sleep(100);
  return !groupIsAlive(pid);
}

async function stopExactProcessGroup(handle, firstSignal) {
  if (!handle || !Number.isSafeInteger(handle.pid) || handle.pid <= 1) return;
  if (!groupIsAlive(handle.pid)) return;
  try {
    process.kill(-handle.pid, firstSignal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
  if (await waitForGroupExit(handle.pid, PROCESS_STOP_TIMEOUT_MS)) return;
  try {
    process.kill(-handle.pid, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
  if (!await waitForGroupExit(handle.pid, PROCESS_STOP_TIMEOUT_MS)) {
    throw new Error(`${handle.command} process group ${handle.pid} survived SIGKILL`);
  }
}

async function waitForOwnedAppium(handle) {
  const deadline = Date.now() + APPIUM_READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (handle.child.exitCode !== null || handle.child.signalCode !== null) {
      throw new Error(`owned Appium exited before /status was ready (exit=${handle.child.exitCode}, signal=${handle.child.signalCode})`);
    }
    if (await statusRequest()) return;
    await sleep(1000);
  }
  throw new Error(`owned Appium did not answer ${APPIUM_STATUS_URL} within ${APPIUM_READY_TIMEOUT_MS}ms`);
}

function requireOwnedProcessRunning(handle, label) {
  if (!handle || handle.child.exitCode !== null || handle.child.signalCode !== null
    || !groupIsAlive(handle.pid)) {
    throw new Error(`owned ${label} exited unexpectedly (exit=${handle?.child.exitCode ?? 'unknown'}, signal=${handle?.child.signalCode ?? 'unknown'})`);
  }
}

function runLogged(command, args, logPath, env) {
  return new Promise((resolveRun, rejectRun) => {
    const logFd = openSync(logPath, 'a');
    let closed = false;
    const closeLog = () => {
      if (!closed) {
        closeSync(logFd);
        closed = true;
      }
    };
    const child = spawn(command, args, {
      cwd: ROOT,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk) => {
      process.stdout.write(chunk);
      writeSync(logFd, chunk);
    });
    child.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
      writeSync(logFd, chunk);
    });
    child.once('error', (error) => {
      closeLog();
      rejectRun(error);
    });
    child.once('close', (code, signal) => {
      closeLog();
      resolveRun({ exitCode: Number.isInteger(code) ? code : 1, signal: signal || null });
    });
  });
}

async function runAttempt(number) {
  const startedAt = new Date().toISOString();
  let appium = null;
  let video = null;
  let harness = { exitCode: 1, signal: null };
  let infrastructureError = null;
  const cleanupErrors = [];
  console.log(`[ios-safari-ci] attempt ${number}/${MAX_ATTEMPTS}`);

  try {
    if (await statusRequest()) {
      throw new Error(`refusing to reuse an unowned Appium listener at ${APPIUM_STATUS_URL}`);
    }
    appium = await spawnDetached('appium', [
      '--base-path', '/', '--port', '4723', '--log', join(OUTPUT, 'appium.log'),
    ], join(OUTPUT, 'appium-console.log'));
    writeFileSync(join(OUTPUT, 'appium.pid'), `${appium.pid}\n`);

    video = await spawnDetached('xcrun', [
      'simctl', 'io', process.env.IOS_SIMULATOR_UDID,
      'recordVideo', '--codec=h264', '--force', join(OUTPUT, 'ios-safari.mp4'),
    ], join(OUTPUT, 'video.log'));
    writeFileSync(join(OUTPUT, 'video.pid'), `${video.pid}\n`);

    await waitForOwnedAppium(appium);
    requireOwnedProcessRunning(appium, 'Appium');
    requireOwnedProcessRunning(video, 'simulator recorder');
    harness = await runLogged('npm', ['run', 'test:ios-safari'], join(OUTPUT, 'harness.log'), {
      ...process.env,
      APPIUM_URL: APPIUM_URL.href,
      CINDERLINE_IOS_OUTPUT: OUTPUT,
    });
    requireOwnedProcessRunning(appium, 'Appium');
    requireOwnedProcessRunning(video, 'simulator recorder');
  } catch (error) {
    infrastructureError = error.stack || error.message || String(error);
    console.error(`[ios-safari-ci] attempt ${number} infrastructure error: ${infrastructureError}`);
  } finally {
    try {
      await stopExactProcessGroup(video, 'SIGINT');
    } catch (error) {
      cleanupErrors.push(`video cleanup: ${error.message}`);
    }
    if (video) {
      try {
        const recorded = statSync(join(OUTPUT, 'ios-safari.mp4'));
        if (!recorded.isFile() || recorded.size === 0) {
          throw new Error('recorded MP4 is empty');
        }
      } catch (error) {
        cleanupErrors.push(`video evidence: ${error.message}`);
      }
    }
    try {
      await stopExactProcessGroup(appium, 'SIGTERM');
    } catch (error) {
      cleanupErrors.push(`Appium cleanup: ${error.message}`);
    }
  }

  const exitCode = infrastructureError || cleanupErrors.length ? 1 : harness.exitCode;
  return {
    attempt: number,
    startedAt,
    completedAt: new Date().toISOString(),
    exitCode,
    harnessExitCode: harness.exitCode,
    harnessSignal: harness.signal,
    infrastructureError,
    cleanupErrors,
    output: '.',
  };
}

function classifyAttempt() {
  let report = null;
  let reportReadError = null;
  let appiumLog = '';
  try {
    report = JSON.parse(readFileSync(join(OUTPUT, 'report.json'), 'utf8'));
  } catch (error) {
    reportReadError = error.message;
  }
  try {
    appiumLog = readFileSync(join(OUTPUT, 'appium.log'), 'utf8');
  } catch {
    // A missing log is rejected by every required marker below.
  }
  const classification = classifyExactPreSessionWdaFailure(report, appiumLog);
  if (reportReadError) classification.reasons.unshift(`report read failed: ${reportReadError}`);
  classification.matched = classification.reasons.length === 0;
  return classification;
}

function writeAttempts(metadata) {
  writeFileSync(join(OUTPUT, 'ci-attempts.json'), `${JSON.stringify(metadata, null, 2)}\n`);
}

function archiveFirstAttempt() {
  const entries = readdirSync(OUTPUT);
  const destination = join(OUTPUT, 'attempt-1');
  if (entries.includes('attempt-1')) throw new Error('refusing to overwrite existing attempt-1 evidence');
  mkdirSync(destination);
  for (const entry of entries) {
    if (entry === 'ci-attempts.json') continue;
    renameSync(join(OUTPUT, entry), join(destination, entry));
  }
}

function runChecked(label, args, timeout) {
  console.log(`[ios-safari-ci] ${label}`);
  const result = spawnSync('xcrun', args, {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
    timeout,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit ${result.status} signal ${result.signal || 'none'}`);
  }
}

function rebootExactSimulator() {
  const udid = process.env.IOS_SIMULATOR_UDID;
  runChecked('shut down retry simulator', ['simctl', 'shutdown', udid], 60000);
  runChecked('boot retry simulator', ['simctl', 'boot', udid], 60000);
  runChecked('wait for retry simulator boot', ['simctl', 'bootstatus', udid, '-b'], 300000);
}

function baseMetadata() {
  return {
    schemaVersion: 1,
    maxAttempts: MAX_ATTEMPTS,
    retryReason: null,
    retried: false,
    finalAttempt: null,
    status: 'running',
    recoveryError: null,
    attempts: [],
  };
}

async function runCi() {
  if (!process.env.IOS_SIMULATOR_UDID) throw new Error('IOS_SIMULATOR_UDID is required');
  if (!process.env.IOS_SIMULATOR_PLATFORM_VERSION) {
    throw new Error('IOS_SIMULATOR_PLATFORM_VERSION is required');
  }
  mkdirSync(OUTPUT, { recursive: true });
  const existing = readdirSync(OUTPUT);
  if (existing.length) {
    throw new Error(`refusing to mix Mobile Safari evidence into non-empty ${OUTPUT}: ${existing.join(', ')}`);
  }

  const metadata = baseMetadata();
  const first = await runAttempt(1);
  metadata.attempts.push(first);
  metadata.finalAttempt = 1;
  if (first.exitCode === 0) {
    metadata.status = 'passed';
    writeAttempts(metadata);
    return 0;
  }

  first.recoveryClassifier = classifyAttempt();
  if (first.infrastructureError !== null) {
    first.recoveryClassifier.reasons.unshift('attempt lifecycle failed outside the harness');
  }
  if (first.harnessSignal !== null) {
    first.recoveryClassifier.reasons.unshift('attempt harness ended by signal');
  }
  if (first.cleanupErrors.length !== 0) {
    first.recoveryClassifier.reasons.unshift('attempt process cleanup was not clean');
  }
  first.recoveryClassifier.matched = first.recoveryClassifier.reasons.length === 0;
  if (!first.recoveryClassifier.matched) {
    metadata.status = 'failed';
    writeAttempts(metadata);
    console.error(`[ios-safari-ci] retry denied: ${first.recoveryClassifier.reasons.join('; ')}`);
    return first.exitCode;
  }

  console.log('[ios-safari-ci] exact pre-session WDA failure accepted; preparing the only retry');
  try {
    rebootExactSimulator();
  } catch (error) {
    metadata.status = 'failed';
    metadata.recoveryError = error.stack || error.message || String(error);
    writeAttempts(metadata);
    console.error(`[ios-safari-ci] simulator recovery failed: ${metadata.recoveryError}`);
    return 1;
  }

  archiveFirstAttempt();
  first.output = 'attempt-1';
  metadata.retried = true;
  metadata.retryReason = RETRY_REASON;
  writeAttempts(metadata);
  const second = await runAttempt(2);
  metadata.attempts.push(second);
  metadata.finalAttempt = 2;
  if (second.exitCode !== 0) second.recoveryClassifier = classifyAttempt();
  metadata.status = second.exitCode === 0 ? 'passed' : 'failed';
  writeAttempts(metadata);
  return second.exitCode;
}

function fixtureReport() {
  return {
    schemaVersion: 1,
    checkedAt: '2026-08-13T00:00:00.000Z',
    target: REPORT_TARGET,
    checks: [],
    device: null,
    coordinateCalibration: [],
    coordinateCalibrationStages: [],
    coordinateCalibrationAttempts: [],
    coordinateCalibrationEvents: [],
    orientationTransitions: [],
    nativeSafariEducation: {
      checked: false,
      present: null,
      dismissed: null,
      markers: [],
      closeCandidates: [],
      buttonCount: null,
      selectedButton: null,
      maxActuations: 2,
      actuationsStarted: 0,
      fallbackAuthorized: null,
      dismissalAttempts: [],
      contextRestoration: null,
      nativeSource: null,
      screenshot: null,
    },
    layout: null,
    interaction: {},
    persistence: null,
    soak: null,
    screenshots: {},
    runtimeErrorCapture: { stages: [], limitation: 'fixture' },
    errors: [],
    diagnostics: { pollErrorCount: 0, pollErrors: [], cleanupErrors: [] },
    failures: [`${WDA_FAILURE_LINE}\n    at webdriver (file:///repo/tools/test-ios-safari.mjs:190:11)\n    at async file:///repo/tools/test-ios-safari.mjs:999:7`],
    status: 'failed',
    baseUrl: 'http://127.0.0.1:49152/',
  };
}

function fixtureLog() {
  return [
    '[Xcode] ** TEST BUILD SUCCEEDED **',
    '[XCUITestDriver] Waiting up to 180000ms until WebDriverAgent is ready',
    '[XCUITestDriver] WebDriverAgent server was not ready after 180000ms timeout',
    "[BaseDriver] Event 'wdaStartFailed' logged",
    "[BaseDriver] Event 'wdaSessionFailed' logged",
    '[XCUITestDriver] connect ECONNREFUSED 127.0.0.1:8100',
    '[HTTP] <-- POST /session 500 438740 ms',
  ].join('\n');
}

function workflowJob(source, name) {
  const lines = source.split(/\r?\n/);
  const start = lines.findIndex((line) => line === `  ${name}:`);
  if (start < 0) throw new Error(`workflow job ${name} is missing`);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^  [A-Za-z0-9_-]+:\s*$/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

function runnerStep(job) {
  const lines = job.split('\n');
  const run = lines.findIndex((line) => line.trim() === 'run: node tools/run-ios-safari-ci.mjs');
  if (run < 0) throw new Error('bounded Mobile Safari runner step is missing');
  let start = run;
  while (start >= 0 && !/^      - name:/.test(lines[start])) start -= 1;
  if (start < 0) throw new Error('bounded Mobile Safari runner has no named step');
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^      - (?:name:|uses:)/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

function validateWorkflowContract() {
  const workflows = [
    ['gates.yml', 50],
    ['pages.yml', 45],
  ].map(([name, timeout]) => {
    const source = readFileSync(join(ROOT, '.github/workflows', name), 'utf8');
    return { name, timeout, job: workflowJob(source, 'ios-safari') };
  });

  const steps = [];
  for (const { name, timeout, job } of workflows) {
    const invocations = job.match(/run: node tools\/run-ios-safari-ci\.mjs/g) || [];
    if (invocations.length !== 1) throw new Error(`${name} must invoke the CI runner exactly once`);
    if (!job.includes(`timeout-minutes: ${timeout}`)) {
      throw new Error(`${name} Mobile Safari timeout must remain ${timeout} minutes`);
    }
    const boot = job.indexOf('xcrun simctl bootstatus "$udid" -b');
    const runner = job.indexOf('run: node tools/run-ios-safari-ci.mjs');
    if (boot < 0 || runner < 0 || boot >= runner) {
      throw new Error(`${name} must finish the selected simulator boot before the CI runner`);
    }
    for (const legacy of ['appium --base-path /', 'recordVideo --codec=h264', 'npm run test:ios-safari']) {
      if (job.includes(legacy)) throw new Error(`${name} still owns legacy lifecycle command ${legacy}`);
    }
    if (!job.includes('IOS_SIMULATOR_UDID: ${{ steps.simulator.outputs.udid }}')
      || !job.includes('IOS_SIMULATOR_PLATFORM_VERSION: ${{ steps.simulator.outputs.platform_version }}')) {
      throw new Error(`${name} runner must receive the exact selected simulator outputs`);
    }
    if (!job.includes('if: always()') || !job.includes('path: test-results/ios-safari')) {
      throw new Error(`${name} must always preserve the complete root Safari artifact`);
    }
    steps.push(runnerStep(job));
  }
  if (steps[0] !== steps[1]) throw new Error('PR and Pages must use the identical Mobile Safari runner step');

  const f3 = readFileSync(join(ROOT, 'tools/gates/f3_execution.mjs'), 'utf8');
  const f3Calls = f3.match(/\['iOS CI recovery', \['node', 'tools\/run-ios-safari-ci\.mjs', '--self-test'\]\]/g) || [];
  if (f3Calls.length !== 1) throw new Error('F3 must execute the iOS CI recovery self-test exactly once');
  if (MAX_ATTEMPTS !== 2) throw new Error('Mobile Safari CI recovery must remain bounded to two attempts');
  const runnerSource = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  validateBoundedRecoverySource(runnerSource);
}

export function validateBoundedRecoverySource(runnerSource) {
  const runtimeEnd = runnerSource.indexOf('\nfunction fixtureReport()');
  if (runtimeEnd < 0) throw new Error('Mobile Safari recovery runtime boundary is missing');
  const runtimeSource = runnerSource.slice(0, runtimeEnd);
  const exactChildProcessImports = runtimeSource.match(
    /^import \{ spawn, spawnSync \} from 'node:child_process';$/gm,
  ) || [];
  if (exactChildProcessImports.length !== 1
    || (runtimeSource.match(/node:child_process/g) || []).length !== 1) {
    throw new Error('Mobile Safari recovery must use only the reviewed spawn/spawnSync import');
  }
  for (const [identifier, expected] of [
    ['runAttempt', 3],
    ['runLogged', 2],
    ['rebootExactSimulator', 2],
    ['spawn', 4],
    ['spawnSync', 2],
  ]) {
    const occurrences = runtimeSource.match(new RegExp(`\\b${identifier}\\b`, 'g')) || [];
    if (occurrences.length !== expected) {
      throw new Error(`Mobile Safari recovery raw ${identifier} occurrence count changed`);
    }
  }
  const runAttemptCalls = runtimeSource.match(
    /\brunAttempt\s*\(/g,
  ) || [];
  if (runAttemptCalls.length !== 3) {
    throw new Error('Mobile Safari recovery must contain only its definition, attempt 1 and attempt 2');
  }
  const runLoggedCalls = runtimeSource.match(/\brunLogged\s*\(/g) || [];
  if (runLoggedCalls.length !== 2) {
    throw new Error('Mobile Safari recovery must contain one harness invocation');
  }
  const exactHarnessCalls = runtimeSource.match(
    /harness = await runLogged\('npm', \['run', 'test:ios-safari'\], join\(OUTPUT, 'harness\.log'\), \{/g,
  ) || [];
  if (exactHarnessCalls.length !== 1) {
    throw new Error('Mobile Safari recovery must invoke exactly the full npm harness once per attempt');
  }
  const rebootCalls = runtimeSource.match(/\brebootExactSimulator\s*\(/g) || [];
  if (rebootCalls.length !== 2) {
    throw new Error('Mobile Safari recovery must contain one exact-simulator reboot');
  }
  const archiveCalls = runtimeSource.match(/\barchiveFirstAttempt\s*\(/g) || [];
  if (archiveCalls.length !== 2) {
    throw new Error('Mobile Safari recovery must contain one first-attempt archive');
  }
  const firstAttempt = runtimeSource.indexOf('const first = await runAttempt(1);');
  const infrastructureGuardBlock = `if (first.infrastructureError !== null) {
    first.recoveryClassifier.reasons.unshift('attempt lifecycle failed outside the harness');
  }`;
  const signalGuardBlock = `if (first.harnessSignal !== null) {
    first.recoveryClassifier.reasons.unshift('attempt harness ended by signal');
  }`;
  const cleanupGuardBlock = `if (first.cleanupErrors.length !== 0) {
    first.recoveryClassifier.reasons.unshift('attempt process cleanup was not clean');
  }`;
  const infrastructureGuard = runtimeSource.indexOf(infrastructureGuardBlock);
  const signalGuard = runtimeSource.indexOf(signalGuardBlock);
  const cleanupGuard = runtimeSource.indexOf(cleanupGuardBlock);
  const classifierGate = runtimeSource.indexOf('if (!first.recoveryClassifier.matched) {');
  const classifierRecalculation = runtimeSource.indexOf(
    'first.recoveryClassifier.matched = first.recoveryClassifier.reasons.length === 0;',
  );
  const reboot = runtimeSource.indexOf('rebootExactSimulator();');
  const archive = runtimeSource.indexOf('archiveFirstAttempt();');
  const secondAttempt = runtimeSource.indexOf('const second = await runAttempt(2);');
  if (firstAttempt < 0 || infrastructureGuard < 0 || signalGuard < 0 || cleanupGuard < 0
    || classifierRecalculation < 0 || classifierGate < 0 || archive < 0
    || reboot < 0 || secondAttempt < 0
    || firstAttempt >= infrastructureGuard || infrastructureGuard >= signalGuard
    || signalGuard >= cleanupGuard
    || cleanupGuard >= classifierRecalculation || classifierRecalculation >= classifierGate
    || classifierGate >= reboot || reboot >= archive || archive >= secondAttempt) {
    throw new Error('Mobile Safari recovery guards and two attempts are not in strict order');
  }
  if (runtimeSource.slice(secondAttempt + 'const second = await runAttempt(2);'.length)
    .match(/\brunAttempt\s*\(/)) {
    throw new Error('Mobile Safari recovery must not run another attempt after attempt 2');
  }
  if (/spawn(?:Sync)?\(\s*['"](?:pkill|killall)['"]/.test(runnerSource)) {
    throw new Error('Mobile Safari cleanup must never use a broad process kill');
  }
  if (!runnerSource.includes("process.kill(-handle.pid, firstSignal)")
    || !runnerSource.includes("process.kill(-handle.pid, 'SIGKILL')")) {
    throw new Error('Mobile Safari cleanup must target only runner-owned process groups');
  }
}

function selfTest() {
  const failures = [];
  let total = 0;
  let passed = 0;
  const pass = (name, fn) => {
    total += 1;
    try {
      fn();
      passed += 1;
      console.log(`PASS ${name}`);
    } catch (error) {
      failures.push(`${name}: ${error.message}`);
      console.error(`FAIL ${name}: ${error.message}`);
    }
  };
  const reject = (name, mutateReport, mutateLog = (log) => log) => pass(name, () => {
    const report = fixtureReport();
    mutateReport(report);
    const result = classifyExactPreSessionWdaFailure(report, mutateLog(fixtureLog()));
    if (result.matched) throw new Error('unsafe evidence was accepted');
  });

  pass('exact WDA-never-listened evidence is accepted', () => {
    const result = classifyExactPreSessionWdaFailure(fixtureReport(), fixtureLog());
    if (!result.matched) throw new Error(result.reasons.join('; '));
  });
  pass('stack path after the exact failure prefix may vary', () => {
    const report = fixtureReport();
    report.failures[0] = `${WDA_FAILURE_LINE}\n    at webdriver (file:///Users/runner/work/survival/tools/test-ios-safari.mjs:999:7)\n    at process.processTicksAndRejections (node:internal/process/task_queues:103:5)`;
    const result = classifyExactPreSessionWdaFailure(report, fixtureLog());
    if (!result.matched) throw new Error(result.reasons.join('; '));
  });
  reject('a recorded check is rejected', (report) => report.checks.push({ name: 'began' }));
  reject('an orientation transition is rejected', (report) => report.orientationTransitions.push({ stage: 'initial' }));
  reject('a cleanup error is rejected', (report) => report.diagnostics.cleanupErrors.push('delete failed'));
  reject('a different failure is rejected', (report) => { report.failures[0] = 'Error: other'; });
  reject('a near-match WDA failure line is rejected', (report) => {
    report.failures[0] = report.failures[0].replace('8100\n', '8101\n');
  });
  reject('a non-stack failure suffix is rejected', (report) => {
    report.failures[0] += '\nadditional diagnostic text';
  });
  reject('multiple failures are rejected', (report) => report.failures.push('second'));
  reject('malformed report is rejected', (report) => {
    delete report.nativeSafariEducation;
  });
  pass('null report is rejected', () => {
    if (classifyExactPreSessionWdaFailure(null, fixtureLog()).matched) {
      throw new Error('null report was accepted');
    }
  });
  reject('missing TEST BUILD evidence is rejected', () => {},
    (log) => log.replace('** TEST BUILD SUCCEEDED **', 'TEST BUILD absent'));
  reject('successful WDA session event is rejected', () => {},
    (log) => `${log}\n[BaseDriver] Event 'wdaSessionStarted' logged`);
  reject('successful createSession response is rejected', () => {},
    (log) => `${log}\n[HTTP] <-- POST /session 200`);
  reject('cached W3C protocol proves a session and is rejected', () => {},
    (log) => `${log}\n[XCUITestDriver] Cached the protocol value 'W3C' for the new session`);
  reject('createSession result proves a session and is rejected', () => {},
    (log) => `${log}\n[AppiumDriver] Responding to client with driver.createSession() result: {}`);
  reject('WDA test execution is rejected', () => {},
    (log) => `${log}\n[Default] Running tests...`);
  reject('WDA listener URL is rejected', () => {},
    (log) => `${log}\nServerURLHere->http://127.0.0.1:8100<-ServerURLHere`);
  reject('any established-session command is rejected', () => {},
    (log) => `${log}\n[HTTP] --> GET /session/abc/orientation`);
  pass('workflow and process ownership contracts are static', validateWorkflowContract);
  pass('an extra third attempt is statically rejected', () => {
    const source = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const mutated = source.replace('\nfunction fixtureReport()',
      '\nvoid runAttempt  (3);\n\nfunction fixtureReport()');
    try {
      validateBoundedRecoverySource(mutated);
    } catch {
      return;
    }
    throw new Error('extra third attempt was accepted');
  });
  pass('an indirect third attempt is statically rejected', () => {
    const source = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const mutated = source.replace('\nfunction fixtureReport()',
      '\nvoid (0, runAttempt)(3);\n\nfunction fixtureReport()');
    try {
      validateBoundedRecoverySource(mutated);
    } catch {
      return;
    }
    throw new Error('indirect third attempt was accepted');
  });
  pass('a direct unowned harness spawn is statically rejected', () => {
    const source = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const mutated = source.replace('\nfunction fixtureReport()',
      "\nvoid spawn('npm', ['run', 'test:ios-safari']);\n\nfunction fixtureReport()");
    try {
      validateBoundedRecoverySource(mutated);
    } catch {
      return;
    }
    throw new Error('direct unowned harness spawn was accepted');
  });
  pass('an indirect extra simulator reboot is statically rejected', () => {
    const source = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const mutated = source.replace('\nfunction fixtureReport()',
      '\nvoid (0, rebootExactSimulator)();\n\nfunction fixtureReport()');
    try {
      validateBoundedRecoverySource(mutated);
    } catch {
      return;
    }
    throw new Error('indirect extra simulator reboot was accepted');
  });
  pass('cleanup guard removal is statically rejected', () => {
    const source = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const mutated = source.replace('if (first.cleanupErrors.length !== 0) {', 'if (false) {');
    try {
      validateBoundedRecoverySource(mutated);
    } catch {
      return;
    }
    throw new Error('missing cleanup guard was accepted');
  });
  pass('harness signal guard removal is statically rejected', () => {
    const source = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const mutated = source.replace('if (first.harnessSignal !== null) {', 'if (false) {');
    try {
      validateBoundedRecoverySource(mutated);
    } catch {
      return;
    }
    throw new Error('missing harness signal guard was accepted');
  });

  if (failures.length) {
    console.error(`\niOS CI recovery self-test FAILED (${passed}/${total}; ${failures.length} failed)`);
    for (const failure of failures) console.error(`- ${failure}`);
    return 1;
  }
  console.log(`\niOS CI recovery self-test: ${passed}/${total}`);
  return 0;
}

if (process.argv.includes('--self-test')) {
  process.exitCode = selfTest();
} else {
  runCi().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    console.error(`[ios-safari-ci] fatal: ${error.stack || error.message || String(error)}`);
    if (existsSync(OUTPUT)) {
      try {
        writeFileSync(join(OUTPUT, 'ci-runner-error.log'), `${error.stack || error.message || String(error)}\n`);
      } catch {
        // Preserve the original fatal error when even artifact writing fails.
      }
    }
    process.exitCode = 1;
  });
}
