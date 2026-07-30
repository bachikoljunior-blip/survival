/**
 * Game state: flags, inventory, capabilities, relationships, quests, saves.
 *
 * Everything the story can read or write lives here and nowhere else, which is
 * what makes the save file a single serialisable object and the consequence
 * system auditable — a test can enumerate every flag a quest sets and every
 * flag a line of dialogue requires, and prove there is no unreachable branch.
 *
 * Progression is deliberately not a points shop. Ren does not buy strength;
 * she remembers how to do things, or someone shows her, or she finds the
 * manual. Every capability below changes what the player *can do*, not how big
 * a number is.
 */

import { Emitter, clamp, clamp01, deepClone } from '../core/util.js';

export const SAVE_KEY = 'cinderline.save.v1';
export const SETTINGS_KEY = 'cinderline.settings.v1';
export const SAVE_VERSION = 1;

/**
 * Capabilities. Each is unlocked by a specific, diegetic event — never by
 * spending an abstract currency.
 */
export const CAPABILITIES = {
  readAir: {
    name: 'Read the Air',
    desc: 'The meter shows which way the air improves, not just how bad it is here.',
    how: 'Recovered from the survey manual.',
  },
  rigVent: {
    name: 'Rig a Vent',
    desc: 'Open or shut a borehole head. Moves the gas somewhere else — and somewhere else is always someone.',
    how: 'Taught by Teodor Marsh.',
  },
  hardHands: {
    name: 'Hard Hands',
    desc: 'A wider parry window, and a guard that does not fold on the first heavy swing.',
    how: 'Earned by parrying under pressure.',
  },
  shortRope: {
    name: 'Short Rope',
    desc: 'Controlled descent from any ledge. Down is no longer the same as falling.',
    how: 'Sol gives you her line.',
  },
  goodHabits: {
    name: 'Good Habits',
    desc: 'Slower uptake, faster clearing. Twenty years of not dying underground.',
    how: 'Survive a saturation event and keep working.',
  },
  breach: {
    name: 'Breach',
    desc: 'The bar opens boarded shopfronts and shuttered cellars. Hollis is full of things nobody came back for.',
    how: 'Teodor Marsh sharpens the bar for you.',
  },
  coldRead: {
    name: 'Cold Read',
    desc: 'You see the wind-up a beat earlier. Heavy attacks announce themselves.',
    how: 'Learned the hard way from a Breaker.',
  },
};

/** Item definitions. Weight is in kilograms; Ren is carrying it all. */
export const ITEMS = {
  filter: {
    name: 'Filter cartridge', short: 'FILTER', glyph: '◈', stack: 6, weight: 0.4,
    desc: 'A sealed hopcalite cartridge. Converts carbon monoxide to carbon dioxide until it saturates, then it lies to you.',
    use: 'fitFilter', value: 5,
  },
  bandage: {
    name: 'Field dressing', short: 'DRESSING', glyph: '✚', stack: 5, weight: 0.15,
    desc: 'Sterile, mostly. Stops a bleed and buys you the walk home.',
    use: 'heal', healAmount: 42, value: 2,
  },
  cell: {
    name: 'Lamp cell', short: 'CELL', glyph: '▮', stack: 4, weight: 0.3,
    desc: 'Cap-lamp battery. Nine hours if you are careful, forty minutes if you are not.',
    use: 'recharge', value: 3,
  },
  stim: {
    name: 'Ephedrine tab', short: 'TAB', glyph: '◆', stack: 4, weight: 0.02,
    desc: 'Opens your chest. It does not put oxygen in the air; it only helps you use what is there.',
    use: 'stim', value: 4,
  },
  salvage: {
    name: 'Salvage', short: 'SALVAGE', glyph: '▨', stack: 99, weight: 0.2,
    desc: 'Copper, brass, sound cable. What Hollis is worth by the kilo.',
    value: 1,
  },
  // --- key items --------------------------------------------------------
  manual: {
    name: 'Survey field manual', short: 'MANUAL', glyph: '❑', stack: 1, weight: 0.6, key: true,
    desc: 'H.R.A. procedure for subsurface gas survey. Ren wrote three of the annexes.',
  },
  logbook: {
    name: 'Borehole log', short: 'LOG', glyph: '❑', stack: 1, weight: 0.4, key: true,
    desc: 'Raw temperature and gas readings from Vent Field 9, unfiltered. The numbers the published line was drawn against.',
    use: 'read', topic: 'the_log',
  },
  keyBoiler: {
    name: 'Boiler house key', short: 'KEY', glyph: '⚿', stack: 1, weight: 0.05, key: true,
    desc: 'Station 3. Teo has carried it since before the evacuation.',
  },
  keySurvey: {
    name: 'Field office pass', short: 'PASS', glyph: '⚿', stack: 1, weight: 0.02, key: true,
    desc: 'Iris Nadeau, Survey Engineer II. Still valid, which tells you something.',
  },
  bekLetter: {
    name: "Ilya Bek's letter", short: 'LETTER', glyph: '✉', stack: 1, weight: 0.01, key: true,
    desc: 'Never posted. Addressed to the Authority, dated eleven days before Cellar Row.',
    use: 'read', topic: 'bek_letter',
  },
  trenchOrder: {
    name: 'Trench cut order', short: 'ORDER', glyph: '❑', stack: 1, weight: 0.1, key: true,
    desc: 'Authorisation to cut the full firebreak. Signed, costed, and never issued.',
    use: 'read', topic: 'the_order',
  },
};

