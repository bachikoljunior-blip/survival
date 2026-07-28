/**
 * Dialogue box, menus, journal, map and the title screen.
 *
 * All DOM, all keyboard- and touch-navigable, all sized against the 667x375
 * reference. Every screen is built once and shown/hidden, because building DOM
 * during play causes a visible hitch on a phone.
 */

import { CAST } from '../content/story.js';
import { ITEMS, CAPABILITIES, CHARACTERS, DEFAULT_SETTINGS } from '../game/state.js';
import { clamp, clamp01, lerp, duration } from '../core/util.js';
import { Rng } from '../core/rng.js';

const el = (tag, cls, parent, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
};

const tap = (node, fn) => {
  node.classList.add('hit');
  let down = false;
  node.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    down = true; node.classList.add('on');
  }, { passive: false });
  node.addEventListener('pointerup', (e) => {
    e.preventDefault(); e.stopPropagation();
    node.classList.remove('on');
    if (down) { down = false; fn(e); }
  }, { passive: false });
  node.addEventListener('pointercancel', () => { down = false; node.classList.remove('on'); });
  node.addEventListener('pointerleave', () => { node.classList.remove('on'); });
  return node;
};

// ================================================================= DIALOGUE ==

/**
 * Dialogue presentation.
 *
 * Text types on rather than appearing, because a wall of text arriving at once
 * is skipped and a line that arrives at reading speed is read. Tapping once
 * completes the line instantly; tapping again advances. That two-stage tap is
 * the single most important thing about a dialogue box on a touchscreen.
 */
export class DialogueUI {
  constructor(game, root) {
    this.game = game;
    this.node = el('div', '', root);
    this.node.id = 'dlg';

    this.box = el('div', 'dlg-box hit', this.node);
    this.who = el('div', 'dlg-who', this.box);
    this.txt = el('div', 'dlg-txt', this.box);
    this.next = el('div', 'dlg-next', this.box, 'TAP TO CONTINUE');
    this.choicesNode = el('div', 'dlg-choices scroll hit', this.node);

    this.portrait = el('div', 'dlg-port', this.node);
    this.portraitCanvas = el('canvas', '', this.portrait);
    this.portraitCanvas.width = 84;
    this.portraitCanvas.height = 104;

    this.typing = false;
    this.full = '';
    this.shown = 0;
    this.speed = 46;          // characters per second
    this.onAdvance = null;
    this.onChoose = null;
    this._portraitFor = null;

    tap(this.box, () => this._tap());
  }

  _tap() {
    if (this.typing) { this.shown = this.full.length; this._render(); this.typing = false; this._afterType(); return; }
    if (this.choiceList) return;         // must pick
    if (this.onAdvance) this.onAdvance();
  }

  show(node, choices) {
    this.node.classList.add('on');
    const cast = CAST[node.speaker];
    const name = node.speaker === 'ren' ? 'REN'
      : node.speaker === 'ostrowski' ? 'OSTROWSKI'
      : node.speaker === 'system' ? ''
      : (cast ? cast.name.toUpperCase() : String(node.speaker || '').toUpperCase());
    this.who.innerHTML = name
      ? `${name}${node.mood ? ` <span class="mood">— ${node.mood}</span>` : ''}`
      : '<span class="mood">…</span>';
    if (cast) this.who.style.color = cast.colour;
    else this.who.style.color = '';

    this._drawPortrait(node.speaker);

    this.full = (node.text || '').replace(/\n(?!\n)/g, ' ').replace(/ {2,}/g, ' ').trim();
    this.shown = 0;
    this.typing = true;
    this.choiceList = null;
    this.choicesNode.innerHTML = '';
    this.next.style.opacity = '0';
    this._pendingChoices = choices;
    this._render();
  }

