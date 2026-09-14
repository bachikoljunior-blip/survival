import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { installFrameWorkProbe, stopFrameWorkProbe } from '../candidate/tools/frame_work_probe.mjs';

const source = readFileSync(new URL('../source/src/core/engine.js', import.meta.url), 'utf8');
const util = readFileSync(new URL('../source/src/core/util.js', import.meta.url), 'utf8');
const data = text => 'data:text/javascript;base64,' + Buffer.from(text).toString('base64');
const { Engine } = await import(data(source
  .replace("import * as THREE from 'three';", 'const THREE={Scene:class{},PerspectiveCamera:class{}};')
  .replace("'./util.js'", JSON.stringify(data(util)))));
let ms = 1000, queued, assertions = 0, clockCost = 0;
const ok = (value, message) => { assert.ok(value, message); assertions++; };
const eq = (a, b, message) => { assert.deepEqual(a, b, message); assertions++; };
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => { const value = ms; ms += clockCost; return value; } } });
globalThis.requestAnimationFrame = callback => { queued = callback; return 1; };
globalThis.cancelAnimationFrame = () => {};
const cost = amount => { ms += amount; };
function scene() {
  ms = 1000;
  const engine = new Engine({});
  engine.tierLocked = true;
  const counters = { steps: 0, renders: 0 };
  const game = {
    scene: {}, input: { step() {} }, gas: { update() {} }, nav: { updateGasCost() {} },
    actors: [{ update() {} }], systems: [{ update() {} }],
    _playerInput() {}, _drainEvents() {}, _updateZone() {},
    mode: 'play', audio: { ctx: { state: 'running', get currentTime() { return ms / 1000; } }, update() { cost(3); } },
    camera: { update() { cost(2); } }, atmos: { update() { cost(5); } },
    hud: { update() { cost(7); }, updatePerf() { cost(11); } },
    city: { updateVisibility() { cost(13); } }, post: { quadScene: {}, quad: {}, matComposite: {},
      render() { engine.renderer.render(game.scene); this.quad.material = this.matComposite;
        engine.renderer.render(this.quadScene); } },
    render() { this.camera.update(); this.atmos.update(); this.audio.update();
      this.hud.update(); this.hud.updatePerf(); this.city.updateVisibility(); this.post.render(); },
  };
  engine.renderer = { info: { programs: [{}] }, render() { counters.renders++; cost(counters.renders === 3 ? 850 : 2); } };
  engine.addUpdater(() => { counters.steps++; cost(1); game.input.step(); game.gas.update();
    game.nav.updateGasCost(); game._playerInput();
    for (const actor of game.actors) { actor.update(); game._drainEvents(actor); }
    for (const system of game.systems) system.update(); game._updateZone(); }, 0);
  engine.on('render', () => game.render());
  const C = { engine, game };
  globalThis.window = { CINDERLINE: C };
  const original = { bound: engine._boundFrame, emit: engine.emit, updater: engine._updaters[0].fn,
    render: game.render, renderer: engine.renderer.render };
  engine.start();
  const tick = (raf, entry = raf) => { ms = entry; const fn = queued; fn(raf); };
  return { C, engine, game, counters, original, tick };
}
function replay(profile) {
  const s = scene();
  s.C.__audioRecording = {};
  if (profile) installFrameWorkProbe();
  const states = [];
  for (const raf of [1020, 1040, 1060, 1960, 1980, 2000]) {
    if (raf === 1960 || raf === 2000) s.C.__audioRecording = {};
    s.tick(raf);
    states.push({ time: s.engine.time, accum: s.engine.accum, frame: s.engine.frame, ...s.counters });
  }
  return { s, states, diagnostic: profile ? stopFrameWorkProbe() : null };
}

// Independently authored edge cases; only the canonical Engine fixture setup is reused.
const extraCases = [];
const observedCosts = scene();
let actualClockReads = 0;
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => {
  actualClockReads++; const value=ms; ms+=clockCost; return value;
} } });
installFrameWorkProbe(); observedCosts.C.__audioRecording={}; observedCosts.tick(1020);
actualClockReads=0;clockCost=0.25;observedCosts.tick(1040);clockCost=0;
const actualReadTotal=actualClockReads;
const overheadProfile=stopFrameWorkProbe(), row=overheadProfile.rows[0];
const measuredInvocations=Object.entries(row.phaseCalls).filter(([name])=>name!=='renderer.render')
  .reduce((sum,[,count])=>sum+count,0);
eq(row.probeClockReads,actualReadTotal,'probe count equals independently counted actual performance.now calls');
eq(row.probeClockReads,6+4*measuredInvocations,'wrapper marker additions use no new clock reads');
eq(row.observerBookkeepingMs,0.25*(4+2*measuredInvocations),'exclusive bookkeeping contains no overlapping original phase duration in controlled-cost fixture');
ok(row.observerBookkeepingMs<0.25*actualReadTotal,'partial observer bracket is explicitly less than complete injected clock cost');
ok(row.observedWrapperEntryMs<=row.before.wallMs,'entry marker precedes the clock-state sample');
ok(row.observedWrapperExitMs>=row.after.wallMs,'exit marker follows the clock-state sample');
ok(row.observedWrapperExitMs<ms,'last timing read return cost remains outside the observed marker');
eq(row.engineWallMs,20,'raw engine input is not normalized by bookkeeping');
eq(row.acceptedDtSeconds,0.02,'input clamp still consumes unmodified rAF input');
extraCases.push({name:'clock count and exclusive observer accounting',probeClockReads:row.probeClockReads,
 measuredInvocations,observerBookkeepingMs:row.observerBookkeepingMs,injectedClockCostMs:actualReadTotal*0.25,
 markerSpanMs:row.observedWrapperExitMs-row.observedWrapperEntryMs,callbackSampleSpanMs:row.callbackElapsedMs});

