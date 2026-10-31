// Every sound is synthesized. Soft plops and wooden knocks, marimba merge pops that climb with the fruit, a bossa-ish
// marimba loop underneath. The platform applies volume and mute.

let ctx = null;
let master = null;
let sfx = null;
let music = null;
let noiseBuf = null;
let started = false;
let musicLevel = 0;
let lastKnock = 0;
let dangerOsc = null;
let dangerGain = null;
let seqTimer = null;
let step = 0;
let nextT = 0;

const SCALE = [0, 2, 4, 7, 9]; // major pentatonic
const mid = (n) => 261.63 * Math.pow(2, n / 12);
const tierNote = (k) => mid(SCALE[k % 5] + 12 * Math.floor(k / 5) + (k > 4 ? 0 : 0));

export function startAudio() {
  if (started) {
    if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  try {
    ctx = new AC();
  } catch {
    return;
  }
  started = true;
  master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  sfx = ctx.createGain();
  sfx.connect(master);
  music = ctx.createGain();
  music.gain.value = 0;
  music.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  nextT = ctx.currentTime + 0.2;
  seqTimer = setInterval(sequence, 40);
}

const ok = () => ctx && ctx.state === 'running';

function tone(freq, { type = 'sine', at = 0, dur = 0.2, vol = 0.3, attack = 0.004, slide = 0, out = sfx } = {}) {
  if (!ok()) return;
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

function noise({ at = 0, dur = 0.08, vol = 0.2, freq = 1500, q = 1, type = 'bandpass', out = sfx } = {}) {
  if (!ok()) return;
  const t = ctx.currentTime + at;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.05);
}

// A marimba-like note: a sine with a quick bright second partial.
function mar(freq, at, vol, dur = 0.35, out = sfx) {
  tone(freq, { at, dur, vol, out, attack: 0.003 });
  tone(freq * 4, { at, dur: dur * 0.18, vol: vol * 0.35, out, attack: 0.002 });
}

export const sound = {
  drop() {
    tone(300, { dur: 0.1, vol: 0.2, slide: 0.5 });
    noise({ dur: 0.05, vol: 0.05, freq: 900 });
  },
  ready() {
    tone(520, { dur: 0.05, vol: 0.06, slide: 1.3 });
  },
  knock(v) {
    if (!ok()) return;
    const now = ctx.currentTime;
    if (now - lastKnock < 0.045) return;
    lastKnock = now;
    const k = Math.min(1, v / 900);
    const f = 150 + Math.random() * 90;
    tone(f, { type: 'triangle', dur: 0.07, vol: 0.05 + 0.2 * k, slide: 0.6 });
    noise({ dur: 0.03, vol: 0.03 + 0.1 * k, freq: 700 + Math.random() * 500, q: 2 });
  },
  merge(kind, combo = 1) {
    const f = tierNote(kind) * (kind > 4 ? 2 : 1);
    const v = 0.18 + kind * 0.012;
    mar(f, 0, v, 0.3 + kind * 0.03);
    tone(f * 0.5, { dur: 0.12, vol: 0.12, slide: 0.6 });
    noise({ dur: 0.07, vol: 0.09, freq: 1800 + kind * 120, q: 0.7 });
    if (combo >= 2) {
      const base = f * Math.pow(2, Math.min(combo, 8) / 12);
      mar(base * 1.5, 0.07, 0.14, 0.25);
    }
  },
  combo(n) {
    const steps = [0, 4, 7, 12, 16, 19, 24];
    const m = Math.min(n, 7);
    for (let i = 0; i < m; i++) mar(mid(steps[i] + 12), 0.04 * i + 0.05, 0.1, 0.22);
  },
  tier(kind) {
    mar(mid(7) * 2, 0.0, 0.1, 0.4);
    mar(mid(12) * 2, 0.08, 0.1, 0.5);
    void kind;
  },
  burst() {
    for (const [i, n] of [0, 4, 7, 12, 16].entries()) {
      tone(mid(n) * 2, { type: 'sawtooth', at: i * 0.07, dur: 0.5, vol: 0.07 });
      mar(mid(n + 12) * 2, i * 0.07, 0.14, 0.7);
    }
    noise({ dur: 0.5, vol: 0.2, freq: 2400, q: 0.5 });
    tone(110, { dur: 0.5, vol: 0.3, slide: 0.4 });
  },
  danger(level) {
    if (!ok()) return;
    if (level <= 0) {
      if (dangerOsc) {
        dangerGain.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
        const o = dangerOsc;
        dangerOsc = null;
        setTimeout(() => {
          try {
            o.stop();
          } catch {}
        }, 400);
      }
      return;
    }
    if (!dangerOsc) {
      dangerOsc = ctx.createOscillator();
      dangerGain = ctx.createGain();
      dangerOsc.type = 'triangle';
      dangerGain.gain.value = 0;
      dangerOsc.connect(dangerGain).connect(sfx);
      dangerOsc.start();
    }
    const t = ctx.currentTime;
    dangerOsc.frequency.setTargetAtTime(300 + level * 500, t, 0.05);
    const beat = Math.sin(t * (8 + level * 16)) > 0 ? 1 : 0.2;
    dangerGain.gain.setTargetAtTime(0.05 + 0.07 * level * beat, t, 0.02);
  },
  over() {
    sound.danger(0);
    [0, 3, 7, 10].forEach((n, i) => {
      mar(mid(n - 12 + 12) * 0.5, i * 0.18, 0.16, 1.2);
    });
    tone(130, { dur: 0.9, vol: 0.2, slide: 0.6, type: 'triangle' });
  },
  pop(i) {
    mar(mid(SCALE[i % 5] + 12 * ((i >> 2) % 2)) * 1.5, 0, 0.08, 0.15);
  },
  click() {
    tone(660, { dur: 0.05, vol: 0.1, type: 'triangle' });
  },
  best() {
    [0, 4, 7, 12, 16].forEach((n, i) => mar(mid(n + 12), i * 0.09, 0.14, 0.5));
  },
};

export function setMusic(level) {
  musicLevel = level;
  if (music && ctx) music.gain.setTargetAtTime(level, ctx.currentTime, 0.4);
}

// Light bossa: Cmaj7 - A7 - Dm7 - G7, marimba on top, soft shaker, a sine bass.
const CHORDS = [
  { root: 0, notes: [4, 7, 11, 14] },
  { root: -3, notes: [4, 7, 10, 13] },
  { root: 2, notes: [5, 9, 12, 16] },
  { root: -5, notes: [5, 7, 11, 14] },
];
const BEAT = 60 / 104 / 2; // eighths
const MEL = [0, -1, 7, -1, 9, 7, -1, 4, 0, -1, 4, -1, 7, 4, -1, 2];

function sequence() {
  if (!ok() || musicLevel <= 0.001) {
    if (ctx && nextT < ctx.currentTime) nextT = ctx.currentTime + 0.1;
    return;
  }
  while (nextT < ctx.currentTime + 0.25) {
    const at = nextT - ctx.currentTime;
    const bar = Math.floor(step / 16) % 4;
    const s = step % 16;
    const ch = CHORDS[bar];
    if (s === 0 || s === 6 || s === 8 || s === 14) {
      tone(mid(ch.root - 12), { at, dur: 0.38, vol: 0.28, out: music, attack: 0.01 });
    }
    if ([2, 5, 8, 11, 13].includes(s)) {
      ch.notes.slice(0, 3).forEach((n, i) => mar(mid(n + ch.root), at + i * 0.012, 0.045, 0.22, music));
    }
    const m = MEL[s] ;
    if (m >= 0 && (step >> 4) % 2 === 1) mar(mid(m + 12 + ch.root * 0), at, 0.07, 0.3, music);
    if (s % 2 === 0) noise({ at, dur: 0.04, vol: 0.018, freq: 6500, q: 1, type: 'highpass', out: music });
    step++;
    nextT += BEAT;
  }
}

export function stopAudio() {
  if (seqTimer) clearInterval(seqTimer);
  seqTimer = null;
}
