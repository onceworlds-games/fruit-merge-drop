// Every fruit is drawn in code: a rotating skin sprite (texture, stems, leaves) under a fixed lighting sprite
// (core shadow, rim light, highlight, outline), so the fruit turns while the light stays put. Sprites are cached per
// kind and pixel size.

import { TIERS } from './config.js';
import { createRng } from './rng.js';

const PAD = 1.42; // sprite is PAD * R on each side (room for stems and leaves)
const cache = new Map();

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

const TAU = Math.PI * 2;

function disc(c, x, y, r, fill) {
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fillStyle = fill;
  c.fill();
}

function ellipse(c, x, y, rx, ry, rot, fill) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, TAU);
  c.fillStyle = fill;
  c.fill();
}

function line(c, x0, y0, x1, y1, w, col, cap = 'round') {
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.lineWidth = w;
  c.strokeStyle = col;
  c.lineCap = cap;
  c.stroke();
}

function radial(c, x, y, r0, r1, stops) {
  const g = c.createRadialGradient(x, y, r0, x, y, r1);
  for (const [o, col] of stops) g.addColorStop(o, col);
  return g;
}

// A leaf from (x, y) pointing at angle a: an almond with a vein.
function leaf(c, x, y, len, a, col, vein) {
  c.save();
  c.translate(x, y);
  c.rotate(a);
  c.beginPath();
  c.moveTo(0, 0);
  c.bezierCurveTo(len * 0.25, -len * 0.36, len * 0.75, -len * 0.3, len, 0);
  c.bezierCurveTo(len * 0.75, len * 0.3, len * 0.25, len * 0.36, 0, 0);
  c.fillStyle = col;
  c.fill();
  line(c, len * 0.04, 0, len * 0.86, 0, Math.max(1, len * 0.04), vein, 'round');
  c.restore();
}

function stem(c, x, y, len, w, a, col, tip) {
  c.save();
  c.translate(x, y);
  c.rotate(a);
  line(c, 0, 0, len, 0, w, col, 'round');
  if (tip) disc(c, len, 0, w * 0.5, tip);
  c.restore();
}

function scatter(c, rng, n, R, maxR, rMin, rMax, fill, alpha = 1) {
  c.globalAlpha = alpha;
  c.fillStyle = fill;
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU;
    const d = Math.sqrt(rng()) * maxR * R;
    c.beginPath();
    c.arc(Math.cos(a) * d, Math.sin(a) * d, (rMin + rng() * (rMax - rMin)) * R, 0, TAU);
    c.fill();
  }
  c.globalAlpha = 1;
}

function clipDisc(c, R) {
  c.beginPath();
  c.arc(0, 0, R, 0, TAU);
  c.clip();
}

