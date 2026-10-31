// Numbers shared by the rules, the physics and the renderer. World units: the jar's inside is JAR.w wide, y grows down,
// the rim is y = 0 and the floor y = JAR.h.

export const JAR = {
  w: 260,
  h: 340,
  corner: 64, // radius of the rounded bottom corners (larger than the biggest fruit)
  dangerY: 74, // the line: a settled fruit whose top is above it starts the countdown
  holdY: -30, // centre of the fruit hanging in the claw
  railY: -66, // the claw's rail
  wall: 12, // glass thickness (drawing only)
};

export const DANGER_TIME = 2.5;
export const DROP_COOLDOWN = 0.45;
export const COMBO_WINDOW = 0.9;
export const JACKFRUIT_BONUS = 500;
export const MERGE_LOCK = 0.14; // a fresh merge result can't merge again for this long, so chains read as steps

const R0 = 8.2;
const GROW = 1.22;

// Smallest to largest. `c` is the skin colour, `d` the dark edge, `l` the light side (juice, ladder, particles).
export const TIERS = [
  { name: 'Blueberry', c: '#3e51a8', d: '#1d2559', l: '#8ea0e6', juice: '#5a6fd0' },
  { name: 'Lime', c: '#8dc63f', d: '#42691a', l: '#c9e87a', juice: '#a9dd4a' },
  { name: 'Kiwi', c: '#86c23a', d: '#5b4020', l: '#d8ee8c', juice: '#a6d84a' },
  { name: 'Plum', c: '#6a2f8a', d: '#341145', l: '#b88ad8', juice: '#9b4ec2' },
  { name: 'Lemon', c: '#f5d82c', d: '#a98807', l: '#fff08a', juice: '#ffe44d' },
  { name: 'Peach', c: '#f59a68', d: '#a33f3a', l: '#ffd2a8', juice: '#ff9c7a' },
  { name: 'Orange', c: '#f28a1c', d: '#a24b05', l: '#ffc46b', juice: '#ffa22e' },
  { name: 'Mango', c: '#ef6a38', d: '#8a2a18', l: '#ffd34f', juice: '#ff8a3c' },
  { name: 'Coconut', c: '#7b4f2d', d: '#2e1a0b', l: '#d9b48a', juice: '#f3ead2' },
  { name: 'Papaya', c: '#ff8a3f', d: '#5c7a1a', l: '#ffc08a', juice: '#ff7a3a' },
  { name: 'Jackfruit', c: '#a3b53c', d: '#4c5a14', l: '#e0e98a', juice: '#d6e060' },
].map((t, k) => ({ ...t, k, r: Math.round(R0 * Math.pow(GROW, k) * 10) / 10 }));

export const KINDS = TIERS.length;
export const MAX_KIND = KINDS - 1;
export const DROP_KINDS = 5; // a drop is one of the five smallest
export const DROP_WEIGHTS = [36, 28, 20, 10, 6];

export const radiusOf = (k) => TIERS[k].r;
export const mergeScore = (k) => k * (k + 1); // merging into tier k: 2, 6, 12, 20 ...

// Chain length -> multiplier: x1, x1.5, x2, x3, x4 ...
export function comboMultiplier(n) {
  if (n <= 1) return 1;
  if (n === 2) return 1.5;
  if (n === 3) return 2;
  return Math.min(10, n - 1);
}

export const BADGES = {
  'first-mango': { kind: 7 },
  coconut: { kind: 8 },
  jackfruit: { kind: 10 },
};