  _afterType() {
    const choices = this._pendingChoices;
    if (choices && choices.length) {
      this.choiceList = choices;
      this.next.style.opacity = '0';
      this.choicesNode.innerHTML = '';
      choices.forEach((c, i) => {
        const b = el('div', `dlg-choice ${c.locked ? 'locked' : ''}`, this.choicesNode);
        const tagText = c.tag || (c.locked ? 'locked' : null);
        b.innerHTML = (tagText ? `<span class="tag ${c.locked ? 'locked' : ''}">${tagText}</span>` : '') +
                      c.text +
                      (c.locked && c.why ? `<span class="why">${c.why}</span>` : '');
        if (!c.locked) tap(b, () => { this.choiceList = null; if (this.onChoose) this.onChoose(i); });
      });
    } else {
      this.next.style.opacity = '1';
    }
  }

  update(dt) {
    if (!this.typing) return;
    this.shown += this.speed * dt;
    if (this.shown >= this.full.length) {
      this.shown = this.full.length;
      this.typing = false;
      this._render();
      this._afterType();
    } else {
      this._render();
    }
  }

  _render() {
    const s = this.full.slice(0, Math.floor(this.shown));
    this.txt.innerHTML = s + (this.typing ? '<span class="caret">▌</span>' : '');
  }

  /**
   * Portraits are drawn procedurally: a silhouette in the character's colour
   * over a hatched field. Not a face — a mark. It reads at 42px, it costs
   * nothing, and it never looks like a placeholder for a face that never came.
   */
  _drawPortrait(speaker) {
    if (this._portraitFor === speaker) return;
    this._portraitFor = speaker;
    const c = this.portraitCanvas;
    const x = c.getContext('2d');
    const cast = CAST[speaker];
    const col = cast ? cast.colour : '#8a8378';
    const rng = new Rng('portrait:' + speaker);
    x.clearRect(0, 0, c.width, c.height);

    // Hatched ground
    x.fillStyle = '#0d0b09';
    x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = 'rgba(255,255,255,0.05)';
    x.lineWidth = 1;
    for (let i = -c.height; i < c.width; i += 4) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i + c.height, c.height); x.stroke();
    }

    // Silhouette: head, shoulders, and one identifying accessory.
    x.fillStyle = col;
    x.globalAlpha = 0.9;
    const cx = c.width / 2;
    x.beginPath();
    x.ellipse(cx, 40, 17, 20, 0, 0, Math.PI * 2);
    x.fill();
    x.beginPath();
    x.moveTo(cx - 34, c.height);
    x.quadraticCurveTo(cx - 30, 62, cx, 58);
    x.quadraticCurveTo(cx + 30, 62, cx + 34, c.height);
    x.closePath();
    x.fill();

    x.globalAlpha = 1;
    x.fillStyle = '#0d0b09';
    if (speaker === 'krajcik') { x.fillRect(cx - 4, 58, 8, 46); }         // collar and tie
    if (speaker === 'sol') { x.fillRect(cx - 34, 74, 68, 5); }            // hi-vis band
    if (speaker === 'teo') { x.fillRect(cx - 22, 66, 12, 10); }           // lamp on the chest
    if (speaker === 'iris') { x.fillRect(cx + 8, 66, 16, 22); }           // clipboard
    if (speaker === 'nessa') { x.beginPath(); x.arc(cx + 16, 44, 9, 0, 6.283); x.fill(); }   // hood
    if (speaker === 'ren') { x.fillRect(cx - 20, 24, 40, 5); }            // headlamp band

    // Grain
    const img = x.getImageData(0, 0, c.width, c.height);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (rng.f() - 0.5) * 26;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    x.putImageData(img, 0, 0);
  }

  hide() {
    this.node.classList.remove('on');
    this.choiceList = null;
    this.choicesNode.innerHTML = '';
    this._portraitFor = null;
  }

  get visible() { return this.node.classList.contains('on'); }
}

// ==================================================================== MENUS ==

export class Menus {
  constructor(game, root) {
    this.game = game;
    this.root = root;
    this.settings = { ...DEFAULT_SETTINGS };
    this.onSettingsChanged = null;

    this._buildTitle();
    this._buildPause();
    this._buildDeath();
    this._buildFade();
    this._buildRotate();
    this._buildEnding();
    this.current = null;
  }

  // ------------------------------------------------------------------ title

