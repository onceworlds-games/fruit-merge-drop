# Fruit Merge Drop

## The hook
Drop fruit into a glass jar, merge matching pairs into the next fruit up an 11-step ladder (Blueberry, Lime, Kiwi, Plum,
Lemon, Peach, Orange, Mango, Coconut, Papaya, Jackfruit), keep the pile under the line.

## What it resembles, and what makes it its own
It belongs to the drop-and-merge physics puzzle family. Everything players see is its own: a market-stall world, a claw on a
rail that holds and releases the fruit, fruit drawn in code with their own cut faces and stems, an 11-step ladder with its
own order and sizes, its own scoring (a merge into tier k scores k(k+1), chains multiply), a jar that is narrower than the
fruit ladder is tall, and a Jackfruit pair that bursts for a bonus instead of ending the ladder.

## The first minute
The title is the jar playing itself (a claw drops fruit that merge) under a stacked logo, with one big Play button. Play
hands over a claw holding a fruit with a dashed guide to where it will land and a two-word hint ("Click to drop" or "Drag,
then let go"), shown until the first drop. The first three drops are always the two smallest fruit so the first merge
happens quickly.

## Art direction: a sunlit fruit stall
A glass jar on a wooden counter under a red-and-cream striped awning, in front of a softly blurred teal street with string
lights. HUD pieces are painted enamel signs and wooden crates with hard offset shadows (the same sticker-like language as
the buttons and cards). Signature element: the brass claw on its rail, and the ladder of fruit painted on the counter's front
board (made fruit lit, the rest dark silhouettes, the highest ringed).

Palette: awning red `#d63a2c`, cream `#f7ead0`, ink brown `#2a1812`, brass `#e6b84a`, lime `#c6e04a`, counter wood
`#c4854a`, street teal `#2f7078`. Danger red `#ff4a3a`.
Type: Rubik 800/900 (Google Fonts) for everything; numerals included.

## Rules (numbers in `game/config.js`)
- Jar 260 wide, 340 deep, rounded bottom. Radii grow x1.22 a tier from 8.2 (a Jackfruit is 46% of the jar's width; the jar is
  narrower than the spec's 40% suggested so the fruit read big on a phone and the pile fills in a believable time).
- Drops: the five smallest tiers, weighted 36/28/20/10/6. The next fruit and the one after ("then") are shown, the second smaller.
- Drop cooldown 0.45 s (the claw is empty and closes, then the next fruit grows in). A drop asked for in the last 0.2 s goes as soon as it is ready.
- Merge: two touching fruit of the same tier become the next tier at their midpoint; each fruit is in at most one merge per frame (three touching merge as one pair); a new fruit can't merge again for 0.14 s so chains read as steps; a push on neighbours scaled by tier.
- Score: tier k merge = k(k+1) x chain multiplier (chain of n merges, each within 0.9 s of the last: x1, x1.5, x2, then n-1 up to x6). The "COMBO xN" callout shows the chain length N and the points multiplier below it. Two Jackfruits burst: +500, a large shove, slow motion.
- Lose: a settled fruit (not a fresh one still falling or moving faster than 90 px/s) with its top above the danger line for 2.5 s. The countdown drains at twice the rate it fills. The line appears when the pile is within 90 units of it, pulses and counts down when active, with a rising tone.
- Game over: the fruit pop one by one, then the card (score, best, biggest fruit, merges, longest chain, Retry).
- Saves: an unfinished jar (every fruit's tier, position and angle, score, held/next/then, seeded RNG state) in `ow.save('jar')`, stats and badge flags in `ow.save('stats')`. Leaderboard `high-score`.

## Physics (`game/physics.js`, pure, deterministic)
Circles in a box with rounded bottom corners. 8 substeps per 60 Hz frame; each substep: gravity, contact gathering (with a
speculative margin), sequential-impulse velocity solve (6 iterations, warm-started from the previous substep's impulses),
Coulomb friction that also spins the fruit, restitution 0.15 only above 140 px/s closing speed, position integration, then 5
rounds of position projection that never adds velocity. Touching groups sleep together after 0.4 s at rest and wake together
when something fast reaches them or a neighbour is removed. Speed is capped at 1500 px/s (under 3.2 px per substep, smaller than
any fruit). Contacts are solved lowest-first for stack stability.

## Controls
Mouse: move to aim, click to drop. Touch: drag anywhere, let go to drop. Keys: Left/Right or A/D move the claw, Space/Down/Enter
drop, P/Esc pause. Pause card: Resume, Restart (with a confirm). Pausing when the page is hidden or the platform menu opens.

## Layout
Portrait (primary): awning, a row with NEXT, the score sign, THEN, the jar, the ladder on the counter's front board.
Landscape and desktop: the jar centred; score sign and the ladder grid on the left; NEXT and THEN on the right. Nothing readable sits
under the platform menu's corner.

## Decisions
- The score thresholds in the spec (3,000 and 8,000) are reachable by ordinary play; the ladder is generous (merging two fruit
  shrinks the pile), so a good run is long. Difficulty comes from the narrow jar and the 2.5 s line.
- A fruit counts as "made" for the ladder when it is dropped or merged into.
- Posters and the review scenes (`?poster=title|play|late|combo|danger|over|sheet`, `m-<scene>` and `l-<scene>` at phone sizes) live in `game/poster.js`.