const ART = [
  // 0 Blueberry: dusty navy skin with a star crown
  (c, R, rng) => {
    c.save();
    clipDisc(c, R);
    disc(c, 0, 0, R, radial(c, -R * 0.2, -R * 0.25, 0, R * 1.2, [[0, '#4b60bd'], [1, '#2c3a86']]));
    for (let i = 0; i < 9; i++) {
      const a = rng() * TAU;
      const d = rng() * R * 0.7;
      ellipse(c, Math.cos(a) * d, Math.sin(a) * d, R * (0.18 + rng() * 0.22), R * (0.12 + rng() * 0.15), rng() * 3, 'rgba(176,192,244,0.2)');
    }
    c.restore();
    c.save();
    c.translate(R * 0.14, -R * 0.12);
    c.rotate(0.4);
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const rr = i % 2 ? R * 0.1 : R * 0.31;
      const a = (i / 10) * TAU - Math.PI / 2;
      if (i) c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath();
    c.fillStyle = '#161c4d';
    c.fill();
    c.lineWidth = R * 0.05;
    c.strokeStyle = 'rgba(120,138,222,0.7)';
    c.stroke();
    disc(c, 0, 0, R * 0.05, '#7d8ee0');
    c.restore();
  },
  // 1 Lime: glossy green, pitted peel, a little nub and a leaf
  (c, R, rng) => {
    leaf(c, R * 0.55, -R * 0.78, R * 0.55, -0.5, '#4f9a2c', '#7ac24a');
    stem(c, R * 0.55, -R * 0.78, R * 0.1, R * 0.12, -1.0, '#6b8a2a');
    c.save();
    clipDisc(c, R);
    disc(c, 0, 0, R, radial(c, -R * 0.25, -R * 0.25, 0, R * 1.25, [[0, '#b2dc5c'], [0.6, '#8dc63f'], [1, '#6aa52a']]));
    scatter(c, rng, 26, R, 0.92, 0.025, 0.045, '#4f8a1d', 0.55);
    scatter(c, rng, 12, R, 0.85, 0.03, 0.06, '#d3ee8c', 0.35);
    c.restore();
    ellipse(c, -R * 0.95, R * 0.1, R * 0.12, R * 0.09, 0, '#7bb432');
  },
  // 2 Kiwi: cut open, green flesh, pale core, ring of seeds
  (c, R, rng) => {
    disc(c, 0, 0, R, '#6f5130');
    for (let i = 0; i < 70; i++) {
      const a = (i / 70) * TAU + rng() * 0.05;
      const l = R * (0.04 + rng() * 0.05);
      line(c, Math.cos(a) * R * 0.96, Math.sin(a) * R * 0.96, Math.cos(a) * (R * 0.96 + l), Math.sin(a) * (R * 0.96 + l), R * 0.03, rng() < 0.5 ? '#98723f' : '#7a5a34');
    }
    disc(c, 0, 0, R * 0.9, '#a9d460');
    disc(c, 0, 0, R * 0.85, radial(c, 0, 0, R * 0.1, R * 0.88, [[0, '#d9ee8d'], [0.5, '#9fd24c'], [1, '#6fb02c']]));
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * TAU;
      line(c, Math.cos(a) * R * 0.26, Math.sin(a) * R * 0.26, Math.cos(a) * R * (0.62 + (i % 2) * 0.12), Math.sin(a) * R * (0.62 + (i % 2) * 0.12), R * 0.022, 'rgba(206,238,130,0.65)');
    }
    disc(c, 0, 0, R * 0.27, radial(c, 0, 0, 0, R * 0.27, [[0, '#fbfce3'], [0.75, '#f0f4c0'], [1, 'rgba(240,244,192,0)']]));
    for (let i = 0; i < 30; i++) {
      const a = (i / 30) * TAU + 0.1;
      const d = R * (0.4 + (i % 3) * 0.04);
      ellipse(c, Math.cos(a) * d, Math.sin(a) * d, R * 0.026, R * 0.052, a + Math.PI / 2, '#15130b');
    }
  },
  // 3 Plum: deep purple, waxy bloom, a suture down one side
  (c, R, rng) => {
    stem(c, 0, -R * 0.86, R * 0.22, R * 0.07, -Math.PI / 2 + 0.2, '#6d4a26', '#4a3018');
    c.save();
    clipDisc(c, R);
    disc(c, 0, 0, R, radial(c, -R * 0.2, -R * 0.2, 0, R * 1.2, [[0, '#8a46ab'], [0.6, '#632a85'], [1, '#431664']]));
    ellipse(c, -R * 0.35, -R * 0.2, R * 0.5, R * 0.75, 0.3, 'rgba(224,210,246,0.2)');
    scatter(c, rng, 14, R, 0.9, 0.04, 0.09, 'rgba(210,190,240,0.13)');
    c.beginPath();
    c.moveTo(0, -R * 0.86);
    c.bezierCurveTo(R * 0.34, -R * 0.35, R * 0.34, R * 0.35, 0, R * 0.9);
    c.lineWidth = R * 0.07;
    c.strokeStyle = 'rgba(45,10,66,0.75)';
    c.lineCap = 'round';
    c.stroke();
    c.beginPath();
    c.moveTo(-R * 0.04, -R * 0.8);
    c.bezierCurveTo(R * 0.26, -R * 0.35, R * 0.26, R * 0.35, -R * 0.04, R * 0.85);
    c.lineWidth = R * 0.02;
    c.strokeStyle = 'rgba(190,140,225,0.4)';
    c.stroke();
    c.restore();
    ellipse(c, 0, -R * 0.86, R * 0.1, R * 0.06, 0, 'rgba(30,6,44,0.7)');
  },
  // 4 Lemon: yellow with pointed ends
  (c, R, rng) => {
    c.beginPath();
    c.moveTo(R * 0.86, -R * 0.26);
    c.quadraticCurveTo(R * 1.32, 0, R * 0.86, R * 0.26);
    c.closePath();
    c.fillStyle = '#e8c61e';
    c.fill();
    c.beginPath();
    c.moveTo(-R * 0.92, -R * 0.14);
    c.quadraticCurveTo(-R * 1.16, 0, -R * 0.92, R * 0.14);
    c.closePath();
    c.fill();
    c.save();
    clipDisc(c, R);
    disc(c, 0, 0, R, radial(c, -R * 0.2, -R * 0.3, 0, R * 1.25, [[0, '#fff06b'], [0.55, '#f6da2e'], [1, '#d9aa0f']]));
    scatter(c, rng, 40, R, 0.93, 0.015, 0.03, '#c99c10', 0.5);
    ellipse(c, R * 0.2, R * 0.35, R * 0.5, R * 0.3, 0.4, 'rgba(255,247,150,0.25)');
    c.restore();
  },
  // 5 Peach: blushing fuzz, a cleft and a leaf
  (c, R, rng) => {
    leaf(c, R * 0.1, -R * 0.86, R * 0.7, -0.35, '#5aa43c', '#8cd065');
    stem(c, 0, -R * 0.82, R * 0.2, R * 0.08, -Math.PI / 2 - 0.15, '#6d4a26');
    c.save();
    clipDisc(c, R);
    const g = c.createLinearGradient(-R, -R, R, R);
    g.addColorStop(0, '#fbc27a');
    g.addColorStop(0.5, '#f69a6a');
    g.addColorStop(1, '#e9605e');
    disc(c, 0, 0, R, g);
    ellipse(c, R * 0.35, R * 0.3, R * 0.75, R * 0.6, 0.6, 'rgba(232,76,90,0.35)');
    scatter(c, rng, 90, R, 0.95, 0.01, 0.025, '#fff1de', 0.3);
    c.beginPath();
    c.moveTo(R * 0.02, -R * 0.84);
    c.bezierCurveTo(R * 0.36, -R * 0.4, R * 0.3, R * 0.25, -R * 0.05, R * 0.55);
    c.lineWidth = R * 0.06;
    c.strokeStyle = 'rgba(170,52,56,0.55)';
    c.lineCap = 'round';
    c.stroke();
    c.beginPath();
    c.moveTo(-R * 0.03, -R * 0.82);
    c.bezierCurveTo(R * 0.28, -R * 0.4, R * 0.22, R * 0.22, -R * 0.1, R * 0.5);
    c.lineWidth = R * 0.025;
    c.strokeStyle = 'rgba(255,214,170,0.45)';
    c.stroke();
    c.restore();
  },
  // 6 Orange: pitted peel, calyx button and a leaf
  (c, R, rng) => {
    leaf(c, R * 0.12, -R * 0.9, R * 0.62, -0.7, '#3f8a2a', '#76bf4a');
    c.save();
    clipDisc(c, R);
    disc(c, 0, 0, R, radial(c, -R * 0.2, -R * 0.25, 0, R * 1.25, [[0, '#ffb544'], [0.55, '#f58f1d'], [1, '#d9690a']]));
    scatter(c, rng, 80, R, 0.95, 0.018, 0.034, '#c25c05', 0.5);
    scatter(c, rng, 30, R, 0.9, 0.02, 0.035, '#ffd88a', 0.35);
    c.restore();
    c.save();
    c.translate(0, -R * 0.86);
    for (let i = 0; i < 5; i++) {
      c.rotate(TAU / 5);
      ellipse(c, R * 0.1, 0, R * 0.12, R * 0.05, 0, '#4d8f2b');
    }
    disc(c, 0, 0, R * 0.05, '#2d6218');
    c.restore();
    c.beginPath();
    c.arc(R * 0.1, R * 0.82, R * 0.1, 0, TAU);
    c.lineWidth = R * 0.03;
    c.strokeStyle = 'rgba(160,70,0,0.55)';
    c.stroke();
  },
  // 7 Mango: red and gold blush fading to green at the shoulder
  (c, R, rng) => {
    stem(c, -R * 0.1, -R * 0.88, R * 0.22, R * 0.1, -Math.PI / 2 + 0.25, '#6a4a28', '#4b321a');
    c.save();
    clipDisc(c, R);
    disc(c, 0, 0, R, '#f6c534');
    disc(c, 0, 0, R, radial(c, R * 0.35, R * 0.4, 0, R * 1.2, [[0, 'rgba(226,62,52,0.95)'], [0.6, 'rgba(236,98,48,0.6)'], [1, 'rgba(240,150,40,0)']]));
    disc(c, 0, 0, R, radial(c, -R * 0.3, -R * 0.75, 0, R * 0.9, [[0, 'rgba(120,184,70,0.95)'], [1, 'rgba(120,184,70,0)']]));
    scatter(c, rng, 30, R, 0.9, 0.014, 0.03, '#fff3b0', 0.65);
    c.restore();
  },
  // 8 Coconut: hairy brown husk with three eyes
  (c, R, rng) => {
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * TAU + rng() * 0.1;
      const l = R * (0.04 + rng() * 0.07);
      line(c, Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95, Math.cos(a + 0.1) * (R * 0.95 + l), Math.sin(a + 0.1) * (R * 0.95 + l), R * 0.025, '#5b3a1d');
    }
    c.save();
    clipDisc(c, R);
    disc(c, 0, 0, R, radial(c, -R * 0.2, -R * 0.2, 0, R * 1.2, [[0, '#8f6137'], [1, '#5f3a1c']]));
    const cols = ['#b07a46', '#4a2b13', '#9a6a3a', '#3d2310'];
    for (let i = 0; i < 130; i++) {
      const a = rng() * TAU;
      const d = Math.sqrt(rng()) * R;
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      const dir = a + Math.PI / 2 + (rng() - 0.5) * 0.9;
      const l = R * (0.14 + rng() * 0.22);
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + Math.cos(dir) * l * 0.6 + Math.cos(dir + 1.2) * l * 0.2, y + Math.sin(dir) * l * 0.6 + Math.sin(dir + 1.2) * l * 0.2, x + Math.cos(dir) * l, y + Math.sin(dir) * l);
      c.lineWidth = R * (0.018 + rng() * 0.02);
      c.strokeStyle = cols[i & 3];
      c.globalAlpha = 0.75;
      c.stroke();
    }
    c.globalAlpha = 1;
    c.restore();
    for (const [a, d] of [[-2.2, 0.46], [-1.5, 0.5], [-1.85, 0.2]]) {
      const x = Math.cos(a) * R * d;
      const y = Math.sin(a) * R * d;
      disc(c, x, y, R * 0.13, '#8a5c32');
      disc(c, x, y, R * 0.1, '#1f1008');
      disc(c, x - R * 0.02, y - R * 0.02, R * 0.03, 'rgba(255,230,190,0.35)');
    }
  },
  // 9 Papaya: halved, orange flesh round a hollow of black seeds
  (c, R, rng) => {
    disc(c, 0, 0, R, radial(c, 0, 0, R * 0.7, R, [[0, '#b9bf3d'], [1, '#86a62f']]));
    disc(c, 0, 0, R * 0.92, '#e9a23a');
    disc(c, 0, 0, R * 0.88, radial(c, 0, 0, R * 0.3, R * 0.9, [[0, '#ff9a4d'], [0.7, '#ff8035'], [1, '#f26f2a']]));
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * TAU;
      line(c, Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55, Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8, R * 0.02, 'rgba(255,190,120,0.4)');
    }
    ellipse(c, 0, 0, R * 0.44, R * 0.52, 0.3, '#e65f22');
    ellipse(c, -R * 0.02, -R * 0.03, R * 0.4, R * 0.48, 0.3, '#f07a33');
    for (let i = 0; i < 46; i++) {
      const a = rng() * TAU;
      const d = Math.sqrt(rng()) * 0.8;
      const px = Math.cos(a) * d * R * 0.34;
      const py = Math.sin(a) * d * R * 0.42;
      const rr = R * (0.045 + rng() * 0.025);
      disc(c, px, py, rr, '#17100a');
      disc(c, px - rr * 0.3, py - rr * 0.35, rr * 0.3, 'rgba(255,255,255,0.45)');
    }
  },
  // 10 Jackfruit: olive hide of spiky hexagons
  (c, R, rng) => {
    stem(c, 0, -R * 0.9, R * 0.3, R * 0.2, -Math.PI / 2 - 0.1, '#6a4a26', '#9a7a4a');
    c.save();
    clipDisc(c, R);
    disc(c, 0, 0, R, '#5d6b1c');
    const s = R * 0.27;
    const cols = ['#b5c449', '#a3b53c', '#c8d25a', '#98ab38', '#b9b94a'];
    let n = 0;
    for (let row = -5; row <= 5; row++) {
      for (let col = -5; col <= 5; col++) {
        const x = col * s + (row & 1 ? s / 2 : 0) + (rng() - 0.5) * s * 0.12;
        const y = row * s * 0.88 + (rng() - 0.5) * s * 0.12;
        if (x * x + y * y > (R + s * 0.4) * (R + s * 0.4)) continue;
        c.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU + Math.PI / 6;
          const rr = s * 0.54 * (0.92 + rng() * 0.12);
          const px = x + Math.cos(a) * rr;
          const py = y + Math.sin(a) * rr;
          if (k) c.lineTo(px, py);
          else c.moveTo(px, py);
        }
        c.closePath();
        c.fillStyle = cols[n++ % cols.length];
        c.fill();
        c.lineWidth = R * 0.022;
        c.strokeStyle = '#56641a';
        c.stroke();
        c.beginPath();
        c.moveTo(x, y - s * 0.2);
        c.lineTo(x + s * 0.09, y + s * 0.05);
        c.lineTo(x - s * 0.09, y + s * 0.05);
        c.closePath();
        c.fillStyle = '#3f4a10';
        c.fill();
        disc(c, x - s * 0.12, y - s * 0.16, s * 0.05, 'rgba(255,255,200,0.45)');
      }
    }
    c.restore();
  },
];