  _buildTitle() {
    const s = el('div', '', this.root);
    s.id = 'title';
    this.titleNode = s;
    el('div', 'title-bg', s);
    const wrap = el('div', 'title-wrap', s);

    const mark = el('div', 'title-mark', wrap);
    const h1 = el('h1', '', mark, 'CINDERLINE');
    el('div', 'tagline', mark,
      'A city built over a fire that will not go out. The low ground is where the air kills you. Climb, or choke.');
    this.titleVer = el('div', 'ver', mark, '');

    const menu = el('div', 'title-menu', wrap);
    this.titleButtons = {};
    const add = (key, label, sub) => {
      const b = el('div', 'btn hit', menu);
      b.innerHTML = label + (sub ? `<small>${sub}</small>` : '');
      this.titleButtons[key] = b;
      return b;
    };
    tap(add('continue', 'CONTINUE', ''), () => this.game.emit('ui:continue'));
    tap(add('new', 'NEW GAME', ''), () => this.game.emit('ui:newgame'));
    tap(add('settings', 'SETTINGS', ''), () => this.openPause('settings', true));
    tap(add('credits', 'ABOUT', ''), () => this.openPause('about', true));
  }

  showTitle(hasSave, buildId) {
    this.titleVer.textContent = `BUILD ${buildId}`;
    this.titleButtons.continue.classList.toggle('off', !hasSave);
    this.titleButtons.continue.style.display = hasSave ? '' : 'none';
    this.titleNode.classList.add('on');
  }
  hideTitle() { this.titleNode.classList.remove('on'); }

  // ------------------------------------------------------------------ pause

  _buildPause() {
    const s = el('div', 'screen', this.root);
    this.pauseNode = s;
    const inner = el('div', 'screen-inner', s);

    const head = el('div', 'screen-head', inner);
    this.pauseTitle = el('div', 'screen-title', head, 'PAUSED');
    const close = el('div', 'close hit', head, '✕');
    tap(close, () => this.closePause());

    this.tabs = el('div', 'tabs hit', inner);
    this.body = el('div', 'screen-body', inner);

    this.panels = {};
    const mkTab = (key, label) => {
      const t = el('div', 'tab hit', this.tabs, label);
      tap(t, () => this.showPanel(key));
      const p = el('div', 'col main scroll', this.body);
      p.style.display = 'none';
      this.panels[key] = { tab: t, panel: p };
      return p;
    };

    this._buildStatusPanel(mkTab('status', 'Status'));
    this._buildInventoryPanel(mkTab('items', 'Kit'));
    this._buildJournalPanel(mkTab('journal', 'Journal'));
    this._buildMapPanel(mkTab('map', 'Map'));
    this._buildSettingsPanel(mkTab('settings', 'Settings'));
    this._buildAboutPanel(mkTab('about', 'About'));

    const foot = el('div', '', inner);
    foot.style.flex = '0 0 auto';
    foot.style.display = 'flex';
    foot.style.gap = '6px';
    foot.style.marginTop = '5px';
    const saveBtn = el('div', 'btn hit', foot);
    saveBtn.innerHTML = 'SAVE';
    saveBtn.style.width = 'auto';
    tap(saveBtn, () => this.game.emit('ui:save'));
    const quitBtn = el('div', 'btn hit', foot);
    quitBtn.innerHTML = 'TITLE';
    quitBtn.style.width = 'auto';
    tap(quitBtn, () => this.game.emit('ui:quit'));
    const resumeBtn = el('div', 'btn hit', foot);
    resumeBtn.innerHTML = 'RESUME';
    resumeBtn.style.width = 'auto';
    resumeBtn.style.marginLeft = 'auto';
    tap(resumeBtn, () => this.closePause());
  }

  _buildStatusPanel(p) {
    this.statusPanel = p;
  }

