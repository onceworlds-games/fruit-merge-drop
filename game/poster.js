// Store pictures (?poster=cover|action|win|icon|badge-<id>) and a few review screens (title, play, late, combo, danger,
// over, sheet): one staged, deterministic frame drawn by the game's own renderer. No SDK, no sound.

import { Game } from './game.js';
import { createBot } from './bot.js';
import { createFx } from './fx.js';
import { createRenderer, COL } from './render.js';
import { computeLayout } from './layout.js';
import { drawFruit } from './fruit.js';
import { JAR, TIERS } from './config.js';

const settle = (g, frames = 150) => {
  for (let i = 0; i < frames; i++) g.step(1 / 60);
  g.events.length = 0;
};

function jarAfter(seed, drops, skill = 0.85) {
  const g = new Game({ seed });
  const bot = createBot(seed, skill);
  let f = 0;
  while (g.drops < drops && !g.over && f++ < 60 * 400) {
    if (g.ready) {
      g.setAim(bot.choose(g));
      g.drop();
    }
    g.step(1 / 60);
    g.events.length = 0;
  }
  settle(g, 180);
  return g;
}

// Put fruit exactly where a picture needs it (resting on the floor and each other), then let it settle.
function placed(list, seed = 3) {
  const g = new Game({ seed });
  g.drops = 20;
  for (const [kind, x, y] of list) g.world.add({ kind, r: TIERS[kind].r, x, y });
  for (const [kind] of list) g.made[kind] = true;
  g.biggest = Math.max(...list.map((l) => l[0]));
  settle(g, 240);
  return g;
}

const baseView = (g, extra = {}) => ({
  mode: 'play', game: g, t: 1.3, best: 12480, shownScore: g.score, clawX: g.aimX, clawOpen: 0, readyT: 1, hasSave: false,
  hint: null, hintT: 0, titleT: 1, overT: 0, newBest: false, hover: null, press: null, ...extra,
});

