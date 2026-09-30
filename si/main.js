// Signal & Power Integrity Lab — drawing, controls and the guided tour. The physics is in model.js.
import { MATERIALS, RATES, CAPS, RESIDUAL, NO_EQ_LIMIT, SPU, NSYM, NS, baudOf, nyquistOf, stubs, stubF0, lossDb, lossPerInch, eye, zTarget, stepOf, zCurve, droop, dc, rail, VIA_DK, MM, C0 } from './model.js';

const RECORD = new URLSearchParams(location.search).has('record');
const REC_DPR = +new URLSearchParams(location.search).get('dpr') || 1;
if (RECORD) document.documentElement.classList.add('rec');
const $ = (s) => document.querySelector(s);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const ease5 = (t) => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
const DPR = () => (RECORD ? REC_DPR : Math.min(devicePixelRatio || 1, 2));

/* ============================================================
   State
   ============================================================ */
const S = { rate: RATES[2], mat: MATERIALS[0], th: 6.4, depth: 0.3, len: 25, w: 6, drill1: false, drill2: false, rough: false, eq: false };
const P = { vdd: 0.8, ripple: 3, imax: 200, rise: 100e-9, bulk: 20, mid: 40, hf: 100, pins: 250, planes: 6, sense: 2 };
let mode = 'sig', wallT = 0;
const R = { sig: null, pwr: null };                       // cached results
const dirty = { sig: true, pwr: true };

function calcSig() {
  const st = stubs(S), f0 = st.map((mm) => stubF0(mm, S.mat.Dk)), nyq = nyquistOf(S.rate);
  const curve = []; for (let i = 0; i <= 240; i++) { const f = i / 240 * 40; curve.push([f, lossDb(f, S)]); }
  const raw = S.eq ? curve.map(([f]) => [f, lossDb(f, { ...S, eq: false })]) : null;
  const e = eye(S, S.rate);
  R.sig = { st, f0, nyq, curve, raw, e, loss: lossDb(nyq, { ...S, eq: false }), line: lossPerInch(nyq, S.mat, S.w, S.rough) };
  dirty.sig = false; resetWave();
}
function calcPwr() {
  const zc = zCurve(P), d = droop(P); let zm = zc[0], dm = d[0];
  for (const x of zc) if (x.z > zm.z) zm = x;
  for (const x of d) if (x.v < dm.v) dm = x;
  R.pwr = { zc, d, zm, dm, zt: zTarget(P), allow: P.vdd * P.ripple / 100, dc: dc(P), rail: rail(P) };
  dirty.pwr = false;
}

/* ============================================================
   Stage: the board cross-section
   ============================================================ */
const stageEl = $('#stage'), cv = $('#cv'), g = cv.getContext('2d');
let W = 0, H = 0, K = 1, OX = 0, OY = 0, small = false;                 // canvas size in CSS px, scale and offset of the 1000 × 600 drawing
const X = (x) => OX + x * K, Yy = (y) => OY + y * K;
const BOARD = { x0: 120, x1: 880, top: 250, bot: 470, v1: 250, v2: 750 };
function fitStage() {
  const r = stageEl.getBoundingClientRect(), d = DPR();
  W = r.width; H = r.height;
  if (cv.width !== Math.round(W * d) || cv.height !== Math.round(H * d)) { cv.width = Math.round(W * d); cv.height = Math.round(H * d); }
  g.setTransform(d, 0, 0, d, 0, 0);
  small = W < 560;                                          // phones: zoom in on the board and keep only the essential labels
  const padT = small ? 104 : 150, padB = small ? 118 : 96;
  K = Math.min(W / (small ? 850 : 1000), (H - padT - padB) / 470); OX = W / 2 - 500 * K; OY = padT + (H - padT - padB - 470 * K) / 2 - 120 * K;
}
const font = (px, wt = 600, mono = false) => `${wt} ${Math.max(9.5, px * Math.max(K, 0.72))}px ${mono ? '"JetBrains Mono", monospace' : 'Inter, "Noto Sans TC", sans-serif'}`;
function label(txt, x, y, o = {}) {
  g.font = font(o.px || 13, o.wt || 600, o.mono); g.fillStyle = o.col || '#c9d2de'; g.textAlign = o.align || 'left'; g.textBaseline = o.base || 'alphabetic';
  if (o.bg) { const w = g.measureText(txt).width, h = (o.px || 13) * Math.max(K, 0.72) * 1.5; const x0 = X(x) - (o.align === 'center' ? w / 2 : o.align === 'right' ? w : 0) - 6; g.fillStyle = 'rgba(7,10,16,.82)'; g.beginPath(); g.roundRect(x0, Yy(y) - h * 0.74, w + 12, h, 5); g.fill(); g.fillStyle = o.col || '#c9d2de'; }
  g.fillText(txt, X(x), Yy(y));
}
function rect(x, y, w, h, fill, stroke) { if (fill) { g.fillStyle = fill; g.fillRect(X(x), Yy(y), w * K, h * K); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.strokeRect(X(x) + 0.5, Yy(y) + 0.5, w * K, h * K); } }
function line(pts, col, lw, dash) { g.strokeStyle = col; g.lineWidth = lw * K; g.setLineDash(dash ? dash.map((v) => v * K) : []); g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Yy(y)) : g.moveTo(X(x), Yy(y)))); g.stroke(); g.setLineDash([]); }

function drawBoard(planes) {
  const B = BOARD, th = B.bot - B.top;
  const gr = g.createLinearGradient(0, Yy(B.top), 0, Yy(B.bot)); gr.addColorStop(0, '#12382a'); gr.addColorStop(1, '#0c2a20');
  rect(B.x0, B.top, B.x1 - B.x0, th, gr);
  const n = 22;
  for (let i = 1; i < n; i++) { const y = B.top + th * i / n; g.fillStyle = i % 4 === 0 ? 'rgba(231,173,99,.34)' : 'rgba(181,118,56,.2)'; g.fillRect(X(B.x0), Yy(y) - 0.6, (B.x1 - B.x0) * K, Math.max(1, 1.4 * K)); }
  if (planes) for (let i = 0; i < planes; i++) { const y = B.top + th * (0.14 + 0.72 * (i + 0.5) / planes); g.fillStyle = 'rgba(240,190,110,.85)'; g.fillRect(X(B.x0 + 6), Yy(y) - 1.6 * K, (B.x1 - B.x0 - 12) * K, 3.2 * K); }
  g.strokeStyle = 'rgba(120,200,160,.35)'; g.lineWidth = 1; g.strokeRect(X(B.x0) + 0.5, Yy(B.top) + 0.5, (B.x1 - B.x0) * K, th * K);
}
function pogo(x, y0, y1, col = '#d9b860') {                // a spring pin between y0 (tip) and y1
  const w = 9, d = y1 > y0 ? 1 : -1;
  rect(x - w / 2, Math.min(y0 + d * 16, y1), w, Math.abs(y1 - y0 - d * 16), 'rgba(217,184,96,.22)', col);
  rect(x - 2.5, Math.min(y0, y0 + d * 18), 5, 18, col);
  g.strokeStyle = '#c6ced9'; g.lineWidth = 1.2 * K; g.beginPath();
  const a = y0 + d * 20, b = y1 - d * 4; for (let i = 0; i <= 10; i++) { const yy = lerp(a, b, i / 10), xx = x + (i % 2 ? 3 : -3); i ? g.lineTo(X(xx), Yy(yy)) : g.moveTo(X(xx), Yy(yy)); } g.stroke();
}