  refreshStatus() {
    const p = this.statusPanel;
    const S = this.game.state;
    const pl = this.game.player;
    p.innerHTML = '';
    el('div', 'h', p, 'RENATA VASKO');
    el('div', 'sub', p, CAST.ren.bio.replace(/\n/g, ' '));
    el('div', 'rule', p);

    el('div', 'h', p, 'CONDITION');
    const rows = [
      ['Health', `${Math.round(pl.hp)} / ${pl.maxHp}`],
      ['Blood saturation', `${Math.round(pl.lungs.sat * 100)}%`],
      ['Filter', pl.lungs.filterPercent < 0 ? 'none fitted' : `${pl.lungs.filterPercent}%`],
      ['Lamp cell', `${Math.round(pl.lampBattery * 100)}%`],
      ['Carried', `${S.carriedWeight.toFixed(1)} kg`],
    ];
    for (const [k, v] of rows) {
      const r = el('div', 'item', p);
      el('span', 'nm', r, k);
      el('span', 'qty', r, v);
    }

    el('div', 'rule', p);
    el('div', 'h', p, 'WHAT YOU CAN DO');
    let any = false;
    for (const id in CAPABILITIES) {
      if (!S.can(id)) continue;
      any = true;
      const c = CAPABILITIES[id];
      const r = el('div', 'item', p);
      el('div', 'glyph', r, '●');
      const nm = el('div', 'nm', r, c.name);
      el('i', '', nm, c.desc);
    }
    if (!any) el('div', 'sub', p, 'Nothing yet. Everything you learn here, someone will have taught you.');

    el('div', 'rule', p);
    el('div', 'h', p, 'PEOPLE');
    for (const id in CHARACTERS) {
      if (!S.has(`${id}_met`) && !S.flags.has(`${id}_met`) && S.trustOf(id) === 0 && id !== 'teo') continue;
      const t = S.trustOf(id);
      const r = el('div', 'item', p);
      el('div', 'glyph', r, t > 25 ? '◈' : t < -25 ? '◇' : '◆');
      const nm = el('div', 'nm', r, CHARACTERS[id].name);
      el('i', '', nm, CHARACTERS[id].role);
      el('span', 'qty', r, t > 40 ? 'trusts you' : t > 12 ? 'warming' : t < -40 ? 'done with you' : t < -12 ? 'wary' : 'neutral');
    }

    el('div', 'rule', p);
    el('div', 'h', p, 'RUN');
    const stats = [
      ['Time in Hollis', duration(S.playTime)],
      ['Chapter', String(S.chapter)],
      ['Filters spent', String(S.filtersUsed)],
      ['Deaths', String(S.deaths)],
    ];
    for (const [k, v] of stats) {
      const r = el('div', 'item', p);
      el('span', 'nm', r, k);
      el('span', 'qty', r, v);
    }
  }

  _buildInventoryPanel(p) { this.invPanel = p; }

  refreshInventory() {
    const p = this.invPanel;
    const S = this.game.state;
    p.innerHTML = '';
    el('div', 'h', p, 'CARRIED');
    const entries = [...S.inventory.entries()].filter(([id]) => ITEMS[id]);
    if (!entries.length) el('div', 'sub', p, 'Nothing.');
    for (const [id, n] of entries) {
      const it = ITEMS[id];
      if (it.key) continue;
      const r = el('div', 'item hit', p);
      el('div', 'glyph', r, it.glyph);
      const nm = el('div', 'nm', r, it.name);
      el('i', '', nm, it.desc);
      el('span', 'qty', r, `×${n}`);
      if (it.use) tap(r, () => this.game.emit('ui:useitem', id));
    }
    const keys = entries.filter(([id]) => ITEMS[id].key);
    if (keys.length) {
      el('div', 'rule', p);
      el('div', 'h', p, 'DOCUMENTS & KEYS');
      for (const [id] of keys) {
        const it = ITEMS[id];
        const r = el('div', 'item', p);
        el('div', 'glyph', r, it.glyph);
        const nm = el('div', 'nm', r, it.name);
        el('i', '', nm, it.desc);
      }
    }
  }

  _buildJournalPanel(p) { this.journalPanel = p; }

