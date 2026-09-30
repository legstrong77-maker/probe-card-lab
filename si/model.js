// Signal & Power Integrity Lab — the numbers. Pure functions, no DOM, so they run in node too.
// First-order textbook models; every formula and constant is listed with its public source in sources.js.

/* ============================================================
   SIGNAL: one lane through a thick test board
   tester pad (bottom) -> via 1 -> stripline -> via 2 -> socket (top)
   ============================================================ */
export const C0 = 11.8;                    // speed of light, inch per ns
export const MM = 1 / 25.4;                // inch per mm
export const T_CU = 0.7;                   // mil, half-ounce copper
export const VIA_DK = 1.69;                // a via "sees" a higher Dk than the laminate's datasheet value (6.16 vs 3.65 in the cited measurement)
export const RESIDUAL = 0.15;              // mm of stub left after back-drilling
export const MATERIALS = [
  { id: 'fr4', name: 'FR-4', note: 'Isola 370HR', Dk: 3.92, Df: 0.025 },
  { id: 'n13', name: 'N4000-13 SI', note: 'low loss', Dk: 3.2, Df: 0.008 },
  { id: 'm6', name: 'Megtron 6', note: 'very low loss', Dk: 3.62, Df: 0.0046 },
  { id: 'itera', name: 'I-Tera MT40', note: 'very low loss', Dk: 3.45, Df: 0.0031 },
  { id: 'm7', name: 'Megtron 7', note: 'ultra low loss', Dk: 3.31, Df: 0.0023 },
  { id: 'tach', name: 'Tachyon 100G', note: 'ultra low loss', Dk: 3.02, Df: 0.0021 },
];
// budget: end-to-end insertion loss the standard allows at Nyquist, with equalisation
export const RATES = [
  { id: 'g3', name: 'PCIe 3.0', sub: '8 Gb/s NRZ', gbps: 8, pam4: false, budget: 22 },
  { id: 'g4', name: 'PCIe 4.0', sub: '16 Gb/s NRZ', gbps: 16, pam4: false, budget: 28 },
  { id: 'g5', name: 'PCIe 5.0', sub: '32 Gb/s NRZ', gbps: 32, pam4: false, budget: 36 },
  { id: 'g6', name: 'PCIe 6.0', sub: '64 Gb/s PAM4', gbps: 64, pam4: true, budget: 32 },
  { id: 'c112', name: '112G', sub: '112 Gb/s PAM4', gbps: 112, pam4: true, budget: 28 },
];
export const baudOf = (r) => (r.pam4 ? r.gbps / 2 : r.gbps);          // GBd
export const nyquistOf = (r) => baudOf(r) / 2;                          // GHz
export const NO_EQ_LIMIT = 10;                                          // dB at Nyquist an NRZ link survives with no equalisation

