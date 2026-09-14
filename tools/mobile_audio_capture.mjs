/** Acquire actual production sound and its simultaneous native world video.
 * The extra output only records the final compressor signal; it never replaces
 * the audible destination, generates test tones, or edits the production mix.
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export async function captureMobileAudio({page, root, output, check, report, waitFrames}) {
  const evidence=report.audioCapture={
    browser:report.browser,
    scope:`Actual ${report.browser} production AudioContext and canvas recorded together by MediaRecorder. The unchanged final compressor feeds both the normal destination and a recording destination. Scene placement is programmatic setup; movement uses browser keyboard input through the production input path. Native world video excludes the DOM HUD. This records runner behavior, not physical speakers, touch, latency, phone frame rate or a reference-work blind comparison.`,
    clips:[],
    comparison:{status:'not measured',reason:'Recorded media still requires timing inspection, successful stereo listening and a valid reference comparison.'},
    captureSetting:'Supported production low graphics; audio mix, simulation step cap and playback rate unchanged.',
    telemetryScope:'Passive render and sfx listeners observe clocks, the engine camera used by Audio._spatial, live enemy poses, and emitted sfx metadata. Events are not a listening judgment; trajectories are sampled at most every 100 ms and missing actors are not invented.',
  };
  const original=await page.evaluate(()=>({...window.CINDERLINE.game.settings}));
  let captureFailure;
  try {
    await page.evaluate(async()=>{
      const C=window.CINDERLINE;
      await C.startNewGame();
      C.game.applySettings({...C.game.settings,quality:'low'});
    });
    // The ordinary trusted tap also exercises the real unlock listener after
    // prior recovery/reloads. Never create or resume a replacement context.
    await page.touchscreen.tap(330,100);
    const capabilities=await page.evaluate(()=>{
      const a=window.CINDERLINE.game.audio;
      return {ready:a.ready,unlocked:a.unlocked,state:a.ctx?.state,
        sampleRate:a.ctx?.sampleRate,channels:a.ctx?.destination.channelCount,
        recorder:typeof MediaRecorder==='function',
        canvasCapture:typeof document.getElementById('gl').captureStream==='function',
        mime:typeof MediaRecorder==='function'
          ? ['video/mp4','video/webm;codecs=vp8,opus','video/webm'].find(m=>MediaRecorder.isTypeSupported(m)) : null};
    });
    evidence.capabilities=capabilities;
    check(capabilities.ready&&capabilities.unlocked&&capabilities.state==='running',
      'audio: trusted gesture unlocks the actual running production context',JSON.stringify(capabilities));
    if(!capabilities.ready||capabilities.state!=='running'||!capabilities.recorder||!capabilities.canvasCapture||!capabilities.mime) {
      evidence.status='not measured';
      evidence.reason='This runner did not expose all required production audio/video capture capabilities.';
      return;
    }
    for(const [name,spawn,move] of [
      ['street-walk','start',true],['vent-air','ventfield',false],
      ['arcade-room','arcade_in',false],
    ]) {
      const placed=await page.evaluate(async spawn=>{
        const C=window.CINDERLINE;
        const door=spawn.endsWith('_in') ? C.city.interactions.find(i=>i.kind==='door'&&i.target===spawn) : null;
        let ok;
        if(door) {await C.game.director.enterDoor(door);ok=true;}
        else ok=C.game.teleport(spawn);
        return {ok,viaDoor:door?.id||null,interior:C.game.director.currentInterior,position:C.game.player.pos.toArray()};
      },spawn);
      if(!placed.ok) throw new Error(`missing audio scene spawn: ${spawn}`);
      await waitFrames(page,10);
      const before=await page.evaluate(mime=>{
        const C=window.CINDERLINE,a=C.game.audio,canvas=document.getElementById('gl');
        let destination,recorder,connected=false;
        const tracks=[];
        const chunks=[];
        const state=()=>({wallMs:performance.now(),audioTime:a.ctx.currentTime,
          audioState:a.ctx.state,engineFrame:C.engine.frame,engineTime:C.engine.time,
          position:C.game.player.pos.toArray(),hp:C.game.player.hp,dead:C.game.player.dead,
          mode:C.game.mode,tier:C.engine.tier.name,ambience:a.ambienceState,music:a.musicState,
          master:a.masterGain.gain.value,musicVolume:a.musicGain.gain.value,sfxVolume:a.sfxGain.gain.value,
          activeVoices:a._voiceList.length});
        const telemetry={clockFrames:[],trajectory:[],sfxEvents:[],
          dropped:{clockFrames:0,trajectory:0,sfxEvents:0},errors:[]};
        const offTelemetry=[];
        const append=(key,item,limit)=>{
          if(telemetry[key].length<limit) telemetry[key].push(item);
          else telemetry.dropped[key]++;
        };
        const clock=()=>({wallMs:performance.now(),audioTime:a.ctx.currentTime,
          audioState:a.ctx.state,engineTime:C.engine.time,engineFrame:C.engine.frame,
          mode:C.game.mode,paused:C.engine.isPaused,tier:C.engine.tier.name});
        // This is the actual listener used by Audio._spatial, not player yaw.
        const listener=()=>{
          const cam=C.engine.camera,e=cam.matrixWorld.elements;
          return {position:cam.position.toArray(),right:[e[0],e[1],e[2]],
            forward:[-e[8],-e[9],-e[10]],matrixWorld:Array.from(e)};
        };
        const safeRead=fn=>{
          try {fn();} catch(error) {
            if(telemetry.errors.length<8) telemetry.errors.push(error.message||String(error));
          }
        };
        let lastPoseMs=-Infinity;
        const sampleFrame=()=>safeRead(()=>{
          const t=clock();append('clockFrames',t,4096);
          if(t.wallMs-lastPoseMs<100) return;
          lastPoseMs=t.wallMs;
          append('trajectory',{...t,listener:listener(),
            player:{position:C.game.player.pos.toArray(),yaw:C.game.player.yaw,
              velocity:C.game.player.vel.toArray()},
            region:C.game.zone?.id||null,gasPpm:C.game.player.ambientPpm,
            threats:C.game.actors.filter(actor=>actor!==C.game.player&&typeof actor.aiState==='string')
              .map(actor=>({id:actor.id,kind:actor.kind,faction:actor.faction,
                aiState:actor.aiState,aggro:actor.aggro,dead:actor.dead,
                position:actor.pos.toArray(),velocity:actor.vel.toArray(),yaw:actor.yaw}))},1024);
        });
        const sampleSfx=(name,opts)=>safeRead(()=>{
          const options={};
          for(const [key,value] of Object.entries(opts||{})) {
            if(value===null||['number','string','boolean'].includes(typeof value)) options[key]=value;
          }
          append('sfxEvents',{...clock(),name,options,listener:listener(),
            ready:a.ready,unlocked:a.unlocked},1024);
        });
        const stopTelemetry=()=>{
          const errors=[];
          while(offTelemetry.length) {try {offTelemetry.pop()();} catch(error) {errors.push(error);}}
          if(errors.length) throw new AggregateError(errors,'audio telemetry cleanup failed');
        };
        let rejectStopped;
        const cleanup=()=>{
          const errors=[];
          try {stopTelemetry();} catch(e) {errors.push(e);}
          try {if(recorder&&recorder.state!=='inactive') recorder.stop();} catch(e) {errors.push(e);}
          try {if(connected) {a.comp.disconnect(destination);connected=false;}} catch(e) {errors.push(e);}
          for(const track of tracks) {try {track.stop();} catch(e) {errors.push(e);}}
          delete C.__audioRecording;
          if(errors.length) throw new AggregateError(errors,`audio capture cleanup failed: ${errors.map(e=>e.message||String(e)).join('; ')}`);
        };
        try {
          destination=a.ctx.createMediaStreamDestination();
          tracks.push(...destination.stream.getAudioTracks());
          const video=canvas.captureStream();
          tracks.push(...video.getVideoTracks());
          const stream=new MediaStream(tracks);
          recorder=new MediaRecorder(stream,{mimeType:mime});
          const stopped=new Promise((resolve,reject)=>{
            rejectStopped=reject;
            recorder.ondataavailable=e=>{if(e.data.size) chunks.push(e.data);};
            recorder.onerror=e=>reject(e.error||new Error('MediaRecorder error'));
            recorder.onstop=()=>resolve(new Blob(chunks,{type:recorder.mimeType}));
          });
          stopped.catch(()=>{});
          a.comp.connect(destination);connected=true;
          recorder.start(1000);
          offTelemetry.push(C.engine.on('render',sampleFrame));
          offTelemetry.push(C.game.on('sfx',sampleSfx));
          sampleFrame();
          C.__audioRecording={recorder,stopped,state,cleanup,rejectStopped,telemetry,stopTelemetry};
          return {state:state(),mime:recorder.mimeType,
            tracks:stream.getTracks().map(t=>({kind:t.kind,state:t.readyState,settings:t.getSettings()})),
            canvas:{width:canvas.width,height:canvas.height}};
        } catch(error) {
          try {cleanup();} catch(cleanupError) {throw new AggregateError([error,cleanupError],`audio capture setup failed: ${error.message}; ${cleanupError.message}`);}
          throw error;
        }
      },capabilities.mime);
      let captured;
      let recordingFailure;
      try {
        if(move) await page.keyboard.down('w');
        await page.waitForTimeout(2500);
        if(move) await page.keyboard.up('w');
        await page.waitForTimeout(3500);
        captured=await page.evaluate(async()=>{
          const rec=window.CINDERLINE.__audioRecording;
          const after=rec.state();
          rec.stopTelemetry();
          const telemetry=rec.telemetry;
          const timeout=setTimeout(()=>rec.rejectStopped(new Error('audio recorder stop timed out')),15000);
          let failure;
          try {
            rec.recorder.stop();
            const blob=await rec.stopped,bytes=new Uint8Array(await blob.arrayBuffer());
            let binary='';for(let i=0;i<bytes.length;i+=32768) binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
            return {after,telemetry,mime:blob.type,bytes:bytes.length,base64:btoa(binary)};
          } catch(error) {failure=error;throw error;}
          finally {
            clearTimeout(timeout);
            try {rec.cleanup();} catch(error) {throw new Error(`${failure ? `audio recording failed: ${failure.message}; ` : ''}${error.message}`);}
          }
        });
      } catch(error) {recordingFailure=error;throw error;}
      finally {
        const failures=[];
        try {await page.keyboard.up('w');} catch(error) {failures.push(error);}
        try {await page.evaluate(()=>window.CINDERLINE.__audioRecording?.cleanup());} catch(error) {failures.push(error);}
        if(failures.length) throw new Error([recordingFailure,...failures].filter(Boolean).map(e=>e.message).join('; '));
      }
      const bytes=Buffer.from(captured.base64,'base64');delete captured.base64;
      if(bytes.length!==captured.bytes||bytes.length===0) throw new Error('empty or truncated audiovisual recording');
      const extension=captured.mime.includes('mp4')?'mp4':'webm',path=join(output,`audio-${name}.${extension}`);
      writeFileSync(path,bytes);
      captured.timing=summarizeAudioCaptureTiming(before.state,captured.after,captured.telemetry);
      evidence.clips.push({name,spawn,input:move?'W down for 2.5 seconds, then release':'No movement input',placed,before,...captured,
        path:path.slice(root.length+1),sha256:createHash('sha256').update(bytes).digest('hex')});
      check(captured.timing.captureClockGuardPassed,
        `audio ${name}: wall, audio and simulation clocks stay aligned for capture`,JSON.stringify(captured.timing));
      check(captured.timing.telemetryComplete,
        `audio ${name}: passive clock and pose telemetry is complete`,JSON.stringify({dropped:captured.telemetry.dropped,errors:captured.telemetry.errors}));
      check(captured.after.audioState==='running'&&captured.after.audioTime>before.state.audioTime+4
        &&captured.after.engineFrame>before.state.engineFrame,
        `audio ${name}: audio and real game clocks advance during recording`,JSON.stringify(captured.after));
      check(before.tracks.filter(t=>t.kind==='video'&&t.state==='live').length===1
        &&before.tracks.filter(t=>t.kind==='audio'&&t.state==='live').length===1,
        `audio ${name}: simultaneous live native video and production audio tracks`);
      check(captured.after.position.every(Number.isFinite)&&!captured.after.dead,
        `audio ${name}: recording ends in finite live gameplay`);
    }
    evidence.status='captured';
    evidence.nextValidation='Decode the saved media; verify non-silent stereo audio and nonempty moving video, then listen to the actual mix. A present track or nonzero byte count is not an audio-quality verdict.';
  } catch(error) {captureFailure=error;throw error;}
  finally {
    const failures=[];
    try {await page.keyboard.up('w');} catch(error) {failures.push(error);}
    try {
      await page.evaluate(settings=>{
        const C=window.CINDERLINE,errors=[];
        try {C.__audioRecording?.cleanup();} catch(error) {errors.push(error);}
        try {C.game.applySettings(settings);} catch(error) {errors.push(error);}
        if(errors.length) throw new Error(errors.map(e=>e.message||String(e)).join('; '));
      },original);
    } catch(error) {failures.push(error);}
    if(failures.length) throw new Error([captureFailure,...failures].filter(Boolean).map(e=>e.message).join('; '));
  }
}

/** Acquisition guard only; a passing guard is not an audio-quality verdict.
 * Five percent or 100 ms (whichever is larger) accommodates endpoint sampling
 * and reports major clock drift. The original durations and ratios are retained
 * even on failure. This never resamples media or advances the engine manually.
 */