export async function runPoster(name) {
  document.body.innerHTML = '';
  document.body.style.cssText = 'margin:0;overflow:hidden;background:#2a1812';
  const W = window.innerWidth;
  const H = window.innerHeight;
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0';
  document.body.append(canvas);
  try {
    await document.fonts.load('900 80px Rubik');
    await document.fonts.load('800 30px Rubik');
  } catch {}
  await document.fonts.ready;

  if (name === 'icon') return icon(canvas, W, H);
  if (name.startsWith('badge-')) return badge(canvas, W, H, name.slice(6));

  const fx = createFx();
  const R = createRenderer(canvas, fx);
  let L = computeLayout(W, H);
  let view;

  if (name === 'title') {
    const g = jarAfter(8, 18);
    view = baseView(g, { mode: 'title', best: 12480, hasSave: true });
  } else if (name === 'play') {
    const g = jarAfter(4, 14);
    g.score = 180;
    view = baseView(g);
  } else if (name === 'late') {
    const g = jarAfter(4, 150);
    view = baseView(g, { shownScore: g.score });
  } else if (name === 'combo') {
    const g = jarAfter(4, 120);
    const t = g.world.bodies.reduce((a, b) => (b.kind > a.kind ? b : a), g.world.bodies[0]);
    fx.juice(t.x, t.y, TIERS[t.kind].juice, 40, 220, 4);
    fx.ring(t.x, t.y, t.r * 1.6, TIERS[t.kind].l, 5, 0.4);
    fx.float('+110', t.x, t.y, '#ffd24a', 30, 1.2, 30);
    fx.setCallout('COMBO x4', 'x3 POINTS', '#ff9a2e');
    fx.update(0.22);
    view = baseView(g);
  } else if (name === 'danger') {
    const g = jarAfter(4, 110);
    const b = g.world.add({ kind: 5, r: TIERS[5].r, x: 150, y: JAR.dangerY + 6 });
    b.fresh = false;
    b.sleep = true;
    g.dangerT = 1.6;
    g._danger(0.016);
    view = baseView(g);
  } else if (name === 'over') {
    const g = jarAfter(4, 140);
    g.over = true;
    view = baseView(g, { mode: 'over', overT: 1, newBest: true, shownScore: g.score });
  } else if (name === 'sheet') {
    R.resize(W, H, 1, L);
    const c = canvas.getContext('2d');
    c.fillStyle = '#f3d7a0';
    c.fillRect(0, 0, W, H);
    TIERS.forEach((t, k) => {
      const x = 160 + (k % 4) * 320;
      const y = 120 + Math.floor(k / 4) * 240;
      drawFruit(c, k, x, y, 84, 0.3 * k);
    });
    document.body.dataset.ready = '1';
    return;
  } else if (name === 'cover') {
    const g = jarAfter(12, 170, 0.9);
    const big = g.world.bodies.reduce((a, b) => (b.kind > a.kind ? b : a), g.world.bodies[0]);
    fx.juice(big.x, big.y, TIERS[big.kind].juice, 30, 200, 3.5);
    fx.setCallout('COMBO x3', null, '#ffd24a');
    fx.update(0.25);
    L = coverLayout(W, H);
    view = baseView(g, { showLogo: true, logoBox: { cx: L.logoCx, top: 60, maxW: 560, maxH: 470 } });
  } else if (name === 'action') {
    const g = jarAfter(12, 170, 0.9);
    const bs = g.world.bodies.slice().sort((a, b) => b.r - a.r);
    for (const b of bs.slice(0, 3)) {
      fx.juice(b.x, b.y, TIERS[b.kind].juice, 36, 260, 5, '#ffffff');
      fx.ring(b.x, b.y, b.r * 1.5, TIERS[b.kind].l, 7, 0.5);
    }
    fx.update(0.16);
    L = closeLayout(W, H);
    view = baseView(g, { showHud: false });
  } else if (name === 'win') {
    const g = placed([
      [10, 82, 370], [10, 205, 370], [9, 60, 255], [8, 140, 250], [7, 230, 262],
      [6, 40, 160], [5, 110, 150], [6, 190, 152], [4, 250, 160], [3, 80, 90], [2, 170, 95], [1, 230, 80],
    ]);
    g.score = 8420;
    const j = g.world.bodies.find((b) => b.kind === 10);
    fx.confetti(j.x, j.y - 40, 90, ['#c6e04a', '#ffd24a', '#ff7a3a', '#f7ead0', '#d63a2c']);
    fx.juice(j.x, j.y, TIERS[10].juice, 50, 300, 5, '#ffd24a');
    fx.ring(j.x, j.y, 150, '#ffd24a', 8, 0.7);
    fx.setBanner('Jackfruit', COL.brass);
    fx.setCallout('THE BIG ONE', '+500', '#ffd24a');
    fx.update(0.3);
    L = computeLayout(W, H);
    view = baseView(g);
  } else {
    document.body.dataset.ready = '1';
    return;
  }
  R.resize(W, H, 1, L);
  R.draw(view);
  // two draws so cached sprites and fonts are in place
  R.draw(view);
  document.body.dataset.ready = '1';
}

function coverLayout(W, H) {
  const L = computeLayout(W, H);
  const dx = 250;
  L.jx += dx;
  L.logoCx = 330;
  const gx = 90;
  L.score = { x: 70, y: 470, w: 250, h: 100 };
  const cell = 52;
  L.ladder = { cell, cells: [], r: cell * 0.4 };
  for (let k = 0; k < 11; k++) L.ladder.cells.push({ x: 360 + cell * 0.55 + (k % 4) * 0, y: 0 });
  // ladder: a row under the logo
  const cw = 46;
  for (let k = 0; k < 11; k++) L.ladder.cells[k] = { x: 90 + cw * k, y: 630 };
  L.ladder.r = 19;
  void gx;
  const jr = L.jx + (JAR.w + JAR.wall) * L.s + 20;
  L.next = { x: jr, y: 110, w: 150, h: 130, label: 'NEXT' };
  L.then = { x: jr, y: 290, w: 108, h: 94, label: 'THEN' };
  L.pause = { x: -100, y: -100, w: 1, h: 1 };
  return L;
}

