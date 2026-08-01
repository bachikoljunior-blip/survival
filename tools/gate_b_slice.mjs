#!/usr/bin/env node
/**
 * Gate B Chapter 1 representative-slice runner.
 *
 * This deliberately does not claim a complete opening-to-ending route. It runs
 * the smallest repeatable slice that can falsify movement, breathing and combat
 * integration, twice in fresh mobile-sized browser contexts.
 */
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseYaml } from './lib/yaml.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST = join(ROOT, 'dist');
const RUNNER_PATH = fileURLToPath(import.meta.url);
const ENGINE_PATH = join(ROOT, 'src', 'core', 'engine.js');
const DRIVER_PATH = join(ROOT, 'tools', 'gate_b_driver.js');
const DIAGNOSTIC_DIR = join(ROOT, 'shots');
const EVIDENCE_DIR = join(ROOT, 'AI_DEVELOPMENT', 'EVIDENCE');
const EVIDENCE_PATH = join(EVIDENCE_DIR, 'GB-IMP06-SLICE.json');
const DRIVER = readFileSync(DRIVER_PATH, 'utf8');
const EXPECTED_DRIVER_SHA256 = '60147238dca48d828d485e8830ed7fd05c1eec58633a9dc1f54db3f6205d9b98';
const FORCE_FAILURE = process.argv.includes('--force-failure');
const adversarialArg = process.argv.find((arg) => arg.startsWith('--adversarial='));
const ADVERSARIAL = adversarialArg ? adversarialArg.slice('--adversarial='.length) : null;
const ADVERSARIAL_MODES = new Set([
  'placement-alias',
  'precombat-hp',
  'combat-resolver',
  'attack-definition-reentry',
  'attack-definition-poise-reentry',
  'attack-definition-reach-reentry',
  'attack-definition-arc-reentry',
  'attack-state-reentry',
  'attack-state-active-reentry',
  'attack-hitset-reentry',
  'attack-hitset-prototype-reentry',
  'combat-event-hp-reentry',
  'nested-damage-reentry',
  'death-state-reentry',
  'kill-event-reentry',
  'updater-registration',
  'updater-list-direct',
  'updater-list-computed',
]);
const RUN_ID = `GB-IMP06-SLICE-${Date.now()}-${process.pid}`;

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const hashFile = (path) => existsSync(path) ? sha256(readFileSync(path)) : null;
const atomicWriteJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, JSON.stringify(value, null, 2));
  renameSync(temporary, path);
};

// Protocol 2.0.0: the canonical revision moved from PROJECT_STATE.json to STATE.yaml.
// Evidence stays bound to it so a report cannot silently outlive the state it was produced under.
const stateRevision = parseYaml(readFileSync(join(ROOT, 'AI_DEVELOPMENT', 'STATE.yaml'), 'utf8')).state_revision;
const indexPath = join(DIST, 'index.html');
const indexText = existsSync(indexPath) ? readFileSync(indexPath, 'utf8') : '';
const bundleName = indexText.match(/<script[^>]+src=["'](?:\.\/)?([^"']+\.js)["']/)?.[1] || null;
const bundlePath = bundleName ? join(DIST, bundleName) : null;
const bindings = {
  state_revision: stateRevision,
  sha256: {
    engine: hashFile(ENGINE_PATH),
    driver: hashFile(DRIVER_PATH),
    runner: hashFile(RUNNER_PATH),
    built_bundle: bundlePath ? hashFile(bundlePath) : null,
  },
};

