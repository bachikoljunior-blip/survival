import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { buildCpuCity, THREE } from './cpu-city-fixture-v2.mjs';
import { Game, MODE } from './survival/src/game/game.js';
import { Director } from './survival/src/game/director.js';
import { Enemy, ARCHETYPES } from './survival/src/game/ai.js';
import { Atmosphere, MOODS } from './survival/src/render/atmosphere.js';
import { worldUniforms } from './survival/src/render/materials.js';
import { TIERS } from './survival/src/core/engine.js';

const ROOT = new URL('./survival/', import.meta.url);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const floatHash = a => sha(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
const sourcePaths = ['src/world/gas.js','src/world/nav.js','src/world/city.js',
  'src/game/game.js','src/game/director.js','src/game/ai.js','src/actors/actor.js',
  'src/render/atmosphere.js','src/render/materials.js','src/render/postfx.js','src/content/world_data.js'];
const sourceHashes = Object.fromEntries(sourcePaths.map(p => [p, sha(readFileSync(new URL(p, ROOT)))]));
const commit = execFileSync('git',['rev-parse','HEAD'],{cwd:ROOT,encoding:'utf8'}).trim();

const control = buildCpuCity();
const treated = buildCpuCity();
assert.equal(floatHash(control.city.nav.cost),floatHash(treated.city.nav.cost));

function gameFor(city) {
  return {time:0,playTime:0,mode:MODE.PLAY,input:{step(){}},gas:city.gas,nav:city.nav,
    city,actors:[],player:null,systems:[],_playerInput(){},_updateZone:Game.prototype._updateZone};
}
const controlGame = gameFor(control.city), treatedGame = gameFor(treated.city);
const effects = [];
treatedGame.atmos = {
  setMarkerActive:(...args)=>effects.push({type:'marker',args}),
  plumes:{setAnchorActive:(...args)=>effects.push({type:'plume',args})},
};
treatedGame.hud = {notice:(...args)=>effects.push({type:'notice',args})};
const costBefore = new Float32Array(treated.city.nav.cost);
Director.prototype._hooks.call({game:treatedGame}).shutVents();
for (let n=0;n<60;n++) {
  Game.prototype.fixedUpdate.call(controlGame,1/60);
  Game.prototype.fixedUpdate.call(treatedGame,1/60);
}

const nav = treated.city.nav;
let increased = 0, decreased = 0, actualCostChanged = 0;
let peakIncrease = null, peakDecrease = null;
for (let i=0;i<nav.height.length;i++) {
  if (Number.isNaN(nav.height[i])) continue;
  const x=nav.xOf(i%nav.nx), y=nav.height[i], z=nav.zOf((i/nav.nx)|0);
  const before=control.city.gas.sample(x,y+1.02,z), after=treated.city.gas.sample(x,y+1.02,z);
  const delta=after-before;
  const row={cell:i,x,y,z,controlPpm:before,treatedPpm:after,deltaPpm:delta,storedCost:nav.cost[i]};
  if(delta>1)increased++;
  if(delta<-1)decreased++;
  if(!peakIncrease||delta>peakIncrease.deltaPpm)peakIncrease=row;
  if(!peakDecrease||delta<peakDecrease.deltaPpm)peakDecrease=row;
  if(nav.cost[i]!==costBefore[i])actualCostChanged++;
}
const unchangedHash = floatHash(nav.cost);
nav.applyGasCost(treated.city.gas);
let requiredCostChanges=0,maxCostChange=0;
for(let i=0;i<nav.cost.length;i++) {
  if(nav.cost[i]!==costBefore[i])requiredCostChanges++;
  maxCostChange=Math.max(maxCostChange,Math.abs(nav.cost[i]-costBefore[i]));
}
const refreshedHash=floatHash(nav.cost);
nav.cost.set(costBefore);

const mats={character:()=>new THREE.MeshStandardMaterial({color:0xffffff})};
function stationaryVitals(gas,p) {
  const enemy=new Enemy('scav',{x:p.x,y:p.y,z:p.z,gas,mats,weapon:null,seed:17});
  const initialHp=enemy.hp,dt=1/60;
  let duration=0;
  for(let i=0;i<600*60&&!enemy.dead;i++) {
    enemy._updateVitals(dt,null);
    duration=(i+1)*dt;
  }
  return {initialHp,hp:enemy.hp,dead:enemy.dead,saturation:enemy.lungs.sat,
    ambientPpm:enemy.ambientPpm,elapsedSeconds:duration,height:enemy.height,
    scope:'Actual Enemy constructor and Actor._updateVitals/Lungs; stationary rest exposure to the field frozen at one second, no movement/combat/rendering.'};
}
const consequences=[peakIncrease,peakDecrease].map(p=>({
  point:p,
  sight:{
    control:Enemy.prototype.sightRange.call({arch:ARCHETYPES.scav,pos:p},control.city.gas),
    treated:Enemy.prototype.sightRange.call({arch:ARCHETYPES.scav,pos:p},treated.city.gas),
    scope:'Actual sightRange function; no canSee/line-of-sight gameplay or rendered visibility claim.'
  },
  survival:{control:stationaryVitals(control.city.gas,p),treated:stationaryVitals(treated.city.gas,p)},
}));

function uniformSnapshot() {
  return Object.fromEntries(Object.entries(worldUniforms).map(([key,{value}])=>[
    key,value&&typeof value.clone==='function'?value.clone():value]));
}
function restoreUniforms(snapshot) {
  for(const [key,value]of Object.entries(snapshot)) {
    const target=worldUniforms[key].value;
    if(target&&typeof target.copy==='function')target.copy(value);
    else worldUniforms[key].value=value;
  }
}
const initialUniforms=uniformSnapshot();
function uniformRun(gasPpm) {
  restoreUniforms(initialUniforms);
  const inert={update(){}};
  const atmosphere={time:0,_mood:MOODS.street,tier:TIERS.medium,exposureBias:1,
    hemi:new THREE.HemisphereLight(),sun:new THREE.DirectionalLight(),emberFill:new THREE.PointLight(),
    skyMat:{uniforms:{uGlowStrength:{value:0}}},sky:new THREE.Object3D(),camera:new THREE.PerspectiveCamera(),
    _updateLights(){},ash:inert,embers:inert,plumes:inert,burst:inert};
  Atmosphere.prototype.update.call(atmosphere,1/60,new THREE.Vector3(0,0,0),gasPpm);
  return {fogDensity:worldUniforms.uFogDensity.value,fogHeight:worldUniforms.uFogHeight.value,
    fogLow:worldUniforms.uFogColorLow.value.toArray(),fogHigh:worldUniforms.uFogColorHigh.value.toArray()};
}
const lowUniforms=uniformRun(12),highUniforms=uniformRun(5000);
restoreUniforms(initialUniforms);

const result={checkedAt:new Date().toISOString(),commit,sourceHashes,
  fixture:{path:'cpu-city-fixture-v2.mjs',sha256:sha(readFileSync(new URL('./cpu-city-fixture-v2.mjs',import.meta.url))),
    scope:'Actual full City.build geometry/collision/navigation/gas; Canvas drawing/text and surface appearance are substituted. No browser/server/GPU.'},
  operation:'Actual Director._hooks().shutVents, then paired actual Game.fixedUpdate calls for 60 fixed 1/60 s steps.',
  gasSources:treated.city.gas.sources.filter(s=>s.id==='yard_seep'||s.id?.startsWith('vent_west_')),
  effects,navStats:nav.stats,
  dynamicCost:{increasedPpmCells:increased,decreasedPpmCells:decreased,actualCostChanged,
    costBeforeSha256:floatHash(costBefore),costAfterRuntimeSha256:unchangedHash,
    manuallyRefreshedCostSha256:refreshedHash,requiredCostChanges,maxCostChange,
    note:'The manual refresh is a diagnostic counterfactual; it is not performed by the actual update path.'},
  consequences,
  renderedFogInput:{lowPpm:12,highPpm:5000,lowUniforms,highUniforms,
    same:JSON.stringify(lowUniforms)===JSON.stringify(highUniforms),
    scope:'Actual Atmosphere.update called with real Three value objects and inert particle/light-pool updates; only shared fog values measured, no GPU or pixels.'},
};
writeFileSync(new URL('./gas-consequence-cpu-evidence.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({commit,dynamicCost:result.dynamicCost,consequences:result.consequences,
  fogUniformsSame:result.renderedFogInput.same,evidence:'gas-consequence-cpu-evidence.json'}));
