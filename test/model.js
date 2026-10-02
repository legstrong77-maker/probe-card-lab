// Test Lab — what each station measures, and which defect it can catch.
// Pure functions, no drawing; `node test/check.mjs` prints the numbers. Values are cited in sources.js.

export const STATIONS = [
  { id: 'aoi', zh: '光學檢查', en: 'AOI', short: 'AOI', tag: 'AOI' },
  { id: 'fp', zh: '飛針測試', en: 'Flying probe', short: '飛針', tag: 'ICT' },
  { id: 'net', zh: '網路測試', en: 'Net test', short: '網路', tag: 'NET' },
  { id: 'xray', zh: 'X 光檢查', en: 'X-ray', short: 'X 光', tag: 'X-RAY' },
  { id: 'met', zh: '平整度量測', en: 'Flatness', short: '平整度', tag: 'METRO' },
  { id: 'dd', zh: '上機診斷', en: 'On-tester diagnostics', short: '上機', tag: 'DIAG' },
];

// Each defect: where it is, and what happens if it reaches the customer.
export const DEFECTS = [
  { id: 'missingC', zh: '少一顆去耦電容', en: 'Missing decoupling cap', where: '主板・MLO 旁', esc: '電源雜訊變大，高速測項偶爾失敗，很難查' },
  { id: 'wrongR', zh: '電阻用錯值', en: 'Wrong resistor value', where: '主板・電阻網路', esc: '電壓位準偏掉，好的晶片被判成壞的' },
  { id: 'revDiode', zh: '二極體裝反', en: 'Diode reversed', where: '主板・繼電器旁', esc: '驅動一開就短路，那組繼電器不會動作' },
  { id: 'bridge', zh: '錫球橋接', en: 'Solder-ball bridge', where: 'MLO 底下', esc: '兩個通道短在一起，對應的測項全錯' },
  { id: 'void', zh: '錫球空洞', en: 'Voided solder ball', where: 'MLO 底下', esc: '一開始正常，熱循環幾次後焊點裂開斷線' },
  { id: 'hip', zh: '枕頭效應', en: 'Head-in-pillow', where: 'MLO 底下', esc: '時好時壞：溫度一變就接觸不良' },
  { id: 'viaOpen', zh: '電源路徑少了幾根導通孔', en: 'Opens in a power path', where: '主板・電源層', esc: '大電流時壓降和發熱變大，電源測項偏掉' },
  { id: 'leak', zh: '絕緣漏電', en: 'Leakage between nets', where: 'MLO 邊緣', esc: '漏電流測項誤判' },
  { id: 'warp', zh: 'MLO 翹曲', en: 'MLO warpage', where: 'MLO', esc: '探針接觸不均，有的壓不到、有的壓太深' },
  { id: 'relay', zh: '繼電器卡住', en: 'Stuck relay', where: '主板・繼電器', esc: '某些測試模式切不過去' },
  { id: 'pogo', zh: '測試機端接點污染', en: 'Contaminated tester pads', where: '主板背面', esc: '上機接觸電阻大、時好時壞' },
  { id: 'openNet', zh: '內層斷線', en: 'Open inner-layer trace', where: '主板內層', esc: '那個通道整個量不到' },
];
export const DEF = Object.fromEntries(DEFECTS.map((d) => [d.id, d]));

export const DEFAULTS = { aoiRes: 15, fpGuard: true, fpTol: 5, netMode: '4w', netV: 100, xrKV: 90, xrTilt: 0, xrFrames: 8, metN: 7, ddCfg: 'same' };

/* ---------- small helpers ---------- */
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (Math.imul(s ^ (s >>> 15), 2246822519) + 0x9e3779b9) >>> 0; s ^= s >>> 13; return (s >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
// standard normal tail, for false-call rates
function erfc(x) { const t = 1 / (1 + 0.5 * Math.abs(x)); const y = t * Math.exp(-x * x - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))); return x >= 0 ? y : 2 - y; }

/* ============================================================
   0 · AOI — a camera looks at every part from above
   ============================================================ */
