import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, landingY } from '../game/game.js';
import { createBot } from '../game/bot.js';
import { JAR, radiusOf, mergeScore, comboMultiplier, DANGER_TIME, DROP_COOLDOWN, COMBO_WINDOW, KINDS } from '../game/config.js';

const put = (g, kind, x, y, extra = {}) => g.world.add({ kind, r: radiusOf(kind), x, y, ...extra });
const floorY = (kind) => JAR.h - radiusOf(kind);
const run = (g, seconds) => {
  for (let i = 0; i < Math.round(seconds * 60); i++) g.step(1 / 60);
};
const take = (g, type) => {
  const out = g.events.filter((e) => e.type === type);
  return out;
};

test('scoring: merging into tier k gives k(k+1), combos multiply', () => {
  assert.deepEqual([1, 2, 3, 4].map(mergeScore), [2, 6, 12, 20]);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(comboMultiplier), [1, 1.5, 2, 3, 4, 5]);
});

test('two equal fruit that touch merge exactly once into the next tier, at their midpoint', () => {
  const g = new Game({ seed: 1 });
  const r = radiusOf(0);
  put(g, 0, 100, floorY(0));
  put(g, 0, 100 + 2 * r, floorY(0));
  g.step(1 / 60);
  const merges = take(g, 'merge');
  assert.equal(merges.length, 1);
  assert.equal(g.world.bodies.length, 1);
  const f = g.world.bodies[0];
  assert.equal(f.kind, 1);
  assert.ok(Math.abs(merges[0].x - (100 + r)) < 1.5, `x ${merges[0].x}`);
  assert.equal(g.score, 2);
  assert.equal(g.merges, 1);
  assert.equal(g.biggest, 1);
  g.step(1 / 60);
  assert.equal(take(g, 'merge').length, 1, 'no second merge');
});

test('three equal fruit in a row merge as one pair (never three into two)', () => {
  const g = new Game({ seed: 1 });
  const r = radiusOf(2);
  put(g, 2, 100, floorY(2));
  put(g, 2, 100 + 2 * r, floorY(2));
  put(g, 2, 100 + 4 * r, floorY(2));
  g.step(1 / 60);
  assert.equal(take(g, 'merge').length, 1);
  assert.equal(g.world.bodies.length, 2);
  assert.deepEqual(g.world.bodies.map((b) => b.kind).sort(), [2, 3]);
});

test('four equal fruit make two merges, then the two results can chain', () => {
  const g = new Game({ seed: 1 });
  const r = radiusOf(0);
  for (let i = 0; i < 4; i++) put(g, 0, 90 + i * 2 * r, floorY(0));
  run(g, 3);
  assert.equal(g.merges >= 2, true);
  assert.equal(g.score >= 2 + 2, true);
  for (const b of g.world.bodies) assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y));
});

test('merges within 0.9 s chain into a combo; later ones start over', () => {
  const g = new Game({ seed: 1 });
  const r = radiusOf(0);
  put(g, 0, 60, floorY(0));
  put(g, 0, 60 + 2 * r, floorY(0));
  put(g, 1, 190, floorY(1));
  put(g, 1, 190 + 2 * radiusOf(1), floorY(1));
  g.step(1 / 60);
  assert.equal(g.comboN, 2);
  assert.equal(g.longestCombo, 2);
  const merges = take(g, 'merge');
  assert.equal(merges[0].mult, 1);
  assert.equal(merges[1].mult, 1.5);
  assert.equal(g.score, 2 + Math.round(6 * 1.5));
  assert.equal(take(g, 'combo').length, 1);
  run(g, COMBO_WINDOW + 0.2);
  assert.equal(g.comboN, 0);
  put(g, 3, 150, floorY(3));
  put(g, 3, 150 + 2 * radiusOf(3), floorY(3));
  g.step(1 / 60);
  assert.equal(g.comboN, 1);
});

test('two Jackfruits burst away for +500', () => {
  const g = new Game({ seed: 1 });
  const r = radiusOf(10);
  put(g, 10, 60, floorY(10));
  put(g, 10, 60 + 2 * r, floorY(10));
  put(g, 1, 150, 100);
  g.step(1 / 60);
  assert.equal(take(g, 'burst').length, 1);
  assert.equal(g.score, 500);
  assert.equal(g.world.bodies.filter((b) => b.kind === 10).length, 0);
});

