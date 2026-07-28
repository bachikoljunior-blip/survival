/**
 * Input — touch first, keyboard and gamepad as equal-footing alternates.
 *
 * Layout contract (landscape):
 *   left  ~42% of the screen : floating movement stick. Touching anywhere in
 *                              the zone plants the stick under the thumb, so
 *                              the player never has to look down to find it.
 *   right ~58%               : camera drag surface. Action buttons sit on top
 *                              of it and claim their own pointers, so a thumb
 *                              resting on ATTACK never steals camera control.
 *
 * All buttons are edge-detected against the fixed simulation step, so a tap
 * shorter than one frame is still delivered exactly once. That is the
 * difference between a responsive action game and a mushy one.
 */

import { clamp, clamp01, Emitter } from './util.js';

export const BUTTONS = [
  'attack', 'heavy', 'dodge', 'guard', 'use', 'interact',
  'lockon', 'sprint', 'crouch', 'menu', 'map', 'lamp', 'swap',
];

/** Keyboard bindings. Multiple physical keys may map to one action. */
const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'dodge',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  KeyE: 'interact', Enter: 'interact',
  KeyQ: 'guard',
  KeyF: 'use',
  KeyR: 'lamp',
  KeyC: 'crouch',
  KeyT: 'lockon', Tab: 'lockon',
  KeyM: 'map',
  KeyX: 'swap',
  Escape: 'menu',
  KeyJ: 'attack',
  KeyK: 'heavy',
};

class Button {
  constructor() {
    this.down = false;
    this.pressed = false;   // true for exactly one sim step after press
    this.released = false;  // true for exactly one sim step after release
    this.downAt = -1;
    this.upAt = -1;
    this.holdTime = 0;
    this._queuedPress = 0;  // presses received since the last step
    this._queuedRelease = 0;
    this._rawDown = false;
  }
  set(v, t) {
    if (v === this._rawDown) return;
    this._rawDown = v;
    if (v) { this._queuedPress++; this.downAt = t; }
    else { this._queuedRelease++; this.upAt = t; }
  }
  step(dt) {
    // Consume at most one edge per step so rapid taps are never dropped.
    this.pressed = false;
    this.released = false;
    if (this._queuedPress > 0 && !this.down) {
      this._queuedPress--;
      this.down = true;
      this.pressed = true;
      this.holdTime = 0;
    } else if (this._queuedRelease > 0 && this.down) {
      this._queuedRelease--;
      this.down = false;
      this.released = true;
    } else {
      // Steady state: mirror the raw state and drain stale queues.
      if (this._rawDown !== this.down && this._queuedPress === 0 && this._queuedRelease === 0) {
        this.down = this._rawDown;
        if (this.down) this.pressed = true; else this.released = true;
      }
    }
    if (this.down) this.holdTime += dt;
  }
}

export class Input extends Emitter {
  constructor(canvas) {
    super();
    this.canvas = canvas;

    this.move = { x: 0, y: 0, mag: 0 };
    this.look = { x: 0, y: 0 };         // consumed each frame by the camera
    this.buttons = {};
    for (const b of BUTTONS) this.buttons[b] = new Button();

    this.lastDevice = 'touch';          // 'touch' | 'key' | 'pad'
    this.touchActive = false;

    // Tunables, exposed through the settings menu.
    this.lookSensitivity = 1.0;
    this.invertY = false;
    this.stickDeadzone = 0.14;
    this.autoSprint = true;             // full stick deflection implies sprint
    this.leftHanded = false;

    this._stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0, radius: 42, active: false };
    this._camPtr = { id: -1, lx: 0, ly: 0, moved: 0, startT: 0 };
    this._keys = new Set();
    this._time = 0;
    this._padIndex = -1;
    this._padPrev = {};
    this._enabled = true;