/* ---------- signal mode: a pulse train on the lane, with both stubs ringing ---------- */
const wave = { A: null, S1: null, T: null, V: null, S2: null, acc: 0, t: 0, lp: 0, src: [], rx: [], bits: [], sent: [] };
const CELL = 0.1, TRACE_CELLS = 110;                       // mm of via per cell; the trace is a fixed short delay on screen
function resetWave() {
  const mk = (n) => ({ n: Math.max(1, Math.round(n)), f: new Float32Array(Math.max(1, Math.round(n))), b: new Float32Array(Math.max(1, Math.round(n))) });
  const st = R.sig ? R.sig.st : stubs(S);
  wave.A = mk((1 - S.depth) * S.th / CELL); wave.S1 = mk(st[0] / CELL); wave.T = mk(TRACE_CELLS); wave.V = mk(S.depth * S.th / CELL); wave.S2 = mk(st[1] / CELL);
  wave.t = 0; wave.lp = 0; wave.rx = []; wave.sent = [];
  // one cell of via is CELL mm at the via's speed; the unit interval in cells follows from the baud rate
  const psPerCell = CELL * MM * Math.sqrt(S.mat.Dk * VIA_DK) / C0 * 1000;
  wave.ui = 1000 / baudOf(S.rate) / psPerCell;
  const fn = nyquistOf(S.rate), L = R.sig ? lossDb(fn, { ...S, eq: false, drill1: true, drill2: true, th: 0.001 }) : 3;       // line loss only
  const fc = fn / Math.sqrt(Math.max(1e-6, Math.pow(10, L / 10) - 1)); wave.alpha = 1 - Math.exp(-2 * Math.PI * fc * psPerCell / 1000);
  wave.gain = 1;
}
let seed = 7;
const rbit = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 16) & 1; };
function source(t) {                                       // NRZ bits with a smooth edge, ±1
  const k = Math.floor(t / wave.ui), u = t / wave.ui - k;
  while (wave.bits.length <= k + 1) wave.bits.push(rbit() * 2 - 1);
  if (wave.bits.length > 4000) { wave.bits.splice(0, 2000); wave.t -= 2000 * wave.ui; return source(wave.t); }
  const a = wave.bits[Math.max(0, k - 1)] ?? -1, b = wave.bits[k];
  return lerp(a, b, ease(u / 0.35));
}
function shift(br, inF, inB) {                            // move both travelling waves one cell; returns what leaves each end
  const n = br.n, outF = br.f[n - 1], outB = br.b[0];
  br.f.copyWithin(1, 0, n - 1); br.f[0] = inF; br.b.copyWithin(0, 1, n); br.b[n - 1] = inB;
  return [outF, outB];
}
function stepWave() {
  const { A, S1, T, V, S2 } = wave;
  // what arrives at each junction this step
  const aA = A.f[A.n - 1], aS1 = S1.b[0], aT = T.b[0];
  const s1 = (aA + aS1 + aT) * 2 / 3;
  const bT = T.f[T.n - 1], bV = V.b[0], bS2 = S2.b[0];
  wave.lp += wave.alpha * (bT - wave.lp);                  // the long trace rounds the edges
  const s2 = (wave.lp + bV + bS2) * 2 / 3;
  const src = source(wave.t);
  shift(A, src, s1 - aA);
  shift(S1, s1 - aS1, S1.f[S1.n - 1]);                     // open end: the wave comes straight back
  shift(T, s1 - aT, s2 - wave.lp);
  const out = V.f[V.n - 1];
  shift(V, s2 - bV, 0);                                    // the device terminates the line
  shift(S2, s2 - bS2, S2.f[S2.n - 1]);
  wave.t += 1;
  wave.sent.push(src); wave.rx.push(out); if (wave.rx.length > 520) { wave.rx.shift(); wave.sent.shift(); }
}
function glow(pts, br, rev = false) {                     // paint a branch: brightness follows the voltage on each cell
  const n = br.n, segs = Math.min(n, 60);
  let len = 0; const L = [0]; for (let i = 1; i < pts.length; i++) { len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(len); }
  const at = (u) => { const d = u * len; let i = 1; while (i < L.length - 1 && L[i] < d) i++; const t = (d - L[i - 1]) / Math.max(1e-6, L[i] - L[i - 1]); return [lerp(pts[i - 1][0], pts[i][0], t), lerp(pts[i - 1][1], pts[i][1], t)]; };
  g.lineCap = 'round';
  for (let s = 0; s < segs; s++) {
    const u0 = s / segs, u1 = (s + 1) / segs, c = Math.min(n - 1, Math.floor((rev ? 1 - u0 : u0) * n)), v = br.f[c] + br.b[c];
    const a = clamp((v + 0.15) * 0.8, 0, 1); if (a < 0.04) continue;
    const p0 = at(u0), p1 = at(u1);
    g.strokeStyle = `rgba(110,225,255,${a})`; g.lineWidth = 5 * K;
    g.beginPath(); g.moveTo(X(p0[0]), Yy(p0[1])); g.lineTo(X(p1[0]), Yy(p1[1])); g.stroke();
  }
  g.lineCap = 'butt';
}
function scopeBox(x, y, w, h, data, col, title) {
  rect(x, y, w, h, 'rgba(7,10,16,.9)', '#243041');
  g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1; g.beginPath(); g.moveTo(X(x), Yy(y + h / 2)); g.lineTo(X(x + w), Yy(y + h / 2)); g.stroke();
  g.strokeStyle = col; g.lineWidth = 1.6; g.beginPath();
  const n = data.length; for (let i = 0; i < n; i++) { const xx = x + w * (i + 520 - n) / 519, yy = y + h / 2 - data[i] * h * 0.36; i ? g.lineTo(X(xx), Yy(yy)) : g.moveTo(X(xx), Yy(yy)); } g.stroke();
  label(title, x + 6, y - 6, { px: 11, col: '#8d98aa', mono: true });
}
function drawSignal(dt) {
  const B = BOARD, th = B.bot - B.top, yL = B.top + S.depth * th, sc = th / S.th, st = R.sig.st;
  drawBoard(0);
  // vias: barrel, back-drilled cavity, stub
  const via = (x, stubMm, up, drilled) => {
    rect(x - 5, B.top, 10, th, '#caa45a');                                       // plated barrel
    rect(x - 2, B.top, 4, th, '#0b1a14');
    const sLen = stubMm * sc, y0 = up ? yL - sLen : yL, full = up ? yL - B.top : B.bot - yL;
    if (drilled && full > sLen + 0.5) { const cy = up ? B.top : yL + sLen, ch = full - sLen; rect(x - 9, cy, 18, ch, '#05070b', 'rgba(140,160,190,.4)'); }   // the back-drill removes the barrel
    rect(x - 5, y0, 10, Math.max(1.2, sLen), stubMm > RESIDUAL + 0.01 ? 'rgba(255,93,93,.95)' : 'rgba(255,178,36,.95)');
    rect(x - 13, B.top - 3, 26, 3, '#d9b860'); rect(x - 13, B.bot, 26, 3, '#d9b860');
    if (drilled) { const py = up ? B.top - 3 : B.bot; rect(x - 13, py, 26, 3, '#05070b'); }
  };
  via(B.v1, st[0], true, S.drill1); via(B.v2, st[1], false, S.drill2);
  // the stripline, with a break to say it is much longer than drawn
  const mid = (B.v1 + B.v2) / 2;
  rect(B.v1, yL - 1.8, mid - 22 - B.v1, 3.6, '#f0c27a'); rect(mid + 22, yL - 1.8, B.v2 - mid - 22, 3.6, '#f0c27a');
  line([[mid - 22, yL], [mid - 12, yL - 9], [mid - 2, yL + 9], [mid + 8, yL - 9], [mid + 18, yL + 9], [mid + 22, yL]], '#f0c27a', 1.6);
  label(small ? `${S.len} cm · ${S.mat.name}` : `走線 ${S.len} cm · ${S.mat.name}`, mid, yL - 16, { px: 12.5, align: 'center', bg: true, col: '#f0c27a' });
  // tester side and device side
  pogo(B.v1, B.bot + 3, B.bot + 62); rect(B.v1 - 30, B.bot + 62, 150, 30, '#1a2230', '#2a3547'); label(small ? '測試機' : '測試機 TESTER', B.v1 + 45, B.bot + 82, { px: 12, align: 'center', mono: !small, col: '#8d98aa' });
  pogo(B.v2, B.top - 3, B.top - 50); g.fillStyle = '#d5dae0'; g.beginPath(); g.arc(X(B.v2), Yy(B.top - 60), 10 * K, 0, 7); g.fill();
  rect(B.v2 - 70, B.top - 96, 140, 27, '#1d5a41', '#2c7a58'); rect(B.v2 - 62, B.top - 118, 124, 22, '#1c1e22', '#30343b'); label(small ? '晶片' : '晶片 DUT', B.v2, B.top - 102, { px: 12, align: 'center', mono: !small, col: '#c9d2de' });
  // the travelling waves
  wave.acc += dt * (RECORD ? 46 : 46); let n = Math.floor(wave.acc); wave.acc -= n; n = Math.min(n, 12); while (n-- > 0) stepWave();
  glow([[B.v1, B.bot + 62], [B.v1, yL]], wave.A);
  glow([[B.v1, yL], [B.v1, yL - st[0] * sc]], wave.S1);
  glow([[B.v1, yL], [B.v2, yL]], wave.T);
  glow([[B.v2, yL], [B.v2, B.top - 60]], wave.V);
  glow([[B.v2, yL], [B.v2, yL + st[1] * sc]], wave.S2);
  // call-outs
  const tag = (x, mm, f0, up, drilled) => {
    const long = mm > RESIDUAL + 0.01;
    if (small) { label(long ? `殘樁 ${mm.toFixed(1)} mm` : `殘樁 ${mm.toFixed(2)} mm`, x + (x < 500 ? 16 : -16), up ? B.top + 26 : B.bot - 14, { px: 13, wt: 700, col: long ? '#ff8d8d' : '#ffcf7a', align: x < 500 ? 'left' : 'right', bg: true }); return; }
    const y = up ? yL - Math.max(18, mm * sc / 2) : yL + Math.max(22, mm * sc / 2), side = x < 500 ? -1 : 1;
    line([[x + side * 8, y], [x + side * 34, y]], long ? '#ff5d5d' : '#ffb224', 1.2);
    label(long ? `殘樁 ${mm.toFixed(1)} mm` : `背鑽後殘樁 ${mm.toFixed(2)} mm`, x + side * 40, y - 3, { px: 13, wt: 700, col: long ? '#ff8d8d' : '#ffcf7a', align: side < 0 ? 'right' : 'left', bg: true });
    label(isFinite(f0) ? `共振 ${f0 < 100 ? f0.toFixed(1) : Math.round(f0)} GHz` : '', x + side * 40, y + 15, { px: 11.5, mono: true, col: '#8d98aa', align: side < 0 ? 'right' : 'left' });
  };
  tag(B.v1, st[0], R.sig.f0[0], true); tag(B.v2, st[1], R.sig.f0[1], false);
  // board thickness dimension
  if (!small) {
    line([[B.x1 + 16, B.top], [B.x1 + 16, B.bot]], '#566174', 1); line([[B.x1 + 10, B.top], [B.x1 + 22, B.top]], '#566174', 1); line([[B.x1 + 10, B.bot], [B.x1 + 22, B.bot]], '#566174', 1);
    label(`${S.th.toFixed(1)} mm`, B.x1 + 26, (B.top + B.bot) / 2 + 4, { px: 12, mono: true, col: '#8d98aa' });
    scopeBox(B.x0 - 40, B.bot + 46, 120, 50, wave.sent, '#4cc9f0', '送出 SENT'); scopeBox(B.x1 - 30, B.top - 124, 120, 50, wave.rx, '#7ee787', '收到 RECEIVED');
  } else {
    label(`板厚 ${S.th.toFixed(1)} mm`, B.x1, B.bot + 26, { px: 12, mono: true, col: '#8d98aa', align: 'right' });
    scopeBox(B.v1 + 150, B.bot + 46, 170, 56, wave.sent, '#4cc9f0', '送出'); scopeBox(B.v2 - 290, B.top - 124, 170, 56, wave.rx, '#7ee787', '收到');
  }
}

