// MLO Lab — the 3D stage: an MLO space transformer between a probe head and the probe-card PCB.
// Drawing only; the numbers (escape rows, CTE, bow) come from model.js through main.js.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/* ---------- geometry (world units; thickness exaggerated about ten times) ---------- */
export const SW = 12;                                   // substrate width
export const G = 24, PP = 0.2;                          // probe pads per side, their pitch
export const FW = (G - 1) * PP;                         // pad-field width
export const DP = 0.4, DN = 28;                         // drop-via grid
export const BP = 0.8, BN = 14;                         // BGA ball grid
export const TH = { film: 0.1, core: 0.38, cu: 0.012 };
export const EXG = 0.55;                                // explode gap per layer pair
export const CUT_K = 2;                                 // the cut runs through this pad row from the front edge

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
function hash(i) { let x = Math.imul(i ^ 0x9e3779b9, 2654435761) >>> 0; x ^= x >>> 16; x = Math.imul(x, 0x45d9f3b) >>> 0; x ^= x >>> 16; return (x >>> 0) / 4294967296; }
class Poly extends THREE.Curve {
  constructor(pts) { super(); this.pts = pts; this.len = [0]; for (let i = 1; i < pts.length; i++) this.len.push(this.len[i - 1] + pts[i].distanceTo(pts[i - 1])); }
  getPoint(t, out = new THREE.Vector3()) {
    const L = this.len, d = clamp(t, 0, 1) * L[L.length - 1]; let i = 1; while (i < L.length - 1 && L[i] < d) i++;
    const seg = L[i] - L[i - 1]; return out.lerpVectors(this.pts[i - 1], this.pts[i], seg > 1e-9 ? (d - L[i - 1]) / seg : 0);
  }
}
export const padXY = (i) => (i - (G - 1) / 2) * PP;
export const CUT_Z = padXY(G - 1 - CUT_K);

/** Which pads are signals, and which layer each signal escapes on. */
export function plan(perLayer, nSig) {
  const pads = [];
  for (let k = 0; k < G; k++) for (let i = 0; i < G; i++) {
    const r = Math.min(i, k, G - 1 - i, G - 1 - k), id = k * G + i, sig = hash(id * 7 + 3) < 0.34;
    const s = Math.floor(r / perLayer);
    pads.push({ i, k, x: padXY(i), z: padXY(k), r, sig, pwr: hash(id * 11 + 5) < 0.5, s, ok: !sig || s < nSig });
  }
  // drop vias: a coarser grid around the pad field, shared out between the signal layers ring by ring
  const drops = [];
  for (let k = 0; k < DN; k++) for (let i = 0; i < DN; i++) {
    const x = (i - (DN - 1) / 2) * DP, z = (k - (DN - 1) / 2) * DP, c = Math.max(Math.abs(x), Math.abs(z));
    if (c < FW / 2 + 0.45 || c > SW / 2 - 0.45) continue;
    drops.push({ x, z, q: Math.round((c - FW / 2 - 0.45) / DP), used: false });
  }
  const side = (x, z) => (Math.abs(x) >= Math.abs(z) ? (x > 0 ? 0 : 2) : z > 0 ? 1 : 3);
  const nrm = [[1, 0], [0, 1], [-1, 0], [0, -1]], tng = [[0, 1], [-1, 0], [0, -1], [1, 0]];
  const routes = [];
  for (let s = 0; s < nSig; s++) for (let d = 0; d < 4; d++) {
    const P = pads.filter((p) => p.sig && p.ok && p.s === s && side(p.x + 1e-4 * p.z, p.z) === d);
    const D = drops.filter((q) => !q.used && q.q % nSig === s && side(q.x + 1e-4 * q.z, q.z) === d);
    const tb = (o) => o.x * tng[d][0] + o.z * tng[d][1], ab = (o) => o.x * nrm[d][0] + o.z * nrm[d][1];
    P.sort((a, b) => tb(a) - tb(b) || ab(b) - ab(a)); D.sort((a, b) => tb(a) - tb(b) || ab(a) - ab(b));
    P.forEach((p, n) => {
      const q = D[Math.min(D.length - 1, Math.floor((n + 0.5) * D.length / Math.max(1, P.length)))]; if (!q || q.used) return; q.used = true;
      const a0 = ab(p), b0 = tb(p), A = ab(q), B = tb(q), a1 = FW / 2 + 0.12 + 0.03 * (p.r % 4);
      const pts = [[a0, b0], [a1, b0]]; const da = Math.abs(B - b0);
      if (a1 + da < A) pts.push([a1 + da, B]); pts.push([A, B]);
      routes.push({ s, pad: p, drop: q, pts: pts.map(([a, b]) => [a * nrm[d][0] + b * tng[d][0], a * nrm[d][1] + b * tng[d][1]]) });
      p.route = routes[routes.length - 1];
    });
  }
  // each used drop lands on the nearest free BGA ball on the bottom side
  const balls = []; for (let k = 0; k < BN; k++) for (let i = 0; i < BN; i++) balls.push({ x: (i - (BN - 1) / 2) * BP, z: (k - (BN - 1) / 2) * BP, n: 0 });
  for (const r of routes) { let best = null, bd = 1e9; for (const b of balls) { const dd = Math.hypot(b.x - r.drop.x, b.z - r.drop.z) + b.n * 0.5; if (dd < bd) { bd = dd; best = b; } } best.n++; r.ball = best; }
  return { pads, drops, routes, balls };
}

