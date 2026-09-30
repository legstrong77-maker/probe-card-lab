// Numeric sanity check of the model against the published examples:  node si/check.mjs
import * as M from './model.js';
const line = (...a) => console.log(...a);
line('Stub resonance (Dk 3.65, via factor 1.69 -> Dk_eff 6.16):');
for (const mil of [50, 100, 250, 270]) line(`  ${mil} mil -> ${M.stubF0(mil * 0.0254, 3.65).toFixed(1)} GHz`);
line('  published: 270 mil -> about 4.4 GHz; a 100 mil stub measured a little over 10 GHz');
line('Loss per inch at 16 GHz, 6 mil trace, smooth copper:');
for (const m of M.MATERIALS) { const [c, d] = M.lossPerInch(16, m, 6, false); line(`  ${m.name.padEnd(13)} ${(c + d).toFixed(2)} dB  (copper ${c.toFixed(2)}, laminate ${d.toFixed(2)})`); }
line('  published table at 16 GHz: FR4 1.29-1.84 dB, Megtron 6 0.34 dB (with Df 0.002)');
const S = { th: 6.4, depth: 0.3, drill1: false, drill2: false, len: 25, w: 6, rough: false, mat: M.MATERIALS[0], eq: false };
line('Eye height / width, 25 cm lane in a 6.4 mm board:');
for (const r of M.RATES) {
  const cell = (o) => { const e = M.eye({ ...S, ...o }, r); return `${(M.lossDb(M.nyquistOf(r), { ...S, ...o, eq: false })).toFixed(1).padStart(5)} dB ${String(Math.round(e.height * 100)).padStart(3)}% ${e.width.toFixed(2)} UI`; };
  line(`  ${r.name.padEnd(9)} FR-4 with stubs: ${cell({})} | back-drilled: ${cell({ drill1: true, drill2: true })} | + Megtron 7: ${cell({ drill1: true, drill2: true, mat: M.MATERIALS[4] })} | + EQ: ${cell({ drill1: true, drill2: true, mat: M.MATERIALS[4], eq: true })}`);
}
const P = { vdd: 0.8, ripple: 3, imax: 200, rise: 100e-9, bulk: 20, mid: 40, hf: 100, pins: 250, planes: 6, sense: 2 };
line('Power rail:');
for (const [name, o] of [['default, 200 A', {}], ['bulk 160, pins 2000, mid 300, hf 800', { bulk: 160, pins: 2000, mid: 300, hf: 800 }], ['same at 1000 A', { imax: 1000, bulk: 160, pins: 2000, mid: 300, hf: 800 }], ['same, no remote sense', { bulk: 160, pins: 2000, mid: 300, hf: 800, sense: 0 }]]) {
  const Q = { ...P, ...o }, zc = M.zCurve(Q), d = M.droop(Q); let zm = zc[0], dm = d[0]; for (const x of zc) if (x.z > zm.z) zm = x; for (const x of d) if (x.v < dm.v) dm = x;
  line(`  ${name.padEnd(38)} target ${(M.zTarget(Q) * 1e6).toFixed(0).padStart(3)} uOhm | worst ${(zm.z * 1e6).toFixed(0).padStart(4)} uOhm at ${zm.f.toExponential(1)} Hz | droop ${(dm.v * 1e3).toFixed(1)} mV (allowed ${(Q.vdd * Q.ripple * 10).toFixed(0)}) | settles at ${(d[d.length - 1].v * 1e3).toFixed(1)} mV`);
}