  refreshJournal() {
    const p = this.journalPanel;
    const S = this.game.state;
    p.innerHTML = '';

    const quests = this.game.quests ? this.game.quests.list() : [];
    const active = quests.filter((q) => q.state === 'active');
    const done = quests.filter((q) => q.state === 'done');

    el('div', 'h', p, 'IN HAND');
    if (!active.length) el('div', 'sub', p, 'Nothing outstanding.');
    for (const q of active) {
      const r = el('div', 'item hit', p);
      el('div', 'glyph', r, q.def.side ? '○' : '◆');
      const nm = el('div', 'nm', r, q.def.title);
      el('i', '', nm, q.current ? q.current.objective : q.def.summary);
      if (this.game.quests.activeId === q.id) r.classList.add('on');
      tap(r, () => { this.game.quests.setActive(q.id); this.refreshJournal(); });
    }

    if (done.length) {
      el('div', 'rule', p);
      el('div', 'h', p, 'DONE');
      for (const q of done) {
        const r = el('div', 'item', p);
        el('div', 'glyph', r, '·');
        el('div', 'nm', r, q.def.title);
      }
    }

    if (S.journal.length) {
      el('div', 'rule', p);
      el('div', 'h', p, 'NOTES');
      for (let i = S.journal.length - 1; i >= 0; i--) {
        const j = S.journal[i];
        const b = el('div', '', p);
        b.style.marginBottom = '8px';
        const t = el('div', '', b, j.title);
        t.style.color = 'var(--bone)';
        t.style.fontSize = 'calc(9.5px * var(--uiscale))';
        t.style.marginBottom = '2px';
        const d = el('div', 'sub', b, j.text.replace(/\n/g, ' ').replace(/ {2,}/g, ' ').trim());
        d.style.fontStyle = 'italic';
      }
    }
  }

  _buildMapPanel(p) {
    p.style.display = 'none';
    const wrap = el('div', 'mapwrap', p);
    this.mapCanvas = el('canvas', '', wrap);
    this.mapWrap = wrap;
    const legend = el('div', 'sub', p);
    legend.style.marginTop = '4px';
    legend.innerHTML = '<b style="color:var(--ember)">◆</b> objective &nbsp; ' +
      '<b style="color:var(--toxic)">▲</b> you &nbsp; ' +
      '<b style="color:#c8452a">▓</b> bad air &nbsp; <b style="color:#7fa2b4">▤</b> above the smoke';
  }

  refreshMap() {
    const c = this.mapCanvas;
    if (!c) return;
    const rect = this.mapWrap.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.max(64, Math.round(rect.width * dpr));
    c.height = Math.max(64, Math.round(rect.height * dpr));
    const x = c.getContext('2d');
    const g = this.game;
    const B = g.city.data.bounds;

    const worldW = B.maxX - B.minX, worldD = B.maxZ - B.minZ;
    const scale = Math.min(c.width / worldW, c.height / worldD);
    const ox = (c.width - worldW * scale) / 2 - B.minX * scale;
    const oz = (c.height - worldD * scale) / 2 - B.minZ * scale;
    const X = (wx) => wx * scale + ox;
    const Z = (wz) => wz * scale + oz;

    x.fillStyle = '#0a0908';
    x.fillRect(0, 0, c.width, c.height);

    // Gas field, sampled coarsely — the map's real job is telling you where
    // the air is, not where the buildings are.
    const step = Math.max(3, Math.round(4 * scale));
    for (let wz = B.minZ; wz < B.maxZ; wz += 4) {
      for (let wx = B.minX; wx < B.maxX; wx += 4) {
        const ppm = g.gas.sample(wx, 1.5, wz);
        if (ppm < 120) continue;
        const t = clamp01((ppm - 120) / 1800);
        x.fillStyle = `rgba(${140 + t * 90 | 0},${90 - t * 50 | 0},${40 - t * 25 | 0},${0.12 + t * 0.5})`;
        x.fillRect(X(wx), Z(wz), step, step);
      }
    }

    // Streets
    x.strokeStyle = 'rgba(200,190,170,0.30)';
    for (const s of g.city.data.streets) {
      x.lineWidth = Math.max(1, s.width * scale * 0.7);
      x.beginPath(); x.moveTo(X(s.x0), Z(s.z0)); x.lineTo(X(s.x1), Z(s.z1)); x.stroke();
    }

    // Buildings
    for (const b of g.city.data.buildings) {
      x.save();
      x.translate(X(b.x), Z(b.z));
      x.rotate(b.rot || 0);
      x.fillStyle = 'rgba(150,142,126,0.42)';
      x.fillRect(-b.w * scale / 2, -b.d * scale / 2, b.w * scale, b.d * scale);
      x.restore();
    }

    // Discovered landmarks
    x.font = `${Math.round(8 * dpr)}px ui-monospace, monospace`;
    x.fillStyle = 'rgba(233,224,209,0.72)';
    for (const r of g.city.regions) {
      if (!g.state.discovered.has(r.id)) continue;
      x.fillText(r.name.toUpperCase(), X(r.x) - 16, Z(r.z));
    }

    // Objective
    const m = g.hud._marker;
    if (m) {
      x.fillStyle = '#ff7a2f';
      x.beginPath();
      x.moveTo(X(m.x), Z(m.z) - 5 * dpr);
      x.lineTo(X(m.x) + 5 * dpr, Z(m.z));
      x.lineTo(X(m.x), Z(m.z) + 5 * dpr);
      x.lineTo(X(m.x) - 5 * dpr, Z(m.z));
      x.fill();
    }

    // Player
    const p = g.player;
    const high = p.pos.y > 7;
    x.save();
    x.translate(X(p.pos.x), Z(p.pos.z));
    x.rotate(-p.yaw + Math.PI);
    x.fillStyle = high ? '#7fa2b4' : '#cfe04f';
    x.beginPath();
    x.moveTo(0, -6 * dpr); x.lineTo(4.5 * dpr, 5 * dpr); x.lineTo(0, 2.5 * dpr); x.lineTo(-4.5 * dpr, 5 * dpr);
    x.closePath(); x.fill();
    x.restore();
  }