    this._install();
  }

  setEnabled(v) {
    this._enabled = v;
    if (!v) this.reset();
  }

  /** Drop all held state. Called on pause, menu open and focus loss. */
  reset() {
    this._stick.active = false;
    this._stick.id = -1;
    this._stick.x = this._stick.y = 0;
    this._camPtr.id = -1;
    this.move.x = this.move.y = this.move.mag = 0;
    this.look.x = this.look.y = 0;
    this._keys.clear();
    for (const b of BUTTONS) {
      const btn = this.buttons[b];
      btn._rawDown = false;
      btn._queuedPress = 0;
      btn._queuedRelease = 0;
      if (btn.down) { btn.down = false; btn.released = true; }
    }
    this.emit('stick', null);
  }

  // ------------------------------------------------------------------ setup

  _install() {
    const c = this.canvas;
    const opts = { passive: false };

    c.addEventListener('pointerdown', (e) => this._onDown(e), opts);
    window.addEventListener('pointermove', (e) => this._onMove(e), opts);
    window.addEventListener('pointerup', (e) => this._onUp(e), opts);
    window.addEventListener('pointercancel', (e) => this._onUp(e), opts);

    // Safari fires these for double-tap-to-zoom and long-press selection even
    // with touch-action:none, so they are suppressed explicitly.
    c.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, opts);
    c.addEventListener('touchmove', (e) => { if (e.cancelable) e.preventDefault(); }, opts);
    c.addEventListener('gesturestart', (e) => e.preventDefault(), opts);
    c.addEventListener('gesturechange', (e) => e.preventDefault(), opts);
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault(), opts);

    window.addEventListener('keydown', (e) => this._onKey(e, true));
    window.addEventListener('keyup', (e) => this._onKey(e, false));
    window.addEventListener('blur', () => this.reset());

    window.addEventListener('gamepadconnected', (e) => {
      this._padIndex = e.gamepad.index;
      this.lastDevice = 'pad';
      this.emit('device', 'pad');
    });
    window.addEventListener('gamepaddisconnected', () => { this._padIndex = -1; });
  }

  /** Screen-space split point between the stick zone and the camera zone. */
  _splitX() {
    const w = window.innerWidth;
    return this.leftHanded ? w * 0.58 : w * 0.42;
  }

  _isStickZone(x) {
    return this.leftHanded ? x > this._splitX() : x < this._splitX();
  }

  _onDown(e) {
    if (!this._enabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
    if (e.cancelable) e.preventDefault();

    this.lastDevice = e.pointerType === 'mouse' ? 'key' : 'touch';
    this.touchActive = e.pointerType !== 'mouse';

    const x = e.clientX, y = e.clientY;

    if (e.pointerType !== 'mouse' && this._isStickZone(x) && this._stick.id === -1) {
      const s = this._stick;
      s.id = e.pointerId;
      s.ox = x; s.oy = y;
      s.x = 0; s.y = 0;
      s.active = true;
      // Scale the stick radius with the viewport: 375pt tall phones need a
      // smaller throw than a tablet or the thumb runs off the bezel.
      s.radius = clamp(Math.min(window.innerWidth, window.innerHeight) * 0.13, 26, 54);
      this.emit('stick', { ox: x, oy: y, x: 0, y: 0, radius: s.radius });
      return;
    }

    if (this._camPtr.id === -1) {
      this._camPtr.id = e.pointerId;
      this._camPtr.lx = x;
      this._camPtr.ly = y;
      this._camPtr.moved = 0;
      this._camPtr.startT = this._time;
    }
  }

  _onMove(e) {
    if (!this._enabled) return;
    const x = e.clientX, y = e.clientY;

    if (e.pointerId === this._stick.id) {
      if (e.cancelable) e.preventDefault();
      const s = this._stick;
      let dx = x - s.ox;
      let dy = y - s.oy;
      const d = Math.hypot(dx, dy);
      if (d > s.radius) {
        // Drag the origin along behind the thumb. Long swipes then stay
        // controllable instead of pinning at full deflection.
        s.ox += (dx / d) * (d - s.radius);
        s.oy += (dy / d) * (d - s.radius);
        dx = (dx / d) * s.radius;
        dy = (dy / d) * s.radius;
      }
      s.x = dx / s.radius;
      s.y = dy / s.radius;
      this.emit('stick', { ox: s.ox, oy: s.oy, x: s.x, y: s.y, radius: s.radius });
      return;
    }

    if (e.pointerId === this._camPtr.id) {
      if (e.cancelable) e.preventDefault();
      const dx = x - this._camPtr.lx;
      const dy = y - this._camPtr.ly;
      this._camPtr.lx = x;
      this._camPtr.ly = y;
      this._camPtr.moved += Math.abs(dx) + Math.abs(dy);
      // Normalise by viewport width so sensitivity feels identical across
      // device sizes.
      const k = 2.6 * this.lookSensitivity / window.innerWidth;
      this.look.x += dx * k * 100;
      this.look.y += dy * k * 100 * (this.invertY ? -1 : 1);
    }
  }

  _onUp(e) {
    if (e.pointerId === this._stick.id) {
      const s = this._stick;
      s.id = -1;
      s.active = false;
      s.x = s.y = 0;
      this.emit('stick', null);
      return;
    }
    if (e.pointerId === this._camPtr.id) {
      this._camPtr.id = -1;
      // A quick tap on the camera surface that barely moved toggles lock-on.
      // This gives touch players a target-switch gesture without another button.
      if (this._camPtr.moved < 14 && this._time - this._camPtr.startT < 0.26) {
        this.emit('camtap');
      }
    }
  }

  _onKey(e, down) {
    if (e.repeat) return;
    const action = KEYMAP[e.code];
    if (!action) return;
    // Never swallow browser shortcuts the player might legitimately need.
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();

    this.lastDevice = 'key';
    if (down) this._keys.add(action); else this._keys.delete(action);
    if (this.buttons[action]) this.buttons[action].set(down, this._time);
    if (down) this.emit('device', 'key');
  }

  // ---------------------------------------------------------------- virtual

  /** Called by the touch UI when an on-screen action button changes state. */
  setVirtual(name, down) {
    const b = this.buttons[name];
    if (!b) return;
    this.lastDevice = 'touch';
    b.set(down, this._time);
  }

  /** Fire a one-shot press (used by UI shortcuts and tutorial nudges). */
  tapVirtual(name) {
    const b = this.buttons[name];
    if (!b) return;
    b._queuedPress++;
    b._queuedRelease++;
  }

  // ------------------------------------------------------------------- step

  step(dt) {
    this._time += dt;

    // --- movement vector -------------------------------------------------
    let mx = 0, my = 0;
    if (this._stick.active) {
      mx = this._stick.x;
      my = this._stick.y;
    } else {
      if (this._keys.has('left')) mx -= 1;
      if (this._keys.has('right')) mx += 1;
      if (this._keys.has('up')) my -= 1;
      if (this._keys.has('down')) my += 1;
    }

    this._pollGamepad();
    if (this._pad && (Math.abs(this._pad.mx) > 0.01 || Math.abs(this._pad.my) > 0.01)) {
      mx = this._pad.mx; my = this._pad.my;
    }

    let mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; mag = 1; }

    // Radial deadzone with a rescale so the first responsive value is 0, not a
    // sudden jump to the deadzone threshold.
    if (mag < this.stickDeadzone) {
      mx = my = 0; mag = 0;
    } else {
      const k = (mag - this.stickDeadzone) / (1 - this.stickDeadzone) / mag;
      mx *= k; my *= k;
      mag = Math.min(1, Math.hypot(mx, my));
    }

    this.move.x = mx;
    this.move.y = my;
    this.move.mag = mag;

    // Full deflection implies sprint on touch, where a dedicated sprint button
    // would cost a thumb we do not have.
    if (this.autoSprint && this.lastDevice === 'touch') {
      this.buttons.sprint.set(mag > 0.92, this._time);
    } else if (this.lastDevice !== 'touch') {
      this.buttons.sprint.set(this._keys.has('sprint') || !!(this._pad && this._pad.sprint), this._time);
    }

    for (const b of BUTTONS) this.buttons[b].step(dt);
  }

  /** Consume accumulated look delta; call exactly once per frame. */
  takeLook() {
    const l = { x: this.look.x, y: this.look.y };
    this.look.x = 0;
    this.look.y = 0;
    if (this._pad) {
      l.x += this._pad.lx * 190 * this.lookSensitivity * (1 / 60);
      l.y += this._pad.ly * 150 * this.lookSensitivity * (this.invertY ? -1 : 1) * (1 / 60);
    }
    return l;
  }

  _pollGamepad() {
    if (this._padIndex < 0 || !navigator.getGamepads) { this._pad = null; return; }
    const gp = navigator.getGamepads()[this._padIndex];
    if (!gp) { this._pad = null; return; }
    const dz = (v) => (Math.abs(v) < 0.18 ? 0 : v);
    this._pad = {
      mx: dz(gp.axes[0] || 0), my: dz(gp.axes[1] || 0),
      lx: dz(gp.axes[2] || 0), ly: dz(gp.axes[3] || 0),
      sprint: !!(gp.buttons[10] && gp.buttons[10].pressed),
    };
    const map = {
      0: 'dodge', 1: 'use', 2: 'attack', 3: 'interact',
      4: 'guard', 5: 'heavy', 6: 'guard', 7: 'heavy',
      8: 'map', 9: 'menu', 11: 'lockon',
    };
    let any = false;
    for (const i in map) {
      const b = gp.buttons[i];
      if (!b) continue;
      const p = b.pressed;
      if (p !== this._padPrev[i]) {
        this._padPrev[i] = p;
        this.buttons[map[i]].set(p, this._time);
        if (p) any = true;
      }
    }
    if (any || Math.abs(this._pad.mx) > 0.2) this.lastDevice = 'pad';
  }

  /** Convenience accessors used all over the gameplay code. */
  down(n) { return this.buttons[n].down; }
  pressed(n) { return this.buttons[n].pressed; }
  released(n) { return this.buttons[n].released; }
  held(n) { return this.buttons[n].holdTime; }
}