/* ---------- power mode: current from the tester supply to the die, and where each droop comes from ---------- */
const flow = [];
function particle(path, speed, col, size) { flow.push({ path, u: Math.random(), speed, col, size }); }
let flowKey = '';
function buildFlow() {
  const B = BOARD, key = [P.planes, P.bulk > 0, P.mid > 0, P.hf > 0].join(); if (key === flowKey) return; flowKey = key; flow.length = 0;
  const yP = (i) => B.top + (B.bot - B.top) * (0.14 + 0.72 * (i + 0.5) / Math.min(P.planes, 10));
  const n = Math.min(P.planes, 10);
  for (let i = 0; i < n; i += 2) for (let k = 0; k < 9; k++) particle([[170, B.bot + 70], [170, yP(i)], [700, yP(i)], [700, B.top - 50]], 0.14, '#ffc061', 3.2);
  for (let i = 1; i < n; i += 2) for (let k = 0; k < 9; k++) particle([[760, B.top - 50], [760, yP(i)], [210, yP(i)], [210, B.bot + 70]], 0.14, '#5fd4ff', 3.0);
}
function capIcon(x, y, w, h, n, col, name, hot) {
  rect(x, y, w, h, hot > 0.02 ? `rgba(255,200,97,${0.25 + 0.6 * hot})` : '#2a3142', col);
  rect(x, y, w * 0.18, h, col); rect(x + w * 0.82, y, w * 0.18, h, col);
  label(`${name} ×${n}`, x + w / 2, y + h + 15, { px: 11.5, align: 'center', col: n ? '#c9d2de' : '#566174', wt: 600 });
}
const replay = { t: 0 };
function drawPower(dt) {
  const B = BOARD, th = B.bot - B.top, r = R.pwr;
  drawBoard(Math.min(P.planes, 10));
  if (P.planes > 10) label(`電源層 ×${P.planes} 對`, B.x0 + 10, B.bot - 8, { px: 11.5, col: '#f0c27a', mono: true });
  // supply and sense
  rect(110, B.bot + 70, 150, 44, '#1a2230', '#2a3547'); label(small ? '測試機電源' : '測試機電源 SUPPLY', 185, B.bot + 97, { px: 12, align: 'center', mono: !small, col: '#c9d2de' });
  pogo(170, B.bot + 3, B.bot + 70, '#ffb24d'); pogo(210, B.bot + 3, B.bot + 70, '#4cc9f0');
  // device: package, die, pins
  const dx = 730; rect(dx - 90, B.top - 110, 180, 30, '#1d5a41', '#2c7a58'); rect(dx - 60, B.top - 134, 120, 24, '#8f9bab', '#c3ccd9'); label(small ? '晶片' : '晶片 DIE', dx, B.top - 117, { px: 11.5, align: 'center', mono: !small, col: '#0b0f16', wt: 700 });
  for (let i = 0; i < 8; i++) pogo(dx - 70 + i * 20, B.top - 3, B.top - 80, i % 2 ? '#4cc9f0' : '#ffb24d');
  if (small) label(`接腳 ×${P.pins}`, dx - 96, B.top - 40, { px: 11.5, col: '#8d98aa', align: 'right' }); else label(`電源接腳 ×${P.pins} 對`, dx + 96, B.top - 40, { px: 11.5, col: '#8d98aa', mono: true });
  if (P.sense) { const sx = P.sense === 2 ? dx + 84 : 300, sy = P.sense === 2 ? B.top - 96 : B.top; line([[sx, sy], [sx, B.top - 160], [96, B.top - 160], [96, B.bot + 92], [110, B.bot + 92]], '#70c883', 1.4, [5, 4]); label(small ? '遠端感測' : P.sense === 2 ? '遠端感測：量晶片端的電壓' : '遠端感測：量板子上的電壓', 104, B.top - 168, { px: 12, col: '#70c883' }); }
  // replay the load step on a loop, on a log time axis, and light up whoever is supplying the current at that moment
  replay.t = (replay.t + dt / 5.5) % 1.18; const u = clamp(replay.t, 0, 1), d = r.d, i = Math.min(d.length - 1, Math.floor(u * (d.length - 1))), now = d[i], step = Math.max(1e-9, stepOf(P));
  const share = { die: clamp((now.il - now.id) / step, 0, 1), hf: clamp(now.ih / step, 0, 1), mid: clamp(now.im / step, 0, 1), bulk: clamp(now.ib / step, 0, 1), sup: clamp(now.iv / step, 0, 1) };
  capIcon(small ? 330 : 300, B.bot + 8, 46, 22, P.bulk, '#9aa3ad', small ? '大' : '大電容', share.bulk); capIcon(small ? 500 : 420, B.bot + 8, 34, 16, P.mid, '#9aa3ad', small ? '中' : '中電容', share.mid); capIcon(dx - 40, B.bot + 8, 22, 11, P.hf, '#9aa3ad', small ? '高頻' : '高頻電容', share.hf);
  if (share.die > 0.02) rect(dx - 60, B.top - 134, 120, 24, `rgba(255,200,97,${0.7 * share.die})`);
  if (share.sup > 0.02) rect(110, B.bot + 70, 150, 44, `rgba(255,200,97,${0.45 * share.sup})`);
  // current
  buildFlow(); g.globalCompositeOperation = 'lighter';
  for (const p of flow) {
    p.u = (p.u + dt * p.speed) % 1; const pts = p.path; let len = 0; const L = [0]; for (let k = 1; k < pts.length; k++) { len += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); L.push(len); }
    const dd = p.u * len; let k = 1; while (k < L.length - 1 && L[k] < dd) k++; const t = (dd - L[k - 1]) / (L[k] - L[k - 1]);
    g.fillStyle = p.col; g.globalAlpha = 0.9; g.beginPath(); g.arc(X(lerp(pts[k - 1][0], pts[k][0], t)), Yy(lerp(pts[k - 1][1], pts[k][1], t)), p.size * K, 0, 7); g.fill();
  }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  // who is feeding the die right now
  const who = [['晶片與封裝裡的電容', share.die], ['高頻電容', share.hf], ['中電容', share.mid], ['大電容', share.bulk], ['測試機電源', share.sup]].sort((a, b) => b[1] - a[1])[0];
  const tt = now.t < 1e-6 ? (now.t * 1e9).toFixed(now.t < 1e-8 ? 1 : 0) + ' ns' : now.t < 1e-3 ? (now.t * 1e6).toFixed(now.t < 1e-5 ? 1 : 0) + ' μs' : (now.t * 1e3).toFixed(1) + ' ms';
  if (small) label(`${tt}：${who[0]}供電`, 880, B.bot + 96, { px: 13, wt: 700, align: 'right', col: '#ffd58a', bg: true }); else label(`電流跳升後 ${tt}：主要由${who[0]}供電`, 570, B.bot + 92, { px: 13.5, wt: 700, align: 'center', col: '#ffd58a', bg: true });
  replay.i = i;
  if (small) label(`${P.imax} A · ${P.vdd.toFixed(1)} V`, dx - 100, B.top - 96, { px: 13, mono: true, col: '#e8edf4', wt: 700, align: 'right' }); else label(`${P.imax} A · ${P.vdd.toFixed(1)} V`, dx + 100, B.top - 96, { px: 13, mono: true, col: '#e8edf4', wt: 700 });
}

/* ============================================================
   Panel plots
   ============================================================ */