  _buildSettingsPanel(p) { this.settingsPanel = p; }

  refreshSettings() {
    const p = this.settingsPanel;
    p.innerHTML = '';
    const S = this.settings;

    const section = (title) => { el('div', 'rule', p); el('div', 'h', p, title); };

    const slider = (key, label, min, max, stepv, fmt) => {
      const r = el('div', 'item hit', p);
      const nm = el('div', 'nm', r, label);
      const val = el('span', 'qty', r, fmt ? fmt(S[key]) : String(S[key]));
      const dec = el('div', 'glyph hit', r, '−');
      const inc = el('div', 'glyph hit', r, '+');
      const apply = (d) => {
        S[key] = clamp(Math.round((S[key] + d) / stepv) * stepv, min, max);
        val.textContent = fmt ? fmt(S[key]) : String(S[key]);
        this._settingsChanged();
      };
      tap(dec, () => apply(-stepv));
      tap(inc, () => apply(stepv));
      return r;
    };

    const toggle = (key, label, desc) => {
      const r = el('div', 'item hit', p);
      el('div', 'glyph', r, S[key] ? '■' : '□');
      const nm = el('div', 'nm', r, label);
      if (desc) el('i', '', nm, desc);
      tap(r, () => {
        S[key] = !S[key];
        r.querySelector('.glyph').textContent = S[key] ? '■' : '□';
        this._settingsChanged();
      });
      return r;
    };

    const choice = (key, label, options) => {
      const r = el('div', 'item hit', p);
      const nm = el('div', 'nm', r, label);
      const val = el('span', 'qty', r, String(S[key]));
      tap(r, () => {
        const i = options.indexOf(S[key]);
        S[key] = options[(i + 1) % options.length];
        val.textContent = String(S[key]);
        this._settingsChanged();
      });
      return r;
    };

    el('div', 'h', p, 'CONTROLS');
    slider('lookSensitivity', 'Camera sensitivity', 0.3, 2.5, 0.1, (v) => v.toFixed(1) + '×');
    toggle('invertY', 'Invert camera Y');
    toggle('leftHanded', 'Left-handed layout', 'Move stick on the right.');
    toggle('autoSprint', 'Sprint at full stick', 'No sprint button needed.');
    toggle('holdToGuard', 'Hold to guard', 'Off: tap toggles guard.');
    slider('autoAim', 'Lock-on assist', 0, 1, 0.1, (v) => Math.round(v * 100) + '%');

    section('DISPLAY');
    choice('quality', 'Quality', ['auto', 'low', 'medium', 'high']);
    slider('uiScale', 'Interface scale', 0.8, 1.5, 0.05, (v) => v.toFixed(2) + '×');
    toggle('showPerf', 'Show performance readout');

    section('AUDIO');
    slider('masterVolume', 'Master', 0, 1, 0.05, (v) => Math.round(v * 100) + '%');
    slider('musicVolume', 'Music', 0, 1, 0.05, (v) => Math.round(v * 100) + '%');
    slider('sfxVolume', 'Effects', 0, 1, 0.05, (v) => Math.round(v * 100) + '%');

    section('ACCESSIBILITY');
    toggle('subtitles', 'Subtitles', 'Spoken lines appear as text.');
    slider('screenShake', 'Screen shake', 0, 1, 0.1, (v) => Math.round(v * 100) + '%');
    toggle('reducedMotion', 'Reduced motion', 'Less camera movement and fewer particles.');
    toggle('highContrastHud', 'High contrast interface');
    toggle('showDamageNumbers', 'Damage numbers');
    toggle('gasAssist', 'Air assistance', 'Louder warnings, slower saturation, more forgiving thresholds.');
    choice('combatAssist', 'Combat assistance', [0, 1, 2]);
    const note = el('div', 'sub', p);
    note.innerHTML = '<b>0</b> standard &nbsp; <b>1</b> forgiving — more stamina, slower enemies &nbsp; ' +
                     '<b>2</b> story — you cannot be killed in combat.';
    toggle('vibration', 'Vibration', 'Where the device supports it.');
  }

