// MLO Lab — controls, the build sequence, 2D read-outs, labels and the guided tour.
import * as THREE from 'three';
import { createStage, SW, G, FW, BP, TH, EXG, CUT_Z } from './scene.js';
import { MAT, TOL, stack, laminate, cteOf, bowAt, offsetAt, channels, escape, T_FREE, T_ROOM, DIM } from './model.js';

const RECORD = new URLSearchParams(location.search).has('record');
const REC_DPR = +new URLSearchParams(location.search).get('dpr') || 1;      // recording only: render at this pixel ratio
if (RECORD) document.documentElement.classList.add('rec');
const $ = (s) => document.querySelector(s);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const ease5 = (t) => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };

const stageEl = $('#stage'), canvas = $('#gl');
const stage = createStage(canvas, { record: RECORD, dpr: REC_DPR });
const { camera, controls } = stage;

/* ============================================================
   State
   ============================================================ */
export const BALL_PITCH = 1.0;                         // mm on the PCB side
const BOW_LIMIT = 38;                                  // μm: whole-MLO flatness in a published 2002 example (0.0015")
const S = { pitch: 80, ls: 12, land: 30, rows: 6, reach: 25, nTop: 6, nBot: 6, bal: 0, temp: 25, tech: 'mlo-low', comp: false, explode: 0, cut: false, trace: false, labels: true, head: 1 };
let exS = 0, cutT = 0, traceT = 0, labelT = 1, headT = 1, wallT = 0, bowW = 0, hotT = 0;
function params() {
  return { tech: S.tech === 'mlc' ? 'mlc' : 'mlo', core: S.tech === 'mlo-std' ? 'std' : 'low', nTop: S.nTop, nBot: S.nBot, balance: S.bal,
    size: 100, reach: S.reach, comp: S.comp, tComp: 125, pitch: S.pitch, pad: S.land, line: S.ls, space: S.ls, rows: S.rows };
}

/* ---------- the build sequence: core, then one build-up layer on each side per cycle, then the finish ---------- */
export const STEPS = [
  { zh: '壓合增層膜', en: 'Laminate film' }, { zh: '雷射鑽孔', en: 'Laser via' }, { zh: '除膠渣', en: 'Desmear' }, { zh: '化學銅', en: 'Seed copper' },
  { zh: '光阻曝光', en: 'Resist' }, { zh: '電鍍銅', en: 'Plate' }, { zh: '去光阻', en: 'Strip' }, { zh: '快速蝕刻', en: 'Flash etch' },
];
const build = { on: false, t: 0, plan: [], total: 0, speed: 1 };
function buildPlan(pace) {
  const n = Math.max(S.nTop, S.nBot), out = [{ kind: 'core', layer: 0, step: -1, d: 1.6 }];
  for (let c = 1; c <= n; c++) for (let k = 0; k < 8; k++) out.push({ kind: 'sap', layer: c, step: k, d: c === 1 ? 0.78 : 0.2 });
  out.push({ kind: 'finish', layer: n + 1, step: 8, d: 1.8 });
  if (pace) {                                          // narrated tour: each first-layer step starts as its name is spoken, later layers fill the time left
    const m = pace.marks.map((x) => x - pace.t0 - 0.1), rest = out.slice(9, -1);
    out[0].d = Math.max(0.3, m[0]);
    for (let k = 0; k < 8; k++) out[1 + k].d = k < 7 ? Math.max(0.2, m[k + 1] - m[k]) : 0.9;
    const left = pace.end - pace.t0 - (out[0].d + m[7] - m[0] + 0.9) - out[out.length - 1].d;
    for (const p of rest) p.d = Math.max(0.05, left / rest.length);
  }
  let t = 0; for (const p of out) { p.t0 = t; t += p.d; }
  build.plan = out; build.total = t;
}
function buildState() {
  if (!build.on) return { on: false };
  const p = build.plan.find((q) => build.t < q.t0 + q.d) || build.plan[build.plan.length - 1];
  return { on: true, layer: p.layer, step: p.step, u: clamp((build.t - p.t0) / p.d, 0, 1), kind: p.kind };
}
function startBuild(pace) { buildPlan(pace); build.on = true; build.t = 0; $('#buildBtn').textContent = '■ Stop 停止'; S.explode = 0; setSlider(ui.explode, 0); }
function stopBuild() { build.on = false; $('#buildBtn').textContent = '▶ Build it 看它怎麼做'; }

/* ---------- rebuild the 3D substrate only when its shape changes ---------- */
let builtKey = '', rebuildAt = 0;
function wantRebuild() {
  const P = params(), e = escape(P);
  const key = [S.nTop, S.nBot, (e.perLayer * G / 2 / S.rows).toFixed(3)].join();
  if (key !== builtKey) { builtKey = key; stage.build({ nTop: S.nTop, nBot: S.nBot, perLayer: e.perLayer * (G / 2) / S.rows }); cache.clear(); }
}

/* ============================================================
   Labels
   ============================================================ */
