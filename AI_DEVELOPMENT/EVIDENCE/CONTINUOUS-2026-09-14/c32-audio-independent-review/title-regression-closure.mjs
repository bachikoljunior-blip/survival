import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { Audio as Revised } from './revised/src/audio/audio.js';
import { fixture, check, result, source, sha256, method, Candidate } from './lifecycle-fixture.mjs';

const MODE={PLAY:'play',TITLE:'title',MENU:'menu',LOADING:'loading'};
const pauseOpen=method('additional-source/screens.js','openPause',{t:(key,fallback)=>fallback});
const pauseClose=method('additional-source/screens.js','closePause');
const wireUI=method('source/src/game/game.js','_wireUI',{MODE,Storage:{hasSave:()=>true},__BUILD_ID__:'exact-method-fixture',isPortrait:()=>false});
const setMode=method('source/src/game/game.js','setMode',{MODE});
function uiFixture(Class=Revised,opts={}){
  const f=fixture(Class,opts),{g}=f,on=new Set();
  g.engine={on(){}};g.input={setEnabled(){}};
  g.setMode=setMode;
  Object.assign(g.menus,{game:g,fromTitle:false,openPause:pauseOpen,closePause:pauseClose,pauseNode:{classList:{add:k=>on.add(k),remove:k=>on.delete(k),contains:k=>on.has(k)}},saveButton:{style:{}},pauseTitle:{},panels:{settings:{tab:{style:{}}},status:{tab:{style:{}}}},showPanel(p){this.activePanel=p;},_flushSettings(){},setRotateVisible(){}});
  Object.assign(g.hud,{visible:true,setVisible(v){this.visible=v;}});
  wireUI.call(g);
  return f;
}
function inside(f,id){f.g.director.currentInterior=id;f.g.teleport(id+'_in');f.g.forcedMood=id==='cellar'?'under':'interior';f.step();}
for(const id of ['arcade','cellar']){
  const f=uiFixture(),{a,g,step}=f,expected=id==='cellar'?'under':'interior';inside(f,id);
  check(id+' gameplay remains indoors',a.ambienceState===expected);
  g.emit('ui:menu');step();
  check(id+' real game pause retains indoors',g.mode==='menu'&&!g.menus.fromTitle&&a.ambienceState===expected);
  g.menus.closePause();step();
  check(id+' real game pause close retains indoors',g.mode==='play'&&!g.menus.fromTitle&&a.ambienceState===expected);
  g.emit('ui:menu');step();await g.toTitle();step();
  const title={mode:g.mode,fromTitle:g.menus.fromTitle,position:{x:g.player.pos.x,y:g.player.pos.y,z:g.player.pos.z},currentInterior:g.director.currentInterior,ambience:a.ambienceState,reverb:Object.fromEntries(Object.entries(a.reverbs).map(([k,v])=>[k,v.gain.gain.calls.at(-1)?.value]))};
  result.observations.push({case:'revised-quit-'+id+'-to-title',...title});
  check(id+' exact toTitle closes original regression',g.mode==='title'&&g.player.pos.x===-128&&g.zone===null&&a.ambienceState==='street');
  check(id+' title selects outdoor reverb',title.reverb.street===.2&&title.reverb.interior===0&&title.reverb.tunnel===0);
  check(id+' title audio correction preserves director state',g.director.currentInterior===id);
  const calls=a.ambLayers.wind.gain.gain.calls.length;step();step();
  check(id+' title stable cache does not reschedule wind',a.ambLayers.wind.gain.gain.calls.length===calls);
  g.menus.openPause('settings',true);step();
  check(id+' real title settings stays outdoors',g.menus.fromTitle&&g.mode==='title'&&a.ambienceState==='street');
  // This alternate mode fixture isolates the fromTitle guard. openPause itself
  // leaves mode=title in the real current UI; the injected menu mode is labeled.
  g.setMode('menu');step();
  check(id+' fromTitle guard independent of mode in injected MENU fixture',g.menus.fromTitle&&a.ambienceState==='street');
  g.menus.closePause();step();
  check(id+' actual title settings close returns title after clearing flag',g.mode==='title'&&!g.menus.fromTitle&&a.ambienceState==='street');
  // Continuation boundary: restore the authored transform and PLAY mode. Save
  // loading is not being re-tested; the unchanged restore method sets this ID.
  g.teleport(id+'_in');g.setMode('play');step();
  check(id+' resume same interior ID invalidates effective title cache',a.ambienceState===expected&&g.director.currentInterior===id);
  g.emit('ui:menu');step();
  check(id+' subsequent ordinary pause keeps room after title settings',g.mode==='menu'&&!g.menus.fromTitle&&a.ambienceState===expected);
}
for(const id of ['arcade','cellar'])for(const titleSettings of [false,true]){
  const f=uiFixture(Revised,{unlock:false,preSync:false}),{a,g,step}=f;inside(f,id);await g.toTitle();
  if(titleSettings)g.menus.openPause('settings',true);
  step();f.unlockAudio();step();
  check(id+' real unlock after title transition settings='+titleSettings,a.ready&&a.unlocked&&a.ambienceState==='street'&&a.ambLayers.room.target===0&&a.reverbs.street.gain.gain.calls.at(-1)?.value===.2);
}
for(const id of ['arcade','cellar']){
  const f=uiFixture(Candidate);inside(f,id);await f.g.toTitle();f.step();
  check('negative control original candidate still fails title '+id,f.a.ambienceState!=='street');
  result.negativeControls.push({candidateSha256:sha256(source('candidate/src/audio/audio.js')),case:'original-title-'+id,detected:true,expected:'street',observed:f.a.ambienceState});
}
assert.equal(sha256(source('revised/src/audio/audio.js')),'22add12afa50de4632d43afb00d52789c7f473a0657affd70f3a855a5951d2b7');
result.scope='Focused closure of title/paused-title/game-pause routing, exact Audio constructor/unlock, Game.toTitle/_wireUI/setMode and Screens.openPause/closePause, inert WebAudio and DOM fixtures. One explicitly injected MENU/fromTitle combination. No browser/PCM/listening/quality claim.';
result.candidateSha256=sha256(source('revised/src/audio/audio.js'));
result.originalCandidateSha256=sha256(source('candidate/src/audio/audio.js'));
result.scriptSha256=sha256(source('title-regression-closure.mjs'));
result.status='passed; original P2 title-routing finding closed for revised SHA in exact-method CPU scope';
writeFileSync(new URL('title-regression-closure-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({checks:result.checks.length,negativeControls:result.negativeControls,observations:result.observations,status:result.status},null,2));