function fit(c) { const r = c.getBoundingClientRect(), d = DPR(), w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d)); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } const x = c.getContext('2d'); x.setTransform(d, 0, 0, d, 0, 0); x.clearRect(0, 0, r.width, r.height); return { x, w: r.width, h: r.height }; }
const mono = (px) => `500 ${px}px "JetBrains Mono", monospace`;
function plotS21() {
  const c = $('#s21'); if (c.offsetParent === null) return; const { x, w, h } = fit(c), l = 32, r = 8, t = 10, b = 20, Wd = w - l - r, Hd = h - t - b, s = R.sig;
  const Xf = (f) => l + f / 40 * Wd, Yd = (db) => t + clamp(db, 0, 40) / 40 * Hd;
  x.fillStyle = 'rgba(72,211,138,.07)'; x.fillRect(l, t, Wd, Yd(NO_EQ_LIMIT) - t);
  x.font = mono(9); x.fillStyle = 'rgba(141,152,170,.8)'; x.strokeStyle = 'rgba(255,255,255,.06)'; x.lineWidth = 1;
  for (const db of [0, 10, 20, 30, 40]) { x.beginPath(); x.moveTo(l, Yd(db) + 0.5); x.lineTo(l + Wd, Yd(db) + 0.5); x.stroke(); x.fillText(db ? '−' + db : '0', 6, Yd(db) + 3); }
  for (const f of [0, 10, 20, 30, 40]) x.fillText(f + '', Xf(f) - (f ? 6 : 0), h - 6);
  x.fillText('dB', 6, t + 12); x.fillText('GHz', l + Wd - 22, h - 6);
  x.fillStyle = 'rgba(72,211,138,.85)'; x.fillText('10 dB 內不用等化', l + Wd - 96, Yd(NO_EQ_LIMIT) - 4);
  if (S.rate.budget <= 40) { x.setLineDash([4, 3]); x.strokeStyle = 'rgba(255,178,36,.75)'; x.beginPath(); x.moveTo(l, Yd(S.rate.budget) + 0.5); x.lineTo(l + Wd, Yd(S.rate.budget) + 0.5); x.stroke(); x.setLineDash([]); x.fillStyle = 'rgba(255,178,36,.9)'; x.fillText(`整條通道上限 ${S.rate.budget} dB`, l + Wd - 104, Yd(S.rate.budget) + 11); }
  const draw = (pts, col, lw) => { x.strokeStyle = col; x.lineWidth = lw; x.beginPath(); pts.forEach(([f, db], i) => (i ? x.lineTo(Xf(f), Yd(db)) : x.moveTo(Xf(f), Yd(db)))); x.stroke(); };
  if (s.raw) draw(s.raw, 'rgba(141,152,170,.6)', 1.2);
  draw(s.curve, '#4cc9f0', 2);
  x.strokeStyle = 'rgba(255,255,255,.75)'; x.lineWidth = 1; x.beginPath(); x.moveTo(Xf(s.nyq) + 0.5, t); x.lineTo(Xf(s.nyq) + 0.5, t + Hd); x.stroke();
  x.fillStyle = '#e8edf4'; x.fillText('Nyquist', Math.min(Xf(s.nyq) + 4, l + Wd - 46), t + 10);
  x.fillStyle = '#fff'; x.beginPath(); x.arc(Xf(s.nyq), Yd(lossDb(s.nyq, S)), 3.5, 0, 7); x.fill();
  for (const f0 of s.f0) if (f0 < 40) { x.fillStyle = '#ff6b6b'; x.beginPath(); x.moveTo(Xf(f0), t + Hd); x.lineTo(Xf(f0) - 4, t + Hd + 7); x.lineTo(Xf(f0) + 4, t + Hd + 7); x.fill(); }
}
function plotEye() {
  const c = $('#eye'); if (c.offsetParent === null) return; const { x, w, h } = fit(c), e = R.sig.e, l = 8, r = 8, t = 10, b = 20, Wd = w - l - r, Hd = h - t - b;
  x.strokeStyle = 'rgba(255,255,255,.05)'; x.lineWidth = 1; for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(l + Wd * i / 4 + 0.5, t); x.lineTo(l + Wd * i / 4 + 0.5, t + Hd); x.stroke(); }
  const Yv = (v) => t + Hd / 2 - v * Hd * 0.4, span = 2 * SPU, off = ((e.at - SPU / 2) % NS + NS) % NS;      // two unit intervals, the sampling point in the middle of the first
  x.strokeStyle = e.height > 0 ? 'rgba(76,201,240,.28)' : 'rgba(255,120,120,.26)'; x.lineWidth = 1.1;
  for (let n = 0; n < NSYM; n++) { x.beginPath(); for (let k = 0; k <= span; k++) { const v = e.wave[(n * SPU + off + k) % NS], xx = l + Wd * k / span, yy = Yv(v); k ? x.lineTo(xx, yy) : x.moveTo(xx, yy); } x.stroke(); }
  if (e.height > 0) {                                                   // mark the opening
    const xc = l + Wd * (SPU / 2) / span, hw = Wd * e.width / 2 / 2;
    x.strokeStyle = '#48d38a'; x.lineWidth = 1.5; x.setLineDash([3, 3]);
    const lv = e.levels, gaps = lv.length - 1;
    for (let i = 0; i < gaps; i++) { const mid = (lv[i] + lv[i + 1]) / 2; x.strokeRect(xc - hw, Yv(mid + e.height), hw * 2, Yv(mid - e.height) - Yv(mid + e.height)); }
    x.setLineDash([]);
  } else { x.fillStyle = '#ff6b6b'; x.font = '700 13px Inter, "Noto Sans TC", sans-serif'; x.textAlign = 'center'; x.fillText('眼睛閉上了 · EYE CLOSED', l + Wd / 2, t + Hd / 2 + 4); x.textAlign = 'left'; }
  x.font = mono(9); x.fillStyle = 'rgba(141,152,170,.8)'; x.fillText(`1 UI = ${e.ui.toFixed(1)} ps`, l + 2, h - 6); x.fillText(S.rate.pam4 ? 'PAM4 · 三個眼' : 'NRZ', l + Wd - (S.rate.pam4 ? 74 : 22), h - 6);
}
const fmtZ = (z) => (z < 1e-3 ? (z * 1e6).toFixed(0) + ' μΩ' : (z * 1e3).toFixed(z < 0.01 ? 2 : 1) + ' mΩ');
const fmtF = (f) => (f >= 1e6 ? (f / 1e6).toFixed(f >= 1e7 ? 0 : 1) + ' MHz' : f >= 1e3 ? (f / 1e3).toFixed(f >= 1e4 ? 0 : 1) + ' kHz' : f.toFixed(0) + ' Hz');
function plotZ() {
  const c = $('#zplot'); if (c.offsetParent === null) return; const { x, w, h } = fit(c), l = 38, r = 8, t = 10, b = 20, Wd = w - l - r, Hd = h - t - b, p = R.pwr;
  const zlo = 1e-5, zhi = 1e-1, Xf = (f) => l + Math.log10(f / 1e3) / 6 * Wd, Yz = (z) => t + Hd - clamp(Math.log10(z / zlo) / Math.log10(zhi / zlo), 0, 1) * Hd;
  x.font = mono(9); x.strokeStyle = 'rgba(255,255,255,.06)'; x.lineWidth = 1; x.fillStyle = 'rgba(141,152,170,.8)';
  for (const [z, s] of [[1e-5, '10 μΩ'], [1e-4, '100 μΩ'], [1e-3, '1 mΩ'], [1e-2, '10 mΩ'], [1e-1, '100 mΩ']]) { x.beginPath(); x.moveTo(l, Yz(z) + 0.5); x.lineTo(l + Wd, Yz(z) + 0.5); x.stroke(); x.fillText(s, 2, Yz(z) + 3); }
  for (const [f, s] of [[1e3, '1k'], [1e4, '10k'], [1e5, '100k'], [1e6, '1M'], [1e7, '10M'], [1e8, '100M'], [1e9, '1G']]) { x.beginPath(); x.moveTo(Xf(f) + 0.5, t); x.lineTo(Xf(f) + 0.5, t + Hd); x.stroke(); x.fillText(s, Xf(f) - (f > 5e8 ? 12 : 6), h - 6); }
  x.fillStyle = 'rgba(255,93,93,.09)'; x.fillRect(l, t, Wd, Yz(p.zt) - t);
  x.strokeStyle = '#48d38a'; x.setLineDash([4, 3]); x.beginPath(); x.moveTo(l, Yz(p.zt) + 0.5); x.lineTo(l + Wd, Yz(p.zt) + 0.5); x.stroke(); x.setLineDash([]);
  x.fillStyle = '#48d38a'; x.fillText('目標 ' + fmtZ(p.zt), l + 4, Yz(p.zt) + 12);
  x.strokeStyle = '#4cc9f0'; x.lineWidth = 2; x.beginPath(); p.zc.forEach((q, i) => (i ? x.lineTo(Xf(q.f), Yz(q.z)) : x.moveTo(Xf(q.f), Yz(q.z)))); x.stroke();
  x.fillStyle = p.zm.z > p.zt ? '#ff6b6b' : '#48d38a'; x.beginPath(); x.arc(Xf(p.zm.f), Yz(p.zm.z), 3.5, 0, 7); x.fill();
}
function plotDroop() {
  const c = $('#droop'); if (c.offsetParent === null) return; const { x, w, h } = fit(c), l = 38, r = 8, t = 10, b = 20, Wd = w - l - r, Hd = h - t - b, p = R.pwr;
  const vmax = Math.max(p.allow * 2.2, -p.dm.v * 1.15, 0.01), Xt = (tt) => l + Math.log10(tt / 1e-10) / 8 * Wd, Yv = (v) => t + Hd * 0.18 - v / vmax * Hd * 0.8;
  x.font = mono(9); x.strokeStyle = 'rgba(255,255,255,.06)'; x.lineWidth = 1; x.fillStyle = 'rgba(141,152,170,.8)';
  for (const [tt, s] of [[1e-9, '1 ns'], [1e-8, ''], [1e-7, '100 ns'], [1e-6, ''], [1e-5, '10 μs'], [1e-4, ''], [1e-3, '1 ms'], [1e-2, '']]) { x.beginPath(); x.moveTo(Xt(tt) + 0.5, t); x.lineTo(Xt(tt) + 0.5, t + Hd); x.stroke(); if (s) x.fillText(s, Xt(tt) - 12, h - 6); }
  x.fillStyle = 'rgba(72,211,138,.08)'; x.fillRect(l, Yv(p.allow), Wd, Yv(-p.allow) - Yv(p.allow));
  x.strokeStyle = 'rgba(72,211,138,.7)'; x.setLineDash([4, 3]); x.beginPath(); x.moveTo(l, Yv(-p.allow) + 0.5); x.lineTo(l + Wd, Yv(-p.allow) + 0.5); x.stroke(); x.setLineDash([]);
  x.fillStyle = '#48d38a'; x.fillText(`容許 −${(p.allow * 1e3).toFixed(0)} mV`, l + 4, Yv(-p.allow) + 12);
  x.fillStyle = 'rgba(141,152,170,.8)'; x.fillText('0', l - 12, Yv(0) + 3);
  x.strokeStyle = -p.dm.v > p.allow ? '#ff8d8d' : '#4cc9f0'; x.lineWidth = 2; x.beginPath(); p.d.forEach((q, i) => (i ? x.lineTo(Xt(q.t), Yv(q.v)) : x.moveTo(Xt(q.t), Yv(q.v)))); x.stroke();
  x.fillStyle = -p.dm.v > p.allow ? '#ff6b6b' : '#48d38a'; x.beginPath(); x.arc(Xt(p.dm.t), Yv(p.dm.v), 3.5, 0, 7); x.fill();
  if (mode === 'pwr' && replay.i != null) { const q = p.d[replay.i]; x.strokeStyle = 'rgba(255,213,138,.85)'; x.lineWidth = 1; x.beginPath(); x.moveTo(Xt(q.t) + 0.5, t); x.lineTo(Xt(q.t) + 0.5, t + Hd); x.stroke(); }
}