const sy = () => stage.stackY;
const layerY = (side) => { const L = stage.layers(); const g = side > 0 ? L[L.length - 1] : side < 0 ? L[0] : L[S.nBot]; return g ? (g.userData.y0 + g.userData.y1) / 2 + g.position.y : 0; };
const LABELS = [
  { id: 'head', zh: '探針頭', en: 'Probe head', d: 'Vertical probes land on the pads on top of the MLO', r: () => FW / 2 + 0.4, y: () => (sy() ? sy().top : 0) + 1.0 + exS * EXG * (S.nTop + 2.2), mate: true, show: () => headT > 0.5 },
  { id: 'top', zh: '探針側接點', en: 'Probe-side pads', d: 'Same pitch as the bumps or pads on the wafer', r: () => FW / 2, y: () => layerY(1) + 0.06, dis: true },
  { id: 'bu', zh: '增層', en: 'Build-up layers', d: 'Thin films with fine copper lines and laser-drilled microvias', r: () => SW / 2, y: () => { const L = stage.layers(); const g = L[S.nBot + Math.ceil(S.nTop / 2)]; return g ? (g.userData.y0 + g.userData.y1) / 2 + g.position.y : 0; }, dis: true },
  { id: 'core', zh: '核心板', en: 'Core', d: 'Glass-reinforced and stiff; plated through holes connect the two sides', r: () => SW / 2, y: () => layerY(0), dis: true },
  { id: 'bot', zh: '下方增層', en: 'Bottom build-up', d: 'Mostly power and ground planes, mirrored to keep the stack balanced', r: () => SW / 2, y: () => layerY(-1), dis: true },
  { id: 'ball', zh: '錫球', en: 'Solder balls', d: 'Coarse pitch toward the PCB', r: () => SW / 2 - 0.4, y: () => (sy() ? sy().bottom : 0) - 0.3 - exS * EXG * (S.nBot + 0.6), dis: true },
  { id: 'pcb', zh: '探針卡主板', en: 'Probe card PCB', d: 'Takes every channel on to the tester', r: () => 7.6, y: () => (sy() ? sy().bottom : 0) - 0.7 - exS * EXG * (S.nBot + 2.6), dis: true, show: () => headT > 0.5 },
];
const labelEls = LABELS.map((L) => {
  const el = document.createElement('div');
  el.className = 'lbl' + (L.dis ? ' dis' : '');
  el.innerHTML = `<div class="t">${L.zh}<small>${L.en}</small>${L.dis ? '<span class="tag">DIS</span>' : L.mate ? '<span class="tag mate">MATING PART</span>' : ''}</div><div class="d">${L.d}</div>`;
  $('#labels').appendChild(el); return el;
});
const svgNS = 'http://www.w3.org/2000/svg';
const leaderEls = LABELS.map((L) => {
  const g = document.createElementNS(svgNS, 'g'), path = document.createElementNS(svgNS, 'path'), dot = document.createElementNS(svgNS, 'circle');
  path.setAttribute('fill', 'none'); path.setAttribute('stroke-width', '1.3'); dot.setAttribute('r', '3.5');
  const col = L.dis ? '#70c883' : '#8d98aa'; path.setAttribute('stroke', col); dot.setAttribute('fill', col);
  g.append(path, dot); $('#leaders').appendChild(g); return { g, path, dot };
});
const _v = new THREE.Vector3(), _rv = new THREE.Vector3();
const labelBox = $('#labels');
function labelVis() { return labelT * ease((exS - 0.35) / 0.3) * (build.on ? 0 : 1); }
function labelMode(W) { return W < 640 ? 'tiny' : W < 1100 ? 'compact' : 'full'; }
function toScreen(x, y, z, W, H) { _v.set(x, y, z).project(camera); return { x: (_v.x + 1) / 2 * W, y: (1 - _v.y) / 2 * H, ok: _v.z < 1 }; }
function updateLabels(W, H) {
  const op = labelVis();
  labelBox.style.opacity = op; $('#leaders').style.opacity = op;
  if (op < 0.01 || !sy()) return;
  const mode = labelMode(W);
  if (labelBox.dataset.mode !== mode) labelBox.dataset.mode = mode;
  _rv.setFromMatrixColumn(camera.matrixWorld, 0); _rv.y = 0; _rv.normalize();
  let minX = 1e9, maxX = -1e9;
  for (const [r, y] of [[SW / 2, LABELS[0].y()], [SW / 2, LABELS[6].y()], [SW / 2, 0]]) for (const sg of [-1, 1]) { const q = toScreen(sg * _rv.x * r, y, sg * _rv.z * r, W, H); minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); }
  const side = W - maxX >= minX ? 1 : -1;
  const hudEl = $('.hud'), hudOn = hudEl.offsetParent !== null;
  const sr = stageEl.getBoundingClientRect(), hr = hudEl.getBoundingClientRect();
  const hud = { l: hr.left - sr.left - 10, r: hr.right - sr.left + 10, b: hr.bottom - sr.top + 8 };
  const top = mode === 'tiny' ? 70 : 14, bottom = H - (mode === 'tiny' ? 54 : 78), gap = mode === 'full' ? 8 : 5;
  const items = LABELS.map((L, i) => {
    const on = !L.show || L.show(), r = L.r(), q = toScreen(side * _rv.x * r, L.y(), side * _rv.z * r, W, H), el = labelEls[i];
    return { i, on, sx: q.x, sy: q.y, ok: q.ok && on, w: el.offsetWidth, h: el.offsetHeight };
  }).sort((a, b) => a.sy - b.sy);
  for (const it of items) {
    let lx = mode === 'tiny' ? (side > 0 ? it.sx + 16 : it.sx - 16 - it.w) : (side > 0 ? Math.max(maxX + 22, it.sx + 36) : Math.min(minX - 22 - it.w, it.sx - 36 - it.w));
    lx = clamp(lx, 6, W - it.w - 6); it.lx = lx;
    it.minY = hudOn && lx + it.w > hud.l && lx < hud.r ? hud.b : top;
  }
  let prev = -1e9;
  for (const it of items) { if (!it.ok) continue; it.ly = Math.max(it.sy - it.h / 2, prev + gap, it.minY); prev = it.ly + it.h; }
  const over = prev - bottom;
  if (over > 0) for (const it of items) if (it.ok) it.ly = Math.max(it.minY, it.ly - over);
  for (const it of items) {
    const el = labelEls[it.i], ld = leaderEls[it.i];
    if (!it.ok) { el.style.transform = 'translate(-9999px,0)'; ld.g.style.display = 'none'; continue; }
    ld.g.style.display = '';
    el.classList.toggle('flip', side < 0);
    el.style.transform = `translate(${it.lx.toFixed(1)}px,${it.ly.toFixed(1)}px)`;
    const ey = it.ly + it.h / 2, exx = side > 0 ? it.lx : it.lx + it.w, mx = exx - side * 12;
    ld.path.setAttribute('d', `M${it.sx.toFixed(1)},${it.sy.toFixed(1)} L${mx.toFixed(1)},${ey.toFixed(1)} L${exx.toFixed(1)},${ey.toFixed(1)}`);
    ld.dot.setAttribute('cx', it.sx.toFixed(1)); ld.dot.setAttribute('cy', it.sy.toFixed(1));
  }
}

/* ============================================================
   2D read-outs
   ============================================================ */
