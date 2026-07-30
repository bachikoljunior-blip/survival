/** Does a swing at something in front of you deal damage? */
(async () => {
  const C = window.CINDERLINE, G = C.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const tick = async (sec) => { for (let i = 0, n = Math.ceil(sec * 60); i < n; i++) { G.fixedUpdate(1 / 60); if (i % 30 === 0) await sleep(0); } };
  await C.startNewGame();
  for (let i = 0; i < 200 && G.mode !== C.MODE.PLAY; i++) await sleep(30);
  await tick(0.5);
  const p = G.player;
  p.gasImmune = true;
  const out = [];
  for (const [label, dx, dz] of [['+Z', 0, 1.5], ['-Z', 0, -1.5], ['+X', 1.5, 0], ['-X', -1.5, 0]]) {
    for (const e of [...G.actors]) if (e !== p) G.removeActor(e);
    p.placeAt(-100, 0.2, -80);
    const t = G.spawnEnemy('scav', -100 + dx, -80 + dz);
    t.aggro = false; t.aiState = 'idle';
    await tick(0.2);
    p.faceTowards(t.pos.x, t.pos.z, true);
    const hp0 = t.hp;
    G.combat.handlePlayerAction(p, 'attack', G);
    await tick(1.0);
    out.push({ dir: label, playerYaw: +p.yaw.toFixed(2), dealt: +(hp0 - t.hp).toFixed(0) });
  }
  // Which way does the face point? The brow/eye geometry is authored at one
  // end of the body; compare a point in front of the mesh in each convention.
  const fwdMinus = { x: -Math.sin(p.yaw), z: -Math.cos(p.yaw) };
  const fwdPlus = { x: Math.sin(p.yaw), z: Math.cos(p.yaw) };
  return { swings: out, yaw: +p.yaw.toFixed(3), fwdMinus, fwdPlus };
})()
