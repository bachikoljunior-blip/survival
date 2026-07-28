/** Drive the chapter-four escort and report exactly where it stops. */
(async () => {
  const C = window.CINDERLINE, G = C.game, MODE = C.MODE;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const tick = async (sec) => {
    for (let i = 0, n = Math.ceil(sec * 60); i < n; i++) {
      G.fixedUpdate(1 / 60);
      if (i % 30 === 0) await sleep(0);
    }
  };
  await C.startNewGame();
  for (let i = 0; i < 200 && G.mode !== MODE.PLAY; i++) await sleep(30);
  await tick(0.5);
  G.player.gasImmune = true;
  const D = G.director;
  D.state.chapter = 4;
  D._beginCrisis();
  await tick(0.3);
  const out = { began: !!D.crisis, marks: D.crisis ? D.crisis.marks.length : 0, steps: [] };
  if (!D.crisis) return out;

  for (const m of D.crisis.marks) {
    G.player.pos.set(m.x, 1.0, m.z);
    await tick(0.3);
    G.emit('interact', m);
    await tick(0.3);
    const following = !!(m.actor && m.actor.following);
    // Find a roof and put both up there.
    // What a player does with the meter: find a surface where the air is
    // actually breathable, not merely a surface that is high.
    let best = null;
    for (let a = 0; a < 24; a++) for (const rad of [0, 6, 11, 16, 21, 26, 32]) {
      const px = m.x + Math.sin(a / 24 * 6.283) * rad, pz = m.z + Math.cos(a / 24 * 6.283) * rad;
      const g = G.world.groundUnder(px, pz, 0.4, 60, 80);
      if (!g || g.y < 2.8) continue;
      const air = G.gas.sample(px, g.y + 1.5, pz);
      if (air >= 200) continue;
      if (!best || g.y < best.y) best = { x: px, z: pz, y: g.y, air };
    }
    if (best) {
      G.player.pos.set(best.x, best.y + 0.1, best.z);
      if (m.actor) { m.actor.pos.set(best.x, best.y + 0.1, best.z); m.actor.vel.set(0, 0, 0); }
    }
    await tick(2.5);
    const ppm = m.actor ? G.gas.sample(m.actor.pos.x, m.actor.pos.y + 1.5, m.actor.pos.z) : -1;
    out.steps.push({
      id: m.id, following,
      roof: best ? +best.y.toFixed(2) : null,
      actorY: m.actor ? +m.actor.pos.y.toFixed(2) : null,
      ppmAtHead: +ppm.toFixed(0),
      distToPlayer: m.actor ? +Math.hypot(m.actor.pos.x - G.player.pos.x, m.actor.pos.z - G.player.pos.z).toFixed(2) : null,
      out: !!(m.actor && m.actor.out),
      rescued: D.crisis ? D.crisis.rescued : 'crisis-gone',
    });
  }
  out.finalRescued = D.crisis ? D.crisis.rescued : 'crisis-gone';
  return out;
})()
