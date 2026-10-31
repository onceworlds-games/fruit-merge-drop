// The rules of the jar: what's held, what's next, merges, combos, score, the danger line. Pure: no browser APIs.
// step(dt) advances one fixed frame; read `events` after each step (the caller clears them).

import {
  JAR, TIERS, KINDS, MAX_KIND, DROP_KINDS, DROP_WEIGHTS, DANGER_TIME, DROP_COOLDOWN, COMBO_WINDOW, JACKFRUIT_BONUS,
  MERGE_LOCK, radiusOf, mergeScore, comboMultiplier,
} from './config.js';
import { World } from './physics.js';
import { createRng } from './rng.js';

const MERGE_REACH = 0.9; // fruit this close to touching count as touching
const SETTLED_V = 90;
const MAX_FRUIT = 400;

// Where a circle dropped straight down at x would come to rest (its centre's y).
export function landingY(bodies, x, r) {
  let y = JAR.h - r;
  const rc = JAR.corner;
  const dxl = x - rc;
  if (x < rc && Math.abs(dxl) < rc - r) y = Math.min(y, JAR.h - rc + Math.sqrt((rc - r) * (rc - r) - dxl * dxl));
  const dxr = x - (JAR.w - rc);
  if (x > JAR.w - rc && Math.abs(dxr) < rc - r) y = Math.min(y, JAR.h - rc + Math.sqrt((rc - r) * (rc - r) - dxr * dxr));
  for (const b of bodies) {
    const dx = Math.abs(x - b.x);
    const s = r + b.r;
    if (dx < s) {
      const yy = b.y - Math.sqrt(s * s - dx * dx);
      if (yy < y) y = yy;
    }
  }
  return y;
}

export class Game {
  constructor({ seed = 1 } = {}) {
    this.seed = seed >>> 0;
    this.rng = createRng(this.seed);
    this.world = new World();
    this.events = [];
    this.time = 0;
    this.score = 0;
    this.over = false;
    this.overReason = '';
    this.drops = 0;
    this.merges = 0;
    this.biggest = 0;
    this.longestCombo = 0;
    this.made = new Array(KINDS).fill(false); // tiers the player has made (the ladder's lit fruit)
    this.comboN = 0;
    this.lastMerge = -99;
    this.dangerT = 0;
    this.topY = JAR.h; // top edge of the highest settled fruit
    this.cooldown = 0;
    this.queued = -99;
    this.aimX = JAR.w / 2;
    this.held = this._pick();
    this.next = this._pick();
    this.then = this._pick();
  }

  _pick() {
    if (this.drops < 3) return this.rng() < 0.7 ? 0 : 1;
    let total = 0;
    for (let i = 0; i < DROP_KINDS; i++) total += DROP_WEIGHTS[i];
    let t = this.rng() * total;
    for (let i = 0; i < DROP_KINDS; i++) {
      t -= DROP_WEIGHTS[i];
      if (t < 0) return i;
    }
    return 0;
  }

  get ready() {
    return this.held !== null && !this.over;
  }

  // Tallest list of fruit, for drawing and tests.
  get fruit() {
    return this.world.bodies;
  }

  holdRadius() {
    return radiusOf(this.held !== null ? this.held : this.next);
  }

  setAim(x) {
    if (!Number.isFinite(x)) return;
    const r = this.holdRadius();
    this.aimX = Math.max(r + 1, Math.min(JAR.w - r - 1, x));
  }

  landing(x = this.aimX, kind = this.held !== null ? this.held : this.next) {
    const r = radiusOf(kind);
    return landingY(this.world.bodies, x, r);
  }

  drop() {
    if (this.over) return false;
    if (this.held === null) {
      this.queued = this.time;
      return false;
    }
    this._release();
    return true;
  }

  _release() {
    const kind = this.held;
    this.setAim(this.aimX);
    const b = this.world.add({ kind, r: radiusOf(kind), x: this.aimX, y: JAR.holdY, fresh: true });
    b.pop = 0.6;
    this.drops++;
    this.made[kind] = true;
    if (kind > this.biggest) this.biggest = kind;
    this.held = null;
    this.cooldown = DROP_COOLDOWN;
    this.queued = -99;
    this.events.push({ type: 'drop', x: b.x, y: b.y, kind });
    return b;
  }

