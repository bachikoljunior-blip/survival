/** Measure actual rendered action targets at supported interface scales. */
import { join } from 'node:path';

export async function exerciseMobileLayout({page,root,output,check,report}) {
  const original=await page.evaluate(()=>({...window.CINDERLINE.game.settings}));
  report.scaledTouchLayout={scope:'Actual WebKit DOM geometry for the nine persistent gameplay targets, at three supported scales and both handedness settings. Settings are programmatic test setup; this does not measure reach, physical multitouch or the conditional interaction target.',cases:[]};
  report.scaledTouchLayout.scope=report.scaledTouchLayout.scope.replace('WebKit',report.browser);
  await page.evaluate(()=>window.CINDERLINE.engine.addPause('layout-measurement'));
  try {
    for(const leftHanded of [false,true]) for(const uiScale of [0.8,1,1.5]) {
      await page.evaluate(settings=>window.CINDERLINE.game.applySettings(settings),{...original,uiScale,leftHanded});
      await page.waitForTimeout(250); // Let the actual CSS transition finish.
      const measured=await page.evaluate(()=>{
        const C=window.CINDERLINE, h=C.game.hud;
        const nodes={...h.buttons,menu:h.sysMenu,map:h.sysMap,lamp:h.sysLamp,meter:h.sysMeter};
        const targets=Object.entries(nodes).map(([name,node])=>{
          const r=node.getBoundingClientRect(),s=getComputedStyle(node);
          return {name,x:r.x,y:r.y,width:r.width,height:r.height,visible:s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>0};
        });
        const overlaps=[];
        for(let i=0;i<targets.length;i++) for(let j=i+1;j<targets.length;j++) {
          const a=targets[i],b=targets[j];
          const w=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x);
          const h=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);
          if(w>0&&h>0) overlaps.push({a:a.name,b:b.name,area:w*h});
        }
        return {targets,overlaps,width:innerWidth,height:innerHeight,language:C.game.settings.language,
          appliedScale:C.game.settings.uiScale,appliedLeftHanded:C.game.settings.leftHanded,
          cssScale:Number(getComputedStyle(document.documentElement).getPropertyValue('--uiscale')),
          handedClass:document.body.classList.contains('lefthanded')};
      });
      const name=`scale ${uiScale}, ${leftHanded?'left':'right'} handed`;
      check(measured.appliedScale===uiScale && measured.cssScale===uiScale && measured.appliedLeftHanded===leftHanded && measured.handedClass===leftHanded,
        `${name}: requested settings reached both game state and CSS`);
      check(measured.targets.length===9 && measured.targets.every(t=>t.visible&&t.width>=44&&t.height>=44),
        `${name}: all nine persistent targets meet the 44 CSS px floor`,JSON.stringify(measured.targets));
      check(measured.targets.every(t=>t.x>=0&&t.y>=0&&t.x+t.width<=measured.width&&t.y+t.height<=measured.height),
        `${name}: targets stay within the viewport`);
      check(measured.overlaps.length===0,`${name}: persistent targets do not overlap`,JSON.stringify(measured.overlaps));
      const file=join(output,`touch-${leftHanded?'left':'right'}-${uiScale}.png`);
      await page.screenshot({path:file});
      report.scaledTouchLayout.cases.push({uiScale,leftHanded,...measured,screenshot:file.slice(root.length+1)});
    }
    for(const scale of [0.8,1,1.5]) {
      const right=report.scaledTouchLayout.cases.find(c=>!c.leftHanded&&c.uiScale===scale);
      const left=report.scaledTouchLayout.cases.find(c=>c.leftHanded&&c.uiScale===scale);
      const deltas=right.targets.filter(t=>['attack','dodge','guard','use','heavy'].includes(t.name)).map(r=>{
        const l=left.targets.find(t=>t.name===r.name);
        return {name:r.name,x:Math.abs(l.x-(right.width-r.x-r.width)),y:Math.abs(l.y-r.y)};
      });
      check(deltas.length===5 && deltas.every(d=>d.x<0.05&&d.y<0.05),
        `scale ${scale}: left-handed action geometry mirrors right-handed geometry`,JSON.stringify(deltas));
    }
  } finally {
    await page.evaluate(settings=>{
      const C=window.CINDERLINE;C.game.applySettings(settings);C.engine.removePause('layout-measurement');
    },original);
  }
}