/** Stub lengths in mm for a lane that runs on a layer `depth` (0 = top, 1 = bottom) of a board `th` mm thick. */
export function stubs(S) {
  const s1 = S.depth * S.th, s2 = (1 - S.depth) * S.th;                 // via 1 keeps going up past the layer; via 2 keeps going down
  return [S.drill1 ? Math.min(s1, RESIDUAL) : s1, S.drill2 ? Math.min(s2, RESIDUAL) : s2];
}
/** Quarter-wave resonance of an open stub, GHz. */
export function stubF0(mm, Dk) { return mm <= 0 ? Infinity : C0 / (4 * mm * MM * Math.sqrt(Dk * VIA_DK)); }
/** dB per inch of stripline at f GHz: [conductor, dielectric]. */
export function lossPerInch(f, M, wMil, rough) {
  return [31.6 * Math.sqrt(f) / (100 * (wMil + T_CU)) * (rough ? 2 : 1), 2.32 * Math.sqrt(M.Dk) * M.Df * f];
}
const NP = 1 / 8.686;                                                  // nepers per dB
/** Complex transfer function of the lane at f GHz -> [re, im]. Bulk delay is left out. */
export function channel(f, S) {
  if (f <= 0) return [1, 0];
  const M = S.mat, len = S.len / 2.54;                                  // cm -> inch
  const [ac, ad] = lossPerInch(f, M, S.w, S.rough), Ac = ac * len * NP, Ad = ad * len * NP;
  // skin effect: attenuation and phase shift are equal; dielectric: causal phase follows the log of frequency
  let mag = Math.exp(-Ac - Ad), ph = -Ac + (2 / Math.PI) * Ad * Math.log(f / 1);
  let re = mag * Math.cos(ph), im = mag * Math.sin(ph);
  for (const mm of stubs(S)) {                                          // each stub is an open line hanging on the through path
    if (mm <= 0) continue;
    const th = 2 * Math.PI * f * mm * MM * Math.sqrt(M.Dk * VIA_DK) / C0;
    // tan of a slightly lossy line (complex angle th·(1 − j·0.03)) so the notch has a finite depth
    const a = th, b = -0.03 * th, c2 = Math.cos(2 * a) + Math.cosh(2 * b), tr = Math.sin(2 * a) / c2, ti = Math.sinh(2 * b) / c2;
    // H = 1 / (1 + j·tan/2)
    const dr = 1 - ti / 2, di = tr / 2, den = dr * dr + di * di, hr = dr / den, hi = -di / den;
    [re, im] = [re * hr - im * hi, re * hi + im * hr];
  }
  if (S.eq) {                                                           // receiver CTLE: one zero, one pole, boost capped at 12 dB
    const fn = S.nyq, boost = Math.min(12, Math.max(0, -20 * Math.log10(Math.max(1e-6, mag)) * (fn > 0 ? 1 : 0)));
    const fp = 1.3 * fn, fz = fp / Math.pow(10, (S.eqBoost ?? boost) / 20);
    const nr = 1, ni = f / fz, pr = 1, pi = f / fp, d2 = pr * pr + pi * pi, er = (nr * pr + ni * pi) / d2, ei = (ni * pr - nr * pi) / d2;
    [re, im] = [re * er - im * ei, re * ei + im * er];
  }
  return [re, im];
}
export const lossDb = (f, S) => { const [r, i] = channel(f, S); return -20 * Math.log10(Math.max(1e-9, Math.hypot(r, i))); };