function fitCanvas(cv) {
  const r = cv.getBoundingClientRect(), d = RECORD ? REC_DPR : Math.min(devicePixelRatio, 2);
  const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, r.width, r.height);
  return { g, w: r.width, h: r.height };
}
const COL = { film: '#7a7340', filmHi: '#8f8750', core: '#4d5c34', cu: '#e0a45d', cuDim: '#a8743f', resist: '#4c7fd9', seed: '#f0c27a', ball: '#d5dae0', tip: '#cfe8ff', red: '#ff5d5d' };
/** The stack-up seen from the side: real layer thicknesses, one stacked via and one escape trace; bends with the bow. */
function drawXs() {
  const { g, w, h } = fitCanvas($('#xs')), P = params(), B = buildState();
  g.fillStyle = '#070a10'; g.fillRect(0, 0, w, h);
  if (B.on && B.kind === 'sap') return drawSap(g, w, h, B);
  const L = P.tech === 'mlc' ? [{ m: 'mlc', t: 1500, f: 1 }] : stack(P), tot = L.reduce((s, l) => s + l.t, 0);
  const top = 46, bot = h - 34, k = (bot - top) / tot, x0 = 14, x1 = w - 128, mid = (x0 + x1) / 2;
  const sag = clamp(bowW, -1, 1) * 22;                                               // drawn bow (exaggerated, sign kept)
  const yb = (x) => sag * (1 - Math.pow((x - mid) / ((x1 - x0) / 2), 2));
  let y = bot;
  const cols = [];
  for (const l of L) {                                                               // from the bottom up
    const y0 = y - l.t * k;
    for (let x = x0; x < x1; x += 3) {
      const yy = yb(x);
      if (l.m === 'cu') { g.fillStyle = l.f > 0.6 ? COL.cu : COL.cuDim; if (l.f > 0.6 || (Math.floor(x / 9) % 2 === 0)) g.fillRect(x, y0 - yy, 3, Math.max(1, l.t * k)); }
      else { g.fillStyle = l.m === 'mlc' ? '#8a8f99' : l.m.startsWith('core') ? COL.core : COL.film; g.fillRect(x, y0 - yy, 3, l.t * k + 0.5); }
    }
    cols.push({ ...l, y0, y1: y }); y = y0;
  }
  // a stacked via column, an escape trace, the core through-hole and the ball
  if (P.tech !== 'mlc') {
    const vx = x0 + (x1 - x0) * 0.24, dx = x0 + (x1 - x0) * 0.62, sTop = cols.length - 1;
    const escJ = 2;                                                                  // this one escapes on the second signal layer
    const cuTop = cols.filter((c) => c.m === 'cu');
    const topCu = cuTop.slice(-S.nTop), escY = topCu[topCu.length - 1 - escJ];
    g.fillStyle = COL.cu;
    if (escY) {
      const yv = (x) => yb(x);
      g.fillRect(vx - 3, cols[sTop].y0 - yv(vx), 6, escY.y0 - cols[sTop].y0 + 1);                  // stacked microvias
      g.fillRect(vx - 3, escY.y0 - yv(vx), dx - vx, 3);                                             // the trace
      const coreC = cols.find((c) => c.m.startsWith('core'));
      g.fillRect(dx - 3, escY.y0 - yv(dx), 6, coreC.y0 - escY.y0);                                  // down to the core
      g.fillStyle = '#c78f4c'; g.fillRect(dx - 4, coreC.y0 - yv(dx), 8, coreC.y1 - coreC.y0);       // through hole
      g.fillStyle = COL.cu; g.fillRect(dx - 3, coreC.y1 - yv(dx), 6, bot - coreC.y1);              // and down to the bottom
      g.fillStyle = COL.ball; g.beginPath(); g.arc(dx + 26, bot + 9 - yv(dx + 26), 10, 0, 7); g.fill();
      g.fillStyle = COL.cu; g.fillRect(dx - 3, bot - 2 - yv(dx), 30, 3);
    }
    // the probe above its pad: shifted by the thermal offset at the corner of the probe area
    const off = offsetAt(P, S.temp), px = vx, pw = 26, tipX = px + Math.max(-60, Math.min(60, off * 0.6));
    g.fillStyle = '#f4d27a'; g.fillRect(px - pw / 2, cols[sTop].y0 - 3 - yb(px), pw, 3);
    const tipW = 10, bad = Math.abs(off) > TOL;
    g.strokeStyle = bad ? COL.red : COL.tip; g.lineWidth = 2; g.beginPath(); g.moveTo(tipX, cols[sTop].y0 - 4 - yb(px)); g.lineTo(tipX, 6); g.stroke();
    g.fillStyle = bad ? COL.red : COL.tip; g.beginPath(); g.moveTo(tipX - tipW / 2, cols[sTop].y0 - 14 - yb(px)); g.lineTo(tipX + tipW / 2, cols[sTop].y0 - 14 - yb(px)); g.lineTo(tipX, cols[sTop].y0 - 4 - yb(px)); g.fill();
    g.font = '600 10px JetBrains Mono, monospace'; g.fillStyle = bad ? '#ff8d8d' : '#8fd8f5';
    g.fillText(`corner probe ${off >= 0 ? '+' : ''}${off.toFixed(1)} μm`, px + 22, 22);
  }
  // layer legend on the right
  g.font = '500 10px Inter, "Noto Sans TC", sans-serif'; g.textBaseline = 'middle';
  const legend = P.tech === 'mlc' ? [['陶瓷多層板', '#8a8f99']] : [['增層膜', COL.film], ['銅：訊號層', COL.cuDim], ['銅：電源／地', COL.cu], ['核心板', COL.core]];
  legend.forEach(([t, c], i) => { g.fillStyle = c; g.fillRect(x1 + 14, top + i * 17, 10, 10); g.fillStyle = '#b9c2d0'; g.fillText(t, x1 + 30, top + 5 + i * 17); });
  g.fillStyle = '#8d98aa'; g.font = '500 10px JetBrains Mono, monospace';
  g.fillText(`${(tot / 1000).toFixed(2)} mm`, x1 + 14, bot - 8);
  if (Math.abs(bowW) > 0.02) { g.fillStyle = Math.abs(bowNow()) > BOW_LIMIT ? '#ff8d8d' : '#ffcf7a'; g.fillText(`bow ${bowNow().toFixed(0)} μm (×${Math.round(22 / Math.max(1, Math.abs(bowNow())) * 300)})`, x1 + 14, bot - 24); }
  g.textBaseline = 'alphabetic';
  if (B.on && (B.kind === 'core' || B.kind === 'finish')) {                         // the steps before and after the build-up cycles
    const txt = B.kind === 'core' ? ['核心板', '鑽孔 → 電鍍通孔 → 塞孔 → 做出兩面的線路'] : ['完成', '防焊 → 表面處理 → 電性測試 → 量平整度'];
    g.fillStyle = 'rgba(7,10,16,.82)'; g.fillRect(10, 8, w - 150, 40);
    g.font = '700 12px Inter, "Noto Sans TC", sans-serif'; g.fillStyle = '#e8edf4'; g.fillText(txt[0], 16, 24);
    g.font = '500 11px Inter, "Noto Sans TC", sans-serif'; g.fillStyle = '#b9c2d0'; g.fillText(txt[1], 16, 40);
  }
}
/** One build-up cycle, close up: what each step does around one microvia. */
function drawSap(g, w, h, B) {
  const st = B.step, u = B.u, x0 = 20, x1 = w - 20, base = h - 40, film = 54, viaX = w * 0.42, trX1 = w * 0.78;
  // what is already there: the layer below with its copper pad
  g.fillStyle = COL.film; g.fillRect(x0, base, x1 - x0, 30);
  g.fillStyle = COL.cu; g.fillRect(viaX - 34, base - 6, 68, 6); g.fillRect(x0 + 10, base - 6, 60, 6); g.fillRect(x1 - 90, base - 6, 70, 6);
  const fy = base - 6 - film;                                                       // top of the new film
  const filmDrop = st === 0 ? (1 - ease(u)) * 40 : 0;
  g.fillStyle = COL.filmHi; g.fillRect(x0, fy - filmDrop, x1 - x0, film);
  const hole = st >= 1 ? (st === 1 ? ease(u) : 1) : 0;                               // laser via: a cone down to the pad below
  if (hole > 0) {
    const topR = 22, botR = 14, depth = film * hole;
    g.fillStyle = '#070a10'; g.beginPath(); g.moveTo(viaX - topR, fy); g.lineTo(viaX + topR, fy); g.lineTo(viaX + lerp(topR, botR, hole), fy + depth); g.lineTo(viaX - lerp(topR, botR, hole), fy + depth); g.fill();
    if (st === 1) { g.strokeStyle = 'rgba(255,77,109,.9)'; g.lineWidth = 3; g.beginPath(); g.moveTo(viaX, 4); g.lineTo(viaX, fy + depth); g.stroke(); const gr = g.createRadialGradient(viaX, fy + depth, 0, viaX, fy + depth, 26); gr.addColorStop(0, 'rgba(255,140,90,.9)'); gr.addColorStop(1, 'rgba(255,140,90,0)'); g.fillStyle = gr; g.beginPath(); g.arc(viaX, fy + depth, 26, 0, 7); g.fill(); }
  }
  if (st === 2) { g.strokeStyle = `rgba(160,220,255,${0.6 * Math.sin(Math.PI * u)})`; g.lineWidth = 2; for (let i = 0; i < 18; i++) { const xx = x0 + (i + 0.5) * (x1 - x0) / 18; g.beginPath(); g.moveTo(xx, fy - 14); g.lineTo(xx + 4, fy - 4); g.stroke(); } }
  const seed = st >= 3 && st < 7 ? (st === 3 ? ease(u) : 1) : st === 7 ? 1 - ease(u) : 0;
  const traceSeg = [[viaX - 26, trX1]], keep = [[x0 + 6, x0 + 80]];               // where copper will be plated
  if (seed > 0) {
    g.fillStyle = `rgba(240,194,122,${0.9 * seed})`; g.fillRect(x0, fy - 2, x1 - x0, 2);
    g.beginPath(); g.moveTo(viaX - 22, fy); g.lineTo(viaX - 14, fy + film); g.lineTo(viaX + 14, fy + film); g.lineTo(viaX + 22, fy); g.lineWidth = 2; g.strokeStyle = `rgba(240,194,122,${0.9 * seed})`; g.stroke();
  }
  const resist = st === 4 ? ease(u) : st === 5 ? 1 : st === 6 ? 1 - ease(u) : 0;
  if (resist > 0) {
    g.fillStyle = `rgba(76,127,217,${0.85 * resist})`;
    let xa = x0; for (const [a, b] of [...keep, ...traceSeg].sort((p, q) => p[0] - q[0])) { g.fillRect(xa, fy - 2 - 26, a - xa, 26); xa = b; } g.fillRect(xa, fy - 2 - 26, x1 - xa, 26);
  }
  const plate = st === 5 ? ease(u) : st > 5 ? 1 : 0;
  if (plate > 0) {
    g.fillStyle = COL.cu;
    for (const [a, b] of [...keep, ...traceSeg]) g.fillRect(a, fy - 2 - 16 * plate, b - a, 16 * plate);
    g.beginPath(); g.moveTo(viaX - 22, fy); g.lineTo(viaX - 14, fy + film); g.lineTo(viaX + 14, fy + film); g.lineTo(viaX + 22, fy); g.closePath(); g.globalAlpha = plate; g.fill(); g.globalAlpha = 1;
  }
  // captions
  g.font = '700 12px Inter, "Noto Sans TC", sans-serif'; g.fillStyle = '#e8edf4';
  g.fillText(`第 ${B.layer} 層 · ${STEPS[st].zh}`, 14, 20);
  g.font = '500 10.5px JetBrains Mono, monospace'; g.fillStyle = '#8d98aa'; g.fillText(STEPS[st].en.toUpperCase(), 14, 36);
  const notes = ['增層膜在高溫下壓上、熟化', '雷射燒出錐形微孔，停在下層的銅墊上', '清掉孔底的殘渣、把表面咬粗', '整面長一層很薄的化學銅當晶種', '貼乾膜、曝光、顯影：只露出要長銅的地方', '電鍍把線路長厚，同時把孔填滿', '去掉光阻', '把露出來的薄晶種蝕刻掉，線路就分開了'];
  g.font = '500 11px Inter, "Noto Sans TC", sans-serif'; g.fillStyle = '#b9c2d0'; g.fillText(notes[st], w * 0.45, 20);
}
/** Top view of one corner of the probe pads: how many lines fit between two pads, and which rows escape on which layer. */
function drawFan() {
  const { g, w, h } = fitCanvas($('#fan')), P = params(), e = escape(P), nSig = Math.ceil(S.nTop / 2);
  g.fillStyle = '#070a10'; g.fillRect(0, 0, w, h);
  const legendW = 84, cols = 5, rows = Math.min(S.rows, 7), sc = Math.min((w - legendW - 16) / (cols * P.pitch), (h - 16) / (rows * P.pitch)), ox = 8, oy = h - 8;
  const layerCol = ['#4cc9f0', '#7ee787', '#ffc53d', '#ff8fb1', '#b69cff', '#5fe3c0'];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const cx = ox + (c + 0.5) * P.pitch * sc, cy = oy - (r + 0.5) * P.pitch * sc, s = Math.floor(r / e.perLayer), ok = s < nSig, ps = P.pad * sc;
    g.fillStyle = ok ? layerCol[s % layerCol.length] : COL.red; g.globalAlpha = ok ? 0.85 : 0.9; g.fillRect(cx - ps / 2, cy - ps / 2, ps, ps); g.globalAlpha = 1;
    if (s > 0 && ok) { g.fillStyle = '#05070b'; g.beginPath(); g.arc(cx, cy, ps * 0.22, 0, 7); g.fill(); }        // microvia down to its layer
  }
  // the lines that fit in the first channel, drawn to scale
  const n = e.n, gapX0 = ox + P.pitch * sc - (P.pitch - P.pad) * sc / 2;
  g.fillStyle = '#4cc9f0';
  for (let i = 0; i < n; i++) { const x = gapX0 + (P.space + i * (P.line + P.space)) * sc; g.fillRect(x, 0, Math.max(1, P.line * sc), oy - (e.perLayer - 0.5) * P.pitch * sc); }
  g.font = '600 10px JetBrains Mono, monospace'; g.fillStyle = '#c9d2de';
  const lx = w - legendW + 4;
  g.fillText(`${n} line${n === 1 ? '' : 's'}/gap`, lx, 16);
  g.font = '500 10px Inter, "Noto Sans TC", sans-serif';
  for (let s = 0; s < Math.min(nSig, 5); s++) { g.fillStyle = layerCol[s]; g.fillRect(lx, 26 + s * 15, 9, 9); g.fillStyle = '#b9c2d0'; g.fillText(`訊號層 ${s + 1}`, lx + 14, 34 + s * 15); }
  g.fillStyle = COL.red; g.fillRect(lx, 26 + Math.min(nSig, 5) * 15, 9, 9); g.fillStyle = '#b9c2d0'; g.fillText('拉不出來', lx + 14, 34 + Math.min(nSig, 5) * 15);
}
/** Probe-tip offset at the corner of the probe area against temperature. */
function drawOff() {
  const { g, w, h } = fitCanvas($('#off')), P = params(), l = 34, r = 8, t = 10, b = 18, W = w - l - r, H = h - t - b;
  const tol = TOL, mlc = { ...P, tech: 'mlc' };
  const vals = []; for (let T = -40; T <= 150; T += 5) vals.push(offsetAt(P, T), offsetAt(mlc, T));
  const lim = Math.max(tol * 1.6, ...vals.map(Math.abs)) * 1.05;
  const X = (T) => l + (T + 40) / 190 * W, Yv = (v) => t + H / 2 - v / lim * H / 2;
  g.fillStyle = 'rgba(72,211,138,.08)'; g.fillRect(l, Yv(tol), W, Yv(-tol) - Yv(tol));
  g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1; g.font = '500 9px JetBrains Mono, monospace'; g.fillStyle = 'rgba(141,152,170,.8)';
  for (const T of [-40, 25, 85, 150]) { g.beginPath(); g.moveTo(X(T) + 0.5, t); g.lineTo(X(T) + 0.5, t + H); g.stroke(); g.fillText(T + '°', X(T) - 8, h - 5); }
  g.beginPath(); g.moveTo(l, Yv(0) + 0.5); g.lineTo(l + W, Yv(0) + 0.5); g.stroke();
  g.fillText(`±${tol.toFixed(0)}`, 2, Yv(tol) + 3); g.fillText('μm', 2, t + 8);
  const line = (fn, col, dash) => { g.setLineDash(dash || []); g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); for (let T = -40; T <= 150; T += 2) { const yy = Yv(fn(T)); T === -40 ? g.moveTo(X(T), yy) : g.lineTo(X(T), yy); } g.stroke(); g.setLineDash([]); };
  line((T) => offsetAt(mlc, T), 'rgba(182,156,255,.8)', [4, 3]);
  line((T) => offsetAt(P, T), '#4cc9f0');
  const v = offsetAt(P, S.temp); g.fillStyle = Math.abs(v) > tol ? '#ff6b6b' : '#fff'; g.beginPath(); g.arc(X(S.temp), Yv(v), 3.5, 0, 7); g.fill();
  g.fillStyle = 'rgba(182,156,255,.9)'; g.fillText('MLC', l + W - 24, Yv(offsetAt(mlc, 150)) - 4);
}
const bowNow = () => bowAt(params(), S.temp);

