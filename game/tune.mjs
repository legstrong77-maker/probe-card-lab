// Balance check: play every level with a grid of recipes and print the scores.
//   node game/tune.mjs
import { LEVELS, createRun, step, score, soak, rework } from './model.js';

function play(L, card, rec, o = {}) {
  const run = createRun(L, card, o.seed || 1);
  if (o.rework) rework(run);
  if (o.soak) soak(run, o.soak);
  for (let g = 0; !run.done && g < 9000; g++) step(run, typeof rec === 'function' ? rec(run) : rec);
  return { run, sc: score(run) };
}
const cell = (r) => { const s = r.sc, x = r.run.sum; return `${String(s.score).padStart(3)}${'★'.repeat(s.stars).padEnd(3)}${x.bent ? 'B' : x.stopped ? 'A' : ' '}`; };
const detail = (r) => { const x = r.run.sum, s = r.sc; return `ship ${x.shipped}/${x.good} false ${x.falseFail} dmg ${x.damaged} cleans ${r.run.cleans} t ${Math.round(s.t)}s (budget ${r.run.L.budget}) pen c${s.cleanPen.toFixed(1)} t${s.timePen.toFixed(1)}`; };

for (const L of LEVELS) {
  console.log(`\n=== L${L.n} ${L.id}  (${L.cards.join(', ')}) ===`);
  const ods = []; for (let od = L.od[0]; od <= L.od[1]; od += L.od[1] > 200 ? 20 : 10) ods.push(od);
  const cleanDefault = L.clean ? 40 : 0;
  for (const card of L.cards) {
    console.log(`${card.padEnd(8)} OD:   ` + ods.map((o) => String(o).padStart(7)).join(''));
    console.log(`${''.padEnd(8)} score:` + ods.map((o) => cell(play(L, card, { od: o, clean: cleanDefault })).padStart(7)).join(''));
  }
  if (L.id === 'clean') {
    for (const c of [10, 15, 20, 30, 40, 50, 60, 80, 100, 150, 200]) { const r = play(L, 'cobra', { od: 75, clean: c }); console.log(`  clean every ${String(c).padStart(3)} -> ${cell(r)}  ${detail(r)}`); }
  }
  if (L.id === 'flat') {
    console.log('  with rework:    ' + ods.map((o) => cell(play(L, 'cobra', { od: o }, { rework: true })).padStart(7)).join(''));
    for (const o of [100, 110, 120]) console.log(`  OD ${o}: ${detail(play(L, 'cobra', { od: o }))}`);
    console.log(`  rework OD 80: ${detail(play(L, 'cobra', { od: 80 }, { rework: true }))}`);
  }
  if (L.id === 'pins') for (const [c, o] of [['cobraHP', 280], ['cobraHP', 320], ['mems', 200], ['mems', 260], ['mems', 300], ['mems', 360]]) { const r = play(L, c, { od: o }); console.log(`  ${c} POT ${o}: ${cell(r)} ${detail(r)} maxLoad ${r.run.log.maxLoad.toFixed(0)} odLast ${r.run.log.minOdLast.toFixed(0)}`); }
  if (L.id === 'hot') {
    for (const sk of [0, 30, 60, 90, 120, 180]) console.log(`  soak ${String(sk).padStart(3)}s: ` + [50, 60, 70, 76, 85, 100, 120].map((o) => `${o}:${cell(play(L, 'cobra', { od: o, clean: 45 }, { soak: sk }))}`).join('  '));
    const ramp = (run) => ({ od: 76 + 60 * (1 - run.warm), clean: 45 });   // a skilled player following the card as it warms
    const r = play(L, 'cobra', ramp); console.log(`  live ramp, no soak: ${cell(r)}  ${detail(r)}`);
    for (const c of [20, 30, 45, 60, 90, 200]) { const q = play(L, 'cobra', { od: 76, clean: c }, { soak: 70 }); console.log(`  soak 70 OD 76 clean ${String(c).padStart(3)}: ${cell(q)} ${detail(q)}`); }
  }
}

// levels 7 and 8 have their own levers (card, cleaning, current clamp, short screening)
{
  const L7 = LEVELS[6], L8 = LEVELS[7];
  const run2 = (L, card, rec) => play(L, card, rec);

console.log('=== L7 bump');
for (const card of L7.cards) for (const cl of [200, 60, 40, 25]) {
  console.log(card.padEnd(7), 'clean', String(cl).padStart(3), [20, 30, 40, 45, 50, 55, 60, 70, 80, 90, 100, 110].map((od) => `${od}:${cell(run2(L7, card, { od, clean: cl }))}`).join(' '));
}
const d2 = (r) => { const x = r.run.sum; return `ship ${x.shipped}/${x.good} ff ${x.falseFail} dmg ${x.damaged} cleans ${r.run.cleans} t ${Math.round(r.sc.t)} burnt ${r.run.burnt} inrush ${r.run.log.inrush} peak ${r.run.log.maxPeak.toFixed(2)}`; };
console.log('  detail mems 45/40:', d2(run2(L7, 'mems', { od: 45, clean: 40 })), '| LF 70/40:', d2(run2(L7, 'memsLF', { od: 70, clean: 40 })));
console.log('=== L8 amp');
for (const screen of [false, true]) for (const clamp of [180, 120, 100, 80]) {
  console.log('screen', screen ? 'Y' : 'N', 'clamp', String(clamp).padStart(3), [200, 100, 60, 40, 30, 20].map((cl) => `c${cl}:${cell(run2(L8, 'mems', { od: 60, clean: cl, clamp, screen }))}`).join(' '));
}
for (const [cl, clamp, screen] of [[200, 180, false], [200, 120, true], [40, 120, true], [60, 100, true], [30, 120, true]]) console.log(`  clean ${cl} clamp ${clamp} screen ${screen}:`, d2(run2(L8, 'mems', { od: 60, clean: cl, clamp, screen })));
console.log('  OD sweep (clean 40, clamp 120, screen):', [20, 30, 40, 50, 60, 70, 80, 90].map((od) => `${od}:${cell(run2(L8, 'mems', { od, clean: 40, clamp: 120, screen: true }))}`).join(' '));
}