const forbidden = [
  ['placement-helper access', /\b(?:placeAt|teleport)\b/],
  ['position-vector mutator', /\.pos\s*\.\s*(?:set|copy|add|sub|lerp|multiply|setX|setY|setZ|addScaledVector)\s*\(/],
  ['position-component assignment', /\.pos\s*\.\s*(?:x|y|z)\s*(?:=(?!=)|[+\-*/]=|\+\+|--)/],
  ['bracket position mutation', /\[\s*['"]pos['"]\s*\](?:\s*\[\s*['"](?:x|y|z|set|copy|add|sub)['"]\s*\])?/],
  ['actor-health assignment', /(?:\.hp|\[\s*['"]hp['"]\s*\])\s*(?:=(?!=)|[+\-*/]=|\+\+|--)/],
  ['lung-state mutation', /\.lungs(?:\s*\.\s*\w+|\s*\[\s*['"]\w+['"]\s*\])\s*(?:=(?!=)|[+\-*/]=|\+\+|--)/],
  ['gas-immunity assignment', /(?:\.gasImmune|\[\s*['"]gasImmune['"]\s*\])\s*(?:=(?!=)|[+\-*/]=|\+\+|--)/],
  ['direct damage-method access', /(?:\.damage\b|\[\s*['"]damage['"]\s*\])/],
  ['direct kill-method access', /(?:\.kill\b|\[\s*['"]kill['"]\s*\])/],
  ['direct combat-system access', /\bG\s*\.\s*combat\b/],
  ['dynamic game-property access', /\bG\s*\[/],
  ['engine-updater access', /(?:\.addUpdater\b|\[\s*['"]addUpdater['"]\s*\]|\._updaters\b|\[\s*['"]_updaters['"]\s*\])/],
  ['direct progression mutation', /\bG\s*\.\s*state\s*\.\s*(?:set|bump|unlock|choose|addItem|removeItem|addJournal|reset|deserialise)\b/],
  ['manufactured kill event', /emit\s*\(\s*['"]kill['"]/],
];
const scanSource = (source) => forbidden.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);
const sourceViolations = scanSource(DRIVER);
const policyFixtures = [
  ['aliased placement', 'const fn = P.placeAt; fn.call(P, 0, 0, 0);'],
  ['bracket placement', "P['placeAt'](0, 0, 0);"],
  ['vector position write', 'P.pos.set(0, 0, 0);'],
  ['component position write', 'P.pos.x += 1;'],
  ['direct hostile health write', 'raid.group[0].hp = 30;'],
  ['direct lung write', 'P.lungs.sat = 0;'],
  ['direct progression write', "G.state.set('ch1_raid_done');"],
  ['aliased damage', "const hit = enemy['damage']; hit.call(enemy, payload);"],
  ['aliased kill', 'const end = enemy.kill.bind(enemy); end();'],
  ['manufactured kill event', "G.emit('kill', { attacker: P, target: enemy });"],
  ['computed combat alias', "const system = G[['com', 'bat'].join('')];"],
  ['engine updater registration', 'G.engine.addUpdater(() => {}, 9000);'],
  ['computed combat-updater reproduction',
    "G.engine.addUpdater(() => G[['com', 'bat'].join('')][['_apply', 'Hit'].join('')](), 9000);"],
];
const policySelfTests = policyFixtures.map(([name, source]) => ({ name, rejected: scanSource(source).length > 0 }));
const policyMisses = policySelfTests.filter((fixture) => !fixture.rejected).map((fixture) => fixture.name);
const preflightErrors = [];
if (hashFile(DRIVER_PATH) !== EXPECTED_DRIVER_SHA256) {
  preflightErrors.push('evaluated driver hash does not match the reviewed contract');
}
if (sourceViolations.length) preflightErrors.push(`driver source rejected: ${sourceViolations.join(', ')}`);
if (policyMisses.length) preflightErrors.push(`source-policy fixtures escaped: ${policyMisses.join(', ')}`);
if (ADVERSARIAL && !ADVERSARIAL_MODES.has(ADVERSARIAL)) {
  preflightErrors.push(`unknown adversarial mode: ${ADVERSARIAL}`);
}
if (!existsSync(indexPath) || !bundlePath || !existsSync(bundlePath)) {
  preflightErrors.push('development build is missing or index.html has no local bundle');
}

const evidenceBase = {
  schema_version: 2,
  task_id: 'GB-IMP06-SLICE',
  run_id: RUN_ID,
  generated_at: new Date().toISOString(),
  scope: 'Partial Gate B Chapter 1 representative slice only; does not satisfy B1, B2, C1, D3 or measure full playtime.',
  bindings,
  environment: {
    browser: 'Playwright Chromium with SwiftShader',
    viewport: '667x375 mobile emulation',
    real_device: false,
    repetitions: 2,
  },
  adversarial_probe: ADVERSARIAL,
  source_guard: {
    passed: hashFile(DRIVER_PATH) === EXPECTED_DRIVER_SHA256 &&
      sourceViolations.length === 0 && policyMisses.length === 0,
    expected_driver_sha256: EXPECTED_DRIVER_SHA256,
    forbidden: forbidden.map(([name]) => name),
    adversarial_fixtures: policySelfTests,
  },
};

// Invalidate the last result before any browser work. If this process is
// interrupted, the authoritative evidence remains non-passing instead of
// silently preserving an older green run.
atomicWriteJson(EVIDENCE_PATH, {
  ...evidenceBase,
  status: preflightErrors.length ? 'failed' : 'running',
  passed: false,
  repeatable: false,
  results: [],
  browserErrors: [],
  preflightErrors,
});
if (preflightErrors.length) {
  console.error(`Gate B preflight failed: ${preflightErrors.join('; ')}`);
  process.exit(1);
}

function installIntegrityAudit(options = {}) {
  const C = window.CINDERLINE;
  const G = C.game;
  const P = G.player;
  const audit = {
    violations: [],
    raidIds: [],
    raidInitialActors: [],
    raidInitialFullHealth: false,
    playerAttackStarts: 0,
    normalDamageTransitions: 0,
    provenDeaths: [],
    blockedAttempts: [],
    engineFixedSteps: 0,
    gameFixedUpdates: 0,
    combatUpdates: 0,
    authenticatedAttackStarts: 0,
    arcResolutions: 0,
    hitResolverCalls: 0,
  };
  let inFixedStep = false;
  let inEngineStep = false;
  let inGameFixedUpdate = false;
  let inCombatUpdate = false;
  let inAiUpdate = false;
  let inProjectileUpdate = false;
  let inArcResolution = false;
  let inHitResolver = false;
  let currentHitResolution = null;
  let hpMutationActor = null;
  let raidActors = null;
  let lastRaid = new Map();
  let preRaid = new Map();
  let damageEvents = [];
  let killEvents = [];
  let hurtEvents = [];
  const attackRecords = new WeakMap();
  const protectedDefinitions = new WeakSet();

  const playerSnapshot = () => ({
    x: P.pos.x, y: P.pos.y, z: P.pos.z,
    hp: P.hp, sat: P.lungs.sat,
    gasImmune: P.gasImmune, filter: P.lungs.filter,
    gasAssist: G.settings.gasAssist, combatAssist: G.settings.combatAssist,
  });
  let lastPlayer = playerSnapshot();
  const changed = (a, b) => Math.abs(a - b) > 1e-9;
  const addViolation = (message) => {
    if (!audit.violations.includes(message)) audit.violations.push(message);
  };
  const throwViolation = (message) => {
    addViolation(message);
    audit.blockedAttempts.push(message);
    throw new Error(`Gate B integrity violation: ${message}`);
  };
  const blockMethod = (owner, key, label) => {
    Object.defineProperty(owner, key, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: function blockedGateBMutation() { throwViolation(label); },
    });
  };
  const wrapInstanceMethod = (owner, key, guard, label) => {
    const original = owner[key];
    Object.defineProperty(owner, key, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: function guardedGateBMethod(...args) {
        if (guard.call(this, ...args)) throwViolation(label);
        return Reflect.apply(original, this, args);
      },
    });
  };
  const wrapPrototypeMethod = (instance, key, guard, label) => {
    const owner = Object.getPrototypeOf(instance);
    const original = owner[key];
    Object.defineProperty(owner, key, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: function guardedGateBPrototypeMethod(...args) {
        if (guard.call(this, ...args)) throwViolation(label);
        return Reflect.apply(original, this, args);
      },
    });
  };
  const protectField = (owner, key, label, mayWrite = () => inFixedStep) => {
    let value = owner[key];
    Object.defineProperty(owner, key, {
      configurable: false,
      enumerable: true,
      get: () => value,
      set: (next) => {
        if (!mayWrite(next, value)) throwViolation(label);
        value = next;
      },
    });
  };

  const protectAttackDefinition = (definition) => {
    if (!definition || typeof definition !== 'object') {
      throwViolation('combat attack started without an authored definition object');
    }
    if (protectedDefinitions.has(definition)) return;
    for (const key of Reflect.ownKeys(definition)) {
      const descriptor = Object.getOwnPropertyDescriptor(definition, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          descriptor.configurable === false) {
        throwViolation(`authored attack definition field ${String(key)} could not be sealed`);
      }
      const value = descriptor.value;
      Object.defineProperty(definition, key, {
        configurable: false,
        enumerable: descriptor.enumerable,
        get: () => value,
        set: () => throwViolation(`authored attack definition field ${String(key)} was assigned`),
      });
    }
    Object.preventExtensions(definition);
    protectedDefinitions.add(definition);
  };

  const captureAttack = (actor, attack) => {
    if (!attack || typeof attack !== 'object' || !attack.def || !(attack.hitSet instanceof Set)) {
      throwViolation('combat start did not create a normal authored attack');
    }
    const immutableFields = ['def', 'name', 'total', 'windup', 'active', 'moveScale', 'rootMotion', 'hitSet'];
    const definitionValues = new Map(Reflect.ownKeys(attack.def).map((key) => [key, attack.def[key]]));
    const immutableValues = new Map(immutableFields.map((key) => [key, attack[key]]));
    const expectedHitIds = new Set(attack.hitSet);
    const record = {
      actor,
      attack,
      definition: attack.def,
      definitionValues,
      immutableValues,
      hitSet: attack.hitSet,
      expectedHitIds,
    };
    attackRecords.set(attack, record);

    protectAttackDefinition(attack.def);
    for (const key of immutableFields) {
      const descriptor = Object.getOwnPropertyDescriptor(attack, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
          descriptor.configurable === false) {
        throwViolation(`active attack field ${key} could not be sealed`);
      }
      const value = descriptor.value;
      Object.defineProperty(attack, key, {
        configurable: false,
        enumerable: descriptor.enumerable,
        get: () => value,
        set: () => throwViolation(`active attack field ${key} was assigned`),
      });
    }

    const rawAdd = Set.prototype.add;
    Object.defineProperty(record.hitSet, 'add', {
      configurable: false,
      enumerable: false,
      writable: false,
      value(id) {
        if (!inArcResolution) throwViolation('active attack hit set was mutated outside arc resolution');
        expectedHitIds.add(id);
        return Reflect.apply(rawAdd, this, [id]);
      },
    });
    for (const key of ['delete', 'clear']) {
      Object.defineProperty(record.hitSet, key, {
        configurable: false,
        enumerable: false,
        writable: false,
        value() { throwViolation(`active attack hit set ${key} was invoked`); },
      });
    }
    Object.preventExtensions(record.hitSet);
    return record;
  };

  const assertAuthenticAttack = (actor, attack) => {
    const record = attackRecords.get(attack);
    if (!record || record.actor !== actor || record.attack !== attack ||
        actor.attack !== attack || attack.def !== record.definition ||
        attack.hitSet !== record.hitSet) {
      throwViolation('combat resolver received an unauthenticated active attack');
    }
    for (const [key, value] of record.immutableValues) {
      if (!Object.is(attack[key], value)) {
        throwViolation(`active attack field ${key} diverged from its start snapshot`);
      }
    }
    const definitionKeys = Reflect.ownKeys(record.definition);
    if (definitionKeys.length !== record.definitionValues.size) {
      throwViolation('authored attack definition shape changed after combat start');
    }
    for (const [key, value] of record.definitionValues) {
      if (!Object.is(record.definition[key], value)) {
        throwViolation(`authored attack definition field ${String(key)} diverged from its start snapshot`);
      }
    }
    if (record.hitSet.size !== record.expectedHitIds.size ||
        [...record.hitSet].some((id) => !record.expectedHitIds.has(id))) {
      throwViolation('active attack hit set diverged from authenticated arc selection');
    }
    return record;
  };

  // Authenticate the production call chain itself. Public combat events are
  // observations, not authority: a hostile driver can invoke _applyHit and
  // manufacture the same events. Instance methods are sealed and the matching
  // prototype entry rejects attempts to bypass the instance wrapper.
  const sealCallPath = (instance, prototype, key, original, audited, label) => {
    Object.defineProperty(prototype, key, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: function blockedPrototypeBypass() {
        throwViolation(`${label} prototype bypass invoked`);
      },
    });
    Object.defineProperty(instance, key, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: audited,
    });
  };

  const enginePrototype = Object.getPrototypeOf(G.engine);
  const gamePrototype = Object.getPrototypeOf(G);
  const combatPrototype = Object.getPrototypeOf(G.combat);
  const aiPrototype = Object.getPrototypeOf(G.ai);
  const originalStepFixed = enginePrototype.stepFixedForTest;
  const originalGameFixedUpdate = gamePrototype.fixedUpdate;
  const originalCombatStart = combatPrototype.start;
  const originalCombatUpdate = combatPrototype.update;
  const originalResolveArc = combatPrototype._resolveArc;
  const originalApplyHit = combatPrototype._applyHit;
  const originalAiUpdate = aiPrototype.update;
  const originalProjectileUpdate = aiPrototype._updateProjectiles;

  sealCallPath(G.engine, enginePrototype, 'stepFixedForTest', originalStepFixed,
    function auditedStepFixedForTest(...args) {
      if (inEngineStep) throwViolation('nested deterministic engine step invoked');
      const requested = args.length ? args[0] : 1;
      const before = audit.gameFixedUpdates;
      inEngineStep = true;
      try {
        const result = Reflect.apply(originalStepFixed, this, args);
        if (Number.isInteger(requested) && audit.gameFixedUpdates - before !== requested) {
          throwViolation(`engine step ran ${audit.gameFixedUpdates - before} game updates for ${requested} steps`);
        }
        if (Number.isInteger(requested)) audit.engineFixedSteps += requested;
        return result;
      } finally {
        inEngineStep = false;
      }
    }, 'deterministic engine step');

  sealCallPath(G, gamePrototype, 'fixedUpdate', originalGameFixedUpdate,
    function auditedGameFixedUpdate(...args) {
      if (!inEngineStep || inGameFixedUpdate) {
        throwViolation('game fixed update invoked outside the engine updater chain');
      }
      inGameFixedUpdate = true;
      audit.gameFixedUpdates++;
      try { return Reflect.apply(originalGameFixedUpdate, this, args); }
      finally { inGameFixedUpdate = false; }
    }, 'game fixed update');

  sealCallPath(G.combat, combatPrototype, 'update', originalCombatUpdate,
    function auditedCombatUpdate(...args) {
      if (!inGameFixedUpdate || inCombatUpdate) {
        throwViolation('combat update invoked outside the game fixed update');
      }
      inCombatUpdate = true;
      audit.combatUpdates++;
      try { return Reflect.apply(originalCombatUpdate, this, args); }
      finally { inCombatUpdate = false; }
    }, 'combat update');

  sealCallPath(G.combat, combatPrototype, 'start', originalCombatStart,
    function auditedCombatStart(actor, attackName, opts, ...rest) {
      if (!inGameFixedUpdate || !inFixedStep) {
        throwViolation('combat attack started outside the production fixed update');
      }
      const started = Reflect.apply(originalCombatStart, this, [actor, attackName, opts, ...rest]);
      if (started) {
        captureAttack(actor, actor?.attack);
        audit.authenticatedAttackStarts++;
      }
      return started;
    }, 'combat attack start');

  sealCallPath(G.ai, aiPrototype, 'update', originalAiUpdate,
    function auditedAiUpdate(...args) {
      if (!inGameFixedUpdate || inAiUpdate) {
        throwViolation('AI update invoked outside the game fixed update');
      }
      inAiUpdate = true;
      try { return Reflect.apply(originalAiUpdate, this, args); }
      finally { inAiUpdate = false; }
    }, 'AI update');

  sealCallPath(G.ai, aiPrototype, '_updateProjectiles', originalProjectileUpdate,
    function auditedProjectileUpdate(...args) {
      if (!inAiUpdate || inProjectileUpdate) {
        throwViolation('projectile update invoked outside the production AI update');
      }
      inProjectileUpdate = true;
      try { return Reflect.apply(originalProjectileUpdate, this, args); }
      finally { inProjectileUpdate = false; }
    }, 'projectile update');

  sealCallPath(G.combat, combatPrototype, '_resolveArc', originalResolveArc,
    function auditedResolveArc(attacker, attack, game, ...rest) {
      if (!inCombatUpdate || inArcResolution) {
        throwViolation('combat arc resolver invoked outside production combat update');
      }
      if (game !== G || !attacker) {
        throwViolation('combat arc resolver received a non-current attack');
      }
      assertAuthenticAttack(attacker, attack);
      inArcResolution = true;
      audit.arcResolutions++;
      try { return Reflect.apply(originalResolveArc, this, [attacker, attack, game, ...rest]); }
      finally { inArcResolution = false; }
    }, 'combat arc resolver');

  sealCallPath(G.combat, combatPrototype, '_applyHit', originalApplyHit,
    function auditedApplyHit(attacker, target, attack, game, dirX, dirZ, ...rest) {
      if (!inArcResolution || inHitResolver) {
        throwViolation('combat hit resolver invoked outside production arc traversal');
      }
      if (game !== G || !attacker) {
        throwViolation('combat hit resolver received a forged attack or unselected target');
      }
      assertAuthenticAttack(attacker, attack);
      if (!attack.hitSet?.has(target?.id)) {
        throwViolation('combat hit resolver received a forged attack or unselected target');
      }
      inHitResolver = true;
      currentHitResolution = {
        attacker,
        target,
        attack,
        damageCalls: 0,
        damageResult: null,
        damageTelemetry: 0,
        killTelemetry: 0,
      };
      audit.hitResolverCalls++;
      try {
        const result = Reflect.apply(originalApplyHit, this,
          [attacker, target, attack, game, dirX, dirZ, ...rest]);
        if (currentHitResolution.damageCalls !== 1) {
          throwViolation(`authenticated hit invoked actor damage ${currentHitResolution.damageCalls} times`);
        }
        const damageResult = currentHitResolution.damageResult;
        if (!damageResult || typeof damageResult !== 'object') {
          throwViolation('authenticated hit did not return an actor damage result');
        }
        const expectsDamageTelemetry = !damageResult.blocked && !damageResult.parried && !damageResult.dodged;
        if (currentHitResolution.damageTelemetry !== (expectsDamageTelemetry ? 1 : 0)) {
          throwViolation('authenticated hit produced inconsistent damage telemetry');
        }
        const expectsKillTelemetry = expectsDamageTelemetry && damageResult.killed === true;
        if (currentHitResolution.killTelemetry !== (expectsKillTelemetry ? 1 : 0)) {
          throwViolation('authenticated hit produced inconsistent kill telemetry');
        }
        return result;
      }
      finally {
        currentHitResolution = null;
        inHitResolver = false;
      }
    }, 'combat hit resolver');

  // Installed only after the one legitimate fresh-game spawn. From this point
  // the representative slice has no authored transition that may relocate Ren.
  // Guard both the instances and their prototypes. Dynamically obtaining a
  // renamed helper from a prototype must still hit the trap that GB06-R01
  // previously bypassed.
  wrapPrototypeMethod(P, 'placeAt', function () { return this === P; },
    'actor placement helper invoked after fresh spawn');
  wrapPrototypeMethod(G, 'teleport', function () { return this === G; },
    'game teleport helper invoked during partial slice');
  blockMethod(P, 'placeAt', 'actor placement helper invoked after fresh spawn');
  blockMethod(G, 'teleport', 'game teleport helper invoked during partial slice');
  for (const key of ['set', 'copy', 'add', 'sub', 'lerp', 'multiply', 'setX', 'setY', 'setZ', 'addScaledVector']) {
    blockMethod(P.pos, key, `player position vector mutator ${key} invoked`);
  }
  for (const key of ['x', 'y', 'z']) {
    protectField(P.pos, key, `player position component ${key} changed outside fixed step`);
  }
  protectField(P, 'hp', 'player hp changed without authenticated damage', () => hpMutationActor === P);
  protectField(P, 'dead', 'player death state changed without authenticated damage',
    () => hpMutationActor === P);
  protectField(P.lungs, 'sat', 'player saturation changed outside fixed step');
  protectField(P, 'gasImmune', 'player gas immunity was assigned', () => false);
  protectField(P.lungs, 'filter', 'player filter state was assigned', () => false);

  let actorPrototype = Object.getPrototypeOf(P);
  while (actorPrototype && !Object.prototype.hasOwnProperty.call(actorPrototype, 'damage')) {
    actorPrototype = Object.getPrototypeOf(actorPrototype);
  }
  if (!actorPrototype) throwViolation('shared actor prototype could not be authenticated');
  const originalActorVitals = actorPrototype._updateVitals;
  const originalActorDamage = actorPrototype.damage;
  const originalActorKill = actorPrototype.kill;
  Object.defineProperty(actorPrototype, '_updateVitals', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: function auditedActorVitals(...args) {
      if (this !== P) return Reflect.apply(originalActorVitals, this, args);
      if (!inFixedStep || hpMutationActor) {
        throwViolation('player vitals updated outside the production fixed step');
      }
      hpMutationActor = this;
      try { return Reflect.apply(originalActorVitals, this, args); }
      finally { hpMutationActor = null; }
    },
  });
  Object.defineProperty(actorPrototype, 'damage', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: function auditedActorDamage(...args) {
      const protectedActor = this === P || !!raidActors?.includes(this);
      if (!protectedActor) return Reflect.apply(originalActorDamage, this, args);
      const authenticatedCombat = inHitResolver && currentHitResolution?.target === this &&
        currentHitResolution.damageCalls === 0;
      const authenticatedProjectile = this === P && inProjectileUpdate;
      if (!inFixedStep || (!authenticatedCombat && !authenticatedProjectile) || hpMutationActor) {
        throwViolation('protected actor damage invoked without authenticated hit resolution');
      }
      if (authenticatedCombat) currentHitResolution.damageCalls++;
      hpMutationActor = this;
      let result;
      try { result = Reflect.apply(originalActorDamage, this, args); }
      finally { hpMutationActor = null; }
      if (authenticatedCombat) currentHitResolution.damageResult = result;
      return result;
    },
  });
  Object.defineProperty(actorPrototype, 'kill', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: function auditedActorKill(...args) {
      const protectedActor = this === P || !!raidActors?.includes(this);
      if (protectedActor && (!inFixedStep || hpMutationActor !== this)) {
        throwViolation('protected actor kill invoked without authenticated damage');
      }
      return Reflect.apply(originalActorKill, this, args);
    },
  });
  wrapInstanceMethod(G, 'emit', function (type, payload) {
    if (type === 'kill' && !inFixedStep) return true;
    if (raidActors && (type === 'damageNumber' || type === 'kill') &&
        raidActors.includes(payload?.target)) {
      const resolution = currentHitResolution;
      const damageResult = resolution?.damageResult;
      if (!inHitResolver || resolution?.target !== payload.target || !damageResult) return true;
      const expectsDamageTelemetry = !damageResult.blocked && !damageResult.parried && !damageResult.dodged;
      if (type === 'damageNumber') {
        if (!expectsDamageTelemetry || resolution.damageTelemetry !== 0 ||
            payload.amount !== Math.round(damageResult.amount)) return true;
        resolution.damageTelemetry++;
      } else {
        if (!expectsDamageTelemetry || damageResult.killed !== true ||
            resolution.damageTelemetry !== 1 || resolution.killTelemetry !== 0 ||
            resolution.attacker !== payload.attacker || !payload.target.dead || payload.target.hp > 0) return true;
        resolution.killTelemetry++;
      }
      Object.freeze(payload);
    }
    return false;
  }, 'raid combat telemetry emitted without an authenticated hit resolution');

  let inDialogueUi = false;
  for (const key of ['onAdvance', 'onChoose']) {
    let callback = G.dialogueUI[key];
    const guarded = function guardedDialogueAction(...args) {
      if (typeof callback !== 'function') return undefined;
      inDialogueUi = true;
      try { return Reflect.apply(callback, this, args); }
      finally { inDialogueUi = false; }
    };
    Object.defineProperty(G.dialogueUI, key, {
      configurable: false,
      enumerable: true,
      get: () => typeof callback === 'function' ? guarded : null,
      set: (next) => {
        if (!inFixedStep && !inDialogueUi) {
          throwViolation(`dialogue callback ${key} assigned outside authored interaction`);
        }
        if (next !== null && typeof next !== 'function') {
          throwViolation(`dialogue callback ${key} received an invalid value`);
        }
        callback = next;
      },
    });
  }
  for (const key of ['set', 'bump', 'unlock', 'choose', 'addItem', 'removeItem', 'addJournal', 'reset', 'deserialise']) {
    if (typeof G.state[key] !== 'function') continue;
    wrapInstanceMethod(G.state, key, () => !inFixedStep && !inDialogueUi,
      `progression method ${key} invoked outside fixed step or dialogue UI`);
  }

  if (options.adversarial === 'precombat-hp') {
    const originalSpawnRaid = G.director._spawnRaid;
    Object.defineProperty(G.director, '_spawnRaid', {
      configurable: false,
      enumerable: false,
      writable: false,
      value: function adversarialRaidPrecondition(...args) {
        const group = Reflect.apply(originalSpawnRaid, this, args);
        if (args[0] === 'courtyard' && group) group.forEach((actor) => { actor.hp = 30; });
        return group;
      },
    });
  }

  if (options.adversarial === 'combat-resolver') {
    let adversarialHitInjected = false;
    G.engine.addUpdater(() => {
      const raid = G.director._raidActive;
      if (adversarialHitInjected || !raid || raid.id !== 'courtyard' || !P.attack) return;
      const system = G[['com', 'bat'].join('')];
      for (const enemy of raid.group) {
        if (enemy.dead) continue;
        const forgedAttack = {
          def: {
            damage: enemy.maxHp + 100,
            poise: enemy.maxHp + 100,
            impact: 'flesh',
            stagger: true,
            guardBreak: false,
            hitstop: 0,
            shake: 0,
          },
          landed: false,
        };
        system[['_apply', 'Hit'].join('')](P, enemy, forgedAttack, G, 0, 1);
      }
      adversarialHitInjected = true;
    }, 9000);
  }

  const definitionReentryFields = {
    'attack-definition-reentry': ['dam', 'age'].join(''),
    'attack-definition-poise-reentry': ['po', 'ise'].join(''),
    'attack-definition-reach-reentry': ['re', 'ach'].join(''),
    'attack-definition-arc-reentry': ['a', 'rc'].join(''),
  };
  const definitionReentryField = definitionReentryFields[options.adversarial];
  if (definitionReentryField) {
    G.on('actor:attackstart', (actor) => {
      if (actor !== P || !actor.attack) return;
      actor.attack.def[definitionReentryField] = 200;
    });
  }
  const stateReentryFields = {
    'attack-state-reentry': ['wind', 'up'].join(''),
    'attack-state-active-reentry': ['act', 'ive'].join(''),
  };
  const stateReentryField = stateReentryFields[options.adversarial];
  if (stateReentryField) {
    G.on('actor:attackstart', (actor) => {
      if (actor !== P || !actor.attack) return;
      actor.attack[stateReentryField] = 0;
    });
  }
  if (options.adversarial === 'attack-hitset-reentry') {
    G.on('actor:attackstart', (actor) => {
      if (actor !== P || !actor.attack) return;
      actor.attack.hitSet.add('__forged_target__');
    });
  }
  if (options.adversarial === 'attack-hitset-prototype-reentry') {
    G.on('actor:attackstart', (actor) => {
      if (actor !== P || !actor.attack) return;
      Reflect.apply(Set.prototype.add, actor.attack.hitSet, ['__forged_target__']);
    });
  }
  if (options.adversarial === 'combat-event-hp-reentry') {
    G.on('damageNumber', ({ target }) => {
      if (!raidActors?.includes(target)) return;
      target.hp = 0;
    });
  }
  if (options.adversarial === 'nested-damage-reentry') {
    G.on('damageNumber', ({ target }) => {
      if (!raidActors?.includes(target) || target.dead) return;
      const damageMethod = Reflect.get(target, ['dam', 'age'].join(''));
      Reflect.apply(damageMethod, target, [{
        amount: Math.min(12, Math.max(0, target.hp - 1)),
        poise: 12,
        kind: 'blunt',
        source: P,
      }]);
    });
  }
  if (options.adversarial === 'death-state-reentry') {
    G.on('damageNumber', ({ target }) => {
      if (!raidActors?.includes(target)) return;
      target[['de', 'ad'].join('')] = true;
    });
  }
  if (options.adversarial === 'kill-event-reentry') {
    G.on('damageNumber', ({ target }) => {
      if (!raidActors?.includes(target)) return;
      G.emit(['ki', 'll'].join(''), { attacker: P, target });
    });
  }

  G.on('damageNumber', ({ target, amount }) => {
    if (!raidActors || !raidActors.includes(target)) return;
    if (!inFixedStep) addViolation(`raid damage event emitted outside fixed step for actor ${target.id}`);
    damageEvents.push({
      target,
      amount,
      activePlayerAttack: !!P.attack,
      normalArc: inHitResolver && currentHitResolution?.attacker === P &&
        currentHitResolution?.target === target && currentHitResolution?.attack === P.attack,
    });
  });
  G.on('actor:attackstart', (actor) => {
    if (actor === P && inFixedStep) audit.playerAttackStarts++;
  });
  G.on('kill', ({ attacker, target }) => {
    if (!raidActors || !raidActors.includes(target)) return;
    if (!inFixedStep) addViolation(`raid kill event emitted outside fixed step for actor ${target.id}`);
    killEvents.push({
      attacker,
      target,
      normalArc: inHitResolver && currentHitResolution?.attacker === P &&
        currentHitResolution?.target === target && currentHitResolution?.attack === P.attack,
    });
  });
  G.on('actor:hurt', (actor, hit) => {
    if (!raidActors || !raidActors.includes(actor)) return;
    hurtEvents.push({ actor, kind: hit?.kind || 'unknown', source: hit?.source?.id ?? null });
  });

  G.engine.addUpdater(() => {
    if (audit.violations.length) throw new Error(`Gate B integrity violation: ${audit.violations[0]}`);
    const currentPlayer = playerSnapshot();
    if (changed(currentPlayer.x, lastPlayer.x) || changed(currentPlayer.y, lastPlayer.y) ||
        changed(currentPlayer.z, lastPlayer.z)) {
      throwViolation('player position changed between fixed steps');
    }
    if (changed(currentPlayer.hp, lastPlayer.hp)) throwViolation('player hp changed between fixed steps');
    if (changed(currentPlayer.sat, lastPlayer.sat)) throwViolation('player saturation changed between fixed steps');
    if (currentPlayer.gasImmune !== false || currentPlayer.gasImmune !== lastPlayer.gasImmune) {
      throwViolation('player gas immunity changed');
    }
    if (currentPlayer.filter !== null || currentPlayer.filter !== lastPlayer.filter) {
      throwViolation('player filter state changed');
    }
    if (currentPlayer.gasAssist !== false || currentPlayer.combatAssist !== 0) {
      throwViolation('assistance settings changed');
    }

    const activeRaid = G.director._raidActive;
    if (!raidActors && activeRaid && activeRaid.id === 'courtyard') {
      raidActors = activeRaid.group.slice();
      audit.raidIds = raidActors.map((actor) => actor.id);
      audit.raidInitialActors = raidActors.map((actor) => ({
        id: actor.id, kind: actor.kind, x: actor.pos.x, y: actor.pos.y, z: actor.pos.z,
        hp: actor.hp, maxHp: actor.maxHp,
      }));
      audit.raidInitialFullHealth = raidActors.length === 3 &&
        raidActors.every((actor) => !actor.dead && actor.hp === actor.maxHp);
      if (!audit.raidInitialFullHealth) throwViolation('courtyard raid was preconditioned before its first fixed step');
      for (const actor of raidActors) {
        protectField(actor, 'hp', `raid actor ${actor.id} hp changed without authenticated damage`,
          () => hpMutationActor === actor);
        protectField(actor, 'dead', `raid actor ${actor.id} death state changed without authenticated damage`,
          () => hpMutationActor === actor);
      }
      lastRaid = new Map(raidActors.map((actor) => [actor.id, { hp: actor.hp, dead: actor.dead }]));
    }
    if (raidActors) {
      for (const actor of raidActors) {
        const last = lastRaid.get(actor.id);
        if (!last) continue;
        if (changed(actor.hp, last.hp) || actor.dead !== last.dead) {
          throwViolation(`raid actor ${actor.id} changed between fixed steps`);
        }
      }
      preRaid = new Map(raidActors.map((actor) => [actor.id, { hp: actor.hp, dead: actor.dead }]));
    }
    damageEvents = [];
    killEvents = [];
    hurtEvents = [];
    inFixedStep = true;
  }, -10000);

  G.engine.addUpdater(() => {
    if (raidActors) {
      for (const actor of raidActors) {
        const before = preRaid.get(actor.id);
        if (!before) continue;
        if (actor.hp < before.hp - 1e-9) {
          const hits = damageEvents.filter((event) => event.target === actor &&
            event.activePlayerAttack && event.normalArc);
          if (!hits.length) {
            const hurt = hurtEvents.filter((event) => event.actor === actor)
              .map((event) => `${event.kind}:${event.source ?? 'none'}`).join(',') || 'none';
            addViolation(`raid actor ${actor.id} lost hp ${before.hp.toFixed(2)}->${actor.hp.toFixed(2)} ` +
              `without normal combat hit telemetry (hurt=${hurt}, ppm=${Math.round(actor.ambientPpm || 0)}, ` +
              `sat=${actor.lungs.sat.toFixed(3)}, pos=${actor.pos.x.toFixed(2)},${actor.pos.y.toFixed(2)},${actor.pos.z.toFixed(2)})`);
          }
          else audit.normalDamageTransitions++;
        }
        if (!before.dead && actor.dead) {
          const death = killEvents.find((event) => event.target === actor &&
            event.attacker === P && event.normalArc);
          const hit = damageEvents.find((event) => event.target === actor &&
            event.activePlayerAttack && event.normalArc);
          if (!death || !hit) addViolation(`raid actor ${actor.id} died without player combat provenance`);
          else if (!audit.provenDeaths.includes(actor.id)) audit.provenDeaths.push(actor.id);
        }
      }
      lastRaid = new Map(raidActors.map((actor) => [actor.id, { hp: actor.hp, dead: actor.dead }]));
    }
    lastPlayer = playerSnapshot();
    inFixedStep = false;
    if (audit.violations.length) throw new Error(`Gate B integrity violation: ${audit.violations[0]}`);
  }, 10000);

  // No evaluated driver needs to register or reorder engine updaters. Preserve
  // the one legitimate late registration used by the slinger's simulation
  // timer, and make both direct and computed access to the updater list fail.
  const originalAddUpdater = enginePrototype.addUpdater;
  const rawUpdaterList = G.engine._updaters;
  let allowUpdaterMutation = false;
  let dynamicSimTimerRegistered = !!G._simTimerHook;
  for (const entry of rawUpdaterList) Object.freeze(entry);
  const guardedUpdaterList = new Proxy(rawUpdaterList, {
    set(target, key, value) {
      if (!allowUpdaterMutation) throwViolation('engine updater list mutated after integrity audit');
      return Reflect.set(target, key, value, target);
    },
    deleteProperty(target, key) {
      if (!allowUpdaterMutation) throwViolation('engine updater list mutated after integrity audit');
      return Reflect.deleteProperty(target, key);
    },
    defineProperty(target, key, descriptor) {
      if (!allowUpdaterMutation) throwViolation('engine updater list mutated after integrity audit');
      return Reflect.defineProperty(target, key, descriptor);
    },
  });
  Object.defineProperty(G.engine, '_updaters', {
    configurable: false,
    enumerable: false,
    get: () => guardedUpdaterList,
    set: () => throwViolation('engine updater list was replaced after integrity audit'),
  });
  Object.defineProperty(enginePrototype, 'addUpdater', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: function blockedUpdaterPrototypeBypass() {
      throwViolation('engine updater prototype bypass invoked');
    },
  });
  Object.defineProperty(G.engine, 'addUpdater', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: function auditedLateUpdater(fn, order = 0) {
      if (!inGameFixedUpdate || order !== 5 || dynamicSimTimerRegistered || !G._simTimerHook) {
        throwViolation('engine updater registered after integrity audit');
      }
      allowUpdaterMutation = true;
      try {
        Reflect.apply(originalAddUpdater, this, [fn, order]);
        dynamicSimTimerRegistered = true;
        for (const entry of rawUpdaterList) Object.freeze(entry);
      } finally {
        allowUpdaterMutation = false;
      }
      return () => throwViolation('engine updater removal attempted during integrity audit');
    },
  });

  const api = Object.freeze({
    report: () => JSON.parse(JSON.stringify(audit)),
  });
  Object.defineProperty(window, '__CLIntegrityAudit', {
    configurable: false, enumerable: false, writable: false, value: api,
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
};
const BASE = '/gate-b-slice';
const server = createServer((req, res) => {
  let path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (!path.startsWith(BASE)) { res.writeHead(404); res.end(); return; }
  path = path.slice(BASE.length) || '/';
  if (path.endsWith('/')) path += 'index.html';
  try {
    const body = readFileSync(join(DIST, normalize(path).replace(/^[/\\]+/, '')));
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream',
      'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404); res.end('404'); }
});
const results = [];
const browserErrors = [];
let browser = null;

try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, resolve);
  });
  browser = await chromium.launch({
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--use-angle=swiftshader',
      '--no-sandbox', '--disable-gpu-sandbox', '--ignore-gpu-blocklist'],
  });
  for (let repetition = 1; repetition <= 2; repetition++) {
    const context = await browser.newContext({
      viewport: { width: 667, height: 375 }, deviceScaleFactor: 1,
      isMobile: true, hasTouch: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(`PAGEERROR ${String(error && error.stack || error)}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`CONSOLE ${message.text()}`);
    });
    await page.goto(`http://127.0.0.1:${server.address().port}${BASE}/index.html`,
      { waitUntil: 'domcontentloaded' });
    await page.waitForFunction('window.CINDERLINE?.ready === true', null, { timeout: 120000 });
    await page.evaluate(async () => {
      const C = window.CINDERLINE;
      await C.startNewGame();
      if (C.game.mode !== C.MODE.PLAY) throw new Error('fresh game did not reach play mode');
      C.game.engine.stop();
      if (C.game.engine.running) throw new Error('live RAF did not stop');
    });
    await page.evaluate(installIntegrityAudit, { adversarial: ADVERSARIAL });
    if (ADVERSARIAL === 'placement-alias') {
      await page.evaluate(() => {
        const P = window.CINDERLINE.game.player;
        const dynamicName = ['place', 'At'].join('');
        const indirectPlacement = Reflect.get(Object.getPrototypeOf(P), dynamicName);
        Reflect.apply(indirectPlacement, P, [P.pos.x + 2, P.pos.y, P.pos.z, P.yaw]);
      });
    }
    if (ADVERSARIAL === 'updater-registration') {
      await page.evaluate(() => {
        window.CINDERLINE.game.engine.addUpdater(() => {}, 9000);
      });
    }
    if (ADVERSARIAL === 'updater-list-direct') {
      await page.evaluate(() => {
        window.CINDERLINE.game.engine._updaters.push({ fn: () => {}, order: 9000 });
      });
    }
    if (ADVERSARIAL === 'updater-list-computed') {
      await page.evaluate(() => {
        const engine = window.CINDERLINE.game.engine;
        const list = Reflect.get(engine, ['_up', 'daters'].join(''));
        list.push({ fn: () => {}, order: 9000 });
      });
    }
    await page.evaluate(DRIVER);
    const result = await page.evaluate(() => window.__CLGateB.run());
    result.integrity = await page.evaluate(() => window.__CLIntegrityAudit.report());
    if (result.integrity.violations.length) {
      result.errors.push(`integrity audit: ${result.integrity.violations.join('; ')}`);
    }
    if (result.integrity.raidIds.length !== 3 || !result.integrity.raidInitialFullHealth) {
      result.errors.push('integrity audit did not observe three full-health authored raid actors');
    }
    if (result.integrity.playerAttackStarts < 1 || result.integrity.normalDamageTransitions < 3 ||
        result.integrity.provenDeaths.length !== 3) {
      result.errors.push('integrity audit did not prove normal player-combat provenance for all raid deaths');
    }
    if (result.integrity.engineFixedSteps < 1 ||
        result.integrity.engineFixedSteps !== result.integrity.gameFixedUpdates ||
        result.integrity.gameFixedUpdates !== result.integrity.combatUpdates) {
      result.errors.push('integrity audit did not authenticate one game/combat update per engine fixed step');
    }
    if (result.integrity.arcResolutions < 1 ||
        result.integrity.hitResolverCalls < result.integrity.normalDamageTransitions) {
      result.errors.push('integrity audit did not bind damage transitions to production arc resolution');
    }
    if (FORCE_FAILURE) result.errors.push('forced evidence-currentness failure');
    result.repetition = repetition;
    result.browserErrors = errors;
    results.push(result);
    browserErrors.push(...errors.map((error) => `run ${repetition}: ${error}`));
    const ok = result.errors.length === 0 && errors.length === 0;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  run ${repetition}  ` +
      `distance=${result.route.distance.toFixed(1)}m ` +
      `air=${Math.round(result.exposure.peakPpm)}ppm/${result.exposure.peakSaturation.toFixed(3)} ` +
      `hits=${result.combat.playerHits} kills=${result.combat.kills} hp=${result.combat.playerHp.toFixed(1)}`);
    if (!ok) {
      for (const error of [...result.errors, ...errors]) console.log(`      ${error}`);
    }
    await context.close();
  }
} catch (error) {
  browserErrors.push(`RUNNER ${String(error && error.stack || error)}`);
} finally {
  if (browser) await browser.close();
  if (server.listening) await new Promise((resolve) => server.close(resolve));
}

const semantic = (result) => ({
  viewport: result.viewport,
  assists: result.assists,
  criticalCrossed: result.exposure.criticalCrossed,
  recovered: result.exposure.recovered,
  survivedCounter: result.exposure.survivedCounter,
  authoredGroup: result.combat.authoredGroup,
  kills: result.combat.kills,
  remainingHostiles: result.combat.remainingHostiles,
  arrivalStep: result.quest.arrivalStep,
  raidDone: result.quest.raidDone,
  solMet: result.quest.solMet,
  integrity: {
    violations: result.integrity.violations,
    raidIds: result.integrity.raidIds.length,
    raidInitialFullHealth: result.integrity.raidInitialFullHealth,
    playerAttackStarts: result.integrity.playerAttackStarts,
    engineFixedSteps: result.integrity.engineFixedSteps,
    gameFixedUpdates: result.integrity.gameFixedUpdates,
    combatUpdates: result.integrity.combatUpdates,
    arcResolutions: result.integrity.arcResolutions,
    hitResolverCalls: result.integrity.hitResolverCalls,
    provenDeaths: result.integrity.provenDeaths.length,
  },
});
const repeatable = results.length === 2 && JSON.stringify(semantic(results[0])) === JSON.stringify(semantic(results[1]));
const failed = results.length !== 2 || results.some((result) => result.errors.length || result.browserErrors.length) ||
  browserErrors.length > 0 || !repeatable;
const report = {
  ...evidenceBase,
  generated_at: new Date().toISOString(),
  status: failed ? 'failed' : 'passed',
  repeatable,
  passed: !failed,
  forced_failure: FORCE_FAILURE,
  results,
  browserErrors,
  preflightErrors: [],
};
mkdirSync(DIAGNOSTIC_DIR, { recursive: true });
atomicWriteJson(join(DIAGNOSTIC_DIR, 'gate-b-slice-latest.json'), report);
atomicWriteJson(EVIDENCE_PATH, report);

console.log(failed ? '\nGATE B REPRESENTATIVE SLICE FAILED' : '\nGATE B REPRESENTATIVE SLICE OK (partial scope)');
if (!repeatable) console.log('The two fresh-context runs did not produce the same semantic outcome.');
process.exit(failed ? 1 : 0);