export function createStage(canvas, { record = false, dpr = 1 } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: record, powerPreference: 'high-performance' });
  renderer.setPixelRatio(record ? dpr : Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x05070b, 60, 140);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  const camera = new THREE.PerspectiveCamera(34, 1, 0.02, 300);
  camera.position.set(14, 10, 20);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.3, 0); controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 1.2; controls.maxDistance = 70; controls.maxPolarAngle = Math.PI * 0.62;
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x10141c, 0.6));
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(10, 18, 14); scene.add(key);
  const rim = new THREE.DirectionalLight(0x4cc9f0, 0.8); rim.position.set(-9, 16, -12); scene.add(rim);
  const under = new THREE.DirectionalLight(0xa8bdd8, 0.8); under.position.set(6, -6, 9); scene.add(under);
  const heatLight = new THREE.PointLight(0xff7a2f, 0, 26, 1.4); heatLight.position.set(0, -1.6, 4); scene.add(heatLight);

  const clip = new THREE.Plane(new THREE.Vector3(0, 0, -1), 100);
  const CLIP = [clip];
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true }); if (draw) draw(g, w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.userData = { c, g }; return t;
  }
  const glowTex = canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, 'rgba(255,255,255,.85)'); gr.addColorStop(0.5, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });

  /* ---------- floor ---------- */
  {
    const tex = canvasTex(1024, 1024, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, '#111a26'); gr.addColorStop(0.55, '#0a0f17'); gr.addColorStop(1, '#05070b');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
      g.strokeStyle = 'rgba(120,160,200,.07)'; g.lineWidth = 1;
      for (let i = 0; i <= w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, w); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
      const vg = g.createRadialGradient(w / 2, w / 2, w * 0.25, w / 2, w / 2, w / 2);
      vg.addColorStop(0, 'rgba(5,7,11,0)'); vg.addColorStop(1, 'rgba(5,7,11,1)'); g.fillStyle = vg; g.fillRect(0, 0, w, w);
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex }));
    floor.position.y = -6.5; scene.add(floor);
  }

  /* ---------- the bow: every MLO material bends by the same parabola ---------- */
  const U = { uBow: { value: 0 }, uR2: { value: (SW / 2) * (SW / 2) * 2 }, uHot: { value: 0 } };
  function bend(m, key) {
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uBow; uniform float uR2;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          { vec4 wp = vec4(transformed, 1.0); float sy = 1.0;
            #ifdef USE_INSTANCING
              wp = instanceMatrix * wp; sy = max(1e-4, length(instanceMatrix[1].xyz));   // scaled instances (vias) need the shift in their own units
            #endif
            wp = modelMatrix * wp;
            transformed.y += uBow * (1.0 - dot(wp.xz, wp.xz) / uR2) / sy; }`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uHot;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.36, 0.08) * uHot * 0.26;');
    };
    m.customProgramCacheKey = () => 'bend-' + key;
    return m;
  }
  let matN = 0;
  const std = (o) => bend(new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.1, clippingPlanes: CLIP, ...o }), 'm' + matN++);

  /* ---------- groups ---------- */
  const mloG = new THREE.Group(); scene.add(mloG);
  const headG = new THREE.Group(), pcbG = new THREE.Group(); scene.add(headG, pcbG);
  const traceG = new THREE.Group(); scene.add(traceG);
  let layers = [], caps = [], P = null, plan_ = null, vias = null, viaMeta = [], balls = null, needles = null, stackY = null;

  const filmTex = canvasTex(512, 512, (g, w) => {
    g.fillStyle = '#5c5a2e'; g.fillRect(0, 0, w, w);
    const img = g.getImageData(0, 0, w, w), d = img.data; for (let i = 0; i < d.length; i += 4) { const n = (hash(i) - 0.5) * 10; d[i] += n; d[i + 1] += n; d[i + 2] += n; } g.putImageData(img, 0, 0);
  });
  const coreTex = canvasTex(512, 512, (g, w) => {
    g.fillStyle = '#3c4a2c'; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(210,200,150,.18)'; g.lineWidth = 6;
    for (let i = 0; i < w; i += 24) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, w); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }  // glass weave
  });
  filmTex.wrapS = filmTex.wrapT = coreTex.wrapS = coreTex.wrapT = THREE.RepeatWrapping; coreTex.repeat.set(6, 6);

  /* ---------- copper artwork for one layer ---------- */
  const CW = 2048, k2p = (v) => (v / SW + 0.5) * CW;
  function drawCopper(g, L) {
    g.clearRect(0, 0, CW, CW);
    const cu = '#d29a55', viaR = 0.05 * CW / SW, padR = PP * 0.32 * CW / SW, w = Math.max(2, 0.028 * CW / SW);
    const { pads, routes } = plan_;
    if (L.plane) {                                                             // a plane: solid copper with clearance holes
      g.fillStyle = cu; g.globalAlpha = 0.92; g.fillRect(k2p(-SW / 2 + 0.15), k2p(-SW / 2 + 0.15), (SW - 0.3) * CW / SW, (SW - 0.3) * CW / SW); g.globalAlpha = 1;
      g.globalCompositeOperation = 'destination-out';
      for (const r of routes) { g.beginPath(); g.arc(k2p(r.drop.x), k2p(r.drop.z), viaR * 1.9, 0, 7); g.fill(); if (L.side > 0 && L.j < 2 * r.s) { g.beginPath(); g.arc(k2p(r.pad.x), k2p(r.pad.z), viaR * 1.9, 0, 7); g.fill(); } }
      for (const p of pads) if (!p.sig && p.pwr !== L.pwr) { g.beginPath(); g.arc(k2p(p.x), k2p(p.z), viaR * 1.7, 0, 7); g.fill(); }
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#e6b06a'; for (const p of pads) if (!p.sig && p.pwr === L.pwr) { g.beginPath(); g.arc(k2p(p.x), k2p(p.z), viaR, 0, 7); g.fill(); }
      return;
    }
    g.strokeStyle = cu; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round';
    for (const r of routes) {
      if (L.side > 0 && r.s * 2 === L.j) { g.beginPath(); r.pts.forEach(([x, z], i) => (i ? g.lineTo(k2p(x), k2p(z)) : g.moveTo(k2p(x), k2p(z)))); g.stroke(); }
      if (L.side < 0 && L.j === 0) { g.beginPath(); g.moveTo(k2p(r.drop.x), k2p(r.drop.z)); g.lineTo(k2p(r.ball.x), k2p(r.ball.z)); g.stroke(); }
    }
    g.fillStyle = cu;
    for (const r of routes) { g.beginPath(); g.arc(k2p(r.drop.x), k2p(r.drop.z), viaR * 1.15, 0, 7); g.fill(); if (L.side > 0 && L.j <= 2 * r.s) { g.beginPath(); g.arc(k2p(r.pad.x), k2p(r.pad.z), viaR * 1.15, 0, 7); g.fill(); } }
    if (L.side > 0 && L.j === 0) {                                             // the probe side: every pad, gold finish
      for (const p of pads) { g.fillStyle = !p.ok ? '#ff5d5d' : p.sig ? '#f4d27a' : '#e9c46a'; g.fillRect(k2p(p.x) - padR, k2p(p.z) - padR, padR * 2, padR * 2); }
    }
    if (L.side < 0 && L.j === 0) for (const b of plan_.balls) { g.fillStyle = '#e7c27a'; g.beginPath(); g.arc(k2p(b.x), k2p(b.z), BP * 0.3 * CW / SW, 0, 7); g.fill(); }
  }

  /* ---------- build the whole substrate for a parameter set ---------- */
  function build(params) {
    P = params;
    for (const c of [...mloG.children]) { mloG.remove(c); c.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    layers = []; caps = [];
    const nSig = Math.ceil(P.nTop / 2);
    plan_ = plan(P.perLayer, nSig);
    // y positions from the bottom: bottom build-up (outermost first), core, top build-up
    const order = [];
    for (let j = 0; j < P.nBot; j++) order.push({ side: -1, j });              // j counts from the outer surface inward
    order.push({ side: 0, j: 0 });
    for (let j = P.nTop - 1; j >= 0; j--) order.push({ side: 1, j });
    let y = 0; const ys = [];
    order.forEach((o, n) => { const t = o.side === 0 ? TH.core : TH.film; ys.push({ ...o, y0: y, y1: y + t, n }); y += t; });
    const total = y;                                                          // centre the stack on y = 0
    ys.forEach((o) => { o.y0 += -total / 2; o.y1 += -total / 2; });
    stackY = { bottom: -total / 2, top: total / 2, core: ys.find((o) => o.side === 0) };
    const coreIdx = P.nBot;
    for (const o of ys) {
      const grp = new THREE.Group(); grp.userData = o; mloG.add(grp);
      const t = o.y1 - o.y0, isCore = o.side === 0;
      const dm = std(isCore ? { map: coreTex, color: 0xffffff, roughness: 0.7 } : { map: filmTex, color: 0xffffff, roughness: 0.6, transparent: true, opacity: 0.96 });
      const slab = new THREE.Mesh(new THREE.BoxGeometry(SW, t, SW, 32, 1, 32), dm);                 // subdivided so it can bow slab.position.y = (o.y0 + o.y1) / 2; grp.add(slab);
      const L = { side: o.side, j: o.j, plane: !isCore && o.j % 2 === 1, pwr: (o.j + (o.side < 0 ? 1 : 0)) % 4 === 1 };
      if (isCore) L.plane = true;
      const cuTex = canvasTex(CW, CW, (g) => drawCopper(g, L));
      const cm = std({ map: cuTex, transparent: true, alphaTest: 0.35, metalness: 0.85, roughness: 0.32, color: 0xffffff, side: THREE.DoubleSide });
      const cuY = o.side < 0 ? o.y0 : o.y1;                                    // copper sits on the outer face of each film
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(SW, SW, 32, 32).rotateX(-Math.PI / 2), cm); plane.position.y = cuY + (o.side < 0 ? -0.002 : 0.002); grp.add(plane);
      if (isCore) { const p2 = plane.clone(); p2.position.y = o.y0 - 0.002; grp.add(p2); }
      grp.userData.cu = cuTex; grp.userData.L = L; grp.userData.slab = slab;
      layers.push(grp);
    }
    buildVias(ys); buildBalls(); buildCaps(ys); buildHead(); buildPcb(); buildTrace(ys);
  }
  /* ---------- microvias and plated through holes ---------- */
  const viaMat = std({ color: 0xd9a35a, metalness: 1, roughness: 0.3 }), pthMat = std({ color: 0xc78f4c, metalness: 1, roughness: 0.35 });
  function buildVias(ys) {
    const segs = [], pth = [];
    const film = (side, j) => ys.find((o) => o.side === side && o.j === j);
    const core = ys.find((o) => o.side === 0);
    for (const r of plan_.routes) {
      for (let j = 0; j < 2 * r.s; j++) { const o = film(1, j); if (o) segs.push([r.pad.x, r.pad.z, o, 1]); }      // stacked microvias under the pad
      for (let j = 2 * r.s; j < P.nTop; j++) { const o = film(1, j); if (o) segs.push([r.drop.x, r.drop.z, o, 1]); }  // and down from the drop to the core
      pth.push([r.drop.x, r.drop.z]);
      for (let j = 0; j < P.nBot; j++) { const o = film(-1, j); if (o) segs.push([r.drop.x, r.drop.z, o, -1]); }
    }
    for (const p of plan_.pads) if (!p.sig) for (let j = 0; j < Math.min(2, P.nTop); j++) { const o = film(1, j); if (o) segs.push([p.x, p.z, o, 1]); }
    const geo = new THREE.CylinderGeometry(0.045, 0.028, 1, 10), m4 = new THREE.Matrix4();
    vias = new THREE.InstancedMesh(geo, viaMat, segs.length); viaMeta = segs;
    segs.forEach(([x, z, o], i) => { m4.makeScale(1, o.y1 - o.y0, 1).setPosition(x, (o.y0 + o.y1) / 2, z); vias.setMatrixAt(i, m4); });
    vias.frustumCulled = false; mloG.add(vias);
    const pg = new THREE.CylinderGeometry(0.06, 0.06, core.y1 - core.y0, 12), pm = new THREE.InstancedMesh(pg, pthMat, pth.length);
    pth.forEach(([x, z], i) => { m4.makeTranslation(x, (core.y0 + core.y1) / 2, z); pm.setMatrixAt(i, m4); }); pm.frustumCulled = false; mloG.add(pm);
    pm.userData.core = true; vias.userData.vias = true;
  }
  const ballMat = std({ color: 0xd5dae0, metalness: 1, roughness: 0.25 });
  function buildBalls() {
    const geo = new THREE.SphereGeometry(BP * 0.32, 16, 10), m4 = new THREE.Matrix4();
    balls = new THREE.InstancedMesh(geo, ballMat, plan_.balls.length);
    plan_.balls.forEach((b, i) => { m4.makeTranslation(b.x, stackY.bottom - BP * 0.22, b.z); balls.setMatrixAt(i, m4); });
    balls.frustumCulled = false; mloG.add(balls);
  }
  /* ---------- the cut face: copper read back from each layer's artwork along the cut line ---------- */
  function buildCaps(ys) {
    const row = Math.round(k2p(CUT_Z));
    for (const grp of layers) {
      const o = grp.userData, t = o.y1 - o.y0, tex = canvasTex(1024, 48, (g, w, h) => {
        g.fillStyle = o.side === 0 ? '#4a5a33' : '#6b6633'; g.fillRect(0, 0, w, h);
        if (o.side === 0) { g.fillStyle = 'rgba(220,210,160,.35)'; for (let x = 0; x < w; x += 10) g.fillRect(x, 8, 5, h - 16); }
        const src = grp.userData.cu.userData.g.getImageData(0, row, CW, 1).data, cuH = o.side === 0 ? 7 : 9;
        g.fillStyle = '#e0a45d';
        for (let x = 0; x < w; x++) { const a = src[(Math.floor(x * CW / w)) * 4 + 3]; if (a > 120) { if (o.side >= 0) g.fillRect(x, 0, 1, cuH); if (o.side <= 0) g.fillRect(x, h - cuH, 1, cuH); } }
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(SW, t, 48, 1), bend(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.2 }), 'cap'));
      m.position.set(0, (o.y0 + o.y1) / 2, CUT_Z); m.visible = false; m.renderOrder = 2; grp.add(m); caps.push(m);
    }
    // vias that the cut passes through, drawn on the cut face as solid copper columns
    const onCut = viaMeta.filter(([x, z]) => Math.abs(z - CUT_Z) < 0.03);
    if (onCut.length) {
      const g = new THREE.PlaneGeometry(0.08, 1), m4 = new THREE.Matrix4(), im = new THREE.InstancedMesh(g, bend(new THREE.MeshStandardMaterial({ color: 0xe8ad62, metalness: 0.6, roughness: 0.4 }), 'capvia'), onCut.length);
      onCut.forEach(([x, , o], i) => { m4.makeScale(1, o.y1 - o.y0, 1).setPosition(x, (o.y0 + o.y1) / 2, CUT_Z + 0.004); im.setMatrixAt(i, m4); });
      im.visible = false; im.renderOrder = 3; im.userData.capVias = onCut; mloG.add(im); caps.push(im);
    }
  }
  /* ---------- mating parts: probe head above, PCB below ---------- */
  const ghost = (c, o = 0.5) => new THREE.MeshStandardMaterial({ color: c, transparent: true, opacity: o, roughness: 0.6, metalness: 0.2, depthWrite: false });
  function buildHead() {
    headG.clear();
    const hw = FW + 0.9, body = new THREE.Mesh(new THREE.BoxGeometry(hw, 1.1, hw), ghost(0x2b3240, 0.32)); body.position.y = 0.95; headG.add(body);
    const plate = new THREE.Mesh(new THREE.BoxGeometry(hw, 0.08, hw), ghost(0x4a515c, 0.7)); plate.position.y = 0.32; headG.add(plate);
    const pos = [], rn = [], rmax = FW / 2 * Math.SQRT2;
    for (const p of plan_.pads) { pos.push(p.x, 0.0, p.z, p.x, 1.5, p.z); rn.push(Math.hypot(p.x, p.z) / rmax); }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); lg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length), 3));
    needles = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6 })); needles.userData.rn = rn; needles.userData.key = -1; headG.add(needles);
  }
  function buildPcb() {
    pcbG.clear();
    const tex = canvasTex(1024, 1024, (g, w) => {
      g.fillStyle = '#0f4a35'; g.fillRect(0, 0, w, w);
      g.fillStyle = '#d9b860'; for (const b of plan_.balls) { g.beginPath(); g.arc((b.x / 16 + 0.5) * w, (b.z / 16 + 0.5) * w, BP * 0.3 / 16 * w, 0, 7); g.fill(); }
      g.strokeStyle = 'rgba(200,230,200,.18)'; g.lineWidth = 2; for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * w * 0.33, w / 2 + Math.sin(a) * w * 0.33); g.lineTo(w / 2 + Math.cos(a) * w * 0.5, w / 2 + Math.sin(a) * w * 0.5); g.stroke(); }
    });
    const side = new THREE.MeshStandardMaterial({ color: 0x0c3b2a, roughness: 0.6 });
    const pcb = new THREE.Mesh(new THREE.BoxGeometry(16, 0.7, 16), [side, side, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.15 }), side, side, side]);
    pcb.position.y = -0.35; pcbG.add(pcb);
  }
  /* ---------- one signal traced from a probe to its ball ---------- */
  let trace = null, pulse = null, tCurve = null;
  function buildTrace(ys) {
    traceG.clear();
    const r = plan_.routes.filter((q) => q.s === Math.min(1, Math.ceil(P.nTop / 2) - 1)).sort((a, b) => Math.abs(a.pad.z - CUT_Z) - Math.abs(b.pad.z - CUT_Z))[0] || plan_.routes[0];
    if (!r) return;
    const film = (side, j) => ys.find((o) => o.side === side && o.j === j), top = film(1, 0), lay = film(1, 2 * r.s), core = ys.find((o) => o.side === 0), bot = film(-1, 0);
    tCurve = { r, pts: [[r.pad.x, top.y1 + 2.2, r.pad.z, 'head'], [r.pad.x, top.y1, r.pad.z, 'mlo'], [r.pad.x, lay.y1, r.pad.z, 'mlo'], ...r.pts.slice(1).map(([x, z]) => [x, lay.y1, z, 'mlo']), [r.drop.x, core.y1, r.drop.z, 'mlo'], [r.drop.x, core.y0, r.drop.z, 'mlo'], [r.drop.x, bot.y0, r.drop.z, 'mlo'], [r.ball.x, bot.y0, r.ball.z, 'mlo'], [r.ball.x, bot.y0 - BP * 0.5, r.ball.z, 'pcb']] };
    trace = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, depthTest: false, toneMapped: false }));
    trace.renderOrder = 6; traceG.add(trace);
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18), 3)); pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(18), 3));
    pulse = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.38, map: glowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    pulse.renderOrder = 7; pulse.frustumCulled = false; traceG.add(pulse); trace.userData.key = '';
  }

  /* ---------- laser sparks during the build ---------- */
  const SPN = 600, spPos = new Float32Array(SPN * 3), spCol = new Float32Array(SPN * 3), spVel = new Float32Array(SPN * 3), spLife = new Float32Array(SPN);
  const spGeo = new THREE.BufferGeometry(); spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3)); spGeo.setAttribute('color', new THREE.BufferAttribute(spCol, 3));
  const sparks = new THREE.Points(spGeo, new THREE.PointsMaterial({ size: 0.16, map: glowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); sparks.frustumCulled = false; scene.add(sparks);
  let spNext = 0;
  function spark(x, y, z, n) { for (let k = 0; k < n; k++) { const i = spNext++ % SPN; spPos.set([x, y, z], i * 3); spVel.set([(Math.random() - 0.5) * 1.2, Math.random() * 1.6, (Math.random() - 0.5) * 1.2], i * 3); spLife[i] = 0.35 + Math.random() * 0.3; } }
  const beamGeo = new THREE.BufferGeometry(); beamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 40), 3));
  const beams = new THREE.LineSegments(beamGeo, new THREE.LineBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })); beams.frustumCulled = false; scene.add(beams);

  /* ---------- per frame ---------- */
  const m4 = new THREE.Matrix4();
  let lastLaser = 0;
  function frame(v, dt) {
    if (!P) return;
    const ex = v.ex, nL = layers.length, coreN = P.nBot;
    // explode: every layer pair moves away from the core
    layers.forEach((grp, n) => { const d = n - coreN; grp.position.y = ex * EXG * d; });
    vias.visible = balls.visible = ex < 0.04 || v.build.on;
    mloG.children.forEach((c) => { if (c.isInstancedMesh && c !== vias && c !== balls && !c.userData.capVias) c.visible = ex < 0.04 || v.build.on; });
    balls.position.y = -ex * EXG * (P.nBot + 0.6);
    headG.position.y = stackY.top + 0.02 + ex * EXG * (P.nTop + 2.2) + v.headLift;
    pcbG.position.y = stackY.bottom - BP * 0.5 + 0.05 - ex * EXG * (P.nBot + 2.6);
    headG.visible = v.head > 0.02; pcbG.visible = v.head > 0.02;
    headG.children.forEach((c) => { if (c.material) c.material.opacity = (c.isLineSegments ? 0.75 : c.material.userData.o ?? (c.material.userData.o = c.material.opacity)) * v.head; });
    pcbG.children.forEach((c) => { (Array.isArray(c.material) ? c.material : [c.material]).forEach((m) => { m.transparent = true; m.opacity = v.head; }); });
    // bow and heat; probes that no longer land on their pads turn red (the offset grows with distance from the centre)
    U.uBow.value = v.bow; U.uHot.value = v.hot; heatLight.intensity = v.hot * 10;
    if (needles && Math.abs(needles.userData.key - v.offFrac) > 0.005) {
      needles.userData.key = v.offFrac; const c = needles.geometry.attributes.color.array, rn = needles.userData.rn;
      for (let i = 0; i < rn.length; i++) { const bad = v.offFrac * rn[i] > 1; for (let e = 0; e < 2; e++) c.set(bad ? [1.0, 0.36, 0.36] : [0.75, 0.91, 0.87], (i * 2 + e) * 3); }
      needles.geometry.attributes.color.needsUpdate = true;
    }
    // cut-away
    clip.constant = v.cut < 0.002 ? 100 : lerp(SW / 2 + 1, CUT_Z, ease(v.cut));
    const capOn = v.cut > 0.985; for (const c of caps) c.visible = capOn;
    // build animation: hide layers not made yet, play the current step on the outermost one
    const B = v.build;
    layers.forEach((grp) => {
      const o = grp.userData, fromCore = o.side === 0 ? 0 : P[o.side > 0 ? 'nTop' : 'nBot'] - o.j;     // 1 = first layer next to the core
      let show = 1, cu = 1, drop = 0;
      if (B.on) {
        if (fromCore > B.layer) show = 0;
        else if (fromCore === B.layer && o.side !== 0) {
          drop = B.step === 0 ? 1 - ease(B.u) : 0;                                              // laminate: the film comes down
          cu = B.step < 5 ? 0 : B.step === 5 ? ease(B.u) : 1;                                    // copper appears with the plating
        }
      }
      grp.visible = show > 0;
      grp.position.y += drop * 1.6 * Math.sign(o.side || 1);
      grp.children.forEach((c) => { if (c.material && c.material.map === grp.userData.cu) { c.visible = cu > 0.01; c.material.opacity = cu; } });
    });
    if (B.on) {                                                                                     // vias appear once their layer is plated
      vias.count = viaMeta.length;
      viaMeta.forEach(([x, z, o, side], i) => {
        const fromCore = P[side > 0 ? 'nTop' : 'nBot'] - o.j, ok = fromCore < B.layer || (fromCore === B.layer && B.step >= 5);
        m4.makeScale(ok ? 1 : 0.0001, ok ? o.y1 - o.y0 : 0.0001, ok ? 1 : 0.0001).setPosition(x, (o.y0 + o.y1) / 2, z); vias.setMatrixAt(i, m4);
      });
      vias.instanceMatrix.needsUpdate = true; vias.userData.dirty = true;
      balls.visible = B.layer > Math.max(P.nTop, P.nBot);
      // laser: red beams onto this layer's via spots
      const pos = beamGeo.attributes.position.array; let n = 0;
      if (B.step === 1 && B.layer >= 1) {
        const pts = viaMeta.filter(([, , o, side]) => P[side > 0 ? 'nTop' : 'nBot'] - o.j === B.layer);
        const k = Math.floor(B.u * pts.length);
        for (let q = Math.max(0, k - 20); q < Math.min(pts.length, k + 1) && n < 40; q++) {
          const [x, z, o, side] = pts[q], yy = side > 0 ? o.y1 : o.y0;
          pos.set([x, yy + side * 6, z, x, yy, z], n * 6); n++;
          if (v.t - lastLaser > 0.016) spark(x, yy, z, 2);
        }
        lastLaser = v.t;
      }
      for (let q = n; q < 40; q++) pos.fill(0, q * 6, q * 6 + 6);
      beamGeo.attributes.position.needsUpdate = true; beams.visible = n > 0;
    } else if (vias.userData.dirty) {
      viaMeta.forEach(([x, z, o], i) => { m4.makeScale(1, o.y1 - o.y0, 1).setPosition(x, (o.y0 + o.y1) / 2, z); vias.setMatrixAt(i, m4); });
      vias.instanceMatrix.needsUpdate = true; vias.userData.dirty = false; beams.visible = false;
    } else beams.visible = false;
    // sparks
    for (let i = 0; i < SPN; i++) {
      if (spLife[i] > 0) { spLife[i] -= dt; spVel[i * 3 + 1] -= 4 * dt; for (let a = 0; a < 3; a++) spPos[i * 3 + a] += spVel[i * 3 + a] * dt; const l = Math.max(0, spLife[i]) * 2.4; spCol[i * 3] = 1.6 * l; spCol[i * 3 + 1] = 0.5 * l; spCol[i * 3 + 2] = 0.3 * l; }
      else { spCol[i * 3] = spCol[i * 3 + 1] = spCol[i * 3 + 2] = 0; }
    }
    spGeo.attributes.position.needsUpdate = true; spGeo.attributes.color.needsUpdate = true;
    // signal trace
    traceG.visible = v.trace > 0.01 && !!tCurve;
    if (traceG.visible) {
      const dy = { head: headG.position.y - stackY.top - 0.02, mlo: 0, pcb: pcbG.position.y - (stackY.bottom - BP * 0.5 + 0.05) };
      const layerDy = (p, i) => { if (p[3] !== 'mlo') return dy[p[3]]; return 0; };
      const pts = tCurve.pts.map((p, i) => new THREE.Vector3(p[0], p[1] + layerDy(p, i), p[2]));
      // follow the explode: points on a layer move with that layer
      const film = (yy) => layers.find((g) => { const o = g.userData; return yy >= o.y0 - 1e-4 && yy <= o.y1 + 1e-4; });
      pts.forEach((pt, i) => { if (tCurve.pts[i][3] === 'mlo') { const g = film(tCurve.pts[i][1]); if (g) pt.y += g.position.y; } });
      const key = pts.map((p) => p.y.toFixed(3)).join();
      if (key !== trace.userData.key) { trace.userData.key = key; trace.geometry.dispose(); tCurve.curve = new Poly(pts); trace.geometry = new THREE.TubeGeometry(tCurve.curve, 200, 0.035, 6, false); }
      trace.material.opacity = v.trace;
      const pp = pulse.geometry.attributes.position.array, pc = pulse.geometry.attributes.color.array;
      for (let k = 0; k < 6; k++) { const u = (v.t * 0.22 + k / 6) % 1, p = tCurve.curve.getPoint(u); pp.set([p.x, p.y, p.z], k * 3); const a = v.trace * Math.sin(Math.PI * u) * 1.5; pc.set([0.3 * a, 0.8 * a, a], k * 3); }
      pulse.geometry.attributes.position.needsUpdate = true; pulse.geometry.attributes.color.needsUpdate = true;
    }
  }
  function resize(w, h) { renderer.setSize(w, h, false); }
  return { renderer, scene, camera, controls, build, frame, resize, render: () => renderer.render(scene, camera), get plan() { return plan_; }, get stackY() { return stackY; }, layers: () => layers };
}
