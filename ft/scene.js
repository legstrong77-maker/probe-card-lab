// Final Test Board Lab — the 3D stage: test head, spring-pin blocks, load board, sockets, devices, handler arm, trays.
// Everything here is drawing; the numbers (travel, force, timing) come from model.js through main.js.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ---------- shared geometry constants (world units; roughly 1 unit = 10 mm, pin travel exaggerated) ---------- */
export const MMW = 0.22;                         // world units per mm of spring-pin travel
export const PITCH = 3.4;                        // socket pitch on the board
export const PIN_N = 10, PIN_P = 0.15;           // balls per side and ball pitch on the drawn package
export const Y = { pcbH: 0.5, cart: 0.46, tip: 0.56, frame: 0.95, devH: 0.285, carry: 2.3, trayDev: 0.37 };
export const EX = { head: 5.0, dev: 3.3, sock: 1.7, stiff: -1.3, pogo: -2.6, th: -3.7 };
export const PCB = { w: 17, d: 12 }, THEAD = { w: 19, h: 2.6, d: 14, top: -1.7 };
export const POGO_Z = 4.6, POGO_X = [-6, -3, 0, 3, 6];
export function sitePos(n) {
  if (n === 1) return [[0, 0]];
  if (n === 2) return [[-PITCH / 2, 0], [PITCH / 2, 0]];
  const xs = n === 4 ? [-PITCH / 2, PITCH / 2] : [-1.5 * PITCH, -PITCH / 2, PITCH / 2, 1.5 * PITCH], out = [];
  for (const z of [-PITCH / 2, PITCH / 2]) for (const x of xs) out.push([x, z]);
  return out;
}
export const cutZ = (n) => (n >= 4 ? PITCH / 2 : 0);
const TP = 1.85;                                   // tray pocket pitch
function pockets(cx, cz, nx, nz) { const out = []; for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) out.push([cx + (i - (nx - 1) / 2) * TP, cz + (j - (nz - 1) / 2) * TP]); return out; }
export const TRAYS = {
  in: { x: -10.4, z: 0, nx: 3, nz: 6, p: pockets(-10.4, 0, 3, 6) },
  pass: { x: 10.4, z: -1.85, nx: 3, nz: 4, p: pockets(10.4, -1.85, 3, 4) },
  fail: { x: 10.4, z: 3.7, nx: 3, nz: 2, p: pockets(10.4, 3.7, 3, 2) },
};

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
class Poly extends THREE.Curve {                      // a polyline sampled by arc length (CurvePath returns null at its ends)
  constructor(pts) { super(); this.pts = pts; this.len = [0]; for (let i = 1; i < pts.length; i++) this.len.push(this.len[i - 1] + pts[i].distanceTo(pts[i - 1])); }
  getPoint(t, out = new THREE.Vector3()) {
    const L = this.len, d = clamp(t, 0, 1) * L[L.length - 1]; let i = 1; while (i < L.length - 1 && L[i] < d) i++;
    const seg = L[i] - L[i - 1]; return out.lerpVectors(this.pts[i - 1], this.pts[i], seg > 1e-9 ? (d - L[i - 1]) / seg : 0);
  }
}
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

