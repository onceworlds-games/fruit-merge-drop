// Deterministic circle physics for the jar. No browser APIs, no randomness: the same calls give the same pile.
//
// Each 60 Hz frame is split into SUB substeps. A substep adds gravity, finds contacts, solves velocities with sequential
// impulses (normal, then Coulomb friction that also spins the fruit), moves the bodies, then pushes any leftover overlap
// apart by position projection (which never adds velocity, so a pile can't bounce itself apart). Touching groups fall
// asleep together once they're still and wake together when something moving reaches them.

import { JAR } from './config.js';

export const SUB = 8;
const ITER = 6;
const POS_IT = 5;
export const GRAVITY = 1700;
export const VMAX = 1500;
const E_REST = 0.15;
const REST_V = 140; // closing speed under which a hit doesn't bounce
export const BUMP_V = 60; // closing speed that makes a knock (sound, squash)
const MU = 0.5;
const MU_WALL = 0.4;
const SLOP = 0.04;
const PERC = 0.92;
const MARGIN = 0.5; // contacts are gathered a hair before the surfaces touch
const LIN_DAMP = 0.45; // rolling resistance, only while touching something
const ROLL_DAMP = 3.2;
const SLEEP_V = 8;
const SLEEP_T = 0.4;
const WAKE_V = 22;
const TWO_PI = Math.PI * 2;
const KEY = 1048576;
const WARM = 1;

class Contact {
  constructor() {
    this.a = null;
    this.b = null; // null: the jar
    this.nx = 0; // from a toward b (or toward the wall)
    this.ny = 0;
    this.ima = 0;
    this.imb = 0;
    this.jn = 0;
    this.jt = 0;
    this.rest = 0;
    this.mu = MU;
    this.key = 0;
    this.pen = 0;
    this.bias = 0; // slowest allowed closing speed while there's still a gap (negative)
  }
}

// The jar: x in [0, w], open at the top, floor at h with rounded corners. Writes up to 2 wall contacts for a body of
// radius r at (x, y) into out as [nx, ny, pen] triples (n points from the body into the wall). Returns how many.
function wallHits(x, y, r, out) {
  const w = JAR.w;
  const h = JAR.h;
  const rc = JAR.corner;
  let n = 0;
  const cy = h - rc;
  if (y > cy && x < rc) {
    const dx = x - rc;
    const dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    const pen = d - (rc - r);
    if (pen > -MARGIN && d > 1e-9) {
      out[n * 3] = dx / d;
      out[n * 3 + 1] = dy / d;
      out[n * 3 + 2] = pen;
      n++;
    }
    return n;
  }
  if (y > cy && x > w - rc) {
    const dx = x - (w - rc);
    const dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    const pen = d - (rc - r);
    if (pen > -MARGIN && d > 1e-9) {
      out[n * 3] = dx / d;
      out[n * 3 + 1] = dy / d;
      out[n * 3 + 2] = pen;
      n++;
    }
    return n;
  }
  if (x - r < MARGIN) {
    out[n * 3] = -1;
    out[n * 3 + 1] = 0;
    out[n * 3 + 2] = r - x;
    n++;
  } else if (x + r > w - MARGIN) {
    out[n * 3] = 1;
    out[n * 3 + 1] = 0;
    out[n * 3 + 2] = x + r - w;
    n++;
  }
  if (y + r > h - MARGIN) {
    out[n * 3] = 0;
    out[n * 3 + 1] = 1;
    out[n * 3 + 2] = y + r - h;
    n++;
  }
  return n;
}

export class World {
  constructor() {
    this.bodies = [];
    this.nextId = 1;
    this.events = []; // { type: 'bump', x, y, v, kind, other }
    this.contacts = [];
    this.nc = 0;
    this.parent = [];
    this._w = [0, 0, 0, 0, 0, 0];
    this.time = 0;
    this.prevJ = new Map(); // impulses from the last substep, keyed by contact, to warm-start the solver
    this.nextJ = new Map();
  }

  add({ kind, r, x, y, vx = 0, vy = 0, a = 0, w = 0, fresh = false, id = 0 }) {
    const b = {
      id: id || this.nextId++,
      kind,
      r,
      m: r * r,
      im: 1 / (r * r),
      x,
      y,
      vx,
      vy,
      a,
      w,
      sleep: false,
      rest: 0,
      touch: 0,
      fresh,
      fc: 0, // fruit contacts this substep
      lock: 0,
      age: 0,
      sq: 0, // squash amplitude and direction (drawing)
      sqa: 0,
      pop: 0, // spring-in timer (drawing)
      over: 0,
      _i: 0,
    };
    if (b.id >= this.nextId) this.nextId = b.id + 1;
    this.keepInside(b);
    this.bodies.push(b);
    return b;
  }

