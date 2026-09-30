// Final Test Board Lab — the numbers. Pure functions, no DOM.
// Every value sits inside a published range listed in sources.js; they are illustrative, not product specs.

/* ---------- spring probe (pogo pin) in the socket ---------- */
// A preloaded coil spring: force rises linearly with travel until the plunger bottoms out.
export const PIN = {
  pre: 8,            // gf at first touch (preload)
  rate: 49,          // gf per mm of travel  -> about 30 gf at 0.45 mm
  rec: [0.35, 0.50], // working travel, mm
  max: 0.57,         // full travel, mm: beyond this the plunger is solid against the barrel
  R0: 60, A: 2500, F0: 6,   // contact resistance model, mΩ: R0 + A·exp(−F/F0) + dirt
};
export const WARP_LIMIT = 0.15;   // mm: JEDEC's maximum non-coplanarity for BGA packages
export const BALLS = 100;          // balls on the drawn package (10 × 10)
export const REAL_BALLS = 1000;    // a mid-size real BGA, used only in the footnote arithmetic
export function force(s) { return s <= 0 ? 0 : s <= PIN.max ? PIN.pre + PIN.rate * s : PIN.pre + PIN.rate * PIN.max + (s - PIN.max) * 2500; }
export function cres(s, dirt = 0) { if (s <= 0) return Infinity; return PIN.R0 + PIN.A * Math.exp(-force(Math.min(s, PIN.max)) / PIN.F0) + dirt; }

/* ---------- yield ---------- */
export const DEFECT = 0.04;                        // share of devices that are really bad
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Chance that a good device fails because its worst contact is too resistive. */
export function falseFail(R) { return !isFinite(R) ? 1 : 0.9 * sstep(400, 1400, R); }
export const DIRT_PER_INS = 0.55;                  // mΩ added per insertion as solder builds up on the crown (far faster than real life, where sockets are cleaned every 10,000–50,000 insertions)
export const CLEAN_DUE = 600;                      // insertions after which the page nags you to clean

/* ---------- handler timing ---------- */
// One arm does everything here; a real handler overlaps these moves with shuttles and several arms.
export const MOVE = { pick: 0.10, place: 0.22, plunge: 0.10, sort: 0.58 };      // shares of the index time
export const SORT = { lift: 0.14, out: 0.48, drop: 0.66 };                      // break points inside SORT
export const MSE = 0.9;                            // multisite efficiency (90–95 % is typical for SoC devices): each extra site adds 10 % of the single-site test time
export const HANDLER_UPH = 9000;                   // the handler's own ceiling, units per hour (9,000 standard; 16,000–18,500 on faster models)
export function testTimeN(test, n) { return test * (1 + (n - 1) * (1 - MSE)); }
export function cycleT(S, n = S.n) { return Math.max(testTimeN(S.test, n) + S.idx, 3600 * n / HANDLER_UPH); }
export function uphOf(S, n = S.n) { return 3600 * n / cycleT(S, n); }
export function phaseEdges(S) {
  const T = cycleT(S), I = S.idx, tt = T - I; let a = 0;
  return [0, a += MOVE.pick * I / T, a += MOVE.place * I / T, a += MOVE.plunge * I / T, a += tt / T, 1];
}
// sliders are logarithmic
export const testFromSlider = (v) => 0.5 * Math.pow(240, v / 100);              // 0.5 s … 120 s
export const sliderFromTest = (t) => Math.round(100 * Math.log(t / 0.5) / Math.log(240));
export const idxFromSlider = (v) => 0.2 * Math.pow(15, v / 100);                // 0.2 s … 3 s
export const sliderFromIdx = (t) => Math.round(100 * Math.log(t / 0.2) / Math.log(15));

export function hash(i) { let x = Math.imul(i ^ 0x9e3779b9, 2654435761) >>> 0; x ^= x >>> 16; x = Math.imul(x, 0x45d9f3b) >>> 0; x ^= x >>> 16; return (x >>> 0) / 4294967296; }