// Fixed lighting over the rotating skin. `gloss` 0..1 sets how sharp the highlight is.
const GLOSS = [0.55, 0.85, 0.3, 0.95, 0.75, 0.45, 0.6, 0.8, 0.2, 0.5, 0.25];

function paintShade(c, R, kind) {
  const t = TIERS[kind];
  c.save();
  clipDisc(c, R);
  c.fillStyle = radial(c, -R * 0.32, -R * 0.38, R * 0.15, R * 1.55, [[0, 'rgba(0,0,0,0)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(24,8,0,0.46)']]);
  c.fillRect(-R, -R, 2 * R, 2 * R);
  // light bounced up from the counter on the lower right
  c.beginPath();
  c.arc(0, 0, R * 0.9, 0.15 * Math.PI, 0.7 * Math.PI);
  c.lineWidth = R * 0.12;
  c.strokeStyle = `rgba(255,236,200,${0.04 + 0.1 * GLOSS[kind]})`;
  c.lineCap = 'round';
  c.stroke();
  c.restore();
  const gl = GLOSS[kind];
  c.save();
  c.translate(-R * 0.36, -R * 0.4);
  c.rotate(-0.7);
  ellipse(c, 0, 0, R * (0.3 + 0.1 * (1 - gl)), R * (0.13 + 0.05 * (1 - gl)), 0, `rgba(255,255,255,${0.1 + 0.55 * gl})`);
  c.restore();
  disc(c, -R * 0.55, -R * 0.12, R * 0.045, `rgba(255,255,255,${0.2 + 0.4 * gl})`);
  c.beginPath();
  c.arc(0, 0, R - Math.max(0.6, R * 0.03), 0, TAU);
  c.lineWidth = Math.max(1.2, R * 0.065);
  c.strokeStyle = t.d;
  c.globalAlpha = 0.9;
  c.stroke();
  c.globalAlpha = 1;
}