/** People whose opinion of Ren is tracked and consequential. */
export const CHARACTERS = {
  teo: { name: 'Teodor Marsh', role: 'Filter exchange, Marrow Arcade' },
  sol: { name: 'Marisol Ferrant', role: 'The Stacks' },
  nessa: { name: 'Nessa Bek', role: "Sol's crew" },
  iris: { name: 'Iris Nadeau', role: 'H.R.A. Survey Engineer' },
  krajcik: { name: 'Aurel Krajcik', role: 'H.R.A. Site Director' },
};

export class GameState extends Emitter {
  constructor() {
    super();
    this.reset();
  }

  reset() {
    this.flags = new Set();
    this.counters = new Map();
    this.inventory = new Map();
    this.capabilities = new Set();
    this.trust = new Map();          // character id -> -100..100
    this.quests = new Map();         // quest id -> { state, step, data }
    this.choices = new Map();        // choice id -> option id
    this.journal = [];               // [{ id, title, text, t }]
    this.discovered = new Set();
    this.chapter = 0;
    this.playTime = 0;
    this.deaths = 0;
    this.kills = 0;
    this.filtersUsed = 0;
    this.metersRead = 0;
    this.parries = 0;
    this.lastSpawn = 'start';
    this.ending = null;

    for (const id in CHARACTERS) this.trust.set(id, 0);

    // Starting kit. Sparse on purpose: the first filter you find should matter.
    this.give('filter', 1);
    this.give('bandage', 2);
    this.give('salvage', 4);
    // The reason she is here at all. It is in her coat on the first frame and
    // it can be read from the first frame, because a premise the player is
    // told about by a third party in the third scene is not a premise.
    this.give('bekLetter', 1);
  }

  // ------------------------------------------------------------------ flags

  has(flag) { return this.flags.has(flag); }
  set(flag, value = true) {
    const had = this.flags.has(flag);
    if (value) this.flags.add(flag); else this.flags.delete(flag);
    if (had !== !!value) this.emit('flag', flag, !!value);
    return this;
  }
  count(key) { return this.counters.get(key) || 0; }
  bump(key, by = 1) {
    const v = this.count(key) + by;
    this.counters.set(key, v);
    this.emit('counter', key, v);
    return v;
  }

  // -------------------------------------------------------------- inventory

  give(id, n = 1) {
    if (!ITEMS[id]) { console.warn('unknown item', id); return 0; }
    const cur = this.inventory.get(id) || 0;
    const cap = ITEMS[id].stack ?? 99;
    const next = Math.min(cap, cur + n);
    this.inventory.set(id, next);
    this.emit('item', id, next, next - cur);
    return next - cur;
  }

  take(id, n = 1) {
    const cur = this.inventory.get(id) || 0;
    if (cur < n) return false;
    const next = cur - n;
    if (next <= 0) this.inventory.delete(id); else this.inventory.set(id, next);
    this.emit('item', id, next, -n);
    return true;
  }

  countItem(id) { return this.inventory.get(id) || 0; }
  hasItem(id, n = 1) { return this.countItem(id) >= n; }

  get carriedWeight() {
    let w = 0;
    for (const [id, n] of this.inventory) w += (ITEMS[id]?.weight || 0) * n;
    return w;
  }

  // ----------------------------------------------------------- capabilities

  unlock(cap) {
    if (this.capabilities.has(cap)) return false;
    this.capabilities.add(cap);
    this.emit('capability', cap, CAPABILITIES[cap]);
    return true;
  }
  can(cap) { return this.capabilities.has(cap); }

  // ------------------------------------------------------------------ trust

  /**
   * Adjust how a character sees Ren. Trust gates dialogue, aid, and — at the
   * end — whether they are standing beside her or across from her.
   */
  adjustTrust(id, delta, reason) {
    if (!CHARACTERS[id]) return;
    const before = this.trust.get(id) || 0;
    const after = clamp(before + delta, -100, 100);
    this.trust.set(id, after);
    if (after !== before) this.emit('trust', id, after, delta, reason);
  }
  trustOf(id) { return this.trust.get(id) || 0; }

