// Reusable version of the exact d19c424 CPU navigation controls.
// Imports the current checkout. It does not claim that pending edits are d19c424.
// Run from any directory: node /workspace/scratch/0b7ad82bafe7/gas-navigation-probe.mjs
// Outputs JSON only; no product, browser, remote or filesystem mutations.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from './survival/node_modules/three/build/three.module.js';
import { NavGrid } from './survival/src/world/nav.js';
import { CollisionWorld, Box, LAYER } from './survival/src/world/collision.js';
import { GasField, Lungs } from './survival/src/world/gas.js';
import { Enemy, AISystem, AI_STATE, ARCHETYPES } from './survival/src/game/ai.js';
import { Rng } from './survival/src/core/rng.js';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sourceFiles = ['src/world/nav.js', 'src/world/collision.js', 'src/world/gas.js',
  'src/game/ai.js', 'src/actors/actor.js', 'src/core/rng.js'];
const readSource = file => fs.readFileSync(new URL(`./survival/${file}`, import.meta.url));
const sourceHashes = Object.fromEntries(sourceFiles.map(f => [f, hash(readSource(f))]));

const world = new CollisionWorld(6);
world.add(new Box(6.5, -1, 4.5, 13, 1, 9, 0, LAYER.PLATFORM, 'floor'));
const nav = new NavGrid(world, { minX: 0, minZ: 0, maxX: 13, maxZ: 9 }, 1).bake(2, .33, 1.7);
function air(hot) {
  const gas = new GasField(0, 0, 13, 9, .5);
  if (hot) gas.addSource(6.5, 4.5, 9000, 1.4, 'test');
  gas.bake();
  return gas;
}
const gas = air(true);
nav.applyGasCost(gas);
const path = nav.findPath(1.5, 0, 4.5, 11.5, 0, 4.5);
const raw = [];
let cur = nav.nearest(11.5, 4.5, 0);
while (cur !== -1 && raw.length < 512) {
  raw.push({ ...nav._pt(cur), cost: nav.cost[cur] });
  cur = nav._came[cur];
}
raw.reverse();
const smoothing = {
  setup: { bounds: [0, 0, 13, 9], navCell: 1, flatFloorY: 0, gasCell: .5,
    gasSource: { x: 6.5, z: 4.5, strength: 9000, radius: 1.4 },
    gasBakeIterations: 46, start: [1.5, 0, 4.5], goal: [11.5, 0, 4.5] },
  rawAStarPredecessors: raw, returnedPath: path,
  rawMaxCost: Math.max(...raw.map(p => p.cost)), directCenterCost: nav.cost[nav.i(6, 4)],
  clearStartGoal: nav._clear(nav.nearest(1.5, 4.5, 0), nav.nearest(11.5, 4.5, 0)),
};

let findPathCalls = 0;
const originalPath = nav.findPath;
nav.findPath = function (...args) { findPathCalls++; return originalPath.apply(this, args); };
const directEnemy = { pos: new THREE.Vector3(4.5, 0, 4.5),
  path: [{ x: 4.5, y: 0, z: 1.5 }], moveInput: { x: 0, z: 0, mag: 0 },
  setMove: Enemy.prototype.setMove };
const directGame = { world, nav, gas };
try {
  new AISystem(directGame)._moveTowards(directEnemy, 8.5, 4.5, directGame, .7);
} finally { nav.findPath = originalPath; }
const directShortcut = {
  start: [4.5, 0, 4.5], target: [8.5, 0, 4.5], distance: 4, findPathCalls,
  move: directEnemy.moveInput, path: directEnemy.path,
  startBreathingPpm: gas.sample(4.5, 1.36, 4.5), centerBreathingPpm: gas.sample(6.5, 1.36, 4.5),
  scope: 'Desired movement from real _moveTowards; not a travelled trajectory.',
};

function enemy() {
  const e = Object.create(Enemy.prototype);
  Object.assign(e, {
    kind: 'scav', arch: ARCHETYPES.scav, aiState: AI_STATE.IDLE,
    pos: new THREE.Vector3(6.5, 0, 4.5), height: 1.7, dead: false,
    think: 1, attackCooldown: 1, rangedCooldown: 1, callCooldown: 1, awareness: 0,
    lastSeen: { x: 0, y: 0, z: 0, t: -99 }, yaw: 0, aggro: false, target: null,
    lungs: new Lungs(), hp: 62, maxHp: 62, events: [], rng: new Rng('test'),
    moveInput: { x: 0, z: 0, mag: 0 }, stuckTimer: 0, strafeDir: 1,
    _lastPos: new THREE.Vector3(6.5, 0, 4.5), path: null,
  });
  return e;
}
const panic = [];
for (const hot of [false, true]) {
  const g = air(hot), e = enemy(), events = [];
  const player = { pos: new THREE.Vector3(1000, 0, 1000), height: 1.7, dead: false,
    moveInput: { mag: 0 }, crouch: 0, wantSprint: false, isAttacking: false };
  const game = { world, gas: g, player, actors: [e], emit: (...args) => events.push(args) };
  new AISystem(game)._updateEnemy(e, 1 / 60, game, player);
  panic.push({ hot, ppm: e.localPpm(g), gradient: g.gradient(6.5, 1.4, 4.5, { x: 0, z: 0 }),
    state: e.aiState, move: e.moveInput, enemyEvents: e.events, wantSprint: e.wantSprint === true,
    sampledPpmAtQuarterMeterInDesiredDirection: g.sample(6.5 + e.moveInput.x * .25,
      1.36, 4.5 + e.moveInput.z * .25) });
}
for (const [file, sha] of Object.entries(sourceHashes)) {
  if (hash(readSource(file)) !== sha) throw new Error(`Source changed during probe: ${file}`);
}
console.log(JSON.stringify({ checkedAt: new Date().toISOString(),
  script: fileURLToPath(import.meta.url), sourceHashes,
  scope: 'Current-checkout Node CPU controls; no renderer, physics integration, browser, FPS, or blind comparison.',
  smoothing, directShortcut, panic,
}, null, 2));