  _settingsChanged() {
    document.documentElement.style.setProperty('--uiscale', String(this.settings.uiScale));
    if (this.onSettingsChanged) this.onSettingsChanged(this.settings);
  }

  _buildAboutPanel(p) {
    p.innerHTML = '';
    el('div', 'h', p, 'CINDERLINE');
    const d = el('div', 'sub', p);
    d.innerHTML = `
      An original survival action RPG. Everything in it — the city, the people,
      the textures, the animation, the music and every sound — is generated at
      runtime from code in this repository. No third-party art, audio or model
      assets are used, and none are downloaded.
      <br><br>
      <b>Built with</b> three.js (MIT) for rendering, esbuild (MIT) for bundling,
      and Playwright (Apache-2.0) for the automated test harness. Their licences
      are reproduced in <span class="mono">THIRD-PARTY.md</span>.
      <br><br>
      <b>Controls — touch.</b> Left half of the screen is the movement stick;
      touch anywhere and it appears under your thumb. Drag the right half to look.
      Tap the right half to lock on, tap again to switch target, tap with nothing
      in range to release. Buttons: HIT, HEAVY, ROLL, GUARD, USE.
      <br><br>
      <b>Controls — keyboard.</b> WASD move, mouse look, J light attack,
      K heavy, Space dodge, Q guard, E interact, F use item, R lamp, C crouch,
      Tab lock on, M map, Esc menu. Gamepads are supported.
      <br><br>
      <b>The rule that matters.</b> Carbon monoxide and blackdamp pool in the low
      ground. Height is safety. Your meter reads the air where you are standing,
      not where you are going.
    `;
  }

  // ----------------------------------------------------------------- panels

  showPanel(key) {
    for (const k in this.panels) {
      this.panels[k].panel.style.display = k === key ? '' : 'none';
      this.panels[k].tab.classList.toggle('on', k === key);
    }
    this.activePanel = key;
    if (key === 'status') this.refreshStatus();
    if (key === 'items') this.refreshInventory();
    if (key === 'journal') this.refreshJournal();
    if (key === 'settings') this.refreshSettings();
    if (key === 'map') requestAnimationFrame(() => this.refreshMap());
  }

  openPause(panel = 'status', fromTitle = false) {
    this.pauseNode.classList.add('on');
    this.fromTitle = fromTitle;
    this.pauseTitle.textContent = fromTitle ? 'SETTINGS' : 'PAUSED';
    for (const k in this.panels) {
      const hide = fromTitle && (k === 'status' || k === 'items' || k === 'journal' || k === 'map');
      this.panels[k].tab.style.display = hide ? 'none' : '';
    }
    this.showPanel(fromTitle && panel === 'status' ? 'settings' : panel);
    this.game.emit('ui:pauseopen');
  }