  // ----------------------------------------------------------------- choice

  record(choiceId, optionId) {
    this.choices.set(choiceId, optionId);
    this.set(`choice:${choiceId}:${optionId}`);
    this.emit('choice', choiceId, optionId);
  }
  chose(choiceId, optionId) { return this.choices.get(choiceId) === optionId; }

  // ---------------------------------------------------------------- journal

  addJournal(id, title, text) {
    if (this.journal.some((j) => j.id === id)) return false;
    this.journal.push({ id, title, text, t: this.playTime });
    this.emit('journal', { id, title, text });
    return true;
  }

  discover(id) {
    if (this.discovered.has(id)) return false;
    this.discovered.add(id);
    this.emit('discover', id);
    return true;
  }

  // ------------------------------------------------------------------- save

  serialise() {
    return {
      v: SAVE_VERSION,
      t: Date.now(),
      flags: [...this.flags],
      counters: [...this.counters],
      inventory: [...this.inventory],
      capabilities: [...this.capabilities],
      trust: [...this.trust],
      quests: [...this.quests].map(([k, q]) => [k, { state: q.state, step: q.step, data: q.data }]),
      choices: [...this.choices],
      journal: this.journal,
      discovered: [...this.discovered],
      chapter: this.chapter,
      playTime: this.playTime,
      deaths: this.deaths,
      kills: this.kills,
      filtersUsed: this.filtersUsed,
      metersRead: this.metersRead,
      parries: this.parries,
      lastSpawn: this.lastSpawn,
      ending: this.ending,
    };
  }

  deserialise(d) {
    if (!d || d.v !== SAVE_VERSION) return false;
    this.flags = new Set(d.flags || []);
    this.counters = new Map(d.counters || []);
    this.inventory = new Map(d.inventory || []);
    this.capabilities = new Set(d.capabilities || []);
    this.trust = new Map(d.trust || []);
    this.quests = new Map((d.quests || []).map(([k, q]) => [k, { ...q }]));
    this.choices = new Map(d.choices || []);
    this.journal = d.journal || [];
    this.discovered = new Set(d.discovered || []);
    this.chapter = d.chapter || 0;
    this.playTime = d.playTime || 0;
    this.deaths = d.deaths || 0;
    this.kills = d.kills || 0;
    this.filtersUsed = d.filtersUsed || 0;
    this.metersRead = d.metersRead || 0;
    this.parries = d.parries || 0;
    this.lastSpawn = d.lastSpawn || 'start';
    this.ending = d.ending || null;
    for (const id in CHARACTERS) if (!this.trust.has(id)) this.trust.set(id, 0);
    return true;
  }
}

// --------------------------------------------------------------- persistence

/**
 * Storage wrapper. Private browsing on iOS can throw on write, and a game that
 * dies because it could not save is worse than one that says so and continues.
 */
export const Storage = {
  available() {
    try {
      const k = '__cl_test__';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      return true;
    } catch { return false; }
  },

  save(state, player, extra = {}) {
    const payload = {
      state: state.serialise(),
      player: player ? {
        x: player.pos.x, y: player.pos.y, z: player.pos.z, rot: player.yaw,
        hp: player.hp, stamina: player.stamina,
        sat: player.lungs.sat, filter: player.lungs.filter, masked: player.lungs.masked,
        lampOn: player.lampOn, lampBattery: player.lampBattery,
      } : null,
      ...extra,
    };
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      return true;
    } catch (e) {
      console.warn('[cinderline] save failed', e);
      return false;
    }
  },

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const d = JSON.parse(raw);
      if (!d || !d.state || d.state.v !== SAVE_VERSION) return null;
      return d;
    } catch (e) {
      console.warn('[cinderline] load failed', e);
      return null;
    }
  },

  hasSave() { return !!this.load(); },

  clear() {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  },

  saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); return true; }
    catch { return false; }
  },

  loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },
};

/** Default settings, including every accessibility option. */
export const DEFAULT_SETTINGS = {
  // null means "not chosen yet" — the boot picks one from the browser, and an
  // explicit choice (including an explicit choice of English on a Japanese
  // device) always wins from then on.
  language: null,             // null | 'en' | 'ja'
  quality: 'auto',            // auto | low | medium | high
  masterVolume: 0.85,
  musicVolume: 0.7,
  sfxVolume: 1.0,
  lookSensitivity: 1.0,
  invertY: false,
  leftHanded: false,
  autoSprint: true,
  uiScale: 1.0,
  subtitles: true,
  screenShake: 1.0,
  showDamageNumbers: true,
  highContrastHud: false,
  reducedMotion: false,
  vibration: true,
  showPerf: false,
  gasAssist: false,           // louder warnings, slower saturation
  combatAssist: 0,            // 0 none, 1 forgiving, 2 story
};
