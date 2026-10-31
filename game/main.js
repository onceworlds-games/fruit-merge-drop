// Boot, input, the state machine (title, play, pause, restart confirm, game over), saves, badges and the juice that
// answers the rules' events.

import { Game } from './game.js';
import { createBot } from './bot.js';
import { JAR, TIERS } from './config.js';
import { createFx } from './fx.js';
import { createRenderer, COL } from './render.js';
import { toWorldX } from './layout.js';
import { startAudio, sound, setMusic } from './audio.js';

const params = new URLSearchParams(location.search);
if (params.has('poster')) {
  import('./poster.js').then((m) => m.runPoster(params.get('poster')));
} else {
  boot().catch((err) => { console.error(err); const c = document.getElementById('cv').getContext('2d'); c.fillStyle = '#fff'; c.font = '12px monospace'; String(err.stack).split('\n').slice(0, 8).forEach((l, i) => c.fillText(l.slice(0, 60), 4, 100 + i * 14)); });
}

async function boot() {
  const ow = window.onceworlds || null;
  const canvas = document.getElementById('cv');
  const fx = createFx();
  const R = createRenderer(canvas, fx);
  const touch = () => !!(ow && ow.controls && ow.controls.touch) || (matchMedia && matchMedia('(pointer: coarse)').matches);

  try {
    ow?.ui?.setLook?.({ accent: '#d63a2c', panel: '#2a1812', text: '#f7ead0' });
    ow?.controls?.set?.(null);
  } catch {}

  const applySettings = () => {
    fx.reduced = !!ow?.settings?.reducedMotion;
    fx.low = ow?.settings?.quality === 'low';
  };
  applySettings();
  try {
    ow?.settings?.on?.('change', () => {
      applySettings();
      layout();
    });
  } catch {}

  const layout = () => {
    const pr = ow?.settings?.pixelRatio ? ow.settings.pixelRatio(2) : Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(200, window.innerWidth || document.documentElement.clientWidth || 390);
    const H = Math.max(200, window.innerHeight || document.documentElement.clientHeight || 844);
    R.resize(W, H, pr);
    try {
      R.reserved = ow?.ui?.reserved || null; // the platform's menu and touch controls, in page pixels
    } catch {}
  };
  layout();
  window.addEventListener('resize', layout);
  try {
    ow?.on?.('reserved', layout);
  } catch {}
  try {
    document.fonts.load('900 40px Rubik').catch(() => {});
    document.fonts.load('800 20px Rubik').catch(() => {});
  } catch {}

  // ---- saves -----------------------------------------------------------------------------------------------------
  const store = { best: 0, games: 0, hint: false, badges: {} };
  let savedJar = null;
  const loadSaves = async () => {
    try {
      const st = await ow?.save?.get?.('stats');
      if (st && typeof st === 'object') {
        store.best = Number.isFinite(st.best) ? Math.max(0, st.best) : 0;
        store.games = Number.isFinite(st.games) ? st.games : 0;
        store.hint = !!st.hint;
        if (st.badges && typeof st.badges === 'object') store.badges = st.badges;
      }
      const j = await ow?.save?.get?.('jar');
      if (j && Game.restore(j)) savedJar = j;
    } catch {}
    view.best = store.best;
    if (view.mode === 'title') view.hasSave = !!savedJar;
  };
  const saveStats = () => {
    try {
      ow?.save?.set?.('stats', { best: store.best, games: store.games, hint: store.hint, badges: store.badges });
    } catch {}
  };
  let lastJarSave = 0;
  const saveJar = (force) => {
    const now = performance.now();
    if (!force && now - lastJarSave < 2500) return;
    lastJarSave = now;
    try {
      if (view.game && !view.game.over && view.mode !== 'title') ow?.save?.set?.('jar', view.game.snapshot());
    } catch {}
  };
  const clearJar = () => {
    savedJar = null;
    try {
      ow?.save?.delete?.('jar');
    } catch {}
  };
  const award = (id) => {
    if (store.badges[id]) return;
    store.badges[id] = 1;
    try {
      ow?.badges?.award?.(id);
    } catch {}
    saveStats();
  };

  // ---- state -----------------------------------------------------------------------------------------------------
  const view = {
    mode: 'title',
    game: null,
    t: 0,
    best: 0,
    shownScore: 0,
    clawX: JAR.w / 2,
    clawOpen: 0,
    readyT: 1,
    hasSave: false,
    hint: null,
    hintT: 0,
    titleT: 0,
    overT: 0,
    newBest: false,
    hover: null,
    press: null,
  };
  let demo = null;
  let demoBot = null;
  let demoSeed = 1;
  const newDemo = () => {
    demoSeed = (demoSeed * 31 + 7) % 9973;
    demo = new Game({ seed: demoSeed });
    demoBot = createBot(demoSeed, 0.8);
    demo.drops = 5;
    demo.setAim(JAR.w / 2);
    // start with a few fruit already settled so the title is never an empty jar
    for (let i = 0; i < 14; i++) {
      if (demo.ready) {
        demo.setAim(demoBot.choose(demo));
        demo.drop();
      }
      for (let f = 0; f < 36; f++) demo.step(1 / 60);
    }
    demo.events.length = 0;
  };
  newDemo();
  view.game = demo;
  let demoWait = 0;

  let hitStop = 0;
  let slow = 0;
  let timeScale = 1;
  let frozen = false; // the platform's menu is open
  let overClock = 0;
  let popDur = 0;
  let popQueue = [];
  let popClock = 0;
  const seen = new Array(11).fill(false);
  let scoreBadges = false;

  const startGame = (resume) => {
    let g = null;
    if (resume && savedJar) g = Game.restore(savedJar);
    if (!g) {
      g = new Game({ seed: (Math.random() * 4294967295) >>> 0 });
      clearJar();
    }
    view.game = g;
    view.mode = 'play';
    view.shownScore = g.score;
    view.newBest = false;
    view.clawOpen = 0;
    view.readyT = 0;
    view.clawX = g.aimX;
    fx.clear();
    for (let k = 0; k < 11; k++) seen[k] = g.made[k];
    popQueue = [];
    overClock = 0;
    slow = 0;
    timeScale = 1;
    hitStop = 0;
    view.hasSave = false;
    startAudio();
    setMusic(1);
    try {
      ow?.controls?.set?.(null);
    } catch {}
    sound.click();
  };

  const pause = () => {
    if (view.mode !== 'play') return;
    view.mode = 'pause';
    saveJar(true);
    setMusic(0.35);
    sound.danger(0);
    sound.click();
  };
  const resume = () => {
    if (view.mode !== 'pause' && view.mode !== 'confirm') return;
    view.mode = 'play';
    setMusic(1);
    sound.click();
  };

  // ---- reacting to the rules ---------------------------------------------------------------------------------------
  const wx = (x) => x; // fx uses jar units already
  function handleEvents(g, demoMode) {
    for (const e of g.events) {
      switch (e.type) {
        case 'drop':
          view.clawOpen = 1;
          if (!demoMode) {
            sound.drop();
            if (!store.hint) {
              store.hint = true;
              saveStats();
            }
          }
          break;
        case 'ready':
          view.readyT = 0;
          if (!demoMode) sound.ready();
          break;
        case 'bump':
          if (e.v > 140 || !demoMode) sound.knock(e.v);
          break;
        case 'merge': {
          const k = e.kind;
          const t = TIERS[k];
          fx.slide(e.ax, e.ay, e.bx, e.by, k, e.x, e.y);
          fx.juice(wx(e.x), e.y, t.juice, 8 + k * 3, 130 + k * 28, 2.6 + k * 0.32, '#ffffff');
          fx.ring(e.x, e.y, t.r * 1.5, t.l, 3 + k * 0.4, 0.4);
          fx.float(`+${e.pts}`, e.x, e.y - t.r * 0.5, e.combo > 1 ? '#ffd24a' : '#fff3d6', 18 + k * 1.6, 0.9 + k * 0.03, 46);
          fx.shake(0.04 + k * 0.03);
          if (k >= 6) fx.bump(0.4 + (k - 6) * 0.15);
          if (k >= 7 && !fx.reduced) hitStop = Math.max(hitStop, 0.04);
          fx.scorePop = 1;
          sound.merge(k, e.combo);
          if (!seen[k]) {
            seen[k] = true;
            if (!demoMode && k >= 3) {
              fx.pulse[k] = 1;
              fx.setBanner(k, COL.brass);
              sound.tier(k);
              fx.float(t.name.toUpperCase(), e.x, e.y - t.r - 14, '#ffd24a', 24, 1.5, 30);
            }
          }
          if (!demoMode) {
            if (k >= 7) award('first-mango');
            if (k >= 8) award('coconut');
            if (k === 10) {
              award('jackfruit');
              slow = fx.reduced ? 0 : 0.8;
              fx.confetti(e.x, e.y, 70, ['#c6e04a', '#ffd24a', '#ff7a3a', '#f7ead0', '#d63a2c']);
              fx.shake(0.6);
              fx.glimmer(0.6);
              sound.burst();
            }
          }
          break;
        }
        case 'burst':
          fx.juice(e.x, e.y, TIERS[10].juice, 60, 420, 4, '#ffd24a');
          fx.ring(e.x, e.y, 140, '#ffd24a', 8, 0.7);
          fx.ring(e.x, e.y, 90, '#fff3d6', 5, 0.5);
          fx.float('+500', e.x, e.y - 20, '#ffd24a', 44, 1.6, 90);
          fx.confetti(e.x, e.y, 90, ['#c6e04a', '#ffd24a', '#ff7a3a', '#f7ead0', '#d63a2c']);
          fx.shake(0.9);
          fx.bump(1);
          fx.glimmer(0.8);
          fx.setCallout('JACKFRUIT BURST', '+500', '#ffd24a');
          slow = fx.reduced ? 0 : 1;
          if (!demoMode) {
            sound.burst();
            award('jackfruit');
          }
          break;
        case 'combo':
          if (!demoMode) {
            const col = e.n >= 6 ? '#ff5a3c' : e.n >= 4 ? '#ff9a2e' : e.n >= 3 ? '#ffd24a' : '#f7ead0';
            fx.setCallout(`COMBO x${e.n}`, e.mult > 1 ? `x${e.mult} POINTS` : null, col);
            sound.combo(e.n);
            if (e.n >= 5) award('combo-5');
          }
          break;
        case 'over':
          if (!demoMode) onOver(g);
          break;
        default:
      }
    }
    g.events.length = 0;
  }

  function onOver(g) {
    view.mode = 'over';
    sound.danger(0);
    sound.over();
    setMusic(0.25);
    store.games++;
    view.newBest = g.score > store.best && g.score > 0;
    if (view.newBest) store.best = g.score;
    view.best = store.best;
    saveStats();
    clearJar();
    try {
      if (g.score > 0) ow?.leaderboards?.submit?.('high-score', g.score);
    } catch {}
    popQueue = g.world.bodies.slice().sort((a, b) => b.y - a.y);
    popDur = Math.min(1.3, 0.05 + popQueue.length * 0.035);
    popClock = 0;
    overClock = 0;
    view.overT = -10;
    if (view.newBest) setTimeout(() => sound.best(), popDur * 1000 + 300);
  }

  function checkScoreBadges(g) {
    if (g.score >= 3000) award('score-3000');
    if (g.score >= 8000) award('score-8000');
  }

  // ---- input -----------------------------------------------------------------------------------------------------
  const keys = new Set();
  let dragging = false;
  let downOnButton = null;
  const aimAt = (px) => {
    const g = view.game;
    if (!g || view.mode !== 'play') return;
    g.setAim(toWorldX(R.L, px));
  };

  const activate = (id) => {
    startAudio();
    switch (id) {
      case 'play':
        startGame(true);
        break;
      case 'new':
        clearJar();
        startGame(false);
        break;
      case 'pause':
        if (view.mode === 'play') pause();
        break;
      case 'resume':
        resume();
        break;
      case 'restart':
        view.mode = 'confirm';
        sound.click();
        break;
      case 'no':
        view.mode = 'pause';
        sound.click();
        break;
      case 'yes':
        clearJar();
        startGame(false);
        break;
      case 'retry':
        startGame(false);
        break;
      default:
    }
  };

  canvas.addEventListener('pointerdown', (e) => {
    startAudio();
    e.preventDefault();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}
    const id = R.hit(e.clientX, e.clientY);
    if (id) {
      downOnButton = id;
      view.press = id;
      return;
    }
    downOnButton = null;
    if (view.mode === 'play' && !frozen) {
      dragging = true;
      aimAt(e.clientX);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    view.hover = R.hit(e.clientX, e.clientY);
    if (e.pointerType === 'mouse' || dragging) aimAt(e.clientX);
  });
  const up = (e) => {
    const id = R.hit(e.clientX, e.clientY);
    if (downOnButton) {
      if (id === downOnButton) activate(id);
    } else if (dragging && view.mode === 'play' && !frozen && e.type === 'pointerup') {
      aimAt(e.clientX);
      view.game.drop();
    }
    downOnButton = null;
    view.press = null;
    dragging = false;
    if (e.pointerType !== 'mouse') view.hover = null;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', () => {
    downOnButton = null;
    view.press = null;
    dragging = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (['ArrowLeft', 'ArrowRight', 'ArrowDown', ' ', 'Enter', 'Escape'].includes(e.key)) e.preventDefault();
    startAudio();
    if (e.repeat && k !== 'ArrowLeft' && k !== 'ArrowRight') return;
    const m = view.mode;
    if (k === 'ArrowLeft' || k === 'a') keys.add('l');
    else if (k === 'ArrowRight' || k === 'd') keys.add('r');
    if (m === 'title') {
      if (k === 'Enter' || k === ' ') activate('play');
    } else if (m === 'play') {
      if (k === ' ' || k === 'Enter' || k === 'ArrowDown' || k === 's') {
        if (!frozen) view.game.drop();
      } else if (k === 'p' || k === 'Escape') pause();
    } else if (m === 'pause') {
      if (k === 'p' || k === 'Escape' || k === ' ' || k === 'Enter') resume();
    } else if (m === 'confirm') {
      if (k === 'Escape') activate('no');
    } else if (m === 'over') {
      if ((k === 'Enter' || k === ' ') && overClock > popDur + 0.3) activate('retry');
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === 'ArrowLeft' || k === 'a') keys.delete('l');
    if (k === 'ArrowRight' || k === 'd') keys.delete('r');
  });
  window.addEventListener('blur', () => keys.clear());
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      pause();
      saveJar(true);
      sound.danger(0);
      setMusic(0);
    } else setMusic(view.mode === 'title' ? 0.7 : view.mode === 'play' ? 1 : 0.35);
  });
  try {
    ow?.on?.('pause', () => {
      if (view.mode === 'play') {
        frozen = true;
        saveJar(true);
        sound.danger(0);
      }
    });
    ow?.on?.('resume', () => {
      frozen = false;
    });
  } catch {}

  // ---- the loop ----------------------------------------------------------------------------------------------------
  const STEP = 1 / 60;
  let acc = 0;
  let last = performance.now();
  let frame = 0;

  function update(dt) {
    view.t += dt;
    fx.update(dt);
    const g = view.game;
    if (view.mode === 'title') {
      view.titleT += dt;
      // the live jar plays itself
      demoWait -= dt;
      if (demo.ready && demoWait <= 0) {
        const x = demoBot.choose(demo);
        view.clawX += Math.sign(x - view.clawX) * Math.min(Math.abs(x - view.clawX), 260 * dt);
        demo.setAim(view.clawX);
        if (Math.abs(x - view.clawX) < 3) {
          demo.drop();
          demoWait = 0.5;
        }
      }
      acc += dt;
      let n = 0;
      while (acc >= STEP && n++ < 4) {
        acc -= STEP;
        demo.step(STEP);
        handleEvents(demo, true);
        if (demo.over || demo.world.bodies.length > 44) newDemo();
      }
      view.clawOpen = Math.max(0, view.clawOpen - dt * 3);
      view.readyT = Math.min(1, view.readyT + dt * 4);
      view.game = demo;
      view.shownScore = 0;
      return;
    }
    if (view.mode === 'play' && !frozen) {
      hitStop = Math.max(0, hitStop - dt);
      slow = Math.max(0, slow - dt);
      const target = slow > 0 ? 0.35 : 1;
      timeScale += (target - timeScale) * Math.min(1, dt * 12);
      if (hitStop <= 0) {
        acc += dt * timeScale;
        let n = 0;
        while (acc >= STEP && n++ < 5) {
          acc -= STEP;
          g.step(STEP);
          handleEvents(g, false);
          if (view.mode !== 'play') break;
        }
      }
      const dir = (keys.has('r') ? 1 : 0) - (keys.has('l') ? 1 : 0);
      if (dir) g.setAim(g.aimX + dir * 330 * dt);
      if (g.dangerT > 0.02 && frame % 3 === 0) sound.danger(g.danger);
      else if (g.dangerT <= 0.02 && frame % 6 === 0) sound.danger(0);
      checkScoreBadges(g);
      if (frame % 20 === 0) saveJar(false);
    }
    if (view.mode === 'over') {
      overClock += dt;
      popClock += dt;
      const per = popQueue.length ? popDur / popQueue.length : 1;
      while (popQueue.length && popClock > per) {
        popClock -= per;
        const b = popQueue.shift();
        b.hide = true;
        fx.juice(b.x, b.y, TIERS[b.kind].juice, 5, 160, 2.4);
        fx.ring(b.x, b.y, b.r, TIERS[b.kind].l, 2.5, 0.3);
        sound.pop(popQueue.length);
      }
      view.overT = overClock - popDur + 0.45;
    }
    // claw follows the aim
    if (view.mode !== 'title' && g) {
      const d = g.aimX - view.clawX;
      view.clawX += d * Math.min(1, dt * (dragging || touch() ? 26 : 34));
      view.clawOpen = Math.max(0, view.clawOpen - dt * 2.2);
      view.readyT = Math.min(1, view.readyT + dt * 5);
      view.shownScore += (g.score - view.shownScore) * Math.min(1, dt * 9);
      if (Math.abs(g.score - view.shownScore) < 1) view.shownScore = g.score;
      view.best = Math.max(store.best, 0);
      view.hint = view.mode === 'play' && !store.hint && g.drops === 0 && !dragging ? (touch() ? 'Drag, then let go' : 'Click to drop') : null;
      view.hintT = view.hint ? view.hintT + dt : 0;
    }
  }

  function tick(now) {
    requestAnimationFrame(tick);
    frame++;
    let dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.1);
    if (window.innerWidth && (window.innerWidth !== R.W || window.innerHeight !== R.H)) layout();
    try {
      update(dt);
      R.draw(view);
    } catch (err) {
      console.error(err);
      if (params.has('debug')) { ctx2.fillStyle = '#fff'; ctx2.font = '12px monospace'; String(err.stack).split('\n').slice(0, 6).forEach((l, i) => ctx2.fillText(l, 4, 100 + i * 14)); }
    }
  }
  const ctx2 = canvas.getContext('2d');
  setMusic(0.7);
  requestAnimationFrame(tick);
  Promise.race([loadSaves(), new Promise((r) => setTimeout(r, 2500))]).then(() => {
    // the platform's screenshot and playtest tools ask for a moment of play with ?autoplay=1
    if (params.get('autoplay') === '1') setTimeout(() => startGame(false), 300);
  });
  window.__fmd = { view, store }; // for debugging in the console
  void scoreBadges;
}