  remove(b) {
    const i = this.bodies.indexOf(b);
    if (i >= 0) this.bodies.splice(i, 1);
  }

  // Pushes a body that starts partly outside the jar back in.
  keepInside(b) {
    const w = this._w;
    for (let k = 0; k < 3; k++) {
      const n = wallHits(b.x, b.y, b.r, w);
      let moved = false;
      for (let i = 0; i < n; i++) {
        const pen = w[i * 3 + 2];
        if (pen > 0) {
          b.x -= w[i * 3] * pen;
          b.y -= w[i * 3 + 1] * pen;
          moved = true;
        }
      }
      if (!moved) break;
    }
  }

  // Wakes every body near a point, and anything touching those, so a pile re-settles after something vanished.
  wakeNear(x, y, range) {
    const bs = this.bodies;
    const stack = [];
    for (const b of bs) {
      const dx = b.x - x;
      const dy = b.y - y;
      if (b.sleep && dx * dx + dy * dy < (range + b.r) * (range + b.r)) {
        b.sleep = false;
        b.rest = 0;
        stack.push(b);
      }
    }
    while (stack.length) {
      const a = stack.pop();
      for (const b of bs) {
        if (!b.sleep) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const s = a.r + b.r + 2.5;
        if (dx * dx + dy * dy < s * s) {
          b.sleep = false;
          b.rest = 0;
          stack.push(b);
        }
      }
    }
  }

  step(dt) {
    const bs = this.bodies;
    // Lowest first: contacts come out roughly bottom-up, which is the order a stack wants to be solved in.
    bs.sort((p, q) => q.y - p.y || p.id - q.id);
    const h = dt / SUB;
    for (let s = 0; s < SUB; s++) this._substep(h, s === SUB - 1);
    const n = bs.length;
    // Sleep whole touching groups that have all been still for a while.
    const par = this.parent;
    const minRest = this._minRest || (this._minRest = []);
    for (let i = 0; i < n; i++) {
      const b = bs[i];
      b.age += dt;
      if (b.lock > 0) b.lock -= dt;
      if (b.sleep) continue;
      const still = b.touch > 0 && b.vx * b.vx + b.vy * b.vy < SLEEP_V * SLEEP_V && Math.abs(b.w) * b.r < SLEEP_V;
      b.rest = still ? b.rest + dt : 0;
    }
    for (let i = 0; i < n; i++) minRest[i] = Infinity;
    for (let i = 0; i < n; i++) {
      const b = bs[i];
      if (b.sleep) continue;
      const root = this._find(i);
      if (b.rest < minRest[root]) minRest[root] = b.rest;
    }
    for (let i = 0; i < n; i++) {
      const b = bs[i];
      if (b.sleep) continue;
      if (minRest[this._find(i)] >= SLEEP_T) {
        b.sleep = true;
        b.vx = b.vy = b.w = 0;
      }
    }
    void par;
    this.time += dt;
  }

  _find(i) {
    const p = this.parent;
    while (p[i] !== i) {
      p[i] = p[p[i]];
      i = p[i];
    }
    return i;
  }

  _contact() {
    if (this.nc === this.contacts.length) this.contacts.push(new Contact());
    return this.contacts[this.nc++];
  }