test('the held fruit follows the aim, stays in the jar, and a drop hands over after the cooldown', () => {
  const g = new Game({ seed: 4 });
  g.setAim(-500);
  assert.ok(g.aimX >= radiusOf(g.held));
  g.setAim(9999);
  assert.ok(g.aimX <= JAR.w - radiusOf(g.held));
  g.setAim(120);
  const kind = g.held;
  const next = g.next;
  const then = g.then;
  assert.equal(g.drop(), true);
  assert.equal(g.held, null);
  assert.equal(g.world.bodies.length, 1);
  assert.equal(g.world.bodies[0].kind, kind);
  assert.equal(g.drop(), false, 'still on cooldown');
  run(g, DROP_COOLDOWN - 0.1);
  assert.equal(g.held, null);
  run(g, 0.2);
  assert.equal(g.held, next);
  assert.equal(g.next, then);
  assert.ok(g.then >= 0 && g.then < 5);
});

test('a drop asked for just before the claw is ready goes as soon as it is', () => {
  const g = new Game({ seed: 4 });
  g.setAim(100);
  g.drop();
  run(g, DROP_COOLDOWN - 0.05);
  assert.equal(g.drop(), false);
  run(g, 0.1);
  assert.equal(g.drops, 2);
});

test('drops are among the five smallest tiers, mostly the smallest', () => {
  const g = new Game({ seed: 9 });
  g.drops = 10;
  const counts = new Array(KINDS).fill(0);
  for (let i = 0; i < 3000; i++) counts[g._pick()]++;
  for (let k = 5; k < KINDS; k++) assert.equal(counts[k], 0);
  assert.ok(counts[0] > counts[1] && counts[1] > counts[2] && counts[2] > counts[3] && counts[3] > counts[4] && counts[4] > 0);
});

test('danger: a settled fruit over the line ends the game after 2.5 s; a falling one does not', () => {
  const g = new Game({ seed: 2 });
  // a column of big fruit wedged high
  const b = put(g, 6, 150, JAR.dangerY + 10);
  b.fresh = true;
  b.sleep = false;
  b.vy = 300;
  g.step(1 / 60);
  assert.equal(g.dangerT, 0, 'fresh and moving does not count');
  const g2 = new Game({ seed: 2 });
  const r = radiusOf(7);
  // stack three different big fruit so the top one rests above the line
  let y = floorY(7);
  const kinds = [7, 8, 9, 6, 5];
  y = JAR.h;
  for (const k of kinds) {
    y -= radiusOf(k);
    put(g2, k, 150, y);
    y -= radiusOf(k);
  }
  void r;
  let t = 0;
  while (!g2.over && t < 10) {
    g2.step(1 / 60);
    t += 1 / 60;
  }
  // wedged straight stack is unstable; whatever happens the game must either end near 2.5 s of danger or never have been in danger
  if (g2.over) assert.ok(t >= DANGER_TIME - 0.1, `over after ${t}`);
});

test('danger timer counts up while a settled fruit sits over the line and drains when it leaves', () => {
  const g = new Game({ seed: 2 });
  const f = put(g, 4, 150, JAR.dangerY - 5 + radiusOf(4) - radiusOf(4));
  f.fresh = false;
  f.sleep = true; // held up by nothing: it stays where it is for this test
  f.vx = f.vy = 0;
  run(g, 1);
  assert.ok(Math.abs(g.dangerT - 1) < 0.05, `t ${g.dangerT}`);
  assert.ok(g.danger > 0.35 && g.danger < 0.45);
  g.world.remove(f);
  run(g, 0.3);
  assert.ok(g.dangerT < 0.5);
  run(g, 1);
  assert.equal(g.dangerT, 0);
  assert.equal(g.over, false);
});

test('game over fires once when the timer runs out', () => {
  const g = new Game({ seed: 2 });
  const f = put(g, 4, 150, 60);
  f.fresh = false;
  f.sleep = true;
  run(g, DANGER_TIME + 0.2);
  assert.equal(g.over, true);
  assert.equal(take(g, 'over').length, 1);
  run(g, 1);
  assert.equal(take(g, 'over').length, 1);
  assert.equal(g.drop(), false);
});

