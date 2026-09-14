/** Actual production-world evidence, separate from performance or blind verdicts. */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import { captureShadowContact } from './mobile_shadow_contact.mjs';
import { captureCharacterGroundContact } from './mobile_character_ground_contact.mjs';
import { captureShadowResolution } from './mobile_shadow_resolution.mjs';
import { captureLightDirectionTrial } from './mobile_light_direction_trial.mjs';
import { captureGrainTrial } from './mobile_grain_trial.mjs';

// Eight authored, playable exterior locations spanning the city's districts.
// These are existing spawn points, not new geometry or constructed test scenes.
const VIEWS = [
  ['stacks', 'start', 0, -4],
  ['marrow', 'marrow_west', 270, -3],
  ['arcade', 'arcade_out', 180, -4],
  ['cinder', 'cinder_road', 0, -4],
  ['survey', 'survey_out', 0, -4],
  ['ventfield', 'ventfield', 270, -3],
  ['south', 'south_marrow', 270, -3],
  ['plant', 'plant_out', 0, -5],
  ['marrow_roof', null, 90, -6, [-60,11.4,-16]],
];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');

export async function captureMobileViews({ page, root, output, check, report, waitFrames }) {
  const original = await page.evaluate(() => ({...window.CINDERLINE.game.settings}));
  report.visualViews = {
    scope: 'Eight existing exterior spawn points plus the repository\'s Marrow roof inspection coordinate, in a fresh production game with real simulation settling and the normal player camera. Medium quality is explicitly selected through the actual settings API. Only the DOM HUD is hidden for the world-image capture; no materials, lighting, geometry, postprocessing or pixel content are edited. These images do not establish traversal, animation quality, every interior, a blind comparison or a physical device result.',
    setup: 'Programmatic new game and teleport are test setup, not a claim of playing the route.',
    views: [],
  };
  try {
    await page.evaluate(async () => {
      const C=window.CINDERLINE;
      await C.startNewGame();
      C.game.applySettings({...C.game.settings, quality:'medium', uiScale:1, leftHanded:false, language:'ja'});
    });
    for (const [name,spawn,yaw,pitch,position] of VIEWS) {
      const placed = await page.evaluate(({spawn,yaw,pitch,position}) => {
        const C=window.CINDERLINE;
        const ok=position ? (C.game.player.placeAt(...position),true) : C.game.teleport(spawn);
        C.game.camera.yaw=yaw*Math.PI/180;
        C.game.camera.pitch=pitch*Math.PI/180;
        C.game.camera._init=false;
        C.game.camera._manualT=999;
        C.atmos.shadowDirty=true;
        return {ok,spawn:C.city.spawns.get(spawn),inspectionPosition:position,frame:C.engine.frame};
      }, {spawn,yaw,pitch,position});
      if (!placed.ok) throw new Error(`missing authored visual spawn: ${spawn}`);
      await waitFrames(page,12);
      const captured=await page.evaluate(() => {
        const C=window.CINDERLINE, p=C.game.player, r=C.engine.renderer;
        const wasRunning=C.engine.running;
        C.engine.stop();
        try {
          // The real game updates its camera, visibility and render uniforms.
          C.game.render(0);
          const framePng=r.domElement.toDataURL('image/png');
          r.getContext().finish();
          const ui=document.getElementById('ui');
          const result={framePng,frame:C.engine.frame,time:C.engine.time,
            mode:C.game.mode,playMode:C.MODE.PLAY,paused:C.engine.isPaused,
            tier:C.engine.tier.name,settings:{...C.game.settings},perf:C.engine.perfSnapshot(),
            player:{position:p.pos.toArray(),yaw:p.yaw,hp:p.hp,dead:p.dead,grounded:p.grounded,state:p.state,visible:p.group.visible},
            camera:{position:C.engine.camera.position.toArray(),quaternion:C.engine.camera.quaternion.toArray(),
              fov:C.engine.camera.fov,aspect:C.engine.camera.aspect,near:C.engine.camera.near,far:C.engine.camera.far},
            wasRunning,uiDisplay:ui.style.display};
          // Native canvas never contained the HUD. Hide it only for a matching
          // viewport screenshot; restore it before the separate HUD evidence.
          ui.style.display='none';
          return result;
        } catch(error) { if(wasRunning) C.engine.start(); throw error; }
      });
      try {
        const bytes=Buffer.from(captured.framePng.split(',')[1],'base64');
        delete captured.framePng;
        const png=PNG.sync.read(bytes);
        const native=join(output,`visual-${name}-frame.png`);
        writeFileSync(native,bytes);
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        const viewport=join(output,`visual-${name}-viewport.png`);
        await page.screenshot({path:viewport});
        await page.evaluate(display=>{document.getElementById('ui').style.display=display;},captured.uiDisplay);
        const hud=join(output,`visual-${name}-hud.png`);
        await page.screenshot({path:hud});
        check(captured.tier==='medium' && captured.mode===captured.playMode && !captured.paused,
          `visual ${name}: live medium-quality gameplay`);
        check(captured.player.visible && captured.player.grounded && !captured.player.dead && captured.player.hp>0
          && [...captured.player.position,captured.player.hp,...captured.camera.position,...captured.camera.quaternion].every(Number.isFinite),
          `visual ${name}: player settles alive on the real ground`,JSON.stringify(captured.player));
        check(captured.frame>=placed.frame+12 && captured.perf.draws>0 && captured.perf.tris>0,
          `visual ${name}: real simulation and non-empty render`,JSON.stringify(captured.perf));
        report.visualViews.views.push({name,spawn,requested:{yaw,pitch},placed,...captured,
          native:{path:native.slice(root.length+1),width:png.width,height:png.height,pngSha256:digest(bytes),rgbaSha256:digest(png.data)},
          viewport:viewport.slice(root.length+1),hud:hud.slice(root.length+1)});
        if (process.env.CINDERLINE_GRAIN_TRIAL === '1' && name !== 'marrow_roof') {
          await captureGrainTrial({page,root,output,name,cachedFrame:native,check,report});
        }
        if (process.env.CINDERLINE_LIGHT_DIRECTION_TRIAL === '1' && name !== 'marrow_roof') {
          await captureLightDirectionTrial({page,root,output,name,cachedFrame:native,check,report});
        }
        if(['stacks','arcade','cinder','ventfield','marrow_roof'].includes(name)) {
          await captureShadowContact({page,root,output,name,cachedFrame:native,check,report});
        }
        if(process.env.CINDERLINE_CHARACTER_CONTACT==='1' && name!=='marrow_roof') {
          await captureCharacterGroundContact({page,root,output,name,cachedFrame:native,
            controlBias:['arcade','south'].includes(name),check,report});
        }
        if(process.env.CINDERLINE_SHADOW_RESOLUTION==='1' && ['arcade','south'].includes(name)) {
          await captureShadowResolution({page,root,output,name,cachedFrame:native,check,report});
        }
      } finally {
        await page.evaluate(({wasRunning,uiDisplay}) => {
          document.getElementById('ui').style.display=uiDisplay;
          if(wasRunning) window.CINDERLINE.engine.start();
        }, captured);
      }
    }
  } finally {
    await page.evaluate(settings=>window.CINDERLINE.game.applySettings(settings),original);
  }
}