/* ---------- FFT (radix 2, in place) ---------- */
export function fft(re, im, inverse = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        [cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

/* ---------- eye diagram ---------- */
export const SPU = 32, NSYM = 128, NS = SPU * NSYM;                     // samples per unit interval, symbols, samples
function symbols(pam4) {                                                // PRBS7, repeated as needed
  let s = 0x5a; const bit = () => { const b = ((s >> 6) ^ (s >> 5)) & 1; s = ((s << 1) | b) & 0x7f; return b; };
  const out = new Float32Array(NSYM);
  for (let i = 0; i < NSYM; i++) out[i] = pam4 ? [-1, -1 / 3, 1, 1 / 3][bit() * 2 + bit()] : bit() * 2 - 1;
  return out;
}
/** Send a pseudo-random pattern through the lane. Returns the received waveform (±1 = full swing) and what the eye looks like. */
export function eye(S, rate) {
  const baud = baudOf(rate), sym = symbols(rate.pam4), re = new Float64Array(NS), im = new Float64Array(NS);
  for (let i = 0; i < NS; i++) re[i] = sym[(i / SPU) | 0];
  fft(re, im);
  const df = baud / NSYM, Sx = { ...S, nyq: baud / 2 };                 // bin spacing in GHz
  if (S.eq) Sx.eqBoost = Math.min(12, lossDb(baud / 2, { ...S, eq: false }));
  for (let k = 0; k <= NS / 2; k++) {
    const f = k * df, g = Math.exp(-0.5 * Math.pow(f / (0.9 * baud), 2) * Math.LN2 * 2);      // transmitter edge rate: Gaussian, −3 dB at 0.9 × baud
    let [hr, hi] = channel(f, Sx); hr *= g; hi *= g;
    const a = re[k], b = im[k]; re[k] = a * hr - b * hi; im[k] = a * hi + b * hr;
    if (k > 0 && k < NS / 2) { const m = NS - k, c = re[m], d = im[m]; re[m] = c * hr + d * hi; im[m] = -c * hi + d * hr; }   // conjugate for negative frequencies
  }
  fft(re, im, true);
  // decide where to sample: try every offset over a few unit intervals (the lane adds a little delay of its own)
  const levels = rate.pam4 ? [-1, -1 / 3, 1 / 3, 1] : [-1, 1], nl = levels.length;
  const lvl = Array.from(sym, (v) => levels.findIndex((x) => Math.abs(x - v) < 1e-6));
  const opening = (off) => {                                            // smallest gap between neighbouring levels when sampling `off` samples late
    const lo = new Array(nl).fill(9), hi = new Array(nl).fill(-9);
    for (let n = 0; n < NSYM; n++) { const v = re[((n * SPU + off) % NS + NS) % NS], L = lvl[n]; if (v < lo[L]) lo[L] = v; if (v > hi[L]) hi[L] = v; }
    let open = 9; for (let i = 0; i < nl - 1; i++) open = Math.min(open, lo[i + 1] - hi[i]);
    return open;
  };
  let best = -9, at = SPU / 2;
  for (let off = -3 * SPU; off < 4 * SPU; off++) { const o = opening(off); if (o > best) { best = o; at = off; } }
  let a = at, b = at;                                                   // how far the sampling point can move before the eye shuts
  if (best > 0) { while (at - a < SPU && opening(a - 1) > 0) a--; while (b - at < SPU && opening(b + 1) > 0) b++; }
  return { wave: re, at, height: Math.max(0, best) / 2, width: best > 0 ? Math.min(1, (b - a + 1) / SPU) : 0, ui: 1000 / baud, levels };   // height as a fraction of the full swing; ui in ps
}

/* ============================================================
   POWER: one supply rail from the tester to the die
   supply -> planes -> [bulk | mid | high-frequency capacitors] -> vias and socket pins -> die
   ============================================================ */
export const CAPS = {
  bulk: { zh: '大電容', en: 'Bulk', C: 470e-6, R: 25e-3, L: 2.5e-9, note: '470 μF' },       // L includes the mounting
  mid: { zh: '中電容', en: 'Mid', C: 47e-6, R: 10e-3, L: 1.6e-9, note: '47 μF' },
  hf: { zh: '高頻電容', en: 'HF', C: 0.47e-6, R: 10e-3, L: 1.0e-9, note: '0.47 μF' },
};
export const SHEET = 0.25e-3;              // ohm per square, 2 oz copper
export const PLANE_C = 225e-12 * 100;      // F per plane pair: 225 pF/in² × 100 in²
export const PIN_L = 4e-9, PIN_R = 30e-3;  // one power/ground pair of via + socket pin: loop inductance and resistance
export const LOOP_HZ = 100e3;              // up to about this frequency, remote sense hides the resistance of the path
export const TRANSIENT = 0.5;              // share of the maximum current that steps at once (the usual rule of thumb)
export const stepOf = (P) => P.imax * TRANSIENT;
export const zTarget = (P) => P.vdd * P.ripple / 100 / stepOf(P);
/** Lumped values of the rail for the current settings. */
export function rail(P) {
  const ch = Math.max(1, Math.ceil(P.imax / 20));                        // supply channels ganged for the current
  const g = (k, n) => (n > 0 ? { C: CAPS[k].C * n, R: CAPS[k].R / n, L: CAPS[k].L / n } : { C: 1e-12, R: 1e3, L: 1e-9 });
  const Rplane = 2 * SHEET * 2 / P.planes;                               // there and back, two squares long
  const r = {
    Rv: 2e-3 / ch + Rplane, Lv: 10e-9 / ch + 130e-12 * 2 / P.planes, Rplane,
    b: g('bulk', P.bulk), m: g('mid', P.mid), h: g('hf', P.hf),
    Cpl: PLANE_C * P.planes,
    Rd: PIN_R / P.pins, Ld: PIN_L / P.pins,
    Cdie: 1e-6 * P.imax, Rdie: 0.01 / P.imax,                          // capacitance inside the package and on the die: 1 μF per ampere (illustrative)
    sense: P.sense,                                                      // 0 none, 1 at the board, 2 at the device
  };
  // Remote sense makes the supply push harder until the sensed point is back on target. Seen from the load this is as if
  // the resistance up to the sense point were bridged by an inductor: invisible at DC, back in full above the loop bandwidth.
  const BIG = 1e3;
  r.La = P.sense >= 1 ? r.Rv / (2 * Math.PI * LOOP_HZ) : BIG; r.Lb = P.sense >= 2 ? r.Rd / (2 * Math.PI * LOOP_HZ) : BIG;
  return r;
}
// state: 0 iv · 1 ib · 2 im · 3 ih · 4 id · 5 vcb · 6 vcm · 7 vch · 8 vpl · 9 vcdie · 10 ia · 11 ib2      E·dx/dt = A·x + B·iload
const NX = 12;
function system(r) {
  const E = new Float64Array(NX), A = Array.from({ length: NX }, () => new Float64Array(NX)), B = new Float64Array(NX);
  E[0] = r.Lv; A[0][0] = -r.Rv; A[0][10] = r.Rv; A[0][8] = -1;                               // supply path: L in series with (R bridged by La)
  E[10] = r.La; A[10][0] = r.Rv; A[10][10] = -r.Rv;
  [['b', 1, 5], ['m', 2, 6], ['h', 3, 7]].forEach(([k, i, v]) => { E[i] = r[k].L; A[i][v] = 1; A[i][i] = -r[k].R; A[i][8] = -1; E[v] = r[k].C; A[v][i] = -1; });
  E[4] = r.Ld; A[4][8] = 1; A[4][4] = -(r.Rd + r.Rdie); A[4][11] = r.Rd; A[4][9] = -1; B[4] = r.Rdie;   // pins: L in series with (R bridged by Lb); v_die = vcdie + Rdie·(id − iload)
  E[11] = r.Lb; A[11][4] = r.Rd; A[11][11] = -r.Rd;
  E[8] = r.Cpl; A[8][0] = 1; A[8][1] = 1; A[8][2] = 1; A[8][3] = 1; A[8][4] = -1;
  E[9] = r.Cdie; A[9][4] = 1; B[9] = -1;
  return { E, A, B };
}
function solveReal(M, y) {                                              // Gaussian elimination with pivoting, in place
  const n = y.length;
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]]; [y[c], y[p]] = [y[p], y[c]];
    for (let r = c + 1; r < n; r++) { const f = M[r][c] / M[c][c]; if (!f) continue; for (let k = c; k < n; k++) M[r][k] -= f * M[c][k]; y[r] -= f * y[c]; }
  }
  for (let c = n - 1; c >= 0; c--) { for (let k = c + 1; k < n; k++) y[c] -= M[c][k] * y[k]; y[c] /= M[c][c]; }
  return y;
}
/** Voltage at the die after the load steps up by half of P.imax (rise time P.rise seconds). Log-spaced samples: [{t, v}], v is the change in volts. */
export function droop(P, t0 = 1e-10, t1 = 1e-2, n = 420) {
  const r = rail(P), { E, A, B } = system(r), x = new Float64Array(NX), out = [];
  const step = stepOf(P), load = (t) => step * Math.min(1, t / P.rise);
  let t = 0;
  for (let s = 0; s < n; s++) {
    const tn = t0 * Math.pow(t1 / t0, s / (n - 1)), dt = tn - t, il = load(tn);
    const M = A.map((row, i) => { const m = new Float64Array(NX); for (let j = 0; j < NX; j++) m[j] = -row[j]; m[i] += E[i] / dt; return m; });
    const y = new Float64Array(NX); for (let i = 0; i < NX; i++) y[i] = E[i] / dt * x[i] + B[i] * il;
    solveReal(M, y); x.set(y); t = tn;
    out.push({ t, v: x[9] + r.Rdie * (x[4] - il), iv: x[0], ib: x[1], im: x[2], ih: x[3], id: x[4], il });
  }
  return out;
}
/** |Z| in ohms seen by the die at frequency f Hz. */
export function zAt(P, f, sys = null) {
  const r = rail(P), { E, A, B } = sys || system(r), w = 2 * Math.PI * f, n = NX;
  // (jwE − A) X = B   -> real 2n × 2n system
  const M = Array.from({ length: 2 * n }, () => new Float64Array(2 * n)), y = new Float64Array(2 * n);
  for (let i = 0; i < n; i++) { for (let j = 0; j < n; j++) { M[i][j] = -A[i][j]; M[n + i][n + j] = -A[i][j]; } M[i][n + i] = -w * E[i]; M[n + i][i] = w * E[i]; y[i] = B[i]; }
  solveReal(M, y);
  const vr = y[9] + r.Rdie * (y[4] - 1), vi = y[n + 9] + r.Rdie * y[n + 4];
  return Math.hypot(vr, vi);
}
export function zCurve(P, f0 = 1e3, f1 = 1e9, n = 180) { const out = []; for (let i = 0; i < n; i++) { const f = f0 * Math.pow(f1 / f0, i / (n - 1)); out.push({ f, z: zAt(P, f) }); } return out; }
/** Steady drop across the path (what remote sense has to make up), and the heat it leaves in the board. */
export function dc(P) { const r = rail(P), R = r.Rv + r.Rd, Rb = r.Rplane + r.Rd; return { R, Rb, drop: R * P.imax, watts: Rb * P.imax * P.imax }; }   // watts: heat left in the board (planes and pins)
