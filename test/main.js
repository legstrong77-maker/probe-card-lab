// Test Lab — the line, the six stations' read-outs, the defect matrix and the guided tour.
import * as THREE from 'three';
import { createStage, STX, STZ, ROW_Z, SP, NST, BOARD_Y, SPOT, ML, MLO_Y1, MLO_Y0, TOP, GAP, BT, L, BG, BPI, ballXZ } from './scene.js';
import { STATIONS, DEFECTS, DEF, DEFAULTS, coverage, AOI, FP, fpReadR, NET, leakR, netPaths, XR, MU, xrMu, xrSpectrum, MET, metH, metScan, DD } from './model.js';

const RECORD = new URLSearchParams(location.search).has('record');
const REC_DPR = +new URLSearchParams(location.search).get('dpr') || 1;
if (RECORD) document.documentElement.classList.add('rec');
const $ = (s) => document.querySelector(s);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const ease5 = (t) => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
const fmtT = (s) => (s >= 90 ? `${(s / 60).toFixed(1)} min` : `${Math.round(s)} s`);

const stageEl = $('#stage'), canvas = $('#gl');
const stage = createStage(canvas, { record: RECORD, dpr: REC_DPR });
const { camera, controls } = stage;

/* ============================================================
   State
   ============================================================ */
const S = { ...DEFAULTS, view: -1, defects: {}, on: [true, true, true, true, true, true], labels: true };
let wallT = 0;
const params = () => ({ aoiRes: S.aoiRes, fpGuard: S.fpGuard, fpTol: S.fpTol, netMode: S.netMode, netV: S.netV, xrKV: S.xrKV, xrTilt: S.xrTilt, xrFrames: S.xrFrames, metN: S.metN, ddCfg: S.ddCfg });
const ALL = Object.fromEntries(DEFECTS.map((d) => [d.id, true]));
let cov = null, covKey = '';
function covNow() { const P = params(), k = JSON.stringify(P); if (k !== covKey) { covKey = k; cov = coverage(P, ALL); } return cov; }
const planted = () => DEFECTS.filter((d) => S.defects[d.id]).map((d) => d.id);
const catchers = (id) => covNow().map((c, k) => (S.on[k] && c.r[id].caught ? k : -1)).filter((k) => k >= 0);
const TEST_D = [4.2, 5.4, 6.0, 5.0, 5.2, 5.6];           // seconds each station's animation takes on screen

/* ============================================================
   Board motion along the line
   ============================================================ */
// the board follows the U-shaped route painted on the floor; s is the distance along it
const ROUTE = [[-16, 0], [2 * SP, 0], [2 * SP, ROW_Z], [-16, ROW_Z]];
const SEGL = ROUTE.slice(1).map((p, i) => Math.hypot(p[0] - ROUTE[i][0], p[1] - ROUTE[i][1]));
function routePt(s) { for (let i = 0; i < SEGL.length; i++) { if (s <= SEGL[i] || i === SEGL.length - 1) { const u = clamp(s / SEGL[i], 0, 1), a = ROUTE[i], b = ROUTE[i + 1]; return [lerp(a[0], b[0], u), lerp(a[1], b[1], u)]; } s -= SEGL[i]; } return ROUTE[ROUTE.length - 1]; }
const S_OF = (k) => (k < 3 ? 16 + STX(k) : 16 + 2 * SP + Math.abs(ROW_Z) + (2 * SP - STX(k)));
const S_ENTRY = 2, S_EXIT = SEGL.reduce((a, b) => a + b, 0);
const bm = { s: S_OF(0), x: STX(0), z: 0, y: BOARD_Y[0], mv: null, at: 0 };
function moveBoard(s1, y1, d) { bm.mv = { s0: bm.s, y0: bm.y, s1, y1, t0: wallT, d: d ?? clamp(0.9 + Math.abs(s1 - bm.s) * 0.03, 1.0, 3.4) }; }
function moveToStation(k, d) { moveBoard(S_OF(k), BOARD_Y[k], d); bm.at = k; }
function boardTick() {
  const m = bm.mv;
  if (m) {
    const u = clamp((wallT - m.t0) / m.d, 0, 1), T = stage.TRANSIT_Y, far = Math.abs(m.s1 - m.s0) > 0.5;
    bm.s = lerp(m.s0, m.s1, ease5(far ? (u - 0.18) / 0.64 : u));
    bm.y = !far ? lerp(m.y0, m.y1, ease5(u)) : u < 0.5 ? lerp(m.y0, T, ease(u / 0.22)) : lerp(T, m.y1, ease((u - 0.78) / 0.22));
    if (u >= 1) bm.mv = null;
  }
  [bm.x, bm.z] = routePt(bm.s);
}
const boardMoving = () => !!bm.mv;
const parkedAt = () => (bm.mv ? -1 : Math.abs(S_OF(bm.at) - bm.s) < 1e-6 ? bm.at : -1);

/* ============================================================
   Camera
   ============================================================ */
const LINE_CAM = { p: [36, 76, 64], l: [25, -1, -15] };
const HERO = [
  { p: [8.5, 5.6, 12.5], l: [0, 2.7, 0] },
  { p: [10, 7.8, 13.5], l: [0, 2.8, 0] },
  { p: [9.5, 7.6, 13], l: [0, 2.9, 0] },
  { p: [9.0, 6.6, 13.5], l: [0, 3.4, 0] },
  { p: [9.5, 8.2, 13], l: [0, 2.6, -0.5] },
  { p: [12, 10.5, 16], l: [0, 3.4, -2.0] },
].map((c, k) => ({ p: [c.p[0] + STX(k), c.p[1], c.p[2] + STZ(k)], l: [c.l[0] + STX(k), c.l[1], c.l[2] + STZ(k)] }));
const fly = { on: false };
function flyTo(c, d = 1.5) { fly.on = true; fly.t0 = wallT; fly.d = d; fly.p0 = camera.position.toArray(); fly.l0 = controls.target.toArray(); fly.p1 = c.p; fly.l1 = c.l; }
function flyTick() {
  if (!fly.on) return false;
  const u = ease5((wallT - fly.t0) / fly.d), lift = Math.sin(Math.PI * u) * Math.min(14, Math.hypot(fly.p1[0] - fly.p0[0], fly.p1[2] - fly.p0[2]) * 0.15);
  camera.position.set(lerp(fly.p0[0], fly.p1[0], u), lerp(fly.p0[1], fly.p1[1], u) + lift, lerp(fly.p0[2], fly.p1[2], u));
  controls.target.set(lerp(fly.l0[0], fly.l1[0], u), lerp(fly.l0[1], fly.l1[1], u), lerp(fly.l0[2], fly.l1[2], u));
  camera.lookAt(controls.target);
  if (u >= 1) fly.on = false;
  return true;
}

/* ============================================================
   What each machine does on screen (positions in board coordinates)
   ============================================================ */
const partEnds = (o, gap) => { const ca = Math.cos(o.rot), sa = Math.sin(o.rot); return [[o.x + ca * gap, o.z - sa * gap, 0.035], [o.x - ca * gap, o.z + sa * gap, 0.035]]; };
const FP_SEQ = [
  { o: L.res[13], g: 0.05, what: 'R', id: 'wrongR' }, { o: L.diodes[6], g: 0.07, what: 'D', id: 'revDiode' }, { o: L.caps[31], g: 0.06, what: 'C', id: 'missingC' },
  { o: L.res[21], g: 0.05, what: 'R' }, { o: L.relays[14], g: 0.15, what: 'K', id: 'relay' }, { o: L.diodes[11], g: 0.07, what: 'D' }, { o: L.res[30], g: 0.05, what: 'R' },
];
function stFP(on, t) {
  const n = FP_SEQ.length, D = 0.95, i = Math.floor(t / D) % n, f = (t / D) % 1, s = FP_SEQ[i];
  const tg = partEnds(s.o, s.g).map((p) => [p[0], p[1], s.what === 'K' ? 0.24 : p[2]]);
  return { on, targets: tg, step: i, lift: on ? (f < 0.5 ? 1.0 * (1 - ease(f / 0.5)) + 0.25 : f < 0.62 ? 0.25 * (1 - ease((f - 0.5) / 0.12)) : f < 0.88 ? 0 : 0.25 * ease((f - 0.88) / 0.12)) : 2.2, contact: on && f >= 0.62 && f < 0.88, seq: s };
}
function netPath(A, B) {
  const ang = Math.atan2(B[1], B[0]), r1 = Math.hypot(...A) + 0.9;
  return [[A[0], MLO_Y1 + 0.005, A[1]], [A[0], TOP + GAP * 0.5, A[1]], [A[0] * 1.02, 0.02, A[1] * 1.02], [Math.cos(ang) * r1, 0.02, Math.sin(ang) * r1], [B[0] * 0.92, -0.02, B[1] * 0.92], [B[0], -TOP - 0.005, B[1]]];
}
const NET_SEQ = (() => {
  const pg = (i) => [L.pogo[i].x, L.pogo[i].z], pad = (i, k) => [(i - 19.5) * 0.031 * 1.5, (k - 19.5) * 0.031 * 1.5];
  const [bx, bz] = ballXZ(BG - 1, 4);
  return [
    { kind: 'cont', a: pad(28, 16), b: pg(40) },
    { kind: 'iso', a: [bx - 0.02, bz], a2: [bx - 0.02, bz + BPI], b: pg(12), b2: pg(13), id: 'bridge' },
    { kind: 'cont', a: pad(10, 33), b: pg(180) },
    { kind: 'iso', a: [-0.72, 0.36], a2: [-0.72, 0.46], b: pg(250), b2: pg(251), id: 'leak' },
    { kind: 'kelvin', a: [0.62, -0.55], b: pg(95), id: 'viaOpen' },
    { kind: 'cont', a: pad(5, 4), b: pg(300), id: 'openNet' },
  ];
})();
function stNet(on, t) {
  const n = NET_SEQ.length, D = 1.25, i = Math.floor(t / D) % n, f = (t / D) % 1, s = NET_SEQ[i];
  const contact = on && f > 0.4 && f < 0.9;
  return { on, a: s.a, b: s.b, lift: on ? (f < 0.35 ? 0.9 * (1 - ease(f / 0.35)) : f < 0.4 ? 0 : f < 0.9 ? 0 : 0.5 * ease((f - 0.9) / 0.1)) : 2.0, contact,
    path: netPath(s.a, s.b), path2: s.kind === 'iso' ? netPath(s.a2, s.b2) : null, pathKey: i, leak: s.id === 'leak' && S.defects.leak && contact, leakAt: [-0.72, MLO_Y1, 0.41], seq: s, bowY: S.defects.warp ? 0.05 : 0 };
}
function metSpot(N, t) {
  const n = N * N, D = 0.28, i = Math.floor(t / D) % (n + 4), j = Math.min(i, n - 1), r = Math.floor(j / N), c = r % 2 ? N - 1 - (j % N) : j % N;
  const u = N === 1 ? 0 : -1 + 2 * c / (N - 1), v = N === 1 ? 0 : -1 + 2 * r / (N - 1);
  return { u, v, done: Math.min(i + 1, n), idx: j, rr: r, cc: c };
}

/* ============================================================
   Labels: a sign over each station, a tag on each marked defect
   ============================================================ */
