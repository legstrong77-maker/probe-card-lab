// Final Test Board Lab — simulation loop, controls, 2D read-outs, labels and the guided tour.
import * as THREE from 'three';
import { createStage, MMW, Y, EX, TRAYS, PCB, THEAD, POGO_Z, PITCH } from './scene.js';
import { PIN, WARP_LIMIT, BALLS, REAL_BALLS, force, cres, DEFECT, falseFail, DIRT_PER_INS, CLEAN_DUE, MOVE, SORT, MSE, HANDLER_UPH, testTimeN, cycleT, uphOf, phaseEdges, testFromSlider, sliderFromTest, idxFromSlider, sliderFromIdx, hash } from './model.js';

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
const S = { stroke: 0.4, warp: 0.05, test: 3, idx: 0.6, n: 4, ts: 1, tsCur: 1, explode: 0, cut: false, trace: false, labels: true };
let exS = 0, cutT = 0, traceT = 0, labelT = 1, wallT = 0;
const IN = TRAYS.in, OUT = TRAYS.pass;
const sim = {
  cyc: 0, k: -1, phase: 0, phaseU: 0, comp: 0, resolved: false, dropped: false,
  pick: [], drop: [], res: [], serial: 40,
  inT: new Uint8Array(IN.p.length).fill(1), passT: new Uint8Array(TRAYS.pass.p.length), failT: new Uint8Array(TRAYS.fail.p.length),
  passR: new Uint8Array(TRAYS.pass.p.length), failR: new Uint8Array(TRAYS.fail.p.length),
  tested: 0, passed: 0, ins: 0, sinceClean: 0, lot: 1, hist: [], flags: {},
  view: { dev: [], led: [], trays: null },
};
function resetRun() {
  sim.cyc = 0; sim.k = -1; sim.resolved = sim.dropped = false; sim.pick = []; sim.drop = []; sim.res = [];
  sim.inT.fill(1); sim.passT.fill(0); sim.failT.fill(0); sim.passR.fill(0); sim.failR.fill(0);
  sim.tested = sim.passed = 0; sim.hist = []; sim.flags = {};
}
const strokeEff = () => Math.min(S.stroke, PIN.max);
function resolve() {                                   // end of TEST: decide every site's result
  if (sim.resolved) return; sim.resolved = true;
  const dirt = DIRT_PER_INS * sim.sinceClean, sLast = strokeEff() - S.warp, R = cres(sLast, dirt);
  for (let i = 0; i < sim.pick.length; i++) {
    const id = sim.serial++, bad = hash(id * 7 + 3) < DEFECT;
    const ff = !bad && hash(id * 13 + 1) < falseFail(R * (0.9 + 0.2 * hash(id * 17 + 5)));
    const res = bad || ff ? 2 : 1;
    sim.res[i] = res; sim.tested++; if (res === 1) sim.passed++;
    sim.hist.push(res); if (sim.hist.length > 96) sim.hist.shift();
    const occ = res === 1 ? sim.passT : sim.failT, rsv = res === 1 ? sim.passR : sim.failR;
    let idx = -1;
    for (let pass = 0; pass < 2 && idx < 0; pass++) { for (let j = 0; j < occ.length; j++) if (!occ[j] && !rsv[j]) { idx = j; break; } if (idx < 0) occ.fill(0); }   // tray full: swap in an empty one
    if (idx < 0) idx = i % occ.length;
    rsv[idx] = 1; sim.drop[i] = { fail: res !== 1, idx };
  }
  sim.ins++; sim.sinceClean++;
  if (sLast <= 0) once('open', '⚠ 角落的錫球沒碰到探針', 'Corner balls never reach their pins — every device fails', 'bad');
  else if (R > 600 && dirt < 150) once('weak', '⚠ 下壓行程不夠，接觸電阻偏高', 'Too little stroke: contact resistance is high, good parts fail', 'warn');
  if (S.stroke > PIN.max) once('over', '✖ 探針壓到底了', 'Pins are bottomed out — force spikes, balls and pins get damaged', 'bad');
  if (sim.sinceClean === CLEAN_DUE) toast('⚠ 針尖沾了錫，該清潔測試座了', 'Solder has built up on the pin tips — contact resistance is climbing', 'warn');
}
function commitDrop() {
  if (sim.dropped) return; sim.dropped = true;
  sim.drop.forEach((d) => { if (!d) return; (d.fail ? sim.failT : sim.passT)[d.idx] = 1; (d.fail ? sim.failR : sim.passR)[d.idx] = 0; });
}
function newCycle(k) {
  if (sim.k >= 0) { resolve(); commitDrop(); }
  sim.k = k; sim.resolved = false; sim.dropped = false; sim.res = []; sim.drop = [];
  let free = []; for (let i = 0; i < sim.inT.length; i++) if (sim.inT[i]) free.push(i);
  if (free.length < S.n) { sim.inT.fill(1); free = [...sim.inT.keys()]; sim.lot++; }
  sim.pick = free.slice(0, S.n); for (const i of sim.pick) sim.inT[i] = 0;
}
function simAdvance(c) {
  while (Math.floor(c) > sim.k) newCycle(sim.k + 1);
  sim.cyc = c;
  const E = phaseEdges(S), p = c - sim.k;
  if (p >= E[4]) { resolve(); if ((p - E[4]) / (1 - E[4]) >= SORT.drop) commitDrop(); }
}
function kinematics() {
  const E = phaseEdges(S), p = sim.cyc - sim.k; let ph = 4;
  for (let i = 0; i < 5; i++) if (p < E[i + 1]) { ph = i; break; }
  const u = clamp((p - E[ph]) / (E[ph + 1] - E[ph]), 0, 1), sE = strokeEff(), sites = stage.sites, n = sim.pick.length;
  sim.phase = ph; sim.phaseU = u;
  let headX = 0, devY = Y.carry, comp = 0, mode = 'held', tu = 0, ledA = 0;
  if (ph === 0) { headX = IN.x; mode = 'pick'; tu = u; }
  else if (ph === 1) headX = lerp(IN.x, 0, ease5(u));
  else if (ph === 2) { if (u < 0.6) devY = lerp(Y.carry, Y.tip, ease(u / 0.6)); else { comp = sE * ease((u - 0.6) / 0.4); devY = Y.tip - comp * MMW; } }
  else if (ph === 3) { comp = sE; devY = Y.tip - comp * MMW; }
  else {
    ledA = 1;
    if (u < SORT.lift) { const q = u / SORT.lift; if (q < 0.3) { comp = sE * (1 - ease(q / 0.3)); devY = Y.tip - comp * MMW; } else devY = lerp(Y.tip, Y.carry, ease((q - 0.3) / 0.7)); }
    else if (u < SORT.out) headX = lerp(0, OUT.x, ease5((u - SORT.lift) / (SORT.out - SORT.lift)));
    else if (u < SORT.drop) { headX = OUT.x; mode = 'drop'; tu = (u - SORT.out) / (SORT.drop - SORT.out); ledA = 1 - tu; }
    else { headX = lerp(OUT.x, IN.x, ease5((u - SORT.drop) / (1 - SORT.drop))); mode = 'none'; ledA = 0; }
  }
  const e = ease(Math.min(1, exS / 0.12));              // exploded view: park the head over the sockets
  headX = lerp(headX, 0, e); comp *= 1 - e; sim.comp = comp;
  const v = sim.view;
  for (let i = 0; i < 8; i++) {
    const d = v.dev[i] || (v.dev[i] = { x: 0, y: 0, z: 0, on: false });
    if (i >= sites.length) { d.on = false; continue; }
    const [sx, sz] = sites[i]; let x = headX + sx, y = devY, z = sz, on = i < n && mode !== 'none';
    if (on && (mode === 'pick' || mode === 'drop')) {
      const T = mode === 'pick' ? IN : sim.drop[i] && sim.drop[i].fail ? TRAYS.fail : TRAYS.pass, idx = mode === 'pick' ? sim.pick[i] : sim.drop[i] ? sim.drop[i].idx : 0;
      const q = ease(mode === 'pick' ? tu : 1 - tu), P = T.p[idx];
      x = lerp(P[0], x, q); z = lerp(P[1], z, q); y = lerp(Y.trayDev, Y.carry, q) + Math.sin(Math.PI * q) * 0.5;
    }
    if (e > 0) { x = lerp(x, sx, e); z = lerp(z, sz, e); y = lerp(on ? y : Y.tip + 0.03, Y.tip + 0.03, e) + EX.dev * exS; on = on || e > 0.5; }
    d.x = x; d.y = y; d.z = z; d.on = on;
    v.led[i] = ph === 4 ? sim.res[i] || 0 : 0;
  }
  v.headX = headX; v.headY = lerp((mode === 'held' ? devY : Y.carry) + Y.devH, Y.carry + Y.devH, e) + EX.head * exS;
  v.comp = comp; v.ledA = ledA * (1 - e); v.testing = ph === 3 && e < 0.5;
  v.over = S.stroke > PIN.max && comp > PIN.max - 0.01;
}