function closeLayout(W, H) {
  const L = computeLayout(W, H);
  const s = 2.75;
  L.s = s;
  L.jx = (W - JAR.w * s) / 2;
  L.ry = H - 20 - (JAR.h - 40) * s - 40 * s;
  L.ry = -150 * s + 20;
  L.floorY = L.ry + JAR.h * s;
  L.counterY = L.floorY + JAR.wall * s * 0.7;
  L.counterH = 20;
  L.boardY = L.counterY + 20;
  L.boardH = Math.max(10, H - L.boardY);
  L.awn = 0;
  return L;
}

function ray(c, W, H, cx, cy, n, a, b) {
  for (let i = 0; i < n; i++) {
    c.fillStyle = i % 2 ? a : b;
    c.beginPath();
    c.moveTo(cx, cy);
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    c.arc(cx, cy, Math.hypot(W, H), a0, a1);
    c.closePath();
    c.fill();
  }
}

function icon(canvas, W, H) {
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d');
  ray(c, W, H, W / 2, H / 2, 16, '#d63a2c', '#c4301f');
  const g = c.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.62);
  g.addColorStop(0, 'rgba(255,215,120,0.55)');
  g.addColorStop(1, 'rgba(255,215,120,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(30,10,4,0.35)';
  c.beginPath();
  c.ellipse(W / 2, H * 0.84, W * 0.28, W * 0.045, 0, 0, Math.PI * 2);
  c.fill();
  drawFruit(c, 6, W / 2, H * 0.5, W * 0.33, -0.2);
  drawFruit(c, 0, W * 0.2, H * 0.78, W * 0.07, 0.5);
  drawFruit(c, 1, W * 0.8, H * 0.76, W * 0.085, 0.2);
  document.body.dataset.ready = '1';
}

function badge(canvas, W, H, id) {
  canvas.width = W;
  canvas.height = H;
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H / 2;
  const tone = { 'first-mango': '#e8863a', coconut: '#7a4a2a', jackfruit: '#7a8f2a', 'combo-5': '#d63a2c', 'score-3000': '#2f7078', 'score-8000': '#6a2f8a' }[id] || '#2f7078';
  c.fillStyle = COL.ink;
  c.beginPath();
  c.arc(cx, cy, W * 0.49, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = COL.brass;
  c.beginPath();
  c.arc(cx, cy, W * 0.46, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = tone;
  c.beginPath();
  c.arc(cx, cy, W * 0.39, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.14)';
  c.beginPath();
  c.arc(cx, cy, W * 0.39, Math.PI * 1.05, Math.PI * 1.75);
  c.lineTo(cx, cy);
  c.fill();
  const kinds = { 'first-mango': 7, coconut: 8, jackfruit: 10 };
  if (id in kinds) {
    drawFruit(c, kinds[id], cx, cy, W * 0.27, 0.4);
  } else {
    const label = { 'combo-5': 'x5', 'score-3000': '3K', 'score-8000': '8K' }[id] || '?';
    c.font = `900 ${W * 0.36}px Rubik, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.lineWidth = W * 0.08;
    c.strokeStyle = COL.ink;
    c.strokeText(label, cx, cy + W * 0.02);
    c.fillStyle = '#fff3d6';
    c.fillText(label, cx, cy + W * 0.02);
    if (id === 'combo-5') {
      drawFruit(c, 1, cx - W * 0.22, cy + W * 0.24, W * 0.07, 0);
      drawFruit(c, 4, cx, cy + W * 0.27, W * 0.07, 0);
      drawFruit(c, 6, cx + W * 0.22, cy + W * 0.24, W * 0.07, 0);
    }
  }
  document.body.dataset.ready = '1';
}
