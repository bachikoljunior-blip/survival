/**
 * HUD and touch controls.
 *
 * Everything here is DOM. At 667x375 the interface is a large fraction of the
 * screen, and DOM text stays crisp at any device pixel ratio while a canvas
 * overlay would cost a full-screen texture upload every frame.
 *
 * The layout rule that drives all of it: the centre of the screen is where the
 * fight is. Vitals go top-left, air goes under them, objectives sit at the top
 * where the eye is not, and both thumbs own the bottom corners. Nothing
 * occupies the middle third except things the player must react to.
 */

import { clamp, clamp01, lerp } from '../core/util.js';
import { PPM } from '../world/gas.js';

const el = (tag, cls, parent, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  if (parent) parent.appendChild(n);
  return n;
};

export class HUD {
  constructor(game, root) {
    this.game = game;
    this.root = root;

    this.node = el('div', '', root);
    this.node.id = 'hud';

    this._buildVitals();
    this._buildObjective();
    this._buildCompass();
    this._buildNotices();
    this._buildReticle();
    this._buildOverlays();
    this._buildTouch();
    this._buildSubs();

    this.damageNumbers = [];
    this.noticeQueue = [];
    this.visible = true;
    this._lastHp = 1;
    this._chipHp = 1;
    this._promptText = '';
    this._perfVisible = false;
    this.showDamageNumbers = true;
    this.subtitlesOn = true;
  }

  // ------------------------------------------------------------- structure

  _buildVitals() {
    const v = el('div', 'vitals', this.node);
    this.hpBar = this._bar(v, 'hp');
    this.staBar = this._bar(v, 'sta');

    // The gauge is the meter. Tapping it is Ren lifting it to read it — the
    // same verb as the METER button, placed where the player is already
    // looking when the number worries them.
    const air = el('div', 'air hit', v);
    this.airNode = air;
    const row = el('div', 'row', air);
    this.ppmNode = el('span', 'ppm', row, '––');
    el('span', 'unit', row, 'PPM CO');
    this.trendNode = el('span', 'trend', row, '');
    this.filterNode = el('div', 'filter', air, 'NO FILTER');
    this.readNode = el('div', 'reading', air, '');
    this._bindTap(air, () => this.game.input.tapVirtual('meter'));
  }

  /**
   * Show the result of a deliberate meter read. `trend` is only supplied once
   * the player can Read the Air; without it the meter states the number and
   * nothing else, which is exactly the limitation the capability removes.
   */
  showMeterReading(r) {
    this.readNode.textContent = r.text;
    this.readNode.classList.remove('on');
    void this.readNode.offsetWidth;
    this.readNode.classList.add('on');
    this.airNode.classList.add('reading');
    clearTimeout(this._readT);
    this._readT = setTimeout(() => {
      this.readNode.classList.remove('on');
      this.airNode.classList.remove('reading');
    }, 5200);
    if (r.trend) {
      this.trendNode.textContent = r.trend;
      this.trendNode.classList.add('on');
      clearTimeout(this._trendT);
      this._trendT = setTimeout(() => this.trendNode.classList.remove('on'), 9000);
    }
  }

  _bar(parent, cls) {
    const b = el('div', `bar ${cls}`, parent);
    const chip = el('i', 'chip', b);
    const fill = el('i', 'fill', b);
    const lbl = el('span', 'lbl', b);
    return { node: b, fill, chip, lbl };
  }

  _buildObjective() {
    const o = el('div', 'objective', this.node);
    this.chapterNode = el('div', 'chapter', o, '');
    this.taskNode = el('div', 'task', o, '');
    this.objectiveNode = o;
  }

  _buildCompass() {
    this.compass = el('div', 'compass', this.node);
    this.compassMarks = [];
  }

  _buildNotices() {
    this.notices = el('div', 'notices', this.node);
  }

  _buildReticle() {
    this.lockon = el('div', 'lockon', this.node);
    this.enemyBar = el('div', 'enemybar', this.node);
    this.enemyFill = el('i', '', this.enemyBar);
    this.enemyChip = el('u', '', this.enemyBar);
  }

  _buildOverlays() {
    this.hurt = el('div', 'hurt', this.node);
    this.gasVeil = el('div', 'gasveil', this.node);
    this.prompt = el('div', 'prompt', this.node);
    this.autosave = el('div', 'autosave', this.node, 'SAVED');
    this.card = el('div', 'card', this.node);
    this.cardK = el('div', 'k', this.card);
    this.cardT = el('div', 't', this.card);
    this.cardS = el('div', 's', this.card);
    this.perf = el('div', 'perf', this.node);
    this.perf.style.display = 'none';
  }

  _buildSubs() {
    this.subs = el('div', 'subs', this.node);
  }

