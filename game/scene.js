// Probe Card Lab — the game's 3D stage: wafer on its chuck, the probe card over it, sparks, bloom.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { N, DIE, WR, dieC, valid } from './model.js';

const UM = 0.0012, GAP = 200;                     // world units per μm of Z (exaggerated), separation while indexing
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const ease5 = (t) => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

export const COLORS = { pass: '#3fdc8c', fail: '#ff5d6a', falseFail: '#ffc53d', damaged: '#e05cff', none: '#1d2735' };

export function createStage(canvas, { lowPower = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  const DPR = Math.min(window.devicePixelRatio || 1, lowPower ? 1.5 : 2);
  renderer.setPixelRatio(DPR);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.localClippingEnabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04060a);
  scene.fog = new THREE.Fog(0x04060a, 26, 80);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.5;
  const camera = new THREE.PerspectiveCamera(34, 1, 0.02, 200);

  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x0c1018, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.4); key.position.set(9, 15, 11); scene.add(key);
  const rim = new THREE.DirectionalLight(0x4cc9f0, 1.2); rim.position.set(-7, 16, -12); scene.add(rim);
  const under = new THREE.DirectionalLight(0xa8bdd8, 0.9); under.position.set(5, -4, 9); scene.add(under);
  const heatLight = new THREE.PointLight(0xff7a2f, 0, 14, 1.6); heatLight.position.set(0, 0.7, 2.2); scene.add(heatLight);

  /* ---------- post ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.55, 1.0);
  composer.addPass(bloom);
  const grade = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uFlash: { value: new THREE.Vector4(0, 0, 0, 0) }, uAb: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform vec4 uFlash; uniform float uAb; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        vec2 d = vUv - 0.5; float r2 = dot(d, d);
        vec2 o = d * (0.0025 + uAb) * r2 * 4.0;                       // slight lens fringing toward the corners
        vec3 c = vec3(texture2D(tDiffuse, vUv + o).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - o).b);
        c *= 1.0 - 0.55 * smoothstep(0.18, 0.62, r2);                  // vignette
        c += (h(vUv * 900.0 + uTime) - 0.5) * 0.028;                   // film grain
        c = mix(c, uFlash.rgb, uFlash.a * (0.35 + 0.65 * smoothstep(0.05, 0.5, r2)));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  let useBloom = true;

  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);   // cut-away: keep z <= 0
  const CLIP = [clipPlane];
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); draw(g, w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso;
    t.userData = { c, g }; return t;
  }
  const glowTex = canvasTex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.8)'); gr.addColorStop(0.55, 'rgba(255,255,255,.2)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  });

  /* ---------- floor ---------- */
  {
    const tex = canvasTex(1024, 1024, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, '#0f1825'); gr.addColorStop(0.5, '#090e16'); gr.addColorStop(1, '#04060a');
      g.fillStyle = gr; g.fillRect(0, 0, w, w);
      g.strokeStyle = 'rgba(120,170,210,.06)'; g.lineWidth = 1;
      for (let i = 0; i <= w; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, w); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
      const vg = g.createRadialGradient(w / 2, w / 2, w * 0.22, w / 2, w / 2, w / 2);
      vg.addColorStop(0, 'rgba(4,6,10,0)'); vg.addColorStop(1, 'rgba(4,6,10,1)'); g.fillStyle = vg; g.fillRect(0, 0, w, w);
    });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(50, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex }));
    floor.position.y = -2.6; scene.add(floor);
  }

  /* ---------- wafer + chuck ---------- */
  const chuckG = new THREE.Group(); scene.add(chuckG);
  const WS = lowPower ? 1024 : 2048;
  const w2p = (v, size) => (v / WR + 1) / 2 * size;
  const waferTex = canvasTex(WS, WS, (g) => {
    const gr = g.createLinearGradient(0, 0, WS, WS);
    gr.addColorStop(0, '#3e4a66'); gr.addColorStop(0.45, '#27324a'); gr.addColorStop(1, '#1a2336');
    g.fillStyle = gr; g.fillRect(0, 0, WS, WS);
    g.save(); g.beginPath(); g.arc(WS / 2, WS / 2, WS / 2 - 3, 0, Math.PI * 2); g.clip();
    const r = rng(7), dp = DIE / (2 * WR) * WS, k = WS / 2048;
    const pal = ['#394a7a', '#4a3f70', '#2e5866', '#56503c', '#3a4c62', '#48395e'];
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x0 = w2p(dieC(i) - DIE / 2, WS), y0 = w2p(dieC(j) - DIE / 2, WS);
      g.fillStyle = valid[j * N + i] ? 'rgba(46,58,86,.95)' : 'rgba(40,48,68,.9)';
      g.fillRect(x0 + 1.5 * k, y0 + 1.5 * k, dp - 3 * k, dp - 3 * k);
      for (let b = 0; b < 9; b++) {
        g.fillStyle = pal[(r() * pal.length) | 0]; g.globalAlpha = 0.55 + r() * 0.35;
        const bw = (8 + r() * 30) * k, bh = (8 + r() * 30) * k;
        g.fillRect(x0 + 14 * k + r() * (dp - 28 * k - bw), y0 + 14 * k + r() * (dp - 28 * k - bh), bw, bh);
      }
      g.globalAlpha = 1; g.fillStyle = '#c9d2de';
      const cx = dieC(i), cz = dieC(j), ps = 0.03 / (2 * WR) * WS;
      for (let q = 0; q < 14; q++) {
        const s = -0.3 + q * 0.6 / 13;
        for (const [px, pz] of [[cx + s, cz - 0.34], [cx + s, cz + 0.34], [cx - 0.34, cz + s], [cx + 0.34, cz + s]]) g.fillRect(w2p(px, WS) - ps / 2, w2p(pz, WS) - ps / 2, ps, ps);
      }
    }
    g.restore();
    g.strokeStyle = 'rgba(200,215,235,.35)'; g.lineWidth = 6 * (WS / 2048); g.beginPath(); g.arc(WS / 2, WS / 2, WS / 2 - 5, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#04060a'; g.beginPath(); g.arc(WS / 2, WS - 2, 14 * (WS / 2048), 0, Math.PI * 2); g.fill();
  });
  const RS = 512;
  const resTex = canvasTex(RS, RS, () => {});
  const chuckMat = new THREE.MeshStandardMaterial({ color: 0x5d6675, metalness: 0.9, roughness: 0.32, emissive: 0xff5a1f, emissiveIntensity: 0 });
  {
    const top = new THREE.Mesh(new THREE.CircleGeometry(WR, 160).rotateX(-Math.PI / 2),
      new THREE.MeshPhysicalMaterial({ map: waferTex, roughness: 0.46, metalness: 0.15, specularIntensity: 0.35, iridescence: 0.25, iridescenceIOR: 1.45, iridescenceThicknessRange: [180, 520], envMapIntensity: 0.1 }));
    chuckG.add(top);
    const over = new THREE.Mesh(new THREE.CircleGeometry(WR, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: resTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false }));
    over.position.y = 0.0015; chuckG.add(over);
    const edge = new THREE.Mesh(new THREE.CylinderGeometry(WR, WR, 0.05, 160, 1, true), new THREE.MeshStandardMaterial({ color: 0x8a94a8, metalness: 0.6, roughness: 0.3 }));
    edge.position.y = -0.025; chuckG.add(edge);
    const chuck = new THREE.Mesh(new THREE.CylinderGeometry(7.1, 7.1, 0.62, 128), chuckMat); chuck.position.y = -0.36; chuckG.add(chuck);
    const ring = new THREE.Mesh(new THREE.RingGeometry(6.55, 7.05, 128).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a414d, metalness: 0.8, roughness: 0.4 }));
    ring.position.y = -0.049; chuckG.add(ring);
  }
  function paintDie(d, state) {                     // state: 'pass' | 'fail' | 'falseFail' | 'damaged'
    const i = d % N, j = (d / N) | 0, g = resTex.userData.g, dp = DIE / (2 * WR) * RS;
    const x = w2p(dieC(i) - DIE / 2, RS) + 1, y = w2p(dieC(j) - DIE / 2, RS) + 1;
    g.clearRect(x - 1, y - 1, dp, dp);
    g.globalAlpha = state === 'pass' ? 0.55 : 0.85; g.fillStyle = COLORS[state]; g.fillRect(x, y, dp - 2, dp - 2); g.globalAlpha = 1;
    resTex.needsUpdate = true;
  }
  function clearDies() { resTex.userData.g.clearRect(0, 0, RS, RS); resTex.needsUpdate = true; }

  /* ---------- the probe card (rebuilt per level) ---------- */
  const cardG = new THREE.Group(); scene.add(cardG);          // everything that belongs to the card
  const upperG = new THREE.Group(); cardG.add(upperG);        // the part that lifts when the card gives under load
  const U = { uZ: { value: -GAP * UM }, uWarp: { value: 0 }, uSet: { value: 0 }, uTest: { value: 0 }, uHot: { value: 0 } };
  let card = null;                                            // { kind, probes:[[x,z]], warpN:[], tipGeo, ... }
  const tipGeo = new THREE.BufferGeometry();
  let tipPos = new Float32Array(3), tipCol = new Float32Array(3);
  const tipPts = new THREE.Points(tipGeo, new THREE.PointsMaterial({ size: 0.12, map: glowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, clippingPlanes: CLIP }));
  tipPts.frustumCulled = false; scene.add(tipPts);

  function bendMaterial(color, cant) {
    const m = new THREE.MeshStandardMaterial({ color, metalness: cant ? 0.8 : 1, roughness: cant ? 0.5 : 0.3, clippingPlanes: CLIP });
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
          attribute float aWarp; varying float vOpen; varying float vStrain;
          uniform float uZ; uniform float uWarp; uniform float uSet; uniform float uTest;`)
        .replace('#include <begin_vertex>', cant ? `#include <begin_vertex>
          { // cantilever: clamped at the ring (x = -1), tip at x = 0; the beam lifts like t^2 and the tip slides forward
            float off = aWarp * uWarp; float lift = max(0.0, uZ - off);
            float t = clamp(position.x + 1.0, 0.0, 1.0);
            transformed.y += off * t + (lift + uSet) * t * t;
            transformed.x += lift * 0.9 * t * t;
            vOpen = uTest * step(uZ - off, 0.0); vStrain = lift;
          }` : `#include <begin_vertex>
          { float off = aWarp * uWarp; float lift = max(0.0, uZ - off);
            float t = clamp((position.y - 0.18) / 0.60, 0.0, 1.0); float w = 1.0 - t;
            transformed.y += off + lift * w;
            transformed.x += (lift * 1.15 + uSet) * sin(3.14159265 * t) + lift * 0.06 * w;
            vOpen = uTest * step(uZ - off, 0.0); vStrain = lift;
          }`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
          varying float vOpen; varying float vStrain; uniform float uSet;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.24, 0.2), max(vOpen, clamp(uSet * 14.0, 0.0, 0.85)));`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(0.9, 0.1, 0.05) * max(vOpen, clamp(uSet * 12.0, 0.0, 1.0)) * 1.4;`);
    };
    m.customProgramCacheKey = () => (cant ? 'cant' : 'vert') + '-bend';
    return m;
  }
  const flat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, side: THREE.DoubleSide, clippingPlanes: CLIP, ...o });
  function cap(parent, w, h, x, y, mat) { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); m.position.set(x, y, -0.0005); parent.add(m); return m; }
  function dispose(g) { g.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); g.clear(); }

  function buildCard(kind, L) {
    dispose(upperG); dispose(cardG); cardG.add(upperG);
    const dense = L.pins > 5000;
    const probes = [];
    if (kind === 'cant') {
      for (let k = 0; k < 14; k++) { const s = -0.3 + k * 0.6 / 13; probes.push([s, -0.34, 0, s], [s, 0.34, 2, s], [-0.34, s, 3, s], [0.34, s, 1, s]); }   // [x, z, side, along]
    } else if (dense) {
      for (const dz of [-0.4, 0.4]) for (const dx of [-0.4, 0.4]) for (let a = 0; a < 13; a++) for (let b = 0; b < 13; b++) probes.push([dx - 0.33 + a * 0.055, dz - 0.33 + b * 0.055]);
    } else {
      for (const dz of [-0.4, 0.4]) for (const dx of [-0.4, 0.4]) for (let k = 0; k < 14; k++) { const s = -0.3 + k * 0.6 / 13; probes.push([dx + s, dz - 0.34], [dx + s, dz + 0.34], [dx - 0.34, dz + s], [dx + 0.34, dz + s]); }
    }
    const xm = Math.max(...probes.map((p) => Math.abs(p[0]))), rm = Math.max(...probes.map((p) => Math.hypot(p[0], p[1])));
    const raw = probes.map(([x, z]) => 0.75 * (x + xm) / (2 * xm) + 0.25 * (x * x + z * z) / (rm * rm)), mx = Math.max(...raw);
    const warpN = raw.map((v) => v / mx);
    const inst = new THREE.InstancedBufferAttribute(new Float32Array(warpN), 1);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), yAxis = new THREE.Vector3(0, 1, 0);
    let mesh;
    if (kind === 'cant') {
      // one needle, tip at the origin pointing down, shaft running back to x = -1 where the epoxy ring holds it
      const shaft = new THREE.CylinderGeometry(0.013, 0.02, 1.0, 8).rotateZ(Math.PI / 2).translate(-0.5, 0, 0);
      const sp = shaft.attributes.position;
      for (let i = 0; i < sp.count; i++) { const x = sp.getX(i); sp.setY(i, sp.getY(i) + 0.13 + (-x) * 0.2); }      // slope up toward the ring
      const tip = new THREE.CylinderGeometry(0.013, 0.0045, 0.14, 8).translate(0, 0.07, 0);
      const tp = tip.attributes.position;
      for (let i = 0; i < tp.count; i++) tp.setX(i, tp.getX(i) - tp.getY(i) * 0.16);                                  // tip leans back
      const geo = mergeGeometries([shaft.toNonIndexed(), tip.toNonIndexed()]);
      geo.computeVertexNormals(); geo.setAttribute('aWarp', inst);
      mesh = new THREE.InstancedMesh(geo, bendMaterial(0x8b929c, true), probes.length);
      probes.forEach(([x, z, side, along], i) => {
        q.setFromAxisAngle(yAxis, -(side * Math.PI / 2 + Math.PI / 2) + (side < 2 ? -1 : 1) * along * 0.9);          // tips point inward, shafts fan out to the ring
        m4.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(1, 1, 1)); mesh.setMatrixAt(i, m4);
      });
      cardG.add(mesh);
      // epoxy ring + ceramic ring holding the needles
      const ring = new THREE.Shape(); ring.absarc(0, 0, 1.62, 0, Math.PI * 2, false);
      const hole = new THREE.Path(); hole.absarc(0, 0, 1.12, 0, Math.PI * 2, true); ring.holes.push(hole);
      const epoxy = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: 0.16, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 72 }).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0xb87a22, roughness: 0.62, metalness: 0, side: THREE.DoubleSide, clippingPlanes: CLIP }));
      epoxy.position.y = 0.27; upperG.add(epoxy);
      const epoxyCut = new THREE.MeshStandardMaterial({ color: 0xd9983a, roughness: 0.5 }), cerCut = new THREE.MeshStandardMaterial({ color: 0xa9a598, roughness: 0.7 });
      const pcbCut = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.3, map: canvasTex(1024, 64, (g) => {
        g.fillStyle = '#1b3125'; g.fillRect(0, 0, 1024, 64);
        for (let i = 0; i < 13; i++) { const pl = i % 4 === 0; g.fillStyle = pl ? '#e7ad63' : '#b57638'; g.fillRect(0, 3 + i * 4.6, 1024, pl ? 3 : 1.6); }
        const r = rng(9); for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(236,186,110,.9)'; g.fillRect(r() * 1024, 0, 4, 64); }
      }) });
      for (const sx of [-1, 1]) { cap(upperG, 0.5, 0.2, sx * 1.37, 0.35, epoxyCut); cap(upperG, 0.5, 0.12, sx * 1.37, 0.51, cerCut); cap(upperG, 3.28, 0.16, sx * 2.76, 0.66, pcbCut); }
      const cer = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, { depth: 0.12, bevelEnabled: false, curveSegments: 72 }).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xa8a497, roughness: 0.9, side: THREE.DoubleSide, clippingPlanes: CLIP }));
      cer.position.y = 0.45; upperG.add(cer);
      const pcbS = new THREE.Shape(); pcbS.absarc(0, 0, 4.4, 0, Math.PI * 2, false); const ph = new THREE.Path(); ph.absarc(0, 0, 1.12, 0, Math.PI * 2, true); pcbS.holes.push(ph);
      const pcb = new THREE.Mesh(new THREE.ExtrudeGeometry(pcbS, { depth: 0.16, bevelEnabled: false, curveSegments: 96 }).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x0d4a35, roughness: 0.5, metalness: 0.15, side: THREE.DoubleSide, clippingPlanes: CLIP }));
      pcb.position.y = 0.58; upperG.add(pcb);
    } else {
      const thin = kind === 'mems';
      const pts = [[0, 0], [0, 0.1], [0, 0.18], [0.004, 0.3], [0.015, 0.48], [0.027, 0.66], [0.03, 0.78], [0.03, 0.9]].map(([x, y]) => new THREE.Vector3(x, y, 0));
      const rad = thin ? 0.0062 : dense ? 0.0072 : 0.0085;
      const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 40, rad, 6, false);
      const geo = mergeGeometries([tube.toNonIndexed(), new THREE.SphereGeometry(rad, 8, 6).toNonIndexed(), new THREE.SphereGeometry(rad, 8, 6).translate(0.03, 0.9, 0).toNonIndexed()]);
      geo.setAttribute('aWarp', inst);
      mesh = new THREE.InstancedMesh(geo, bendMaterial(thin ? 0xbfe8dd : 0xe6d09a, false), probes.length);
      probes.forEach(([x, z], i) => { m4.makeTranslation(x, 0, z); mesh.setMatrixAt(i, m4); });
      cardG.add(mesh);
      // guide plates, housing, substrate and a slice of PCB above
      const guideTex = canvasTex(512, 512, (g, w) => {
        g.fillStyle = '#3b414b'; g.fillRect(0, 0, w, w);
        const k = w / 2.2;
        for (const [x, z] of probes) { const px = (x + 1.1) * k, pz = (z + 1.1) * k; g.fillStyle = '#6d7684'; g.beginPath(); g.arc(px, pz, dense ? 2.6 : 4, 0, 7); g.fill(); g.fillStyle = '#0b0e13'; g.beginPath(); g.arc(px, pz, dense ? 1.6 : 2.6, 0, 7); g.fill(); }
      });
      const gs = flat(0x353b45), gt = flat(0xffffff, { map: guideTex });
      const gm = [gs, gs, gt, gt, gs, gs];
      const lg = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 2.2), gm); lg.position.y = 0.15; cardG.add(lg);
      cap(cardG, 2.2, 0.06, 0, 0.15, new THREE.MeshStandardMaterial({ color: 0x4a515c, roughness: 0.6 }));
      const housing = new THREE.MeshStandardMaterial({ color: 0x2b3240, metalness: 0.75, roughness: 0.36, clippingPlanes: CLIP, side: THREE.DoubleSide });
      for (const [x, z, sx, sz] of [[0, -1.04, 2.2, 0.12], [1.04, 0, 0.12, 1.96], [-1.04, 0, 0.12, 1.96]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.6, sz), housing); m.position.set(x, 0.48, z); cardG.add(m); }
      const hc = new THREE.MeshStandardMaterial({ color: 0x3a4352, roughness: 0.5 });
      cap(cardG, 0.12, 0.6, 1.04, 0.48, hc); cap(cardG, 0.12, 0.6, -1.04, 0.48, hc);
      const ug = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 2.2), gm); ug.position.y = 0.81; upperG.add(ug);
      cap(upperG, 2.2, 0.06, 0, 0.81, new THREE.MeshStandardMaterial({ color: 0x4a515c, roughness: 0.6 }));
      const layers = canvasTex(64, 256, (g) => {
        g.fillStyle = '#4a3f2e'; g.fillRect(0, 0, 64, 256); let y = 0;
        const band = (hh, c) => { g.fillStyle = c; g.fillRect(0, y, 64, hh); y += hh; };
        for (let i = 0; i < 5; i++) { band(6, '#c98b4a'); band(12, '#6d5a3e'); } band(6, '#c98b4a'); band(40, '#3b3325'); band(6, '#c98b4a'); band(2, '#3b3325');
        for (let i = 0; i < 5; i++) { band(12, '#6d5a3e'); band(6, '#c98b4a'); }
      });
      layers.wrapS = THREE.RepeatWrapping; layers.repeat.set(12, 1);
      const mloTop = new THREE.MeshStandardMaterial({ color: 0x6b5a3e, roughness: 0.5, metalness: 0.2, clippingPlanes: CLIP });
      const mloSide = new THREE.MeshStandardMaterial({ map: layers, roughness: 0.6, clippingPlanes: CLIP });
      const mlo = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 2.6), [mloSide, mloSide, mloTop, mloTop, mloSide, mloSide]); mlo.position.y = 0.98; upperG.add(mlo);
      cap(upperG, 2.6, 0.12, 0, 0.98, new THREE.MeshStandardMaterial({ map: layers, roughness: 0.6 }));
      const pcbCap = canvasTex(1024, 128, (g) => {
        g.fillStyle = '#1b3125'; g.fillRect(0, 0, 1024, 128);
        for (let i = 0; i < 26; i++) { const pl = i % 6 === 0; g.fillStyle = pl ? '#e7ad63' : '#b57638'; g.fillRect(0, 4 + i * 4.6, 1024, pl ? 3 : 1.6); }
        const r = rng(4); for (let i = 0; i < 9; i++) { g.fillStyle = 'rgba(236,186,110,.9)'; g.fillRect(r() * 1024, 0, 4, 128); }
      });
      pcbCap.wrapS = THREE.RepeatWrapping; pcbCap.repeat.set(3, 1);
      const pcb = new THREE.Mesh(new THREE.BoxGeometry(9, 0.28, 9), new THREE.MeshStandardMaterial({ color: 0x0d4a35, roughness: 0.5, metalness: 0.15, clippingPlanes: CLIP })); pcb.position.y = 1.22; upperG.add(pcb);
      cap(upperG, 9, 0.28, 0, 1.22, new THREE.MeshStandardMaterial({ map: pcbCap, roughness: 0.5, metalness: 0.3 }));
      const balls = [];
      for (let j = 0; j < 22; j++) for (let i = 0; i < 22; i++) { const x = -1.2 + i * 2.4 / 21, z = -1.2 + j * 2.4 / 21; if (z <= 0) balls.push([x, z]); }
      const bm = new THREE.InstancedMesh(new THREE.SphereGeometry(0.03, 10, 6), new THREE.MeshStandardMaterial({ color: 0xc7ccd3, metalness: 1, roughness: 0.22 }), balls.length);
      balls.forEach(([x, z], i) => { m4.makeTranslation(x, 1.06, z); bm.setMatrixAt(i, m4); }); upperG.add(bm);
    }
    mesh.frustumCulled = false;
    tipPos = new Float32Array(probes.length * 3); tipCol = new Float32Array(probes.length * 3);
    tipGeo.setAttribute('position', new THREE.BufferAttribute(tipPos, 3)); tipGeo.setAttribute('color', new THREE.BufferAttribute(tipCol, 3));
    tipPts.material.size = dense ? 0.07 : 0.12;
    card = { kind, probes, warpN, mesh, dense, per: kind === 'cant' ? 1 : 4 };
    U.uSet.value = 0; st.bent = 0; st.lift = 0;
  }

  /* ---------- pads under the card: a high-resolution decal that shows every scrub mark ---------- */
  const padTex = canvasTex(1024, 1024, () => {});
  const padMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: padTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, toneMapped: false }));
  padMesh.position.y = 0.003; chuckG.add(padMesh);
  let padInfo = null;
  function drawPads(L, c, withMarks) {                        // c = contact record from the model
    const g = padTex.userData.g, S = 1024; g.clearRect(0, 0, S, S);
    if (!card) return;
    const span = card.per === 1 ? 0.84 : 1.64, k = S / span, padW = card.dense ? 0.03 : 0.036, um = padW / L.pad;   // world units per μm on the pad
    for (let i = 0; i < card.probes.length; i++) {
      const [x, z] = card.probes[i], px = (x + span / 2) * k, pz = (z + span / 2) * k, pw = padW * k;
      g.fillStyle = card.dense ? '#c4a466' : '#c9d2de'; g.fillRect(px - pw / 2, pz - pw / 2, pw, pw);
      if (!withMarks || !c) continue;
      const od = c.aot - (L.plan + padInfo.flat) * card.warpN[i];
      if (od <= 0) continue;
      const len = (padInfo.slide(od) + padInfo.contact) * um * k, st0 = c.start * um * k, hh = Math.max(1.5, padInfo.contact * um * k * 0.5);
      const over = st0 + len > pw, side = card.kind === 'cant' ? card.probes[i][2] : 3;     // each cantilever tip scrubs toward the die centre
      g.fillStyle = over ? '#ff4d5a' : '#3a4150';
      g.save(); g.translate(px, pz); g.rotate([Math.PI / 2, Math.PI, -Math.PI / 2, 0][side]);
      g.fillRect(-pw / 2 + st0, -hh, len, hh * 2); g.restore();
    }
    padTex.needsUpdate = true;
  }

  /* ---------- particles ---------- */
  const PN = 900, pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN), pMax = new Float32Array(PN), pBase = new Float32Array(PN * 3), pGrav = new Float32Array(PN);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const parts = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.09, map: glowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  parts.frustumCulled = false; scene.add(parts);
  let pNext = 0;
  function burst(x, y, z, n, col, speed, life, grav = 3) {
    for (let i = 0; i < n; i++) {
      const j = pNext; pNext = (pNext + 1) % PN;
      const a = Math.random() * Math.PI * 2, e = Math.random() * 0.9 + 0.1, s = speed * (0.4 + Math.random() * 0.8);
      pPos[j * 3] = x; pPos[j * 3 + 1] = y; pPos[j * 3 + 2] = z;
      pVel[j * 3] = Math.cos(a) * s * (1 - e * 0.5); pVel[j * 3 + 1] = e * s; pVel[j * 3 + 2] = Math.sin(a) * s * (1 - e * 0.5);
      pBase[j * 3] = col[0]; pBase[j * 3 + 1] = col[1]; pBase[j * 3 + 2] = col[2];
      pLife[j] = pMax[j] = life * (0.6 + Math.random() * 0.7); pGrav[j] = grav;
    }
  }
  function stepParticles(dt) {
    for (let j = 0; j < PN; j++) {
      if (pLife[j] <= 0) { pCol[j * 3] = pCol[j * 3 + 1] = pCol[j * 3 + 2] = 0; continue; }
      pLife[j] -= dt; pVel[j * 3 + 1] -= pGrav[j] * dt;
      pPos[j * 3] += pVel[j * 3] * dt; pPos[j * 3 + 1] += pVel[j * 3 + 1] * dt; pPos[j * 3 + 2] += pVel[j * 3 + 2] * dt;
      const f = Math.max(0, pLife[j] / pMax[j]);
      pCol[j * 3] = pBase[j * 3] * f; pCol[j * 3 + 1] = pBase[j * 3 + 1] * f; pCol[j * 3 + 2] = pBase[j * 3 + 2] * f;
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
  }

  /* ---------- cleaning sheet ---------- */
  const cleanSheet = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.035, 2.0), new THREE.MeshStandardMaterial({ color: 0xd9d2c3, roughness: 0.95, emissive: 0x3a3426, emissiveIntensity: 0.4 }));
  cleanSheet.visible = false; scene.add(cleanSheet);

  /* ---------- state ---------- */
  const st = {
    t: 0, wx: 0, wz: 0, z: -GAP, bent: 0, lift: 0, liftT: 0, hot: 0, hotT: 0, shake: 0, flash: [0, 0, 0, 0], ab: 0,
    td: null, clean: null, cam: { r: 9, th: 0.6, ph: 1.2, tx: 0, ty: 0.4, tz: 0 }, camT: { r: 9, th: 0.6, ph: 1.2, tx: 0, ty: 0.4, tz: 0 }, sway: 1, warpUm: 0,
  };
  const SHOTS = {
    title: { r: 17, th: 0.7, ph: 1.05, tx: 0, ty: 0.3, tz: 0 },
    wide: { r: 15.5, th: 0.35, ph: 0.72, tx: 0, ty: 0, tz: 0.6 },
    cant: { r: 3.3, th: 0.4, ph: 1.34, tx: 0, ty: 0.22, tz: -0.1 },
    cobra: { r: 4.6, th: 0.42, ph: 1.3, tx: 0, ty: 0.45, tz: -0.2 },
    mems: { r: 4.6, th: 0.42, ph: 1.3, tx: 0, ty: 0.45, tz: -0.2 },
    closeup: { r: 2.6, th: 0.3, ph: 1.42, tx: 0, ty: 0.3, tz: -0.2 },
  };
  function setShot(name, snap = false) { Object.assign(st.camT, SHOTS[name] || SHOTS.wide); if (snap) Object.assign(st.cam, st.camT); }

  /** Play one touchdown. `out` is the record from model.step (or a fake one for a test touch). */
  function startTD(out, dur, L, info, cb = {}) {
    padInfo = info; st.homing = false;
    st.td = { out, dur, t: 0, L, cb, fromX: st.wx, fromZ: st.wz, toX: -out.site.cx, toZ: -out.site.cz, hit: false, done: false, painted: false };
    st.warpUm = L.plan + info.flat;
    padMesh.scale.setScalar(card.per === 1 ? 0.84 : 1.64);
    padMesh.position.set(out.site.cx, 0.003, out.site.cz);
    drawPads(L, out.c, false);
  }
  function startClean(dur, cb) { st.clean = { t: 0, dur, cb, n: 0 }; cleanSheet.visible = true; }
  function setLift(um) { st.liftT = um * UM * 0.35; }                          // how far the card has been pushed up by the load
  function setHot(v) { st.hotT = v; }
  function bend() { st.bent = 1; st.shake = 1; st.flash = [1, 0.15, 0.1, 0.55]; st.ab = 0.03; for (let i = 0; i < 6; i++) burst((Math.random() - 0.5) * 1.2, 0.2 + Math.random() * 0.4, -0.2 - Math.random() * 0.4, 28, [1, 0.35, 0.1], 2.4, 1.0); }
  function alarm() { st.shake = Math.max(st.shake, 0.5); st.flash = [1, 0.2, 0.15, 0.4]; }

  function update(dt) {
    st.t += dt;
    const td = st.td;
    if (td) {
      td.t += dt; const p = Math.min(1, td.t / td.dur), c = td.out.c;
      const q = ease5(p / 0.42);
      st.wx = lerp(td.fromX, td.toX, q); st.wz = lerp(td.fromZ, td.toZ, q);
      const blocked = td.out.ev.includes('alarm');
      const top = blocked ? Math.min(c.aot, 25) : c.aot;
      if (p < 0.42) st.z = -GAP; else if (p < 0.62) st.z = -GAP + GAP * (1 - Math.pow(1 - (p - 0.42) / 0.2, 3)); else if (p < 0.72) st.z = top * ease((p - 0.62) / 0.1); else if (p < 0.86) st.z = top; else st.z = top + (-GAP - top) * ease((p - 0.86) / 0.14);
      U.uTest.value = p >= 0.66 && p < 0.86 ? 1 : 0;
      if (!td.hit && p >= 0.66) {
        td.hit = true; drawPads(td.L, c, true);
        const n = td.dur < 0.15 ? 5 : 12, ev = td.out.ev;
        if (ev.includes('bend')) bend();
        else if (ev.includes('alarm')) alarm();
        else {
          burst(0, 0.04, card.kind === 'cant' ? 0 : -0.3, n, [0.35, 0.9, 1.0], 0.9, 0.35, 2);
          if (ev.includes('breach')) { burst(0.2, 0.04, -0.1, 26, [1, 0.3, 0.2], 1.8, 0.6); st.shake = Math.max(st.shake, 0.25); }
          if (ev.includes('crack')) { burst(-0.2, 0.04, -0.2, 22, [0.95, 0.35, 1.0], 1.6, 0.6); st.shake = Math.max(st.shake, 0.22); }
        }
        td.cb.onContact && td.cb.onContact(td.out);
      }
      if (!td.painted && p >= 0.86) { td.painted = true; td.cb.onResult && td.cb.onResult(td.out); }
      if (p >= 1 && !td.done) { td.done = true; st.td = null; td.cb.onDone && td.cb.onDone(td.out); }
    }
    if (st.homing && !td) { const kh = 1 - Math.exp(-dt * 3); st.wx -= st.wx * kh; st.wz -= st.wz * kh; if (Math.abs(st.wx) + Math.abs(st.wz) < 0.002) st.homing = false; }
    if (st.clean) {
      const cl = st.clean; cl.t += dt; const p = Math.min(1, cl.t / cl.dur);
      const inOut = p < 0.2 ? ease(p / 0.2) : p > 0.8 ? 1 - ease((p - 0.8) / 0.2) : 1;
      cleanSheet.position.set(lerp(3.2, 0, inOut), 0.02, card && card.kind === 'cant' ? 0 : -0.5);
      const dab = p > 0.2 && p < 0.8 ? Math.abs(Math.sin((p - 0.2) / 0.6 * Math.PI * 3)) : 0;
      st.z = lerp(-GAP, 40, dab); cleanSheet.position.y = st.z * UM + 0.02;
      const k = Math.floor((p - 0.2) / 0.2);
      if (p > 0.2 && p < 0.8 && k !== cl.n && dab > 0.9) { cl.n = k; burst(0, 0.08, -0.3, 16, [0.75, 0.72, 0.62], 0.9, 0.5, 1.5); cl.cb && cl.cb.onDab && cl.cb.onDab(); }
      if (p >= 1) { st.clean = null; cleanSheet.visible = false; st.z = -GAP; cl.cb && cl.cb.onDone && cl.cb.onDone(); }
    }
    // smooth secondary state
    const kf = 1 - Math.exp(-dt * 6);
    st.lift += (st.liftT - st.lift) * kf; st.hot += (st.hotT - st.hot) * (1 - Math.exp(-dt * 2));
    upperG.position.y = st.lift;
    chuckMat.emissiveIntensity = st.hot * 0.55; heatLight.intensity = st.hot * 9;
    U.uSet.value += (st.bent * 0.06 - U.uSet.value) * (1 - Math.exp(-dt * 10));
    const zW = st.z * UM;
    chuckG.position.set(st.wx, zW, st.wz);
    U.uZ.value = zW; U.uWarp.value = st.warpUm * UM;
    // tip glow
    if (card) {
      const testing = U.uTest.value > 0, fl = 0.7 + 0.3 * Math.sin(st.t * 40);
      for (let i = 0; i < card.probes.length; i++) {
        const [x, z] = card.probes[i], off = card.warpN[i] * st.warpUm * UM, l = Math.max(0, zW - off);
        tipPos[i * 3] = x; tipPos[i * 3 + 1] = off + l + 0.004; tipPos[i * 3 + 2] = z;
        let r = 0, g = 0, b = 0;
        if (testing && l > 0.0004) { r = 0.7 * fl; g = 1.6 * fl; b = 1.6 * fl; } else if (testing && st.z > 3) { r = 1.8; g = 0.3; b = 0.2; }
        tipCol[i * 3] = r; tipCol[i * 3 + 1] = g; tipCol[i * 3 + 2] = b;
      }
      tipGeo.attributes.position.needsUpdate = true; tipGeo.attributes.color.needsUpdate = true;
    }
    stepParticles(dt);
    // camera: spring toward the shot, gentle sway, shake
    const c = st.cam, t = st.camT, kc = 1 - Math.exp(-dt * 2.6);
    for (const key of ['r', 'th', 'ph', 'tx', 'ty', 'tz']) c[key] += (t[key] - c[key]) * kc;
    const th = c.th + Math.sin(st.t * 0.23) * 0.07 * st.sway, ph = c.ph + Math.sin(st.t * 0.17 + 1) * 0.025 * st.sway;
    st.shake *= Math.exp(-dt * 5);
    const sh = st.shake * 0.12;
    camera.position.set(c.tx + c.r * Math.sin(ph) * Math.sin(th) + (Math.random() - 0.5) * sh, c.ty + c.r * Math.cos(ph) + (Math.random() - 0.5) * sh, c.tz + c.r * Math.sin(ph) * Math.cos(th) + (Math.random() - 0.5) * sh);
    camera.lookAt(c.tx, c.ty, c.tz);
    st.flash[3] *= Math.exp(-dt * 3.5); st.ab *= Math.exp(-dt * 4);
    grade.uniforms.uTime.value = st.t % 100; grade.uniforms.uFlash.value.set(st.flash[0], st.flash[1], st.flash[2], st.flash[3]); grade.uniforms.uAb.value = st.ab;
  }
  function render() { if (useBloom) composer.render(); else renderer.render(scene, camera); }
  function resize() {
    const r = canvas.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return;
    renderer.setSize(r.width, r.height, false); composer.setSize(r.width, r.height);
    const a = r.width / r.height; camera.aspect = a;
    camera.fov = a >= 1.2 ? 34 : 2 * Math.atan(Math.tan(17 * Math.PI / 180) * 1.2 / a) * 180 / Math.PI;
    camera.updateProjectionMatrix();
  }
  return {
    buildCard, startTD, startClean, paintDie, clearDies, setShot, setLift, setHot, update, render, resize, burst,
    flash(r, g, b, a) { st.flash = [r, g, b, a]; }, shake(v) { st.shake = Math.max(st.shake, v); },
    setBloom(on) { useBloom = on; bloom.enabled = on; }, home() { st.homing = true; }, setSway(v) { st.sway = v; },
    resetWafer() { st.wx = st.wz = 0; st.z = -GAP; st.td = null; st.clean = null; cleanSheet.visible = false; clearDies(); padTex.userData.g.clearRect(0, 0, 1024, 1024); padTex.needsUpdate = true; },
    get busy() { return !!(st.td || st.clean); }, state: st, camera,
  };
}
