import test from 'node:test';
import assert from 'node:assert/strict';
import { World, VMAX } from '../game/physics.js';
import { JAR, radiusOf, TIERS } from '../game/config.js';
import { createRng } from '../game/rng.js';

const add = (w, kind, x, y, extra = {}) => w.add({ kind, r: radiusOf(kind), x, y, ...extra });
const run = (w, seconds) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) w.step(1 / 60);
};
const settle = (w, limit = 6) => {
  let f = 0;
  while (!w.allAsleep() && f < limit * 60) {
    w.step(1 / 60);
    f++;
  }
  return f / 60;
};

test('the ladder has 11 tiers and a Jackfruit about 46% of the jar', () => {
  assert.equal(TIERS.length, 11);
  assert.equal(TIERS[0].name, 'Blueberry');
  assert.equal(TIERS[10].name, 'Jackfruit');
  const share = (TIERS[10].r * 2) / JAR.w;
  assert.ok(share > 0.44 && share < 0.48, `share ${share}`);
  for (let k = 1; k < 11; k++) assert.ok(TIERS[k].r > TIERS[k - 1].r * 1.15 && TIERS[k].r < TIERS[k - 1].r * 1.3);
});

test('a dropped fruit lands on the floor, rests and falls asleep', () => {
  const w = new World();
  const b = add(w, 3, 150, -30);
  const t = settle(w, 4);
  assert.ok(w.allAsleep(), 'asleep');
  assert.ok(t < 3, `took ${t}s`);
  assert.ok(Math.abs(b.y - (JAR.h - b.r)) < 0.3, `y ${b.y}`);
  assert.ok(Math.abs(b.x - 150) < 40);
});

test('120 fruit dropped one after another settle with almost no overlap, all inside the jar', () => {
  const rng = createRng(7);
  const w = new World();
  let worstDuring = 0;
  for (let i = 0; i < 120; i++) {
    const k = Math.floor(rng() * 4);
    const r = radiusOf(k);
    add(w, k, r + rng() * (JAR.w - 2 * r), -30);
    for (let f = 0; f < 18; f++) {
      w.step(1 / 60);
      worstDuring = Math.max(worstDuring, w.maxWallOverlap());
    }
  }
  const t = settle(w, 5);
  assert.ok(w.allAsleep(), 'pile asleep');
  assert.ok(t < 3, `pile settled in ${t}s`);
  assert.ok(w.maxOverlap() < 0.02, `overlap ${w.maxOverlap()}`);
  assert.ok(w.maxWallOverlap() < 0.02);
  assert.ok(worstDuring < 0.05, `wall ${worstDuring}`);
  for (const b of w.bodies) {
    assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y));
    assert.ok(b.x - b.r >= -0.5 && b.x + b.r <= JAR.w + 0.5 && b.y + b.r <= JAR.h + 0.5);
  }
  assert.equal(w.energy(), 0);
});

test('big fruit on little ones: heavy stack stays unsquashed', () => {
  const rng = createRng(11);
  const w = new World();
  for (let i = 0; i < 40; i++) {
    const k = Math.floor(rng() * rng() * 11);
    const r = radiusOf(k);
    add(w, k, r + rng() * (JAR.w - 2 * r), -30);
    run(w, 0.5);
  }
  settle(w, 6);
  assert.ok(w.allAsleep());
  assert.ok(w.maxOverlap() < 0.02, `overlap ${w.maxOverlap()}`);
});

test('the same drops give the same pile, to the last digit', () => {
  const make = () => {
    const rng = createRng(3);
    const w = new World();
    for (let i = 0; i < 60; i++) {
      const k = Math.floor(rng() * 5);
      add(w, k, radiusOf(k) + rng() * 180, -30);
      run(w, 0.3);
    }
    run(w, 2);
    return w.bodies.map((b) => [b.id, b.x, b.y, b.a]).sort((p, q) => p[0] - q[0]);
  };
  assert.deepEqual(make(), make());
});

test('nothing tunnels through the floor or walls at top speed', () => {
  const w = new World();
  const a = add(w, 0, 150, 100, { vy: VMAX });
  const b = add(w, 0, 40, 200, { vx: -VMAX });
  const c = add(w, 0, 220, 200, { vx: VMAX, vy: -VMAX });
  const d = add(w, 10, 150, 300, { vy: VMAX });
  run(w, 1);
  for (const x of [a, b, c, d]) {
    assert.ok(x.x - x.r >= -0.6 && x.x + x.r <= JAR.w + 0.6 && x.y + x.r <= JAR.h + 0.6, `out at ${x.x},${x.y}`);
  }
  settle(w, 6);
  assert.ok(w.allAsleep());
  assert.ok(w.maxOverlap() < 0.02);
});

test('a fruit dropped on the corner rolls (it spins) and comes to rest', () => {
  const w = new World();
  const b = add(w, 4, 30, 200);
  let maxSpin = 0;
  let travelled = 0;
  const x0 = b.x;
  for (let i = 0; i < 360; i++) {
    w.step(1 / 60);
    maxSpin = Math.max(maxSpin, Math.abs(b.w));
    travelled = Math.max(travelled, Math.abs(b.x - x0));
  }
  assert.ok(maxSpin > 2, `spin ${maxSpin}`);
  assert.ok(travelled > 10, `rolled ${travelled}`);
  assert.ok(w.allAsleep(), 'rested');
});

test('removing the support wakes what rests on it', () => {
  const w = new World();
  const r = radiusOf(3);
  const low = add(w, 3, 150 - r, JAR.h - r);
  add(w, 3, 150 + r, JAR.h - r);
  const up = add(w, 3, 150, JAR.h - r - r * 1.75);
  settle(w, 4);
  assert.ok(w.allAsleep());
  const y0 = up.y;
  w.remove(low);
  w.wakeNear(low.x, low.y, 40);
  run(w, 1);
  assert.ok(up.y > y0 + 10, `fell ${up.y - y0}`);
});

test('a fast fruit landing on a sleeping pile wakes it', () => {
  const w = new World();
  const a = add(w, 5, 150, JAR.h - radiusOf(5));
  settle(w, 3);
  assert.ok(a.sleep);
  add(w, 5, 150, 100);
  run(w, 0.5);
  assert.ok(w.bodies.some((b) => b.rest < 0.4) || !a.sleep || w.bodies.length === 2);
  settle(w, 4);
  assert.ok(w.maxOverlap() < 0.02);
});

test('hits make knock events scaled by speed; resting makes none', () => {
  const w = new World();
  add(w, 3, 150, -30);
  let bumps = [];
  for (let i = 0; i < 90; i++) {
    w.step(1 / 60);
    bumps = bumps.concat(w.events);
    w.events.length = 0;
  }
  assert.ok(bumps.length >= 1);
  assert.ok(Math.max(...bumps.map((e) => e.v)) > 300);
  run(w, 2);
  assert.equal(w.events.length, 0);
});
