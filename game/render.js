// Draws everything: the market stall (a cached, softly blurred street, the awning, the counter), the glass jar with the
// fruit in it, the claw, the HUD signs, the ladder, and the title/pause/game-over cards. All in code.

import { JAR, TIERS, KINDS, DANGER_TIME } from './config.js';
import { computeLayout } from './layout.js';
import { drawFruit, drawSilhouette, clearFruitCache } from './fruit.js';
import { easeOutBack, easeOutCubic } from './fx.js';
import { createRng } from './rng.js';

export const COL = {
  ink: '#2a1812',
  cream: '#f7ead0',
  red: '#d63a2c',
  redDark: '#9d241a',
  brass: '#e6b84a',
  brassDark: '#a87a22',
  lime: '#c6e04a',
  wood: '#c4854a',
  woodDark: '#7a4a2a',
  teal: '#2f7078',
  danger: '#ff4a3a',
};
const FONT = 'Rubik, "Helvetica Neue", Arial, sans-serif';
const TAU = Math.PI * 2;

function rr(c, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

function text(c, str, x, y, o = {}) {
  const size = o.size || 20;
  c.font = `${o.weight || 800} ${size}px ${FONT}`;
  c.textAlign = o.align || 'center';
  c.textBaseline = o.base || 'middle';
  if (o.outline) {
    c.lineJoin = 'round';
    c.lineWidth = o.outlineW || Math.max(3, size * 0.18);
    c.strokeStyle = o.outline;
    c.strokeText(str, x, y);
  }
  c.fillStyle = o.color || COL.cream;
  c.fillText(str, x, y);
}

function fitSize(c, str, maxW, size, weight = 900) {
  c.font = `${weight} ${size}px ${FONT}`;
  const w = c.measureText(str).width;
  return w > maxW ? size * (maxW / w) : size;
}

const fmt = (n) => Math.round(n).toLocaleString('en-US');

// Jar outline for the glass: inner = the playing space, outer = the glass's outside.
function jarPath(c, grow) {
  const w = JAR.w;
  const h = JAR.h;
  const rc = JAR.corner;
  const x0 = -grow;
  const x1 = w + grow;
  const yb = h + grow;
  const top = -6;
  c.moveTo(x0, top);
  c.lineTo(x0, h - rc);
  c.arc(rc, h - rc, rc + grow, Math.PI, Math.PI / 2, true);
  c.lineTo(w - rc, yb);
  c.arc(w - rc, h - rc, rc + grow, Math.PI / 2, 0, true);
  c.lineTo(x1, top);
}

export function createRenderer(canvas, fx) {
  const ctx = canvas.getContext('2d');
  const R = {
    L: null,
    W: 0,
    H: 0,
    pr: 1,
    buttons: [],
    bg: null,
    ctx,
  };

  R.resize = (W, H, pr, layout = null) => {
    R.W = W;
    R.H = H;
    R.pr = pr;
    canvas.width = Math.max(1, Math.round(W * pr));
    canvas.height = Math.max(1, Math.round(H * pr));
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    R.L = layout || computeLayout(W, H);
    R.bg = buildBackground(R.L, W, H, pr);
    clearFruitCache();
  };

  // ---- static scenery -------------------------------------------------------------------------------------------

  function buildBackground(L, W, H, pr) {
    const cv = document.createElement('canvas');
    cv.width = Math.round(W * pr);
    cv.height = Math.round(H * pr);
    const g = cv.getContext('2d');
    g.scale(pr, pr);
    // The street behind the stall is drawn small and scaled up, which blurs it for free.
    const k = 0.2;
    const lw = Math.max(8, Math.round(W * k));
    const lh = Math.max(8, Math.round(H * k));
    const lo = document.createElement('canvas');
    lo.width = lw;
    lo.height = lh;
    const o = lo.getContext('2d');
    o.scale(lw / W, lh / H);
    street(o, L, W, H);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(lo, 0, 0, W, H);
    counter(g, L, W, H);
    awning(g, L, W);
    return cv;
  }

  function street(o, L, W, H) {
    const rng = createRng(11);
    const sky = o.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#8fd0c4');
    sky.addColorStop(0.5, '#4f9ea0');
    sky.addColorStop(1, '#2c6872');
    o.fillStyle = sky;
    o.fillRect(0, 0, W, H);
    const base = L.floorY;
    let x = -20;
    const tones = ['#2f7378', '#3a858a', '#26606a', '#43939a', '#2b6a72'];
    while (x < W + 20) {
      const bw = 60 + rng() * 110;
      const bh = H * (0.22 + rng() * 0.3);
      o.fillStyle = tones[Math.floor(rng() * tones.length)];
      o.fillRect(x, base - bh, bw, bh + 40);
      const cols = Math.max(1, Math.floor(bw / 28));
      const rows = Math.floor(bh / 34);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          o.fillStyle = rng() < 0.55 ? 'rgba(255,214,130,0.85)' : 'rgba(20,60,66,0.5)';
          o.fillRect(x + 8 + c * 28, base - bh + 14 + r * 34, 14, 18);
        }
      }
      x += bw + rng() * 14;
    }
    // shop banners
    for (let i = 0; i < 5; i++) {
      o.fillStyle = i % 2 ? 'rgba(214,58,44,0.7)' : 'rgba(247,234,208,0.7)';
      const bx = rng() * W;
      o.fillRect(bx, H * 0.18 + rng() * 60, 26 + rng() * 20, 80 + rng() * 60);
    }
    // string lights
    const ly = L.awn + 26;
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i <= 12; i++) {
        const px = (i / 12) * W;
        const py = ly + row * 40 + Math.sin((i / 12) * Math.PI) * 18 + (row ? 10 : 0);
        const gr = o.createRadialGradient(px, py, 0, px, py, 26);
        gr.addColorStop(0, 'rgba(255,236,170,0.95)');
        gr.addColorStop(0.35, 'rgba(255,214,120,0.5)');
        gr.addColorStop(1, 'rgba(255,214,120,0)');
        o.fillStyle = gr;
        o.fillRect(px - 26, py - 26, 52, 52);
      }
    }
    // plants behind the counter
    o.fillStyle = 'rgba(24,90,76,0.8)';
    for (let i = 0; i < 6; i++) {
      const px = rng() * W;
      o.beginPath();
      o.ellipse(px, base + 6, 30 + rng() * 30, 44 + rng() * 40, 0, 0, TAU);
      o.fill();
    }
  }

  function counter(g, L, W, H) {
    const top = L.floorY - JAR.wall * L.s * 0.15;
    const bot = L.counterY + L.counterH;
    const grad = g.createLinearGradient(0, top, 0, bot);
    grad.addColorStop(0, '#d99a5a');
    grad.addColorStop(1, '#b97a44');
    g.fillStyle = grad;
    g.fillRect(0, top, W, bot - top);
    const rng = createRng(5);
    for (let i = 0; i < 7; i++) {
      const y = top + ((i + 0.5) / 7) * (bot - top);
      g.fillStyle = i % 2 ? 'rgba(255,225,170,0.18)' : 'rgba(110,60,25,0.16)';
      g.fillRect(0, y, W, 1.6 + rng() * 1.4);
    }
    // edge lip
    g.fillStyle = '#f0b878';
    g.fillRect(0, bot - 4, W, 4);
    g.fillStyle = 'rgba(80,40,18,0.5)';
    g.fillRect(0, bot, W, 3);
    // front board
    const fb = g.createLinearGradient(0, bot, 0, H);
    fb.addColorStop(0, '#85502c');
    fb.addColorStop(1, '#5b361e');
    g.fillStyle = fb;
    g.fillRect(0, bot, W, H - bot);
    g.fillStyle = 'rgba(0,0,0,0.22)';
    for (let x = 40; x < W; x += 110) g.fillRect(x, bot + 3, 2, H - bot);
    g.fillStyle = 'rgba(255,220,170,0.07)';
    for (let x = 41; x < W; x += 110) g.fillRect(x, bot + 3, 1.5, H - bot);
  }

  function awning(g, L, W) {
    const n = Math.max(6, Math.round(W / 46));
    const sw = W / n;
    const h = L.awn;
    if (h < 8) return;
    const flat = h * 0.62;
    for (let i = 0; i < n; i++) {
      const col = i % 2 ? COL.cream : COL.red;
      g.fillStyle = col;
      g.fillRect(i * sw, 0, sw + 0.5, flat);
      g.beginPath();
      g.moveTo(i * sw, flat - 1);
      g.lineTo(i * sw + sw, flat - 1);
      g.arc(i * sw + sw / 2, flat - 1, sw / 2, 0, Math.PI);
      g.closePath();
      g.fill();
    }
    // the scallops hang `sw/2` below flat; squash them to fit the awning's height
    const sh = g.createLinearGradient(0, 0, 0, h + 8);
    sh.addColorStop(0, 'rgba(60,20,10,0.28)');
    sh.addColorStop(0.5, 'rgba(60,20,10,0)');
    g.fillStyle = sh;
    g.fillRect(0, 0, W, h + 8);
    g.strokeStyle = 'rgba(42,24,18,0.55)';
    g.lineWidth = 2;
    for (let i = 0; i < n; i++) {
      g.beginPath();
      g.arc(i * sw + sw / 2, flat - 1, sw / 2 - 1, 0, Math.PI);
      g.stroke();
    }
    g.fillStyle = COL.ink;
    g.fillRect(0, 0, W, 3);
    // soft shadow under the awning
    const ds = g.createLinearGradient(0, flat + sw / 2, 0, flat + sw / 2 + 22);
    ds.addColorStop(0, 'rgba(30,14,8,0.3)');
    ds.addColorStop(1, 'rgba(30,14,8,0)');
    g.fillStyle = ds;
    g.fillRect(0, flat + sw / 2 - 1, W, 24);
  }

  // ---- buttons ---------------------------------------------------------------------------------------------------

  function button(view, id, x, y, w, h, label, kind = 'primary', o = {}) {
    R.buttons.push({ id, x, y, w, h });
    const c = ctx;
    const down = view.press === id;
    const hover = view.hover === id && !down;
    const lift = down ? 3 : 0;
    const depth = 6;
    const fill = kind === 'primary' ? COL.red : kind === 'secondary' ? COL.cream : COL.ink;
    const fg = kind === 'secondary' ? COL.ink : COL.cream;
    c.save();
    c.fillStyle = COL.ink;
    rr(c, x, y + depth - lift + 2, w, h, 14);
    c.fill();
    c.fillStyle = kind === 'primary' ? COL.redDark : kind === 'secondary' ? '#c9b78f' : '#000';
    rr(c, x, y + depth - lift - 1, w, h, 14);
    c.fill();
    c.translate(0, lift);
    c.fillStyle = fill;
    rr(c, x, y, w, h, 14);
    c.fill();
    if (hover) {
      c.fillStyle = 'rgba(255,255,255,0.14)';
      rr(c, x, y, w, h, 14);
      c.fill();
    }
    c.lineWidth = 4;
    c.strokeStyle = COL.ink;
    rr(c, x, y, w, h, 14);
    c.stroke();
    const size = fitSize(c, label, w - 28, o.size || Math.min(34, h * 0.46));
    text(c, label, x + w / 2, y + h / 2 + 1, { size, weight: 900, color: fg });
    if (o.key) text(c, o.key, x + w - 14, y + 14, { size: 16, weight: 800, color: fg, align: 'right' });
    c.restore();
  }

  function card(x, y, w, h) {
    const c = ctx;
    c.fillStyle = COL.ink;
    rr(c, x, y + 10, w, h, 22);
    c.fill();
    c.fillStyle = COL.cream;
    rr(c, x, y, w, h, 22);
    c.fill();
    c.lineWidth = 4;
    c.strokeStyle = COL.ink;
    rr(c, x, y, w, h, 22);
    c.stroke();
    // red awning band across the top
    c.save();
    rr(c, x, y, w, h, 22);
    c.clip();
    const n = Math.max(4, Math.round(w / 38));
    for (let i = 0; i < n; i++) {
      c.fillStyle = i % 2 ? COL.cream : COL.red;
      c.fillRect(x + (i * w) / n, y, w / n + 1, 14);
    }
    c.fillStyle = COL.ink;
    c.fillRect(x, y + 14, w, 3);
    c.restore();
  }

  // ---- HUD pieces ------------------------------------------------------------------------------------------------

  function scoreSign(view) {
    const c = ctx;
    const L = R.L;
    const s = L.score;
    const g = view.game;
    if (!L.wide) {
      c.strokeStyle = COL.ink;
      c.lineWidth = 3;
      for (const fx0 of [0.22, 0.78]) {
        c.beginPath();
        c.moveTo(s.x + s.w * fx0, L.awn * 0.82);
        c.lineTo(s.x + s.w * fx0, s.y + 3);
        c.stroke();
      }
    }
    const pop = 1 + fx.scorePop * 0.07;
    c.save();
    c.translate(s.x + s.w / 2, s.y + s.h / 2);
    c.fillStyle = '#000';
    rr(c, -s.w / 2, -s.h / 2 + 6, s.w, s.h, 14);
    c.fill();
    c.fillStyle = COL.ink;
    rr(c, -s.w / 2, -s.h / 2, s.w, s.h, 14);
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = COL.brass;
    rr(c, -s.w / 2 + 5, -s.h / 2 + 5, s.w - 10, s.h - 10, 10);
    c.stroke();
    text(c, 'SCORE', 0, -s.h / 2 + s.h * 0.2, { size: 16, weight: 800, color: COL.brass });
    c.save();
    c.translate(0, s.h * 0.03);
    c.scale(pop, pop);
    const str = fmt(view.shownScore);
    const size = fitSize(c, str, s.w - 30, Math.min(48, s.h * 0.44));
    text(c, str, 0, 0, { size, weight: 900, color: '#fff3d6' });
    c.restore();
    const best = Math.max(view.best, g ? g.score : 0);
    text(c, `BEST ${fmt(best)}`, 0, s.h / 2 - s.h * 0.2, { size: 17, weight: 800, color: COL.lime });
    c.restore();
  }

  function tray(box, kind, scale = 1) {
    const c = ctx;
    c.save();
    text(c, box.label, box.x + box.w / 2, box.y - 10, { size: 16, weight: 800, color: COL.cream, outline: COL.ink, outlineW: 5 });
    c.fillStyle = COL.ink;
    rr(c, box.x, box.y + 5, box.w, box.h, 12);
    c.fill();
    const g = c.createLinearGradient(0, box.y, 0, box.y + box.h);
    g.addColorStop(0, '#9a6236');
    g.addColorStop(1, '#6d4126');
    c.fillStyle = g;
    rr(c, box.x, box.y, box.w, box.h, 12);
    c.fill();
    c.lineWidth = 3;
    c.strokeStyle = COL.ink;
    rr(c, box.x, box.y, box.w, box.h, 12);
    c.stroke();
    c.fillStyle = 'rgba(20,8,2,0.38)';
    rr(c, box.x + 6, box.y + 6, box.w - 12, box.h - 12, 8);
    c.fill();
    if (kind !== null && kind !== undefined) {
      const m = Math.min(box.w, box.h) * 0.5;
      const f = TIERS[kind].r / TIERS[4].r; // up to 1
      const r = m * (0.42 + 0.58 * f) * 0.78 * scale;
      drawFruit(c, kind, box.x + box.w / 2, box.y + box.h / 2, r, 0.25);
    }
    c.restore();
  }

  function pauseButton(view) {
    const p = R.L.pause;
    R.buttons.push({ id: 'pause', x: p.x - 4, y: p.y - 4, w: p.w + 8, h: p.h + 8 });
    const c = ctx;
    const down = view.press === 'pause';
    c.save();
    c.translate(p.x + p.w / 2, p.y + p.h / 2 + (down ? 2 : 0));
    c.fillStyle = COL.ink;
    c.beginPath();
    c.arc(0, 4, p.w / 2, 0, TAU);
    c.fill();
    c.fillStyle = view.hover === 'pause' ? '#ffd06a' : COL.brass;
    c.beginPath();
    c.arc(0, 0, p.w / 2, 0, TAU);
    c.fill();
    c.lineWidth = 3.5;
    c.strokeStyle = COL.ink;
    c.stroke();
    c.fillStyle = COL.ink;
    rr(c, -9, -10, 6, 20, 2);
    c.fill();
    rr(c, 3, -10, 6, 20, 2);
    c.fill();
    c.restore();
  }

  function ladder(view) {
    const L = R.L;
    const g = view.game;
    const c = ctx;
    let top = -1;
    for (let k = 0; k < KINDS; k++) if (g.made[k]) top = k;
    for (let k = 0; k < KINDS; k++) {
      const cell = L.ladder.cells[k];
      const lr = L.ladder.r * (0.46 + 0.54 * (k / 10));
      const pulse = fx.pulse[k];
      c.save();
      if (k === top) {
        c.fillStyle = 'rgba(230,184,74,0.35)';
        c.beginPath();
        c.arc(cell.x, cell.y, L.ladder.r * 1.12, 0, TAU);
        c.fill();
        c.lineWidth = 3;
        c.strokeStyle = COL.brass;
        c.stroke();
      }
      if (g.made[k]) drawFruit(c, k, cell.x, cell.y, lr * (1 + pulse * 0.45), 0.3 - k * 0.1);
      else drawSilhouette(c, k, cell.x, cell.y, lr, '#1a0c06', 0.55);
      c.restore();
    }
    if (fx.banner) {
      const b = fx.banner;
      const k = Math.min(1, b.life / 0.2);
      const a = b.life > b.max - 0.4 ? (b.max - b.life) / 0.4 : 1;
      const cell = L.ladder.cells[b.kind];
      const bx = Math.max(70, Math.min(R.W - 70, cell.x));
      const by = cell.y - L.ladder.r * 1.5 - (L.wide ? 0 : 6);
      c.save();
      c.globalAlpha = a;
      c.translate(bx, by);
      c.scale(0.7 + 0.3 * easeOutBack(k), 0.7 + 0.3 * easeOutBack(k));
      const w = 130;
      c.fillStyle = COL.ink;
      rr(c, -w / 2, -16 + 4, w, 32, 10);
      c.fill();
      c.fillStyle = COL.brass;
      rr(c, -w / 2, -16, w, 32, 10);
      c.fill();
      c.lineWidth = 3;
      c.strokeStyle = COL.ink;
      c.stroke();
      text(c, TIERS[b.kind].name.toUpperCase(), 0, 1, { size: 18, weight: 900, color: COL.ink });
      c.restore();
    }
  }

  // ---- the jar ---------------------------------------------------------------------------------------------------

  function jar(view) {
    const L = R.L;
    const c = ctx;
    const g = view.game;
    const s = L.s;
    const [sx, sy] = view.mode === 'title' && !view.shake ? [0, 0] : fx.shakeOffset();
    // shadow on the counter
    c.save();
    c.fillStyle = 'rgba(40,16,6,0.32)';
    c.beginPath();
    c.ellipse(L.jx + (JAR.w / 2) * s + sx, L.floorY + JAR.wall * s * 0.55, (JAR.w / 2 + JAR.wall + 14) * s, 9 * s + 3, 0, 0, TAU);
    c.fill();
    c.restore();

    c.save();
    const cx = L.jx + (JAR.w / 2) * s;
    const punch = 1 + fx.punch * 0.018;
    c.translate(cx + sx, L.ry + JAR.h * s * 0.5 + sy);
    c.scale(punch, punch);
    c.translate(-cx, -(L.ry + JAR.h * s * 0.5));
    c.translate(L.jx, L.ry);
    c.scale(s, s);

    // back panel
    c.beginPath();
    jarPath(c, 0);
    c.closePath();
    const bp = c.createLinearGradient(0, 0, 0, JAR.h);
    bp.addColorStop(0, 'rgba(16,60,68,0.38)');
    bp.addColorStop(1, 'rgba(10,38,46,0.66)');
    c.fillStyle = bp;
    c.fill();

    // danger line (behind fruit would hide it: draw before, then again strong parts after)
    const prox = g ? g.closeness : 0;
    const danger = g ? g.danger : 0;

    // aim guide
    if (view.mode === 'play' && g && g.held !== null && !g.over) {
      const kind = g.held;
      const r = TIERS[kind].r;
      const ly = g.landing(view.clawX, kind);
      c.save();
      c.setLineDash([7, 7]);
      c.lineWidth = 2.2;
      c.strokeStyle = 'rgba(255,255,255,0.45)';
      c.beginPath();
      c.moveTo(view.clawX, JAR.holdY + r);
      c.lineTo(view.clawX, ly - r);
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.55)';
      c.beginPath();
      c.arc(view.clawX, ly, r + 1.5, 0, TAU);
      c.stroke();
      c.restore();
    }

    // fruit
    if (g) {
      for (const b of g.world.bodies) {
        if (b.hide) continue;
        let scale = 1;
        if (b.pop > 0) {
          // springs in with an overshoot
          const t = 1 - b.pop / (b.fresh ? 0.6 : 0.45);
          scale = b.fresh ? 1 : 0.55 + 0.45 * easeOutBack(Math.min(1, t));
        }
        drawFruit(c, b.kind, b.x, b.y, b.r, b.a, { scale, sq: b.sq, sqa: b.sqa });
        if (b.over > 0.01) {
          c.save();
          c.lineWidth = 3;
          c.strokeStyle = `rgba(255,70,50,${0.4 + 0.5 * Math.abs(Math.sin(fx.t * 9))})`;
          c.setLineDash([5, 4]);
          c.beginPath();
          c.arc(b.x, b.y, b.r + 3, 0, TAU);
          c.stroke();
          c.restore();
        }
      }
      for (const gh of fx.ghosts) {
        const k = gh.life / gh.max;
        const kind = gh.kind - 1;
        const r = TIERS[kind].r;
        c.save();
        c.globalAlpha = 1 - k;
        drawFruit(c, kind, gh.ax + (gh.x - gh.ax) * k, gh.ay + (gh.y - gh.ay) * k, r * (1 - 0.15 * k), 0);
        drawFruit(c, kind, gh.bx + (gh.x - gh.bx) * k, gh.by + (gh.y - gh.by) * k, r * (1 - 0.15 * k), 0);
        c.restore();
      }
    }

    // the line
    if (g && view.mode !== 'title') dangerLine(c, g, prox, danger);

    // particles and rings
    for (const rg of fx.rings) {
      const k = rg.life / rg.max;
      c.globalAlpha = 1 - k;
      c.lineWidth = rg.width * (1 - k * 0.7);
      c.strokeStyle = rg.color;
      c.beginPath();
      c.arc(rg.x, rg.y, rg.r * (0.3 + easeOutCubic(k) * 0.9), 0, TAU);
      c.stroke();
    }
    c.globalAlpha = 1;
    for (const p of fx.parts) {
      const k = p.life / p.max;
      c.globalAlpha = Math.min(1, (1 - k) * 1.6);
      c.fillStyle = p.color;
      if (p.kind === 1) {
        c.save();
        c.translate(p.x, p.y);
        c.rotate(p.rot);
        c.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
        c.restore();
      } else {
        const sp = Math.hypot(p.vx, p.vy);
        c.save();
        c.translate(p.x, p.y);
        c.rotate(Math.atan2(p.vy, p.vx));
        c.beginPath();
        c.ellipse(0, 0, p.size * (1 + Math.min(1.2, sp / 500)), p.size * (1 - k * 0.5), 0, 0, TAU);
        c.fill();
        c.restore();
      }
    }
    c.globalAlpha = 1;

    glass(c);

    // floating numbers
    for (const f of fx.floats) {
      const k = f.life / f.max;
      c.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      const pop = 1 + 0.25 * Math.max(0, 1 - k * 6);
      text(c, f.text, f.x, f.y - f.rise * easeOutCubic(k), { size: f.size * pop, weight: 900, color: f.color, outline: COL.ink, outlineW: f.size * 0.3 });
    }
    c.globalAlpha = 1;

    c.restore();

    if (view.mode !== 'title' || true) claw(view, sx, sy);
  }

  function dangerLine(c, g, prox, danger) {
    const y = JAR.dangerY;
    const active = g.dangerT > 0.01;
    if (!active && prox < 0.05) return;
    c.save();
    const alpha = active ? 1 : 0.25 + prox * 0.6;
    const pulse = active ? 0.5 + 0.5 * Math.sin(fx.t * (7 + danger * 10)) : 0;
    c.setLineDash(active ? [14, 7] : [10, 10]);
    c.lineWidth = active ? 3.6 + pulse * 1.6 : 2.6;
    c.strokeStyle = active ? `rgba(255,${Math.round(60 + pulse * 120)},${Math.round(50 + pulse * 110)},${alpha})` : `rgba(255,98,80,${alpha})`;
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(JAR.w, y);
    c.stroke();
    c.setLineDash([]);
    if (active) {
      // the countdown: a red bar filling along the line, and the seconds left
      c.fillStyle = 'rgba(255,60,44,0.85)';
      c.fillRect(0, y - 3, JAR.w * danger, 6);
      c.fillStyle = `rgba(255,60,44,${0.1 + 0.14 * pulse * danger})`;
      c.fillRect(0, y, JAR.w, 160);
      const left = Math.max(0, DANGER_TIME - g.dangerT);
      text(c, left.toFixed(1), JAR.w / 2, y - 26, { size: 40, weight: 900, color: '#fff', outline: '#b3160a', outlineW: 9 });
    } else {
      text(c, '!', JAR.w - 14, y - 14, { size: 22, weight: 900, color: '#ff6a50', outline: COL.ink, outlineW: 5 });
    }
    c.restore();
  }

  function glass(c) {
    const w = JAR.wall;
    // thick walls: outer shape minus the inside
    c.save();
    c.beginPath();
    jarPath(c, w);
    c.lineTo(-w, -6);
    c.closePath();
    jarPath(c, 0);
    c.lineTo(0, -6);
    c.closePath();
    c.fillStyle = 'rgba(214,246,244,0.34)';
    c.fill('evenodd');
    c.lineJoin = 'round';
    c.lineWidth = 2.4;
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.beginPath();
    jarPath(c, 0);
    c.stroke();
    c.lineWidth = 3;
    c.strokeStyle = 'rgba(30,70,76,0.55)';
    c.beginPath();
    jarPath(c, w);
    c.stroke();
    // reflections
    c.fillStyle = 'rgba(255,255,255,0.5)';
    rr(c, -w + 3, 30, 5, 190, 2.5);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.32)';
    rr(c, -w + 3, 236, 5, 40, 2.5);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.28)';
    rr(c, JAR.w + w - 8, 24, 4, 120, 2);
    c.fill();
    // a diagonal sheen across the front
    c.save();
    c.beginPath();
    jarPath(c, 0);
    c.closePath();
    c.clip();
    c.fillStyle = 'rgba(255,255,255,0.06)';
    c.beginPath();
    c.moveTo(40, -6);
    c.lineTo(90, -6);
    c.lineTo(-10, 250);
    c.lineTo(-10, 150);
    c.closePath();
    c.fill();
    c.restore();
    // rim
    c.fillStyle = 'rgba(236,252,252,0.62)';
    rr(c, -w - 5, -12, JAR.w + 2 * w + 10, 13, 6.5);
    c.fill();
    c.lineWidth = 2;
    c.strokeStyle = 'rgba(30,70,76,0.6)';
    rr(c, -w - 5, -12, JAR.w + 2 * w + 10, 13, 6.5);
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.8)';
    rr(c, -w, -10, 70, 3.5, 1.75);
    c.fill();
    c.restore();
  }

  function claw(view, sx, sy) {
    const L = R.L;
    const c = ctx;
    const g = view.game;
    const s = L.s;
    c.save();
    c.translate(L.jx + sx, L.ry + sy);
    c.scale(s, s);
    const railY = JAR.railY;
    const x = view.clawX;
    // rail
    c.fillStyle = COL.ink;
    rr(c, -JAR.wall - 18, railY - 5, JAR.w + 2 * JAR.wall + 36, 11, 5);
    c.fill();
    c.fillStyle = '#6b5448';
    rr(c, -JAR.wall - 16, railY - 4, JAR.w + 2 * JAR.wall + 32, 5, 2.5);
    c.fill();
    for (const px of [-JAR.wall - 14, JAR.w + JAR.wall + 14]) {
      c.fillStyle = COL.ink;
      rr(c, px - 6, railY - 9, 12, 22, 4);
      c.fill();
      c.fillStyle = COL.brass;
      rr(c, px - 4, railY - 7, 8, 18, 3);
      c.fill();
    }
    const holding = g && g.held !== null && view.mode !== 'over';
    const kind = g ? (g.held !== null ? g.held : g.next) : 0;
    const rad = TIERS[kind].r;
    const grow = holding ? 0.35 + 0.65 * easeOutBack(Math.min(1, view.readyT)) : 0;
    const open = view.clawOpen;
    const hubY = JAR.holdY - (holding ? rad * grow : 6) - 15;
    // trolley and cable
    c.strokeStyle = COL.ink;
    c.lineWidth = 3.4;
    c.beginPath();
    c.moveTo(x, railY + 5);
    c.lineTo(x, hubY);
    c.stroke();
    c.fillStyle = COL.ink;
    rr(c, x - 19, railY - 11, 38, 19, 7);
    c.fill();
    c.fillStyle = COL.brass;
    rr(c, x - 16.5, railY - 8.5, 33, 14, 5);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.45)';
    rr(c, x - 14, railY - 7, 28, 3.5, 1.75);
    c.fill();
    if (holding) drawFruit(c, kind, x, JAR.holdY, rad, 0.35, { scale: grow });
    // arms
    const reach = (holding ? rad * grow : 5) + 1.5;
    const spread = reach + open * 15;
    for (const side of [-1, 1]) {
      c.beginPath();
      c.moveTo(x + side * 4, hubY + 2);
      c.bezierCurveTo(x + side * (spread + 8), hubY + 4, x + side * (spread + 9), JAR.holdY - reach * 0.2, x + side * (spread * (holding ? 0.96 : 1) - (holding ? 1 : 0)), JAR.holdY + reach * 0.52);
      c.lineCap = 'round';
      c.lineWidth = 8;
      c.strokeStyle = COL.ink;
      c.stroke();
      c.lineWidth = 4.2;
      c.strokeStyle = COL.brass;
      c.stroke();
    }
    c.fillStyle = COL.ink;
    c.beginPath();
    c.arc(x, hubY + 2, 8, 0, TAU);
    c.fill();
    c.fillStyle = COL.brass;
    c.beginPath();
    c.arc(x, hubY + 2, 5.6, 0, TAU);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.beginPath();
    c.arc(x - 1.8, hubY, 1.8, 0, TAU);
    c.fill();
    c.restore();
  }

  // ---- screens ---------------------------------------------------------------------------------------------------

  function hud(view) {
    const L = R.L;
    const g = view.game;
    scoreSign(view);
    tray(L.next, g.next);
    tray(L.then, g.then, 0.82);
    pauseButton(view);
    ladder(view);
  }

  function callout(view) {
    const co = fx.callout;
    if (!co) return;
    const L = R.L;
    const c = ctx;
    const k = co.life / co.max;
    const pop = easeOutBack(Math.min(1, co.life / 0.2));
    const a = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
    const x = L.jx + (JAR.w / 2) * L.s;
    const y = L.ry + 120 * L.s;
    const size = Math.min(L.W * 0.13, 40 + L.s * 22, 78);
    c.save();
    c.globalAlpha = a;
    c.translate(x, y - 20 * k);
    c.rotate(-0.06);
    c.scale(0.5 + 0.5 * pop, 0.5 + 0.5 * pop);
    text(c, co.text, 0, 0, { size, weight: 900, color: co.color, outline: COL.ink, outlineW: size * 0.22 });
    if (co.sub) text(c, co.sub, 0, size * 0.78, { size: Math.max(20, size * 0.42), weight: 900, color: '#fff3d6', outline: COL.ink, outlineW: size * 0.14 });
    c.restore();
  }

  function logo(view) {
    const L = R.L;
    const c = ctx;
    const words = ['FRUIT', 'MERGE', 'DROP'];
    let cx;
    let top;
    let maxW;
    let maxH;
    if (view.logoBox) {
      ({ cx, top, maxW, maxH } = view.logoBox);
    } else if (L.wide) {
      cx = L.score.x + L.score.w / 2 + 10;
      top = Math.max(L.awn + 18, 70);
      maxW = Math.min(L.jx - 70, 340);
      maxH = L.H - top - 60;
    } else {
      cx = L.W / 2;
      top = L.awn + 14;
      maxW = L.W - 40;
      maxH = L.ry + 150 * L.s - top;
    }
    maxW = Math.min(maxW, view.logoBox ? 900 : 420);
    let lineH = Math.min(maxH / 3.15, 120);
    c.font = `900 ${lineH * 1.04}px ${FONT}`;
    const widest = Math.max(c.measureText('MERGE').width, c.measureText('DROP').width, c.measureText('FRUIT').width) + lineH * 0.35;
    if (widest > maxW) lineH *= maxW / widest;
    const tIn = Math.min(1, view.titleT / 0.5);
    c.save();
    c.translate(cx, top + lineH * 1.55);
    c.rotate(-0.04);
    const s = 0.8 + 0.2 * easeOutBack(tIn);
    c.scale(s, s);
    const cols = ['#f7ead0', '#f7ead0', '#f7ead0'];
    for (let i = 0; i < 3; i++) {
      const word = words[i];
      const y = (i - 1) * lineH * 0.98;
      const size = lineH * (i === 2 ? 1.04 : 0.94);
      c.font = `900 ${size}px ${FONT}`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.lineJoin = 'round';
      const wdt = c.measureText(word).width;
      const w0 = word === 'DROP' ? c.measureText('DR').width : 0;
      void w0;
      for (const [dx, dy, col, lw] of [[0, size * 0.1, COL.red, size * 0.3], [0, 0, COL.ink, size * 0.3]]) {
        c.lineWidth = lw;
        c.strokeStyle = col;
        c.strokeText(word, dx, y + dy);
      }
      c.fillStyle = cols[i];
      c.fillText(word, 0, y);
      void wdt;
    }
    // an orange rolls in as the O of DROP
    const size = lineH * 1.04;
    c.font = `900 ${size}px ${FONT}`;
    const full = c.measureText('DROP').width;
    const pre = c.measureText('DR').width;
    const oW = c.measureText('O').width;
    const ox = -full / 2 + pre + oW / 2;
    const oy = lineH * 0.98;
    c.fillStyle = '#e8c96a';
    c.beginPath();
    c.arc(ox, oy, oW * 0.5, 0, TAU);
    c.fillStyle = COL.ink;
    c.fill();
    c.beginPath();
    c.arc(ox, oy, oW * 0.5 - size * 0.02, 0, TAU);
    c.fillStyle = COL.cream;
    c.fill();
    drawFruit(c, 6, ox, oy + Math.sin(view.t * 2) * 1.5, oW * 0.46, view.t * 0.8);
    c.restore();
  }

  function title(view) {
    const L = R.L;
    const c = ctx;
    logo(view);
    const best = view.best;
    const pw = L.wide ? Math.min(300, L.W * 0.26) : Math.min(L.W - 40, view.hasSave ? 190 : 260);
    const ph = L.wide ? 76 : Math.min(70, Math.max(56, L.boardH - 10));
    if (L.wide) {
      const colR = L.jx + (JAR.w + JAR.wall) * L.s + 20;
      const cx = colR + (L.W - colR) / 2;
      const y = L.H * 0.4;
      if (best > 0) text(c, `BEST ${fmt(best)}`, cx, y - 44, { size: 26, weight: 900, color: COL.lime, outline: COL.ink });
      button(view, 'play', cx - pw / 2, y, pw, ph, view.hasSave ? 'CONTINUE' : 'PLAY', 'primary', { size: 32 });
      if (view.hasSave) button(view, 'new', cx - pw / 2, y + ph + 22, pw, 60, 'NEW JAR', 'secondary', { size: 26 });
    } else {
      const y = L.boardY + (L.boardH - ph) / 2 - 2;
      if (best > 0) text(c, `BEST ${fmt(best)}`, L.W / 2, L.ry - 16 * L.s - 28 + 4, { size: 24, weight: 900, color: COL.lime, outline: COL.ink });
      if (view.hasSave) {
        const gap = 14;
        const total = Math.min(L.W - 24, 380);
        const w1 = total * 0.6 - gap / 2;
        const w2 = total * 0.4 - gap / 2;
        const x0 = (L.W - total) / 2;
        button(view, 'play', x0, y, w1, ph, 'CONTINUE', 'primary', { size: 28 });
        button(view, 'new', x0 + w1 + gap, y, w2, ph, 'NEW', 'secondary', { size: 26 });
      } else {
        button(view, 'play', (L.W - pw) / 2, y, pw, ph, 'PLAY', 'primary', { size: 34 });
      }
    }
  }

  function dim(a) {
    ctx.fillStyle = `rgba(30,14,8,${a})`;
    ctx.fillRect(0, 0, R.W, R.H);
  }

  function pauseCard(view) {
    const c = ctx;
    dim(0.5);
    const w = Math.min(R.W - 40, 340);
    const h = view.mode === 'confirm' ? 270 : 300;
    const x = (R.W - w) / 2;
    const y = (R.H - h) / 2 - 10;
    card(x, y, w, h);
    if (view.mode === 'confirm') {
      text(c, 'RESTART?', R.W / 2, y + 62, { size: 40, weight: 900, color: COL.ink });
      text(c, 'This jar is lost', R.W / 2, y + 100, { size: 20, weight: 700, color: '#6b4a38' });
      button(view, 'yes', x + 24, y + 128, w - 48, 64, 'YES, RESTART', 'primary', { size: 26 });
      button(view, 'no', x + 24, y + 128 + 64 + 20, w - 48, 56, 'KEEP PLAYING', 'secondary', { size: 24 });
    } else {
      text(c, 'PAUSED', R.W / 2, y + 62, { size: 44, weight: 900, color: COL.ink });
      button(view, 'resume', x + 24, y + 98, w - 48, 72, 'RESUME', 'primary', { size: 32, key: '' });
      button(view, 'restart', x + 24, y + 98 + 72 + 20, w - 48, 60, 'RESTART', 'secondary', { size: 26 });
    }
  }

  function overCard(view) {
    const c = ctx;
    const g = view.game;
    const k = easeOutBack(Math.min(1, view.overT / 0.4));
    dim(0.38 * Math.min(1, view.overT / 0.3));
    const w = Math.min(R.W - 28, 380);
    const h = Math.min(R.H - 24, 470);
    const x = (R.W - w) / 2;
    const y = (R.H - h) / 2 - (1 - k) * 60;
    c.save();
    c.globalAlpha = Math.min(1, view.overT / 0.2);
    card(x, y, w, h);
    const small = h < 400;
    text(c, 'JAR FULL', R.W / 2, y + (small ? 46 : 64), { size: small ? 30 : 38, weight: 900, color: COL.ink });
    const sy = y + (small ? 92 : 132);
    text(c, fmt(g.score), R.W / 2, sy, { size: fitSize(c, fmt(g.score), w - 60, small ? 54 : 74), weight: 900, color: COL.red });
    if (view.newBest) {
      c.save();
      c.translate(R.W / 2, sy + (small ? 36 : 56));
      c.rotate(-0.06);
      c.fillStyle = COL.ink;
      rr(c, -52, -17 + 3, 104, 34, 8);
      c.fill();
      c.fillStyle = COL.brass;
      rr(c, -52, -17, 104, 34, 8);
      c.fill();
      c.lineWidth = 3;
      c.strokeStyle = COL.ink;
      c.stroke();
      text(c, 'NEW BEST', 0, 1, { size: 18, weight: 900, color: COL.ink });
      c.restore();
    } else {
      text(c, `BEST ${fmt(view.best)}`, R.W / 2, sy + (small ? 34 : 54), { size: 22, weight: 800, color: '#6b4a38' });
    }
    // three stats
    const ry = y + (small ? 176 : 232);
    const cw = (w - 40) / 3;
    const stats = [
      ['BIGGEST', TIERS[g.biggest].name, g.biggest],
      ['MERGES', String(g.merges), -1],
      ['COMBO', `x${Math.max(1, g.longestCombo)}`, -1],
    ];
    for (let i = 0; i < 3; i++) {
      const cx = x + 20 + cw * (i + 0.5);
      text(c, stats[i][0], cx, ry, { size: 16, weight: 800, color: '#8a6a50' });
      if (stats[i][2] >= 0) {
        drawFruit(c, stats[i][2], cx, ry + 38, Math.min(26, 11 + stats[i][2] * 1.6), 0.3);
        text(c, stats[i][1], cx, ry + 82, { size: fitSize(c, stats[i][1], cw - 6, 20, 800), weight: 800, color: COL.ink });
      } else {
        text(c, stats[i][1], cx, ry + 44, { size: fitSize(c, stats[i][1], cw - 6, 38), weight: 900, color: COL.ink });
      }
    }
    button(view, 'retry', x + 24, y + h - 24 - 76, w - 48, 76, 'RETRY', 'primary', { size: 34 });
    c.restore();
  }

  function hint(view) {
    if (!view.hint) return;
    const L = R.L;
    const c = ctx;
    const a = Math.min(1, view.hintT / 0.3);
    c.save();
    c.globalAlpha = a;
    const y = L.ry + 120 * L.s;
    text(c, view.hint, L.jx + (JAR.w / 2) * L.s, y, { size: 24, weight: 900, color: '#fff', outline: COL.ink, outlineW: 7 });
    c.restore();
  }

  R.draw = (view) => {
    R.buttons = [];
    const c = ctx;
    c.setTransform(R.pr, 0, 0, R.pr, 0, 0);
    c.clearRect(0, 0, R.W, R.H);
    c.drawImage(R.bg, 0, 0, R.W, R.H);
    jar(view);
    if (view.mode === 'title') {
      title(view);
    } else {
      if (view.showLogo) logo(view);
      if (view.showHud !== false) hud(view);
      callout(view);
      hint(view);
      if (view.mode === 'pause' || view.mode === 'confirm') pauseCard(view);
      if (view.mode === 'over' && view.overT > 0.45) overCard(view);
    }
    if (fx.flash > 0.01 && !fx.reduced) {
      c.fillStyle = `rgba(255,240,200,${fx.flash * 0.28})`;
      c.fillRect(0, 0, R.W, R.H);
    }
  };

  R.hit = (x, y) => {
    for (let i = R.buttons.length - 1; i >= 0; i--) {
      const b = R.buttons[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h + 6) return b.id;
    }
    return null;
  };

  return R;
}
