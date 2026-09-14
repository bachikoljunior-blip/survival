import { buildCpuCity } from './cpu-city-fixture-v2.mjs';
import { Director } from './survival/src/game/director.js';
import { Game, MODE } from './survival/src/game/game.js';
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const {city,data}=buildCpuCity();
const props=data.props.filter(p=>p.kind==='vent'&&p.id?.startsWith('vent_west_'));
const pairs=props.map(p=>({prop:p,sources:city.gas.sources.filter(s=>s.x===p.x&&s.z===p.z)}));
const before=pairs.map(({prop,sources})=>({propId:prop.id,propGasId:prop.gasId??null,x:prop.x,z:prop.z,
  sources:sources.map(s=>({...s})),ppmAtSide:city.gas.sample(prop.x+2,1.4,prop.z)}));
const calls=[];
const actualSet=city.gas.setSourceActive;
city.gas.setSourceActive=function(id,active){const result=actualSet.call(this,id,active);calls.push({id,active,result});return result;};
const game={time:0,playTime:0,mode:MODE.PLAY,input:{step(){}},gas:city.gas,nav:city.nav,city,
  actors:[],player:null,systems:[],_playerInput(){},_updateZone:Game.prototype._updateZone,
  atmos:{setMarkerActive(){},plumes:{setAnchorActive(){}}},hud:{notice(){}}};
const hook=Director.prototype._hooks.call({game}).shutVents;
hook();
for(let i=0;i<60;i++)Game.prototype.fixedUpdate.call(game,1/60);
const after=pairs.map(({prop,sources})=>({propId:prop.id,sources:sources.map(s=>({...s})),
  ppmAtSide:city.gas.sample(prop.x+2,1.4,prop.z)}));
const originalHookCalls=calls.splice(0);
// Diagnostic counterfactual only: align in-memory source IDs with the existing
// authored prop IDs and execute the same hook/bake. No repository change.
for(const {prop,sources}of pairs)for(const s of sources)s.id=prop.id;
hook();city.gas.bake();
const afterIdAlignment=pairs.map(({prop,sources})=>({propId:prop.id,sources:sources.map(s=>({...s})),
  ppmAtSide:city.gas.sample(prop.x+2,1.4,prop.z)}));
const result={checkedAt:new Date().toISOString(),commit:execFileSync('git',['rev-parse','HEAD'],{cwd:new URL('./survival/',import.meta.url),encoding:'utf8'}).trim(),
  scope:'Actual full City, authored data, GasField, Director shutVents hook and Game.fixedUpdate; Canvas appearance, HUD, marker/plume methods and actors are substitutes/absent. No browser.',
  before,originalHookCalls,after,diagnosticCounterfactual:{method:'Only in-memory gas source IDs aligned to authored prop IDs, followed by the same hook and actual bake at unchanged gas.time.',calls,after:afterIdAlignment},
  sourceHashes:Object.fromEntries(['src/world/city.js','src/content/world_data.js','src/game/director.js','src/world/gas.js'].map(p=>[p,createHash('sha256').update(readFileSync(new URL('./survival/'+p,import.meta.url))).digest('hex')]))};
writeFileSync(new URL('./gas-vent-id-cpu-evidence.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
