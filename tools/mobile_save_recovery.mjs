/** Real WebKit page interactions for recovery. Fixture seeding is test setup,
 * not evidence of reaching the fixture's story state through gameplay. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

async function visibleBox(locator) {
  return locator.evaluate(node => {
    const r = node.getBoundingClientRect();
    let left = 0, top = 0, right = innerWidth, bottom = innerHeight, styled = true;
    for (let parent = node; parent; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      styled &&= style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
      if (parent !== node && /(auto|scroll|hidden|clip)/.test(style.overflow + style.overflowY + style.overflowX)) {
        const p = parent.getBoundingClientRect();
        left = Math.max(left, p.left); top = Math.max(top, p.top);
        right = Math.min(right, p.right); bottom = Math.min(bottom, p.bottom);
      }
    }
    return { x: r.x, y: r.y, width: r.width, height: r.height,
      fullyVisible: styled && r.width > 0 && r.height > 0 && r.left >= left - 0.5
        && r.top >= top - 0.5 && r.right <= right + 0.5 && r.bottom <= bottom + 0.5 };
  });
}

export async function exerciseSaveRecovery({ page, root, output, check, report, bootTimeout }) {
  const fixture = JSON.parse(readFileSync(join(root, 'tools/fixtures/save-v1.json'), 'utf8'));
  const legacy = JSON.stringify(fixture.payload);
  const unreadable = '{"saved":"original unreadable bytes: 日本語",';
  const future = JSON.stringify({ ...fixture.payload, v: 999, state: { ...fixture.payload.state, v: 999 } });
  const hadSave = await page.evaluate(() => Boolean(localStorage.getItem('cinderline.save.v1')));
  if (!hadSave) throw new Error('recovery test requires the preceding real gameplay save');
  await page.evaluate(({ legacy, unreadable, future }) => {
    localStorage.setItem('cinderline.save.rescued', JSON.stringify([
      { at: 1785555939008, raw: legacy },
      { at: 1785555939009, raw: future },
      { at: 1785555939010, raw: unreadable },
    ]));
  }, { legacy, unreadable, future });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForFunction(() => window.CINDERLINE?.ready === true, null,
    { timeout: bootTimeout, polling: 250 });
  // Reload invokes the real pagehide save. Preserve the bytes actually present
  // at the title, not the earlier snapshot that pagehide correctly superseded.
  const original = await page.evaluate(() => localStorage.getItem('cinderline.save.v1'));
  const tapNode = async (expression) => {
    const rect = await page.evaluate((source) => {
      const node = Function(`return (${source})`)();
      if (!node) throw new Error(`missing recovery control: ${source}`);
      const r = node.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width, height: r.height };
    }, expression);
    if (rect.width < 1 || rect.height < 1) throw new Error(`hidden recovery control: ${expression}`);
    await page.touchscreen.tap(rect.x, rect.y);
  };
  await tapNode('window.CINDERLINE.game.menus.titleButtons.settings');
  await page.waitForFunction(() => window.CINDERLINE.game.menus.fromTitle
    && window.CINDERLINE.game.menus.pauseNode.classList.contains('on'));
  const copies = page.locator('.screen.on .save-copy');
  check(await copies.count() === 3, 'title settings expose all three retained copies');
  check(await copies.locator('button').count() === 4,
    'all copies can be exported and only the readable copy can be restored');
  const boxes = [];
  for (const button of await copies.locator('button').all()) {
    await button.scrollIntoViewIfNeeded();
    const box = await visibleBox(button);
    boxes.push({ text: await button.textContent(), ...box });
  }
  check(boxes.every(b => b.width >= 44 && b.height >= 44 && b.fullyVisible),
    'recovery buttons are touch-sized and fit the mobile viewport', JSON.stringify(boxes));
  await copies.first().scrollIntoViewIfNeeded();
  const screenshot = join(output, 'saved-copies.png');
  await page.screenshot({ path: screenshot });
  report.screenshots.savedCopies = screenshot.slice(root.length + 1);

  const downloadPromise = page.waitForEvent('download');
  await copies.first().getByRole('button', { name: 'ファイルに保存', exact: true }).tap();
  const download = await downloadPromise;
  const downloadPath = join(output, 'exported-unreadable-copy.json');
  await download.saveAs(downloadPath);
  check(readFileSync(downloadPath, 'utf8') === unreadable,
    'trusted export tap downloads the exact unreadable original bytes');

  await copies.last().getByRole('button', { name: 'このコピーを使う', exact: true }).tap();
  const recovered = await page.evaluate(({ legacy, original, unreadable, future }) => {
    const main = localStorage.getItem('cinderline.save.v1');
    const backup = JSON.parse(localStorage.getItem('cinderline.save.rescued'));
    const all = [main, ...backup.map(c => c.raw)];
    return {
      originalBytes: main === legacy,
      allPreserved: [legacy, original, unreadable, future].every(raw => all.includes(raw)),
      saveHidden: getComputedStyle(window.CINDERLINE.game.menus.saveButton).display === 'none',
      announcement: document.querySelector('.screen.on [role="status"]')?.textContent,
    };
  }, { legacy, original, unreadable, future });
  check(recovered.originalBytes && recovered.allPreserved && recovered.saveHidden,
    'restore preserves all four versions and title SAVE cannot overwrite it', JSON.stringify(recovered));
  const announcementBox = await visibleBox(page.locator('.screen.on [role="status"]'));
  check(recovered.announcement?.includes('復元しました') && announcementBox.fullyVisible,
    'Japanese restoration notice has a visible box inside the scroller and viewport', JSON.stringify(announcementBox));
  const resultShot = join(output, 'restoration-result.png');
  await page.screenshot({ path: resultShot });
  report.screenshots.restorationResult = resultShot.slice(root.length + 1);
  await tapNode('window.CINDERLINE.game.menus.pauseNode.querySelector(".close")');
  await tapNode('window.CINDERLINE.game.menus.titleButtons.continue');
  await page.waitForFunction(() => window.CINDERLINE.game.mode === window.CINDERLINE.MODE.PLAY);
  const loaded = await page.evaluate(() => {
    const g = window.CINDERLINE.game;
    return {
      legacyFlag: g.state.flags.has('fixture_legacy_save'),
      position: { x: g.player.pos.x, y: g.player.pos.y, z: g.player.pos.z },
      finite: [g.player.pos.x, g.player.pos.y, g.player.pos.z, g.player.hp].every(Number.isFinite),
    };
  });
  const p = fixture.payload.player;
  loaded.distance = Math.hypot(loaded.position.x - p.x, loaded.position.y - p.y, loaded.position.z - p.z);
  check(loaded.legacyFlag && loaded.finite && loaded.distance < 1,
    'Continue applies the legacy save to the real running world', JSON.stringify(loaded));

  await tapNode('window.CINDERLINE.game.hud.sysMenu');
  await tapNode('window.CINDERLINE.game.menus.panels.settings.tab');
  await page.locator('.screen.on .item.hit').filter({ hasText: 'Language' }).first().tap();
  await page.waitForFunction(() => window.CINDERLINE.game.menus.settings.language === 'en');
  const language = await page.evaluate(() => {
    const g = window.CINDERLINE.game;
    const r = g.menus.saveButton.getBoundingClientRect();
    return { fromTitle: g.menus.fromTitle, saveWidth: r.width, saveHeight: r.height };
  });
  check(!language.fromTitle && language.saveWidth >= 44 && language.saveHeight >= 44,
    'changing language in play keeps the gameplay SAVE available', JSON.stringify(language));
  // Continue may already have autosaved v2. Seed a new, explicitly synthetic
  // in-memory witness while paused so an inert SAVE button cannot pass merely
  // by finding the version that the earlier autosave wrote.
  check(await page.evaluate(() => window.CINDERLINE.game.mode === window.CINDERLINE.MODE.MENU),
    'manual-save witness is inserted while gameplay is paused in MENU');
  const beforeManualSave = await page.evaluate(() => {
    window.CINDERLINE.game.state.flags.add('fixture_mobile_manual_save');
    return localStorage.getItem('cinderline.save.v1');
  });
  check(!JSON.parse(beforeManualSave).state.flags.includes('fixture_mobile_manual_save'),
    'manual-save witness is absent from storage before the SAVE tap');
  await tapNode('window.CINDERLINE.game.menus.saveButton');
  const resaved = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('cinderline.save.v1'));
    return { version: d.v, legacyFlag: d.state.flags.includes('fixture_legacy_save'),
      manualWitness: d.state.flags.includes('fixture_mobile_manual_save') };
  });
  check(resaved.version === 2 && resaved.legacyFlag && resaved.manualWitness,
    'trusted SAVE after language change retains loaded legacy progress in the current format', JSON.stringify(resaved));
  await tapNode('window.CINDERLINE.game.menus.pauseNode.querySelector(".close")');
  const resumed = await page.evaluate(() => {
    const C = window.CINDERLINE;
    return C.game.mode === C.MODE.PLAY && C.game.hud.visible && !C.engine.isPaused;
  });
  check(resumed, 'closing language-changed settings returns to live gameplay with the HUD');
  report.interaction.saveRecovery = { recovered, loaded, language, resaved, resumed,
    scope: `Real ${report.browser} rendering and trusted single-touch actions; seeded legacy fixture and in-memory manual-save witness. No physical-phone or full-playthrough claim.` };
}