  /**
   * Touch controls.
   *
   * The stick is drawn where the thumb lands rather than at a fixed spot, so
   * the player never has to look for it. Action buttons sit on a thumb arc,
   * not a grid, because a thumb rotates about its base — a grid puts the
   * furthest button at the least comfortable reach.
   */
  _buildTouch() {
    const input = this.game.input;

    this.stick = el('div', 'stick', this.node);
    this.stickKnob = el('div', 'knob', this.stick);
    this.stick.style.display = 'none';

    input.on('stick', (s) => {
      if (!s) {
        this.stick.classList.remove('active');
        this.stick.style.display = 'none';
        return;
      }
      this.stick.style.display = 'block';
      this.stick.classList.add('active');
      const r = s.radius;
      this.stick.style.width = this.stick.style.height = `${r * 2}px`;
      this.stick.style.left = `${s.ox - r}px`;
      this.stick.style.top = `${s.oy - r}px`;
      this.stick.style.bottom = 'auto';
      this.stickKnob.style.transform = `translate(${s.x * r * 0.72}px, ${s.y * r * 0.72}px)`;
    });

    this.actions = el('div', 'actions hit', this.node);
    this.buttons = {};
    const defs = [
      ['attack', 'big attack', 'HIT'],
      ['dodge', 'mid dodge', 'ROLL'],
      ['guard', 'mid guard', 'GUARD'],
      ['use', 'sml use', 'USE'],
      ['heavy', 'sml heavy', 'HEAVY'],
    ];
    for (const [name, cls, label] of defs) {
      const b = el('div', `abtn hit ${cls}`, this.actions, label);
      el('div', 'cd', b);
      this.buttons[name] = b;
      this._bindButton(b, name);
    }

    // Interact is contextual: it replaces the guard button when a prompt is up,
    // because guarding and interacting never make sense at the same moment.
    this.interactBtn = el('div', 'abtn hit mid guard', this.actions, 'USE');
    this.interactBtn.style.display = 'none';
    this._bindButton(this.interactBtn, 'interact');

    // System cluster
    const sys = el('div', 'syscluster hit', this.node);
    this.sysMenu = el('div', 'sysbtn hit', sys, '≡');
    this.sysMap = el('div', 'sysbtn hit', sys, '◈');
    this.sysLamp = el('div', 'sysbtn hit', sys, '☀');
    this.sysMeter = el('div', 'sysbtn hit', sys, '⌁');
    this._bindTap(this.sysMeter, () => this.game.input.tapVirtual('meter'));
    this._bindTap(this.sysMenu, () => this.game.emit('ui:menu'));
    this._bindTap(this.sysMap, () => this.game.emit('ui:map'));
    this._bindTap(this.sysLamp, () => this.game.input.tapVirtual('lamp'));
  }