/* ============================================================
   Labels
   ============================================================ */
const siteR = () => Math.max(...stage.sites.map((s) => Math.abs(s[0]))) + 1.45;
const LABELS = [
  { id: 'head', zh: '分類機壓頭', en: 'Handler contact head', d: 'Presses the devices into the sockets · 120–900 kgf on real handlers', r: () => siteR() - 0.2, y: () => sim.view.headY + 0.7, mate: true },
  { id: 'dev', zh: '待測晶片', en: 'Device under test', d: 'A packaged BGA, solder balls facing down', r: () => siteR() - 0.65, y: () => (sim.view.dev[0] ? sim.view.dev[0].y : 0) + 0.15 },
  { id: 'sock', zh: '測試座', en: 'Test socket', d: 'One spring probe under every ball · 0.4–0.5 mm of travel each', r: () => siteR(), y: () => 0.5 + EX.sock * exS, mate: true },
  { id: 'pcb', zh: '測試載板', en: 'Load board · DIB', d: 'Routes every tester channel to the sockets · public examples: 26–60 layers, 5–8 mm thick', r: () => PCB.w / 2, y: () => -0.25, dis: true },
  { id: 'stiff', zh: '補強框', en: 'Stiffener', d: 'Keeps the board flat under the plunge force and the docking load', r: () => PCB.w / 2 + 0.3, y: () => -0.75 + EX.stiff * exS },
  { id: 'pogo', zh: '彈簧針介面', en: 'Tester interface', d: 'Spring pins on the test head touch pads under the board', r: () => 7.1, y: () => -1.3 + EX.pogo * exS },
  { id: 'th', zh: '測試頭', en: 'Test head', d: 'Instrument cards: power, digital, analog, RF', r: () => THEAD.w / 2, y: () => THEAD.top - 1.1 + EX.th * exS },
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
function labelVis() { return labelT * ease((exS - 0.5) / 0.3); }
function labelMode(W) { return W < 640 ? 'tiny' : W < 1100 ? 'compact' : 'full'; }
function toScreen(x, y, z, W, H) { _v.set(x, y, z).project(camera); return { x: (_v.x + 1) / 2 * W, y: (1 - _v.y) / 2 * H, ok: _v.z < 1 }; }
function updateLabels(W, H) {
  const op = labelVis();
  labelBox.style.opacity = op; $('#leaders').style.opacity = op;
  if (op < 0.01) return;
  const mode = labelMode(W);
  if (labelBox.dataset.mode !== mode) labelBox.dataset.mode = mode;
  _rv.setFromMatrixColumn(camera.matrixWorld, 0); _rv.y = 0; _rv.normalize();
  let minX = 1e9, maxX = -1e9;
  for (const [r, y] of [[THEAD.w / 2, THEAD.top + EX.th * exS], [THEAD.w / 2, THEAD.top - THEAD.h + EX.th * exS], [PCB.w / 2, 0], [siteR(), sim.view.headY + 1.2]]) {
    for (const sg of [-1, 1]) { const q = toScreen(sg * _rv.x * r, y, sg * _rv.z * r, W, H); minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); }
  }
  const side = W - maxX >= minX ? 1 : -1;
  const hudEl = $('.hud'), hudOn = hudEl.offsetParent !== null;
  const sr = stageEl.getBoundingClientRect(), hr = hudEl.getBoundingClientRect();
  const hud = { l: hr.left - sr.left - 10, r: hr.right - sr.left + 10, b: hr.bottom - sr.top + 8 };
  const top = mode === 'tiny' ? 70 : 14, bottom = H - (mode === 'tiny' ? 54 : 78), gap = mode === 'full' ? 8 : 5;
  const items = LABELS.map((L, i) => {
    const r = L.r(), q = toScreen(side * _rv.x * r, L.y(), side * _rv.z * r, W, H), el = labelEls[i];
    return { i, sx: q.x, sy: q.y, ok: q.ok, w: el.offsetWidth, h: el.offsetHeight };
  }).sort((a, b) => a.sy - b.sy);
  for (const it of items) {
    let lx = mode === 'tiny' ? (side > 0 ? it.sx + 16 : it.sx - 16 - it.w) : (side > 0 ? Math.max(maxX + 22, it.sx + 36) : Math.min(minX - 22 - it.w, it.sx - 36 - it.w));
    lx = clamp(lx, 6, W - it.w - 6); it.lx = lx;
    it.minY = hudOn && lx + it.w > hud.l && lx < hud.r ? hud.b : top;
  }
  let prev = -1e9;
  for (const it of items) { it.ly = Math.max(it.sy - it.h / 2, prev + gap, it.minY); prev = it.ly + it.h; }
  const over = prev - bottom;
  if (over > 0) for (const it of items) it.ly = Math.max(it.minY, it.ly - over);
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
   2D read-outs: contact microscope, force chart, throughput chart, bins
   ============================================================ */
const scope = $('#scope'), sctx = scope.getContext('2d');
const chart = $('#chart'), cctx = chart.getContext('2d');
const uphCv = $('#uph'), uctx = uphCv.getContext('2d');
const bins = $('#bins'), bctx = bins.getContext('2d');
function fitCanvas(cv) {
  const r = cv.getBoundingClientRect(), d = RECORD ? REC_DPR : Math.min(devicePixelRatio, 2);
  const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  return { w: r.width, h: r.height, d };
}
const dirtNow = () => DIRT_PER_INS * sim.sinceClean;
function contactState(off) {                           // one ball: how far its pin is pushed right now, and what that gives
  const s = Math.max(0, sim.comp - off), target = strokeEff() - off;
  return { s, target, F: force(s), R: cres(s, dirtNow()), touching: s > 0, open: sim.phase === 3 && s <= 0 && exS < 0.02 };
}
function drawScope() {
  const fit = fitCanvas(scope), g = sctx, k = fit.w / 560, w = 560, h = 270;
  g.setTransform(fit.d * k, 0, 0, fit.d * k, 0, 0);
  g.fillStyle = '#070a10'; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,.035)'; g.lineWidth = 1;
  for (let x = 0; x < w; x += 20) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); g.stroke(); }
  for (let y = 0; y < h; y += 20) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke(); }
  drawPin(g, 0, w / 2, h, 0, 'CENTER BALL', '中心的錫球 · 最先碰到');
  drawPin(g, w / 2, w / 2, h, S.warp, 'CORNER BALL', '角落的錫球 · 最後碰到');
  g.fillStyle = '#1f2835'; g.fillRect(w / 2 - 0.5, 0, 1, h);
}
function drawPin(g, x0, w, h, off, title, sub) {
  const st = contactState(off), PX = 95;                 // px per mm of travel (the pin itself is drawn shorter than scale)
  const cx = x0 + w * 0.46, padY = h - 30, barrelB = padY - 24, barrelT = barrelB - 84, tipFree = barrelT - 40;
  const over = S.stroke > PIN.max && st.s >= PIN.max - 0.005, red = st.open || over;
  g.save(); g.beginPath(); g.rect(x0, 0, w, h); g.clip();
  // board with its pad and a via
  g.fillStyle = '#0f4a35'; g.fillRect(x0, padY, w, h - padY);
  g.fillStyle = 'rgba(231,173,99,.5)'; for (let l = 0; l < 3; l++) g.fillRect(x0, padY + 9 + l * 7, w, 1.5);
  g.fillStyle = '#e7ad63'; g.fillRect(cx - 5, padY, 10, h - padY); g.fillStyle = '#d9b860'; g.fillRect(cx - 26, padY - 4, 52, 5);
  // socket body around the pin
  g.fillStyle = 'rgba(192,138,62,.22)'; g.fillRect(x0, barrelB - 8, w, -(84 + 8)); g.fillStyle = '#070a10'; g.fillRect(cx - 20, barrelT - 17, 40, 110);
  // lower plunger, barrel, spring
  const metal = red ? '#e39a9a' : '#d9b860', tipY = tipFree + st.s * PX;
  g.fillStyle = metal; g.fillRect(cx - 5, barrelB - 4, 10, padY - barrelB);
  g.fillStyle = 'rgba(217,184,96,.16)'; g.strokeStyle = metal; g.lineWidth = 2.5; g.beginPath(); g.roundRect(cx - 15, barrelT, 30, barrelB - barrelT, 3); g.fill(); g.stroke();
  const sT = tipY + 36, sB = barrelB - 8, turns = 9;
  g.strokeStyle = red ? '#ff8d8d' : '#c6ced9'; g.lineWidth = 2; g.beginPath();
  for (let i = 0; i <= turns * 2; i++) { const y = lerp(sT, sB, i / (turns * 2)), x = cx + (i % 2 ? 9 : -9); i ? g.lineTo(x, y) : g.moveTo(x, y); }
  g.stroke();
  // upper plunger with a crown tip
  g.fillStyle = metal; g.fillRect(cx - 6, tipY + 8, 12, 32);
  g.beginPath(); g.moveTo(cx - 11, tipY + 9); g.lineTo(cx - 11, tipY); g.lineTo(cx - 5.5, tipY + 5); g.lineTo(cx, tipY); g.lineTo(cx + 5.5, tipY + 5); g.lineTo(cx + 11, tipY); g.lineTo(cx + 11, tipY + 9); g.fill();
  if (sim.sinceClean > 120) { g.fillStyle = `rgba(150,156,165,${clamp(sim.sinceClean / 900, 0.15, 0.9)})`; g.beginPath(); g.moveTo(cx - 11, tipY + 4); g.lineTo(cx - 11, tipY); g.lineTo(cx - 5.5, tipY + 5); g.lineTo(cx, tipY); g.lineTo(cx + 5.5, tipY + 5); g.lineTo(cx + 11, tipY); g.lineTo(cx + 11, tipY + 4); g.fill(); }
  // the package: substrate and one solder ball, riding down with the pusher
  const lift = sim.phase === 2 && sim.comp <= 0 ? (1 - ease(sim.phaseU / 0.6)) * 24 : sim.phase === 3 || sim.comp > 0 ? 0 : 24;
  const ballB = tipFree + 3 + (sim.comp - off) * PX - (sim.comp > 0 ? 0 : lift), br = 17, by = ballB - br;
  g.fillStyle = '#1d5a41'; g.fillRect(x0, by - br - 16 + 3, w, 16); g.fillStyle = '#e7ad63'; g.fillRect(x0, by - br - 8, w, 1.5); g.fillRect(cx - 14, by - br + 1, 28, 3);
  g.fillStyle = '#1c1e22'; g.fillRect(x0, 0, w, Math.max(0, by - br - 13));
  const bg = g.createRadialGradient(cx - 5, by - 6, 2, cx, by, br); bg.addColorStop(0, '#f4f6f9'); bg.addColorStop(1, '#9aa5b3');
  g.fillStyle = bg; g.beginPath(); g.arc(cx, by, br, 0, Math.PI * 2); g.fill();
  if (st.touching && sim.phase >= 2 && sim.phase <= 3) { const gr = g.createRadialGradient(cx, tipY + 2, 0, cx, tipY + 2, 18); gr.addColorStop(0, 'rgba(160,240,255,.85)'); gr.addColorStop(1, 'rgba(160,240,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(cx, tipY + 2, 18, 0, Math.PI * 2); g.fill(); }
  // travel gauge on the right
  const gx = x0 + w - 50, gT = tipFree, gB = tipFree + 0.8 * PX;
  g.fillStyle = '#121925'; g.fillRect(gx, gT, 8, gB - gT);
  g.fillStyle = 'rgba(72,211,138,.35)'; g.fillRect(gx, gT + PIN.rec[0] * PX, 8, (PIN.rec[1] - PIN.rec[0]) * PX);
  g.fillStyle = 'rgba(255,93,93,.4)'; g.fillRect(gx, gT + PIN.max * PX, 8, gB - gT - PIN.max * PX);
  g.fillStyle = red ? '#ff5d5d' : '#4cc9f0'; g.fillRect(gx - 3, gT + Math.min(0.8, st.s) * PX - 1.5, 14, 3);
  g.fillStyle = 'rgba(141,152,170,.8)'; g.font = '500 8.5px JetBrains Mono, monospace'; g.fillText('0', gx + 12, gT + 3); g.fillText(PIN.max.toFixed(2), gx + 12, gT + PIN.max * PX + 3); g.fillText('mm', gx + 12, gB + 2);
  // titles and status
  g.fillStyle = 'rgba(7,10,16,.78)'; g.fillRect(x0, 0, w - 1, 41);
  g.fillStyle = off > 0 ? '#7fd6ff' : '#ffc861'; g.font = '700 11px JetBrains Mono, monospace'; g.fillText(title, x0 + 10, 18);
  g.fillStyle = '#b9c2d0'; g.font = '500 11px Inter, "Noto Sans TC", sans-serif'; g.fillText(sub, x0 + 10, 34);
  const msg = over ? 'BOTTOMED OUT' : st.open ? 'OPEN · no contact' : st.touching ? `travel ${st.s.toFixed(2)} mm · ${st.F.toFixed(0)} gf` : `will travel ${Math.max(0, st.target).toFixed(2)} mm`;
  g.font = '600 10.5px JetBrains Mono, monospace'; const mw = g.measureText(msg).width;
  g.fillStyle = 'rgba(7,10,16,.85)'; g.beginPath(); g.roundRect(x0 + 6, h - 24, mw + 14, 19, 5); g.fill();
  g.fillStyle = red ? '#ff6b6b' : '#c9d2de'; g.fillText(msg, x0 + 13, h - 10.5);
  g.restore();
}
function drawChart() {
  const { w, h, d } = fitCanvas(chart), g = cctx;
  g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
  const l = 28, r = 6, t = 6, b = 18, W = w - l - r, H = h - t - b, FM = 60;
  const X = (s) => l + s / 0.8 * W, Yf = (f) => t + H - Math.min(FM, f) / FM * H;
  g.fillStyle = 'rgba(72,211,138,.08)'; g.fillRect(X(PIN.rec[0]), t, X(PIN.rec[1]) - X(PIN.rec[0]), H);
  g.fillStyle = 'rgba(255,93,93,.08)'; g.fillRect(X(PIN.max), t, X(0.8) - X(PIN.max), H);
  g.fillStyle = 'rgba(141,152,170,.75)'; g.font = '500 9px JetBrains Mono, monospace';
  g.fillText('working', X(PIN.rec[0]) + 3, t + 9); g.fillText('solid', X(PIN.max) + 3, t + 9);
  g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1;
  for (const f of [0, 20, 40, 60]) { g.beginPath(); g.moveTo(l, Yf(f) + 0.5); g.lineTo(l + W, Yf(f) + 0.5); g.stroke(); g.fillText(f + '', 8, Yf(f) + 3); }
  for (const s of [0, 0.2, 0.4, 0.6, 0.8]) g.fillText(s.toFixed(1), X(s) - (s > 0.7 ? 16 : 7), h - 4);
  g.fillText('mm', X(0.8) - 16, t + H - 4);
  g.fillText('gf', l + 4, t + 9);
  g.strokeStyle = '#ffc861'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(0), Yf(0));
  for (let s = 0.001; s <= 0.8; s += 0.005) g.lineTo(X(s), Yf(force(s)));
  g.stroke();
  for (const [off, col] of [[0, '#ffc861'], [S.warp, '#7fd6ff']]) { const s = Math.max(0, sim.comp - off); g.fillStyle = col; g.beginPath(); g.arc(X(Math.min(0.8, s)), Yf(force(s)), 4, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#4cc9f0'; g.beginPath(); g.moveTo(X(S.stroke), t + H); g.lineTo(X(S.stroke) - 5, t + H + 7); g.lineTo(X(S.stroke) + 5, t + H + 7); g.fill();
}
function drawUph() {
  const { w, h, d } = fitCanvas(uphCv), g = uctx;
  g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
  const l = 34, r = 6, t = 8, b = 18, W = w - l - r, H = h - t - b, NS = [1, 2, 4, 8];
  const vals = NS.map((n) => uphOf(S, n)), ideal = NS.map((n) => n * uphOf(S, 1));
  const top = Math.max(1000, Math.min(HANDLER_UPH * 1.15, Math.max(...ideal) * 1.08));
  const Yv = (v) => t + H - Math.min(top, v) / top * H, bw = W / NS.length;
  g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1; g.font = '500 9px JetBrains Mono, monospace'; g.fillStyle = 'rgba(141,152,170,.75)';
  for (let i = 0; i <= 2; i++) { const v = top * i / 2; g.beginPath(); g.moveTo(l, Yv(v) + 0.5); g.lineTo(l + W, Yv(v) + 0.5); g.stroke(); g.fillText(v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toFixed(0), 4, Yv(v) + 3); }
  if (HANDLER_UPH <= top) { g.setLineDash([3, 3]); g.strokeStyle = 'rgba(255,178,36,.8)'; g.beginPath(); g.moveTo(l, Yv(HANDLER_UPH) + 0.5); g.lineTo(l + W, Yv(HANDLER_UPH) + 0.5); g.stroke(); g.setLineDash([]); g.fillStyle = 'rgba(255,178,36,.9)'; g.fillText('handler limit', l + 4, Yv(HANDLER_UPH) - 3); }
  NS.forEach((n, i) => {
    const x = l + i * bw + bw * 0.2, ww = bw * 0.6, on = n === S.n;
    g.setLineDash([2, 3]); g.strokeStyle = 'rgba(141,152,170,.5)'; g.strokeRect(x + 0.5, Yv(ideal[i]) + 0.5, ww - 1, t + H - Yv(ideal[i]) - 1); g.setLineDash([]);
    g.fillStyle = on ? '#4cc9f0' : '#2a3a4d'; g.fillRect(x, Yv(vals[i]), ww, t + H - Yv(vals[i]));
    g.fillStyle = on ? '#e8edf4' : 'rgba(141,152,170,.85)'; g.fillText('×' + n, x + ww / 2 - 6, h - 5);
  });
}
function drawBins() {
  if (bins.offsetParent === null) return;
  const { w, h, d } = fitCanvas(bins), g = bctx;
  g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
  const cols = 16, rows = 6, cw = w / cols, ch = h / rows, H = sim.hist, o = cols * rows - H.length;
  for (let i = 0; i < cols * rows; i++) {
    const v = i >= o ? H[i - o] : 0;
    g.fillStyle = v === 1 ? '#3fcf85' : v === 2 ? '#ff5d5d' : '#1a2230';
    g.fillRect((i % cols) * cw + 1, Math.floor(i / cols) * ch + 1, cw - 2, ch - 2);
  }
}

/* ============================================================
   DOM read-outs
   ============================================================ */
const txtCache = new Map();
function setText(id, t, cls) { const el = document.getElementById(id); const key = t + '|' + (cls || ''); if (txtCache.get(id) === key) return; txtCache.set(id, key); el.textContent = t; if (cls !== undefined) el.className = cls; }
const phEls = [...document.querySelectorAll('.ph')];
const fmtR = (R) => (R === Infinity ? 'OPEN' : R >= 1000 ? (R / 1000).toFixed(2) + ' Ω' : R.toFixed(0) + ' mΩ');
const rCls = (R) => (R === Infinity ? 'bad' : R < 300 ? 'good' : R < 1000 ? 'mid' : 'bad');
const fmtT = (t) => (t < 10 ? t.toFixed(1) : t.toFixed(0)) + ' s';
function updateDOM() {
  setText('zNow', sim.comp.toFixed(2));
  for (const [off, s] of [[0, 'C'], [S.warp, 'K']]) {
    const st = contactState(off), tgt = Math.max(0, st.target), live = st.touching;
    setText('t' + s, (live ? st.s : tgt).toFixed(2) + ' mm', tgt <= 0 ? 'bad' : '');
    setText('f' + s, (live ? st.F : force(tgt)).toFixed(0) + ' gf');
    const R = live ? st.R : cres(tgt, dirtNow());
    setText('r' + s, fmtR(R), rCls(R));
    const pct = Math.round((live ? st.s : tgt) / PIN.max * 100), bar = document.getElementById('b' + s);
    setText('p' + s, pct + '%', pct >= 100 ? 'bad' : pct < 25 ? 'mid' : '');
    bar.style.width = Math.min(100, pct) + '%'; bar.style.background = pct >= 100 ? '#ff5d5d' : pct < 25 ? '#ffb224' : '#48d38a';
  }
  phEls.forEach((el, i) => { el.classList.toggle('on', i === sim.phase && exS < 0.02); el.lastChild.style.width = (i === sim.phase && exS < 0.02 ? sim.phaseU * 100 : 0) + '%'; });
  setText('lotNo', 'tray #' + sim.lot);
  setText('stTested', sim.tested.toLocaleString('en-US'));
  setText('stYield', sim.tested ? (sim.passed / sim.tested * 100).toFixed(1) + '%' : '—');
  const u = uphOf(S); setText('stUph', Math.round(u).toLocaleString('en-US') + ' UPH'); setText('uphNow', Math.round(u).toLocaleString('en-US') + ' UPH');
  setText('stIns', sim.ins.toLocaleString('en-US'));
  setText('stClean', sim.sinceClean.toLocaleString('en-US'), sim.sinceClean >= CLEAN_DUE ? 'bad' : '');
  const sp = $('#speed');
  if (exS > 0.02) { sp.style.display = 'block'; sp.className = 'pause'; setText('speed', '❚❚ HANDLER PARKED · 拆解中，機台暫停'); }
  else if (S.ts === 1) sp.style.display = 'none';
  else { sp.style.display = 'block'; sp.className = S.ts === 0 ? 'pause' : ''; setText('speed', S.ts === 0 ? '❚❚ TIME FROZEN · 時間凍結' : S.ts < 1 ? '×0.1 SLOW MOTION · 慢動作' : `⏩ ×${S.ts} TIME-LAPSE · 快轉`); }
  const last = strokeEff() - S.warp;
  setText('planLine', S.warp === 0 ? `Flat package · every ball gets the full ${S.stroke.toFixed(2)} mm` : `Warpage ${S.warp.toFixed(2)} mm${S.warp > WARP_LIMIT ? ' (over the 0.15 mm JEDEC limit)' : ''} · corner balls get ${last > 0 ? last.toFixed(2) + ' mm' : 'nothing → OPEN'} of the ${S.stroke.toFixed(2)} mm stroke`, last <= 0.1 ? 'bad' : last < PIN.rec[0] - 0.1 || S.warp > WARP_LIMIT ? 'mid' : '');
  const F = force(strokeEff()), perDev = BALLS * F / 1000, realDev = REAL_BALLS * F / 1000;
  const foot = `<b>這個測試座：</b>${BALLS} 顆錫球 × ${F.toFixed(0)} gf ≈ <b>${perDev.toFixed(1)} kgf</b>／顆，${S.n} 顆同測要壓 ${(perDev * S.n).toFixed(0)} kgf。真實的大型 BGA 有上千顆錫球：${REAL_BALLS.toLocaleString('en-US')} 球 × ${F.toFixed(0)} gf ≈ ${realDev.toFixed(0)} kgf／顆，載板和補強框要撐得住。 <a href="#" id="refsLink">參數依據與參考來源 →</a><br><span class="dis">DIS 做的：</span>${window.FT_SOURCES ? window.FT_SOURCES.dis : ''}個人作品、示意模型：尺寸放大、物理簡化，數字為業界通用量級，非官方資料。`;
  if (txtCache.get('foot') !== foot) { txtCache.set('foot', foot); $('#foot').innerHTML = foot; }
}

/* ============================================================
   Toasts
   ============================================================ */
const toasts = [];
function toast(zh, en, kind = 'bad') {
  const el = document.createElement('div'); el.className = 'toast ' + (kind === 'bad' ? '' : kind);
  el.innerHTML = `${zh}<small>${en}</small>`; $('#toasts').appendChild(el);
  toasts.push({ el, t0: wallT });
  while (toasts.length > 3) { const o = toasts.shift(); o.el.remove(); }
}
function once(key, zh, en, kind) { if (sim.flags[key]) return; sim.flags[key] = 1; toast(zh, en, kind); }
function updateToasts() {
  for (let i = toasts.length - 1; i >= 0; i--) {
    const t = wallT - toasts[i].t0, life = 4.2, op = Math.min(ease(t / 0.25), 1 - ease((t - life) / 0.45));
    toasts[i].el.style.opacity = op; toasts[i].el.style.transform = `translateY(${(1 - ease(t / 0.25)) * -10}px)`;
    if (t > life + 0.5) { toasts[i].el.remove(); toasts.splice(i, 1); }
  }
  // a warning can come back once its cause has gone away
  const last = strokeEff() - S.warp;
  if (last > 0.02) sim.flags.open = 0; if (cres(last, 0) < 400) sim.flags.weak = 0; if (S.stroke <= PIN.max) sim.flags.over = 0;
}

/* ============================================================
   Controls
   ============================================================ */
const ui = { stroke: $('#stroke'), warp: $('#warp'), test: $('#test'), idx: $('#idx'), explode: $('#explode'), tCut: $('#tCut'), tTrace: $('#tTrace'), tLabels: $('#tLabels'), tour: $('#tour'), clean: $('#clean') };
const segT = [...document.querySelectorAll('#segT button')], segN = [...document.querySelectorAll('#segN button')];
function fill(inp) { inp.style.setProperty('--p', ((inp.value - inp.min) / (inp.max - inp.min) * 100) + '%'); }
ui.stroke.addEventListener('input', () => { S.stroke = ui.stroke.value / 100; $('#strokeOut').textContent = S.stroke.toFixed(2) + ' mm'; fill(ui.stroke); });
ui.warp.addEventListener('input', () => { S.warp = ui.warp.value / 100; $('#warpOut').textContent = S.warp.toFixed(2) + ' mm'; fill(ui.warp); });
ui.test.addEventListener('input', () => { S.test = testFromSlider(+ui.test.value); $('#testOut').textContent = fmtT(S.test); fill(ui.test); });
ui.idx.addEventListener('input', () => { S.idx = idxFromSlider(+ui.idx.value); $('#idxOut').textContent = S.idx.toFixed(2) + ' s'; fill(ui.idx); });
ui.explode.addEventListener('input', () => { S.explode = ui.explode.value / 100; $('#exOut').textContent = ui.explode.value + '%'; fill(ui.explode); });
function setTs(ts) { S.ts = ts; segT.forEach((b) => b.classList.toggle('on', +b.dataset.ts === ts)); $('#tsOut').textContent = ts === 0 ? 'frozen' : ts < 1 ? '0.1×' : ts + '×' + (ts > 1 ? ' time-lapse' : ''); }
segT.forEach((b) => b.addEventListener('click', () => setTs(+b.dataset.ts)));
function setSites(n) {
  if (n === S.n) return; S.n = n;
  segN.forEach((b) => b.classList.toggle('on', +b.dataset.n === n)); $('#nOut').textContent = '×' + n;
  stage.setSites(n); resetRun();
}
segN.forEach((b) => b.addEventListener('click', () => setSites(+b.dataset.n)));
ui.tCut.addEventListener('click', () => { S.cut = !S.cut; ui.tCut.classList.toggle('on', S.cut); });
ui.tTrace.addEventListener('click', () => { S.trace = !S.trace; ui.tTrace.classList.toggle('on', S.trace); });
ui.tLabels.addEventListener('click', () => { S.labels = !S.labels; ui.tLabels.classList.toggle('on', S.labels); });
ui.clean.addEventListener('click', () => { sim.sinceClean = 0; toast('✓ 測試座清潔完成', 'Pin tips cleaned — contact resistance is back to normal', 'ok'); });
const voiceEl = new Audio(); voiceEl.preload = 'auto';
function unlockVoice() { voiceEl.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA='; voiceEl.play().catch(() => {}); }
ui.tour.addEventListener('click', () => { if (director.on) director.stop(); else { unlockVoice(); director.start(); } });
function setSlider(inp, v) { inp.value = v; inp.dispatchEvent(new Event('input')); }
function applyState(o) {
  if ('stroke' in o) setSlider(ui.stroke, Math.round(o.stroke * 100));
  if ('warp' in o) setSlider(ui.warp, Math.round(o.warp * 100));
  if ('test' in o) setSlider(ui.test, sliderFromTest(o.test));
  if ('idx' in o) setSlider(ui.idx, sliderFromIdx(o.idx));
  if ('explode' in o) setSlider(ui.explode, o.explode * 100);
  if ('n' in o) setSites(o.n);
  if ('ts' in o) setTs(o.ts);
  if ('cut' in o) { S.cut = o.cut; ui.tCut.classList.toggle('on', S.cut); }
  if ('trace' in o) { S.trace = o.trace; ui.tTrace.classList.toggle('on', S.trace); }
  if ('labels' in o) { S.labels = o.labels; ui.tLabels.classList.toggle('on', S.labels); }
}
$('#panel').addEventListener('pointerdown', (e) => { if (e.isTrusted && director.on && !RECORD && e.target.closest('input,button') && !ui.tour.contains(e.target)) director.stop(); }, true);
let downAt = null;
canvas.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('pointermove', (e) => { if (downAt && director.on && !RECORD && Math.abs(e.clientX - downAt.x) > 12) { downAt = null; director.stop(); } });
window.addEventListener('pointerup', () => { downAt = null; });
canvas.addEventListener('wheel', () => { if (director.on && !RECORD) director.stop(); }, { passive: true });
$('#endcard').addEventListener('click', () => { $('#endcard').style.opacity = 0; $('#endcard').style.pointerEvents = 'none'; });

// 參數依據
const SRC = window.FT_SOURCES;
if (SRC) {
  const cite = (r) => (r.length ? `<span class="c">${r.map((n) => `<a href="#ref-${n}">[${n}]</a>`).join('')}</span>` : '');
  $('#refsBox').innerHTML = `
    <button class="btn x" id="refsClose">✕ 關閉</button>
    <h2>參數依據與參考來源</h2>
    <p>${SRC.intro}</p>
    <h3>成品測試流程 · Process</h3>
    <ol class="steps">${SRC.steps.map((x) => `<li><b>${x.zh}</b>　${x.d} ${cite(x.r)}</li>`).join('')}</ol>
    <h3>可調參數對照 · Parameters</h3>
    <div class="tbl"><table><tr><th>參數</th><th>模擬器用的值</th><th>公開資料的典型範圍</th><th>來源</th></tr>
      ${SRC.params.map((x) => `<tr><td>${x.p}</td><td class="sim">${x.sim}</td><td class="real">${x.real}</td><td>${cite(x.r)}</td></tr>`).join('')}</table></div>
    <h3>沒有模擬的部分</h3>
    <p>${SRC.left} ${cite(SRC.leftRefs || [])}</p>
    <h3>參考文獻 · References</h3>
    <ol>${SRC.refs.map((x, i) => `<li id="ref-${i + 1}"><a href="${x.u}" target="_blank" rel="noopener">${x.t}</a></li>`).join('')}</ol>`;
  const openRefs = (e) => { if (e) e.preventDefault(); $('#refs').classList.add('open'); $('#refs').scrollTop = 0; };
  const closeRefs = () => $('#refs').classList.remove('open');
  $('#refsBtn').addEventListener('click', openRefs);
  $('#foot').addEventListener('click', (e) => { if (e.target.id === 'refsLink') openRefs(e); });
  $('#refsClose').addEventListener('click', closeRefs);
  $('#refs').addEventListener('click', (e) => { if (e.target.id === 'refs') closeRefs(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeRefs(); });
  $('#refsBox').addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#ref-"]');
    if (a) { e.preventDefault(); const li = $(a.getAttribute('href')); li.scrollIntoView({ block: 'center' }); li.style.background = 'rgba(76,201,240,.16)'; setTimeout(() => (li.style.background = ''), 1600); }
  });
} else $('#refsBtn').style.display = 'none';

/* ============================================================
   Director — the guided tour that is also the video script
   ============================================================ */
const CAM = [
  { t: 0.0, p: [23, 13.5, 42], l: [0, 0.6, 0] },
  { t: 5.0, p: [19, 11.5, 36], l: [0, 0.6, 0] },
  { t: 9.8, p: [27, 10, 40], l: [3.4, 1.0, 0] },
  { t: 15.0, p: [31, 7.5, 34], l: [3.4, 0.6, 0] },
  { t: 21.0, p: [27, 1.5, 31], l: [2.6, -1.6, 0] },
  { t: 27.0, p: [16, 5.4, 21], l: [0, 0.6, 0], e: 'in' },
  { t: 30.0, p: [2.2, 1.35, 7.6], l: [-1.7, 0.55, 1.7], e: 'out' },
  { t: 33.0, p: [0.2, 1.05, 5.2], l: [-1.7, 0.5, 1.7] },
  { t: 47.0, p: [0.5, 1.1, 5.4], l: [-1.7, 0.5, 1.7] },
  { t: 51.5, p: [21, 12.5, 39], l: [0, 0.6, 0] },
  { t: 99, p: [19.5, 12, 37], l: [0, 0.6, 0] },
];
const ACTS = [
  { t: 5.6, show: true },
  { t: 6.2, move: ['slider', 'explode'], d: 0.8 },
  { t: 7.1, drag: 'explode', to: 100, d: 2.6 },
  { t: 14.2, move: ['el', '#tTrace'], d: 0.8 },
  { t: 15.1, click: '#tTrace' },
  { t: 24.4, click: '#tTrace' },
  { t: 24.6, move: ['slider', 'explode'], d: 0.7 },
  { t: 25.4, drag: 'explode', to: 0, d: 1.4 },
  { t: 27.2, move: ['el', '#tCut'], d: 0.6 },
  { t: 27.9, click: '#tCut' },
  { t: 30.6, move: ['el', '#segT [data-ts="0.1"]'], d: 0.7 },
  { t: 31.4, click: '#segT [data-ts="0.1"]' },
  { t: 37.2, move: ['el', '#segT [data-ts="0"]'], d: 0.7 },
  { t: 38.0, click: '#segT [data-ts="0"]' },
  { t: 38.3, move: ['slider', 'warp'], d: 0.7 },
  { t: 39.1, drag: 'warp', to: 40, d: 2.2 },
  { t: 42.0, move: ['slider', 'stroke'], d: 0.7 },
  { t: 42.8, drag: 'stroke', to: 72, d: 3.4 },
  { t: 47.0, move: ['el', '#tCut'], d: 0.6 },
  { t: 47.6, click: '#tCut' },
  { t: 47.8, set: { stroke: 0.4, warp: 0.05, ts: 10 } },
  { t: 48.6, move: ['el', '#segN [data-n="8"]'], d: 0.8 },
  { t: 49.5, click: '#segN [data-n="8"]' },
  { t: 55.0, move: ['park'], d: 1.0 },
  { t: 55.8, show: false },
];
const CAPS = [
  { t: 0.3, zh: '封裝好的晶片，出貨前還要再測一次', en: 'Packaged chips get tested once more before they ship' },
  { t: 7.1, zh: '把整個測試介面拆開', en: 'Take the whole test interface apart' },
  { t: 15.1, zh: '追一條訊號：測試頭 → 彈簧針 → 載板 → 測試座 → 錫球', en: 'Follow one signal from the test head up to a solder ball' },
  { t: 27.9, zh: '剖開測試座：每顆錫球底下是一支彈簧針', en: 'Cut a socket open: one spring probe under every ball' },
  { t: 31.4, zh: '時間放慢到 1/10，看彈簧針被壓下去', en: 'Slow time to 1/10 and watch the pins compress' },
  { t: 38.0, zh: '凍結時間，讓封裝翹曲', en: 'Freeze time and warp the package' },
  { t: 40.4, zh: '角落的錫球碰不到探針了（紅色）', en: 'The corner balls no longer reach their pins (red)' },
  { t: 42.8, zh: '加大下壓行程來補償……直到探針壓到底', en: 'Add stroke to compensate… until the pins bottom out' },
  { t: 49.5, zh: '同測顆數加倍，產出卻不會加倍', en: 'Double the sites — the output does not double' },
  { t: 55.4, zh: '', en: '' },
];
const ALIGN = [
  { t0: 30.6, t1: 31.35, ph: 1, u: 0.75 },
  { t0: 34.2, t1: 37.95, ph: 3, u: 0.5 },
];
const END = { t: 56.0, dur: 61.5 };
const NARR = window.FT_NARR || null;
if (NARR) {
  const T = (t) => t + NARR.retime.reduce((s, [a, e]) => s + (t >= a ? e : 0), 0);
  for (const k of CAM) if (k.t < 90) k.t = T(k.t);
  for (const a of ACTS) a.t = T(a.t);
  for (const a of ALIGN) { a.t0 = T(a.t0); a.t1 = T(a.t1); }
  END.t = T(END.t); END.dur = Math.max(T(END.dur), NARR.end);
  CAPS.length = 0;
  for (const l of NARR.lines) if (l.cap) CAPS.push({ t: l.t, d: l.d, zh: l.zh, en: l.en });
}
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
  on: false, t: 0, ai: 0, run: [], cur: { x: 0, y: 0 }, vis: 0, visT: 0, rip: null, press: [], aligns: [], camL: [0, 0, 0], li: 0,
  start() {
    this.on = true; this.t = 0; this.ai = 0; this.run = []; this.press = []; this.rip = null; this.visT = 0; this.vis = 0; this.li = 0;
    this.aligns = ALIGN.map((a) => ({ ...a }));
    applyState({ stroke: 0.4, warp: 0.05, test: 3, idx: 0.6, n: 4, ts: 1, explode: 0, cut: false, trace: false, labels: true });
    exS = 0; cutT = 0; traceT = 0; S.tsCur = 1; sim.flags = {}; sim.sinceClean = 0;
    const r = stageEl.getBoundingClientRect(); this.cur = { x: r.left + r.width * 0.64, y: r.top + r.height * 0.78 };
    controls.enabled = false; ui.tour.textContent = '■ Stop tour 停止導覽';
    $('#endcard').style.opacity = 0; $('#endHint').textContent = RECORD ? '' : 'Click to explore it yourself · 點一下自己玩';
  },
  stop() {
    this.on = false; controls.enabled = true; ui.tour.textContent = '▶ Guided tour 導覽';
    voiceEl.pause();
    controls.target.set(...this.camL); controls.update();
    cursorEl.style.opacity = 0; rippleEl.style.opacity = 0; $('#caption').style.opacity = 0;
    for (const inp of [ui.stroke, ui.warp, ui.test, ui.idx, ui.explode]) inp.classList.remove('grab');
    if (wallT && this.t < END.t) { $('#endcard').style.opacity = 0; $('#endcard').style.pointerEvents = 'none'; }
  },
  update(dt) {
    this.t += dt; const t = this.t;
    while (this.ai < ACTS.length && ACTS[this.ai].t <= t) { this.begin(ACTS[this.ai]); this.ai++; }
    if (NARR && !RECORD) while (this.li < NARR.lines.length && NARR.lines[this.li].t <= t) {
      const l = NARR.lines[this.li++];
      if (t - l.t < 0.5) { voiceEl.src = l.src; voiceEl.play().catch(() => {}); }
    }
    for (let i = this.run.length - 1; i >= 0; i--) {
      const a = this.run[i], u = clamp((t - a.t) / a.d, 0, 1);
      if (a.move) { const e = ease5(u), dx = a.to.x - a.from.x, dy = a.to.y - a.from.y, arc = Math.sin(Math.PI * e) * Math.hypot(dx, dy) * 0.08; this.cur = { x: a.from.x + dx * e, y: a.from.y + dy * e - arc }; }
      else if (a.drag) { const v = lerp(a.from, a.to, ease5(u)), inp = ui[a.drag]; if (Math.round(v) !== +inp.value) setSlider(inp, Math.round(v)); this.cur = thumbXY(inp, v); }
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
    const target = a.move ? (a.move[0] === 'slider' ? ui[a.move[1]] : a.move[0] === 'el' ? $(a.move[1]) : null) : null;
    const P = $('#panel');
    if (target && !RECORD && P.scrollHeight > P.clientHeight + 1 && getComputedStyle(P).overflowY === 'auto') {
      const pr = P.getBoundingClientRect(), tr = target.getBoundingClientRect();
      if (tr.bottom > pr.bottom - 8) P.scrollTop += tr.bottom - pr.bottom + 24; else if (tr.top < pr.top + 8) P.scrollTop -= pr.top - tr.top + 24;
    }
    if (a.move) {
      b.from = { ...this.cur };
      if (a.move[0] === 'slider') b.to = thumbXY(ui[a.move[1]], +ui[a.move[1]].value);
      else if (a.move[0] === 'el') b.to = elXY(a.move[1]);
      else { const r = stageEl.getBoundingClientRect(); b.to = { x: r.left + r.width * 0.72, y: r.top + r.height * 0.7 }; }
    }
    if (a.drag) { b.from = +ui[a.drag].value; ui[a.drag].classList.add('grab'); }
    if (a.click) { const el = $(a.click); el.click(); el.classList.add('press'); this.press.push({ el, t: this.t }); this.rip = { x: this.cur.x, y: this.cur.y, t: this.t }; return; }
    this.run.push(b);
  },
  alignCyc() {                                         // steer the cycle so slow-motion and the freeze land on the right moment
    const t = this.t;
    for (const a of this.aligns) {
      if (t > a.t0 && t <= a.t1 + 1e-6) {
        if (!a.init) {
          a.init = true; a.c0 = sim.cyc; a.s0 = t;
          const E = phaseEdges(S), pT = E[a.ph] + a.u * (E[a.ph + 1] - E[a.ph]);
          const base = sim.cyc + (a.t1 - t) * S.ts / cycleT(S); let best = null;
          for (let k = -1; k <= 1; k++) { const cand = Math.floor(base) + k + pT; if (cand > sim.cyc + 0.02 && (best === null || Math.abs(cand - base) < Math.abs(best - base))) best = cand; }
          a.c1 = best;
        }
        return a.c0 + (a.c1 - a.c0) * clamp((t - a.s0) / (a.t1 - a.s0), 0, 1);
      }
    }
    return null;
  },
  overlay() {
    const t = this.t, vis = this.vis ? ease((t - this.visT) / 0.3) : 1 - ease((t - this.visT) / 0.3);
    cursorEl.style.opacity = this.on ? vis : 0;
    cursorEl.style.transform = `translate(${(this.cur.x - 4).toFixed(1)}px,${(this.cur.y - 2).toFixed(1)}px)`;
    if (this.rip) { const u = (t - this.rip.t) / 0.45; if (u > 1) { rippleEl.style.opacity = 0; this.rip = null; } else { rippleEl.style.opacity = (1 - u) * 0.9; rippleEl.style.transform = `translate(${this.rip.x}px,${this.rip.y}px) scale(${0.4 + u * 0.9})`; } }
    let ci = -1; for (let i = 0; i < CAPS.length; i++) if (CAPS[i].t <= t) ci = i;
    const cap = $('#caption');
    if (ci >= 0) {
      const C = CAPS[ci];
      if (C.zh) { cap.firstChild.textContent = C.zh; cap.lastChild.textContent = C.en; const fin = ease((t - C.t) / 0.25), fout = C.d ? 1 - ease((t - C.t - C.d - 0.5) / 0.3) : 1; cap.style.opacity = Math.min(fin, fout); cap.style.transform = `translateX(-50%) translateY(${(1 - fin) * 8}px)`; }
      else cap.style.opacity = 1 - ease((t - C.t) / 0.35);
    } else cap.style.opacity = 0;
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
function frame(dt, render = true) {
  wallT += dt;
  if (director.on) director.update(dt);
  S.tsCur += (S.ts - S.tsCur) * (1 - Math.exp(-dt * 9));
  if (Math.abs(S.tsCur - S.ts) < 1e-4) S.tsCur = S.ts;
  exS += (S.explode - exS) * (1 - Math.exp(-dt * 12));
  cutT = clamp(cutT + (S.cut ? dt : -dt) / 1.2, 0, 1);
  traceT = clamp(traceT + (S.trace ? dt : -dt) / 0.6, 0, 1);
  labelT = clamp(labelT + (S.labels ? dt : -dt) / 0.3, 0, 1);
  const run = exS > 0.02 ? 0 : S.tsCur;                 // the handler parks while the stack is pulled apart
  const al = director.on ? director.alignCyc() : null;
  simAdvance(al !== null ? al : sim.cyc + dt * run / cycleT(S));
  kinematics();
  if (!render) return;
  if (!director.on) controls.update();
  const v = sim.view;
  v.ex = exS; v.cut = cutT; v.trace = traceT; v.warp = S.warp; v.dirt = clamp(sim.sinceClean / 900, 0, 1); v.hot = 0; v.t = wallT;
  v.trays = { in: sim.inT, pass: sim.passT, fail: sim.failT };
  stage.frame(v);
  const r = stageEl.getBoundingClientRect();
  applyLens(r.width, r.height, dt);
  stage.render();
  updateLabels(r.width, r.height);
  drawScope(); drawChart(); drawUph(); drawBins(); updateDOM(); updateToasts();
  if (director.on || RECORD) director.overlay();
}
resize();
applyState({ stroke: S.stroke, warp: S.warp, test: S.test, idx: S.idx, explode: 0 });
camera.position.set(19, 12.5, 37); controls.target.set(0, 0.2, 0); controls.update();
window.__ft = { S, sim, stage, applyState, director, frame };
if (RECORD) {
  for (let i = 0; i < 8 * 30; i++) frame(1 / 30, false);
  director.start();
  window.__advance = (dt) => { frame(dt); return { t: director.t, done: director.t >= END.dur }; };
  window.__seek = (t) => { while (director.t + 1 / 30 < t) frame(1 / 30, false); frame(1 / 30); return director.t; };
  window.__info = () => ({ dur: END.dur, phase: sim.phase, cyc: sim.cyc });
  const allText = document.body.innerText + CAPS.map((c) => c.zh).join('') + '角落的錫球沒碰到探針下壓行程不夠接觸電阻偏高探針壓到底了針尖沾了錫該清潔測試座清潔完成拆解中機台暫停';
  Promise.all(['400', '500', '700', '900'].map((wt) => document.fonts.load(`${wt} 20px "Noto Sans TC"`, allText))).catch(() => {}).then(() => document.fonts.ready).then(() => { frame(0); window.__ready = true; });
} else {
  let last = performance.now(), failed = false;
  (function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    try { frame(dt); } catch (e) { if (!failed) { failed = true; console.error(e); } }
    requestAnimationFrame(loop);
  })(last);
}
