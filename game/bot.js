// A simple player: picks where to drop by looking at where each spot would land. Used by the title screen's live jar, the
// posters and the tests. skill 0..1: lower skill adds noise to the choice.
import { JAR, radiusOf } from './config.js';
import { landingY } from './game.js';
import { createRng } from './rng.js';

export function createBot(seed = 1, skill = 0.85) {
  const rng = createRng(seed * 7919 + 13);
  return {
    choose(game) {
      const kind = game.held !== null ? game.held : game.next;
      const r = radiusOf(kind);
      const bodies = game.world.bodies;
      let bestX = JAR.w / 2;
      let best = -Infinity;
      for (let x = r + 2; x <= JAR.w - r - 2; x += 6) {
        const y = landingY(bodies, x, r);
        let v = y;
        for (const b of bodies) {
          const dx = x - b.x;
          const dy = y - b.y;
          const gap = Math.sqrt(dx * dx + dy * dy) - r - b.r;
          if (gap > 4) continue;
          if (b.kind === kind) v += 70 + 8 * kind;
          else if (b.r < r * 0.7) v -= 25;
          else if (b.kind === kind + 1) v += 8;
        }
        v -= Math.abs(x - JAR.w / 2) * 0.03;
        v += (rng() - 0.5) * (1 - skill) * 420;
        if (v > best) {
          best = v;
          bestX = x;
        }
      }
      return bestX;
    },
  };
}