  _promote() {
    this.held = this.next;
    this.next = this.then;
    this.then = this._pick();
    this.setAim(this.aimX);
    this.events.push({ type: 'ready', kind: this.held });
  }

  step(dt) {
    const w = this.world;
    w.step(dt);
    for (const e of w.events) this.events.push(e);
    w.events.length = 0;
    if (this.over) return;
    this.time += dt;
    for (const b of w.bodies) {
      if (b.pop > 0) b.pop = Math.max(0, b.pop - dt);
      if (b.sq > 0) b.sq = b.sq < 0.002 ? 0 : b.sq * Math.exp(-14 * dt);
    }
    this._merges();
    this._danger(dt);
    if (this.held === null) {
      this.cooldown -= dt;
      if (this.cooldown <= 0) {
        this._promote();
        if (this.time - this.queued < 0.2) this._release();
      }
    }
    if (this.comboN > 0 && this.time - this.lastMerge > COMBO_WINDOW) this.comboN = 0;
  }

  _merges() {
    const bs = this.world.bodies;
    const n = bs.length;
    let pairs = null;
    for (let i = 0; i < n; i++) {
      const a = bs[i];
      if (a.lock > 0) continue;
      for (let j = i + 1; j < n; j++) {
        const b = bs[j];
        if (b.kind !== a.kind || b.lock > 0) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const reach = a.r + b.r + MERGE_REACH;
        if (dx * dx + dy * dy > reach * reach) continue;
        if (!pairs) pairs = [];
        pairs.push(a.id < b.id ? [a, b] : [b, a]);
      }
    }
    if (!pairs) return;
    pairs.sort((p, q) => p[0].id - q[0].id || p[1].id - q[1].id);
    const used = new Set();
    for (const [a, b] of pairs) {
      if (used.has(a.id) || used.has(b.id)) continue;
      used.add(a.id);
      used.add(b.id);
      this._merge(a, b);
    }
  }

  _merge(a, b) {
    const w = this.world;
    const x = (a.x + b.x) / 2;
    const y = (a.y + b.y) / 2;
    const kind = a.kind;
    w.remove(a);
    w.remove(b);
    this.comboN = this.time - this.lastMerge <= COMBO_WINDOW && this.comboN > 0 ? this.comboN + 1 : 1;
    this.lastMerge = this.time;
    this.longestCombo = Math.max(this.longestCombo, this.comboN);
    this.merges++;
    const mult = comboMultiplier(this.comboN);
    let pts;
    let range;
    let push;
    let result = -1;
    if (kind === MAX_KIND) {
      pts = JACKFRUIT_BONUS;
      range = 230;
      push = 620;
      this.events.push({ type: 'burst', x, y, kind, pts, combo: this.comboN, mult: 1 });
    } else {
      result = kind + 1;
      pts = Math.round(mergeScore(result) * mult);
      const m = a.m + b.m;
      const nb = w.add({
        kind: result,
        r: radiusOf(result),
        x,
        y,
        vx: (a.vx * a.m + b.vx * b.m) / m,
        vy: (a.vy * a.m + b.vy * b.m) / m,
        a: a.a,
        w: (a.w + b.w) / 2,
      });
      nb.lock = MERGE_LOCK;
      nb.pop = 0.45;
      range = nb.r + 34;
      push = 70 + 34 * result;
      if (result > this.biggest) this.biggest = result;
      this.made[result] = true;
      this.events.push({
        type: 'merge', x: nb.x, y: nb.y, kind: result, pts, combo: this.comboN, mult,
        ax: a.x, ay: a.y, bx: b.x, by: b.y, id: nb.id,
      });
      this._shove(nb.x, nb.y, nb.r, range, push, nb.id);
    }
    if (kind === MAX_KIND) this._shove(x, y, 60, range, push, 0);
    this.score += pts;
    this.world.wakeNear(x, y, range);
    if (this.comboN >= 2) this.events.push({ type: 'combo', n: this.comboN, x, y, mult });
  }

  _shove(x, y, r, range, push, skipId) {
    for (const c of this.world.bodies) {
      if (c.id === skipId) continue;
      const dx = c.x - x;
      const dy = c.y - y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const edge = d - r - c.r;
      if (edge > range) continue;
      const f = Math.max(0, 1 - Math.max(0, edge) / range);
      const light = Math.min(1.5, Math.sqrt(r / c.r));
      const dv = push * f * f * light;
      c.sleep = false;
      c.rest = 0;
      c.vx += (dx / d) * dv;
      c.vy += (dy / d) * dv * 0.8 - dv * 0.15;
      c.w += ((dx > 0 ? 1 : -1) * dv) / (c.r * 6);
    }
  }