  closePause() {
    this.pauseNode.classList.remove('on');
    this.game.emit('ui:pauseclose', this.fromTitle);
    this.fromTitle = false;
  }

  get pauseOpen() { return this.pauseNode.classList.contains('on'); }

  // ------------------------------------------------------------------ death

  _buildDeath() {
    const s = el('div', 'dead', this.root);
    this.deathNode = s;
    const inner = el('div', 'dead-inner', s);
    this.deathTitle = el('div', 'k', inner, 'YOU STOPPED BREATHING');
    this.deathSub = el('div', 's', inner, '');
    const retry = el('div', 'btn hit', inner);
    retry.innerHTML = 'GET UP';
    tap(retry, () => this.game.emit('ui:retry'));
    const quit = el('div', 'btn hit', inner);
    quit.innerHTML = 'TITLE';
    tap(quit, () => this.game.emit('ui:quit'));
  }

  showDeath(cause) {
    const lines = {
      gas: ['YOU STOPPED BREATHING',
        'Carbon monoxide does not hurt. That is the whole problem with it. You sat down for a moment because you were tired.'],
      blunt: ['YOU WENT DOWN',
        'Somebody in this city needed what you were carrying more than you needed to keep standing.'],
      flesh: ['YOU WENT DOWN', 'They were faster than you and there were three of them.'],
      fall: ['YOU FELL', 'Nine metres onto rubble. You knew better. Everyone knows better.'],
    };
    const [t, s] = lines[cause] || lines.blunt;
    this.deathTitle.textContent = t;
    this.deathSub.textContent = s;
    this.deathNode.classList.add('on');
  }
  hideDeath() { this.deathNode.classList.remove('on'); }

  // ----------------------------------------------------------------- ending

  _buildEnding() {
    const s = el('div', 'screen', this.root);
    this.endNode = s;
    const inner = el('div', 'screen-inner', s);
    const head = el('div', 'screen-head', inner);
    this.endTitle = el('div', 'screen-title', head, '');
    const body = el('div', 'col main scroll', inner);
    this.endBody = body;
    this.body2 = body;
    const foot = el('div', '', inner);
    foot.style.flex = '0 0 auto';
    const b = el('div', 'btn hit', foot);
    b.innerHTML = 'TITLE';
    tap(b, () => this.game.emit('ui:quit'));
  }

  showEnding(ending, paragraphs) {
    this.endTitle.textContent = ending.title;
    this.endBody.innerHTML = '';
    const all = [ending.text, ...paragraphs];
    for (const para of all) {
      const d = el('div', 'sub', this.endBody, '');
      d.style.marginBottom = '10px';
      d.style.fontSize = 'calc(10px * var(--uiscale))';
      d.style.lineHeight = '1.65';
      d.textContent = para.replace(/\n(?!\n)/g, ' ').replace(/ {2,}/g, ' ').trim();
    }
    this.endNode.classList.add('on');
  }
  hideEnding() { this.endNode.classList.remove('on'); }

  // ------------------------------------------------------------------ fade

  _buildFade() {
    const f = el('div', '', this.root);
    f.id = 'fade';
    this.fadeNode = f;
  }

  fadeOut(slow = false) {
    this.fadeNode.classList.toggle('slow', slow);
    this.fadeNode.classList.add('on');
    return new Promise((r) => setTimeout(r, slow ? 1800 : 620));
  }
  fadeIn(slow = false) {
    this.fadeNode.classList.toggle('slow', slow);
    this.fadeNode.classList.remove('on');
    return new Promise((r) => setTimeout(r, slow ? 1800 : 620));
  }

  // ----------------------------------------------------------------- rotate

  _buildRotate() {
    const r = el('div', '', this.root);
    r.id = 'rotate';
    el('div', 'ico', r, '▭');
    el('p', '', r, 'CINDERLINE IS PLAYED IN LANDSCAPE.\nTURN YOUR DEVICE.');
    this.rotateNode = r;
  }
  setRotateVisible(v) { this.rotateNode.classList.toggle('on', v); }
}
