import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout, toScreenX, toWorldX } from '../game/layout.js';
import { JAR } from '../game/config.js';

const SIZES = [[390, 844], [360, 640], [412, 915], [320, 568], [844, 390], [667, 375], [768, 1024], [1280, 720], [1920, 1080], [1024, 768]];

test('the jar, the HUD and the ladder fit every window size and stay off the platform menu corner', () => {
  for (const [W, H] of SIZES) {
    const L = computeLayout(W, H);
    const where = `${W}x${H}`;
    assert.ok(L.s > 0.3, `${where}: scale ${L.s}`);
    const left = L.jx - JAR.wall * L.s;
    const right = L.jx + (JAR.w + JAR.wall) * L.s;
    assert.ok(left >= 0 && right <= W, `${where}: jar across ${left}..${right}`);
    assert.ok(L.floorY + JAR.wall * L.s <= H, `${where}: floor ${L.floorY}`);
    assert.ok(L.ry + JAR.railY * L.s > L.awn - 4, `${where}: claw rail under the awning`);
    for (const k of ['score', 'next', 'then', 'pause']) {
      const r = L[k];
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= W && r.y + r.h <= H, `${where}: ${k} on screen`);
    }
    for (const c of L.ladder.cells) assert.ok(c.x > 0 && c.x < W && c.y > 0 && c.y < H, `${where}: ladder cell on screen`);
    // nothing readable under the menu (top left 150x70)
    for (const k of ['score', 'next', 'then']) {
      const r = L[k];
      const top = k === 'score' ? r.y : r.y - 22;
      assert.ok(top >= 64 || r.x >= 150, `${where}: ${k} top ${top}`);
    }
    if (L.wide) {
      assert.ok(L.score.x + L.score.w <= left + 2, `${where}: score left of the jar`);
      assert.ok(L.next.x >= right - 2, `${where}: next right of the jar`);
    }
  }
});

test('screen and jar coordinates round-trip', () => {
  const L = computeLayout(390, 844);
  for (const x of [0, 50, 130, JAR.w]) assert.ok(Math.abs(toWorldX(L, toScreenX(L, x)) - x) < 1e-9);
});