  _gather() {
    const bs = this.bodies;
    const n = bs.length;
    const w = this._w;
    this.nc = 0;
    const p = this.parent;
    p.length = n;
    for (let i = 0; i < n; i++) {
      p[i] = i;
      bs[i].touch = 0;
      bs[i].fc = 0;
      bs[i]._i = i;
    }
    for (let i = 0; i < n; i++) {
      const a = bs[i];
      if (!a.sleep) {
        const k = wallHits(a.x, a.y, a.r, w);
        for (let q = 0; q < k; q++) {
          const c = this._contact();
          c.a = a;
          c.b = null;
          c.nx = w[q * 3];
          c.ny = w[q * 3 + 1];
          c.pen = w[q * 3 + 2];
          c.mu = MU_WALL;
          c.key = a.id * KEY + KEY / 2 + q;
          a.touch++;
        }
      }
      for (let j = i + 1; j < n; j++) {
        const b = bs[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rs = a.r + b.r + MARGIN;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rs * rs) continue;
        const c = this._contact();
        c.a = a;
        c.b = b;
        const d = Math.sqrt(d2);
        if (d > 1e-6) {
          c.nx = dx / d;
          c.ny = dy / d;
        } else {
          c.nx = 0;
          c.ny = -1;
        }
        c.pen = a.r + b.r - d;
        c.mu = MU;
        c.key = a.id < b.id ? a.id * KEY + b.id : b.id * KEY + a.id;
        a.touch++;
        b.touch++;
        a.fc++;
        b.fc++;
        const ra = this._find(i);
        const rb = this._find(j);
        if (ra !== rb) p[ra] = rb;
      }
    }
    // A moving body that reaches a sleeping group wakes all of it.
    const cs = this.contacts;
    const woken = this._woken || (this._woken = []);
    woken.length = 0;
    const flag = this._flag || (this._flag = []);
    for (let i = 0; i < n; i++) flag[i] = 0; // bit 1: fast awake body, bit 2: sleeper
    for (let i = 0; i < n; i++) {
      const b = bs[i];
      const root = this._find(i);
      if (b.sleep) flag[root] |= 2;
      else if (b.vx * b.vx + b.vy * b.vy > WAKE_V * WAKE_V) flag[root] |= 1;
    }
    for (let i = 0; i < n; i++) {
      const b = bs[i];
      if (b.sleep && flag[this._find(i)] === 3) {
        b.sleep = false;
        b.rest = 0;
        woken.push(b);
      }
    }
    // Walls for the newly woken bodies (sleepers have none).
    for (const a of woken) {
      const k = wallHits(a.x, a.y, a.r, w);
      for (let q = 0; q < k; q++) {
        const c = this._contact();
        c.a = a;
        c.b = null;
        c.nx = w[q * 3];
        c.ny = w[q * 3 + 1];
        c.pen = w[q * 3 + 2];
        c.mu = MU_WALL;
        c.key = a.id * KEY + KEY / 2 + q;
        a.touch++;
      }
    }
    const pj = this.prevJ;
    for (let q = 0; q < this.nc; q++) {
      const c = cs[q];
      c.ima = c.a.sleep ? 0 : c.a.im;
      c.imb = c.b && !c.b.sleep ? c.b.im : 0;
      const old = pj.get(c.key);
      if (old !== undefined) {
        c.jn = old[0];
        c.jt = old[1];
      } else {
        c.jn = 0;
        c.jt = 0;
      }
    }
  }

  _apply(c, jn, jt) {
    const a = c.a;
    const b = c.b;
    const tx = -c.ny;
    const ty = c.nx;
    a.vx -= (jn * c.nx + jt * tx) * c.ima;
    a.vy -= (jn * c.ny + jt * ty) * c.ima;
    a.w -= (2 * jt * c.ima) / a.r;
    if (b) {
      b.vx += (jn * c.nx + jt * tx) * c.imb;
      b.vy += (jn * c.ny + jt * ty) * c.imb;
      b.w -= (2 * jt * c.imb) / b.r;
    }
  }

