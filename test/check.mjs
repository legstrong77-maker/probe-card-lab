// Sanity check for the Test Lab models: node test/check.mjs
import { DEFAULTS, DEFECTS, STATIONS, coverage, fpReadR, FP, xrCNR, xrMu, metScan, netPaths } from './model.js';
const P = { ...DEFAULTS }, D = Object.fromEntries(DEFECTS.map((d) => [d.id, true]));
const cov = coverage(P, D);
console.log('defect'.padEnd(10), STATIONS.map((s) => s.short.padEnd(6)).join(''));
for (const d of DEFECTS) console.log(d.id.padEnd(10), cov.map((c) => (c.r[d.id].caught ? '  ✓   ' : '  ·   ')).join(''));
console.log('times s:', cov.map((c) => c.time.toFixed(0)).join(' / '));
console.log('guard on/off, good 10k reads', fpReadR(FP.nom, true).toFixed(1), fpReadR(FP.nom, false).toFixed(1), ' bad 11k reads', fpReadR(FP.wrong, true).toFixed(1));
for (const tol of [1, 2, 5, 12]) { const c = coverage({ ...P, fpTol: tol }, D)[1]; console.log(` tol ±${tol}%: wrongR caught ${c.r.wrongR.caught}, false calls ${c.falseCalls.toFixed(2)}`); }
for (const kV of [50, 60, 70, 90, 110, 130]) { const c = xrCNR(kV, 8, 0.35); const m = xrMu(kV); console.log(` ${kV} kV  E ${m.E.toFixed(0)} keV  Nb ${c.Nb.toFixed(1)}  contrast ${(c.contrast * 100).toFixed(0)}%  CNR ${c.cnr.toFixed(1)}`); }
for (const N of [3, 5, 7, 11, 15]) { const s = metScan(N, { warp: false }), w = metScan(N, { warp: true }); console.log(` grid ${N}: flat good ${s.flat.toFixed(1)} warp ${w.flat.toFixed(1)} tilt ${s.tilt.toFixed(1)}`); }
console.log(netPaths(P, D).map((p) => `${(p.w2 * 1e3).toFixed(0)}/${(p.w4 * 1e3).toFixed(2)}`).join('  '));