export const AOI = {
  camPx: [2000, 2048],           // a 4-megapixel camera: 30 × 30.7 mm per shot at 15 μm/px
  boardArea: Math.PI * 220 * 220, // mm², a 440 mm probe-card PCB
  rate15: 15,                    // cm²/s inspected at 15 μm/px (published 3D AOI: 7–26 cm²/s); scales with pixel area
  diodeMark: 0.15,               // mm, the polarity mark on a small diode (illustrative)
  minPx: 4,                      // pixels a feature needs to be judged reliably (illustrative)
};
export function aoi(P, D) {
  const res = P.aoiRes, fov = AOI.camPx.map((n) => n * res / 1000), shots = Math.ceil(AOI.boardArea / (fov[0] * fov[1]) * 1.15);
  const markPx = AOI.diodeMark * 1000 / res;
  const r = {};
  r.missingC = { caught: true, val: '焊墊上沒有零件', note: '看得到少件：零件本體有幾十個像素' };
  r.revDiode = markPx >= AOI.minPx ? { caught: true, val: `極性標記 ${markPx.toFixed(0)} px`, note: '看得出極性標記在另一頭' } : { caught: false, val: `極性標記只有 ${markPx.toFixed(1)} px`, note: '解析度不夠，看不清極性標記' };
  r.wrongR = { caught: false, val: '外觀一樣', note: '小尺寸電阻多半沒有印字，看外觀分不出阻值' };
  for (const id of ['bridge', 'void', 'hip']) r[id] = { caught: false, val: '被 MLO 擋住', note: '錫球在 MLO 底下，相機看不到' };
  for (const id of ['viaOpen', 'openNet']) r[id] = { caught: false, val: '在板子裡面', note: '問題在內層，外面看不到' };
  r.leak = { caught: false, val: '看不出來', note: '漏電的殘留物太薄，看不出來' };
  r.warp = { caught: false, val: '—', note: '量的是零件，不是 MLO 整片的平整度' };
  r.relay = { caught: false, val: '外觀正常', note: '卡住的是繼電器內部的接點' };
  r.pogo = { caught: false, val: '—', note: '這一站只看零件面' };
  return { r, time: AOI.boardArea / 100 / (AOI.rate15 * (res / 15) ** 2), shots, fov, markPx };
}

/* ============================================================
   1 · Flying probe — probes touch both ends of every part and measure it
   ============================================================ */
export const FP = {
  nom: 10e3, wrong: 11e3,        // the resistor under test, and the wrong part that went on instead (+10 %)
  Ra: 4.7e3, Rb: 4.7e3,          // the parallel path through the rest of the network
  Rg: 1.0,                       // guard probe + wiring resistance, Ω
  acc: 0.005,                    // measurement uncertainty, 1 σ (illustrative; a guarded bed-of-nails spec is ±2.5 % at 10 kΩ)
  partTol: 0.01,                 // the good resistors are ±1 % parts
  nR: 40,                        // resistors in networks like this one
  bank: 52, capTol: 0.10,        // decoupling caps in parallel on one rail; their tolerance
  steps: 400, tStep: 0.05,       // measurements; published flying probers take 0.02–0.06 s per step
};
/** What the meter reads across Rx with or without the guard (3-wire guarding). */
export function fpReadR(Rx, guard) {
  if (!guard) return 1 / (1 / Rx + 1 / (FP.Ra + FP.Rb));
  return Rx / (1 + Rx * FP.Rg / (FP.Ra * FP.Rb));
}
export function fp(P, D) {
  const tol = P.fpTol / 100, g = P.fpGuard;
  const good = fpReadR(FP.nom, g), bad = fpReadR(FP.wrong, g);
  const devGood = good / FP.nom - 1, devBad = bad / FP.nom - 1;
  // chance a good ±1 % part reads outside the limit (uniform part spread + Gaussian meter noise)
  let pFalse = 0; for (let i = 0; i < 40; i++) { const e = devGood + (-1 + (2 * i + 1) / 40) * FP.partTol; pFalse += (erfc((tol - e) / (FP.acc * Math.SQRT2)) + erfc((tol + e) / (FP.acc * Math.SQRT2))) / 2 / 40; }
  const falseCalls = FP.nR * clamp(pFalse, 0, 1);
  const r = {};
  r.wrongR = Math.abs(devBad) > tol && (g ? true : false)
    ? { caught: true, val: `${(bad / 1e3).toFixed(2)} kΩ（${devBad >= 0 ? '+' : ''}${(devBad * 100).toFixed(1)} %）`, note: '超出容許誤差，抓到' }
    : { caught: false, val: `${(bad / 1e3).toFixed(2)} kΩ（${devBad >= 0 ? '+' : ''}${(devBad * 100).toFixed(1)} %）`, note: g ? '還在容許誤差內，放過了' : '沒開護衛：好的和錯的都量成並聯後的值，分不出來' };
  r.revDiode = { caught: true, val: '順向量不到 0.6 V', note: '順向電壓的方向反了' };
  const dC = -1 / FP.bank;
  r.missingC = { caught: false, val: `整排電容少 ${(-dC * 100).toFixed(1)} %`, note: `${FP.bank} 顆並聯只少 1 顆，還在電容本身 ±${FP.capTol * 100} % 的誤差裡` };
  for (const id of ['bridge', 'void', 'hip']) r[id] = { caught: false, val: '針碰不到', note: '錫球在 MLO 底下，探針碰不到' };
  r.viaOpen = { caught: false, val: '—', note: '這一站量零件，不量電源層的毫歐姆' };
  r.openNet = { caught: false, val: '—', note: '這條線上沒有零件可以量' };
  r.leak = { caught: false, val: '—', note: '低電壓量零件時，幾十 MΩ 的漏電不影響讀值' };
  r.warp = { caught: false, val: '—', note: '不量高度' };
  r.relay = { caught: false, val: '線圈電阻正常', note: '這一站量零件本身（線圈、二極體）；接點會不會動，要通電切換才知道' };
  r.pogo = { caught: false, val: '—', note: '針尖小、壓力集中，刺得穿薄薄一層污染' };
  return { r, time: FP.steps * FP.tStep, good, bad, devGood, devBad, falseCalls };
}