const roles=scene();roles.game.player=roles.game.actors[0];
roles.game.combat={update(){}};roles.game.ai={update(){}};roles.game.director={update(){}};
roles.game.systems=[roles.game.combat,roles.game.ai,roles.game.director];
installFrameWorkProbe();const roleResult=stopFrameWorkProbe();
eq(roleResult.fixedTargets,[{phase:'fixed.actor:0',role:'player'},
 {phase:'fixed.system:0',role:'combat'},{phase:'fixed.system:1',role:'ai'},
 {phase:'fixed.system:2',role:'director'}],'installed actor/system indices map to actual known role identities');
ok(!Object.hasOwn(roles.game.combat.update,'phase'),'role metadata does not annotate product functions');
extraCases.push({name:'role identities',fixedTargets:roleResult.fixedTargets});

const transient=scene();installFrameWorkProbe();transient.C.__audioRecording={};
transient.tick(1020);transient.tick(1040);
const temporary={update(){cost(90);}};transient.game.actors.push(temporary);
transient.C.__audioRecording={};transient.tick(1060);
transient.game.actors.pop();transient.C.__audioRecording={};transient.tick(1080);transient.tick(1100);
const tr=stopFrameWorkProbe(), temporaryRow=tr.rows.find(r=>r.recording===2);
ok(tr.complete && tr.detailComplete,'transient registration reversal is not detected by final-state completeness check');
ok(!Object.hasOwn(temporaryRow.phaseMs,'fixed.actor:1'),'temporary actor was not individually instrumented');
ok(temporaryRow.phaseMs['updater:0:0']>=91,'temporary actor cost remains visible in aggregate updater span');
ok(tr.fixedTargetScope.includes('temporary registration change reversed before stop is not observed'),
 'explicit output scope discloses this observed limitation');
extraCases.push({name:'declared transient registration limit reproduced',complete:tr.complete,
 temporaryActorDetailPresent:Object.hasOwn(temporaryRow.phaseMs,'fixed.actor:1'),aggregateUpdaterMs:temporaryRow.phaseMs['updater:0:0']});

const nestedFailure=scene();const sentinel=new Error('nested gas failure object');
const failedGas=()=>{cost(9);throw sentinel;};nestedFailure.game.gas.update=failedGas;
installFrameWorkProbe();nestedFailure.C.__audioRecording={};
try{nestedFailure.tick(1020);}catch(e){eq(e,sentinel,'already queued original preserves same error object');}
assert.throws(()=>nestedFailure.tick(1040),e=>e===sentinel);assertions++;
const nf=stopFrameWorkProbe();eq(nestedFailure.game.gas.update,failedGas,'nested failing method restored exactly');
ok(nf.rows[0].threw && nf.rows[0].phaseCalls['fixed.gas']===1,'nested original throw retained with partial phase evidence');
ok(nf.slowCalls.some(c=>c.phase==='fixed.gas'&&c.elapsedMs===9),'throwing slow invocation kept without changing error identity');
ok(!nestedFailure.C.__iosFrameWorkProbe,'failure review stop clears probe ownership');
extraCases.push({name:'nested throw object and cleanup',threw:nf.rows[0].threw,gasElapsedMs:nf.rows[0].phaseMs['fixed.gas']});

const inherited=scene();const actorProto={update(){cost(9);}};const actor=Object.create(actorProto);
inherited.game.actors=[actor];inherited.game.player=actor;
installFrameWorkProbe();inherited.C.__audioRecording={};inherited.tick(1020);inherited.tick(1040);
const ir=stopFrameWorkProbe();eq(actor.update,actorProto.update,'inherited actor method identity restored');
ok(!Object.hasOwn(actor,'update'),'inherited actor own-property shape restored');
ok(ir.slowCalls.some(c=>c.phase==='fixed.actor:0'),'inherited actor was timed during capture');
const encoded=JSON.stringify(ir);ok(encoded.length>0&&!encoded.includes('[object Object]'),'result serializes without actor/game cycles');
extraCases.push({name:'inherited target restoration and serializability',ownUpdateAfterStop:Object.hasOwn(actor,'update'),resultJsonChars:encoded.length});

const result={status:'pass',assertions,cases:extraCases,
 scope:'Independently authored CPU edge cases with canonical actual Engine._frame and fake browser/time. The copied fixture setup is from the implementer; no Safari, CPU utilization, GPU duration or physical-device result.'};
writeFileSync(new URL('edge-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({status:result.status,assertions}));
