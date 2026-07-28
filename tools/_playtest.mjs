(() => {
  const C = window.CINDERLINE, g = C.game, p = g.player;
  const log = [];
  // Spawn a test encounter around the player.
  const kinds = ['scav', 'scav', 'breaker', 'slinger', 'dog', 'warden'];
  const spawned = [];
  kinds.forEach((k, i) => {
    const a = (i / kinds.length) * Math.PI * 2;
    spawned.push(g.spawnEnemy(k, p.pos.x + Math.cos(a) * 9, p.pos.z + Math.sin(a) * 9));
  });
  window.__test = { spawned, log };
  return { spawned: spawned.length, tris: spawned.reduce((s, e) => s + e.rig.triangles, 0),
           actors: g.actors.length };
})()
