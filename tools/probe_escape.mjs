/**
 * In-page probe: are the fire escapes standable and climbable?
 *
 * Two failure modes are checked against the real built city rather than
 * arithmetic: platforms embedded inside a building box (unstandable), and
 * flights whose treads are closer together horizontally than the body radius
 * (unclimbable no matter how good the step-up is).
 */
(() => {
  const G = window.CINDERLINE.game;
  const W = G.world;
  const LAYER_SOLID = 1;

  const esc = W.boxes.filter((b) => b.tag === 'escape');
  const stairs = W.boxes.filter((b) => b.tag === 'stair');
  const walls = W.boxes.filter((b) => b.tag === null && b.layer === LAYER_SOLID);

  // A platform is embedded if its centre is inside a wall box at its own height.
  let embedded = 0;
  const inside = (p, s) => {
    const c = Math.cos(-s.rot), sn = Math.sin(-s.rot);
    const dx = p.x - s.x, dz = p.z - s.z;
    const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
    return Math.abs(lx) < s.hw && Math.abs(lz) < s.hd && p.y0 > s.y0 - 0.05 && p.y0 < s.y1 - 0.05;
  };
  for (const p of esc) {
    const near = [];
    W.query(p.x, p.z, 3, near, 0xffff);
    if (near.some((s) => s.tag === null && s.layer === LAYER_SOLID && inside(p, s))) embedded++;
  }

  // Tread geometry, measured per flight. Boxes are in insertion order, so a
  // flight is nine consecutive 'stair' boxes.
  let minSpacing = Infinity, maxRise = 0, flights = 0;
  for (let f = 0; f + 8 < stairs.length; f += 9) {
    const t = stairs.slice(f, f + 9);
    if (t.some((b, i) => i && b.y0 <= t[i - 1].y0)) continue;   // not a flight
    flights++;
    for (let i = 1; i < 9; i++) {
      minSpacing = Math.min(minSpacing, Math.hypot(t[i].x - t[i - 1].x, t[i].z - t[i - 1].z));
      maxRise = Math.max(maxRise, t[i].y0 - t[i - 1].y0);
    }
  }

  // The real test: walk an actor up the first flight with the game's own mover,
  // starting standing on the bottom tread.
  const flight = stairs.slice(0, 9);
  let climbed = null; let climbedTrace = null;
  if (flight.length === 9) {
    const first = flight[0], last = flight[8];
    const dx = last.x - first.x, dz = last.z - first.z;
    const len = Math.hypot(dx, dz) || 1;
    const a = {
      pos: { x: first.x, y: first.y1 + 0.02, z: first.z },
      vel: { x: 0, y: 0, z: 0 },
      radius: 0.34, height: 1.7, stepHeight: 0.42,
      grounded: true, groundY: first.y1, coyote: 0,
    };
    const y0 = a.pos.y;
    const trace = [];
    for (let f = 0; f < 300; f++) {
      a.vel.x = dx / len * 2.4;
      a.vel.z = dz / len * 2.4;
      const r = window.CINDERLINE.moveActor(W, a, 1 / 60);
      if (f % 12 === 0 && f < 160) trace.push(`${f}: y=${a.pos.y.toFixed(3)} g=${a.grounded ? 1 : 0} ` +
        `adv=${Math.hypot(a.pos.x - first.x, a.pos.z - first.z).toFixed(2)} ` +
        `wall=${r && r.hitWall ? 1 : 0} step=${r && r.stepped ? 1 : 0}`);
    }
    // What is actually in the way?
    const near = [];
    W.query(a.pos.x, a.pos.z, 1.2, near, 0xffff);
    trace.push('blockers: ' + near
      .filter((b) => b.y1 > a.pos.y + 0.42 && b.y0 < a.pos.y + 1.7)
      .map((b) => `${b.tag || 'wall'}@y${b.y0.toFixed(2)}-${b.y1.toFixed(2)} d=${Math.hypot(b.x - a.pos.x, b.z - a.pos.z).toFixed(2)}`)
      .slice(0, 6).join(' | '));
    trace.push('under: ' + near
      .filter((b) => Math.abs(b.y1 - a.pos.y) < 0.5)
      .map((b) => `${b.tag || 'wall'}@${b.y1.toFixed(2)}`).slice(0, 6).join(' | '));
    climbedTrace = trace;
    climbed = { trace: climbedTrace,
      from: +y0.toFixed(2), to: +a.pos.y.toFixed(2),
      gained: +(a.pos.y - y0).toFixed(2), needed: +(last.y1 - y0).toFixed(2),
    };
  }

  return {
    platforms: esc.length, embedded,
    treads: stairs.length, flights,
    minSpacing: +minSpacing.toFixed(3), maxRise: +maxRise.toFixed(3),
    bodyRadius: 0.34, stepHeight: 0.42,
    climbed,
  };
})()