/* ============================================================
   Read-outs and the verdict line
   ============================================================ */
const cache = new Map();
function setText(id, txt, cls) { const k = txt + '|' + (cls || ''); if (cache.get(id) === k) return; cache.set(id, k); const el = document.getElementById(id); el.textContent = txt; if (cls !== undefined) el.className = cls; }
function setVerdict(kind, zh, en) { const k = kind + zh; if (cache.get('verdict') === k) return; cache.set('verdict', k); const el = $('#verdict'); el.className = kind; el.innerHTML = `${zh}<small>${en}</small>`; }
const fGHz = (f) => (!isFinite(f) ? '—' : f >= 100 ? Math.round(f) + ' GHz' : f.toFixed(1) + ' GHz');
function updateSig() {
  const s = R.sig, e = s.e, ideal = S.rate.pam4 ? 1 / 3 : 1;
  setText('oLoss', `${s.loss.toFixed(1)} dB @ ${s.nyq} GHz`);
  setText('oEye', e.height > 0 ? `${Math.round(e.height * 100)}% · ${(e.width * e.ui).toFixed(1)} ps` : 'closed', e.height > 0 ? '' : 'bad');
  setText('kNyq', `${s.nyq} GHz`);
  setText('kLoss', `${s.loss.toFixed(1)} dB`, s.loss <= NO_EQ_LIMIT ? 'good' : s.loss <= S.rate.budget * 0.6 ? 'mid' : 'bad');
  const sCls = (f0) => (f0 < s.nyq * 1.6 ? 'bad' : f0 < s.nyq * 3.5 ? 'mid' : 'good');
  setText('kS1', `${s.st[0].toFixed(2)} mm · ${fGHz(s.f0[0])}`, sCls(s.f0[0])); setText('kS2', `${s.st[1].toFixed(2)} mm · ${fGHz(s.f0[1])}`, sCls(s.f0[1]));
  setText('kEh', e.height > 0 ? `${Math.round(e.height * 100)}%` : '0', e.height > ideal * 0.4 ? 'good' : e.height > 0 ? 'mid' : 'bad');
  setText('kEw', e.height > 0 ? `${e.width.toFixed(2)} UI · ${(e.width * e.ui).toFixed(1)} ps` : '—', e.width > 0.5 ? 'good' : e.width > 0 ? 'mid' : 'bad');
  const fmin = Math.min(...s.f0), which = s.f0[0] < s.f0[1] ? '測試機側' : '晶片側';
  if (e.height <= 0 && fmin < s.nyq * 1.7) setVerdict('bad', `眼睛閉上了：${which}的殘樁在 ${fGHz(fmin)} 共振，正好落在這個速率最需要的頻率附近（Nyquist ${s.nyq} GHz）。把它背鑽掉。`, `Eye closed: the stub resonates at ${fGHz(fmin)}, right where this data rate needs its energy. Back-drill it.`);
  else if (e.height <= 0) setVerdict('bad', `眼睛閉上了：走線到 ${s.nyq} GHz 已經損耗 ${s.loss.toFixed(1)} dB。換低損耗板材、把線加寬或縮短${S.eq ? '' : '，或打開接收端等化'}。`, `Eye closed: ${s.loss.toFixed(1)} dB of loss at Nyquist. Use a lower-loss laminate, a wider or shorter trace${S.eq ? '' : ', or turn on the receiver equaliser'}.`);
  else if (fmin < s.nyq * 3.5) setVerdict('warn', `眼睛還開著，但${which}的殘樁共振在 ${fGHz(fmin)}，離訊號的頻帶不遠；速率再往上就會出事。`, `The eye is open, but a stub resonates at ${fGHz(fmin)}, not far above the signal band.`);
  else if (e.height < ideal * 0.4) setVerdict('warn', `眼睛開得不大：損耗 ${s.loss.toFixed(1)} dB，眼高只剩 ${Math.round(e.height * 100)}%${S.rate.pam4 ? '（PAM4 每個眼最多只有三分之一）' : ''}。`, `A small eye: ${s.loss.toFixed(1)} dB of loss leaves ${Math.round(e.height * 100)}% eye height.`);
  else setVerdict('ok', `眼睛張得很開：到 ${s.nyq} GHz 只損耗 ${s.loss.toFixed(1)} dB，兩個殘樁的共振都遠高於訊號的頻帶。`, `A wide-open eye: ${s.loss.toFixed(1)} dB at Nyquist, and both stub resonances sit far above the signal band.`);
  const [c, d] = s.line, inch = S.len / 2.54;
  $('#foot').innerHTML = `<b>這條線：</b>${S.len} cm（${inch.toFixed(1)} 英吋）在 ${s.nyq} GHz 每英吋損耗 ${(c + d).toFixed(2)} dB，其中銅 ${c.toFixed(2)}、板材 ${d.toFixed(2)}。板厚 ${S.th.toFixed(1)} mm 的穿孔不背鑽的話，兩個殘樁加起來就是整個板厚。 <a href="#" id="refsLink">參數依據與參考來源 →</a><br><span class="dis">跟 DIS 的關係：</span>${window.SI_SOURCES ? window.SI_SOURCES.dis : ''}個人作品、示意模型：一階公式，數字為業界通用量級，非官方資料。`;
}
function updatePwr() {
  const p = R.pwr, over = -p.dm.v > p.allow, pct = -p.dm.v / P.vdd * 100;
  setText('oZ', `${fmtZ(p.zm.z)} @ ${fmtF(p.zm.f)}`, p.zm.z > p.zt ? 'bad' : 'good');
  setText('oDroop', `−${(-p.dm.v * 1e3).toFixed(1)} mV`, over ? 'bad' : 'good');
  setText('kZt', fmtZ(p.zt)); setText('kZmax', `${fmtZ(p.zm.z)} · ${fmtF(p.zm.f)}`, p.zm.z > p.zt ? 'bad' : 'good');
  setText('kDroop', `${(-p.dm.v * 1e3).toFixed(1)} mV · ${pct.toFixed(1)}%`, over ? 'bad' : 'good');
  setText('kRip', `±${(p.allow * 1e3).toFixed(0)} mV`);
  setText('kDc', `${(p.dc.drop * 1e3).toFixed(0)} mV${P.sense === 2 ? '（已補償）' : P.sense === 1 ? '（補到板上）' : ''}`, P.sense === 2 ? 'good' : p.dc.drop > p.allow ? 'bad' : 'mid');
  setText('kW', `${p.dc.watts.toFixed(0)} W · ${(p.dc.watts / (P.vdd * P.imax) * 100).toFixed(1)}%`, p.dc.watts > P.vdd * P.imax * 0.035 ? 'mid' : 'good');
  // which part of the network owns the frequency where the impedance is worst
  const f = p.zm.f, band = f < 2e4 ? ['測試機電源和大電容之間', '增加大電容', 'between the supply and the bulk capacitors: add bulk capacitance'] : f < 4e5 ? ['大電容和中電容的範圍', '增加大電容和中電容', 'in the bulk / mid capacitor range: add bulk and mid capacitors'] : f < 1.2e6 ? ['中電容和高頻電容的範圍', '增加中電容和高頻電容', 'in the mid / high-frequency capacitor range: add them'] : ['接腳電感和晶片電容之間', '增加電源接腳，並補上高頻電容', 'between the pin inductance and the device capacitance: add power pins and high-frequency capacitors'];
  const end = p.d[p.d.length - 1].v, tt = p.dm.t < 1e-6 ? (p.dm.t * 1e9).toFixed(0) + ' ns' : p.dm.t < 1e-3 ? (p.dm.t * 1e6).toFixed(1) + ' μs' : (p.dm.t * 1e3).toFixed(1) + ' ms';
  if (-end > p.allow) setVerdict('bad', `穩定之後電壓還少了 ${(-end * 1e3).toFixed(0)} mV，超過容許的 ±${P.ripple}%：這是路徑上的直流壓降。把感測點拉到晶片端，讓電源自己補回來；或增加電源層。`, 'The rail settles too low: that is the DC drop in the path. Sense at the device, or add planes.');
  else if (over) setVerdict('bad', `電流一跳 ${Math.round(stepOf(P))} A，電壓在 ${tt} 時掉了 ${(-p.dm.v * 1e3).toFixed(0)} mV（${pct.toFixed(1)}%），超過容許的 ±${P.ripple}%。阻抗最高的地方在 ${fmtF(f)}，是${band[0]}：${band[1]}。`, `Too much droop. The impedance peaks at ${fmtF(f)}, ${band[2]}.`);
  else if (-end > p.allow * 0.4) setVerdict('warn', `瞬間的下陷在範圍內，但穩定之後還少了 ${(-end * 1e3).toFixed(0)} mV：這是路徑上的直流壓降。把感測點拉到晶片端。`, 'The fast droop is fine, but the rail settles low: that is the DC drop in the path. Sense at the device.');
  else if (p.zm.z > p.zt) setVerdict('warn', `這次電流跳升只掉 ${(-p.dm.v * 1e3).toFixed(0)} mV，在 ±${P.ripple}% 以內；但阻抗在 ${fmtF(f)} 仍高於目標（${band[0]}）。負載如果剛好用這個頻率反覆切換，下陷會更大：${band[1]}。`, `This step stays inside the limit, but the impedance still peaks above target at ${fmtF(f)}.`);
  else setVerdict('ok', `電壓很穩：電流跳 ${Math.round(stepOf(P))} A 只掉 ${(-p.dm.v * 1e3).toFixed(1)} mV，阻抗在整個頻段都低於目標 ${fmtZ(p.zt)}。`, 'A stiff rail: the impedance stays under target across the band.');
  const r = p.rail;
  $('#foot').innerHTML = `<b>這條電源：</b>目標阻抗 = ${P.vdd.toFixed(1)} V × ${P.ripple}% ÷ ${Math.round(stepOf(P))} A = <b>${fmtZ(p.zt)}</b>（電流跳升取最大電流的一半）。從電源到晶片的路徑電阻 ${fmtZ(p.dc.R)}，${P.imax} A 時壓降 ${(p.dc.drop * 1e3).toFixed(0)} mV；其中板子（電源層加接腳）發熱 ${p.dc.watts.toFixed(0)} W。接腳電感 ${(r.Ld * 1e12).toFixed(0)} pH。 <a href="#" id="refsLink">參數依據與參考來源 →</a><br><span class="dis">跟 DIS 的關係：</span>${window.SI_SOURCES ? window.SI_SOURCES.dis : ''}個人作品、示意模型：集總電路近似，數字為業界通用量級，非官方資料。`;
}

