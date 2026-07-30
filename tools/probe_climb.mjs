/** Can the player get up a fire escape, from the street, with the climb verb? */
(() => {
  const G = window.CINDERLINE.game;
  const W = G.world;
  const esc = W.boxes.filter((b) => b.tag === 'escape');
  const out = [];
  // Sample several escapes across the city.
  for (const step of [0, 7, 14, 21, 28]) {
    const p0 = esc[step];
    if (!p0) continue;
    const stack = esc.filter((b) => Math.hypot(b.x - p0.x, b.z - p0.z) < 2.5);
    const top = stack.reduce((a, b) => (b.y1 > a.y1 ? b : a), p0);
    const bottom = stack.reduce((a, b) => (b.y1 < a.y1 ? b : a), p0);
    // Stand at ground level under it and ask the world for a climb.
    // From the street, not from the platform: search downward from just under
    // the lowest platform so we land on the pavement.
    const g = W.groundUnder(p0.x, p0.z, 0.4, 2.5, 6);
    const y = g ? g.y : 0;
    const c = W.climbAt(p0.x, y + 0.6, p0.z, 0.9);
    out.push({
      at: [+p0.x.toFixed(1), +p0.z.toFixed(1)],
      groundY: +y.toFixed(2),
      climbFound: !!c,
      climbTop: c ? +c.y1.toFixed(2) : null,
      platformTop: +top.y1.toFixed(2),
      lowestPlatform: +bottom.y1.toFixed(2),
      // Walk the whole vertical route: from each platform, is the next one
      // reachable by a climb? That is what "you can get to the roof" means.
      chain: (() => {
        const levels = [...new Set(stack.map((b) => +b.y1.toFixed(2)))].sort((a, b) => a - b);
        const hops = [];
        for (let i = 0; i < levels.length; i++) {
          const from = levels[i];
          const cc = W.climbAt(p0.x, from + 0.6, p0.z, 1.2);
          hops.push(cc ? +cc.y1.toFixed(2) : null);
        }
        return { levels, hops, complete: hops.slice(0, -1).every((h) => h !== null) };
      })(),
    });
  }
  return out;
})()
