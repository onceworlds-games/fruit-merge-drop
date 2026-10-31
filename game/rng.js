// Small seeded generator (mulberry32). The state is one 32-bit integer so a saved jar can carry on the same sequence.
export function createRng(seed = 1) {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.getState = () => s;
  next.setState = (v) => {
    s = v >>> 0;
  };
  return next;
}
