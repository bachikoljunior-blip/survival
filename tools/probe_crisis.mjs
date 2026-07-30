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
    // What a player does with the meter: find breathable ground and lead them
    // to it. Height helps because the gas stratifies, but a person who cannot
    // climb has to be walked OUT of the pocket, not up out of it.
    let best = null;
    for (let a = 0; a < 32; a++) for (const rad of [8, 14, 20, 28, 36, 46]) {
      const px = m.x + Math.sin(a / 32 * 6.283) * rad, pz = m.z + Math.cos(a / 32 * 6.283) * rad;
      const g = G.world.groundUnder(px, pz, 0.4, 1.4, 6);
      if (!g) continue;
      const air = G.gas.sample(px, g.y + 1.5, pz);
      if (air >= 260) continue;
      if (!best || rad < best.rad) best = { x: px, z: pz, y: g.y, air, rad };
    }
    if (best) {
      G.player.placeAt(best.x, best.y + 0.1, best.z);
    }
    await tick(30);
    const ppm = m.actor ? G.gas.sample(m.actor.pos.x, m.actor.pos.y + 1.5, m.actor.pos.z) : -1;
    out.steps.push({
      id: m.id, following,
      safeSpot: best ? [+best.x.toFixed(0), +best.z.toFixed(0), best.rad] : null,
      actorY: m.actor ? +m.actor.pos.y.toFixed(2) : null,
      climbed: m.actor ? m.actor.state : null,
      ppmAtHead: +ppm.toFixed(0),
      distToPlayer: m.actor ? +Math.hypot(m.actor.pos.x - G.player.pos.x, m.actor.pos.z - G.player.pos.z).toFixed(2) : null,
      out: !!(m.actor && m.actor.out),
      rescued: D.crisis ? D.crisis.rescued : 'crisis-gone',
    });
  }
  out.finalRescued = D.crisis ? D.crisis.rescued : 'crisis-gone';
  return out;
})()