  _substep(h, last) {
    const bs = this.bodies;
    const n = bs.length;
    for (let i = 0; i < n; i++) {
      const b = bs[i];
      if (b.sleep) continue;
      b.vy += GRAVITY * h;
      const sp2 = b.vx * b.vx + b.vy * b.vy;
      if (sp2 > VMAX * VMAX) {
        const k = VMAX / Math.sqrt(sp2);
        b.vx *= k;
        b.vy *= k;
      }
    }
    this._gather();
    const cs = this.contacts;
    const nc = this.nc;
    // Closing speeds before any impulse: bounce targets and knock events.
    for (let q = 0; q < nc; q++) {
      const c = cs[q];
      const a = c.a;
      const b = c.b;
      const vn = ((b ? b.vx : 0) - a.vx) * c.nx + ((b ? b.vy : 0) - a.vy) * c.ny;
      c.rest = 0;
      c.bias = c.pen < 0 ? c.pen / h : 0;
      if (vn < -REST_V) c.rest = -E_REST * vn;
      if (vn < -BUMP_V && c.ima + c.imb > 0) {
        const amp = Math.min(0.2, -vn / 1000);
        if (amp > a.sq) {
          a.sq = amp;
          a.sqa = Math.atan2(c.ny, c.nx);
        }
        if (b && amp > b.sq) {
          b.sq = amp;
          b.sqa = Math.atan2(c.ny, c.nx);
        }
        if (this.events.length < 24) {
          this.events.push({
            type: 'bump',
            x: a.x + c.nx * a.r,
            y: a.y + c.ny * a.r,
            v: -vn,
            kind: a.kind,
            other: b ? b.kind : -1,
          });
        }
      }
    }
    for (let q = 0; q < nc; q++) {
      const c = cs[q];
      c.jn *= WARM;
      c.jt *= WARM;
      if (c.jn === 0 && c.jt === 0) continue;
      this._apply(c, c.jn, c.jt);
    }
    for (let it = 0; it < ITER; it++) {
      const fwd = (it & 1) === 0;
      for (let k = 0; k < nc; k++) {
        const c = cs[fwd ? k : nc - 1 - k];
        const imSum = c.ima + c.imb;
        if (imSum === 0) continue;
        const a = c.a;
        const b = c.b;
        const nx = c.nx;
        const ny = c.ny;
        const bvx = b ? b.vx : 0;
        const bvy = b ? b.vy : 0;
        // Normal.
        const vn = (bvx - a.vx) * nx + (bvy - a.vy) * ny;
        let dj = ((c.rest > 0 ? c.rest : c.bias) - vn) / imSum;
        const old = c.jn;
        c.jn = Math.max(0, old + dj);
        dj = c.jn - old;
        if (dj !== 0) {
          a.vx -= dj * nx * c.ima;
          a.vy -= dj * ny * c.ima;
          if (b) {
            b.vx += dj * nx * c.imb;
            b.vy += dj * ny * c.imb;
          }
        }
        // Friction (also spins the fruit: a disc rolls).
        const tx = -ny;
        const ty = nx;
        const vt = (bvx - a.vx) * tx + (bvy - a.vy) * ty - (b ? b.w * b.r : 0) - a.w * a.r;
        let jt = -vt / (3 * imSum);
        const lim = c.mu * c.jn;
        const oldt = c.jt;
        c.jt = Math.max(-lim, Math.min(lim, oldt + jt));
        jt = c.jt - oldt;
        if (jt !== 0) {
          a.vx -= jt * tx * c.ima;
          a.vy -= jt * ty * c.ima;
          a.w -= (2 * jt * c.ima) / a.r;
          if (b) {
            b.vx += jt * tx * c.imb;
            b.vy += jt * ty * c.imb;
            b.w -= (2 * jt * c.imb) / b.r;
          }
        }
      }
    }
    const nj = this.nextJ;
    nj.clear();
    for (let q = 0; q < nc; q++) {
      const c = cs[q];
      if (c.jn !== 0 || c.jt !== 0) nj.set(c.key, [c.jn, c.jt]);
    }
    this.nextJ = this.prevJ;
    this.prevJ = nj;
    // Move.
    for (let i = 0; i < n; i++) {
      const b = bs[i];
      if (b.sleep) continue;
      if (b.touch > 0) {
        const kd = 1 - LIN_DAMP * h;
        b.vx *= kd;
        b.vy *= kd;
        b.w *= 1 - ROLL_DAMP * h;
      }
      b.x += b.vx * h;
      b.y += b.vy * h;
      b.a += b.w * h;
      if (b.a > TWO_PI || b.a < -TWO_PI) b.a %= TWO_PI;
    }
    // Push out what's left of any overlap.
    const w = this._w;
    for (let it = 0; it < POS_IT; it++) {
      for (let k = 0; k < nc; k++) {
        const c = cs[k];
        const b = c.b;
        if (!b) continue;
        const imSum = c.ima + c.imb;
        if (imSum === 0) continue;
        const a = c.a;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const rs = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rs * rs) continue;
        const d = Math.sqrt(d2);
        const pen = rs - d - SLOP;
        if (pen <= 0) continue;
        let nx = c.nx;
        let ny = c.ny;
        if (d > 1e-6) {
          nx = dx / d;
          ny = dy / d;
        }
        const corr = (pen * PERC) / imSum;
        a.x -= nx * corr * c.ima;
        a.y -= ny * corr * c.ima;
        b.x += nx * corr * c.imb;
        b.y += ny * corr * c.imb;
      }
      for (let i = 0; i < n; i++) {
        const a = bs[i];
        if (a.sleep) continue;
        const kk = wallHits(a.x, a.y, a.r, w);
        for (let q = 0; q < kk; q++) {
          const pen = w[q * 3 + 2] - SLOP;
          if (pen > 0) {
            a.x -= w[q * 3] * pen;
            a.y -= w[q * 3 + 1] * pen;
          }
        }
      }
    }
    void last;
  }

  // Largest overlap between two fruit as a share of the smaller radius (0 when nothing overlaps), for tests.
  maxOverlap() {
    const bs = this.bodies;
    let m = 0;
    for (let i = 0; i < bs.length; i++) {
      for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i];
        const b = bs[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const pen = a.r + b.r - d;
        if (pen > 0) m = Math.max(m, pen / Math.min(a.r, b.r));
      }
    }
    return m;
  }

  // Share of the radius a fruit pokes through the jar, for tests.
  maxWallOverlap() {
    let m = 0;
    const w = this._w;
    for (const b of this.bodies) {
      const k = wallHits(b.x, b.y, b.r, w);
      for (let q = 0; q < k; q++) m = Math.max(m, w[q * 3 + 2] / b.r);
      if (b.x - b.r < -0.5 || b.x + b.r > JAR.w + 0.5 || b.y + b.r > JAR.h + 0.5) m = Math.max(m, 1);
    }
    return m;
  }

  energy() {
    let e = 0;
    for (const b of this.bodies) if (!b.sleep) e += 0.5 * b.m * (b.vx * b.vx + b.vy * b.vy);
    return e;
  }

  allAsleep() {
    return this.bodies.every((b) => b.sleep);
  }
}