/* ============================================================
   2 · Net test — every net: continuity, isolation, and 4-wire milliohms on the power paths
   ============================================================ */
export const NET = {
  nets: 400, contMax: 10,        // signal nets; continuity limit, Ω (IPC-9252A level C)
  isoMin: 100e6, rMax: 100e9,    // isolation limit, Ω (the IPC class 3/A example); the meter reads up to 100 GΩ
  // the leaky pair: a residue that only conducts once the voltage is high enough (illustrative)
  leakHi: 5e9, leakV0: 30, leakN: 4,
  pp: 4.0e-3, ppBad: 5.2e-3,     // a power path, Ω, and the same path with a quarter of its vias open
  ppLim: 0.10,                   // ±10 % around the golden value (IST also fails at a 10 % change)
  rcMin: 0.01, rcMax: 0.15,      // spring-probe contact resistance, Ω (published 10–150 mΩ)
  nPaths: 8, tNet: 0.05, tIso: 0.05, t4w: 0.5,
};
/** Resistance of the leaky pair at test voltage V. */
export const leakR = (V) => NET.leakHi / (1 + (V / NET.leakV0) ** NET.leakN);
/** Readings of the eight power paths: 2-wire includes two contacts, 4-wire does not. */
export function netPaths(P, D, seed = 7) {
  const r = rng(seed), out = [];
  for (let i = 0; i < NET.nPaths; i++) {
    const R = (i === 5 && D.viaOpen ? NET.ppBad : NET.pp) * (1 + 0.012 * gauss(r));
    const rc = NET.rcMin + (NET.rcMax - NET.rcMin) * r(), rc2 = NET.rcMin + (NET.rcMax - NET.rcMin) * r();
    out.push({ R, w2: R + rc + rc2, w4: R * (1 + 0.002 * gauss(r)) });
  }
  return out;
}
export function net(P, D) {
  const four = P.netMode === '4w', V = P.netV, rL = leakR(V), canIso = rL < NET.isoMin;
  const r = {};
  r.openNet = { caught: true, val: '開路（> 10 MΩ）', note: `超過導通上限 ${NET.contMax} Ω` };
  r.bridge = { caught: true, val: '兩條網路之間 0.01 Ω', note: '絕緣測試：兩條網路短在一起' };
  const fmtR = (R) => (R >= 1e9 ? `${(R / 1e9).toFixed(1)} GΩ` : `${(R / 1e6).toFixed(0)} MΩ`);
  r.leak = canIso
    ? { caught: true, val: `${fmtR(rL)} @ ${V} V`, note: `低於 ${(NET.isoMin / 1e6).toFixed(0)} MΩ 的絕緣下限` }
    : { caught: false, val: `${fmtR(rL)} @ ${V} V`, note: `${V} V 時還沒開始漏，量起來正常；要加到更高的電壓才看得出來` };
  const lim = NET.pp * (1 + NET.ppLim);
  r.viaOpen = four
    ? { caught: true, val: `${(NET.ppBad * 1e3).toFixed(1)} mΩ（標準 ${(NET.pp * 1e3).toFixed(1)}）`, note: `四線量測扣掉接觸電阻，高出 ${Math.round((NET.ppBad / NET.pp - 1) * 100)} %，抓到` }
    : { caught: false, val: `${((NET.ppBad + 2 * (NET.rcMin + NET.rcMax) / 2) * 1e3).toFixed(0)} mΩ 上下`, note: '兩線量測把探針接觸電阻也算進去，幾十到幾百毫歐的變動蓋過了 1 mΩ 的差' };
  r.hip = { caught: false, val: '導通正常', note: '錫球和錫膏還碰在一起，電還通' };
  r.void = { caught: false, val: '導通正常', note: '空洞不影響導通' };
  r.missingC = { caught: false, val: '—', note: '量網路，不量零件' };
  r.wrongR = { caught: false, val: '—', note: '量網路，不量零件' };
  r.revDiode = { caught: false, val: '—', note: '量網路，不量零件' };
  r.warp = { caught: false, val: '—', note: '不量高度' };
  r.relay = { caught: false, val: '—', note: '繼電器沒通電' };
  r.pogo = { caught: false, val: '導通正常', note: '飛針針尖刺得穿薄污染，量起來正常' };
  const time = NET.nets * (NET.tNet + NET.tIso) + NET.nPaths * (four ? NET.t4w : NET.tNet);
  return { r, time, rL, canIso, lim };
}

