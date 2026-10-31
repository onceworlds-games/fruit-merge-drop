// Juice that isn't the rules: droplets, rings, floating numbers, callouts, confetti, screen shake. Positions are in jar
// units (the renderer scales them). Nothing here touches the game's state.

const TAU = Math.PI * 2;

export function createFx() {
  const fx = {
    parts: [],
    rings: [],
    floats: [],
    ghosts: [], // two fruit sliding together into a merge
    callout: null,
    banner: null,
    trauma: 0,
    punch: 0,
    flash: 0,
    reduced: false,
    low: false,
    t: 0,
    pulse: new Array(11).fill(0), // ladder cells
    scorePop: 0,
  };

  fx.juice = (x, y, color, n, speed, size, extra = '#ffffff') => {
    if (fx.low) n = Math.ceil(n / 2);
    if (fx.reduced) n = Math.ceil(n / 2);
    for (let i = 0; i < n; i++) {
      if (fx.parts.length > 420) break;
      const a = Math.random() * TAU;
      const sp = speed * (0.35 + Math.random() * 0.85);
      fx.parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - speed * 0.25,
        life: 0, max: 0.5 + Math.random() * 0.5, size: size * (0.5 + Math.random() * 0.8),
        color: Math.random() < 0.18 ? extra : color, grav: 900, kind: 0, rot: 0, vr: 0,
      });
    }
  };

  fx.confetti = (x, y, n, colors) => {
    if (fx.reduced) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      if (fx.parts.length > 520) break;
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const sp = 240 + Math.random() * 520;
      fx.parts.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0, max: 1.4 + Math.random() * 1.2, size: 4 + Math.random() * 5,
        color: colors[i % colors.length], grav: 520, kind: 1, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14,
      });
    }
  };

  fx.ring = (x, y, r, color, width = 5, life = 0.45) => fx.rings.push({ x, y, r, color, width, life: 0, max: life });
  fx.float = (text, x, y, color, size = 28, life = 1.0, rise = 60) => {
    if (fx.floats.length > 24) fx.floats.shift();
    fx.floats.push({ text, x, y, color, size, life: 0, max: life, rise });
  };
  fx.setCallout = (text, sub, color) => {
    fx.callout = { text, sub, color, life: 0, max: 1.15 };
  };
  fx.setBanner = (kind, color, life = 1.8) => {
    fx.banner = { kind, color, life: 0, max: life };
  };
  fx.shake = (amount) => {
    if (fx.reduced) return;
    fx.trauma = Math.min(1, fx.trauma + amount);
  };
  fx.bump = (amount) => {
    if (fx.reduced) return;
    fx.punch = Math.min(1, fx.punch + amount);
  };
  fx.glimmer = (amount) => {
    if (fx.reduced) return;
    fx.flash = Math.min(1, fx.flash + amount);
  };
  fx.slide = (ax, ay, bx, by, kind, x, y) => fx.ghosts.push({ ax, ay, bx, by, kind, x, y, life: 0, max: 0.09 });

  fx.shakeOffset = () => {
    if (fx.trauma <= 0) return [0, 0];
    const k = fx.trauma * fx.trauma;
    return [Math.sin(fx.t * 53) * 9 * k, Math.sin(fx.t * 41 + 1.7) * 9 * k];
  };

  fx.update = (dt) => {
    fx.t += dt;
    fx.trauma = Math.max(0, fx.trauma - dt * 1.6);
    fx.punch = Math.max(0, fx.punch - dt * 3.2);
    fx.flash = Math.max(0, fx.flash - dt * 2.4);
    fx.scorePop = Math.max(0, fx.scorePop - dt * 4);
    for (let i = 0; i < fx.pulse.length; i++) fx.pulse[i] = Math.max(0, fx.pulse[i] - dt * 1.4);
    const ps = fx.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life += dt;
      if (p.life >= p.max) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      p.vy += p.grav * dt;
      p.vx *= 1 - 0.6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    for (const list of [fx.rings, fx.floats, fx.ghosts]) {
      for (let i = list.length - 1; i >= 0; i--) {
        list[i].life += dt;
        if (list[i].life >= list[i].max) list.splice(i, 1);
      }
    }
    if (fx.callout && (fx.callout.life += dt) >= fx.callout.max) fx.callout = null;
    if (fx.banner && (fx.banner.life += dt) >= fx.banner.max) fx.banner = null;
  };

  fx.clear = () => {
    fx.parts.length = 0;
    fx.rings.length = 0;
    fx.floats.length = 0;
    fx.ghosts.length = 0;
    fx.callout = null;
    fx.banner = null;
    fx.trauma = fx.punch = fx.flash = 0;
  };
  return fx;
}

export const easeOutBack = (t) => {
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
