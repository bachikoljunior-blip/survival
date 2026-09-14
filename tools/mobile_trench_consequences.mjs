import { join } from 'node:path';

export async function exerciseTrenchConsequences({ page, root, output, check, report, waitFrames }) {
  const evidence = report.trenchConsequences = {
    scope: 'Programmatic late-chapter setup in the shipped build, with the preceding test conversation closed, followed by a trusted keyboard interaction and live browser simulation. This checks passage consequences and runtime geometry, not full-run progression, touch ergonomics, a traversed climb, or a reference-work blind comparison.',
    browser: report.browser,
  };
  await page.evaluate(async () => {
    const C = window.CINDERLINE;
    await C.startNewGame();
    const g = C.game, d = g.director;
    g.dialogueUI.hide(); // End the preceding fixture's display before this setup.
    g.state.chapter = 5;
    g.teleport('trench_edge');
    g.quests.start('cinderline');
    d._pollReach();
    const ground = g.world.groundUnder(77, 17.8, g.player.radius, 6, 12);
    g.player.placeAt(77, (ground?.y ?? 0) + 0.05, 17.8, Math.atan2(77 - 74, 17.8 - 18));
    g.state.give('trenchOrder', 1);
    g.setMode('play');
    g._updateInteractTarget();
    const log = C.__trenchEvidence = { start: g.time, acceptedAt: null, input: [], damage: [],
      beforeAcceptance: [], queuedBeforeAcceptance: new Set() };
    log.offAcceptance = g.state.on('flag', (flag, value) => {
      if (flag !== 'trench_talked' || !value) return;
      log.acceptedAt = g.time;
      // Combat runs after the actor-event drain. A hit already queued when
      // the order is accepted belongs to the preceding hostile interval.
      log.queuedBeforeAcceptance = new Set(g.player.events.filter(e => e.name === 'hurt').map(e => e.data));
    });
    log.keyListener = e => { if (e.code === 'KeyE') log.input.push({ trusted: e.isTrusted, time: g.time }); };
    window.addEventListener('keydown', log.keyListener);
    log.offDamage = g.on('actor:hurt', (actor, hit) => {
      if (actor !== g.player || !hit.source) return;
      const target = log.acceptedAt !== null && !log.queuedBeforeAcceptance.has(hit)
        ? log.damage : log.beforeAcceptance;
      target.push({ time: g.time, amount: hit.amount, kind: hit.source.kind, delivery: 'drained' });
    });
  });
  try {
    const sample = () => {
      const C = window.CINDERLINE, g = C.game, d = g.director;
      const group = g.actors.filter(a => a.kind && !a.dead);
      const plant = g.city._runtimeGroups?.get('trenchplant');
      return {
        time: g.time, mode: g.mode, hp: g.player.hp,
        target: g.player.interactTarget?.id ?? null,
        passed: g.state.has('trench_passed'), talked: g.state.has('trench_talked'),
        talkedThrough: g.state.has('trench_talked_through'), raid: d._raidActive?.id ?? null,
        enemies: group.map(a => ({ kind: a.kind, faction: a.faction, aggro: a.aggro,
          awareness: a.awareness, aiState: a.aiState, attack: a.attack?.name ?? null })),
        plant: plant ? { children: plant.children.length,
          rubble: plant.userData.boxes.filter(b => b.tag === 'rubble').map(b => ({ y0: b.y0, y1: b.y1, x: b.x, z: b.z })) } : null,
      };
    };
    evidence.before = await page.evaluate(sample);
    check(evidence.before.enemies.length === 3 && !evidence.before.talked,
      'trench: actual late-chapter hook creates the unresolved three-person line');
    check(evidence.before.target === 'trench_talk',
      'trench: the real interaction target is the Warden line', evidence.before.target);
    check(evidence.before.plant?.children > 0 && evidence.before.plant.rubble.length === 4
      && Math.max(...evidence.before.plant.rubble.map(b => b.y1)) > 2.4,
      'trench: authored runtime plant contains the four-layer spoil heap above passage height');
    await page.screenshot({ path: join(output, 'trench-before-order.png') });
    try {
      await page.keyboard.down('KeyE');
      await waitFrames(page, 2);
    } finally { await page.keyboard.up('KeyE'); }
    await page.waitForFunction(() => window.CINDERLINE.game.state.has('trench_talked'), null, { timeout: 30000 });
    const start = await page.evaluate(() => window.CINDERLINE.game.time);
    await page.waitForFunction(t => window.CINDERLINE.game.time >= t + 8, start, { timeout: 240000 });
    evidence.after = await page.evaluate(sample);
    evidence.events = await page.evaluate(() => {
      const C = window.CINDERLINE, log = C.__trenchEvidence;
      // Include the final frame's not-yet-drained hits without changing the
      // game's event queue or waiting an extra, unmeasured simulation tick.
      const queued = C.game.player.events.filter(e => e.name === 'hurt' && e.data.source
        && log.acceptedAt !== null && !log.queuedBeforeAcceptance.has(e.data))
        .map(e => ({ time: C.game.time, amount: e.data.amount, kind: e.data.source.kind, delivery: 'queued' }));
      log.offDamage(); log.offAcceptance(); window.removeEventListener('keydown', log.keyListener);
      return { input: log.input, damage: [...log.damage, ...queued], beforeAcceptance: log.beforeAcceptance,
        start: log.start, acceptedAt: log.acceptedAt, endedAt: C.game.time };
    });
    check(evidence.events.input.some(e => e.trusted), 'trench: passage was requested through trusted keyboard input');
    check(evidence.events.acceptedAt !== null && evidence.events.endedAt - evidence.events.acceptedAt >= 8,
      'trench: damage observation spans at least eight simulation seconds after acceptance');
    check(evidence.after.talked && evidence.after.passed && evidence.after.talkedThrough,
      'trench: real interaction grants passage and advances its route flags');
    check(evidence.after.enemies.length === 3 && evidence.after.enemies.every(a => a.faction === 'neutral' && !a.aggro && !a.attack),
      'trench: the living line remains nonhostile after eight simulation seconds');
    check(evidence.events.damage.length === 0, 'trench: no enemy hit lands while the accepted order is being read', JSON.stringify(evidence.events.damage));
    check(evidence.after.raid === null, 'trench: accepted passage releases the active raid that would block autosave');
    await page.screenshot({ path: join(output, 'trench-after-order.png') });
    evidence.images = ['trench-before-order.png', 'trench-after-order.png'].map(name => join(output, name).slice(root.length + 1));
    await page.evaluate(() => { delete window.CINDERLINE.__trenchEvidence; return window.CINDERLINE.startNewGame(); });
  } finally {
    await page.evaluate(() => {
      const C = window.CINDERLINE, log = C?.__trenchEvidence;
      if (!log) return;
      log.offDamage?.(); log.offAcceptance?.();
      window.removeEventListener('keydown', log.keyListener);
      delete C.__trenchEvidence;
    });
  }
}
