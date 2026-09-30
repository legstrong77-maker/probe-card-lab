// Probe Card Lab — the game's physics and scoring. Pure functions, no DOM, so the same file
// runs in the browser and in `node game/tune.mjs` (which scans every recipe to balance levels).
// Numbers sit inside the published ranges listed in ../sources.js; they are illustrative, not product specs.

/* ---------------- wafer ---------------- */
export const N = 17, DIE = 0.8, WR = 6.4;                 // die grid, die size and wafer radius in world units
export const dieC = (i) => (i - (N - 1) / 2) * DIE;
export const valid = new Uint8Array(N * N);
for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
  let ok = 1;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) if (Math.hypot(dieC(i) + sx * DIE / 2, dieC(j) + sz * DIE / 2) > WR - 0.2) ok = 0;
  valid[j * N + i] = ok;
}
export const DIES = valid.reduce((a, b) => a + b, 0);
/** Touchdown sites in serpentine order; `per` dies per touchdown (1 or 4). */
export function sitesFor(per) {
  const step = per === 4 ? 2 : 1, out = [];
  for (let j = 0, row = 0; j < N; j += step, row++) {
    const r = [];
    for (let i = 0; i < N; i += step) {
      const dies = [];
      for (let dj = 0; dj < step; dj++) for (let di = 0; di < step; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < N && jj < N && valid[jj * N + ii]) dies.push(jj * N + ii);
      }
      if (dies.length) r.push({ cx: dieC(i) + (step - 1) * DIE / 2, cz: dieC(j) + (step - 1) * DIE / 2, dies });
    }
    if (row % 2) r.reverse();
    out.push(...r);
  }
  return out;
}