/* ============================================================
   DOM read-outs
   ============================================================ */
const cache = new Map();
function setText(id, t, cls) { const key = t + '|' + (cls || ''); if (cache.get(id) === key) return; cache.set(id, key); const el = document.getElementById(id); el.textContent = t; if (cls !== undefined) el.className = cls; }
function setBar(id, pct, col) { const el = document.getElementById(id); el.style.width = clamp(pct, 0, 100) + '%'; el.style.background = col; }
function updateDOM() {
  const P = params(), e = escape(P), nSig = Math.ceil(S.nTop / 2), need = e.signal, off = offsetAt(P, S.temp), tol = TOL, bow = bowNow(), cte = cteOf(P), lam = laminate(P, 1);
  setText('stackNo', P.tech === 'mlc' ? 'MLC' : `${S.nTop}+C+${S.nBot}`);
  setText('stPitch', `${S.pitch} μm`); setText('stBall', `${BALL_PITCH.toFixed(1)} mm`); setText('stFan', `×${(BALL_PITCH * 1000 / S.pitch).toFixed(1)}`);
  setText('stThick', `${(lam.thick / 1000).toFixed(2)} mm`); setText('stCte', `${cte.toFixed(1)} ppm/K`); setText('stTemp', `${S.temp} °C`);
  setText('kNeed', `${need} signal layer${need > 1 ? 's' : ''}`, need > nSig ? 'bad' : '');
  setText('kHave', P.tech === 'mlc' ? '—' : `${nSig} of ${S.nTop}`, need > nSig ? 'bad' : 'good');
  setText('kPer', `${e.perLayer} row${e.perLayer > 1 ? 's' : ''} · ${e.n} line${e.n === 1 ? '' : 's'}`);
  setText('kOff', `${off >= 0 ? '+' : ''}${off.toFixed(1)} μm`, Math.abs(off) > tol ? 'bad' : Math.abs(off) > tol * 0.6 ? 'mid' : 'good');
  setText('kBow', `${bow.toFixed(0)} μm`, Math.abs(bow) > BOW_LIMIT ? 'bad' : Math.abs(bow) > BOW_LIMIT * 0.6 ? 'mid' : 'good');
  setText('kCte', `${cte.toFixed(1)} vs Si ${MAT.si.a}`);
  const fp = Math.round(need / Math.max(1, nSig) * 100), wp = Math.round(Math.max(Math.abs(off) / tol, Math.abs(bow) / BOW_LIMIT) * 100);
  setText('pF', need > nSig ? 'short' : 'ok', need > nSig ? 'bad' : 'good'); setBar('bF', fp, need > nSig ? '#ff5d5d' : '#48d38a');
  setText('pW', `${wp}%`, wp > 100 ? 'bad' : wp > 60 ? 'mid' : 'good'); setBar('bW', wp, wp > 100 ? '#ff5d5d' : wp > 60 ? '#ffb224' : '#48d38a');
  setText('fanR', `${e.n} / gap`); setText('offR', `${off.toFixed(1)} μm @ ${S.temp}°C`);
  const B = buildState();
  setText('xsTitle', B.on && B.kind === 'sap' ? 'Build-up · 增層製程（剖面放大）' : 'Cross-section · 剖面'); setText('xsR', P.tech === 'mlc' ? 'ceramic' : `${S.nTop}+core+${S.nBot}`);
  const stepsEl = $('#steps'); stepsEl.style.display = B.on ? 'flex' : 'none';
  if (B.on) STEPS.forEach((s2, i) => { const el = stepsEl.children[i]; el.classList.toggle('on', B.kind === 'sap' && B.step === i); el.classList.toggle('done', B.kind === 'finish' || (B.kind === 'sap' && i < B.step)); });
  const msg = P.tech === 'mlc'
    ? `MLC：陶瓷的膨脹係數 ${MAT.mlc.a} ppm/K，跟矽接近，${S.temp} °C 時角落偏 ${off.toFixed(1)} μm，幾乎不翹。代價是較貴、交期較長。`
    : need > nSig ? `要拉出 ${S.rows} 排，每層只能拉 ${e.perLayer} 排，需要 ${need} 層訊號層，上方增層只有 ${nSig} 層訊號層：中間幾排拉不出來（紅色）。`
    : Math.abs(off) > tol ? `${S.temp} °C 時角落的探針偏了 ${off.toFixed(1)} μm，超過接點能容忍的 ±${tol.toFixed(0)} μm（示意）。`
    : Math.abs(bow) > BOW_LIMIT ? `上下銅量不平衡：整片翹了 ${bow.toFixed(0)} μm。`
    : `扇出夠用、${S.temp} °C 時角落偏 ${off.toFixed(1)} μm、翹曲 ${bow.toFixed(0)} μm：這片 MLO 可以用。`;
  setText('planLine', msg, need > nSig || Math.abs(off) > tol || Math.abs(bow) > BOW_LIMIT ? 'bad' : '');
  const foot = `<b>這片 MLO：</b>${P.tech === 'mlc' ? '陶瓷多層板' : `${S.nTop}+核心+${S.nBot}，厚 ${(lam.thick / 1000).toFixed(2)} mm`}，探針側間距 ${S.pitch} μm、主板側 ${BALL_PITCH.toFixed(1)} mm，平面方向的熱膨脹係數約 ${cte.toFixed(1)} ppm/K（矽 ${MAT.si.a}）。 <a href="#" id="refsLink">參數依據與參考來源 →</a><br><span class="dis">DIS 做的：</span>${window.MLO_SOURCES ? window.MLO_SOURCES.dis : ''}個人作品、示意模型：尺寸放大、物理簡化，數字為業界通用量級，非官方資料。`;
  if (cache.get('foot') !== foot) { cache.set('foot', foot); $('#foot').innerHTML = foot; }
}
$('#steps').innerHTML = STEPS.map((s, i) => `<span>${i + 1}<small>${s.zh}</small></span>`).join('');

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
    const t = wallT - toasts[i].t0, life = 4.2, op = Math.min(ease(t / 0.25), 1 - ease((t - life) / 0.45));
    toasts[i].el.style.opacity = op; toasts[i].el.style.transform = `translateY(${(1 - ease(t / 0.25)) * -10}px)`;
    if (t > life + 0.5) { toasts[i].el.remove(); toasts.splice(i, 1); }
  }
}