/* ============================================================
   3 · X-ray — transmission through the solder balls under the MLO
   ============================================================ */
// mass attenuation coefficients μ/ρ (cm²/g) against photon energy (keV); the tin table steps at its K edge (29.2 keV)
export const MU = {
  // NIST X-ray mass attenuation (SRD 126). Solder: tin's table with SAC305's density. Laminate: the mean of water (resin) and borosilicate glass, a stand-in for glass–epoxy.
  sn: [[10, 138.4], [15, 46.64], [20, 21.46], [29.2, 7.76], [29.2, 43.6], [30, 41.21], [40, 19.42], [50, 10.7], [60, 6.564], [80, 3.029], [100, 1.676], [150, 0.6091]], rhoSn: 7.49,
  cu: [[10, 215.9], [15, 74.05], [20, 33.79], [30, 10.92], [40, 4.862], [50, 2.613], [60, 1.593], [80, 0.763], [100, 0.4584], [150, 0.2217]], rhoCu: 8.96,
  fr4: [[10, 11.19], [15, 3.445], [20, 1.553], [30, 0.587], [40, 0.351], [50, 0.265], [60, 0.224], [80, 0.186], [100, 0.168], [150, 0.145]], rhoFr4: 1.9,
};
export function muAt(tab, E) {
  if (E <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) {
    const [e0, m0] = tab[i - 1], [e1, m1] = tab[i];
    if (E <= e1 && e1 > e0) return Math.exp(Math.log(m0) + Math.log(E / e0) / Math.log(e1 / e0) * (Math.log(m1) - Math.log(m0)));
  }
  return tab[tab.length - 1][1];
}
/** Energy bins of a tungsten tube's beam (Kramers: photons ∝ (kV − E)/E), weighted by energy for an integrating detector; μ per mm. */
const specCache = new Map();
export function xrSpectrum(kV) {
  if (specCache.has(kV)) return specCache.get(kV);
  const out = []; let sum = 0;
  for (let E = 12.5; E < kV; E += 2.5) {
    const n = (kV - E) / E, w = n * E * Math.exp(-muAt(MU.fr4, E) * MU.rhoFr4 * 0.1 * XR.filt);   // a little inherent filtration
    out.push({ E, w, sn: muAt(MU.sn, E) * MU.rhoSn / 10, cu: muAt(MU.cu, E) * MU.rhoCu / 10, fr4: muAt(MU.fr4, E) * MU.rhoFr4 / 10 }); sum += w;
  }
  out.forEach((b) => (b.w /= sum)); specCache.set(kV, out); return out;
}
export const XR = {
  ball: 0.60, h: 0.45,            // mm: ball diameter and collapsed height for a 1.0 mm pitch grid
  voidBad: 0.35, voidGood: 0.06,  // void area fraction: the bad ball, typical good balls
  voidLim: 0.25,                  // more than 25 % of the ball's X-ray image area is a defect (IPC-A-610D/E)
  board: 3.0, cu: 0.35,           // mm of laminate and total copper the beam also crosses
  N90: 300,                       // photons per pixel per frame at 90 kV through nothing (illustrative)
  filt: 1.0,                      // mm of laminate-equivalent inherent filtration (illustrative)
  cnrMin: 6,                      // per-pixel contrast-to-noise needed to measure the void area reliably (illustrative)
  hipTilt: 55,                    // degrees: published practice looks for head-in-pillow at 55–70° oblique
  fps: 30, views: 36, tMove: 0.8, // detector frame rate (published 30 fps), fields of view over the MLO, s per move (illustrative)
};
export function xrMu(kV) { const sp = xrSpectrum(kV); let E = 0; for (const b of sp) E += b.E * b.w; return { E }; }
/** Transmitted signal for given path lengths (mm) of solder, copper and laminate, relative to the open beam. */
export function xrT(kV, lSn, lCu = XR.cu, lLam = XR.board) { let t = 0; for (const b of xrSpectrum(kV)) t += b.w * Math.exp(-b.sn * lSn - b.cu * lCu - b.fr4 * lLam); return t; }
/** Per-pixel contrast-to-noise between a void and solid solder, after averaging `frames` frames. */
export function xrCNR(kV, frames, voidFrac, tilt = 0) {
  const th = tilt * Math.PI / 180, ct = Math.cos(th), N0 = XR.N90 * (kV / 90) ** 2;
  const path = 2 / Math.hypot(Math.sin(th) / (XR.ball / 2), ct / (XR.h / 2));   // chord through the middle of the (ellipsoidal) ball
  const dv = XR.ball * Math.sqrt(voidFrac) * 0.8;                // void size along the beam
  const Nb = N0 * xrT(kV, path, XR.cu / ct, XR.board / ct), Nv = N0 * xrT(kV, Math.max(0, path - dv), XR.cu / ct, XR.board / ct);
  return { cnr: (Nv - Nb) / Math.sqrt(Math.max(1e-9, Nb)) * Math.sqrt(frames), Nb, Nv, contrast: Nv / Nb - 1 };
}
export function xray(P, D) {
  const c = xrCNR(P.xrKV, P.xrFrames, XR.voidBad, P.xrTilt), seen = c.cnr >= XR.cnrMin, dark = c.Nb * P.xrFrames < 20;
  const r = {};
  r.void = seen && !dark
    ? { caught: true, val: `空洞 ${Math.round(XR.voidBad * 100)} %`, note: `超過 ${XR.voidLim * 100} % 的上限（對比雜訊比 ${c.cnr.toFixed(0)}）` }
    : { caught: false, val: dark ? '影像太暗' : '影像太雜', note: dark ? (c.Nb < 3 ? `${P.xrKV} kV 太低：錫球幾乎不透光，看不出裡面` : '穿過錫球的光子太少：多疊幾張') : `雜訊太大（對比雜訊比 ${c.cnr.toFixed(1)}），量不準空洞大小；多疊幾張` };
  r.bridge = !dark ? { caught: true, val: '兩顆錫球連在一起', note: '橋接的錫很厚，一眼就看得出來' } : { caught: false, val: '影像太暗', note: '電壓太低，整片都黑' };
  r.hip = P.xrTilt >= XR.hipTilt && !dark
    ? { caught: true, val: `斜拍 ${P.xrTilt}°：錫球和錫膏錯開`, note: '斜著看，才看得出上下沒有熔在一起（也不保證每顆都抓得到）' }
    : { caught: false, val: P.xrTilt > 0 ? `斜 ${P.xrTilt}° 還看不清楚` : '正上方看起來是圓的', note: P.xrTilt < XR.hipTilt ? `要斜 ${XR.hipTilt}° 以上才看得出錯開` : '影像太暗' };
  for (const id of ['missingC', 'wrongR', 'revDiode']) r[id] = { caught: false, val: '—', note: '這一站只拍 MLO 底下' };
  r.viaOpen = { caught: false, val: '—', note: '銅層裡少幾根孔，在這個倍率下看不出來' };
  r.openNet = { caught: false, val: '—', note: '內層細線斷掉，2D 影像看不出來' };
  r.leak = { caught: false, val: '—', note: '漏電的殘留物不擋 X 光' };
  r.warp = { caught: false, val: '—', note: '不量高度' };
  r.relay = { caught: false, val: '—', note: '只拍 MLO' };
  r.pogo = { caught: false, val: '—', note: '只拍 MLO' };
  const views = XR.views * (P.xrTilt > 0 ? 4 : 1);
  return { r, time: views * (P.xrFrames / XR.fps + XR.tMove), c, dark, views };
}