/* ============================================================
   Controls
   ============================================================ */
const ui = {};
for (const id of ['th', 'depth', 'len', 'w', 'imax', 'rise', 'bulk', 'mid', 'hf', 'pins', 'planes', 'tD1', 'tD2', 'tRough', 'tEq', 'tour']) ui[id] = document.getElementById(id);
const fill = (inp) => inp.style.setProperty('--p', ((inp.value - inp.min) / (inp.max - inp.min) * 100) + '%');
const imaxOf = (v) => Math.round(20 * Math.pow(77.2, v / 100) / 10) * 10, vOfImax = (a) => Math.round(100 * Math.log(a / 20) / Math.log(77.2));
const riseOf = (v) => 1e-9 * Math.pow(1e4, v / 100), vOfRise = (s) => Math.round(100 * Math.log(s / 1e-9) / Math.log(1e4));
const pinsOf = (v) => Math.round(20 * Math.pow(250, v / 100) / 10) * 10, vOfPins = (n) => Math.round(100 * Math.log(n / 20) / Math.log(250));
const fmtRise = (s) => (s < 1e-6 ? (s * 1e9).toFixed(s < 1e-8 ? 1 : 0) + ' ns' : (s * 1e6).toFixed(s < 1e-5 ? 1 : 0) + ' μs');
const bind = (id, fn) => ui[id].addEventListener('input', () => { fn(+ui[id].value); fill(ui[id]); });
bind('th', (v) => { S.th = v / 10; $('#thOut').textContent = `${S.th.toFixed(1)} mm · ${Math.round(S.th / 0.0254)} mil`; dirty.sig = true; });
bind('depth', (v) => { S.depth = v / 100; $('#depthOut').textContent = `離頂面 ${(S.depth * S.th).toFixed(1)} mm`; dirty.sig = true; });
bind('len', (v) => { S.len = v; $('#lenOut').textContent = `${v} cm · ${(v / 2.54).toFixed(1)} in`; dirty.sig = true; });
bind('w', (v) => { S.w = v; $('#wOut').textContent = `${v} mil · ${(v * 0.0254).toFixed(2)} mm`; dirty.sig = true; });
bind('imax', (v) => { P.imax = imaxOf(v); $('#imaxOut').textContent = `${P.imax} A`; dirty.pwr = true; });
bind('rise', (v) => { P.rise = riseOf(v); $('#riseOut').textContent = fmtRise(P.rise); dirty.pwr = true; });
bind('bulk', (v) => { P.bulk = v; $('#bulkOut').textContent = `×${v} · ${(v * 0.47).toFixed(0)} mF`; dirty.pwr = true; });
bind('mid', (v) => { P.mid = v; $('#midOut').textContent = `×${v}`; dirty.pwr = true; });
bind('hf', (v) => { P.hf = v; $('#hfOut').textContent = `×${v}`; dirty.pwr = true; });
bind('pins', (v) => { P.pins = pinsOf(v); $('#pinsOut').textContent = `×${P.pins}`; dirty.pwr = true; });
bind('planes', (v) => { P.planes = v; $('#planesOut').textContent = `×${v}`; dirty.pwr = true; });
function seg(sel, items, get, set, out) {
  const box = $(sel); if (items) box.innerHTML = items.map((it, i) => `<button data-i="${i}">${it.name}${it.sub ? `<small>${it.sub}</small>` : it.note ? `<small>Df ${it.Df}</small>` : ''}</button>`).join('');
  const btns = [...box.querySelectorAll('button')];
  const sync = () => { btns.forEach((b, i) => b.classList.toggle('on', items ? items[i] === get() : +b.dataset.v === get())); if (out) out(); };
  btns.forEach((b, i) => b.addEventListener('click', () => { set(items ? items[i] : +b.dataset.v); sync(); }));
  sync(); return sync;
}
const syncRate = seg('#segRate', RATES, () => S.rate, (v) => { S.rate = v; dirty.sig = true; }, () => ($('#rateOut').textContent = `${baudOf(S.rate)} GBd`));
const syncMat = seg('#segMat', MATERIALS, () => S.mat, (v) => { S.mat = v; dirty.sig = true; }, () => ($('#matOut').textContent = `Dk ${S.mat.Dk} · Df ${S.mat.Df}`));
const syncVdd = seg('#segVdd', null, () => P.vdd, (v) => { P.vdd = v; dirty.pwr = true; }, () => ($('#vddOut').textContent = P.vdd.toFixed(1) + ' V'));
const syncRip = seg('#segRip', null, () => P.ripple, (v) => { P.ripple = v; dirty.pwr = true; }, () => ($('#ripOut').textContent = `±${(P.vdd * P.ripple * 10).toFixed(0)} mV`));
const syncSense = seg('#segSense', null, () => P.sense, (v) => { P.sense = v; dirty.pwr = true; }, () => ($('#senseOut').textContent = ['off', 'at the board', 'at the device'][P.sense]));
const tog = (id, key) => { const f = () => ui[id].classList.toggle('on', S[key]); ui[id].addEventListener('click', () => { S[key] = !S[key]; f(); dirty.sig = true; }); return f; };
const syncTog = [tog('tD1', 'drill1'), tog('tD2', 'drill2'), tog('tRough', 'rough'), tog('tEq', 'eq')];
function setMode(m) { mode = m; $('#tabSig').classList.toggle('on', m === 'sig'); $('#tabPwr').classList.toggle('on', m === 'pwr'); $('#mSig').classList.toggle('on', m === 'sig'); $('#mPwr').classList.toggle('on', m === 'pwr'); cache.clear(); }
$('#tabSig').addEventListener('click', () => setMode('sig')); $('#tabPwr').addEventListener('click', () => setMode('pwr'));
const setSlider = (inp, v) => { inp.value = v; inp.dispatchEvent(new Event('input')); };
function applyState(o) {
  if (o.mode) setMode(o.mode);
  if ('rate' in o) { S.rate = RATES.find((r) => r.id === o.rate); syncRate(); dirty.sig = true; }
  if ('mat' in o) { S.mat = MATERIALS.find((m) => m.id === o.mat); syncMat(); dirty.sig = true; }
  for (const k of ['drill1', 'drill2', 'rough', 'eq']) if (k in o) { S[k] = o[k]; dirty.sig = true; }
  syncTog.forEach((f) => f());
  if ('th' in o) setSlider(ui.th, Math.round(o.th * 10)); if ('depth' in o) setSlider(ui.depth, Math.round(o.depth * 100)); if ('len' in o) setSlider(ui.len, o.len); if ('w' in o) setSlider(ui.w, o.w);
  if ('vdd' in o) { P.vdd = o.vdd; syncVdd(); syncRip(); dirty.pwr = true; } if ('ripple' in o) { P.ripple = o.ripple; syncRip(); dirty.pwr = true; } if ('sense' in o) { P.sense = o.sense; syncSense(); dirty.pwr = true; }
  if ('imax' in o) setSlider(ui.imax, vOfImax(o.imax)); if ('rise' in o) setSlider(ui.rise, vOfRise(o.rise)); if ('pins' in o) setSlider(ui.pins, vOfPins(o.pins));
  for (const k of ['bulk', 'mid', 'hf', 'planes']) if (k in o) setSlider(ui[k], o[k]);
}
const DEFAULTS = { mode: 'sig', rate: 'g5', mat: 'fr4', th: 6.4, depth: 0.3, len: 25, w: 6, drill1: false, drill2: false, rough: false, eq: false, vdd: 0.8, ripple: 3, imax: 200, rise: 100e-9, bulk: 20, mid: 40, hf: 100, pins: 250, planes: 6, sense: 2 };