function sprites(kind, R, scale) {
  const px = Math.max(4, Math.round(R * scale));
  const key = `${kind}:${px}`;
  let s = cache.get(key);
  if (s) return s;
  const size = Math.ceil(px * PAD * 2);
  const half = size / 2;
  const body = makeCanvas(size);
  const bc = body.getContext('2d');
  bc.translate(half, half);
  ART[kind](bc, px, createRng(kind * 101 + 7));
  const shade = makeCanvas(size);
  const sc = shade.getContext('2d');
  sc.translate(half, half);
  paintShade(sc, px, kind);
  s = { body, shade, half, px, sil: null };
  if (cache.size > 120) cache.clear();
  cache.set(key, s);
  return s;
}

export function clearFruitCache() {
  cache.clear();
}

// Draws a fruit centred at (x, y) with radius R (in the context's units). opts: scale (pop), sq/sqa (squash), alpha.
export function drawFruit(ctx, kind, x, y, R, angle = 0, opts = null) {
  const m = ctx.getTransform();
  const scale = Math.hypot(m.a, m.b) || 1;
  const s = sprites(kind, R, scale);
  const u = R / s.px; // sprite pixel -> context units
  ctx.save();
  ctx.translate(x, y);
  if (opts) {
    if (opts.alpha !== undefined) ctx.globalAlpha *= opts.alpha;
    if (opts.sq) {
      ctx.rotate(opts.sqa);
      ctx.scale(1 - opts.sq, 1 + opts.sq * 0.8);
      ctx.rotate(-opts.sqa);
    }
    if (opts.scale !== undefined && opts.scale !== 1) ctx.scale(opts.scale, opts.scale);
  }
  ctx.scale(u, u);
  ctx.rotate(angle);
  ctx.drawImage(s.body, -s.half, -s.half);
  ctx.rotate(-angle);
  ctx.drawImage(s.shade, -s.half, -s.half);
  ctx.restore();
}

// A flat one-colour copy of the fruit's silhouette (the ladder's fruit you haven't made yet).
export function drawSilhouette(ctx, kind, x, y, R, color, alpha = 1) {
  const m = ctx.getTransform();
  const scale = Math.hypot(m.a, m.b) || 1;
  const s = sprites(kind, R, scale);
  const key = `sil:${color}`;
  if (!s.sil) s.sil = {};
  let c = s.sil[key];
  if (!c) {
    c = makeCanvas(s.body.width);
    const g = c.getContext('2d');
    g.drawImage(s.body, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    s.sil[key] = c;
  }
  const u = R / s.px;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.scale(u, u);
  ctx.drawImage(c, -s.half, -s.half);
  ctx.restore();
}
