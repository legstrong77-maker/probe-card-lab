// MLO Lab — the numbers. Pure functions, no DOM, so they run in node too (node mlo/check.mjs).
// First-order textbook models; every constant and formula is listed with its public source in sources.js.

/* ============================================================
   Materials: in-plane modulus (GPa) and CTE (ppm/K)
   ============================================================ */
// The two organic material sets are the conventional and low-CTE sets FICT published for probe-card substrates.
export const MAT = {
  cu: { name: '銅 Copper', E: 130, a: 16.5 },
  buStd: { name: '增層膜（一般）', E: 5, a: 39 },
  buLow: { name: '增層膜（低膨脹）', E: 13, a: 20 },
  coreStd: { name: '核心板（一般）', E: 26.5, a: 14 },
  coreLow: { name: '核心板（低膨脹）', E: 34, a: 6 },
  si: { name: '矽 Silicon', E: 130, a: 2.6 },
  mlc: { name: '低膨脹陶瓷 LTCC', E: 128, a: 3.4 },
};
export const T_FREE = 180;                 // °C: build-up film is laminated at 160–180 °C and cured at 180–190 °C, so the stack is stress-free near here
export const T_ROOM = 25;

/* ============================================================
   Stack-up: N build-up layers per side around a core
   Each build-up layer = one dielectric film + one copper layer.
   ============================================================ */
export const DIM = { core: 1400, film: 30, cu: 15, cuCore: 18 };   // μm; 30 μm film and a 1.4 mm core as in published 80 μm-pitch probe-card substrates
/** Layers from the bottom (z = 0) up. `fill` is the share of each copper layer that is metal. */
export function stack(P) {
  const L = [], add = (m, t, f = 1) => L.push({ m, t, f });
  const sigF = 0.35, planeF = 0.85;
  const cuF = (side, j) => {                                         // j counts from the outer surface: even = signal layer, odd = plane
    const base = j % 2 === 0 ? sigF : planeF;
    return Math.min(0.98, Math.max(0.05, base + (side > 0 ? P.balance / 100 : -P.balance / 100) * 0.5));
  };
  const bu = P.core === 'low' ? 'buLow' : 'buStd', core = P.core === 'low' ? 'coreLow' : 'coreStd';
  for (let j = 0; j < P.nBot; j++) { add('cu', DIM.cu, cuF(-1, j)); add(bu, DIM.film); }
  add('cu', DIM.cuCore, 0.7); add(core, DIM.core); add('cu', DIM.cuCore, 0.7);
  for (let j = P.nTop - 1; j >= 0; j--) { add(bu, DIM.film); add('cu', DIM.cu, cuF(1, j)); }
  return L;
}
/** A patterned copper layer behaves like a mix of copper and the resin that fills the gaps. */
function props(layer, P) {
  if (layer.m !== 'cu') return MAT[layer.m];
  const f = layer.f, c = MAT.cu, d = MAT[P.core === 'low' ? 'buLow' : 'buStd'], E = f * c.E + (1 - f) * d.E;
  return { E, a: (f * c.E * c.a + (1 - f) * d.E * d.a) / E };
}
/**
 * Classical lamination theory for a strip: free thermal strain and curvature for a temperature change dT.
 * Returns { eps (ppm, mid-plane expansion), kappa (1/m), aEff (ppm/K), thick (μm) }.
 */
export function laminate(P, dT) {
  if (P.tech === 'mlc') return { eps: MAT.mlc.a * dT, kappa: 0, aEff: MAT.mlc.a, thick: 3000 };
  const L = stack(P); let z = 0, A = 0, B = 0, D = 0, N = 0, M = 0;
  const tot = L.reduce((s, l) => s + l.t, 0) * 1e-6, z0 = tot / 2;
  for (const l of L) {
    const p = props(l, P), t = l.t * 1e-6, za = z - z0, zb = za + t, E = p.E * 1e9, a = p.a * 1e-6;
    A += E * t; B += E * (zb * zb - za * za) / 2; D += E * (zb ** 3 - za ** 3) / 3;
    N += E * a * dT * t; M += E * a * dT * (zb * zb - za * za) / 2; z += t;
  }
  const det = A * D - B * B, eps = (D * N - B * M) / det, kappa = (A * M - B * N) / det;
  return { eps: eps * 1e6, kappa, aEff: dT ? eps * 1e6 / dT : (A ? N / A : 0), thick: tot * 1e6 };
}
/** In-plane CTE of the whole substrate (ppm/K). */
export const cteOf = (P) => laminate(P, 1).aEff;
/** Bow (μm, centre against edge) of a substrate `size` mm across at temperature T. Positive = cupped up. */
export function bowAt(P, T, size = P.size) { const { kappa } = laminate(P, T - T_FREE), L = size * 1e-3; return kappa * L * L / 8 * 1e6; }

/* ============================================================
   Thermal mismatch at the probing temperature
   ============================================================ */
/** How far the outermost probe pad moves away from where the wafer pad is (μm), when probing at T. */
export const TOL = 12.5;                   // μm: an X/Y limit published for probe marks at hot and cold
export function offsetAt(P, T) {
  const r = P.reach * 1e3;                                            // μm, centre to the farthest probe
  const tRef = P.comp ? P.tComp : T_ROOM;                            // the pattern is drawn to fit the wafer at this temperature
  return (cteOf(P) - MAT.si.a) * 1e-6 * (T - tRef) * r;
}

/* ============================================================
   Fan-out: how many layers it takes to route a dense pad array out
   ============================================================ */
/** Traces that fit between two neighbouring pads. */
export function channels(P) { const gap = P.pitch - P.pad; return Math.max(0, Math.floor((gap - P.space) / (P.line + P.space))); }
/** Signal layers needed to escape `rows` rows of an area array: each layer takes the outer row plus one row per channel trace. */
export function escape(P) {
  const n = channels(P), perLayer = n + 1;
  return { n, perLayer, signal: Math.ceil(P.rows / perLayer) };
}
/** Build-up layers per side: every signal layer gets a reference plane next to it; the other side mirrors it for balance. */
export function layersFor(P) { const e = escape(P); return Math.max(2, e.signal * 2); }
