/** Trusted UI taps drive the production guard state, not a simulated latch. */
import { join } from 'node:path';

export async function exerciseGuardToggle({page,root,output,check,report,waitFrames}) {
  const original=await page.evaluate(()=>({...window.CINDERLINE.game.settings}));
  report.guardToggle={scope:'Real WebKit settings and gameplay touchscreen taps; the sustained hold uses Playwright mouse down/up through the same production HUD binding because its touchscreen API exposes taps only. No physical multitouch or comparison claim.',states:[]};
  report.guardToggle.scope=report.guardToggle.scope.replace('WebKit',report.browser);
  const state=()=>page.evaluate(()=>{
    const C=window.CINDERLINE,p=C.game.player,b=C.game.hud.buttons.guard;
    return {guarding:p.guarding,stamina:p.stamina,dead:p.dead,raw:C.input.buttons.guard._rawDown,
      effective:C.input.down('guard'),mode:C.game.mode,playMode:C.MODE.PLAY,
      toggleSetting:C.game.settings.toggleGuard,engaged:b.classList.contains('engaged'),ariaPressed:b.getAttribute('aria-pressed')};
  });
  const tap=async name=>{
    const loc=page.locator(name==='guard'?'#hud .abtn.guard':name==='attack'?'#hud .abtn.attack':'#hud .syscluster .sysbtn').first();
    await loc.tap();
  };
  const openSettings=async()=>{
    await tap('menu');
    await page.waitForFunction(()=>window.CINDERLINE.game.mode===window.CINDERLINE.MODE.MENU);
    await page.locator('.screen.on .tab').filter({hasText:/^Settings$/}).tap();
  };
  const closeMenu=async()=>{
    await page.locator('.screen.on .btn').filter({hasText:/^RESUME$/}).tap();
    await page.waitForFunction(()=>window.CINDERLINE.game.mode===window.CINDERLINE.MODE.PLAY);
    await waitFrames(page,3);
  };
  try {
    await page.evaluate(async()=>{
      const C=window.CINDERLINE;
      await C.startNewGame();
      C.game.applySettings({...C.game.settings,language:'en',toggleGuard:false,quality:'medium'});
    });
    await waitFrames(page,4);
    await openSettings();
    // The visible .nm includes an italic description. Exact text for the label
    // alone cannot match that real DOM node; keep the actual row and trusted tap.
    const setting=page.locator('.screen.on .item').filter({hasText:'Tap to toggle guard'});
    check(await setting.count()===1,'one visible settings row identifies toggle guard');
    await setting.scrollIntoViewIfNeeded();
    await setting.tap();
    await page.waitForFunction(()=>window.CINDERLINE.game.settings.toggleGuard===true
      && JSON.parse(localStorage.getItem('cinderline.settings.v1')||'{}').toggleGuard===true);
    const settingsShot=join(output,'guard-toggle-settings.png');await page.screenshot({path:settingsShot});
    report.guardToggle.settingsScreenshot=settingsShot.slice(root.length+1);
    check(true,'trusted settings tap enables and persists toggle guard');
    await closeMenu();
    await tap('guard');await waitFrames(page,4);
    const on=await state();report.guardToggle.states.push({name:'after released first tap',...on});
    check(on.guarding&&on.effective&&!on.raw&&on.engaged&&on.ariaPressed==='true',
      'guard remains raised after a trusted tap has been released',JSON.stringify(on));
    const guardShot=join(output,'guard-toggle-raised.png');await page.screenshot({path:guardShot});
    report.guardToggle.raisedScreenshot=guardShot.slice(root.length+1);
    await tap('guard');await waitFrames(page,3);
    const off=await state();report.guardToggle.states.push({name:'after second tap',...off});
    check(!off.guarding&&!off.effective&&!off.raw&&!off.engaged&&off.ariaPressed==='false',
      'second trusted tap releases guard and its persistent indicator',JSON.stringify(off));
    await tap('guard');await waitFrames(page,3);await tap('attack');await waitFrames(page,3);
    const attack=await state();report.guardToggle.states.push({name:'after attack',...attack});
    check(!attack.guarding&&!attack.effective,'attacking cancels latched guard',JSON.stringify(attack));
    await waitFrames(page,30);
    await tap('guard');await waitFrames(page,3);
    const beforeMenu=await state();check(beforeMenu.guarding,'guard is actually raised before menu cancellation');
    await openSettings();await closeMenu();
    const resumed=await state();report.guardToggle.states.push({name:'after menu resume',...resumed});
    check(!resumed.guarding&&!resumed.effective&&!resumed.raw,'menu and resume do not rearm guard',JSON.stringify(resumed));
    await page.setViewportSize({width:375,height:667});
    await page.waitForFunction(()=>document.getElementById('rotate')?.classList.contains('on')&&window.CINDERLINE.engine.isPaused);
    await page.keyboard.press('q'); // Real key press while no simulation steps run.
    await page.setViewportSize({width:667,height:375});
    await page.waitForFunction(()=>!window.CINDERLINE.engine.isPaused);
    await waitFrames(page,3);
    const rotated=await state();report.guardToggle.states.push({name:'key pressed during portrait pause',...rotated});
    check(!rotated.guarding&&!rotated.effective&&!rotated.raw,'portrait resume discards guard input queued while paused',JSON.stringify(rotated));
    await openSettings();
    await setting.scrollIntoViewIfNeeded();await setting.tap();
    await page.waitForFunction(()=>window.CINDERLINE.game.settings.toggleGuard===false);
    await closeMenu();
    await tap('guard');await waitFrames(page,4);
    const hold=await state();report.guardToggle.states.push({name:'released tap in hold mode',...hold});
    check(!hold.guarding&&!hold.effective,'switching back to hold mode makes release lower the guard',JSON.stringify(hold));
    const guardBox=await page.locator('#hud .abtn.guard').boundingBox();
    await page.mouse.move(guardBox.x+guardBox.width/2,guardBox.y+guardBox.height/2);
    await page.mouse.down();
    await waitFrames(page,3);const held=await state();
    await page.mouse.up();
    await waitFrames(page,3);const released=await state();
    report.guardToggle.states.push({name:'trusted mouse hold',...held},{name:'trusted mouse release',...released});
    check(held.guarding&&held.raw&&!released.guarding&&!released.raw,
      'hold mode follows down/up through the real HUD binding',JSON.stringify({held,released}));
  } finally {
    await page.evaluate(settings=>{
      const C=window.CINDERLINE;C.input.reset();C.game.applySettings(settings);
    },original);
  }
}