/* ---------------- probes ---------------- */
const tanh = Math.tanh;
export const CARDS = {
  // W/ReW cantilever: linear ~1.5 gf/mil, long scrub, one die per touchdown
  cant: { id: 'cant', zh: '懸臂針卡', en: 'Cantilever', note: '鎢錸針 · 針痕長 · 便宜', force: (od) => 0.06 * od, slide: (od) => 0.22 * od, contact: 6, limit: 125, crack: null, cresK: 1.6, per: 1, color: '#ff9f45' },
  // Cobra-type buckling beam: force levels off, mark is mostly the tip footprint
  cobra: { id: 'cobra', zh: 'Cobra 垂直針卡', en: 'Cobra vertical', note: '挫曲針 · 針痕短 · 每針約 4.5 g', force: (od) => 4.2 * tanh(od / 45) + 0.008 * od, slide: (od) => 0.05 * od, contact: 10, limit: 170, crack: [120, 165], cresK: 1.6, per: 4, color: '#b69cff' },
  // Cobra built for high pin counts (~5 g per probe)
  cobraHP: { id: 'cobraHP', zh: 'Cobra 垂直針卡', en: 'Cobra vertical', note: '每針約 5 g', force: (od) => 4.7 * tanh(od / 45) + 0.008 * od, slide: (od) => 0.05 * od, contact: 10, limit: 170, crack: [120, 165], cresK: 1.6, per: 4, color: '#b69cff' },
  // MEMS vertical: low force, short travel, sharp tip
  mems: { id: 'mems', zh: 'MEMS 垂直針卡', en: 'MEMS vertical', note: '低針壓 · 每針約 2 g · 行程短', force: (od) => 2.2 * tanh(od / 30) + 0.004 * od, slide: (od) => 0.04 * od, contact: 9, limit: 100, crack: [88, 100], cresK: 0.75, per: 4, color: '#5fe3c0' },
};
/** Contact resistance in mΩ for one probe at overdrive `od`, with `dirt` mΩ of debris on the tip. */
export function cres(card, od, dirt = 0) {
  if (od <= 0) return Infinity;
  const e = card.force(od) * (1 + card.slide(od) / 30);
  return 80 + 2500 * Math.exp(-e / card.cresK) + dirt;
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hash(i) { let x = Math.imul(i ^ 0x9e3779b9, 2654435761) >>> 0; x ^= x >>> 16; x = Math.imul(x, 0x45d9f3b) >>> 0; x ^= x >>> 16; return (x >>> 0) / 4294967296; }

/* ---------------- levels ---------------- */
// plan: tip planarity spread (μm) · flat: substrate out-of-flat (μm) · k: test-cell compliance (μm per kgf)
// contam: mΩ picked up per touchdown · stars: score needed for 1/2/3 stars
export const LEVELS = [
  {
    id: 'od', n: 1, zh: '第一次下針', en: 'First touchdown', cards: ['cant'], pad: 60, plan: 12, flat: 0, pins: 56, k: 0, loadLimit: 0,
    contam: 0.4, test: 1.5, wafers: 1, budget: 380, od: [0, 200, 15], clean: null, soak: null, thermal: null, stars: [60, 82, 94],
  },
  {
    id: 'pad', n: 2, zh: '鋁墊縮小了', en: 'Shrinking pads', cards: ['cant', 'cobra'], pad: 40, plan: 12, flat: 0, pins: 224, k: 0, loadLimit: 0,
    contam: 0.4, test: 1.5, wafers: 1, budget: 380, od: [0, 200, 75], clean: null, soak: null, thermal: null, stars: [60, 82, 95],
  },
  {
    id: 'clean', n: 3, zh: '針尖髒了', en: 'Dirty tips', cards: ['cobra'], pad: 60, plan: 10, flat: 0, pins: 224, k: 0, loadLimit: 0,
    contam: 9, test: 1.5, wafers: 4, budget: 480, od: [0, 200, 75], clean: [10, 200, 200], cleanT: 12, cleanCost: 0.6, soak: null, thermal: null, stars: [60, 84, 95],
  },
  {
    id: 'flat', n: 4, zh: '載板翹了', en: 'Warped substrate', cards: ['cobra'], pad: 60, plan: 10, flat: 50, pins: 224, k: 0, loadLimit: 0,
    contam: 0.4, test: 1.5, wafers: 1, budget: 150, od: [0, 200, 75], clean: null, soak: null, thermal: null, rework: { flat: 15, t: 60 }, stars: [60, 84, 95],
  },
  {
    id: 'pins', n: 5, zh: '十萬針', en: '100,000 pins', cards: ['cobraHP', 'mems'], pad: 60, plan: 15, flat: 0, pins: 100000, k: 1.0, loadLimit: 300,
    contam: 0.4, test: 1.5, wafers: 1, budget: 170, od: [0, 400, 75], clean: null, soak: null, thermal: null, stars: [60, 84, 95],
  },
  {
    id: 'hot', n: 6, zh: '高溫測試', en: 'Hot chuck', cards: ['cobra'], pad: 60, plan: 10, flat: 0, pins: 224, k: 0, loadLimit: 0,
    contam: 7, test: 1.5, wafers: 3, budget: 420, od: [0, 200, 110], clean: [10, 200, 200], cleanT: 15, cleanCost: 0.6,
    soak: [0, 180, 0], thermal: { drift: 60, tau: 60, cool: 120, crack: [80, 120] }, stars: [60, 84, 95],
  },
];
export const MOVE_T = 0.7;                       // seconds of motion per touchdown (typical prober index time)

/* ---------------- one run of a level ---------------- */
export function createRun(L, cardId, seed = 1) {
  const card = CARDS[cardId], sites = sitesFor(card.per);
  const truth = new Uint8Array(N * N);             // 1 = truly good die
  const total = sites.length * L.wafers;
  return {
    L, card, sites, seed, truth, total,
    td: 0, t: 0, wafer: 0, sinceClean: 0, cleans: 0, warm: L.thermal ? 0 : 1, flat: L.flat, reworked: false,
    res: new Uint8Array(N * N),                     // per die on the current wafer: 0 untested, 1 pass, 2 true fail, 3 false fail
    dmg: new Uint8Array(N * N),                     // 1 = pad damaged (scrub off pad or cracked)
    sum: { good: 0, shipped: 0, falseFail: 0, damaged: 0, trueFail: 0, opens: 0, breach: 0, crack: 0, alarms: 0, bent: false, stopped: false },
    hist: [],                                       // finished wafers: {res, dmg}
    log: { minOdLast: 1e9, maxOdFirst: 0, maxR: 0, maxLoad: 0, coldTd: 0 },
    done: false,
  };
}
function truthFor(run, d) {
  const i = d % N, j = (d / N) | 0, r = Math.hypot(dieC(i), dieC(j)) / WR;
  return hash(d * 131 + run.wafer * 7919 + run.seed * 104729) >= 0.03 + 0.2 * Math.pow(r, 6);
}
/** Actual overtravel once the card and test cell give under the total probe force. */
export function solveAot(L, card, pot, planTot) {
  if (!L.k) return pot;
  const mean = (x) => { let s = 0; for (let u = 0; u <= 4; u++) { const od = x - planTot * u / 4; s += od > 0 ? card.force(od) : 0; } return s / 5; };
  let lo = 0, hi = pot;
  for (let i = 0; i < 30; i++) { const x = (lo + hi) / 2; (x + L.k * L.pins * mean(x) / 1000 > pot) ? hi = x : lo = x; }
  return (lo + hi) / 2;
}
/** Everything about the contact at the current state, without touching any die. */
export function contact(run, rec, jitter = 0) {
  const { L, card } = run;
  const drift = L.thermal ? L.thermal.drift * (1 - run.warm) : 0;       // a cold card sits further from the wafer
  const planTot = L.plan + run.flat;
  const aot = Math.max(0, solveAot(L, card, Math.max(0, rec.od - drift), planTot));
  const odFirst = aot, odLast = aot - planTot;
  let fs = 0; for (let u = 0; u <= 4; u++) { const od = aot - planTot * u / 4; fs += od > 0 ? card.force(od) : 0; }
  const load = L.pins * (fs / 5) / 1000;                                  // kgf on the chuck
  const dirt = L.contam * run.sinceClean;
  const start = L.pad / 2 - card.contact / 2 - 1 + jitter;                // where the tip lands on the pad (μm from the left edge)
  const markFirst = odFirst > 0 ? card.slide(odFirst) + card.contact : 0;
  const markLast = odLast > 0 ? card.slide(odLast) + card.contact : 0;
  const crackBand = (L.thermal && L.thermal.crack) || card.crack;
  return {
    pot: rec.od, drift, aot, odFirst, odLast, load, dirt, start, markFirst, markLast,
    fFirst: odFirst > 0 ? card.force(odFirst) : 0, fLast: odLast > 0 ? card.force(odLast) : 0,
    rFirst: cres(card, odFirst, dirt), rLast: cres(card, odLast, dirt),
    breach: odFirst > 0 && start + markFirst > L.pad,
    crackP: crackBand ? 0.6 * sstep(crackBand[0], crackBand[1], odFirst) : 0,
    bend: odFirst >= card.limit,
    overload: L.loadLimit > 0 && load > L.loadLimit,
  };
}
function heat(run, dt, away) {
  const th = run.L.thermal; if (!th) return;
  run.warm = away ? run.warm * Math.exp(-dt / th.cool) : 1 - (1 - run.warm) * Math.exp(-dt / th.tau);
}
/** Pre-heat the card against the hot chuck (level 6). */
export function soak(run, seconds) { heat(run, seconds, false); run.t += seconds; }
/** Send the substrate back for flattening (level 4). */
export function rework(run) { const r = run.L.rework; if (!r || run.reworked) return; run.reworked = true; run.flat = r.flat; run.t += r.t; }
/** A test touch on a scrap die: costs a little time, tells you what the contact looks like. */
export function testTouch(run, rec) { const c = contact(run, rec); run.t += 6; heat(run, 6, false); return c; }

/** One touchdown (plus a cleaning first, if it is due). Returns what happened. */
export function step(run, rec) {
  const { L, card, sum } = run, ev = [];
  if (run.done) return null;
  if (L.clean && rec.clean && run.sinceClean >= rec.clean) {
    run.sinceClean = 0; run.cleans++; run.t += L.cleanT; heat(run, L.cleanT, true); ev.push('clean');
  }
  const site = run.sites[run.td % run.sites.length];
  const jit = (hash(run.td * 977 + run.seed * 31 + 5) - 0.5) * 8;         // ±4 μm probe-to-pad alignment error
  const c = contact(run, rec, jit);
  const out = { td: run.td, site, c, ev, dies: [] };
  run.log.minOdLast = Math.min(run.log.minOdLast, c.odLast); run.log.maxOdFirst = Math.max(run.log.maxOdFirst, c.odFirst);
  run.log.maxLoad = Math.max(run.log.maxLoad, c.load);
  if (isFinite(c.rLast)) run.log.maxR = Math.max(run.log.maxR, c.rLast);
  if (L.thermal && run.warm < 0.6) run.log.coldTd++;
  if (c.overload) {                                                       // prober refuses the move
    sum.alarms++; ev.push('alarm'); run.t += MOVE_T;
    if (sum.alarms >= 3) { sum.stopped = true; run.done = true; ev.push('stop'); }
    return out;
  }
  if (c.bend) { sum.bent = true; run.done = true; ev.push('bend'); run.t += MOVE_T; return out; }
  for (const d of site.dies) {
    const good = truthFor(run, d);
    const r = hash(d * 71 + run.td * 13 + run.seed * 7 + run.wafer * 101);
    let res;
    if (!good) res = 2;
    else if (c.odLast <= 0) res = 3;
    else res = r < 0.9 * sstep(500, 1300, c.rLast * (0.92 + 0.16 * hash(d * 17 + run.td))) ? 3 : 1;
    let hurt = 0;
    if (c.breach) hurt = 1;
    else if (c.crackP > 0 && hash(d * 53 + run.td * 29 + run.seed) < c.crackP) hurt = 2;
    run.res[d] = res; run.dmg[d] = hurt;
    if (good) { sum.good++; if (res === 1 && !hurt) sum.shipped++; else if (res === 3) sum.falseFail++; } else sum.trueFail++;
    if (hurt && good) sum.damaged++;
    if (hurt === 1) sum.breach++; if (hurt === 2) sum.crack++;
    out.dies.push({ d, res, hurt });
  }
  if (c.odLast <= 0) { sum.opens++; ev.push('open'); }
  if (c.breach) ev.push('breach');
  if (out.dies.some((x) => x.hurt === 2)) ev.push('crack');
  run.sinceClean++; run.td++;
  const dt = MOVE_T + L.test; run.t += dt; heat(run, dt, false);
  if (run.td % run.sites.length === 0) {
    run.hist.push({ res: run.res.slice(), dmg: run.dmg.slice() }); ev.push('wafer');
    if (++run.wafer >= L.wafers) run.done = true; else { run.res.fill(0); run.dmg.fill(0); }
  }
  return out;
}

/** Score 0–100 and the reasons behind it. */
export function score(run) {
  const { L, sum } = run;
  const goodAll = DIES * L.wafers * 0.955;                               // expected good dies in the whole lot
  const base = 100 * sum.shipped / Math.max(1, (sum.bent || sum.stopped) ? goodAll : Math.max(sum.good, 1));
  const cleanPen = L.clean ? run.cleans * L.cleanCost : 0;
  const over = Math.max(0, run.t - L.budget), timePen = 40 * over / L.budget;
  const cardPen = sum.bent ? 15 : sum.stopped ? 8 : 0;
  const s = Math.max(0, Math.min(100, Math.round(base - cleanPen - timePen - cardPen)));
  const stars = s >= L.stars[2] ? 3 : s >= L.stars[1] ? 2 : s >= L.stars[0] ? 1 : 0;
  return { score: s, stars, base, cleanPen, timePen, cardPen, over, t: run.t };
}