/* ============================================================
   4 · Flatness — autofocus heights over the MLO, best-fit plane, peak-to-valley
   ============================================================ */
export const MET = {
  side: 100,                      // mm, the MLO
  bowGood: 12, bowBad: 60,        // μm, centre-to-corner bow
  tiltGood: 8,                    // μm across the MLO
  lim: 38,                        // μm flatness limit (the 2002 MLO example on the MLO page)
  sigma: 1.0, wavy: 2.0,          // μm per point (published video CMM: laser AF 2σ ≤ 0.5 μm, Z error 1.2 + 5L/1000 μm); waviness illustrative
  tPoint: 1.0,                    // s per point: move and autofocus (illustrative)
};
/** True surface height (μm) at (u, v) in [-1, 1]² across the MLO. */
export function metH(u, v, D) {
  const bow = D.warp ? MET.bowBad : MET.bowGood;
  return bow * (1 - (u * u + v * v) / 2) + MET.tiltGood * 0.5 * u + MET.wavy * Math.sin(5.1 * u + 1.3) * Math.cos(4.3 * v - 0.7);
}
export function metScan(N, D, seed = 11) {
  const r = rng(seed), pts = [];
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const u = N === 1 ? 0 : -1 + 2 * i / (N - 1), v = N === 1 ? 0 : -1 + 2 * j / (N - 1);
    pts.push({ u, v, z: metH(u, v, D) + MET.sigma * gauss(r) });
  }
  // least-squares plane z = a + b u + c v, then peak-to-valley of the residuals
  let su = 0, sv = 0, sz = 0, suu = 0, svv = 0, suv = 0, suz = 0, svz = 0; const n = pts.length;
  for (const p of pts) { su += p.u; sv += p.v; sz += p.z; suu += p.u * p.u; svv += p.v * p.v; suv += p.u * p.v; suz += p.u * p.z; svz += p.v * p.z; }
  const A = [[n, su, sv], [su, suu, suv], [sv, suv, svv]], B = [sz, suz, svz];
  const det = (m) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d0 = det(A), sol = [0, 1, 2].map((k) => det(A.map((row, i) => row.map((x, j) => (j === k ? B[i] : x)))) / d0);
  let lo = 1e9, hi = -1e9; for (const p of pts) { p.res = p.z - (sol[0] + sol[1] * p.u + sol[2] * p.v); lo = Math.min(lo, p.res); hi = Math.max(hi, p.res); }
  return { pts, plane: sol, flat: hi - lo, tilt: Math.hypot(sol[1], sol[2]) * 2 };
}
export function met(P, D) {
  const s = metScan(P.metN, D), r = {};
  r.warp = s.flat > MET.lim
    ? { caught: true, val: `平整度 ${s.flat.toFixed(0)} μm`, note: `超過 ${MET.lim} μm` }
    : { caught: false, val: `平整度 ${s.flat.toFixed(0)} μm`, note: P.metN < 3 ? '點太少，量不出彎曲' : '在上限內' };
  for (const d of DEFECTS) if (!r[d.id]) r[d.id] = { caught: false, val: '—', note: '這一站只量 MLO 表面的高度' };
  return { r, time: P.metN * P.metN * MET.tPoint, scan: s };
}