  _bindButton(node, name) {
    const input = this.game.input;
    let active = -1;
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      active = e.pointerId;
      node.setPointerCapture?.(e.pointerId);
      node.classList.add('down');
      input.setVirtual(name, true);
    }, { passive: false });
    const up = (e) => {
      if (e.pointerId !== active) return;
      active = -1;
      node.classList.remove('down');
      input.setVirtual(name, false);
    };
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
    node.addEventListener('lostpointercapture', up);
  }

  _bindTap(node, fn) {
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      node.classList.add('down');
    }, { passive: false });
    node.addEventListener('pointerup', (e) => {
      e.preventDefault(); e.stopPropagation();
      node.classList.remove('down');
      fn();
    }, { passive: false });
    node.addEventListener('pointercancel', () => node.classList.remove('down'));
  }

  // --------------------------------------------------------------- updates

  setVisible(v) {
    this.visible = v;
    this.node.classList.toggle('hidden', !v);
  }

  setTouchVisible(v) {
    this.stick.style.visibility = v ? '' : 'hidden';
    this.actions.style.visibility = v ? '' : 'hidden';
  }

  update(dt) {
    const g = this.game;
    const p = g.player;
    if (!p) return;

    // --- vitals -----------------------------------------------------------
    const hp = p.hp / p.maxHp;
    this._chipHp = hp < this._chipHp ? lerp(this._chipHp, hp, 1 - Math.exp(-dt / 0.5)) : hp;
    this.hpBar.fill.style.transform = `scaleX(${hp})`;
    this.hpBar.chip.style.transform = `scaleX(${Math.max(hp, this._chipHp)})`;
    this.hpBar.lbl.textContent = Math.ceil(p.hp);
    this.hpBar.node.classList.toggle('low', hp < 0.28);

    const st = p.stamina / p.maxStamina;
    this.staBar.fill.style.transform = `scaleX(${st})`;
    this.staBar.chip.style.transform = `scaleX(${st})`;

    // --- air --------------------------------------------------------------
    const ppm = p.ambientPpm || 0;
    this.ppmNode.textContent = ppm >= 1000
      ? (ppm / 1000).toFixed(1) + 'k'
      : String(Math.round(ppm)).padStart(3, '0');
    const warn = ppm > PPM.ELEVATED;
    const crit = ppm > PPM.DANGER || p.lungs.critical;
    this.airNode.classList.toggle('warn', warn && !crit);
    this.airNode.classList.toggle('crit', crit);

    const f = p.lungs.filterPercent;
    if (f < 0) {
      this.filterNode.textContent = p.lungs.sat > 0.02
        ? `SAT ${Math.round(p.lungs.sat * 100)}%  ·  NO FILTER`
        : 'NO FILTER';
    } else {
      this.filterNode.textContent = `FILTER ${String(f).padStart(3, ' ')}%  ·  SAT ${Math.round(p.lungs.sat * 100)}%`;
    }

    this.gasVeil.style.opacity = String(clamp01(p.lungs.severity * 0.55));

    // --- hurt flash -------------------------------------------------------
    if (hp < this._lastHp - 0.001) {
      this.hurt.classList.add('on');
      clearTimeout(this._hurtT);
      this._hurtT = setTimeout(() => this.hurt.classList.remove('on'), 110);
    }
    this._lastHp = hp;

    this._updateCompass();
    this._updateLockOn();
    this._updateDamageNumbers(dt);
    this._updateNotices(dt);
  }

  _updateCompass() {
    const g = this.game;
    if (!g.camera) return;
    const yaw = g.camera.yaw;
    const w = this.compass.clientWidth || 150;
    const span = Math.PI * 1.15;                 // radians across the strip
    const px = (a) => (((a - yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) / span * w + w / 2;

    if (!this._compassBuilt) {
      this._compassBuilt = true;
      this.compassTicks = [];
      const dirs = [['N', 0], ['NE', Math.PI / 4], ['E', Math.PI / 2], ['SE', Math.PI * 3 / 4],
                    ['S', Math.PI], ['SW', -Math.PI * 3 / 4], ['W', -Math.PI / 2], ['NW', -Math.PI / 4]];
      for (const [name, a] of dirs) {
        const n = el('div', 'tick', this.compass, name);
        this.compassTicks.push({ n, a });
      }
    }
    for (const t of this.compassTicks) {
      const x = px(t.a);
      t.n.style.transform = `translateX(${x}px) translateX(-50%)`;
      t.n.style.opacity = x < -10 || x > w + 10 ? '0' : '1';
    }

    // Objective marker
    if (this._marker) {
      if (!this._markerNode) this._markerNode = el('div', 'mk', this.compass, '◆');
      const a = Math.atan2(this._marker.x - g.player.pos.x, this._marker.z - g.player.pos.z);
      const x = px(a + Math.PI);
      this._markerNode.style.transform = `translateX(${x}px) translateX(-50%)`;
      this._markerNode.style.color = this._marker.color || '#ff7a2f';
      this._markerNode.style.opacity = x < -6 || x > w + 6 ? '0.2' : '1';
    } else if (this._markerNode) {
      this._markerNode.style.opacity = '0';
    }
  }

  setMarker(m) { this._marker = m; }

  _updateLockOn() {
    const g = this.game;
    const t = g.camera && g.camera.lockTarget;
    if (!t || t.dead) {
      this.lockon.classList.remove('on');
      this.enemyBar.classList.remove('on');
      return;
    }
    const p = t.centre;
    _proj.set(p.x, p.y, p.z).project(g.engine.camera);
    if (_proj.z > 1) { this.lockon.classList.remove('on'); this.enemyBar.classList.remove('on'); return; }
    const w = window.innerWidth, h = window.innerHeight;
    const sx = (_proj.x * 0.5 + 0.5) * w;
    const sy = (-_proj.y * 0.5 + 0.5) * h;
    this.lockon.style.transform = `translate(${sx}px, ${sy}px)`;
    this.lockon.classList.add('on');

    const hp = clamp01(t.hp / t.maxHp);
    this.enemyBar.style.transform = `translate(${sx}px, ${sy - 26}px)`;
    this.enemyFill.style.transform = `scaleX(${hp})`;
    this.enemyChip.style.transform = `scaleX(${hp})`;
    this.enemyBar.classList.add('on');
    this.enemyBar.classList.toggle('stagger', t.poiseCurrent <= t.poise * 0.25);
  }

  // ------------------------------------------------------------- feedback

  /** Floating damage number at a world position. */
  damageNumber(amount, x, y, z, kind) {
    const n = el('div', `fx-num ${kind || ''}`, this.node, String(amount));
    this.damageNumbers.push({ n, x, y, z, t: 0 });
    setTimeout(() => { if (n.parentNode) n.remove(); }, 900);
  }

  _updateDamageNumbers(dt) {
    if (!this.damageNumbers.length) return;
    const cam = this.game.engine.camera;
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
      const d = this.damageNumbers[i];
      d.t += dt;
      if (d.t > 0.86) { this.damageNumbers.splice(i, 1); continue; }
      _proj.set(d.x, d.y, d.z).project(cam);
      if (_proj.z > 1) { d.n.style.opacity = '0'; continue; }
      d.n.style.left = `${(_proj.x * 0.5 + 0.5) * w}px`;
      d.n.style.top = `${(-_proj.y * 0.5 + 0.5) * h}px`;
    }
  }

  /** Corner notice. `kind` is '', 'good' or 'bad'. */
  notice(text, kind = '', duration = 3.4) {
    const n = el('div', `notice ${kind}`, this.notices);
    n.innerHTML = text;
    const item = { n, t: duration };
    this.noticeQueue.push(item);
    // Never let notices push the compass off the screen.
    while (this.noticeQueue.length > 4) {
      const old = this.noticeQueue.shift();
      old.n.remove();
    }
  }

  _updateNotices(dt) {
    for (let i = this.noticeQueue.length - 1; i >= 0; i--) {
      const q = this.noticeQueue[i];
      q.t -= dt;
      if (q.t <= 0 && !q.fading) {
        q.fading = true;
        q.n.classList.add('fade');
        setTimeout(() => q.n.remove(), 420);
        this.noticeQueue.splice(i, 1);
      }
    }
  }

  setPrompt(text) {
    if (text === this._promptText) return;
    this._promptText = text;
    if (text) {
      this.prompt.innerHTML = text;
      this.prompt.classList.add('on');
      this.interactBtn.style.display = '';
      this.buttons.guard.style.display = 'none';
    } else {
      this.prompt.classList.remove('on');
      this.interactBtn.style.display = 'none';
      this.buttons.guard.style.display = '';
    }
  }

  setObjective(chapter, task) {
    this.chapterNode.textContent = chapter || '';
    this.taskNode.innerHTML = task || '';
    this.objectiveNode.style.opacity = task ? '0.94' : '0';
  }

  /** Location / chapter title card. */
  showCard(kicker, title, sub) {
    this.cardK.textContent = kicker || '';
    this.cardT.textContent = title || '';
    this.cardS.textContent = sub || '';
    this.card.classList.remove('on');
    void this.card.offsetWidth;   // restart the animation
    this.card.classList.add('on');
  }

  showAutosave() {
    this.autosave.classList.add('on');
    clearTimeout(this._asT);
    this._asT = setTimeout(() => this.autosave.classList.remove('on'), 1600);
  }

  /** A spoken line with no dialogue box — barks, thoughts, radio. */
  subtitle(speaker, text, duration = 3.6) {
    if (this.subtitlesOn === false) return;
    const d = el('div', '', this.subs);
    d.innerHTML = speaker ? `<span class="spk">${speaker}</span>  ${text}` : text;
    setTimeout(() => {
      d.style.transition = 'opacity .5s';
      d.style.opacity = '0';
      setTimeout(() => d.remove(), 520);
    }, duration * 1000);
    while (this.subs.childElementCount > 3) this.subs.firstChild.remove();
  }

  setPerfVisible(v) {
    this._perfVisible = v;
    this.perf.style.display = v ? '' : 'none';
  }

  updatePerf() {
    if (!this._perfVisible) return;
    const e = this.game.engine;
    const s = e.perfSnapshot();
    if (!s) return;
    this.perf.textContent =
      `${s.fps50.toFixed(0)}fps  p90 ${s.p90.toFixed(1)}ms  ${s.tier}  ` +
      `${s.draws}dc  ${(s.tris / 1000).toFixed(0)}kt  ${s.res}`;
  }
}

const _proj = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; },
  project(cam) {
    // Minimal Vector3.project without allocating.
    const e = cam.matrixWorldInverse.elements, p = cam.projectionMatrix.elements;
    const x = this.x, y = this.y, z = this.z;
    const vx = e[0] * x + e[4] * y + e[8] * z + e[12];
    const vy = e[1] * x + e[5] * y + e[9] * z + e[13];
    const vz = e[2] * x + e[6] * y + e[10] * z + e[14];
    const vw = e[3] * x + e[7] * y + e[11] * z + e[15];
    const px = p[0] * vx + p[4] * vy + p[8] * vz + p[12] * vw;
    const py = p[1] * vx + p[5] * vy + p[9] * vz + p[13] * vw;
    const pz = p[2] * vx + p[6] * vy + p[10] * vz + p[14] * vw;
    const pw = p[3] * vx + p[7] * vy + p[11] * vz + p[15] * vw;
    const iw = 1 / (pw || 1e-6);
    this.x = px * iw; this.y = py * iw; this.z = pz * iw;
    return this;
  } };