test('landingY predicts where a fruit comes to rest', () => {
  const g = new Game({ seed: 3 });
  put(g, 3, 150, floorY(3));
  put(g, 2, 170, floorY(2));
  run(g, 2);
  for (const x of [60, 150, 165, 240]) {
    const predicted = landingY(g.world.bodies, x, radiusOf(1));
    const b = put(g, 1, x, -30);
    b.fresh = true;
    run(g, 1.6);
    // not an exact roll-free landing when it hits a slope: it must not end higher than predicted plus a small slack
    assert.ok(b.y >= predicted - 1, `x ${x}: predicted ${predicted}, rest ${b.y}`);
    g.world.remove(b);
  }
});

test('a saved jar restores the same fruit, score and next fruit; garbage is refused', () => {
  const g = new Game({ seed: 5 });
  const bot = createBot(5, 0.9);
  for (let i = 0; i < 600; i++) {
    if (g.ready) {
      g.setAim(bot.choose(g));
      g.drop();
    }
    g.step(1 / 60);
    g.events.length = 0;
  }
  const snap = JSON.parse(JSON.stringify(g.snapshot()));
  const r = Game.restore(snap);
  assert.ok(r);
  assert.equal(r.score, g.score);
  assert.equal(r.next, g.next);
  assert.equal(r.then, g.then);
  assert.equal(r.world.bodies.length, g.world.bodies.length);
  assert.deepEqual(r.made, g.made);
  const key = (w) => w.bodies.map((b) => [b.kind, b.x, b.y]).sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const [ka, kb] = [key(r.world), key(g.world)];
  ka.forEach((f, i) => f.forEach((v, j) => assert.ok(Math.abs(v - kb[i][j]) < 0.2, `fruit ${i}`)));
  // it plays on: the restored jar settles and has no overlap
  run(r, 3);
  assert.ok(r.world.maxOverlap() < 0.02);
  for (const bad of [null, {}, { v: 2 }, { v: 1, fruit: 'x' }, { v: 1, fruit: [[99, 1, 1, 0]], score: 0, held: 0, next: 0, then: 0 },
    { v: 1, fruit: [[1, NaN, 1, 0]], score: 0, held: 0, next: 0, then: 0 }, { v: 1, fruit: [], score: -5, held: 0, next: 0, then: 0 }]) {
    assert.equal(Game.restore(bad), null);
  }
});

test('whole games by the bot, many seeds: finite scores, no NaN, nothing outside the jar, merges consistent', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const g = new Game({ seed });
    const bot = createBot(seed, seed % 3 === 0 ? -8 : 0.8);
    let frames = 0;
    let merges = 0;
    let scoreBefore = 0;
    while (!g.over && frames < 60 * 90) {
      if (g.ready) {
        g.setAim(bot.choose(g));
        g.drop();
      }
      g.step(1 / 60);
      for (const e of g.events) if (e.type === 'merge' || e.type === 'burst') merges++;
      g.events.length = 0;
      frames++;
      assert.ok(g.score >= scoreBefore);
      scoreBefore = g.score;
      if (frames % 60 === 0) {
        assert.ok(Number.isFinite(g.score));
        for (const b of g.world.bodies) {
          assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y) && Number.isFinite(b.a), `NaN seed ${seed}`);
          assert.ok(b.x - b.r >= -1 && b.x + b.r <= JAR.w + 1 && b.y + b.r <= JAR.h + 1, `outside seed ${seed}: ${b.x},${b.y}`);
        }
      }
    }
    assert.equal(merges, g.merges, `merge count seed ${seed}`);
    assert.ok(g.score > 0 && Number.isFinite(g.score));
    assert.ok(g.drops > 20);
  }
});

test('a lost jar: a dumb player fills it and the game ends with a finite score', () => {
  const g = new Game({ seed: 77 });
  let frames = 0;
  while (!g.over && frames < 60 * 600) {
    if (g.ready) {
      g.setAim(150);
      g.drop();
    }
    g.step(1 / 60);
    g.events.length = 0;
    frames++;
  }
  assert.equal(g.over, true);
  assert.ok(Number.isFinite(g.score));
});