export function createStage(canvas, { record = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: record, powerPreference: 'high-performance' });
  renderer.setPixelRatio(record ? 1 : Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x05070b, 60, 140);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.6;
  const camera = new THREE.PerspectiveCamera(34, 1, 0.02, 300);
  camera.position.set(17, 11, 30);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 0.6, 0); controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 1.4; controls.maxDistance = 80; controls.maxPolarAngle = Math.PI * 0.62;
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x10141c, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 2.3); key.position.set(10, 18, 14); scene.add(key);
  const rim = new THREE.DirectionalLight(0x4cc9f0, 0.9); rim.position.set(-9, 16, -12); scene.add(rim);
  const under = new THREE.DirectionalLight(0xa8bdd8, 0.8); under.position.set(6, -4, 9); scene.add(under);

  // cut-away: CLIP_ALL slices the board and everything under it; CLIP_ZONE only slices inside the socket area,
  // so devices stay whole while they travel to the trays
  const pZ = new THREE.Plane(new THREE.Vector3(0, 0, -1), 100);
  const pXa = new THREE.Plane(new THREE.Vector3(-1, 0, 0), -7.05), pXb = new THREE.Plane(new THREE.Vector3(1, 0, 0), -7.05);
  const CLIP_ALL = [pZ], CLIP_ZONE = [pZ, pXa, pXb];
  const zone = (o = {}) => ({ clippingPlanes: CLIP_ZONE, clipIntersection: true, side: THREE.DoubleSide, ...o });
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  function canvasTex(w, h, draw, { repeat = null } = {}) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true }); draw(g, w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    t.userData = { c, g, draw }; return t;
  }
  function noise(g, w, h, a, seed) {
    const r = rng(seed), img = g.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * a; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    g.putImageData(img, 0, 0);
  }
  const glowTex = canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.22, 'rgba(255,255,255,.85)'); gr.addColorStop(0.5, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2, ...o });
  const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); return m; };

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
    const floor = new THREE.Mesh(new THREE.CircleGeometry(70, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex }));
    floor.position.y = -9.2; scene.add(floor);
  }

  const G = {};
  for (const n of ['th', 'pogo', 'stiff', 'pcb', 'sock', 'head', 'deck']) { G[n] = new THREE.Group(); scene.add(G[n]); }
  const caps = [];                                   // cut faces: shown only while the cut is fully open
  function cap(parent, w, h, x, y, mat) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, 0); m.visible = false; m.renderOrder = 2; parent.add(m); caps.push(m); return m; }

  /* ---------- test head ---------- */
  const thCapG = new THREE.Group(); G.th.add(thCapG);
  {
    const skin = canvasTex(1024, 256, (g, w, h) => {
      g.fillStyle = '#1a2230'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 2;
      for (let x = 32; x < w; x += 64) { g.beginPath(); g.moveTo(x, 18); g.lineTo(x, h - 18); g.stroke(); }
      g.fillStyle = '#0c1119'; for (let x = 40; x < w; x += 64) for (let y = 40; y < h - 60; y += 9) g.fillRect(x, y, 48, 4);        // vents
      g.fillStyle = '#4cc9f0'; g.fillRect(24, h - 30, w - 48, 3);
      noise(g, w, h, 8, 3);
    });
    const top = canvasTex(1024, 760, (g, w, h) => {
      g.fillStyle = '#202938'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = 2; g.strokeRect(20, 20, w - 40, h - 40);
      g.fillStyle = '#121822';
      for (let i = 0; i < 24; i++) g.fillRect(70 + i * 37, 120, 22, h - 240);                                                      // instrument card slots
      noise(g, w, h, 8, 5);
    });
    const side = std(0xffffff, { map: skin, metalness: 0.55, roughness: 0.45, clippingPlanes: CLIP_ALL, side: THREE.DoubleSide });
    const topM = std(0xffffff, { map: top, metalness: 0.5, roughness: 0.5, clippingPlanes: CLIP_ALL, side: THREE.DoubleSide });
    G.th.add(box(THEAD.w, THEAD.h, THEAD.d, [side, side, topM, side, side, side], 0, THEAD.top - THEAD.h / 2, 0));
    const cut = canvasTex(1024, 160, (g, w, h) => {
      g.fillStyle = '#0d121a'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#2a3547'; g.lineWidth = 6; g.strokeRect(3, 3, w - 6, h - 6);
      for (let i = 0; i < 26; i++) { const x = 60 + i * 35; g.fillStyle = '#16402e'; g.fillRect(x, 16, 9, h - 40); g.fillStyle = '#c9a24a'; for (let y = 24; y < h - 40; y += 14) g.fillRect(x + 9, y, 6, 7); }   // instrument cards on edge
      g.fillStyle = '#1b2433'; g.fillRect(20, h - 22, w - 40, 10);
    });
    cap(thCapG, THEAD.w, THEAD.h, 0, THEAD.top - THEAD.h / 2, new THREE.MeshStandardMaterial({ map: cut, roughness: 0.7 }));
  }

  /* ---------- spring-pin blocks between the test head and the board ---------- */
  {
    const body = std(0x20262f, { roughness: 0.6, metalness: 0.1, clippingPlanes: CLIP_ALL });
    const pins = [];
    for (const z of [-POGO_Z, POGO_Z]) for (const x of POGO_X) {
      G.pogo.add(box(2.3, 0.62, 1.05, body, x, -1.39, z));
      for (let i = 0; i < 12; i++) for (let j = 0; j < 4; j++) pins.push([x - 0.99 + i * 0.18, z - 0.3 + j * 0.2]);
    }
    const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.04, 0.62, 8), std(0xd9b45a, { metalness: 1, roughness: 0.3, clippingPlanes: CLIP_ALL }), pins.length);
    const m4 = new THREE.Matrix4(); pins.forEach(([x, z], i) => { m4.makeTranslation(x, -0.81, z); pm.setMatrixAt(i, m4); });
    G.pogo.add(pm);
  }

  /* ---------- stiffener frame under the board ---------- */
  const stiffCapG = new THREE.Group(); G.stiff.add(stiffCapG);
  {
    const s = new THREE.Shape(); const w = PCB.w / 2 + 0.3, d = PCB.d / 2 + 0.3;
    s.moveTo(-w, -d); s.lineTo(w, -d); s.lineTo(w, d); s.lineTo(-w, d); s.closePath();
    const hole = (x0, z0, x1, z1) => { const h = new THREE.Path(); h.moveTo(x0, z0); h.lineTo(x0, z1); h.lineTo(x1, z1); h.lineTo(x1, z0); h.closePath(); s.holes.push(h); };
    hole(-w + 0.7, -d + 0.6, w - 0.7, -3.5); hole(-w + 0.7, 3.5, w - 0.7, d - 0.6);          // windows for the spring-pin blocks
    hole(-w + 0.7, -2.9, -0.35, 2.9); hole(0.35, -2.9, w - 0.7, 2.9);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.5, bevelEnabled: false }).rotateX(-Math.PI / 2), std(0x9aa3ad, { metalness: 0.85, roughness: 0.38, clippingPlanes: CLIP_ALL, side: THREE.DoubleSide }));
    m.position.y = -1.0; G.stiff.add(m);
    const cm = new THREE.MeshStandardMaterial({ color: 0xb4bcc6, metalness: 0.6, roughness: 0.5 });
    for (const x of [-w + 0.35, w - 0.35, 0]) cap(stiffCapG, 0.7, 0.5, x, -0.75, cm);
  }

  /* ---------- the load board ---------- */
  let sites = sitePos(4), nSites = 4;
  const PW = 2048, PH = Math.round(2048 * PCB.d / PCB.w), pk = PW / PCB.w;
  const px = (x) => (x + PCB.w / 2) * pk, pz = (z) => (z + PCB.d / 2) * pk;
  function drawPcb(g) {
    const gr = g.createLinearGradient(0, 0, PW, PH); gr.addColorStop(0, '#0f5a3f'); gr.addColorStop(1, '#0a4230');
    g.fillStyle = gr; g.fillRect(0, 0, PW, PH);
    const r = rng(11);
    // fan-out: every site sends bundles of traces to the spring-pin fields along both long edges
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [sx, sz] of sites) for (const dir of Math.abs(sz) > 0.1 ? [Math.sign(sz)] : [-1, 1]) for (let k = 0; k < 30; k++) {      // two-row layouts fan out toward their own edge
      const u = (k - 14.5) / 14.5, x0 = sx + u * 0.85, z0 = sz + dir * 1.5, x1 = clamp(sx + u * 2.2 + (r() - 0.5) * 0.3, -7.6, 7.6), z1 = dir * (POGO_Z - 0.55 - r() * 0.5), zm = z0 + dir * (0.12 + Math.abs(u) * 0.3);
      g.strokeStyle = `rgba(${150 + (r() * 40) | 0},${215 + (r() * 30) | 0},${170 + (r() * 30) | 0},${0.2 + r() * 0.16})`; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(px(x0), pz(z0)); g.lineTo(px(x0), pz(zm)); g.lineTo(px(x1), pz(zm + dir * Math.abs(x1 - x0))); g.lineTo(px(x1), pz(z1)); g.stroke();
    }
    // spring-pin pad fields (they are on the bottom side; the top shows the matching via fields and test points)
    for (const z of [-POGO_Z, POGO_Z]) for (const x of POGO_X) {
      g.fillStyle = 'rgba(4,30,20,.55)'; g.fillRect(px(x - 1.15), pz(z - 0.5), 2.3 * pk, 1.0 * pk);
      g.fillStyle = '#d4b35c'; for (let i = 0; i < 12; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(px(x - 0.99 + i * 0.18), pz(z - 0.3 + j * 0.2), 4.2, 0, 7); g.fill(); }
    }
    // sockets: keep-out outline, ball pads, decoupling capacitors around each site
    sites.forEach(([sx, sz], i) => {
      g.fillStyle = 'rgba(5,28,20,.65)'; g.fillRect(px(sx - 1.5), pz(sz - 1.5), 3 * pk, 3 * pk);
      g.strokeStyle = 'rgba(235,240,230,.75)'; g.lineWidth = 2.5; g.strokeRect(px(sx - 1.5), pz(sz - 1.5), 3 * pk, 3 * pk);
      g.fillStyle = '#d9b860';
      for (let a = 0; a < PIN_N; a++) for (let b = 0; b < PIN_N; b++) { g.beginPath(); g.arc(px(sx + (a - (PIN_N - 1) / 2) * PIN_P), pz(sz + (b - (PIN_N - 1) / 2) * PIN_P), 5.2, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(235,240,230,.85)'; g.font = '700 26px JetBrains Mono, monospace'; g.fillText('SITE ' + (i + 1), px(sx - 1.48), pz(sz - 1.58));
      for (let k = 0; k < 14; k++) for (const [ox, oz, hor] of [[-1.62, -1.2 + k * 0.185, 0], [1.56, -1.2 + k * 0.185, 0]]) {
        g.fillStyle = '#c9ccd0'; g.fillRect(px(sx + ox), pz(sz + oz), 0.06 * pk, 0.11 * pk); g.fillStyle = '#7a5a3a'; g.fillRect(px(sx + ox), pz(sz + oz) + 3, 0.06 * pk, 0.11 * pk - 6);
      }
    });
    g.fillStyle = 'rgba(235,240,230,.8)'; g.font = '700 30px JetBrains Mono, monospace'; g.fillText('DEVICE INTERFACE BOARD · DEMO', 60, PH - 46);
    g.font = '500 22px JetBrains Mono, monospace'; g.fillText('x' + sites.length + ' SITES · BGA100 · NOT A REAL DESIGN', 60, PH - 18);
    for (const [x, z] of [[-8, -5.5], [8, -5.5], [-8, 5.5], [8, 5.5]]) { g.fillStyle = '#c9a24a'; g.beginPath(); g.arc(px(x), pz(z), 22, 0, 7); g.fill(); g.fillStyle = '#05070b'; g.beginPath(); g.arc(px(x), pz(z), 11, 0, 7); g.fill(); }
    noise(g, PW, PH, 7, 21);
  }
  const pcbTex = canvasTex(PW, PH, drawPcb);
  const layerTex = canvasTex(64, 256, (g) => {
    g.fillStyle = '#123527'; g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 30; i++) { const pl = i % 5 === 0; g.fillStyle = pl ? '#e7ad63' : '#b57638'; g.fillRect(0, 5 + i * 8.3, 64, pl ? 4.5 : 2.4); }
  }, { repeat: [10, 1] });
  const pcbMats = [0, 1, 2, 3, 4, 5].map((i) => new THREE.MeshStandardMaterial({ map: i === 2 ? pcbTex : i === 3 ? null : layerTex, color: i === 3 ? 0x0c4a35 : 0xffffff, roughness: 0.5, metalness: i === 2 ? 0.2 : 0.3, clippingPlanes: CLIP_ALL, side: THREE.DoubleSide, transparent: true }));
  G.pcb.add(box(PCB.w, Y.pcbH, PCB.d, pcbMats, 0, -Y.pcbH / 2, 0));
  const pcbCapTex = canvasTex(2048, 96, () => {});
  function drawPcbCap() {
    const g = pcbCapTex.userData.g, W = 2048, H = 96, k = W / PCB.w;
    g.fillStyle = '#123527'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 22; i++) { const pl = i % 5 === 0; g.fillStyle = pl ? '#e7ad63' : '#9a6a34'; g.fillRect(0, 4 + i * 4.1, W, pl ? 2.4 : 1.2); }
    const zc = cutZ(nSites);
    for (const [sx, sz] of sites) if (Math.abs(sz - zc) < 0.01) for (let a = 0; a < PIN_N; a++) {        // vias under the socket that the cut passes through
      const x = (sx + (a - (PIN_N - 1) / 2) * PIN_P + PCB.w / 2) * k, deep = 18 + ((a * 7) % 5) * 15;
      g.fillStyle = '#f0c27a'; g.fillRect(x - 2.5, 0, 5, deep);
      g.fillStyle = 'rgba(8,20,14,.9)'; g.fillRect(x - 2.5, deep, 5, H - deep - (a % 3 === 0 ? 0 : 8));     // back-drilled stub
    }
    pcbCapTex.needsUpdate = true;
  }
  const pcbCap = cap(G.pcb, PCB.w, Y.pcbH, 0, -Y.pcbH / 2, new THREE.MeshStandardMaterial({ map: pcbCapTex, roughness: 0.55, metalness: 0.25 }));
  // relays and connectors give the board some height
  const partsG = new THREE.Group(); G.pcb.add(partsG);
  function buildParts() {
    partsG.clear();
    const relay = std(0xe8e4d8, { roughness: 0.6, metalness: 0, clippingPlanes: CLIP_ALL }), conn = std(0x15181d, { roughness: 0.5, clippingPlanes: CLIP_ALL });
    const xs = [];
    for (let x = -7.6; x <= 7.61; x += 0.62) if (!sites.some(([sx]) => Math.abs(x - sx) < 2.0) || nSites < 4) xs.push(x);
    const spots = [];
    for (const x of xs) for (const z of nSites >= 4 ? [-0.25, 0.25] : [-2.6, 2.6]) if (!sites.some(([sx, sz]) => Math.abs(x - sx) < 1.9 && Math.abs(z - sz) < 1.9)) spots.push([x, z]);
    if (spots.length) {
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.46, 0.3, 0.3), relay, spots.length), m4 = new THREE.Matrix4();
      spots.forEach(([x, z], i) => { m4.makeTranslation(x, 0.15, z); im.setMatrixAt(i, m4); }); partsG.add(im);
    }
    for (const x of [-8.05, 8.05]) partsG.add(box(0.5, 0.42, 6.2, conn, x, 0.21, 0));
  }

  /* ---------- sockets ---------- */
  const sockG = G.sock;
  const U = { uComp: { value: 0 }, uWarp: { value: 0 }, uTest: { value: 0 }, uDirt: { value: 0 }, uOver: { value: 0 } };
  const pinGeo = (() => {
    const cyl = (r0, r1, y0, y1, seg = 10) => new THREE.CylinderGeometry(r1, r0, y1 - y0, seg).translate(0, (y0 + y1) / 2, 0).toNonIndexed();
    return mergeGeometries([cyl(0.009, 0.015, 0, 0.12), cyl(0.031, 0.031, 0.1, 0.4), cyl(0.017, 0.017, 0.41, 0.53), cyl(0.017, 0.026, 0.53, 0.56, 6)]);
  })();
  const pinMat = new THREE.MeshStandardMaterial({ color: 0xe0bd62, metalness: 1, roughness: 0.28, clippingPlanes: CLIP_ZONE, clipIntersection: true });
  pinMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aOff; varying float vOpen; varying float vTip; uniform float uComp; uniform float uWarp; uniform float uTest;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        { float c = max(0.0, uComp - aOff * uWarp); float top = step(0.405, position.y);
          transformed.y -= c * top;                       // the plunger slides into the barrel
          vOpen = uTest * step(uComp - aOff * uWarp, 0.0004); vTip = step(0.5, position.y); }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying float vOpen; varying float vTip; uniform float uTest; uniform float uDirt; uniform float uOver;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.44, 0.47), vTip * uDirt * 0.85);     // solder picked up by the crown
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.24, 0.2), max(vOpen, uOver) * 0.85);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(0.9, 0.1, 0.05) * max(vOpen, uOver) * 1.2 + vec3(0.2, 0.75, 0.9) * vTip * uTest * (1.0 - vOpen) * 0.9;`);
  };
  let pinMesh = null;
  const frameGeo = (() => {
    const s = new THREE.Shape(); const o = 1.45, i = 0.89;
    s.moveTo(-o, -o); s.lineTo(o, -o); s.lineTo(o, o); s.lineTo(-o, o); s.closePath();
    const h = new THREE.Path(); h.moveTo(-i, -i); h.lineTo(-i, i); h.lineTo(i, i); h.lineTo(i, -i); h.closePath(); s.holes.push(h);
    return new THREE.ExtrudeGeometry(s, { depth: Y.frame - 0.06, bevelEnabled: true, bevelSize: 0.03, bevelThickness: 0.03, bevelSegments: 2 }).rotateX(-Math.PI / 2).translate(0, 0.03, 0);
  })();
  const frameMat = std(0x262b33, zone({ metalness: 0.8, roughness: 0.42 }));
  const cartMat = new THREE.MeshPhysicalMaterial({ color: 0xc08a3e, roughness: 0.45, metalness: 0, transparent: true, ...zone() });
  const screwGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.06, 14), screwMat = std(0xb9c0c8, zone({ metalness: 1, roughness: 0.3 }));
  const frameCut = new THREE.MeshStandardMaterial({ color: 0x3a414c, metalness: 0.5, roughness: 0.5 });
  const cartCut = new THREE.MeshStandardMaterial({ color: 0xd59a48, roughness: 0.6, transparent: true, opacity: 0.32, depthWrite: false });
  const sockCapG = new THREE.Group(); sockG.add(sockCapG);
  const sockItems = new THREE.Group(); sockG.add(sockItems);
  function buildSockets() {
    sockItems.clear(); for (const c of [...sockCapG.children]) { caps.splice(caps.indexOf(c), 1); } sockCapG.clear();
    const zc = cutZ(nSites), m4 = new THREE.Matrix4(), offs = [];
    pinMesh = new THREE.InstancedMesh(pinGeo, pinMat, nSites * PIN_N * PIN_N);
    const rm = (PIN_N - 1) / 2 * PIN_P;
    let k = 0;
    for (const [sx, sz] of sites) {
      const fr = new THREE.Mesh(frameGeo, frameMat); fr.position.set(sx, 0, sz); sockItems.add(fr);
      sockItems.add(box(1.78, Y.cart, 1.78, cartMat, sx, Y.cart / 2, sz));
      for (const [cx, cz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]]) { const s = new THREE.Mesh(screwGeo, screwMat); s.position.set(sx + cx, Y.frame, sz + cz); sockItems.add(s); }
      for (let a = 0; a < PIN_N; a++) for (let b = 0; b < PIN_N; b++) {
        const x = (a - (PIN_N - 1) / 2) * PIN_P, z = (b - (PIN_N - 1) / 2) * PIN_P;
        m4.makeTranslation(sx + x, 0, sz + z); pinMesh.setMatrixAt(k++, m4); offs.push(Math.pow(Math.max(Math.abs(x), Math.abs(z)) / rm, 2));
      }
      if (Math.abs(sz - zc) < 0.01) {
        for (const sg of [-1, 1]) { const c = cap(sockCapG, 0.56, Y.frame, sx + sg * 1.17, Y.frame / 2, frameCut); c.position.z = zc; }
        const c = cap(sockCapG, 1.78, Y.cart, sx, Y.cart / 2, cartCut); c.position.z = zc; c.renderOrder = 3;
      }
    }
    pinMesh.geometry = pinGeo.clone(); pinMesh.geometry.setAttribute('aOff', new THREE.InstancedBufferAttribute(new Float32Array(offs), 1));
    pinMesh.frustumCulled = false; sockItems.add(pinMesh);
  }

  /* ---------- devices (BGA packages) ---------- */
  const markTex = canvasTex(256, 256, (g) => {
    g.fillStyle = '#17191d'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = 'rgba(205,210,218,.75)'; g.font = '700 30px JetBrains Mono, monospace'; g.fillText('DEMO SoC', 40, 108);
    g.font = '500 22px JetBrains Mono, monospace'; g.fillText('BGA100 · 2026', 40, 142); g.fillText('NOT A REAL PART', 40, 170);
    g.beginPath(); g.arc(34, 38, 10, 0, 7); g.fill();
    noise(g, 256, 256, 10, 31);
  });
  const moldM = (o) => std(0x17191d, { roughness: 0.75, metalness: 0, ...o }), subM = (o) => std(0x1d5a41, { roughness: 0.6, metalness: 0.1, ...o });
  const devGeo = { mold: new THREE.BoxGeometry(1.5, 0.125, 1.5), sub: new THREE.BoxGeometry(1.6, 0.075, 1.6), ball: new THREE.SphereGeometry(0.052, 12, 8) };
  const ballMat = std(0xd5dae0, zone({ metalness: 1, roughness: 0.22, side: THREE.FrontSide }));
  const moldTop = std(0xffffff, zone({ map: markTex, roughness: 0.75, metalness: 0 })), moldSide = moldM(zone()), subMat = subM(zone());
  const devCutTex = canvasTex(512, 64, (g) => {
    g.fillStyle = '#1d5a41'; g.fillRect(0, 40, 512, 24);                                   // substrate
    g.fillStyle = '#e7ad63'; for (const y of [43, 50, 57]) g.fillRect(0, y, 512, 2);
    g.fillStyle = '#1c1e22'; g.fillRect(16, 0, 480, 40);                                   // mould compound
    g.fillStyle = '#8f9bab'; g.fillRect(150, 18, 212, 16);                                 // die
    g.fillStyle = '#d5dae0'; for (let x = 158; x < 360; x += 14) g.fillRect(x, 34, 6, 6);    // bumps
  });
  const devCutMat = new THREE.MeshStandardMaterial({ map: devCutTex, roughness: 0.6 });
  const devs = [];
  const offBall = [];
  { const rm = (PIN_N - 1) / 2 * PIN_P; for (let a = 0; a < PIN_N; a++) for (let b = 0; b < PIN_N; b++) { const x = (a - (PIN_N - 1) / 2) * PIN_P, z = (b - (PIN_N - 1) / 2) * PIN_P; offBall.push([x, z, Math.pow(Math.max(Math.abs(x), Math.abs(z)) / rm, 2)]); } }
  for (let i = 0; i < 8; i++) {
    const g = new THREE.Group();
    g.add(box(1.6, 0.075, 1.6, subMat, 0, 0.085 + 0.0375, 0));
    g.add(box(1.5, 0.125, 1.5, [moldSide, moldSide, moldTop, moldSide, moldSide, moldSide], 0, 0.16 + 0.0625, 0));
    const balls = new THREE.InstancedMesh(devGeo.ball, ballMat, PIN_N * PIN_N); balls.frustumCulled = false; g.add(balls);
    const c = cap(g, 1.6, 0.2, 0, 0.185, devCutMat);
    scene.add(g); devs.push({ g, balls, cap: c });
  }
  let warpNow = -1;
  function setWarp(mm) {
    if (mm === warpNow) return; warpNow = mm;
    const m4 = new THREE.Matrix4();
    for (const d of devs) { offBall.forEach(([x, z, o], i) => { m4.makeTranslation(x, 0.05 + o * mm * MMW, z); d.balls.setMatrixAt(i, m4); }); d.balls.instanceMatrix.needsUpdate = true; }
  }
  // devices resting in the trays: one instanced mesh, top face marked
  const TRAY_N = TRAYS.in.p.length + TRAYS.pass.p.length + TRAYS.fail.p.length;
  const trayDevGeo = mergeGeometries([new THREE.BoxGeometry(1.6, 0.075, 1.6).translate(0, 0.1225, 0), new THREE.BoxGeometry(1.5, 0.125, 1.5).translate(0, 0.2225, 0)]);
  const trayDev = new THREE.InstancedMesh(trayDevGeo, std(0x1b1d22, { roughness: 0.75, metalness: 0 }), TRAY_N); trayDev.frustumCulled = false; scene.add(trayDev);
  const trayMark = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.5, 1.5).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: markTex, roughness: 0.75 }), TRAY_N); trayMark.frustumCulled = false; scene.add(trayMark);

  /* ---------- handler: rail, carriage, boom, head plate, pushers ---------- */
  const headG = G.head, railG = new THREE.Group(); scene.add(railG);
  const alu = std(0xaab2bc, { metalness: 0.9, roughness: 0.35 }), dark = std(0x232932, { metalness: 0.6, roughness: 0.5 });
  railG.add(box(34, 0.6, 0.8, dark, 0, 5.6, -7.2));
  { const stripe = box(34, 0.08, 0.1, new THREE.MeshBasicMaterial({ color: 0x4cc9f0 }), 0, 5.28, -6.79); railG.add(stripe); }
  for (const x of [-16.4, 16.4]) railG.add(box(0.8, 15, 0.8, dark, x, -1.9, -7.2));
  const carriage = box(2.4, 1.0, 1.2, alu, 0, 5.6, -7.2), boom = box(1.1, 0.42, 10.4, alu, 0, 5.0, -2.2);
  headG.add(carriage, boom);
  const zCol = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 1, 16), std(0xd7dce2, { metalness: 1, roughness: 0.2 })); headG.add(zCol);
  const plate = new THREE.Mesh(new THREE.BoxGeometry(1, 0.22, 1), std(0x2b323d, { metalness: 0.7, roughness: 0.4 })); headG.add(plate);
  const pushG = new THREE.Group(); headG.add(pushG);
  const pushMat = std(0x6f7782, zone({ metalness: 0.85, roughness: 0.4 })), faceMat = std(0xc98a4e, zone({ metalness: 1, roughness: 0.35, emissive: 0xff5a1f, emissiveIntensity: 0 }));
  const pushCut = new THREE.MeshStandardMaterial({ color: 0x7d8590, metalness: 0.5, roughness: 0.55 });
  const ledGeo = new THREE.BufferGeometry(); let ledCol = new Float32Array(24);
  const leds = new THREE.Points(ledGeo, new THREE.PointsMaterial({ size: 0.9, map: glowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); leds.frustumCulled = false; headG.add(leds);
  function buildHead() {
    for (const c of pushG.children) { const i = caps.indexOf(c); if (i >= 0) caps.splice(i, 1); }
    pushG.clear();
    const xs = sites.map((s) => s[0]), zs = sites.map((s) => s[1]);
    const w = Math.max(...xs) - Math.min(...xs) + 2.4, d = Math.max(...zs) - Math.min(...zs) + 2.4;
    plate.scale.set(w, 1, d);
    const zc = cutZ(nSites), pos = [];
    for (const [sx, sz] of sites) {
      pushG.add(box(1.25, 0.5, 1.25, pushMat, sx, 0.31, sz));
      pushG.add(box(1.32, 0.06, 1.32, faceMat, sx, 0.03, sz));
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.5, 16), pushMat); stem.position.set(sx, 0.8, sz); pushG.add(stem);
      if (Math.abs(sz - zc) < 0.01) { const c = cap(pushG, 1.25, 0.56, sx, 0.28, pushCut); c.position.z = zc; }
      pos.push(sx, 1.3, sz);
    }
    ledGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    ledCol = new Float32Array(nSites * 3); ledGeo.setAttribute('color', new THREE.BufferAttribute(ledCol, 3));
  }

  /* ---------- handler deck and trays ---------- */
  {
    const deck = std(0x1a2029, { metalness: 0.6, roughness: 0.55 });
    const trayTex = (nx, nz, tint) => canvasTex(nx * 96, nz * 96, (g, w, h) => {
      g.fillStyle = '#14171c'; g.fillRect(0, 0, w, h);
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        g.fillStyle = '#0a0c10'; g.fillRect(i * 96 + 7, j * 96 + 7, 82, 82);
        g.strokeStyle = tint; g.globalAlpha = 0.5; g.lineWidth = 2; g.strokeRect(i * 96 + 7, j * 96 + 7, 82, 82); g.globalAlpha = 1;
      }
      noise(g, w, h, 8, nx * 7 + nz);
    });
    const sign = (txt, col) => canvasTex(512, 96, (g) => { g.fillStyle = '#0b0f16'; g.fillRect(0, 0, 512, 96); g.fillStyle = col; g.fillRect(0, 0, 14, 96); g.font = '800 46px Inter, "Noto Sans TC", sans-serif'; g.fillText(txt, 34, 64); });
    for (const [T, tint, txt] of [[TRAYS.in, '#4cc9f0', 'INPUT 待測'], [TRAYS.pass, '#48d38a', 'PASS 良品'], [TRAYS.fail, '#ff5d5d', 'FAIL 不良']]) {
      const w = T.nx * TP + 0.3, d = T.nz * TP + 0.3;
      G.deck.add(box(w + 0.6, 0.5, d + 0.6, deck, T.x, -0.12, T.z));
      const top = std(0xffffff, { map: trayTex(T.nx, T.nz, tint), roughness: 0.7, metalness: 0 }), side = std(0x14171c, { roughness: 0.7, metalness: 0 });
      G.deck.add(box(w, 0.22, d, [side, side, top, side, side, side], T.x, 0.24, T.z));
      const s = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.49), new THREE.MeshBasicMaterial({ map: sign(txt, tint) }));
      s.position.set(T.x, -0.12, T.z + d / 2 + 0.305); G.deck.add(s);
    }
    for (const x of [-10.4, 10.4]) G.deck.add(box(6.6, 8.6, 12.2, deck, x, -4.7, 0.3));
  }

  /* ---------- signal traces: tester -> spring pin -> board -> socket pin -> ball ---------- */
  const traceG = new THREE.Group(); scene.add(traceG);
  const TRACE_COL = [0x4cc9f0, 0x7ee787, 0xffc53d, 0xff8fb1, 0xb69cff, 0x5fe3c0];
  let traces = [];
  const pulseGeo = new THREE.BufferGeometry(); let pulsePos = new Float32Array(3), pulseCol = new Float32Array(3);
  const pulses = new THREE.Points(pulseGeo, new THREE.PointsMaterial({ size: 0.42, map: glowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false })); pulses.frustumCulled = false; pulses.renderOrder = 5; traceG.add(pulses);
  const traceMats = TRACE_COL.map((c) => new THREE.MeshBasicMaterial({ color: c, transparent: true, depthTest: false, toneMapped: false }));
  function buildTraces() {
    for (const t of traces) { traceG.remove(t.mesh); t.mesh.geometry.dispose(); }
    traces = [];
    const zc = cutZ(nSites), front = sites.filter((s) => Math.abs(s[1] - zc) < 0.01), [sx, sz] = front[0];
    const picks = [[1, 3], [3, 6], [5, 2], [6, 7], [8, 4], [4, 5]];
    picks.forEach(([a, b], i) => {
      const x = sx + (a - (PIN_N - 1) / 2) * PIN_P, z = sz + (b - (PIN_N - 1) / 2) * PIN_P;
      const back = i % 2 === 0, pz0 = back ? -POGO_Z : POGO_Z, pxb = POGO_X[clamp(Math.round((sx + 6) / 3) + (i % 3) - 1, 0, 4)] - 0.8 + i * 0.3, zpin = pz0 + (i % 4) * 0.2 - 0.3, ly = -0.1 - 0.06 * i;
      const run = Math.abs(zpin - z) - Math.abs(pxb - x);
      const mid = [pxb, ly, zpin + Math.sign(z - zpin) * Math.max(0.2, run)];
      traces.push({ raw: [[pxb, THEAD.top - 1.4, zpin, 'th'], [pxb, THEAD.top, zpin, 'th'], [pxb, -0.5, zpin, 'pogo'], [pxb, ly, zpin, 'pcb'], [...mid, 'pcb'], [x, ly, z, 'pcb'], [x, 0, z, 'pcb'], [x, Y.tip, z, 'sock'], [x, Y.tip + 0.14, z, 'dev']], col: i });
    });
    for (const t of traces) { t.mesh = new THREE.Mesh(new THREE.BufferGeometry(), traceMats[t.col]); t.mesh.frustumCulled = false; t.mesh.renderOrder = 4; traceG.add(t.mesh); t.key = ''; }
    const n = traces.length * 5; pulsePos = new Float32Array(n * 3); pulseCol = new Float32Array(n * 3);
    pulseGeo.setAttribute('position', new THREE.BufferAttribute(pulsePos, 3)); pulseGeo.setAttribute('color', new THREE.BufferAttribute(pulseCol, 3));
  }
  const _c = new THREE.Color();
  function updateTraces(v, off) {
    traceG.visible = v.trace > 0.01; if (!traceG.visible) return;
    const yOf = { th: off.th, pogo: off.pogo, pcb: 0, sock: off.sock, dev: off.sock };
    let pi = 0;
    for (const t of traces) {
      const pts = t.raw.map(([x, y, z, L], i) => new THREE.Vector3(x, y + (L === 'pogo' && i === 2 ? 0 : yOf[L]) , z));
      pts[2].y = -0.5;                                   // the spring pin always reaches the board's bottom pad
      const key = pts.map((p) => p.y.toFixed(2)).join();
      if (key !== t.key) { t.key = key; t.mesh.geometry.dispose(); t.curve = new Poly(pts); t.mesh.geometry = new THREE.TubeGeometry(t.curve, 160, 0.028, 6, false); }
      traceMats[t.col].opacity = v.trace * 0.95;
      _c.setHex(TRACE_COL[t.col]);
      for (let k = 0; k < 5; k++) {
        const u = ((v.t * 0.33 + k / 5 + t.col * 0.13) % 1), p = t.curve.getPoint(u);
        pulsePos[pi * 3] = p.x; pulsePos[pi * 3 + 1] = p.y; pulsePos[pi * 3 + 2] = p.z;
        const a = v.trace * Math.sin(Math.PI * u) * 1.6; pulseCol[pi * 3] = _c.r * a; pulseCol[pi * 3 + 1] = _c.g * a; pulseCol[pi * 3 + 2] = _c.b * a; pi++;
      }
    }
    pulseGeo.attributes.position.needsUpdate = true; pulseGeo.attributes.color.needsUpdate = true;
  }

  /* ---------- rebuild for a site count ---------- */
  function setSites(n) {
    nSites = n; sites = sitePos(n);
    pcbTex.userData.g.clearRect(0, 0, PW, PH); drawPcb(pcbTex.userData.g); pcbTex.needsUpdate = true;
    drawPcbCap(); buildParts(); buildSockets(); buildHead(); buildTraces();
    devs.forEach((d, i) => { d.g.visible = i < n; d.cap.position.z = 0; d.capOn = i < n && Math.abs(sites[i][1] - cutZ(n)) < 0.01; });
    warpNow = -1;
  }

  /* ---------- per frame ---------- */
  const m4 = new THREE.Matrix4(), hide = new THREE.Matrix4().makeTranslation(0, -200, 0);
  function frame(v) {
    const ex = v.ex, off = { th: EX.th * ex, pogo: EX.pogo * ex, stiff: EX.stiff * ex, sock: EX.sock * ex };
    G.th.position.y = off.th; G.pogo.position.y = off.pogo; G.stiff.position.y = off.stiff; G.sock.position.y = off.sock;
    // cut-away plane sweeps in from the front edge
    const zc = cutZ(nSites), cu = ease(v.cut);
    pZ.constant = v.cut < 0.002 ? 100 : lerp(PCB.d / 2 + 1.2, zc, cu);
    const capOn = v.cut > 0.985;
    for (const c of caps) c.visible = capOn;
    pcbCap.position.z = zc; thCapG.position.z = zc; stiffCapG.position.z = zc;
    for (const d of devs) d.cap.visible = capOn && d.capOn && d.inZone;
    cartMat.opacity = 1 - 0.62 * cu; cartMat.depthWrite = cu < 0.5;
    // board goes glassy while the signal path is showing
    const tr = v.trace, op = 1 - 0.72 * tr;
    for (const m of pcbMats) { m.opacity = op; m.depthWrite = tr < 0.5; }
    partsG.visible = tr < 0.5;
    // pins
    setWarp(v.warp);
    U.uComp.value = v.comp * MMW; U.uWarp.value = v.warp * MMW; U.uTest.value = v.testing ? 1 : 0; U.uDirt.value = v.dirt; U.uOver.value = v.over ? 1 : 0;
    // handler
    carriage.position.x = boom.position.x = v.headX;
    const py = v.headY;                                 // y of the pusher faces
    plate.position.set(v.headX, py + 1.16, (Math.min(...sites.map((s) => s[1])) + Math.max(...sites.map((s) => s[1]))) / 2);
    pushG.position.set(v.headX, py, 0); leds.position.set(v.headX, py, 0);
    const top = 5.0 + EX.head * ex, len = Math.max(0.2, top - (py + 1.27));
    zCol.scale.y = len; zCol.position.set(v.headX, py + 1.27 + len / 2, plate.position.z);
    carriage.position.y = 5.6 + EX.head * ex; boom.position.y = 5.0 + EX.head * ex; railG.position.y = EX.head * ex;
    faceMat.emissiveIntensity = v.hot;
    for (let i = 0; i < nSites; i++) {
      const r = v.led[i] || 0, a = v.ledA;
      ledCol[i * 3] = r === 2 ? 1.6 * a : r === 1 ? 0.2 * a : 0; ledCol[i * 3 + 1] = r === 1 ? 1.5 * a : r === 2 ? 0.2 * a : 0; ledCol[i * 3 + 2] = r === 1 ? 0.5 * a : r === 2 ? 0.2 * a : 0;
    }
    ledGeo.attributes.color.needsUpdate = true;
    // devices on the move
    for (let i = 0; i < 8; i++) {
      const d = devs[i], s = v.dev[i];
      if (i >= nSites || !s || !s.on) { d.g.visible = false; continue; }
      d.g.visible = true; d.g.position.set(s.x, s.y, s.z); d.inZone = Math.abs(s.x - sites[i][0]) < 0.02;
    }
    // devices in trays
    let k = 0;
    for (const [T, occ] of [[TRAYS.in, v.trays.in], [TRAYS.pass, v.trays.pass], [TRAYS.fail, v.trays.fail]]) for (let i = 0; i < T.p.length; i++, k++) {
      if (occ[i]) { m4.makeTranslation(T.p[i][0], Y.trayDev - 0.085, T.p[i][1]); trayDev.setMatrixAt(k, m4); m4.makeTranslation(T.p[i][0], Y.trayDev + 0.202, T.p[i][1]); trayMark.setMatrixAt(k, m4); }
      else { trayDev.setMatrixAt(k, hide); trayMark.setMatrixAt(k, hide); }
    }
    trayDev.instanceMatrix.needsUpdate = true; trayMark.instanceMatrix.needsUpdate = true;
    updateTraces(v, off);
  }
  function resize(w, h) { renderer.setSize(w, h, false); }
  setSites(4);
  return { renderer, scene, camera, controls, setSites, frame, resize, render: () => renderer.render(scene, camera), get sites() { return sites; } };
}
