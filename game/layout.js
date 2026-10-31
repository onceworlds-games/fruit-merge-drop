// Where everything goes for a window size. Pure, so it can be tested. Two shapes: portrait (jar fills the height, score,
// next and then above it, the ladder on the counter below) and wide (jar in the middle, score and ladder left, next and
// then right).
import { JAR } from './config.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function computeLayout(W, H) {
  const wide = W / H > 1.12;
  const wall = JAR.wall;
  const zone = -JAR.railY + 10; // world units of claw room above the rim
  const L = { W, H, wide, wall };
  if (!wide) {
    const awn = clamp(H * 0.07, 40, 64);
    const hud = Math.max(clamp(H * 0.115, 76, 108), 148 - awn);
    const board = clamp(H * 0.09, 56, 80);
    const counter = clamp(H * 0.02, 12, 20);
    const sW = (W - 20) / (JAR.w + 2 * wall);
    const sH = (H - awn - hud - board - counter - 8) / (zone + JAR.h + wall);
    const s = Math.max(0.2, Math.min(sW, sH, 2.6));
    const free = Math.max(0, H - awn - hud - board - counter - 8 - (zone + JAR.h + wall) * s);
    const hudH = hud + free * 0.7;
    L.s = s;
    L.awn = awn;
    L.jx = (W - JAR.w * s) / 2;
    L.ry = awn + hudH + zone * s;
    L.hudTop = awn;
    L.hudH = hudH;
    L.floorY = L.ry + JAR.h * s;
    L.counterY = L.floorY + wall * s * 0.7;
    L.counterH = counter;
    L.boardY = L.counterY + counter;
    L.boardH = H - L.boardY;
    const signW = clamp(W * 0.44, 150, 230);
    const signH = clamp(hudH - 12, 70, 120);
    const sideW = (W - signW) / 2 - 18;
    L.score = { x: (W - signW) / 2, y: Math.max(awn + (hudH - signH) / 2 + 2, 64), w: signW, h: signH };
    const trayW = clamp(sideW, 60, 96);
    const ty = Math.max(L.score.y + 22, 86);
    L.next = { x: 12, y: ty, w: trayW, h: signH - 22, label: 'NEXT' };
    L.then = { x: W - 12 - trayW, y: ty, w: trayW, h: signH - 22, label: 'THEN' };
    const pb = 48;
    L.pause = { x: W - pb - 10, y: Math.max(4, awn * 0.5 - pb * 0.5), w: pb, h: pb };
    // ladder on the front board: one row
    const pad = 12;
    const cw = (W - pad * 2) / 11;
    L.ladder = { cell: cw, cells: [], r: Math.min(cw * 0.46, L.boardH * 0.34) };
    const cy = L.boardY + L.boardH * 0.5;
    for (let k = 0; k < 11; k++) L.ladder.cells.push({ x: pad + cw * (k + 0.5), y: cy });
  } else {
    const awn = clamp(H * 0.06, 28, 46);
    const counter = clamp(H * 0.04, 12, 26);
    const board = clamp(H * 0.045, 14, 30);
    const sW = (W * 0.44) / (JAR.w + 2 * wall);
    const sH = (H - awn - counter - board - 10) / (zone + JAR.h + wall);
    const s = Math.max(0.2, Math.min(sW, sH, 2.6));
    L.s = s;
    L.awn = awn;
    L.jx = (W - JAR.w * s) / 2;
    const total = (zone + JAR.h + wall) * s;
    const top = awn + (H - awn - counter - board - 10 - total) / 2 + 4;
    L.ry = top + zone * s;
    L.floorY = L.ry + JAR.h * s;
    L.counterY = L.floorY + wall * s * 0.7;
    L.counterH = counter;
    L.boardY = L.counterY + counter;
    L.boardH = H - L.boardY;
    const gap = 20;
    const colL = { x: 14, w: Math.max(120, L.jx - wall * s - gap - 14) };
    const colR = { x: L.jx + (JAR.w + wall) * s + gap, w: Math.max(120, W - (L.jx + (JAR.w + wall) * s + gap) - 14) };
    const top0 = Math.max(awn + 12, 76);
    const sw = Math.min(colL.w, 250);
    const sh = clamp(H * 0.26, 84, 130);
    L.score = { x: colL.x + (colL.w - sw) / 2, y: top0, w: sw, h: sh };
    const cell = Math.min(sw / 4, (H - counter - board - (top0 + sh + 24)) / 3, 70);
    L.ladder = { cell, cells: [], r: cell * 0.4 };
    const gx = L.score.x + (sw - cell * 4) / 2;
    const gy = top0 + sh + 18;
    for (let k = 0; k < 11; k++) L.ladder.cells.push({ x: gx + cell * ((k % 4) + 0.5), y: gy + cell * (Math.floor(k / 4) + 0.5) });
    const tw = Math.min(colR.w, 150);
    const th = clamp(H * 0.28, 90, 150);
    L.next = { x: colR.x + (colR.w - tw) / 2, y: top0, w: tw, h: th, label: 'NEXT' };
    L.then = { x: colR.x + (colR.w - tw) / 2, y: top0 + th + 14, w: tw * 0.72, h: th * 0.72, label: 'THEN' };
    const pb = 48;
    L.pause = { x: W - pb - 12, y: 8, w: pb, h: pb };
  }
  return L;
}

// Jar coordinates (world units) -> screen pixels.
export const toScreenX = (L, x) => L.jx + x * L.s;
export const toScreenY = (L, y) => L.ry + y * L.s;
export const toWorldX = (L, px) => (px - L.jx) / L.s;