/* ============================================================
   5 · On-tester diagnostics — the board docked on the same tester model and instrument set-up the customer uses
   ============================================================ */
export const DD = {
  slots: 12, ch: 16,
  // the instrument each slot must hold for this board; 'diff' is a tester set up for another product
  need: ['DIG', 'DIG', 'DIG', 'DIG', 'DPS', 'DPS', 'ANA', 'ANA', 'HSD', 'HSD', 'DIG', 'DIG'],
  diff: ['DIG', 'DIG', 'DIG', 'DIG', 'DPS', 'DPS', 'DIG', 'DIG', 'DIG', 'DIG', 'DIG', 'DIG'],
  iForce: 1e-3,                   // A, the PMU forces this current through each loop-back path
  rPath: 3.5, rLim: 1.0,          // Ω nominal path, allowed rise over the golden board
  rPogo: 2.4,                     // Ω extra from the contaminated pads
  capTol: 0.10,                   // rail capacitance limit
  // which slot each defect's channel lives on
  slotOf: { bridge: 2, openNet: 3, revDiode: 6, relay: 8, pogo: 9 },
  tChan: 0.9, tRail: 6, tRelay: 0.4, nRelay: 20,
};
export function dd(P, D) {
  const cfg = P.ddCfg === 'same' ? DD.need : DD.diff, ok = (s) => cfg[s] === DD.need[s];
  const r = {}, skip = (id) => !ok(DD.slotOf[id]);
  const un = (id) => ({ caught: false, val: '這個通道沒測到', note: `第 ${DD.slotOf[id] + 1} 槽裝的是 ${cfg[DD.slotOf[id]]}，不是這片板子要的 ${DD.need[DD.slotOf[id]]}，診斷程式跳過` });
  r.relay = skip('relay') ? un('relay') : { caught: true, val: 'K15 吸合後仍是開路', note: '診斷程式切換每顆繼電器，量它通不通' };
  r.revDiode = skip('revDiode') ? un('revDiode') : { caught: true, val: 'K7 不會吸合', note: '二極體反向把驅動短路，繼電器不動' };
  const vP = DD.iForce * (DD.rPath + DD.rPogo);
  r.pogo = skip('pogo') ? un('pogo') : { caught: true, val: `${(DD.rPath + DD.rPogo).toFixed(1)} Ω（${(vP * 1e3).toFixed(1)} mV @ 1 mA）`, note: `比標準高 ${DD.rPogo} Ω：彈簧針壓不透污染` };
  r.bridge = skip('bridge') ? un('bridge') : { caught: true, val: '兩個通道互相短路', note: '一個通道送電流，隔壁通道也量到電壓' };
  r.openNet = skip('openNet') ? un('openNet') : { caught: true, val: '開路', note: '迴路量不到電流' };
  r.missingC = { caught: false, val: `電源總電容 −${(100 / 52).toFixed(1)} %`, note: `在 ±${DD.capTol * 100} % 的上下限內` };
  r.wrongR = { caught: false, val: '—', note: '這顆電阻不在診斷的迴路上' };
  r.leak = { caught: false, val: '0.2 μA @ 5 V', note: '低電壓下的漏電流還在上限內' };
  r.viaOpen = { caught: false, val: '—', note: '1 mΩ 的差異在診斷的解析度以下' };
  r.void = { caught: false, val: '導通正常', note: '空洞不影響導通' };
  r.hip = { caught: false, val: '導通正常', note: '常溫下還接觸得到' };
  r.warp = { caught: false, val: '—', note: '不量高度' };
  const tested = cfg.filter((c, s) => ok(s)).length;
  return { r, time: tested * DD.ch * DD.tChan + 2 * DD.tRail + DD.nRelay * DD.tRelay, cfg, ok, tested };
}

export const RUN = { aoi, fp, net, xray, met, dd };
/** Every station against every defect, with the current settings. */
export function coverage(P, D) {
  return STATIONS.map((s) => RUN[s.id](P, D));
}