/* ============================================================
   Controls
   ============================================================ */
const ui = {};
for (const id of ['pitch', 'ls', 'land', 'rows', 'reach', 'nTop', 'nBot', 'bal', 'temp', 'explode', 'tComp', 'tCut', 'tTrace', 'tLabels', 'tour', 'buildBtn']) ui[id] = document.getElementById(id);
function fill(inp) { inp.style.setProperty('--p', ((inp.value - inp.min) / (inp.max - inp.min) * 100) + '%'); }
const bindR = (id, out, fmt, after) => ui[id].addEventListener('input', () => { S[id] = +ui[id].value; $('#' + out).textContent = fmt(S[id]); fill(ui[id]); if (after) after(); });
bindR('pitch', 'pitchOut', (v) => `${v} μm`, () => (rebuildAt = wallT + 0.15));
bindR('ls', 'lsOut', (v) => `${v} / ${v} μm`, () => (rebuildAt = wallT + 0.15));
bindR('rows', 'rowsOut', (v) => `${v} rows`, () => (rebuildAt = wallT + 0.15));
bindR('reach', 'reachOut', (v) => `${v} mm`);
bindR('land', 'landOut', (v) => `${v} μm`, () => (rebuildAt = wallT + 0.15));
bindR('nTop', 'nTopOut', (v) => `${v} layers`, () => (rebuildAt = wallT + 0.15));
bindR('nBot', 'nBotOut', (v) => `${v} layers`, () => (rebuildAt = wallT + 0.15));
bindR('bal', 'balOut', (v) => (v === 0 ? 'balanced' : `${v > 0 ? 'top' : 'bottom'} +${Math.abs(v)}%`));
bindR('temp', 'tempOut', (v) => `${v} °C`);
ui.explode.addEventListener('input', () => { S.explode = ui.explode.value / 100; $('#exOut').textContent = ui.explode.value + '%'; fill(ui.explode); });
const segTech = [...document.querySelectorAll('#segTech button')];
function setTech(v) { S.tech = v; segTech.forEach((b) => b.classList.toggle('on', b.dataset.v === v)); $('#techOut').textContent = v === 'mlc' ? 'ceramic' : v === 'mlo-low' ? 'organic · low-CTE set' : 'organic · conventional set'; }
segTech.forEach((b) => b.addEventListener('click', () => setTech(b.dataset.v)));
const togs = { tComp: 'comp', tCut: 'cut', tTrace: 'trace', tLabels: 'labels' };
for (const [id, key] of Object.entries(togs)) ui[id].addEventListener('click', () => { S[key] = !S[key]; ui[id].classList.toggle('on', S[key]); });
ui.buildBtn.addEventListener('click', () => (build.on ? stopBuild() : startBuild(director.on && NARR && NARR.marks && NARR.marks.length === 8 ? { t0: director.t, marks: NARR.marks, end: BUILD_END } : null)));
const voiceEl = new Audio(); voiceEl.preload = 'auto';
function unlockVoice() { voiceEl.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='; voiceEl.play().catch(() => {}); }
ui.tour.addEventListener('click', () => { if (director.on) director.stop(); else { unlockVoice(); director.start(); } });
function setSlider(inp, v) { inp.value = v; inp.dispatchEvent(new Event('input')); }
function applyState(o) {
  for (const k of ['pitch', 'ls', 'land', 'rows', 'reach', 'nTop', 'nBot', 'bal', 'temp']) if (k in o) setSlider(ui[k], o[k]);
  if ('explode' in o) setSlider(ui.explode, o.explode * 100);
  if ('tech' in o) setTech(o.tech);
  for (const [id, key] of Object.entries(togs)) if (key in o) { S[key] = o[key]; ui[id].classList.toggle('on', S[key]); }
  if ('build' in o) (o.build ? startBuild() : stopBuild());
  if ('head' in o) S.head = o.head;
}
$('#panel').addEventListener('pointerdown', (e) => { if (e.isTrusted && director.on && !RECORD && e.target.closest('input,button') && !ui.tour.contains(e.target)) director.stop(); }, true);
let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointermove', (e) => { if (downAt && director.on && !RECORD && Math.abs(e.clientX - downAt.x) > 12) { downAt = null; director.stop(); } });
window.addEventListener('pointerup', () => { downAt = null; });
canvas.addEventListener('wheel', () => { if (director.on && !RECORD) director.stop(); }, { passive: true });
$('#endcard').addEventListener('click', () => { $('#endcard').style.opacity = 0; $('#endcard').style.pointerEvents = 'none'; });

// 參數依據
const SRC = window.MLO_SOURCES;
if (SRC && SRC.refs.length) {
  const cite = (r) => (r && r.length ? `<span class="c">${r.map((n) => `<a href="#ref-${n}">[${n}]</a>`).join('')}</span>` : '');
  $('#refsBox').innerHTML = `
    <button class="btn x" id="refsClose">✕ 關閉</button>
    <h2>參數依據與參考來源</h2>
    <p>${SRC.intro}</p>
    <h3>MLO 是怎麼做出來的 · Process</h3>
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
const DEFAULTS = { pitch: 80, ls: 12, land: 30, rows: 6, reach: 25, nTop: 6, nBot: 6, bal: 0, temp: 25, tech: 'mlo-low', comp: false, explode: 0, cut: false, trace: false, labels: true, build: false, head: 1 };
const CAM = [
  { t: 0.0, p: [14, 10, 19], l: [0, 0.3, 0] },
  { t: 5.5, p: [11, 8.5, 15], l: [0, 0.3, 0] },
  { t: 10.5, p: [17, 7, 22], l: [0, 0.8, 0] },
  { t: 17.0, p: [15, 4.5, 19], l: [0, 0, 0] },
  { t: 21.0, p: [5.2, 1.6, 7.8], l: [-0.6, 0, 1.2], e: 'in' },
  { t: 24.6, p: [8, 2.6, 11], l: [0, 0, 1.2], e: 'out' },
  { t: 42.5, p: [8, 2.6, 11], l: [0, 0, 1.2] },
  { t: 44.4, p: [1.2, 13, 5.5], l: [0, 0, 0] },
  { t: 50.0, p: [1.2, 13, 5.5], l: [0, 0, 0] },
  { t: 52.5, p: [13, 8, 17], l: [0, 0.2, 0] },
  { t: 57.0, p: [13, 8, 17], l: [0, 0.2, 0] },
  { t: 59.5, p: [0.5, 1.2, 17], l: [0, 0, 0] },
  { t: 64.0, p: [9, 3.5, 15], l: [0, 0, 0] },
  { t: 99.0, p: [9, 3.5, 15], l: [0, 0, 0] },
];
const ACTS = [
  { t: 0.0, set: { ...DEFAULTS } },
  { t: 5.0, show: true },
  { t: 5.6, move: ['el', '#tTrace'], d: 0.7 }, { t: 6.4, click: '#tTrace' },
  { t: 10.6, move: ['slider', 'explode'], d: 0.7 }, { t: 11.4, drag: 'explode', to: 100, d: 2.4 },
  { t: 16.0, click: '#tTrace' },
  { t: 16.3, move: ['slider', 'explode'], d: 0.6 }, { t: 17.0, drag: 'explode', to: 0, d: 1.2 },
  { t: 18.6, move: ['el', '#tCut'], d: 0.6 }, { t: 19.3, click: '#tCut' },
  { t: 24.4, move: ['el', '#buildBtn'], d: 0.7 }, { t: 25.2, click: '#buildBtn' },
  { t: 43.0, click: '#tCut' }, { t: 43.2, set: { head: 0 } },
  { t: 43.6, move: ['slider', 'pitch'], d: 0.7 }, { t: 44.4, drag: 'pitch', to: 55, d: 2.0 },
  { t: 47.2, move: ['slider', 'ls'], d: 0.6 }, { t: 47.9, drag: 'ls', to: 7, d: 1.6 },
  { t: 50.2, set: { head: 1 } },
  { t: 50.4, move: ['slider', 'temp'], d: 0.7 }, { t: 51.2, drag: 'temp', to: 125, d: 2.0 },
  { t: 54.2, move: ['el', '#tComp'], d: 0.6 }, { t: 54.9, click: '#tComp' },
  { t: 56.8, set: { temp: 25, comp: false } },
  { t: 57.2, move: ['slider', 'bal'], d: 0.7 }, { t: 58.0, drag: 'bal', to: 35, d: 2.2 },
  { t: 62.6, move: ['park'], d: 0.9 }, { t: 63.4, show: false },
];
const CAPS = [
  { t: 0.3, zh: '探針卡裡的 MLO 載板：上面接探針，下面接主板', en: "The probe card's MLO: probes on top, the PCB underneath" },
  { t: 6.4, zh: '扇出：把幾十微米的間距攤開到將近一毫米', en: 'Fan-out: tens of microns spread out to about a millimetre' },
  { t: 11.4, zh: '中間是核心板，上下各壓了好幾層增層', en: 'A core in the middle, build-up layers on both sides' },
  { t: 19.3, zh: '剖開：一層疊一層的雷射微孔', en: 'Cut it open: laser microvias stacked layer on layer' },
  { t: 25.2, zh: '每一層是這樣做出來的', en: 'This is how each layer is made' },
  { t: 44.4, zh: '探針越密，中間幾排越拉不出來', en: 'The finer the pitch, the harder the inner rows are to route out' },
  { t: 51.2, zh: '加熱到 125 °C：角落的探針對不準了', en: 'Heat it to 125 °C and the corner probes drift off their pads' },
  { t: 54.9, zh: '把探針圖案事先照測試溫度縮放', en: 'So the pattern is pre-scaled for the test temperature' },
  { t: 58.0, zh: '上下銅量不平衡，整片就翹起來', en: 'Unbalanced copper, and the whole substrate bows' },
  { t: 63.6, zh: '', en: '' },
];
const END = { t: 64.0, dur: 69.5 };
const NARR = window.MLO_NARR || null;
if (NARR) {
  const T = (t) => t + NARR.retime.reduce((s, [a, e]) => s + (t >= a ? e : 0), 0);
  for (const k of CAM) if (k.t < 90) k.t = T(k.t);
  for (const a of ACTS) a.t = T(a.t);
  END.t = T(END.t); END.dur = Math.max(T(END.dur), NARR.end);
  CAPS.length = 0; for (const l of NARR.lines) if (l.cap) CAPS.push({ t: l.t, d: l.d, zh: l.zh, en: l.en });
}
const BUILD_END = ACTS.find((a) => a.click === '#tCut' && a.t > ACTS.find((b) => b.click === '#buildBtn').t).t;   // the tour closes the cut when the build is done
const cursorEl = $('#cursor'), rippleEl = $('#ripple');
const sph = (p, l) => { const x = p[0] - l[0], y = p[1] - l[1], z = p[2] - l[2], r = Math.hypot(x, y, z); return { r, th: Math.atan2(x, z), ph: Math.acos(y / r) }; };
function camAt(t) {
  let i = 0; while (i < CAM.length - 2 && CAM[i + 1].t <= t) i++;
  const a = CAM[i], b = CAM[i + 1], v = clamp((t - a.t) / (b.t - a.t), 0, 1);
  const u = a.e === 'in' ? v * v : a.e === 'out' ? 1 - (1 - v) * (1 - v) : ease5(v);
  const l = [lerp(a.l[0], b.l[0], u), lerp(a.l[1], b.l[1], u), lerp(a.l[2], b.l[2], u)];
  const sa = sph(a.p, a.l), sb = sph(b.p, b.l);
  let dth = sb.th - sa.th; if (dth > Math.PI) dth -= 2 * Math.PI; if (dth < -Math.PI) dth += 2 * Math.PI;
  const rk = RECORD || labelMode(stageEl.clientWidth) === 'tiny' ? 1 : 1 + 0.3 * labelVis();
  const r = rk * Math.exp(lerp(Math.log(sa.r), Math.log(sb.r), u)), th = sa.th + dth * u, ph = lerp(sa.ph, sb.ph, u);
  return { p: [l[0] + r * Math.sin(ph) * Math.sin(th), l[1] + r * Math.cos(ph), l[2] + r * Math.sin(ph) * Math.cos(th)], l };
}
function thumbXY(inp, v) { const r = inp.getBoundingClientRect(), f = (v - inp.min) / (inp.max - inp.min), th = 18; return { x: r.left + th / 2 + f * (r.width - th), y: r.top + r.height / 2 }; }
function elXY(sel) { const r = $(sel).getBoundingClientRect(); return { x: r.left + r.width * 0.45, y: r.top + r.height * 0.55 }; }
const director = {
  on: false, t: 0, ai: 0, run: [], cur: { x: 0, y: 0 }, vis: 0, visT: 0, rip: null, press: [], camL: [0, 0, 0], li: 0,
  start() {
    this.on = true; this.t = 0; this.ai = 0; this.run = []; this.press = []; this.rip = null; this.visT = 0; this.vis = 0; this.li = 0;
    applyState(DEFAULTS); exS = 0; cutT = 0; traceT = 0;
    const r = stageEl.getBoundingClientRect(); this.cur = { x: r.left + r.width * 0.64, y: r.top + r.height * 0.78 };
    controls.enabled = false; ui.tour.textContent = '■ Stop tour 停止導覽';
    $('#endcard').style.opacity = 0; $('#endHint').textContent = RECORD ? '' : 'Click to explore it yourself · 點一下自己玩';
  },
  stop() {
    this.on = false; controls.enabled = true; ui.tour.textContent = '▶ Guided tour 導覽'; voiceEl.pause();
    controls.target.set(...this.camL); controls.update();
    cursorEl.style.opacity = 0; rippleEl.style.opacity = 0; $('#caption').style.opacity = 0;
    for (const k of ['pitch', 'ls', 'land', 'rows', 'reach', 'nTop', 'nBot', 'bal', 'temp', 'explode']) ui[k].classList.remove('grab');
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
    const c = camAt(t); camera.position.set(...c.p); camera.lookAt(...c.l); this.camL = c.l;
    if (t >= END.dur) { this.on = false; if (RECORD) return; this.stop(); $('#endcard').style.opacity = 1; $('#endcard').style.pointerEvents = 'auto'; }
  },
  begin(a) {
    const b = { ...a };
    if ('show' in a) { this.visT = this.t; this.vis = a.show ? 1 : 0; return; }
    if (a.set) { applyState(a.set); return; }
    const target = a.move ? (a.move[0] === 'slider' ? ui[a.move[1]] : a.move[0] === 'el' ? $(a.move[1]) : null) : null, Pn = $('#panel');
    if (target && !RECORD && Pn.scrollHeight > Pn.clientHeight + 1 && getComputedStyle(Pn).overflowY === 'auto') { const pr = Pn.getBoundingClientRect(), tr = target.getBoundingClientRect(); if (tr.bottom > pr.bottom - 8) Pn.scrollTop += tr.bottom - pr.bottom + 24; else if (tr.top < pr.top + 8) Pn.scrollTop -= pr.top - tr.top + 24; }
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
    if (ci >= 0) { const C = CAPS[ci]; if (C.zh) { cap.firstChild.textContent = C.zh; cap.lastChild.textContent = C.en; const fin = ease((t - C.t) / 0.25), fout = C.d ? 1 - ease((t - C.t - C.d - 0.5) / 0.3) : 1; cap.style.opacity = Math.min(fin, fout); cap.style.transform = `translateX(-50%) translateY(${(1 - fin) * 8}px)`; } else cap.style.opacity = 1 - ease((t - C.t) / 0.35); } else cap.style.opacity = 0;
    if (t >= END.t) $('#endcard').style.opacity = ease((t - END.t) / 0.9);
  },
};

/* ============================================================
   Main loop
   ============================================================ */
let lensS = 0;
function applyLens(W, H, dt) {
  const a = W / H;
  camera.fov = a >= 1.2 ? 34 : 2 * Math.atan(Math.tan(17 * Math.PI / 180) * 1.2 / a) * 180 / Math.PI;
  const want = RECORD || labelMode(W) === 'tiny' ? 0 : Math.min(W * 0.3, 330) * labelVis();
  lensS += (want - lensS) * (1 - Math.exp(-dt * 6));
  if (lensS < 0.5) { camera.clearViewOffset(); camera.aspect = a; }
  else { camera.aspect = (W + lensS) / H; camera.setViewOffset(W + lensS, H, lensS, 0, W, H); }
  camera.updateProjectionMatrix();
}
function resize() { const r = stageEl.getBoundingClientRect(); stage.resize(r.width, r.height); applyLens(r.width, r.height, 10); }
window.addEventListener('resize', resize);
const BOW_WORLD = 0.004;                               // world units per μm of bow (exaggerated)
function frame(dt, render = true) {
  wallT += dt;
  if (director.on) director.update(dt);
  if (rebuildAt && wallT >= rebuildAt) { rebuildAt = 0; wantRebuild(); }
  if (build.on) { build.t += dt; if (build.t >= build.total) stopBuild(); }
  exS += (S.explode - exS) * (1 - Math.exp(-dt * 12));
  cutT = clamp(cutT + (S.cut ? dt : -dt) / 1.2, 0, 1);
  traceT = clamp(traceT + (S.trace ? dt : -dt) / 0.6, 0, 1);
  labelT = clamp(labelT + (S.labels ? dt : -dt) / 0.3, 0, 1);
  const bowTarget = clamp(bowNow() / 300, -1.5, 1.5); bowW += (bowTarget - bowW) * (1 - Math.exp(-dt * 6));
  hotT += (clamp((S.temp - 25) / 125, 0, 1) - hotT) * (1 - Math.exp(-dt * 4));
  const B = buildState(); headT = clamp(headT + ((B.on ? 0 : S.head) - headT) * (1 - Math.exp(-dt * 6)), 0, 1);
  if (!render) return;
  if (!director.on) controls.update();
  const Pn = params(), offFrac = Math.abs(offsetAt(Pn, S.temp)) / TOL;
  stage.frame({ ex: exS, cut: cutT, trace: traceT * (B.on ? 0 : 1), bow: clamp(bowNow() * BOW_WORLD, -1.6, 1.6), hot: hotT, head: headT, headLift: 0, build: B, t: wallT, offFrac }, dt);
  const r = stageEl.getBoundingClientRect();
  applyLens(r.width, r.height, dt);
  stage.render();
  updateLabels(r.width, r.height);
  drawXs(); drawFan(); drawOff(); updateDOM(); updateToasts();
  if (director.on || RECORD) director.overlay();
}
wantRebuild(); resize();
applyState(DEFAULTS);
camera.position.set(15, 11, 21); controls.target.set(0, 0.2, 0); controls.update();
window.__mlo = { S, params, applyState, director, frame, stage, build };
if (RECORD) {
  for (let i = 0; i < 30; i++) frame(1 / 30, false);
  director.start();
  window.__advance = (dt) => { frame(dt); return { t: director.t, done: director.t >= END.dur }; };
  window.__seek = (t) => { while (director.t + 1 / 30 < t) frame(1 / 30, false); frame(1 / 30); return director.t; };
  window.__info = () => ({ dur: END.dur });
  const allText = document.body.innerText + CAPS.map((c) => c.zh).join('') + STEPS.map((s) => s.zh).join('') + '第層增層膜在高溫下壓上熟化雷射燒出錐形微孔停在下層的銅墊清掉孔底殘渣把表面咬粗整面長一很薄化學銅當晶種貼乾膜曝光顯影只露出要長銅地方電鍍把線路長厚同時孔填滿去掉光阻露出來薄晶種蝕刻掉就分開了陶瓷多層板訊號層電源地核心';
  Promise.all(['400', '500', '600', '700', '900'].map((wt) => document.fonts.load(`${wt} 20px "Noto Sans TC"`, allText))).catch(() => {}).then(() => document.fonts.ready).then(() => { frame(0); window.__ready = true; });
} else {
  let last = performance.now(), failed = false;
  (function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; try { frame(dt); } catch (e) { if (!failed) { failed = true; console.error(e); } } requestAnimationFrame(loop); })(last);
}
