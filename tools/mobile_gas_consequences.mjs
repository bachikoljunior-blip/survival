import { join } from 'node:path';
import { SAVE_KEY } from '../src/game/state.js';

export async function exerciseGasConsequences({page,root,output,check,report,waitFrames}) {
  const evidence=report.gasConsequences={
    browser:report.browser,
    scope:`Actual shipped City, choice graph, GasField, live navigation refresh, Director save and applySave in ${report.browser}. Programmatic scene setup and choice invocation exercise production handlers; these are not touch usability or enemy-trajectory measurements, and no reference-work blind comparison is claimed.`,
  };
  await page.evaluate(async()=>{const C=window.CINDERLINE;await C.startNewGame();C.game.teleport('stacks_yard');});
  await waitFrames(page,40);
  const sample=()=>{
    const C=window.CINDERLINE,g=C.game;
    const points=g.city.data.props.filter(p=>p.kind==='vent'&&p.id?.startsWith('vent_west_'))
      .map(p=>({id:p.id,x:p.x+2,z:p.z}));
    points.push({id:'yard_seep',x:-112,z:-84});
    return {time:g.time,gasTime:g.gas.time,gasRevision:g.gas.revision,costRevision:g.nav.costRevision,
      sources:g.gas.sources.filter(s=>s.id).map(s=>[s.id,s.active]),
      points:points.map(p=>{const i=g.nav.nearest(p.x,p.z,0);return {...p,ppm:g.gas.sample(p.x,1.4,p.z),
        cell:i,navCost:g.nav.cost[i],navPosition:g.nav._pt(i)};})};
  };
  evidence.before=await page.evaluate(sample);
  await page.screenshot({path:join(output,'gas-yard-before-choice.png')});
  evidence.choice=await page.evaluate(()=>{
    const d=window.CINDERLINE.game.director;
    d.startConversation(d.conversations.vent_decision,null);
    d.dialogue.choose(0);
    return {flag:d.state.has('vents_shut'),choice:d.state.choices.get('vents')};
  });
  await waitFrames(page,40);
  evidence.after=await page.evaluate(sample);
  await page.screenshot({path:join(output,'gas-yard-after-choice.png')});
  const active=new Map(evidence.after.sources);
  check(evidence.choice.flag&&evidence.choice.choice==='shut','gas: actual choice graph records closing the vents');
  check([1,2,3].every(i=>active.get(`vent_west_${i}`)===false),'gas: all three authored West Heads stop emitting');
  check(active.get('yard_seep')===true,'gas: closing the heads activates the authored receiving yard');
  for(let i=0;i<3;i++)check(evidence.after.points[i].ppm<evidence.before.points[i].ppm*.25,
    `gas: closed head ${i+1} has lower actual breathing-height concentration`,JSON.stringify(evidence.after.points[i]));
  check(evidence.after.points[3].ppm>evidence.before.points[3].ppm+500,
    'gas: the receiving yard becomes dangerous through the actual field',JSON.stringify(evidence.after.points[3]));
  check(evidence.after.costRevision>evidence.before.costRevision&&
    evidence.after.points[3].navCost>evidence.before.points[3].navCost+2,
    'gas: live simulation publishes the changed yard route cost');
  evidence.save=await page.evaluate(key=>{
    const g=window.CINDERLINE.game,d=g.director;
    const ok=d.save(true),raw=localStorage.getItem(key),payload=JSON.parse(raw);
    const rows=payload.gasSources.filter(([id])=>id.startsWith('vent_west_'));
    const beforeProgress=JSON.stringify({...payload.state,t:0});
    // Reproduce the old writer's omitted rows without altering the saved bytes.
    const legacy=structuredClone(payload);legacy.gasSources=legacy.gasSources.filter(([id])=>!id.startsWith('vent_west_'));
    const applied=d.applySave(legacy);
    const result={ok,bytes:raw.length,rows,applied,
      legacyFixture:'Actual current save cloned in memory with only West Heads source rows omitted, reproducing the historical writer defect. This is not an archived historical save.',
      sources:g.gas.sources.filter(s=>s.id?.startsWith('vent_west_')).map(s=>[s.id,s.active]),
      flag:d.state.has('vents_shut'),originalBytesKept:localStorage.getItem(key)===raw,
      progressionKept:JSON.stringify({...d.state.serialise(),t:0})===beforeProgress};
    return result;
  },SAVE_KEY);
  check(evidence.save.ok&&evidence.save.rows.length===3&&evidence.save.rows.every(([,on])=>!on),
    'gas: the actual save now includes all three closed source IDs');
  check(evidence.save.applied&&evidence.save.flag&&evidence.save.sources.length===3&&evidence.save.sources.every(([,on])=>!on),
    'gas: actual applySave restores a historical omitted-ID shape from its saved choice');
  check(evidence.save.originalBytesKept&&evidence.save.progressionKept,
    'gas: omitted-ID restoration preserves the original save bytes and unrelated progression',JSON.stringify(evidence.save));
  evidence.images=['gas-yard-before-choice.png','gas-yard-after-choice.png'].map(name=>join(output,name).slice(root.length+1));
  // A fresh run is essential: otherwise the already-closed choice would mask
  // the middle choice's own authored consequence and source restoration.
  await page.evaluate(async()=>{const C=window.CINDERLINE;await C.startNewGame();C.game.teleport('stacks_yard');});
  await waitFrames(page,40);
  evidence.half={before:await page.evaluate(sample)};
  evidence.half.choice=await page.evaluate(()=>{
    const d=window.CINDERLINE.game.director;
    d.startConversation(d.conversations.vent_decision,null);
    d.dialogue.choose(2);
    return {flag:d.state.has('vents_half'),choice:d.state.choices.get('vents')};
  });
  await waitFrames(page,40);
  evidence.half.after=await page.evaluate(sample);
  await page.screenshot({path:join(output,'gas-yard-half-choice.png')});
  evidence.images.push(join(output,'gas-yard-half-choice.png').slice(root.length+1));
  const halfActive=new Map(evidence.half.after.sources);
  check(evidence.half.choice.flag&&evidence.half.choice.choice==='half',
    'gas: actual choice graph records the middle vent choice');
  check(halfActive.get('vent_west_1')===true&&halfActive.get('vent_west_2')===false&&halfActive.get('vent_west_3')===true
    &&halfActive.get('yard_half_seep')===true&&halfActive.get('yard_seep')===false,
    'gas: middle choice closes only the middle head and activates only the weaker yard source');
  check(evidence.half.after.points[3].ppm>evidence.half.before.points[3].ppm+200
    &&evidence.half.after.points[3].ppm<evidence.after.points[3].ppm,
    'gas: middle choice raises actual yard exposure less than closing all heads',JSON.stringify(evidence.half.after.points[3]));
  check(evidence.half.after.costRevision>evidence.half.before.costRevision
    &&evidence.half.after.points[3].navCost>evidence.half.before.points[3].navCost+1,
    'gas: live navigation receives the middle choice yard exposure');
  evidence.half.save=await page.evaluate(key=>{
    const g=window.CINDERLINE.game,d=g.director,ok=d.save(true),raw=localStorage.getItem(key),payload=JSON.parse(raw);
    const oldShape=structuredClone(payload);
    oldShape.gasSources=oldShape.gasSources.filter(([id])=>!id.startsWith('vent_west_')&&id!=='yard_half_seep');
    const applied=d.applySave(oldShape);
    return {ok,applied,legacyFixture:'Current actual half-choice save cloned in memory, omitting historical missing West head rows and the newly introduced half-yard row; not archived historical bytes.',
      savedSources:payload.gasSources,sources:g.gas.sources.filter(s=>s.id).map(s=>[s.id,s.active]),
      originalBytesKept:localStorage.getItem(key)===raw,
      progressionKept:JSON.stringify({...d.state.serialise(),t:0})===JSON.stringify({...payload.state,t:0})};
  },SAVE_KEY);
  const restoredHalf=new Map(evidence.half.save.sources),savedHalf=new Map(evidence.half.save.savedSources);
  check(evidence.half.save.ok&&savedHalf.get('yard_half_seep')===true&&savedHalf.get('yard_seep')===false,
    'gas: actual middle-choice save records the distinct receiving source');
  check(evidence.half.save.applied&&restoredHalf.get('yard_half_seep')===true&&restoredHalf.get('yard_seep')===false
    &&restoredHalf.get('vent_west_2')===false&&restoredHalf.get('vent_west_1')===true&&restoredHalf.get('vent_west_3')===true,
    'gas: actual applySave restores omitted middle-choice source rows');
  check(evidence.half.save.originalBytesKept&&evidence.half.save.progressionKept,
    'gas: middle-choice restoration preserves original bytes and unrelated progression');
  evidence.remaining=['This browser run does not measure enemy trajectories, visibility or survival. Those require separate evidence.','All element-level reference comparisons remain not measured.'];
  await page.evaluate(()=>window.CINDERLINE.startNewGame());
}