// 參數依據
const SRC = window.SI_SOURCES;
if (SRC) {
  const cite = (r) => (r && r.length ? `<span class="c">${r.map((n) => `<a href="#ref-${n}">[${n}]</a>`).join('')}</span>` : '');
  $('#refsBox').innerHTML = `
    <button class="btn x" id="refsClose">✕ 關閉</button>
    <h2>參數依據與參考來源</h2>
    <p>${SRC.intro}</p>
    <h3>用到的公式 · Formulas</h3>
    <ol class="steps">${SRC.steps.map((x) => `<li><b>${x.zh}</b>　${x.d} ${cite(x.r)}</li>`).join('')}</ol>
    <h3>可調參數對照 · Parameters</h3>
    <div class="tbl"><table><tr><th>參數</th><th>這一頁用的值</th><th>公開資料</th><th>來源</th></tr>
      ${SRC.params.map((x) => `<tr><td>${x.p}</td><td class="sim">${x.sim}</td><td class="real">${x.real}</td><td>${cite(x.r)}</td></tr>`).join('')}</table></div>
    <h3>沒有模擬的部分</h3>
    <p>${SRC.left}</p>
    <h3>參考文獻 · References</h3>
    <ol>${SRC.refs.map((x, i) => `<li id="ref-${i + 1}"><a href="${x.u}" target="_blank" rel="noopener">${x.t}</a></li>`).join('')}</ol>`;
  const openRefs = (e) => { if (e) e.preventDefault(); $('#refs').classList.add('open'); $('#refs').scrollTop = 0; };
  const closeRefs = () => $('#refs').classList.remove('open');
  $('#refsBtn').addEventListener('click', openRefs);
  $('#foot').addEventListener('click', (e) => { if (e.target.id === 'refsLink') openRefs(e); });
  $('#refsClose').addEventListener('click', closeRefs);
  $('#refs').addEventListener('click', (e) => { if (e.target.id === 'refs') closeRefs(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeRefs(); });
  $('#refsBox').addEventListener('click', (e) => { const a = e.target.closest('a[href^="#ref-"]'); if (a) { e.preventDefault(); const li = $(a.getAttribute('href')); li.scrollIntoView({ block: 'center' }); li.style.background = 'rgba(76,201,240,.16)'; setTimeout(() => (li.style.background = ''), 1600); } });
} else $('#refsBtn').style.display = 'none';

/* ============================================================
   Director — the guided tour that is also the video script
   ============================================================ */
const ACTS = [
  { t: 0.0, set: { ...DEFAULTS } },
  { t: 5.2, show: true },
  { t: 5.8, move: ['el', '#tD2'], d: 0.8 }, { t: 6.8, click: '#tD2' },
  { t: 9.6, move: ['el', '#tD1'], d: 0.7 }, { t: 10.4, click: '#tD1' },
  { t: 14.0, move: ['el', '#segMat [data-i="4"]'], d: 0.9 }, { t: 15.0, click: '#segMat [data-i="4"]' },
  { t: 19.0, move: ['el', '#segRate [data-i="4"]'], d: 0.9 }, { t: 20.0, click: '#segRate [data-i="4"]' },
  { t: 23.4, move: ['el', '#tEq'], d: 0.8 }, { t: 24.3, click: '#tEq' },
  { t: 27.6, move: ['el', '#tabPwr'], d: 1.0 }, { t: 28.7, click: '#tabPwr' },
  { t: 35.2, move: ['slider', 'bulk'], d: 0.8 }, { t: 36.1, drag: 'bulk', to: 160, d: 2.0 },
  { t: 39.0, move: ['slider', 'pins'], d: 0.7 }, { t: 39.8, drag: 'pins', to: 83, d: 2.0 },
  { t: 42.6, move: ['slider', 'mid'], d: 0.6 }, { t: 43.3, drag: 'mid', to: 300, d: 1.6 },
  { t: 45.2, move: ['slider', 'hf'], d: 0.6 }, { t: 45.9, drag: 'hf', to: 800, d: 1.6 },
  { t: 48.4, move: ['slider', 'imax'], d: 0.7 }, { t: 49.2, drag: 'imax', to: 90, d: 2.4 },
  { t: 53.4, move: ['park'], d: 0.8 }, { t: 54.2, show: false },
];
const CAPS_T = [
  { t: 0.3, zh: '測試板很厚，訊號要穿過整塊板子', en: 'A test board is thick, and the signal has to get through it' },
  { t: 3.0, zh: '用不到的那截孔壁叫殘樁，它會在某個頻率把訊號吃掉', en: 'The unused part of the via is a stub; at one frequency it swallows the signal' },
  { t: 6.8, zh: '把殘樁背鑽掉', en: 'Back-drill the stubs' },
  { t: 15.0, zh: '再換成低損耗板材', en: 'Then switch to a low-loss laminate' },
  { t: 20.0, zh: '速率拉到 112 Gb/s，眼睛又小了', en: 'Go to 112 Gb/s and the eye shrinks again' },
  { t: 24.3, zh: '打開接收端的等化，眼睛又張開一些', en: 'Turn on the receiver equaliser and the eye opens a little' },
  { t: 28.7, zh: '另一個難題：電要送得穩', en: 'The other problem: a stiff power rail' },
  { t: 31.6, zh: '電流一跳，電壓就往下掉', en: 'When the current steps, the voltage sags' },
  { t: 36.1, zh: '加大電容，撐住慢的那一段', en: 'Bulk capacitors hold up the slow part' },
  { t: 39.8, zh: '增加電源接腳、降低電感，撐住快的那一段', en: 'More power pins, less inductance: that holds up the fast part' },
  { t: 43.3, zh: '中間再用中電容和高頻電容接力', en: 'Mid and high-frequency capacitors cover the middle' },
  { t: 49.2, zh: '電流加到一千安培，目標阻抗只剩四十幾微歐姆', en: 'At 1000 A the target is under 50 micro-ohms' },
  { t: 54.4, zh: '', en: '' },
];
const END = { t: 54.6, dur: 60.0 };
const NARR = window.SI_NARR || null;
if (NARR) {
  const T = (t) => t + NARR.retime.reduce((s, [a, e]) => s + (t >= a ? e : 0), 0);
  for (const a of ACTS) a.t = T(a.t);
  END.t = T(END.t); END.dur = Math.max(T(END.dur), NARR.end);
  CAPS_T.length = 0; for (const l of NARR.lines) if (l.cap) CAPS_T.push({ t: l.t, d: l.d, zh: l.zh, en: l.en });
}
const cursorEl = $('#cursor'), rippleEl = $('#ripple'), voiceEl = new Audio(); voiceEl.preload = 'auto';
function thumbXY(inp, v) { const r = inp.getBoundingClientRect(), f = (v - inp.min) / (inp.max - inp.min), th = 18; return { x: r.left + th / 2 + f * (r.width - th), y: r.top + r.height / 2 }; }
function elXY(sel) { const r = $(sel).getBoundingClientRect(); return { x: r.left + r.width * 0.45, y: r.top + r.height * 0.55 }; }
const director = {
  on: false, t: 0, ai: 0, run: [], cur: { x: 0, y: 0 }, vis: 0, visT: 0, rip: null, press: [], li: 0,
  start() {
    this.on = true; this.t = 0; this.ai = 0; this.run = []; this.press = []; this.rip = null; this.visT = 0; this.vis = 0; this.li = 0;
    const r = stageEl.getBoundingClientRect(); this.cur = { x: r.left + r.width * 0.7, y: r.top + r.height * 0.7 };
    ui.tour.textContent = '■ Stop tour 停止導覽'; $('#endcard').style.opacity = 0; $('#endHint').textContent = RECORD ? '' : 'Click to explore it yourself · 點一下自己玩';
  },
  stop() {
    this.on = false; ui.tour.textContent = '▶ Guided tour 導覽'; voiceEl.pause();
    cursorEl.style.opacity = 0; rippleEl.style.opacity = 0; $('#caption').style.opacity = 0; $('#verdict').style.opacity = 1;
    for (const k of ['th', 'depth', 'len', 'w', 'imax', 'rise', 'bulk', 'mid', 'hf', 'pins', 'planes']) ui[k].classList.remove('grab');
    if (this.t < END.t) { $('#endcard').style.opacity = 0; $('#endcard').style.pointerEvents = 'none'; }
  },
  update(dt) {
    this.t += dt; const t = this.t;
    while (this.ai < ACTS.length && ACTS[this.ai].t <= t) { this.begin(ACTS[this.ai]); this.ai++; }
    if (NARR && !RECORD) while (this.li < NARR.lines.length && NARR.lines[this.li].t <= t) { const l = NARR.lines[this.li++]; if (t - l.t < 0.5) { voiceEl.src = l.src; voiceEl.play().catch(() => {}); } }
    for (let i = this.run.length - 1; i >= 0; i--) {
      const a = this.run[i], u = clamp((t - a.t) / a.d, 0, 1);
      if (a.move) { const e = ease5(u), dx = a.to.x - a.from.x, dy = a.to.y - a.from.y; this.cur = { x: a.from.x + dx * e, y: a.from.y + dy * e - Math.sin(Math.PI * e) * Math.hypot(dx, dy) * 0.08 }; }
      else if (a.drag) { const v = lerp(a.from, a.to, ease5(u)), inp = ui[a.drag]; if (Math.round(v) !== +inp.value) setSlider(inp, Math.round(v)); this.cur = thumbXY(inp, v); }
      if (u >= 1) { if (a.drag) ui[a.drag].classList.remove('grab'); this.run.splice(i, 1); }
    }
    for (let i = this.press.length - 1; i >= 0; i--) if (t - this.press[i].t > 0.18) { this.press[i].el.classList.remove('press'); this.press.splice(i, 1); }
    if (t >= END.dur) { this.on = false; if (RECORD) return; this.stop(); $('#endcard').style.opacity = 1; $('#endcard').style.pointerEvents = 'auto'; }
  },
  begin(a) {
    const b = { ...a };
    if ('show' in a) { this.visT = this.t; this.vis = a.show ? 1 : 0; return; }
    if (a.set) { applyState(a.set); return; }
    const target = a.move ? (a.move[0] === 'slider' ? ui[a.move[1]] : a.move[0] === 'el' ? $(a.move[1]) : null) : null, Pn = $('#panel');
    if (target && !RECORD && Pn.scrollHeight > Pn.clientHeight + 1 && getComputedStyle(Pn).overflowY === 'auto') { const pr = Pn.getBoundingClientRect(), tr = target.getBoundingClientRect(); if (tr.bottom > pr.bottom - 8) Pn.scrollTop += tr.bottom - pr.bottom + 24; else if (tr.top < pr.top + 8) Pn.scrollTop -= pr.top - tr.top + 24; }
    if (a.move) { b.from = { ...this.cur }; if (a.move[0] === 'slider') b.to = thumbXY(ui[a.move[1]], +ui[a.move[1]].value); else if (a.move[0] === 'el') b.to = elXY(a.move[1]); else { const r = stageEl.getBoundingClientRect(); b.to = { x: r.left + r.width * 0.72, y: r.top + r.height * 0.62 }; } }
    if (a.drag) { b.from = +ui[a.drag].value; ui[a.drag].classList.add('grab'); }
    if (a.click) { const el = $(a.click); el.click(); el.classList.add('press'); this.press.push({ el, t: this.t }); this.rip = { x: this.cur.x, y: this.cur.y, t: this.t }; return; }
    this.run.push(b);
  },
  overlay() {
    const t = this.t, vis = this.vis ? ease((t - this.visT) / 0.3) : 1 - ease((t - this.visT) / 0.3);
    cursorEl.style.opacity = this.on ? vis : 0; cursorEl.style.transform = `translate(${(this.cur.x - 4).toFixed(1)}px,${(this.cur.y - 2).toFixed(1)}px)`;
    if (this.rip) { const u = (t - this.rip.t) / 0.45; if (u > 1) { rippleEl.style.opacity = 0; this.rip = null; } else { rippleEl.style.opacity = (1 - u) * 0.9; rippleEl.style.transform = `translate(${this.rip.x}px,${this.rip.y}px) scale(${0.4 + u * 0.9})`; } }
    let ci = -1; for (let i = 0; i < CAPS_T.length; i++) if (CAPS_T[i].t <= t) ci = i;
    const cap = $('#caption');
    if (ci >= 0) { const C = CAPS_T[ci]; if (C.zh) { cap.firstChild.textContent = C.zh; cap.lastChild.textContent = C.en; const fin = ease((t - C.t) / 0.25), fout = C.d ? 1 - ease((t - C.t - C.d - 0.5) / 0.3) : 1; cap.style.opacity = Math.min(fin, fout); cap.style.transform = `translateX(-50%) translateY(${(1 - fin) * 8}px)`; } else cap.style.opacity = 1 - ease((t - C.t) / 0.35); } else cap.style.opacity = 0;
    $('#verdict').style.opacity = this.on ? 0.0 : 1;
    if (t >= END.t) $('#endcard').style.opacity = ease((t - END.t) / 0.9);
  },
};
ui.tour.addEventListener('click', () => { if (director.on) director.stop(); else { voiceEl.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='; voiceEl.play().catch(() => {}); director.start(); } });
$('#panel').addEventListener('pointerdown', (e) => { if (e.isTrusted && director.on && !RECORD && e.target.closest('input,button') && !ui.tour.contains(e.target)) director.stop(); }, true);
$('.tabs').addEventListener('pointerdown', (e) => { if (e.isTrusted && director.on && !RECORD) director.stop(); }, true);
$('#endcard').addEventListener('click', () => { $('#endcard').style.opacity = 0; $('#endcard').style.pointerEvents = 'none'; });

/* ============================================================
   Main loop
   ============================================================ */
function frame(dt, render = true) {
  wallT += dt;
  if (director.on) director.update(dt);
  if (dirty.sig) calcSig(); if (dirty.pwr) calcPwr();
  if (!render) { if (mode === 'sig') { wave.acc += dt * 46; let n = Math.floor(wave.acc); wave.acc -= n; while (n-- > 0) stepWave(); } return; }
  fitStage(); g.clearRect(0, 0, W, H);
  if (mode === 'sig') { drawSignal(dt); plotS21(); plotEye(); updateSig(); } else { drawPower(dt); plotZ(); plotDroop(); updatePwr(); }
  if (director.on || RECORD) director.overlay();
}
applyState(DEFAULTS);
window.addEventListener('resize', () => cache.clear());
window.__si = { S, P, R, applyState, director, frame };
if (RECORD) {
  director.start();
  window.__advance = (dt) => { frame(dt); return { t: director.t, done: director.t >= END.dur }; };
  window.__seek = (t) => { while (director.t + 1 / 30 < t) frame(1 / 30, false); frame(1 / 30); return director.t; };
  window.__info = () => ({ dur: END.dur });
  const allText = document.body.innerText + CAPS_T.map((c) => c.zh).join('') + '殘樁背鑽後共振走線測試機晶片送出收到眼睛閉上了目標容許大電容中電容高頻電容電源接腳對遠端感測量晶片端的電壓板子上電流跳升後主要由與封裝裡供電';
  Promise.all(['400', '500', '600', '700', '900'].map((wt) => document.fonts.load(`${wt} 20px "Noto Sans TC"`, allText))).catch(() => {}).then(() => document.fonts.ready).then(() => { frame(0); window.__ready = true; });
} else {
  let last = performance.now(), failed = false;
  (function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; try { frame(dt); } catch (e) { if (!failed) { failed = true; console.error(e); } } requestAnimationFrame(loop); })(last);
}
