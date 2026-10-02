// Numeric sanity check of the MLO model:  node mlo/check.mjs
import * as M from './model.js';
const base = { tech: 'mlo', core: 'low', nTop: 6, nBot: 6, balance: 0, size: 100, reach: 25, comp: false, tComp: 125, pitch: 80, pad: 40, line: 10, space: 10, rows: 6 };
for (const [n, o] of [['low-CTE set, balanced', {}], ['conventional set', { core: 'std' }], ['conventional 20+C+20', { core: 'std', nTop: 20, nBot: 20 }], ['low-CTE 20+C+20', { nTop: 20, nBot: 20 }], ['copper +30% on top', { balance: 30 }], ['conv. copper +30%', { core: 'std', balance: 30 }], ['6+core+3', { nBot: 3 }], ['MLC', { tech: 'mlc' }]]) {
  const P = { ...base, ...o };
  console.log(n.padEnd(26), 'CTE', M.cteOf(P).toFixed(2), 'ppm/K | bow @25', M.bowAt(P, 25).toFixed(0), 'µm, @125', M.bowAt(P, 125).toFixed(0), 'µm | offset @125', M.offsetAt(P, 125).toFixed(1), '@150', M.offsetAt(P, 150).toFixed(1), 'µm | thick', M.laminate(P, 1).thick.toFixed(0));
}
for (const [p, l] of [[150, 20], [100, 15], [80, 12], [60, 10], [40, 8]]) { const P = { ...base, pitch: p, pad: 40, line: l, space: l }; const e = M.escape(P); console.log('pitch', p, 'L/S', l, '-> channels', e.n, 'rows/layer', e.perLayer, 'signal layers', e.signal, 'build-up per side', M.layersFor(P)); }
