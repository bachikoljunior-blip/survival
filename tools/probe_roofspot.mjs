/** Find rooftop camera positions with real clearance ahead. */
(() => {
  const G = window.CINDERLINE.game, W = G.world, THREE = window.CINDERLINE.THREE;
  const out = [];
  for (let x = -100; x <= -40; x += 4) {
    for (let z = -40; z <= 20; z += 4) {
      const g = W.groundUnder(x, z, 0.4, 40, 60);
      if (!g || g.y < 9 || g.y > 14) continue;
      // Clearance: how far can we see along each of four bearings?
      let best = null;
      for (const yawDeg of [0, 45, 90, 135, 180, 225, 270, 315]) {
        const a = yawDeg * Math.PI / 180;
        const hit = W.raycast(
          new THREE.Vector3(x, g.y + 1.6, z),
          new THREE.Vector3(Math.sin(a), -0.1, Math.cos(a)).normalize(), 90);
        const d = hit ? hit.distance : 90;
        if (!best || d > best.d) best = { yawDeg, d: +d.toFixed(1) };
      }
      if (best && best.d > 30) out.push({ x, z, y: +(g.y + 1.6).toFixed(1), ...best });
    }
  }
  out.sort((a, b) => b.d - a.d);
  return out.slice(0, 6);
})()