  _danger(dt) {
    let top = JAR.h;
    let over = false;
    for (const b of this.world.bodies) {
      if (b.fresh) {
        if (b.fc > 0 || b.y + b.r > JAR.h - 3 || b.age > 4) b.fresh = false;
        else continue;
      }
      const t = b.y - b.r;
      if (t < top) top = t;
      if (t < JAR.dangerY && b.vx * b.vx + b.vy * b.vy < SETTLED_V * SETTLED_V) {
        over = true;
        b.over = Math.min(1, b.over + dt * 4);
      } else b.over = Math.max(0, b.over - dt * 4);
    }
    this.topY = top;
    if (over) this.dangerT += dt;
    else this.dangerT = Math.max(0, this.dangerT - 2 * dt);
    if (this.dangerT >= DANGER_TIME) {
      this.over = true;
      this.overReason = 'full';
      this.events.push({ type: 'over' });
    }
  }

  // 0 (far) .. 1 (the countdown is about to end): how loudly the line should shout.
  get danger() {
    return Math.min(1, this.dangerT / DANGER_TIME);
  }

  // How near the pile is to the line: 0 far .. 1 at the line.
  get closeness() {
    return Math.max(0, Math.min(1, 1 - (this.topY - JAR.dangerY) / 90));
  }

  snapshot() {
    return {
      v: 1,
      seed: this.seed,
      rng: this.rng.getState(),
      score: this.score,
      held: this.held === null ? -1 : this.held,
      next: this.next,
      then: this.then,
      aimX: Math.round(this.aimX * 10) / 10,
      drops: this.drops,
      merges: this.merges,
      biggest: this.biggest,
      longestCombo: this.longestCombo,
      made: this.made.map((m) => (m ? 1 : 0)),
      fruit: this.world.bodies.map((b) => [b.kind, Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10, Math.round(b.a * 100) / 100]),
    };
  }

  // Returns a Game or null when the saved data isn't a valid jar.
  static restore(snap) {
    try {
      if (!snap || snap.v !== 1 || !Array.isArray(snap.fruit) || snap.fruit.length > MAX_FRUIT) return null;
      const okKind = (k) => Number.isInteger(k) && k >= 0 && k < KINDS;
      const fin = (v) => typeof v === 'number' && Number.isFinite(v);
      if (!fin(snap.score) || snap.score < 0 || !okKind(snap.next) || !okKind(snap.then) || !(snap.held === -1 || okKind(snap.held))) return null;
      const g = new Game({ seed: fin(snap.seed) ? snap.seed : 1 });
      if (fin(snap.rng)) g.rng.setState(snap.rng);
      g.score = Math.floor(snap.score);
      g.drops = Math.max(3, Math.floor(fin(snap.drops) ? snap.drops : 3));
      g.merges = Math.max(0, Math.floor(fin(snap.merges) ? snap.merges : 0));
      g.biggest = okKind(snap.biggest) ? snap.biggest : 0;
      g.longestCombo = Math.max(0, Math.floor(fin(snap.longestCombo) ? snap.longestCombo : 0));
      if (Array.isArray(snap.made)) for (let i = 0; i < KINDS; i++) g.made[i] = !!snap.made[i];
      for (const f of snap.fruit) {
        if (!Array.isArray(f) || !okKind(f[0]) || !fin(f[1]) || !fin(f[2])) return null;
        const x = Math.max(0, Math.min(JAR.w, f[1]));
        const y = Math.max(-50, Math.min(JAR.h, f[2]));
        g.world.add({ kind: f[0], r: radiusOf(f[0]), x, y, a: fin(f[3]) ? f[3] : 0 });
      }
      g.held = snap.held === -1 ? null : snap.held;
      g.next = snap.next;
      g.then = snap.then;
      if (g.held === null) g.cooldown = 0.2;
      g.setAim(fin(snap.aimX) ? snap.aimX : JAR.w / 2);
      return g;
    } catch {
      return null;
    }
  }
}

export { TIERS };