const signEls = STATIONS.map((s, k) => { const el = document.createElement('div'); el.className = 'sign'; el.innerHTML = `<b>0${k + 1} · ${s.tag}</b><span>${s.zh}</span><small>${s.en}</small>`; $('#labels').appendChild(el); return el; });
const tagEls = Object.fromEntries(DEFECTS.map((d) => { const el = document.createElement('div'); el.className = 'dtag'; el.innerHTML = `${d.zh}<small></small>`; $('#labels').appendChild(el); return [d.id, el]; }));
const _v = new THREE.Vector3();
function toScreen(x, y, z, W, H) { _v.set(x, y, z).project(camera); return { x: (_v.x + 1) / 2 * W, y: (1 - _v.y) / 2 * H, ok: _v.z < 1 && _v.z > -1 }; }
function updateLabels(W, H, marks) {
  const near = camera.position.distanceTo(controls.target) < 40;   // close views show the defect tags
  signEls.forEach((el, k) => {
    const q = toScreen(STX(k), k === 3 ? 10.2 : 9.6, STZ(k), W, H), show = q.ok && (!near || Math.hypot(controls.target.x - STX(k), controls.target.z - STZ(k)) < 7) && q.x > -80 && q.x < W + 80;
    el.style.transform = show ? `translate(${(q.x - el.offsetWidth / 2).toFixed(1)}px,${(q.y - el.offsetHeight).toFixed(1)}px)` : 'translate(-9999px,0)';
    el.classList.toggle('cur', S.view === k || run.k === k); el.classList.toggle('off', !S.on[k]);
    el.style.opacity = near && S.view === k ? 0.0 : 1;
  });
  const items = [];
  for (const d of DEFECTS) {
    const el = tagEls[d.id], m = marks[d.id];
    if (!m || !near || !S.labels) { el.style.transform = 'translate(-9999px,0)'; continue; }
    const p = SPOT[d.id], w = stage.board.localToWorld(new THREE.Vector3(p[0], p[1], p[2])), q = toScreen(w.x, w.y, w.z, W, H);
    if (!q.ok) { el.style.transform = 'translate(-9999px,0)'; continue; }
    el.classList.toggle('esc', m === 'warn');
    const sm = el.lastChild, txt = m === 'warn' ? '沒被抓到，流到客戶端' : m.by;
    if (sm.textContent !== txt) sm.textContent = txt;
    items.push({ el, sx: q.x, sy: q.y, h: el.offsetHeight, w: el.offsetWidth });
  }
  items.sort((a, b) => a.sy - b.sy); let prev = -1e9;
  for (const it of items) { let y = Math.max(it.sy - it.h - 14, prev + 4, 70); prev = y + it.h; const x = clamp(it.sx + 16, 6, W - it.w - 6); it.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`; }
}

/* ============================================================
   2D read-out (one canvas, drawn by the station in view)
   ============================================================ */
function fitCanvas(cv) {
  const r = cv.getBoundingClientRect(), d = RECORD ? REC_DPR : Math.min(devicePixelRatio, 2);
  const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, r.width, r.height);
  return { g, w: r.width, h: r.height };
}
const C = { grid: '#1a2230', text: '#e8edf4', muted: '#8d98aa', dim: '#566174', acc: '#4cc9f0', red: '#ff5d5d', amber: '#ffb224', green: '#48d38a', pcb: '#0f3d2a', cu: '#c9a46a', mag: '#ff5dd2' };
const mono = (sz, wt = 600) => `${wt} ${sz}px "JetBrains Mono", monospace`;
const sans = (sz, wt = 600) => `${wt} ${sz}px Inter, "Noto Sans TC", sans-serif`;
function pill(g, x, y, txt, col, bg) { g.font = sans(11.5, 700); const w = g.measureText(txt).width + 14; g.fillStyle = bg || 'rgba(8,11,17,.85)'; g.strokeStyle = col; g.lineWidth = 1; g.beginPath(); g.roundRect(x, y, w, 20, 5); g.fill(); g.stroke(); g.fillStyle = col; g.textBaseline = 'middle'; g.fillText(txt, x + 7, y + 10.5); g.textBaseline = 'alphabetic'; return w; }
function resultLines(g, x, y, k, ids, maxW) {
  const c = covNow()[k]; let yy = y;
  for (const id of ids) {
    const r = c.r[id], pl = S.defects[id], col = r.caught ? C.green : C.dim;
    g.font = sans(12, 700); g.fillStyle = pl ? C.text : C.muted; g.fillText(`${r.caught ? '✓' : '·'} ${DEF[id].zh}`, x, yy);
    g.font = sans(11, 500); g.fillStyle = col; const t = r.val; g.fillText(t.length > 26 ? t.slice(0, 25) + '…' : t, x + 12, yy + 15);
    yy += 36; if (yy > y + 999) break;
  }
  return yy;
}

// ---- 0 · AOI: what the camera sees, at the chosen resolution
const aoiOff = document.createElement('canvas');
function drawAOI(g, w, h) {
  const P = params(), c = covNow()[0], res = P.aoiRes, mmW = 7.0, mmH = 4.6;     // the field shown: a 7 × 4.6 mm patch
  const iw = Math.max(8, Math.round(mmW * 1000 / res)), ih = Math.max(6, Math.round(mmH * 1000 / res));
  aoiOff.width = iw; aoiOff.height = ih; const o = aoiOff.getContext('2d'), s = iw / mmW;
  o.fillStyle = C.pcb; o.fillRect(0, 0, iw, ih);
  o.strokeStyle = 'rgba(80,160,105,.6)'; o.lineWidth = 0.15 * s; for (let i = 0; i < 6; i++) { o.beginPath(); o.moveTo(0, (0.5 + i * 0.75) * s); o.lineTo(iw, (0.6 + i * 0.75) * s); o.stroke(); }
  const part = (x, y, l, wd, body, pads = true, end = '#d9dde2') => {
    if (pads) { o.fillStyle = '#c8c39b'; o.fillRect((x - l / 2 - 0.12) * s, (y - wd / 2 - 0.05) * s, 0.3 * s, (wd + 0.1) * s); o.fillRect((x + l / 2 - 0.18) * s, (y - wd / 2 - 0.05) * s, 0.3 * s, (wd + 0.1) * s); }
    if (!body) return; o.fillStyle = body; o.fillRect((x - l / 2) * s, (y - wd / 2) * s, l * s, wd * s);
    o.fillStyle = end; o.fillRect((x - l / 2) * s, (y - wd / 2) * s, 0.18 * s, wd * s); o.fillRect((x + l / 2 - 0.18) * s, (y - wd / 2) * s, 0.18 * s, wd * s);
  };
  const capX = [0.8, 1.9, 3.0, 4.1, 5.2, 6.3];
  capX.forEach((x, i) => part(x, 0.9, 1.0, 0.5, i === 3 && S.defects.missingC ? null : '#b08a5a'));
  for (let i = 0; i < 4; i++) part(1.0 + i * 1.7, 2.4, 1.0, 0.5, '#16181c', true, '#c9ccd1');
  // the diode: body with a small polarity bar at the cathode end
  const dx = 3.5, dy = 3.75, rev = S.defects.revDiode;
  part(dx, dy, 1.6, 0.8, '#1a1b1f', true, '#1a1b1f');
  o.fillStyle = '#d6d9de'; o.fillRect((dx + (rev ? -0.62 : 0.47)) * s, (dy - 0.32) * s, AOI.diodeMark * s, 0.64 * s);
  o.fillStyle = 'rgba(235,240,235,.85)'; o.font = `${Math.max(4, 0.42 * s)}px monospace`; o.fillText('C34', 3.85 * s, 0.35 * s + 0.4 * s); o.fillText('D7', 4.6 * s, 4.3 * s);
  // blit it pixelated
  const pw = w * 0.62, ph = pw * mmH / mmW, px = 10, py = 10;
  g.imageSmoothingEnabled = false; g.drawImage(aoiOff, px, py, pw, ph); g.imageSmoothingEnabled = true;
  g.strokeStyle = C.grid; g.strokeRect(px, py, pw, ph);
  const S2 = pw / mmW, box = (x, y, l, wd, col, txt) => { g.strokeStyle = col; g.lineWidth = 1.6; g.strokeRect(px + (x - l / 2 - 0.2) * S2, py + (y - wd / 2 - 0.15) * S2, (l + 0.4) * S2, (wd + 0.3) * S2); if (txt) { g.font = sans(11, 700); g.fillStyle = col; g.fillText(txt, px + (x - l / 2 - 0.2) * S2, py + (y - wd / 2 - 0.25) * S2); } };
  capX.forEach((x, i) => box(x, 0.9, 1.0, 0.5, i === 3 && S.defects.missingC ? C.red : 'rgba(72,211,138,.7)', i === 3 && S.defects.missingC ? '少件' : ''));
  const rOk = c.r.revDiode.caught; box(dx, dy, 1.6, 0.8, rev ? (rOk ? C.red : C.amber) : 'rgba(72,211,138,.7)', rev ? (rOk ? '極性反了' : '看不清極性?') : '');
  g.font = mono(10.5, 500); g.fillStyle = C.muted; g.fillText(`${iw}×${ih} px 的局部 · 7 × 4.6 mm`, px, py + ph + 15);
  // right column
  const x0 = px + pw + 16; let y = 26;
  g.font = mono(11, 700); g.fillStyle = C.acc; g.fillText(`${res} μm / px`, x0, y); y += 18;
  g.font = sans(11.5, 500); g.fillStyle = C.muted;
  g.fillText(`一張 ${c.fov[0].toFixed(0)} × ${c.fov[1].toFixed(0)} mm`, x0, y); y += 16; g.fillText(`整片 ${c.shots} 張`, x0, y); y += 16; g.fillText(`極性標記 ${c.markPx.toFixed(1)} px`, x0, y); y += 24;
  resultLines(g, x0, y, 0, ['missingC', 'revDiode', 'wrongR'], w - x0);
}

// ---- 1 · flying probe: the guarded measurement
function drawFP(g, w, h) {
  const P = params(), c = covNow()[1], guard = P.fpGuard, bad = !!S.defects.wrongR, Rx = bad ? FP.wrong : FP.nom, read = fpReadR(Rx, guard), dev = read / FP.nom - 1, tol = P.fpTol / 100, pass = Math.abs(dev) <= tol;
  const ax = 46, bx = 250, yT = 60, yB = 150, gx = 148, gy = 200;
  g.lineWidth = 2; g.lineCap = 'round';
  // the resistor under test, A to B
  const res = (x0, y0, x1, y1, col, lbl) => {
    const n = 7, dx = (x1 - x0), dy = (y1 - y0), len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len, px = -uy, py = ux, a = 0.3, b = 0.7;
    g.strokeStyle = col; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + dx * a, y0 + dy * a);
    for (let i = 1; i <= n; i++) { const t = a + (b - a) * i / n, s = i === n ? 0 : (i % 2 ? 7 : -7); g.lineTo(x0 + dx * t + px * s, y0 + dy * t + py * s); }
    g.lineTo(x1, y1); g.stroke();
    if (lbl) { g.font = sans(12, 700); g.fillStyle = col; g.fillText(lbl, x0 + dx * 0.5 + px * 14 - 18, y0 + dy * 0.5 + py * 14 - 4); }
  };
  res(ax, yT, bx, yT, bad ? C.amber : C.text, '');
  g.font = sans(12, 700); g.fillStyle = bad ? C.amber : C.text; g.fillText(`Rx ${(Rx / 1e3).toFixed(1)} kΩ${bad ? '（錯件）' : ''}`, (ax + bx) / 2 - 34, yT + 24);
  res(ax, yT, gx, gy, C.muted, 'Ra'); res(gx, gy, bx, yT, C.muted, 'Rb');
  // current: through Rx always; through Ra–Rb only without guard
  const flow = (pts, col, sp) => { const tt = (wallT * sp) % 1; g.fillStyle = col; for (let k = 0; k < 4; k++) { const u = (tt + k / 4) % 1, seg = pts.length - 1, f = u * seg, i = Math.floor(f), q = f - i; const x = lerp(pts[i][0], pts[i + 1][0], q), y = lerp(pts[i][1], pts[i + 1][1], q); g.beginPath(); g.arc(x, y, 3, 0, 7); g.fill(); } };
  flow([[ax, yT], [bx, yT]], C.acc, 0.6);
  if (!guard) flow([[ax, yT], [gx, gy], [bx, yT]], C.red, 0.5);
  else flow([[ax, yT], [gx, gy], [gx, gy + 40]], C.green, 0.5);
  // probes
  const node = (x, y, lbl, col) => { g.fillStyle = col; g.beginPath(); g.arc(x, y, 5, 0, 7); g.fill(); g.font = mono(11, 700); g.fillText(lbl, x - 6, y - 10); };
  node(ax, yT, 'A', C.acc); node(bx, yT, 'B', C.acc); node(gx, gy, 'G', guard ? C.green : C.dim);
  g.strokeStyle = C.acc; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(ax, yT); g.lineTo(ax, yT - 34); g.lineTo(bx, yT - 34); g.lineTo(bx, yT); g.stroke(); g.setLineDash([]);
  g.font = sans(11, 600); g.fillStyle = C.acc; g.fillText('電流源 → 量 A、B 之間的電壓', ax + 26, yT - 40);
  if (guard) { g.strokeStyle = C.green; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(gx, gy); g.lineTo(gx, gy + 40); g.lineTo(gx + 70, gy + 40); g.stroke(); g.setLineDash([]); g.font = sans(11, 600); g.fillStyle = C.green; g.fillText('護衛探針：把 G 拉到跟 B 同電位', gx - 40, gy + 56); }
  else { g.font = sans(11, 600); g.fillStyle = C.red; g.fillText('沒有護衛：電流也從 Ra、Rb 繞過去', gx - 70, gy + 40); }
  // the reading
  const x0 = 290; let y = 30;
  g.font = mono(11, 700); g.fillStyle = C.muted; g.fillText('量到 READING', x0, y); y += 30;
  g.font = mono(26, 800); g.fillStyle = pass ? C.green : C.red; g.fillText(`${(read / 1e3).toFixed(2)} kΩ`, x0, y); y += 20;
  g.font = sans(12, 600); g.fillStyle = C.muted; g.fillText(`標準 10.00 kΩ ±${P.fpTol}%　${dev >= 0 ? '+' : ''}${(dev * 100).toFixed(1)} %`, x0, y); y += 22;
  // tolerance bar
  const bw = w - x0 - 16, mid = x0 + bw / 2, sc = bw / 2 / 0.6;
  g.fillStyle = '#1a212c'; g.fillRect(x0, y, bw, 8); g.fillStyle = 'rgba(72,211,138,.35)'; g.fillRect(mid - tol * sc, y, 2 * tol * sc, 8);
  g.fillStyle = pass ? C.green : C.red; g.fillRect(clamp(mid + dev * sc, x0, x0 + bw) - 1.5, y - 4, 3, 16); y += 30;
  g.font = sans(11.5, 600); g.fillStyle = c.falseCalls > 0.5 ? C.amber : C.muted;
  g.fillText(c.falseCalls > 0.5 ? `好的 ±1% 電阻也會被誤判：約 ${c.falseCalls.toFixed(0)} 顆` : '好的 ±1% 電阻不會被誤判', x0, y); y += 26;
  resultLines(g, x0, y, 1, ['wrongR', 'revDiode', 'missingC']);
}

// ---- 2 · net test: two-wire vs four-wire, and the isolation meter
function drawNet(g, w, h) {
  const P = params(), c = covNow()[2], four = P.netMode === '4w', paths = netPaths(P, S.defects);
  // left: the power-path readings
  const x0 = 14, y0 = 34, pw = w * 0.5 - 24, ph = h - 82;
  g.font = mono(11, 700); g.fillStyle = C.muted; g.fillText(`電源路徑 ${four ? '四線' : '兩線'} 量測 · mΩ`, x0, 20);
  const vals = paths.map((p) => (four ? p.w4 : p.w2) * 1e3), vmax = four ? 6.5 : 450, sy = (v) => y0 + ph - v / vmax * ph;
  g.strokeStyle = C.grid; g.lineWidth = 1; for (let v = 0; v <= vmax; v += four ? 1 : 100) { g.beginPath(); g.moveTo(x0, sy(v)); g.lineTo(x0 + pw, sy(v)); g.stroke(); g.font = mono(9.5, 500); g.fillStyle = C.dim; g.fillText(v.toFixed(0), x0 + pw + 3, sy(v) + 3); }
  const gold = NET.pp * 1e3, lo = gold * (1 - NET.ppLim), hi = gold * (1 + NET.ppLim);
  g.fillStyle = 'rgba(72,211,138,.18)'; g.fillRect(x0, sy(hi), pw, Math.max(1.5, sy(lo) - sy(hi)));
  const bw = pw / paths.length;
  paths.forEach((p, i) => {
    const v = vals[i], out = four && (v > hi || v < lo);
    g.fillStyle = out ? C.red : four ? C.acc : '#5d7a99'; g.fillRect(x0 + i * bw + bw * 0.22, sy(v), bw * 0.56, y0 + ph - sy(v));
    g.font = mono(9, 600); g.fillStyle = out ? C.red : C.muted; g.fillText(four ? v.toFixed(2) : v.toFixed(0), x0 + i * bw + bw * 0.12, sy(v) - 4);
  });
  g.font = sans(11, 500); g.fillStyle = four ? C.green : C.amber;
  g.fillText(four ? '綠帶：標準值 ±10 %。接觸電阻被扣掉了' : '每次量都多了兩個探針接觸電阻', x0, y0 + ph + 18);
  g.fillText(four ? '' : '（幾十到幾百 mΩ），1 mΩ 的差看不出來', x0, y0 + ph + 34);
  // right: isolation — resistance of the planted residue against the test voltage
  const xr = w * 0.5 + 6; let y = 20;
  g.font = mono(11, 700); g.fillStyle = C.muted; g.fillText('絕緣測試 ISOLATION', xr, y);
  g.font = mono(18, 800); g.fillStyle = C.acc; g.fillText(`${P.netV} V`, w - 64, y + 2); y += 10;
  const cw = w - xr - 14, ch = 96, lgY = (R) => y + ch - clamp((Math.log10(R) - 6) / 4.3, 0, 1) * ch, vX = (V) => xr + (V - 5) / 245 * cw;
  g.strokeStyle = C.grid; g.lineWidth = 1; g.strokeRect(xr, y, cw, ch);
  ['1M', '10M', '100M', '1G', '10G'].forEach((t, i) => { const Y = lgY(10 ** (6 + i)); g.font = mono(9, 500); g.fillStyle = C.dim; g.fillText(t, xr + 3, Y - 2); });
  g.fillStyle = 'rgba(255,93,93,.12)'; g.fillRect(xr, lgY(NET.isoMin), cw, y + ch - lgY(NET.isoMin));
  g.strokeStyle = C.red; g.setLineDash([5, 4]); g.beginPath(); g.moveTo(xr, lgY(NET.isoMin)); g.lineTo(xr + cw, lgY(NET.isoMin)); g.stroke(); g.setLineDash([]);
  g.font = mono(9.5, 600); g.fillStyle = C.red; g.fillText('下限 100 MΩ', xr + cw - 70, lgY(NET.isoMin) + 12);
  if (S.defects.leak) {
    g.beginPath(); for (let V = 5; V <= 250; V += 5) { const X = vX(V), Y = lgY(leakR(V)); V === 5 ? g.moveTo(X, Y) : g.lineTo(X, Y); } g.strokeStyle = C.mag; g.lineWidth = 1.8; g.stroke();
    const R0 = leakR(P.netV); g.fillStyle = R0 < NET.isoMin ? C.red : C.amber; g.beginPath(); g.arc(vX(P.netV), lgY(R0), 5, 0, 7); g.fill();
    g.font = sans(10.5, 600); g.fillStyle = C.mag; g.fillText('有殘留物的那一對網路', xr + 6, y + 14);
  } else { g.font = sans(11, 500); g.fillStyle = C.dim; g.fillText('好的網路之間：遠高於 10 GΩ', xr + 8, y + 18); }
  g.strokeStyle = C.acc; g.lineWidth = 1; g.beginPath(); g.moveTo(vX(P.netV), y); g.lineTo(vX(P.netV), y + ch); g.stroke();
  g.font = mono(9, 500); g.fillStyle = C.dim; g.fillText('5 V', xr, y + ch + 11); g.fillText('250 V', xr + cw - 30, y + ch + 11);
  y += ch + 30;
  resultLines(g, xr, y, 2, ['viaOpen', 'leak', 'bridge', 'openNet']);
}

// ---- 3 · X-ray: a corner of the ball grid, ray-cast through solder, copper and laminate
const XRF = { n: 6, px: 192 };                         // balls per side in the field, image pixels
const xrImg = { key: '', maps: null, kv: -1, T: null, frame: -1 };
const xrCv = document.createElement('canvas'); xrCv.width = xrCv.height = XRF.px;
function xrBalls(D) {
  const out = [];
  for (let k = 0; k < XRF.n; k++) for (let i = 0; i < XRF.n; i++) {
    const b = { x: i - (XRF.n - 1) / 2, z: k - (XRF.n - 1) / 2, voids: [], hip: false, i, k };
    const hsh = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453 % 1;
    if (Math.abs(hsh) > 0.45) b.voids.push({ dx: 0.08 * Math.sin(i * 3 + k), dz: 0.07 * Math.cos(i + 2 * k), r: XR.ball / 2 * Math.sqrt(XR.voidGood) * (0.6 + Math.abs(hsh) * 0.5), dy: 0.02 });
    if (D.void && i === 1 && k === 4) b.voids = [{ dx: 0.04, dz: -0.03, r: XR.ball / 2 * Math.sqrt(XR.voidBad), dy: 0.03 }];
    if (D.hip && i === 4 && k === 1) b.hip = true;
    out.push(b);
  }
  return out;
}
/** Path lengths (mm) of solder, copper and laminate for every pixel; tilt rotates the beam about the image x axis. */
function xrPaths(D, tiltDeg) {
  const N = XRF.px, fov = XRF.n * 1.0, th = tiltDeg * Math.PI / 180, ct = Math.cos(th), st = Math.sin(th);
  const sn = new Float32Array(N * N), cu = new Float32Array(N * N), lam = new Float32Array(N * N);
  const balls = xrBalls(D), hb = XR.h, R = XR.ball / 2, padR = 0.25, padT = 0.035;
  // beam direction (bx, by) in the x–y plane; a pixel at image coordinate u sees the line {u·e + s·b}
  const bx = -st, by = ct, ex = ct, ey = st;
  const chordE = (X0, Y0, A, Cc) => { const a = bx * bx / (A * A) + by * by / (Cc * Cc), b = 2 * (X0 * bx / (A * A) + Y0 * by / (Cc * Cc)), c = X0 * X0 / (A * A) + Y0 * Y0 / (Cc * Cc) - 1, d = b * b - 4 * a * c; return d > 0 ? Math.sqrt(d) / a : 0; };
  const chordBox = (X0, Y0, hw, y0, y1) => {   // line through a rectangle |x| < hw, y0 < y < y1
    let s0 = -1e9, s1 = 1e9;
    if (Math.abs(bx) < 1e-9) { if (Math.abs(X0) > hw) return 0; } else { let a = (-hw - X0) / bx, b = (hw - X0) / bx; if (a > b) [a, b] = [b, a]; s0 = Math.max(s0, a); s1 = Math.min(s1, b); }
    { let a = (y0 - Y0) / by, b = (y1 - Y0) / by; if (a > b) [a, b] = [b, a]; s0 = Math.max(s0, a); s1 = Math.min(s1, b); }
    return Math.max(0, s1 - s0);
  };
  const lamPath = XR.board / ct;
  for (let py = 0; py < N; py++) {
    const z = (py / (N - 1) - 0.5) * fov;
    for (let px = 0; px < N; px++) {
      const u = (px / (N - 1) - 0.5) * fov * ct, X = u * ex, Y = u * ey;  // the point on the line at s = 0; the oblique view is zoomed so the pitch stays the same on screen
      let lS = 0, lC = 0;
      for (const b of balls) {
        const dz = z - b.z; if (Math.abs(dz) > 0.5) continue;
        const X0 = X - b.x, Y0 = Y;
        if (Math.abs(X0 - 0) > 1.2 + Math.abs(st) * 0.6) continue;
        // copper pads above (MLO side) and below (PCB side)
        const pw = padR * padR - dz * dz;
        if (pw > 0) { const hw = Math.sqrt(pw); lC += chordBox(X0, Y0, hw, hb / 2, hb / 2 + padT) + chordBox(X0, Y0, hw, -hb / 2 - padT, -hb / 2); }
        const q = R * R - dz * dz; if (q <= 0) continue;
        const k = Math.sqrt(q / (R * R));
        if (!b.hip) lS += chordE(X0, Y0, R * k, hb / 2 * k);
        else {   // the ball sits on top, the paste stays on the pad, a thin gap between them
          const yc = hb * 0.12, cb = hb * 0.36; lS += chordE(X0, Y0 - yc, R * 0.98 * k, cb * k);
          const yp = -hb * 0.43, cp = hb * 0.07, Rp = R * 0.86; const qp = Rp * Rp - dz * dz; if (qp > 0) lS += chordE(X0, Y0 - yp, Math.sqrt(qp), cp * Math.sqrt(qp) / Rp);
        }
        for (const v of b.voids) { const dzv = dz - v.dz, qv = v.r * v.r - dzv * dzv; if (qv > 0) lS -= chordE(X0 - v.dx, Y0 - v.dy, Math.sqrt(qv), Math.sqrt(qv)); }
      }
      // the bridge between two balls of the second column
      if (D.bridge && Math.abs(z) < 0.5) {   // a solder neck joining balls (2, 2) and (2, 3), thickest midway
        const X0 = X - (2 - (XRF.n - 1) / 2), wz = 0.16 + 0.06 * (Math.abs(z) / 0.5) ** 2;
        lS += chordE(X0, Y, wz, hb * 0.42);
      }
      // vias between balls (dog-bone), copper barrels through the board
      const vx = u - Math.round(u), vz = z - Math.round(z), rv = Math.hypot(vx, vz);   // dog-bone vias sit between four balls
      if (rv < 0.13 && rv > 0.09 && Math.abs(st) < 0.01) lC += XR.board * 0.4;
      lC += XR.cu / ct; const i = py * N + px; sn[i] = Math.max(0, lS); cu[i] = lC; lam[i] = lamPath;
    }
  }
  return { sn, cu, lam, balls };
}
function xrTransmit(maps, kV) {
  const sp = xrSpectrum(kV), n = maps.sn.length, T = new Float32Array(n);
  for (let i = 0; i < n; i++) { let t = 0; for (const b of sp) t += b.w * Math.exp(-b.sn * maps.sn[i] - b.cu * maps.cu[i] - b.fr4 * maps.lam[i]); T[i] = t; }
  return T;
}
let noiseSeed = 1;
function rnd() { noiseSeed = (noiseSeed * 16807) % 2147483647; return noiseSeed / 2147483647; }
function renderXray() {
  const P = params(), key = `${P.xrTilt}|${S.defects.void}|${S.defects.hip}|${S.defects.bridge}`;
  if (key !== xrImg.key) { xrImg.key = key; xrImg.maps = xrPaths(S.defects, P.xrTilt); xrImg.kv = -1; }
  if (xrImg.kv !== P.xrKV) { xrImg.kv = P.xrKV; xrImg.T = xrTransmit(xrImg.maps, P.xrKV); }
  const fr = Math.floor(wallT * 12); if (fr === xrImg.frame && xrImg.drawn === key + P.xrKV + P.xrFrames) return; xrImg.frame = fr; xrImg.drawn = key + P.xrKV + P.xrFrames;
  const N = XRF.px, o = xrCv.getContext('2d'), im = o.createImageData(N, N), T = xrImg.T, N0 = XR.N90 * (P.xrKV / 90) ** 2 * P.xrFrames;
  let tmax = 0; for (let i = 0; i < T.length; i++) tmax = Math.max(tmax, T[i]);
  for (let i = 0; i < T.length; i++) {
    const n = N0 * T[i], g1 = Math.sqrt(-2 * Math.log(rnd() + 1e-9)) * Math.cos(6.2832 * rnd()), cnt = Math.max(0, n + Math.sqrt(n) * g1);
    const v = Math.pow(clamp(cnt / (N0 * tmax), 0, 1), 0.55) * 255;
    im.data[i * 4] = v * 0.92; im.data[i * 4 + 1] = v * 0.97; im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = 255;
  }
  o.putImageData(im, 0, 0);
  const tex = stage.xrDraw.tex, tc = tex.userData.c, tg = tex.userData.g; tg.drawImage(xrCv, 0, 0, tc.width, tc.height); tex.needsUpdate = true;
}
function drawXray(g, w, h) {
  const P = params(), c = covNow()[3];
  renderXray();
  const s = Math.min(h - 20, w * 0.55), x0 = 10, y0 = 10, k = s / XRF.n;
  g.imageSmoothingEnabled = true; g.drawImage(xrCv, x0, y0, s, s); g.strokeStyle = C.grid; g.strokeRect(x0, y0, s, s);
  // analysis overlays at the balls of interest (top-down coordinates; shifted by the tilt for the pads above)
  const bp = (i, kk) => [x0 + (i + 0.5) * k, y0 + (kk + 0.5) * k];
  if (S.defects.void) { const [x, y] = bp(1, 4), cv = c.r.void.caught; g.strokeStyle = cv ? C.red : C.amber; g.lineWidth = 1.6; g.beginPath(); g.arc(x, y, k * 0.36, 0, 7); g.stroke(); g.font = sans(11, 700); g.fillStyle = g.strokeStyle; g.fillText(cv ? `空洞 ${Math.round(XR.voidBad * 100)}%` : '?', x - k * 0.36, y - k * 0.42); }
  if (S.defects.hip) { const [x, y] = bp(4, 1), cv = c.r.hip.caught; g.strokeStyle = cv ? C.red : 'rgba(141,152,170,.5)'; g.lineWidth = 1.6; g.beginPath(); g.arc(x, y, k * 0.4, 0, 7); g.stroke(); if (cv) { g.font = sans(11, 700); g.fillStyle = C.red; g.fillText('枕頭效應', x - k * 0.4, y - k * 0.46); } }
  if (S.defects.bridge && c.r.bridge.caught) { const [x, y] = bp(2, 2.5); g.strokeStyle = C.red; g.lineWidth = 1.6; g.strokeRect(x - k * 0.3, y - k * 0.75, k * 0.6, k * 1.5); g.font = sans(11, 700); g.fillStyle = C.red; g.fillText('橋接', x + k * 0.34, y); }
  g.font = mono(10, 500); g.fillStyle = C.muted; g.fillText(`${P.xrKV} kV · ${P.xrTilt}° · ${P.xrFrames} 張疊加 · 1.0 mm 間距`, x0, y0 + s + 14);
  // right: transmission vs kV and the verdicts
  const xr = x0 + s + 16, cw = w - xr - 12; let y = 22;
  g.font = mono(11, 700); g.fillStyle = C.muted; g.fillText('穿過一顆錫球的比例', xr, y); y += 8;
  const gh = 64; g.strokeStyle = C.grid; g.strokeRect(xr, y, cw, gh);
  g.beginPath(); for (let kv = 50; kv <= 130; kv += 2) { const t = xrSpectrum(kv).reduce((a, b) => a + b.w * Math.exp(-b.sn * XR.h), 0), X = xr + (kv - 50) / 80 * cw, Y = y + gh - clamp(t / 0.5, 0, 1) * gh; kv === 50 ? g.moveTo(X, Y) : g.lineTo(X, Y); } g.strokeStyle = C.acc; g.lineWidth = 1.6; g.stroke();
  const tNow = xrSpectrum(P.xrKV).reduce((a, b) => a + b.w * Math.exp(-b.sn * XR.h), 0); g.fillStyle = C.text; g.beginPath(); g.arc(xr + (P.xrKV - 50) / 80 * cw, y + gh - clamp(tNow / 0.5, 0, 1) * gh, 4, 0, 7); g.fill();
  g.font = mono(9.5, 500); g.fillStyle = C.dim; g.fillText('50 kV', xr, y + gh + 12); g.fillText('130', xr + cw - 20, y + gh + 12); g.fillText(`${(tNow * 100).toFixed(1)} %`, xr + cw - 44, y + 12);
  y += gh + 34;
  resultLines(g, xr, y, 3, ['void', 'hip', 'bridge']);
}

// ---- 4 · flatness: the measured height map and the fitted plane
function heat(t) { t = clamp(t, 0, 1); const st = [[0, [40, 70, 160]], [0.35, [60, 170, 220]], [0.6, [120, 210, 120]], [0.8, [250, 200, 70]], [1, [255, 90, 80]]]; let i = 1; while (i < st.length - 1 && st[i][0] < t) i++; const [t0, a] = st[i - 1], [t1, b] = st[i], u = (t - t0) / (t1 - t0); return a.map((v, j) => Math.round(v + (b[j] - v) * u)); }
const metOff = document.createElement('canvas');
function drawMet(g, w, h) {
  const P = params(), c = covNow()[4], s = c.scan, N = P.metN, live = metLive.done;
  const sz = Math.min(h - 40, w * 0.46), x0 = 12, y0 = 12;
  // the true surface, faint, with measured points on top
  const R = 64; metOff.width = metOff.height = R; const o = metOff.getContext('2d'), im = o.createImageData(R, R);
  let lo = 1e9, hi = -1e9; const zz = [];
  for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) { const u = -1 + 2 * i / (R - 1), v = -1 + 2 * j / (R - 1), z = metH(u, v, S.defects) - (s.plane[0] + s.plane[1] * u + s.plane[2] * v); zz.push(z); lo = Math.min(lo, z); hi = Math.max(hi, z); }
  const span = Math.max(40, hi - lo);
  zz.forEach((z, i) => { const [r, gg, b] = heat((z - lo) / span); im.data.set([r * 0.55, gg * 0.55, b * 0.55, 255], i * 4); });
  o.putImageData(im, 0, 0); g.imageSmoothingEnabled = true; g.drawImage(metOff, x0, y0, sz, sz); g.strokeStyle = C.grid; g.strokeRect(x0, y0, sz, sz);
  s.pts.forEach((p, i) => { if (i >= live) return; const [r, gg, b] = heat((p.res - lo) / span); g.fillStyle = `rgb(${r},${gg},${b})`; g.beginPath(); g.arc(x0 + (p.u + 1) / 2 * sz, y0 + (p.v + 1) / 2 * sz, Math.max(2.5, sz / N * 0.16), 0, 7); g.fill(); g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 1; g.stroke(); });
  g.font = mono(10, 500); g.fillStyle = C.muted; g.fillText(`${N}×${N} 點 · MLO 100 mm · 扣掉傾斜後的高度`, x0, y0 + sz + 14);
  // profile along the diagonal
  const xr = x0 + sz + 16, cw = w - xr - 12, ph = 70; let y = 18;
  g.font = mono(11, 700); g.fillStyle = C.muted; g.fillText('對角線剖面 μm', xr, y); y += 6;
  g.strokeStyle = C.grid; g.strokeRect(xr, y, cw, ph);
  const zMap = (z) => y + ph / 2 - z / Math.max(40, span) * ph * 0.9;
  g.beginPath(); for (let i = 0; i <= 60; i++) { const t = -1 + 2 * i / 60, z = metH(t, t, S.defects) - (s.plane[0] + (s.plane[1] + s.plane[2]) * t) - (lo + hi) / 2; const X = xr + i / 60 * cw; i ? g.lineTo(X, zMap(z)) : g.moveTo(X, zMap(z)); } g.strokeStyle = 'rgba(141,152,170,.6)'; g.lineWidth = 1.4; g.stroke();
  s.pts.forEach((p, i) => { if (i >= live || Math.abs(p.u - p.v) > 1e-6) return; g.fillStyle = C.acc; g.beginPath(); g.arc(xr + (p.u + 1) / 2 * cw, zMap(p.res - (lo + hi) / 2), 3.5, 0, 7); g.fill(); });
  y += ph + 26;
  const pass = s.flat <= MET.lim;
  g.font = mono(22, 800); g.fillStyle = pass ? C.green : C.red; g.fillText(`${s.flat.toFixed(0)} μm`, xr, y);
  g.font = sans(11.5, 600); g.fillStyle = C.muted; g.fillText(`平整度（上限 ${MET.lim} μm）`, xr + 78, y - 4); y += 18;
  g.fillText(`傾斜 ${s.tilt.toFixed(0)} μm（裝探針頭時再調平）`, xr, y); y += 26;
  resultLines(g, xr, y, 4, ['warp']);
}
const metLive = { done: 0 };

// ---- 5 · on-tester diagnostics: instrument slots, channel map, the PMU
function ddLed(s, k, t) {
  const P = params(), cfg = P.ddCfg === 'same' ? DD.need : DD.diff, ok = cfg[s] === DD.need[s], u = ddProg.u;
  if (!ok) return 3;
  const at = (s * DD.ch + k) / (DD.slots * DD.ch); if (u < at) return 0;
  for (const [id, sl] of Object.entries(DD.slotOf)) if (S.defects[id] && sl === s && k === 5 + (id.length % 7)) return 2;
  if (S.defects.bridge && s === DD.slotOf.bridge && (k === 6 || k === 7)) return 2;
  return 1;
}
const ddProg = { u: 0 };
function drawDD(g, w, h) {
  const P = params(), c = covNow()[5], cfg = c.cfg;
  const x0 = 12, sw = (w - 24) / DD.slots; let y = 16;
  g.font = mono(10.5, 700); g.fillStyle = C.muted; g.fillText('儀器槽 SLOTS：這片板子要的 ↔ 這台機器裝的', x0, y); y += 8;
  for (let s = 0; s < DD.slots; s++) {
    const ok = cfg[s] === DD.need[s], X = x0 + s * sw;
    g.fillStyle = ok ? '#121a26' : 'rgba(255,178,36,.12)'; g.strokeStyle = ok ? C.grid : C.amber; g.lineWidth = 1; g.beginPath(); g.roundRect(X + 2, y, sw - 4, 38, 4); g.fill(); g.stroke();
    g.font = mono(9, 700); g.fillStyle = C.dim; g.fillText(`${s + 1}`, X + 6, y + 11);
    g.font = mono(10, 700); g.fillStyle = C.muted; g.fillText(DD.need[s], X + 6, y + 23); g.fillStyle = ok ? C.green : C.amber; g.fillText(cfg[s], X + 6, y + 34);
  }
  y += 50;
  // channel map
  const cw = (w - 24) / DD.slots, chh = Math.min(5.2, (h - y - 96) / DD.ch);
  for (let s = 0; s < DD.slots; s++) for (let k = 0; k < DD.ch; k++) {
    const st = ddLed(s, k, wallT); g.fillStyle = st === 2 ? C.red : st === 1 ? 'rgba(72,211,138,.75)' : st === 3 ? 'rgba(255,178,36,.25)' : '#1a2230';
    g.fillRect(x0 + s * cw + 3, y + k * chh, cw - 6, chh - 1.2);
  }
  y += DD.ch * chh + 18;
  g.font = sans(11, 600); g.fillStyle = C.muted; g.fillText(`診斷程式：每個通道送 1 mA、量電壓；每顆繼電器切一次；量每組電源的電容。已測 ${Math.round(ddProg.u * 100)} %`, x0, y); y += 20;
  const ids = ['relay', 'pogo', 'revDiode', 'bridge', 'openNet', 'missingC'];
  let xx = x0; ids.forEach((id, i) => { const r = c.r[id], pl = S.defects[id]; const col = r.caught ? C.green : C.dim; g.font = sans(11.5, 700); g.fillStyle = pl ? C.text : C.muted; const t = `${r.caught ? '✓' : '·'} ${DEF[id].zh}`; g.fillText(t, xx, y + Math.floor(i / 3) * 18); if (i % 3 === 2) xx = x0; else xx += (w - 24) / 3; });
}

const DRAW = [drawAOI, drawFP, drawNet, drawXray, drawMet, drawDD];
const DESC = [
  '相機從上面拍每一顆零件：有沒有少件、方向對不對、有沒有偏移。看得到外觀，看不到阻值，也看不到 MLO 底下。',
  '探針自己飛到每顆零件的兩端，量電阻、電容、二極體，不用做專用治具，適合少量多樣的板子。',
  '量每一條網路：從 MLO 上的接點到背面的測試機接點通不通、彼此之間有沒有漏電；電源路徑用四線量到毫歐姆。',
  'X 光穿過 MLO，看底下的錫球：空洞、橋接一目了然；斜著拍才看得出枕頭效應。',
  '在 MLO 表面自動對焦很多點，量出每點高度，扣掉傾斜後算平整度。',
  '把板子裝上跟客戶同型號、同樣儀器配置的測試機，跑診斷程式：每顆繼電器、每個通道、每組電源都實際動一次。',
];
function drawScope() {
  const { g, w, h } = fitCanvas($('#scope'));
  const k = S.view >= 0 ? S.view : run.on && run.k >= 0 ? run.k : -1;
  if (k < 0) { drawOverview(g, w, h); return; }
  DRAW[k](g, w, h);
}
function drawOverview(g, w, h) {
  // the line as a flow: station boxes with the defects each one catches
  const c = covNow(), bw = (w - 30) / NST; let y = 18;
  g.font = mono(11, 700); g.fillStyle = C.muted; g.fillText('產線 THE LINE：每一站抓得到的缺陷', 14, y); y += 12;
  STATIONS.forEach((s, k) => {
    const X = 14 + k * bw, on = S.on[k];
    g.fillStyle = on ? '#101824' : '#0b0f15'; g.strokeStyle = run.k === k ? C.acc : C.grid; g.lineWidth = 1.2; g.beginPath(); g.roundRect(X + 2, y, bw - 8, h - y - 14, 6); g.fill(); g.stroke();
    g.font = mono(9.5, 800); g.fillStyle = on ? C.acc : C.dim; g.fillText(`0${k + 1} ${s.tag}`, X + 9, y + 15);
    g.font = sans(12, 800); g.fillStyle = on ? C.text : C.dim; g.fillText(s.short, X + 9, y + 32);
    let yy = y + 50;
    DEFECTS.forEach((d) => { if (!c[k].r[d.id].caught) return; const pl = S.defects[d.id]; g.font = sans(10.5, pl ? 700 : 500); g.fillStyle = !on ? C.dim : pl ? '#ffd9d9' : C.muted; const t = d.zh.length > 7 ? d.zh.slice(0, 7) + '…' : d.zh; g.fillText((pl ? '● ' : '· ') + t, X + 8, yy); yy += 15; });
    if (k < NST - 1) { g.fillStyle = C.dim; g.beginPath(); g.moveTo(X + bw - 5, y + 24); g.lineTo(X + bw + 1, y + 28); g.lineTo(X + bw - 5, y + 32); g.fill(); }
  });
}

/* ============================================================
   Panel: tabs, chips, matrix, read-outs
   ============================================================ */
$('#tabs').innerHTML = `<button data-k="-1"><span>00</span><small>全線</small></button>` + STATIONS.map((s, k) => `<button data-k="${k}"><span>0${k + 1}</span><small>${s.short}</small></button>`).join('');
$('#chips').innerHTML = DEFECTS.map((d) => `<button data-id="${d.id}" title="${d.where} · ${d.en}">${d.zh}</button>`).join('');
const tabBtns = [...document.querySelectorAll('#tabs button')], chipBtns = [...document.querySelectorAll('#chips button')];
tabBtns.forEach((b) => b.addEventListener('click', () => setView(+b.dataset.k)));
chipBtns.forEach((b) => b.addEventListener('click', () => toggleDefect(b.dataset.id)));
$('#allD').addEventListener('click', (e) => { e.preventDefault(); DEFECTS.forEach((d) => (S.defects[d.id] = true)); clearRun(); });
$('#noD').addEventListener('click', (e) => { e.preventDefault(); S.defects = {}; clearRun(); });
function toggleDefect(id, v) { S.defects[id] = v ?? !S.defects[id]; if (!S.defects[id]) delete S.defects[id]; clearRun(); }
function buildMatrix() {
  const head = `<tr><th>缺陷</th>${STATIONS.map((s, k) => `<th data-k="${k}">0${k + 1}<small>${s.short}</small></th>`).join('')}<th class="res">結果</th></tr>`;
  $('#mx').innerHTML = head + DEFECTS.map((d) => `<tr data-id="${d.id}"><td>${d.zh}</td>${STATIONS.map((s, k) => `<td data-k="${k}"></td>`).join('')}<td class="res"></td></tr>`).join('');
  [...document.querySelectorAll('#mx th[data-k]')].forEach((th) => th.addEventListener('click', () => { const k = +th.dataset.k; S.on[k] = !S.on[k]; clearRun(); }));
  [...document.querySelectorAll('#mx tr[data-id] td:first-child')].forEach((td) => td.addEventListener('click', () => toggleDefect(td.parentElement.dataset.id)));
}
buildMatrix();
const mxCells = Object.fromEntries(DEFECTS.map((d) => [d.id, [...document.querySelectorAll(`#mx tr[data-id="${d.id}"] td`)]]));
const mxKey = { v: '' };
function updateMatrix() {
  const c = covNow(), cur = S.view >= 0 ? S.view : run.k;
  const key = JSON.stringify([covKey, S.on, S.defects, cur, run.done, run.hits, run.k]);
  if (key === mxKey.v) return; mxKey.v = key;
  [...document.querySelectorAll('#mx th[data-k]')].forEach((th) => { const k = +th.dataset.k; th.classList.toggle('off', !S.on[k]); th.classList.toggle('cur', k === cur); });
  for (const d of DEFECTS) {
    const tds = mxCells[d.id], pl = !!S.defects[d.id];
    tds[0].parentElement.classList.toggle('pl', pl);
    STATIONS.forEach((s, k) => {
      const td = tds[k + 1], y = c[k].r[d.id].caught, hit = run.hits && run.hits[d.id] === k;
      td.textContent = hit ? '✓' : y ? '●' : '·';
      td.className = (y ? 'y' : '') + (k === cur ? ' cur' : '') + (hit ? ' hit' : '') + (!S.on[k] ? ' skip' : '');
    });
    const res = tds[NST + 1];
    if (run.done && pl) { const by = run.hits[d.id]; res.textContent = by >= 0 ? `${STATIONS[by].short}抓到` : '流出'; res.className = 'res ' + (by >= 0 ? 'good' : 'esc'); }
    else if (pl) { const ks = catchers(d.id); res.textContent = ks.length ? `${ks.length} 站抓得到` : '沒有一站抓得到'; res.className = 'res ' + (ks.length ? '' : 'mid'); }
    else { res.textContent = ''; res.className = 'res'; }
  }
}
const cache = new Map();
function setText(id, t, cls) { const key = t + '|' + (cls || ''); if (cache.get(id) === key) return; cache.set(id, key); const el = document.getElementById(id); el.textContent = t; if (cls !== undefined) el.className = cls; }
function updateDOM() {
  const c = covNow(), k = S.view >= 0 ? S.view : run.on ? run.k : -1, pl = planted();
  tabBtns.forEach((b) => { const kk = +b.dataset.k; b.classList.toggle('on', kk === S.view); b.classList.toggle('off', kk >= 0 && !S.on[kk]); });
  chipBtns.forEach((b) => b.classList.toggle('on', !!S.defects[b.dataset.id]));
  document.querySelectorAll('.sc').forEach((el) => el.classList.toggle('on', +el.dataset.st === S.view));
  setText('scTitle', k >= 0 ? `0${k + 1} · ${STATIONS[k].en} · ${STATIONS[k].zh}` : 'The line · 全線');
  setText('scR', k >= 0 ? `每片約 ${fmtT(c[k].time)}` : `全線約 ${fmtT(c.reduce((a, x, i) => a + (S.on[i] ? x.time : 0), 0))}`);
  setText('stDesc', k >= 0 ? DESC[k] : '一片探針卡主板焊好 MLO 之後，出貨前要過六關。每一關看的東西不一樣，抓得到的缺陷也不一樣。');
  setText('hStation', k >= 0 ? `0${k + 1} ${STATIONS[k].tag}` : 'LINE');
  setText('hTime', k >= 0 ? fmtT(c[k].time) : '—');
  setText('hLine', fmtT(c.reduce((a, x, i) => a + (S.on[i] ? x.time : 0), 0)));
  setText('hPlanted', `${pl.length}`);
  const caught = pl.filter((id) => (run.done ? run.hits[id] >= 0 : catchers(id).length > 0)).length;
  setText('hCaught', `${caught}${run.done ? '' : ' (預估)'}`, 'good'); setText('hEsc', `${pl.length - caught}${run.done ? '' : ' (預估)'}`, pl.length - caught ? 'bad' : 'good');
  // what will slip through with these settings
  const miss = DEFECTS.filter((d) => catchers(d.id).length === 0);
  const msg = run.on ? (run.k >= 0 ? `產線跑到 0${run.k + 1} ${STATIONS[run.k].zh}…` : run.t < 3 ? '板子進入產線…' : '出貨…')
    : run.done ? (run.esc.length ? `流到客戶端：${run.esc.map((id) => DEF[id].zh).join('、')}。` : `放進的 ${pl.length} 個缺陷都在出貨前抓到了。`)
    : miss.length ? `目前的設定下，沒有一站抓得到：${miss.map((d) => d.zh).join('、')}。` : '目前的設定下，12 種缺陷每一種至少有一站抓得到。';
  setText('planLine', msg, (run.done && run.esc.length) || (!run.done && !run.on && miss.length) ? 'bad' : '');
  setText('mxR', `${S.on.filter(Boolean).length} / ${NST} 站`);
  const P = params();
  setText('aoiResOut', `${P.aoiRes} μm/px`); setText('fpTolOut', `±${P.fpTol} %`); setText('netVOut', `${P.netV} V`); setText('netModeOut', P.netMode === '4w' ? '4-wire' : '2-wire');
  setText('xrKVOut', `${P.xrKV} kV`); setText('xrTiltOut', `${P.xrTilt}°`); setText('xrFramesOut', `${P.xrFrames}`); setText('metNOut', `${P.metN} × ${P.metN}`); setText('ddCfgOut', P.ddCfg === 'same' ? 'customer set-up' : 'other set-up');
  const foot = `<b>這片板子：</b>探針卡主板（直徑約 440 mm）＋ MLO（100 mm 見方），零件面朝上、測試機接點在背面。 <a href="#" id="refsLink">參數依據與參考來源 →</a><br>探針卡怎麼用，見 <a href="../">1 探針卡</a>；MLO 為什麼會翹、錫球在哪裡，見 <a href="../mlo/">2 MLO 載板</a>；成品測試用的板子出貨前也走類似的測試，見 <a href="../ft/">4 成品測試板</a>。<br>個人作品、示意模型。這些是業界常見的出貨前測試方法；數字取公開資料的通用量級，不是任何公司的實際規格或流程。`;
  if (cache.get('foot') !== foot) { cache.set('foot', foot); $('#foot').innerHTML = foot; }
  updateMatrix();
  updatePhases();
}
// station strip at the bottom of the stage
$('#phases').innerHTML = STATIONS.map((s, k) => `<div class="ph" data-k="${k}">0${k + 1} ${s.tag}<small>${s.short}</small><i></i></div>`).join('');
const phEls = [...document.querySelectorAll('#phases .ph')];
function updatePhases() {
  phEls.forEach((el, k) => {
    el.classList.toggle('on', run.on ? run.k === k : S.view === k);
    el.style.opacity = S.on[k] ? 1 : 0.35;
    const bar = el.lastChild; bar.style.width = `${(run.on || run.done ? (run.prog[k] || 0) : S.view === k ? stLoop.u : 0) * 100}%`;
    bar.style.background = run.flag && run.flag[k] ? C.red : C.acc;
  });
}

/* ============================================================
   Controls
   ============================================================ */
const ui = {};
for (const id of ['aoiRes', 'fpTol', 'netV', 'xrKV', 'xrTilt', 'xrFrames', 'metN', 'tGuard', 'tour', 'runBtn']) ui[id] = document.getElementById(id);
function fill(inp) { inp.style.setProperty('--p', `${(inp.value - inp.min) / (inp.max - inp.min) * 100}%`); }
for (const id of ['aoiRes', 'fpTol', 'netV', 'xrKV', 'xrTilt', 'xrFrames', 'metN']) { ui[id].addEventListener('input', () => { S[id] = +ui[id].value; fill(ui[id]); if (id === 'metN') metLive.t0 = wallT; }); fill(ui[id]); }
ui.tGuard.addEventListener('click', () => { S.fpGuard = !S.fpGuard; ui.tGuard.classList.toggle('on', S.fpGuard); });
const segNet = [...document.querySelectorAll('#segNet button')], segDD = [...document.querySelectorAll('#segDD button')];
function setNet(v) { S.netMode = v; segNet.forEach((b) => b.classList.toggle('on', b.dataset.v === v)); }
function setDD(v) { S.ddCfg = v; segDD.forEach((b) => b.classList.toggle('on', b.dataset.v === v)); ddProg.u = 0; }
segNet.forEach((b) => b.addEventListener('click', () => setNet(b.dataset.v))); segDD.forEach((b) => b.addEventListener('click', () => setDD(b.dataset.v)));
function setSlider(inp, v) { inp.value = v; inp.dispatchEvent(new Event('input')); }
function applyState(o) {
  for (const k of ['aoiRes', 'fpTol', 'netV', 'xrKV', 'xrTilt', 'xrFrames', 'metN']) if (k in o) setSlider(ui[k], o[k]);
  if ('fpGuard' in o) { S.fpGuard = o.fpGuard; ui.tGuard.classList.toggle('on', S.fpGuard); }
  if ('netMode' in o) setNet(o.netMode); if ('ddCfg' in o) setDD(o.ddCfg);
  if ('defects' in o) { S.defects = { ...o.defects }; clearRun(); }
  if ('on' in o) { S.on = [...o.on]; clearRun(); }
  if ('view' in o) setView(o.view, o.fly ?? 1.6);
}

/* ============================================================
   Explore: park the board at the chosen station and loop its test
   ============================================================ */
const stLoop = { t: 0, u: 0, k: -1 };
function setView(k, d = 1.6) {
  if (run.on) stopRun();
  S.view = k; stLoop.t = 0; metLive.t0 = wallT; ddProg.u = 0;
  if (k >= 0) { moveToStation(k); flyTo(HERO[k], d); }
  else flyTo(LINE_CAM, d);
}

/* ============================================================
   Run the line
   ============================================================ */
const run = { on: false, done: false, t: 0, seq: [], k: -1, hits: null, esc: [], prog: [], flag: [] };
function clearRun() { if (run.on) stopRun(); run.done = false; run.hits = null; run.esc = []; run.prog = []; run.flag = []; }
function startRun(speed = 1) {
  clearRun(); S.view = -1; run.on = true; run.t = 0; run.k = -1; run.hits = {}; run.prog = []; run.flag = [];
  planted().forEach((id) => (run.hits[id] = -1));
  const seq = [{ kind: 'enter', d: 1.6 }];
  for (let k = 0; k < NST; k++) { if (S.on[k]) seq.push({ kind: 'move', k, d: k === 0 ? 1.2 : 1.9 }, { kind: 'test', k, d: TEST_D[k] }, { kind: 'verdict', k, d: 1.0 }); else seq.push({ kind: 'skip', k, d: 1.1 }); }
  seq.push({ kind: 'exit', d: 1.8 });
  let t = 0; for (const s of seq) { s.d /= speed; s.t0 = t; t += s.d; } run.seq = seq; run.total = t; runSeg = -1; run.follow = speed > 1;
  bm.s = S_ENTRY; bm.y = stage.TRANSIT_Y; bm.mv = null; bm.at = -1;
  ui.runBtn.textContent = '■ 停止 Stop';
}
function stopRun() { run.on = false; run.k = -1; ui.runBtn.textContent = '▶ 跑一遍產線 Run the line'; }
function finishRun() {
  stopRun(); run.done = true; run.esc = planted().filter((id) => run.hits[id] < 0);
  if (run.esc.length) run.esc.slice(0, 3).forEach((id, i) => setTimeout(() => toast(`流出：${DEF[id].zh}`, DEF[id].esc, 'bad'), RECORD ? 0 : i * 450));
  else if (planted().length) toast('全部抓到', `${planted().length} 個缺陷都在出貨前被攔下`, 'ok');
  flyTo(LINE_CAM, run.follow ? 2.4 : 2.0); run.follow = false;
}
let runSeg = -1;
function runTick(dt) {
  if (!run.on) return;
  run.t += dt;
  const i = run.seq.findIndex((s) => run.t < s.t0 + s.d); if (i < 0) { finishRun(); return; }
  const s = run.seq[i], u = (run.t - s.t0) / s.d;
  if (i !== runSeg) {
    runSeg = i;
    if (s.kind === 'enter') { moveBoard(S_ENTRY + 4, stage.TRANSIT_Y, s.d); if (!run.follow) flyTo(LINE_CAM, 1.2); }
    if (s.kind === 'move') { run.k = s.k; moveToStation(s.k, s.d); if (!run.follow) flyTo(HERO[s.k], s.d); stLoop.t = 0; metLive.t0 = wallT + s.d; ddProg.u = 0; }
    if (s.kind === 'skip') { run.k = s.k; moveBoard(S_OF(s.k), stage.TRANSIT_Y, s.d); }
    if (s.kind === 'verdict') {
      const c = covNow()[s.k], got = planted().filter((id) => c.r[id].caught);
      run.flag[s.k] = got.length > 0;
      got.forEach((id) => { if (run.hits[id] < 0) { run.hits[id] = s.k; toast(`${STATIONS[s.k].zh}抓到：${DEF[id].zh}`, c.r[id].val, 'ok'); } });
    }
    if (s.kind === 'exit') { run.k = -1; moveBoard(S_EXIT, stage.TRANSIT_Y, s.d); if (!run.follow) flyTo(LINE_CAM, 1.6); }
  }
  if (s.kind === 'test') run.prog[s.k] = clamp(u, 0, 1);
  if (s.kind === 'verdict') run.prog[s.k] = 1;
}

/* ============================================================
   Toasts
   ============================================================ */
const toasts = [];
function toast(zh, en, kind = 'bad') {
  const el = document.createElement('div'); el.className = 'toast ' + (kind === 'bad' ? '' : kind);
  el.innerHTML = `${zh}<small>${en}</small>`; $('#toasts').appendChild(el);
  toasts.push({ el, t0: wallT }); while (toasts.length > 3) { const o = toasts.shift(); o.el.remove(); }
}
function updateToasts() {
  for (let i = toasts.length - 1; i >= 0; i--) {
    const t = wallT - toasts[i].t0, life = 3.6, op = Math.min(ease(t / 0.25), 1 - ease((t - life) / 0.45));
    toasts[i].el.style.opacity = op; toasts[i].el.style.transform = `translateY(${(1 - ease(t / 0.25)) * -10}px)`;
    if (t > life + 0.5) { toasts[i].el.remove(); toasts.splice(i, 1); }
  }
}

/* ============================================================
   Per-frame: drive the stations and the board
   ============================================================ */
function stationStates() {
  const st = [], k = run.on ? run.k : S.view, testing = run.on ? run.seq[runSeg] && run.seq[runSeg].kind === 'test' : parkedAt() === S.view && S.view >= 0;
  const tLocal = stLoop.t;
  for (let j = 0; j < NST; j++) {
    const on = testing && j === k;
    if (j === 0) st.push({ on, u: on ? (tLocal / TEST_D[0]) % 1 : 0 });
    else if (j === 1) st.push(stFP(on, tLocal));
    else if (j === 2) st.push(stNet(on, tLocal));
    else if (j === 3) st.push({ on, tilt: S.xrTilt });
    else if (j === 4) {
      const N = S.metN, sp = metSpot(N, Math.max(0, wallT - (metLive.t0 || 0))), scan = covNow()[4].scan, done = on || S.view === 4 ? sp.done : 0; metLive.done = j === k ? done : 0;
      const mloXZ = (u) => u * (ML / 2 - 0.12), bow = S.defects.warp ? 0.05 : 0.01;
      st.push({ on, spot: [mloXZ(sp.u), mloXZ(sp.v)], spotY: bow * (1 - (sp.u * sp.u + sp.v * sp.v) / 2), pts: j === k && done ? scan.pts.slice(0, done).map((p) => { const [r, g, b] = heat((p.res + 40) / 80); return [mloXZ(p.u), p.res * 0.012, mloXZ(p.v), [r / 255, g / 255, b / 255]]; }) : null });
    } else st.push({ on, led: ddLed, slots: (S.ddCfg === 'same' ? DD.need : DD.diff).map((c, s) => (c === DD.need[s] ? 1 : 2)), fail: on && planted().some((id) => covNow()[5].r[id].caught) && ddProg.u > 0.5 });
  }
  return st;
}
function marksNow() {
  const m = {};
  if (run.on || run.done) {
    for (const id of planted()) { const by = run.hits[id]; if (by >= 0) m[id] = { by: `${STATIONS[by].zh}抓到` }; else if (run.done) m[id] = 'warn'; }
  } else if (S.view >= 0) {
    const c = covNow()[S.view];
    for (const id of planted()) if (c.r[id].caught && S.on[S.view]) m[id] = { by: `${STATIONS[S.view].zh}抓得到` };
  }
  return m;
}
const BOW_WORLD = 0.0009;
function frame(dt, render = true) {
  wallT += dt;
  if (director.on) director.update(dt);
  runTick(dt); boardTick();
  if (!boardMoving()) stLoop.t += dt;
  if (S.view === 5 || (run.on && run.k === 5)) ddProg.u = clamp(ddProg.u + dt / (TEST_D[5] * 0.85), 0, 1);
  if (!render) return;
  if (run.on && run.follow && !fly.on) {
    const k = 1 - Math.exp(-dt * 2.2), want = [bm.x + 13, 17, bm.z + 23], look = [bm.x, bm.y - 0.5, bm.z];
    camera.position.set(lerp(camera.position.x, want[0], k), lerp(camera.position.y, want[1], k), lerp(camera.position.z, want[2], k));
    controls.target.set(lerp(controls.target.x, look[0], k), lerp(controls.target.y, look[1], k), lerp(controls.target.z, look[2], k)); camera.lookAt(controls.target);
  } else if (director.on) flyTick(); else if (!flyTick()) controls.update();
  const marks = marksNow();
  const bow = (S.defects.warp ? MET.bowBad : MET.bowGood) * BOW_WORLD * 1.6;
  stage.frame({ bx: bm.x, by: bm.y, bz: bm.z, t: wallT, st: stationStates(), defects: S.defects, marks, bow, tilt: 0 }, dt);
  const r = stageEl.getBoundingClientRect();
  camera.aspect = r.width / r.height; camera.fov = camera.aspect >= 1.2 ? 34 : 2 * Math.atan(Math.tan(17 * Math.PI / 180) * 1.2 / camera.aspect) * 180 / Math.PI; camera.updateProjectionMatrix();
  stage.render();
  updateLabels(r.width, r.height, marks);
  if (S.view === 3 || (run.on && run.k === 3)) renderXray();
  drawScope(); updateDOM(); updateToasts();
  if (director.on || RECORD) director.overlay();
}
function resize() { const r = stageEl.getBoundingClientRect(); stage.resize(r.width, r.height); }
window.addEventListener('resize', resize);

ui.runBtn.addEventListener('click', () => (run.on ? stopRun() : startRun(director.on ? TOUR_RUN_SPEED : 1)));
const voiceEl = new Audio(); voiceEl.preload = 'auto';
function unlockVoice() { voiceEl.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='; voiceEl.play().catch(() => {}); }
ui.tour.addEventListener('click', () => { if (director.on) director.stop(); else { unlockVoice(); director.start(); } });
$('#panel').addEventListener('pointerdown', (e) => { if (e.isTrusted && director.on && !RECORD && e.target.closest('input,button,th,td') && !ui.tour.contains(e.target)) director.stop(); }, true);
let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; fly.on = false; });
canvas.addEventListener('pointermove', (e) => { if (downAt && director.on && !RECORD && Math.abs(e.clientX - downAt.x) > 12) { downAt = null; director.stop(); } });
window.addEventListener('pointerup', () => { downAt = null; });
canvas.addEventListener('wheel', () => { fly.on = false; if (director.on && !RECORD) director.stop(); }, { passive: true });
$('#endcard').addEventListener('click', () => { $('#endcard').style.opacity = 0; $('#endcard').style.pointerEvents = 'none'; });

// 參數依據
const SRC = window.TEST_SOURCES;
if (SRC && SRC.refs.length) {
  const cite = (r) => (r && r.length ? `<span class="c">${r.map((n) => `<a href="#ref-${n}">[${n}]</a>`).join('')}</span>` : '');
  $('#refsBox').innerHTML = `
    <button class="btn x" id="refsClose">✕ 關閉</button>
    <h2>參數依據與參考來源</h2>
    <p>${SRC.intro}</p>
    <h3>六站在量什麼 · Stations</h3>
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
   Director — the guided tour (filled in with the narration)
   ============================================================ */
const TOUR_RUN_SPEED = 2.6;
const CAM = [];
const tab = (k) => `#tabs button[data-k="${k}"]`, chip = (id) => `#chips button[data-id="${id}"]`;
const PLANT = ['missingC', 'wrongR', 'void', 'hip', 'viaOpen', 'warp', 'relay'];
const ACTS = [
  { t: 0.0, set: { ...DEFAULTS, defects: {}, on: [true, true, true, true, true, true], view: -1, fly: 0.01 } },
  { t: 4.6, show: true },
  ...PLANT.flatMap((id, i) => [{ t: 5.0 + i * 0.8, move: ['el', chip(id)], d: 0.45 }, { t: 5.45 + i * 0.8, click: chip(id) }]),
  { t: 11.0, move: ['el', tab(0)], d: 0.6 }, { t: 11.6, click: tab(0) },
  { t: 19.0, move: ['el', tab(1)], d: 0.6 }, { t: 19.6, click: tab(1) },
  { t: 24.2, move: ['el', '#tGuard'], d: 0.6 }, { t: 24.8, click: '#tGuard' },
  { t: 28.6, click: '#tGuard' },
  { t: 31.0, move: ['el', tab(2)], d: 0.6 }, { t: 31.6, click: tab(2) },
  { t: 35.4, move: ['el', '#segNet button[data-v="2w"]'], d: 0.6 }, { t: 36.0, click: '#segNet button[data-v="2w"]' },
  { t: 40.0, move: ['el', '#segNet button[data-v="4w"]'], d: 0.6 }, { t: 40.6, click: '#segNet button[data-v="4w"]' },
  { t: 44.0, move: ['el', tab(3)], d: 0.6 }, { t: 44.6, click: tab(3) },
  { t: 49.0, move: ['slider', 'xrTilt'], d: 0.6 }, { t: 49.6, drag: 'xrTilt', to: 60, d: 2.0 },
  { t: 54.5, move: ['el', tab(4)], d: 0.6 }, { t: 55.1, click: tab(4) },
  { t: 62.0, move: ['el', tab(5)], d: 0.6 }, { t: 62.6, click: tab(5) },
  { t: 71.0, move: ['el', tab(-1)], d: 0.6 }, { t: 71.6, click: tab(-1) },
  { t: 74.5, move: ['el', '#runBtn'], d: 0.6 }, { t: 75.1, click: '#runBtn' },
  { t: 96.0, move: ['el', '#mx th[data-k="3"]'], d: 0.7 }, { t: 96.7, click: '#mx th[data-k="3"]' },
  { t: 103.6, move: ['park'], d: 0.9 }, { t: 104.4, show: false },
];
const CAPS = [
  { t: 0.3, zh: '探針卡主板焊上 MLO 之後，出貨前還要過六關', en: 'With its MLO soldered on, the probe-card PCB has six tests to pass before it ships' },
  { t: 5.5, zh: '先放進幾種常見的缺陷', en: 'First, plant a few common defects' },
  { t: 12.0, zh: '光學檢查：看得到少件、極性', en: 'AOI sees missing parts and polarity' },
  { t: 20.0, zh: '飛針：一顆一顆量零件', en: 'Flying probe measures each part' },
  { t: 32.0, zh: '網路測試：通不通、有沒有漏電', en: 'Net test: continuity and isolation' },
  { t: 45.0, zh: 'X 光：看 MLO 底下的錫球', en: 'X-ray looks at the balls under the MLO' },
  { t: 55.5, zh: '平整度：MLO 翹了多少', en: 'Flatness: how far the MLO bows' },
  { t: 63.0, zh: '上機診斷：跟客戶一樣的測試機', en: 'On-tester diagnostics, set up like the customer\'s tester' },
  { t: 72.0, zh: '每一站抓到的缺陷都不一樣', en: 'Each station catches different defects' },
  { t: 103.8, zh: '', en: '' },
];
const END = { t: 105.0, dur: 111.0 };
const NARR = window.TEST_NARR || null;
if (NARR) {
  const T = (t) => t + NARR.retime.reduce((sum, [a, e]) => sum + (t >= a ? e : 0), 0);
  for (const a of ACTS) a.t = T(a.t);
  END.t = T(END.t); END.dur = Math.max(T(END.dur), NARR.end);
  CAPS.length = 0; for (const l of NARR.lines) if (l.cap) CAPS.push({ t: l.t, d: l.d, zh: l.zh, en: l.en });
}
const cursorEl = $('#cursor'), rippleEl = $('#ripple');
function thumbXY(inp, v) { const r = inp.getBoundingClientRect(), f = (v - inp.min) / (inp.max - inp.min), th = 18; return { x: r.left + th / 2 + f * (r.width - th), y: r.top + r.height / 2 }; }
function elXY(sel) { const r = $(sel).getBoundingClientRect(); return { x: r.left + r.width * 0.45, y: r.top + r.height * 0.55 }; }
function camAt(t) {
  let i = 0; while (i < CAM.length - 2 && CAM[i + 1].t <= t) i++;
  const a = CAM[i], b = CAM[i + 1] || a, v = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 1, u = ease5(v);
  const lift = Math.sin(Math.PI * u) * Math.min(14, Math.hypot(b.p[0] - a.p[0], b.p[2] - a.p[2]) * 0.12);
  return { p: [lerp(a.p[0], b.p[0], u), lerp(a.p[1], b.p[1], u) + lift, lerp(a.p[2], b.p[2], u)], l: [lerp(a.l[0], b.l[0], u), lerp(a.l[1], b.l[1], u), lerp(a.l[2], b.l[2], u)] };
}
const director = {
  on: false, t: 0, ai: 0, run: [], cur: { x: 0, y: 0 }, vis: 0, visT: 0, rip: null, press: [], li: 0,
  start() {
    this.on = true; this.t = 0; this.ai = 0; this.run = []; this.press = []; this.rip = null; this.visT = 0; this.vis = 0; this.li = 0;
    const r = stageEl.getBoundingClientRect(); this.cur = { x: r.left + r.width * 0.64, y: r.top + r.height * 0.78 };
    controls.enabled = false; ui.tour.textContent = '■ Stop 停止'; fly.on = false; if (run.on) stopRun();
    $('#endcard').style.opacity = 0; $('#endHint').textContent = RECORD ? '' : 'Click to explore it yourself · 點一下自己玩';
  },
  stop() {
    this.on = false; controls.enabled = true; ui.tour.textContent = '▶ Guided tour 導覽'; voiceEl.pause();
    cursorEl.style.opacity = 0; rippleEl.style.opacity = 0; $('#caption').style.opacity = 0;
    for (const k of ['aoiRes', 'fpTol', 'netV', 'xrKV', 'xrTilt', 'xrFrames', 'metN']) ui[k].classList.remove('grab');
    if (wallT && this.t < END.t) { $('#endcard').style.opacity = 0; $('#endcard').style.pointerEvents = 'none'; }
  },
  update(dt) {
    this.t += dt; const t = this.t;
    while (this.ai < ACTS.length && ACTS[this.ai].t <= t) { this.begin(ACTS[this.ai]); this.ai++; }
    if (NARR && !RECORD) while (this.li < NARR.lines.length && NARR.lines[this.li].t <= t) { const l = NARR.lines[this.li++]; if (t - l.t < 0.5) { voiceEl.src = l.src; voiceEl.play().catch(() => {}); } }
    for (let i = this.run.length - 1; i >= 0; i--) {
      const a = this.run[i], u = clamp((t - a.t) / a.d, 0, 1);
      if (a.move) { const e = ease5(u), dx = a.to.x - a.from.x, dy = a.to.y - a.from.y; this.cur = { x: a.from.x + dx * e, y: a.from.y + dy * e - Math.sin(Math.PI * e) * Math.hypot(dx, dy) * 0.08 }; }
      else if (a.drag) { const v = lerp(a.from, a.to, ease5(u)), inp = ui[a.drag]; const vv = Math.round(v / (+inp.step || 1)) * (+inp.step || 1); if (vv !== +inp.value) setSlider(inp, vv); this.cur = thumbXY(inp, v); }
      if (u >= 1) { if (a.drag) ui[a.drag].classList.remove('grab'); this.run.splice(i, 1); }
    }
    for (let i = this.press.length - 1; i >= 0; i--) if (t - this.press[i].t > 0.18) { this.press[i].el.classList.remove('press'); this.press.splice(i, 1); }
    if (CAM.length) { const c = camAt(t); camera.position.set(...c.p); controls.target.set(...c.l); camera.lookAt(...c.l); }
    if (t >= END.dur) { this.on = false; if (RECORD) return; this.stop(); $('#endcard').style.opacity = 1; $('#endcard').style.pointerEvents = 'auto'; }
  },
  begin(a) {
    const b = { ...a };
    if ('show' in a) { this.visT = this.t; this.vis = a.show ? 1 : 0; return; }
    if (a.set) { applyState(a.set); return; }
    if (a.fn) { a.fn(); return; }
    const target = a.move ? (a.move[0] === 'slider' ? ui[a.move[1]] : a.move[0] === 'el' ? $(a.move[1]) : null) : null, Pn = $('#panel');
    if (target && Pn.scrollHeight > Pn.clientHeight + 1 && getComputedStyle(Pn).overflowY === 'auto') { const pr = Pn.getBoundingClientRect(), tr = target.getBoundingClientRect(); if (tr.bottom > pr.bottom - 8) Pn.scrollTop += tr.bottom - pr.bottom + 24; else if (tr.top < pr.top + 8) Pn.scrollTop -= pr.top - tr.top + 24; }
    if (a.move) { b.from = { ...this.cur }; if (a.move[0] === 'slider') b.to = thumbXY(ui[a.move[1]], +ui[a.move[1]].value); else if (a.move[0] === 'el') b.to = elXY(a.move[1]); else { const r = stageEl.getBoundingClientRect(); b.to = { x: r.left + r.width * 0.72, y: r.top + r.height * 0.7 }; } }
    if (a.drag) { b.from = +ui[a.drag].value; ui[a.drag].classList.add('grab'); }
    if (a.click) { const el = $(a.click); el.click(); el.classList.add('press'); this.press.push({ el, t: this.t }); this.rip = { x: this.cur.x, y: this.cur.y, t: this.t }; return; }
    this.run.push(b);
  },
  overlay() {
    const t = this.t, vis = this.vis ? ease((t - this.visT) / 0.3) : 1 - ease((t - this.visT) / 0.3);
    cursorEl.style.opacity = this.on ? vis : 0; cursorEl.style.transform = `translate(${(this.cur.x - 4).toFixed(1)}px,${(this.cur.y - 2).toFixed(1)}px)`;
    if (this.rip) { const u = (t - this.rip.t) / 0.45; if (u > 1) { rippleEl.style.opacity = 0; this.rip = null; } else { rippleEl.style.opacity = (1 - u) * 0.9; rippleEl.style.transform = `translate(${this.rip.x}px,${this.rip.y}px) scale(${0.4 + u * 0.9})`; } }
    let ci = -1; for (let i = 0; i < CAPS.length; i++) if (CAPS[i].t <= t) ci = i;
    const cap = $('#caption');
    if (ci >= 0) { const Cc = CAPS[ci]; if (Cc.zh) { cap.firstChild.textContent = Cc.zh; cap.lastChild.textContent = Cc.en; const fin = ease((t - Cc.t) / 0.25), fout = Cc.d ? 1 - ease((t - Cc.t - Cc.d - 0.5) / 0.3) : 1; cap.style.opacity = Math.min(fin, fout); cap.style.transform = `translateX(-50%) translateY(${(1 - fin) * 8}px)`; } else cap.style.opacity = 1 - ease((t - Cc.t) / 0.35); } else cap.style.opacity = 0;
    if (t >= END.t) $('#endcard').style.opacity = ease((t - END.t) / 0.9);
  },
};

/* ============================================================
   Start
   ============================================================ */
resize();
applyState({ ...DEFAULTS });
bm.s = S_OF(0); bm.y = BOARD_Y[0]; bm.at = 0; boardTick();
camera.position.set(...LINE_CAM.p); controls.target.set(...LINE_CAM.l); controls.update();
{ const q = new URLSearchParams(location.search).get('st'); if (!RECORD && q !== null && +q >= 0 && +q < NST) setView(+q, 0.01); }   // deep link: ?st=4 opens the flatness station
window.__test = { S, params, applyState, director, frame, stage, run, setView, startRun, covNow, stLoop, bm, xrCv };
if (RECORD) {
  for (let i = 0; i < 30; i++) frame(1 / 30, false);
  director.start();
  window.__advance = (dt) => { frame(dt); return { t: director.t, done: director.t >= END.dur }; };
  window.__seek = (t) => { while (director.t + 1 / 30 < t) frame(1 / 30, false); frame(1 / 30); return director.t; };
  window.__info = () => ({ dur: END.dur });
  const allText = document.body.innerText + CAPS.map((c) => c.zh).join('') + DEFECTS.map((d) => d.zh + d.esc).join('') + DESC.join('') + '抓到流出極性標記少件護衛探針電流源量電壓之間沒有繞過去讀值標準好的誤判電源路徑兩線四線綠帶接觸電阻被扣掉絕緣測試最高量得到下限漏電穿過一顆錫球比例空洞枕頭效應橋接疊加間距對角線剖面平整度上限傾斜裝探針頭時再調平儀器槽這片板子要的機器裝的診斷程式每個通道送量電壓繼電器切一次電容已測產線每一站抓得到';
  Promise.all(['400', '500', '600', '700', '800', '900'].map((wt) => document.fonts.load(`${wt} 20px "Noto Sans TC"`, allText))).catch(() => {}).then(() => document.fonts.ready).then(() => { frame(0); window.__ready = true; });
} else {
  let last = performance.now(), failed = false;
  (function loop(now) { const dt = clamp((now - last) / 1000, 0, 0.05); last = now; try { frame(dt); } catch (e) { if (!failed) { failed = true; console.error(e); } } requestAnimationFrame(loop); })(last);
}
