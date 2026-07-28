/**
 * Combat regression test.
 *
 * This exists because melee combat in this game was completely inert for its
 * entire history — the attack arc pointed 180 degrees away from where every
 * actor faced — and the full five-path playthrough suite passed the whole
 * time, because the driver kills enemies by calling damage() directly and
 * never once presses attack. A test suite that never swings cannot notice
 * that swinging does nothing.
 *
 * Both directions are asserted: the player's swing must land, and an enemy's
 * swing at a passive player must land.
 */
(async () => {
  const C = window.CINDERLINE, G = C.game;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const tick = async (sec) => {
    for (let i = 0, n = Math.ceil(sec * 60); i < n; i++) { G.fixedUpdate(1 / 60); if (i % 30 === 0) await sleep(0); }
  };
  const clear = () => { for (const a of [...G.actors]) if (a !== G.player) G.removeActor(a); };

  await C.startNewGame();
  for (let i = 0; i < 200 && G.mode !== C.MODE.PLAY; i++) await sleep(30);
  await tick(0.5);
  const p = G.player;
  p.gasImmune = true;
  const fail = [];

  // --- the player's swing lands, from every bearing -------------------------
  const dealt = [];
  for (const [dx, dz] of [[0, 1.5], [0, -1.5], [1.5, 0], [-1.5, 0], [1.1, 1.1]]) {
    clear();
    p.placeAt(-100, 0.2, -80);
    p.hp = p.maxHp; p.stamina = p.maxStamina;
    const t = G.spawnEnemy('scav', -100 + dx, -80 + dz);
    t.aggro = false; t.aiState = 'idle';
    await tick(0.2);
    p.faceTowards(t.pos.x, t.pos.z, true);
    const hp0 = t.hp;
    G.combat.handlePlayerAction(p, 'attack', G);
    await tick(1.0);
    dealt.push(hp0 - t.hp);
  }
  if (dealt.some((d) => d <= 0)) fail.push(`player swing dealt ${JSON.stringify(dealt)} — a swing at a target in front must land`);

  // --- an enemy's swing lands on a passive player ---------------------------
  clear();
  p.placeAt(-100, 0.2, -80);
  p.hp = p.maxHp; p.stamina = p.maxStamina; p.guarding = false;
  const e = G.spawnEnemy('scav', -101.6, -80);
  e.aggro = true; e.awareness = 1; e.target = p; e.aiState = 'combat';
  const php0 = p.hp;
  await tick(14);
  const took = php0 - p.hp;
  if (took <= 0) fail.push('an aggroed scavenger stood next to a passive player for 14s and dealt no damage');

  // --- guarding actually reduces it ----------------------------------------
  clear();
  p.placeAt(-100, 0.2, -80);
  p.hp = p.maxHp; p.stamina = p.maxStamina;
  const e2 = G.spawnEnemy('scav', -101.6, -80);
  e2.aggro = true; e2.awareness = 1; e2.target = p; e2.aiState = 'combat';
  const gp0 = p.hp;
  for (let i = 0; i < 14 * 60; i++) { p.guarding = true; G.fixedUpdate(1 / 60); if (i % 30 === 0) await sleep(0); }
  const tookGuarded = gp0 - p.hp;
  if (tookGuarded >= took) fail.push(`guarding took ${tookGuarded} vs ${took} unguarded — guarding must help`);

  return { dealtByBearing: dealt, unguarded14s: +took.toFixed(0), guarded14s: +tookGuarded.toFixed(0), fail };
})()