export function summarizeAudioCaptureTiming(before,after,telemetry) {
  const wallSeconds=(after.wallMs-before.wallMs)/1000;
  const audioSeconds=after.audioTime-before.audioTime;
  const engineSeconds=after.engineTime-before.engineTime;
  const engineFrames=after.engineFrame-before.engineFrame;
  const valid=[wallSeconds,audioSeconds,engineSeconds,engineFrames].every(Number.isFinite)
    &&wallSeconds>0&&audioSeconds>0&&engineSeconds>0&&engineFrames>0;
  const toleranceSeconds=Math.max(0.1,audioSeconds*0.05);
  const finiteTimeline=telemetry.clockFrames.every(t=>
    [t.wallMs,t.audioTime,t.engineTime,t.engineFrame].every(Number.isFinite));
  const orderedTimeline=telemetry.clockFrames.every((t,i,frames)=>i===0||
    (t.wallMs>=frames[i-1].wallMs&&t.audioTime>=frames[i-1].audioTime
      &&t.engineTime>=frames[i-1].engineTime&&t.engineFrame>=frames[i-1].engineFrame));
  const finiteVector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
  const finitePoses=telemetry.trajectory.every(t=>finiteVector(t.listener.position)
    &&finiteVector(t.listener.right)&&finiteVector(t.listener.forward)
    &&finiteVector(t.player.position)&&finiteVector(t.player.velocity)
    &&t.threats.every(actor=>finiteVector(actor.position)&&finiteVector(actor.velocity)));
  const telemetryComplete=telemetry.errors.length===0&&Object.values(telemetry.dropped).every(n=>n===0)
    &&telemetry.clockFrames.length>1&&telemetry.trajectory.length>1
    &&finiteTimeline&&orderedTimeline&&finitePoses;
  return {wallSeconds,audioSeconds,engineSeconds,engineFrames,
    engineToAudioRatio:audioSeconds>0?engineSeconds/audioSeconds:null,
    audioToWallRatio:wallSeconds>0?audioSeconds/wallSeconds:null,
    engineMinusAudioSeconds:engineSeconds-audioSeconds,
    audioMinusWallSeconds:audioSeconds-wallSeconds,
    toleranceSeconds,captureGuardScope:'Acquisition clock guard only; no quality or reference-comparison pass.',
    captureClockGuardPassed:valid&&before.audioState==='running'&&after.audioState==='running'
      &&Math.abs(engineSeconds-audioSeconds)<=toleranceSeconds
      &&Math.abs(audioSeconds-wallSeconds)<=toleranceSeconds,
    telemetryComplete,finiteTimeline,orderedTimeline,finitePoses};
}
