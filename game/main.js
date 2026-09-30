// Probe Card Lab — the game: screens, the run loop, gauges, results.
import { LEVELS, CARDS, N, DIE, WR, DIES, dieC, valid, createRun, step, score, soak, rework, testTouch } from './model.js';
import { createStage, COLORS } from './scene.js';
import { createAudio } from './audio.js';
import { TEXT, advise, diagnose, fmtR, RANK } from './content.js';

const $ = (s) => document.querySelector(s);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const load = (k, d) => { try { return Object.assign(d, JSON.parse(localStorage.getItem(k) || '{}')); } catch { return d; } };
const lowPower = matchMedia('(max-width: 860px), (pointer: coarse)').matches;
const stage = createStage($('#gl'), { lowPower });
const audio = createAudio();
const VOICE = window.VOICE || {};
const progress = load('pcl-progress', { best: {} });
const UNLOCK = new URLSearchParams(location.search).has('unlock');
const G = { screen: 'title', L: null, cardId: null, rec: {}, run: null, running: false, paused: false, pending: false, speed: 1, tests: 3, reworkOn: false, flags: {}, token: 0 };

/* ---------------- screens ---------------- */
function show(name) {
  for (const s of ['title', 'brief', 'hud', 'result']) $('#' + s).classList.toggle('on', s === name);
  G.screen = name; window.scrollTo(0, 0);
  document.body.classList.toggle('play', name === 'hud'); stage.resize();
}
const stars = (n) => '★★★'.split('').map((c, i) => (i < n ? `<b>${c}</b>` : c)).join('');
function unlocked(i) { return UNLOCK || i === 0 || (progress.best[LEVELS[i - 1].id] || {}).stars >= 1; }
function renderLevels() {
  $('#levels').innerHTML = LEVELS.map((L, i) => {
    const b = progress.best[L.id];
    return `<button class="lv ${unlocked(i) ? '' : 'lock'}" data-i="${i}"><div class="n">LEVEL ${L.n}</div><div class="s">${stars(b ? b.stars : 0)}</div>
      <div class="z">${L.zh}</div><div class="e">${TEXT[L.id].tag}</div><div class="best">${b ? 'BEST ' + b.score : '&nbsp;'}</div></button>`;
  }).join('');
  document.querySelectorAll('.lv').forEach((el) => {
    el.addEventListener('click', () => { audio.play('confirm'); openBrief(LEVELS[+el.dataset.i]); });
    el.addEventListener('pointerenter', () => audio.play('tick'));
  });
}
function goTitle() {
  G.token++; G.running = false; hush(); audio.setMood('menu'); renderLevels(); show('title');
  stage.setShot('title'); stage.setSway(1); startAttract();
}
function openBrief(L) {
  G.L = L; const T = TEXT[L.id];
  $('#bNo').textContent = `LEVEL ${L.n} · ${T.tag}`; $('#bZh').textContent = L.zh; $('#bEn').textContent = L.en; $('#bText').textContent = T.brief;
  const chips = [`<span class="chip"><b>目標</b>${T.goal}</span>`, `<span class="chip"><b>晶圓</b>${L.wafers} 片</span>`, `<span class="chip"><b>時限</b>${L.budget} 秒</span>`];
  if (L.cards.length > 1) chips.push(`<span class="chip"><b>可選</b>${L.cards.map((c) => CARDS[c].zh).join('／')}</span>`);
  $('#bChips').innerHTML = chips.join('');
  show('brief'); audio.play('whoosh'); say('l' + L.n);
}

/* ---------------- voice + subtitles ---------------- */
let sayTimer = 0;
const heard = {};                                   // lessons already read out in this session
function say(...ids) {                              // the words are already on screen, so no subtitles
  clearTimeout(sayTimer);
  const [id, ...rest] = ids, v = VOICE[id]; if (!v) return;
  audio.say('voice/' + v.src);
  if (rest.length) sayTimer = setTimeout(() => say(...rest), (v.d + 0.45) * 1000);
}
function hush() { clearTimeout(sayTimer); audio.hush(); }
function toast(msg, kind = '') {
  const el = document.createElement('div'); el.className = 'toast ' + kind; el.textContent = msg; $('#toasts').appendChild(el);
  while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 2600);
}

/* ---------------- level setup ---------------- */
function kindOf(cardId) { return cardId === 'cobraHP' ? 'cobra' : cardId === 'memsLF' ? 'mems' : cardId; }
function enterLevel(L) {
  G.L = L; G.cardId = L.cards[0]; G.tests = 3; G.reworkOn = false; G.speed = 1;
  G.rec = { od: L.od[2], clean: L.clean ? L.clean[2] : 0, soak: L.soak ? L.soak[2] : 0, clamp: L.power ? L.power.clamp[2] : 0, screen: false };
  const T = TEXT[L.id];
  $('#hNo').textContent = 'L' + L.n; $('#hZh').textContent = L.zh; $('#hGoal').textContent = T.goal;
  // probe card choice
  $('#cards').innerHTML = L.cards.length > 1 ? L.cards.map((c) => `<button class="cardopt ${c === G.cardId ? 'on' : ''}" data-c="${c}"><b>${CARDS[c].zh}</b><small>${CARDS[c].note}</small></button>`).join('') : '';
  document.querySelectorAll('.cardopt').forEach((el) => el.addEventListener('click', () => {
    if (G.running) return; G.cardId = el.dataset.c; document.querySelectorAll('.cardopt').forEach((x) => x.classList.toggle('on', x === el)); audio.play('click'); newRun();
  }));
  // sliders
  const ctl = [];
  ctl.push(slider('od', '過驅量', '設定值', L.od[0], L.od[1], 1, (v) => v + ' μm'));
  if (L.clean) ctl.push(slider('clean', '清針間隔', '每幾次下針清一次', L.clean[0], L.clean[1], 5, (v) => '每 ' + v + ' 次'));
  if (L.soak) ctl.push(slider('soak', '預熱', '開始前先讓卡靠著熱載台', L.soak[0], L.soak[1], 5, (v) => v + ' 秒'));
  if (L.rework) ctl.push(`<div class="ctl"><button class="btn sm" id="reworkBtn" style="width:100%">送回整平載板（多花 ${L.rework.t} 秒）</button></div>`);
  if (L.power) {
    ctl.push(slider('clamp', '電流上限', `全速測試需要 ${L.power.need} A`, L.power.clamp[0], L.power.clamp[1], 5, (v) => v + ' A'));
    ctl.push(`<div class="ctl"><button class="btn sm" id="screenBtn" style="width:100%">先用低電壓篩短路（每次多 ${L.power.screenT} 秒）</button></div>`);
  }
  $('#ctls').innerHTML = ctl.join('');
  for (const k of ['od', 'clean', 'soak', 'clamp']) {
    const el = $('#s_' + k); if (!el) continue;
    const upd = () => { G.rec[k] = +el.value; $('#o_' + k).textContent = el._fmt(+el.value); el.style.setProperty('--p', ((el.value - el.min) / (el.max - el.min) * 100) + '%'); };
    el._fmt = SL[k]; el.value = G.rec[k]; upd();
    el.addEventListener('input', () => { upd(); audio.play('slide', { v: (el.value - el.min) / (el.max - el.min) }); if (!G.running) previewGauges(); });
  }
  if (L.rework) $('#reworkBtn').addEventListener('click', () => {
    if (G.running) return; G.reworkOn = !G.reworkOn; audio.play('click');
    $('#reworkBtn').classList.toggle('pri', G.reworkOn); $('#reworkBtn').textContent = G.reworkOn ? `✓ 已排入整平（+${L.rework.t} 秒）` : `送回整平載板（多花 ${L.rework.t} 秒）`;
  });
  if (L.power) $('#screenBtn').addEventListener('click', () => {
    G.rec.screen = !G.rec.screen; audio.play('click');
    $('#screenBtn').classList.toggle('pri', G.rec.screen); $('#screenBtn').textContent = G.rec.screen ? `✓ 先篩短路，再送全功率（+${L.power.screenT} 秒）` : `先用低電壓篩短路（每次多 ${L.power.screenT} 秒）`;
  });
  $('#gLoad').classList.toggle('hide', !L.loadLimit); $('#gDirt').classList.toggle('hide', !L.clean); $('#gWarm').classList.toggle('hide', !L.thermal); $('#gAmp').classList.toggle('hide', !L.power);
  $('#padsLbl').firstChild.textContent = L.bump ? '凸塊上的針痕' : '針痕';
  document.querySelectorAll('.speed .btn').forEach((b) => b.classList.toggle('on', b.dataset.sp === '1'));
  show('hud'); newRun(); audio.setMood('tune');
}
const SL = {};
function slider(k, zh, hint, min, max, stepv, fmt) {
  SL[k] = fmt;
  return `<div class="ctl"><div class="l"><span>${zh}<small>${hint}</small></span><output id="o_${k}"></output></div><input type="range" id="s_${k}" min="${min}" max="${max}" step="${stepv}"></div>`;
}
function info() { const c = CARDS[G.cardId]; return { flat: G.run.flat, slide: c.slide, contact: c.contact, force: c.force }; }
function newRun() {
  const L = G.L; G.token++; G.running = false; G.paused = false; G.pending = false; G.flags = {}; G.lastC = null;
  G.run = createRun(L, G.cardId, 1);
  stage.buildCard(kindOf(G.cardId), L); stage.resetWafer(); stage.setShot(kindOf(G.cardId)); stage.setSway(1);
  stage.setLift(0); stage.setHot(L.thermal ? 0.12 : 0);
  $('#runBtn').textContent = '▶ 開始量產'; $('#runBtn').className = 'btn go'; $('#testBtn').disabled = false; $('#testN').textContent = '×' + G.tests;
  $('#advice').className = 'advice'; $('#advice').textContent = '先按「試針」看看現在的接觸情況。';
  drawMap($('#map'), G.run.res, G.run.dmg, false, G.run.sites[0]); updateCounters(); updateTime(); previewGauges(true);
}

/* ---------------- gauges ---------------- */
function setGauge(id, txt, cls) { const o = $('#' + id + ' output'); o.textContent = txt; o.className = cls || ''; }
function previewGauges(blank) {
  const L = G.L, max = L.od[1], card = CARDS[G.cardId];
  $('#gOd .set').style.left = (G.rec.od / max * 100) + '%'; $('#gOd .lim').style.left = L.k ? '100%' : (card.limit / max * 100) + '%';
  if (blank || !G.lastC) { setGauge('gRes', '—'); $('#gRes .pin').style.left = '0%'; setGauge('gOd', G.rec.od + ' μm（設定）'); $('#gOd .band').style.width = '0%'; if (L.loadLimit) { setGauge('gLoad', '—'); $('#gLoad .pin').style.left = '0%'; } if (L.clean) setGauge('gDirt', '0 次'); if (L.power) { setGauge('gAmp', '—'); $('#gAmp .pin').style.left = '0%'; } if (L.thermal) { setGauge('gWarm', Math.round(G.run.warm * 100) + '%'); $('#gWarm .band').style.width = (G.run.warm * 100) + '%'; } drawPads(null); }
  else setGauge('gOd', G.rec.od + ' μm（設定）');
}
function updateGauges(c) {
  const L = G.L, run = G.run, max = L.od[1];
  G.lastC = c;
  const r = c.rLast, open = !isFinite(r);
  $('#gRes .pin').style.left = (open ? 100 : clamp((Math.log10(r) - 1.7) / 1.78, 0, 1) * 100) + '%';
  setGauge('gRes', fmtR(r), open || r > 1000 ? 'bad' : r > 500 ? 'warn' : 'ok');
  const lo = Math.max(0, c.odLast), hi = Math.max(0, c.odFirst);
  $('#gOd .band').style.left = (lo / max * 100) + '%'; $('#gOd .band').style.width = (Math.max(0.6, (hi - lo) / max * 100)) + '%';
  $('#gOd .set').style.left = (c.pot / max * 100) + '%';
  setGauge('gOd', `${Math.round(c.pot)} → ${Math.round(c.odLast)}～${Math.round(c.odFirst)} μm`, c.bend || c.odLast <= 0 ? 'bad' : c.breach || c.crackP > 0.02 ? 'warn' : '');
  if (L.loadLimit) { $('#gLoad .pin').style.left = clamp(c.load / (L.loadLimit / 0.75), 0, 1) * 100 + '%'; setGauge('gLoad', Math.round(c.load) + ' kgf', c.overload ? 'bad' : c.load > L.loadLimit * 0.9 ? 'warn' : ''); }
  if (L.clean) { const lim = G.rec.clean; $('#gDirt .band').style.width = clamp(run.sinceClean / lim, 0, 1) * 100 + '%'; setGauge('gDirt', run.sinceClean + ' 次', c.dirt > 400 ? 'bad' : c.dirt > 250 ? 'warn' : ''); }
  if (L.thermal) { $('#gWarm .band').style.width = (run.warm * 100) + '%'; setGauge('gWarm', Math.round(run.warm * 100) + '%', run.warm < 0.4 ? 'warn' : ''); }
  if (L.power) { $('#gAmp .pin').style.left = clamp(c.iPeak / (L.power.mac / 0.7), 0, 1) * 100 + '%'; setGauge('gAmp', `${c.iPeak.toFixed(2)} A${run.burnt ? ' · 燒 ' + run.burnt + ' 支' : ''}`, c.over > 1 || run.burnt ? 'bad' : c.over > 0.85 ? 'warn' : ''); }
  drawPads(c);
}
function drawPads(c) {
  const cv = $('#pads'), r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  { const pw = Math.round(r.width * d), ph = Math.round(r.height * d); if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; } }
  const g = cv.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, r.width, r.height);
  const L = G.L, card = CARDS[G.cardId], ps = Math.min(56, r.height - 6), k = ps / L.pad, gap = (r.width - 2 * ps) / 3;
  if (L.bump) {
    [c ? c.markFirst : 0, c ? c.markLast : 0].forEach((mark, i) => {
      const cx = gap + i * (ps + gap) + ps / 2, cy = r.height / 2, bad = mark / L.bump.d > L.bump.lim[0];
      const gr = g.createRadialGradient(cx - ps * 0.15, cy - ps * 0.15, 2, cx, cy, ps / 2); gr.addColorStop(0, '#e6ebf1'); gr.addColorStop(1, '#8f9aa8');
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, ps / 2, 0, Math.PI * 2); g.fill();
      g.setLineDash([3, 3]); g.strokeStyle = 'rgba(10,14,20,.55)'; g.lineWidth = 1; g.beginPath(); g.arc(cx, cy, ps / 4, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);      // the 50 % line
      if (mark > 0) { g.fillStyle = bad ? COLORS.fail : '#3d4552'; g.beginPath(); g.arc(cx, cy, mark * k / 2, 0, Math.PI * 2); g.fill(); }
      else if (c) { g.strokeStyle = COLORS.fail; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - 8, cy - 8); g.lineTo(cx + 8, cy + 8); g.moveTo(cx + 8, cy - 8); g.lineTo(cx - 8, cy + 8); g.stroke(); }
    });
    return;
  }
  [[c ? c.markFirst : 0, c && c.breach], [c ? c.markLast : 0, false]].forEach(([mark, bad], i) => {
    const x = gap + i * (ps + gap), y = (r.height - ps) / 2;
    g.fillStyle = '#9aa5b3'; g.fillRect(x, y, ps, ps);
    if (mark > 0) {
      const st = c.start * k, len = mark * k, hh = Math.max(2, card.contact * k / 2);
      g.fillStyle = '#3d4552'; g.beginPath(); g.roundRect(x + st, y + ps / 2 - hh, Math.min(len, ps - st + (bad ? 8 : 0)), hh * 2, hh); g.fill();
      if (bad) { g.fillStyle = COLORS.fail; g.fillRect(x + ps, y + ps / 2 - hh, Math.min(10, st + len - ps), hh * 2); }
    } else if (c) { g.strokeStyle = COLORS.fail; g.lineWidth = 2; g.beginPath(); g.moveTo(x + ps * 0.3, y + ps * 0.3); g.lineTo(x + ps * 0.7, y + ps * 0.7); g.moveTo(x + ps * 0.7, y + ps * 0.3); g.lineTo(x + ps * 0.3, y + ps * 0.7); g.stroke(); }
  });
}
function updateTime() {
  const run = G.run, L = G.L; $('#tmBar').style.width = clamp(run.t / L.budget, 0, 1) * 100 + '%';
  $('#tmTxt').textContent = `${Math.round(run.t)} / ${L.budget} s`; $('#tm').classList.toggle('over', run.t > L.budget);
}
function updateCounters() {
  const s = G.run.sum, tested = s.good + s.trueFail, pass = s.good - s.falseFail;
  $('#cTested').textContent = tested; $('#cYield').textContent = tested ? (pass / tested * 100).toFixed(1) + '%' : '—';
  $('#wNo').textContent = `${Math.min(G.run.wafer + 1, G.L.wafers)} / ${G.L.wafers}`;
}

/* ---------------- wafer map ---------------- */
function drawMap(cv, res, dmg, reveal, site) {
  const r = cv.getBoundingClientRect(), d = Math.min(devicePixelRatio || 1, 2);
  if (r.width < 2) return;
  { const px = Math.round(r.width * d); if (cv.width !== px || cv.height !== px) { cv.width = px; cv.height = px; } }
  const g = cv.getContext('2d'), w = r.width; g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, w);
  const k = (w - 6) / (2 * WR), c = w / 2, dp = DIE * k;
  g.fillStyle = '#121a27'; g.beginPath(); g.arc(c, c, WR * k, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#2a3648'; g.lineWidth = 1; g.stroke();
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const idx = j * N + i; if (!valid[idx]) continue;
    const x = c + (dieC(i) - DIE / 2) * k, y = c + (dieC(j) - DIE / 2) * k, v = res[idx];
    g.fillStyle = v === 0 ? COLORS.none : v === 1 ? COLORS.pass : reveal && v === 3 ? COLORS.falseFail : COLORS.fail;
    g.fillRect(x + 0.7, y + 0.7, dp - 1.4, dp - 1.4);
    if (reveal && dmg[idx]) { g.strokeStyle = COLORS.damaged; g.lineWidth = 2; g.strokeRect(x + 1.7, y + 1.7, dp - 3.4, dp - 3.4); g.fillStyle = COLORS.damaged; g.globalAlpha = 0.45; g.fillRect(x + 0.7, y + 0.7, dp - 1.4, dp - 1.4); g.globalAlpha = 1; }
  }
  if (site) { const per = CARDS[G.cardId].per === 1 ? 0.5 : 1; g.strokeStyle = '#4cc9f0'; g.lineWidth = 2; g.strokeRect(c + (site.cx - DIE * per) * k, c + (site.cz - DIE * per) * k, 2 * DIE * per * k, 2 * DIE * per * k); }
  g.fillStyle = '#04060a'; g.beginPath(); g.arc(c, c + WR * k, 4, 0, Math.PI * 2); g.fill();
}

/* ---------------- test touch ---------------- */
function doTest() {
  if (G.running || G.tests <= 0 || stage.busy) return;
  G.tests--; $('#testN').textContent = '×' + G.tests; if (G.tests <= 0) $('#testBtn').disabled = true;
  const L = G.L, run = G.run, c = testTouch(run, G.rec), ev = [];
  if (c.overload || c.bend) ev.push('alarm'); else { if (c.breach) ev.push('breach'); if (c.crackP > 0.1) ev.push('crack'); }
  audio.play('servo', { dur: 0.3 });
  stage.setHot(L.thermal ? 0.12 + 0.88 * run.warm : 0);
  stage.startTD({ site: run.sites[0], c, ev, dies: [] }, 1.0, L, info(), {
    onContact: () => {
      updateGauges(c); updateTime(); if (L.k) stage.setLift(c.pot - c.aot);
      if (ev.includes('alarm')) audio.play('alarm'); else { contactSound(c, run.sites[0], 1.0); if (c.breach) audio.play('breach'); else if (c.crackP > 0.1) audio.play('crack'); }
      if (L.power) { $('#gAmp .pin').style.left = clamp(c.iPeak / (L.power.mac / 0.7), 0, 1) * 100 + '%'; }
      const a = advise(L, CARDS[G.cardId], c); $('#advice').textContent = a.zh; $('#advice').className = 'advice ' + (a.bad ? 'bad' : a.ok ? 'ok' : '');
    },
  });
}
function contactSound(c, site, dur) {
  const r = c.rLast, q = !isFinite(r) ? 0 : 1 - clamp((r - 300) / 900, 0, 1);
  audio.play('contact', { q, note: Math.round((site.cx / WR * 0.5 + 0.5) * 9), fast: dur < 0.25, p: site.cx / WR * 0.6 });
}

/* ---------------- the production run ---------------- */
const tdDur = () => clamp(20 / G.run.total, 0.085, 0.32) / G.speed;
async function startRun() {
  if (G.running) { G.paused = !G.paused; $('#runBtn').textContent = G.paused ? '▶ 繼續' : '❚❚ 暫停'; audio.play('click'); if (!G.paused && G.pending) { G.pending = false; nextTD(); } return; }
  if (stage.busy) return;
  const L = G.L, run = G.run, tok = ++G.token;
  G.running = true; $('#runBtn').textContent = '❚❚ 暫停'; $('#runBtn').className = 'btn'; $('#testBtn').disabled = true;
  audio.play('start'); audio.setMood('run'); stage.setSway(0.6);
  if (G.reworkOn) { rework(run); toast(`載板送回整平，花了 ${L.rework.t} 秒`, 'info'); updateTime(); await wait(700); }
  if (L.soak && G.rec.soak > 0) { soak(run, G.rec.soak); stage.setHot(0.12 + 0.88 * run.warm); audio.play('soak'); toast(`預熱 ${G.rec.soak} 秒`, 'info'); updateTime(); previewGauges(true); await wait(1300); }
  if (tok !== G.token) return;
  nextTD();
}
function nextTD() {
  if (!G.running) return;
  if (G.paused) { G.pending = true; return; }
  const L = G.L, run = G.run, tok = G.token, out = step(run, G.rec);
  if (!out) return finish();
  const dur = tdDur(), site = out.site;
  const go = () => {
    if (tok !== G.token) return;
    if (dur >= 0.16) audio.play('servo', { dur: dur * 0.4, p: site.cx / WR * 0.6 });
    stage.setHot(L.thermal ? 0.12 + 0.88 * run.warm : 0);
    stage.startTD(out, dur, L, info(), { onContact, onResult, onDone: async () => {
      if (tok !== G.token) return;
      if (run.done) return finish();
      if (out.ev.includes('wafer')) { await wait(650 / G.speed); if (tok !== G.token) return; stage.clearDies(); drawMap($('#map'), run.res, run.dmg, false); }
      nextTD();
    } });
  };
  if (out.ev.includes('clean')) { once('clean', '🧽 清針：載台移開，針尖在清針片上磨幾下', 'info'); stage.startClean(Math.max(0.45, 0.9 / G.speed), { onDab: () => audio.play('clean'), onDone: go }); } else go();
}
function once(key, msg, kind) { if (G.flags[key]) return; G.flags[key] = 1; toast(msg, kind); }
let lastLoud = 0, lastTick = 0;
function onContact(out) {
  const c = out.c, L = G.L, now = performance.now(), dur = tdDur();
  updateGauges(c); updateTime(); if (L.k) stage.setLift(c.pot - c.aot);
  if (out.ev.includes('bend')) { audio.play('bend'); toast('✖ 探針被壓彎了，停機'); return; }
  if (out.ev.includes('burn')) { lastLoud = now; audio.play('burn'); once('burn', '⚠ 電源探針燒掉了', 'warn'); }
  if (out.ev.includes('dead')) { toast('✖ 燒掉太多探針，停機換針'); return; }
  if (out.ev.includes('alarm')) { audio.play('alarm'); toast(out.ev.includes('stop') ? '✖ 載台連續過載，機台停機' : '⚠ 載台過載，這次下針被拒絕', out.ev.includes('stop') ? '' : 'warn'); return; }
  if (now - lastTick > 72) { lastTick = now; contactSound(c, out.site, dur); }
  if (now - lastLoud > 380) {
    if (out.ev.includes('breach')) { lastLoud = now; audio.play('breach'); once('breach', '⚠ 針痕刮出鋁墊', 'warn'); }
    else if (out.ev.includes('crack')) { lastLoud = now; audio.play('crack'); once('crack', '⚠ 鋁墊被壓傷', 'warn'); }
    else if (out.ev.includes('squash')) { lastLoud = now; audio.play('crack'); once('squash', '⚠ 凸塊被壓出太大的針痕', 'warn'); }
  }
  if (out.ev.includes('open')) once('open', '⚠ 有探針沒碰到晶粒', 'warn');
}
function onResult(out) {
  let failed = false;
  for (const x of out.dies) { stage.paintDie(x.d, x.res === 1 ? 'pass' : 'fail'); if (x.res !== 1) failed = true; }
  if (failed && tdDur() >= 0.16) audio.play('fail', { p: out.site.cx / WR * 0.6 });
  const run = G.run;
  if (out.ev.includes('wafer')) {
    audio.play('wafer');
    if (!run.done) toast(`第 ${run.wafer} 片完成，換下一片`, 'info');
  }
  const last = run.hist.length && out.ev.includes('wafer') ? run.hist[run.hist.length - 1] : run;
  drawMap($('#map'), last.res, last.dmg, false, out.site); updateCounters();
}

/* ---------------- results ---------------- */
async function finish() {
  const run = G.run, L = G.L, sc = score(run), tok = ++G.token;
  const broke = run.sum.bent || run.sum.stopped || run.sum.dead;
  G.running = false; audio.setMood('result');
  if (broke) { await wait(1900); if (tok !== G.token) return; }      // stay on the card long enough to see what happened
  stage.home(); stage.setShot('wide'); stage.setSway(1.4);
  await wait(900); if (tok !== G.token) return;
  const last = (broke || !run.hist.length) ? { res: run.res, dmg: run.dmg } : run.hist[run.hist.length - 1];
  // reveal what really happened, on the wafer and on the map
  for (let d = 0; d < N * N; d++) { if (!valid[d] || !last.res[d]) continue; stage.paintDie(d, last.dmg[d] ? 'damaged' : last.res[d] === 3 ? 'falseFail' : last.res[d] === 1 ? 'pass' : 'fail'); }
  const T = TEXT[L.id], s = run.sum, best = progress.best[L.id];
  if (!best || sc.score > best.score) { progress.best[L.id] = { score: sc.score, stars: sc.stars }; try { localStorage.setItem('pcl-progress', JSON.stringify(progress)); } catch {} }
  $('#rNo').textContent = `LEVEL ${L.n} · ${L.zh}`; $('#rScore').textContent = '0'; $('#rStars').innerHTML = stars(0); $('#rRank').textContent = '';
  const rows = [['好晶粒正確測出', `${s.shipped} / ${broke ? '約 ' + Math.round(DIES * L.wafers * 0.955) : s.good}`, broke ? 'bad' : ''], ['好晶粒被誤判', s.falseFail, s.falseFail ? 'bad' : ''], [L.bump ? '凸塊受損' : '鋁墊受損', s.damaged, s.damaged ? 'bad' : '']];
  if (L.power) rows.push(['燒毀的探針', run.burnt + ' 支', run.burnt ? 'bad' : '']);
  if (L.clean) rows.push(['清針次數', run.cleans + ' 次', sc.cleanPen > 3 ? 'warn' : '']);
  rows.push(['花費時間', `${Math.round(sc.t)} / ${L.budget} 秒`, sc.over > 0 ? 'bad' : '']);
  if (s.bent || s.stopped || s.dead) rows.push(['探針卡／機台', s.bent ? '探針壓彎' : s.dead ? '停機換針' : '過載停機', 'bad']);
  $('#rRows').innerHTML = rows.map(([a, b, c]) => `<div class="rowx"><span>${a}</span><b class="${c || ''}">${b}</b></div>`).join('');
  $('#rWhy').innerHTML = diagnose(run, sc, G.rec).map((x) => `<li class="${x.ok ? 'good' : x.bad ? '' : 'fine'}">${x.zh}</li>`).join('');
  $('#rLesson').innerHTML = `<b>這關的重點</b>　${T.lesson} <span class="c">${T.refs.map((n) => `<a href="#" data-ref="${n}">[${n}]</a>`).join('')}</span>`;
  const i = LEVELS.indexOf(L), hasNext = i < LEVELS.length - 1 && (sc.stars >= 1 || unlocked(i + 1));
  $('#rNext').style.display = hasNext ? '' : 'none';
  show('result'); audio.play('reveal');
  drawMap($('#rmap'), last.res, last.dmg, false);
  await wait(1150); if (tok !== G.token) return;
  drawMap($('#rmap'), last.res, last.dmg, true);
  const t0 = performance.now(), D = 900;                       // count the score up
  await new Promise((res) => { (function tick() { if (tok !== G.token) return res(); const u = clamp((performance.now() - t0) / D, 0, 1), v = Math.round(sc.score * (1 - Math.pow(1 - u, 3))); if ($('#rScore').textContent !== String(v)) { $('#rScore').textContent = v; audio.play('count', { v: u }); } u < 1 ? requestAnimationFrame(tick) : res(); })(); });
  for (let k = 0; k < sc.stars; k++) { if (tok !== G.token) return; $('#rStars').innerHTML = stars(k + 1).replace(/<b>★<\/b>(?!.*<b>)/, '<b class="pop">★</b>'); audio.play('star', { i: k }); await wait(330); }
  if (tok !== G.token) return;
  $('#rRank').textContent = RANK[sc.stars]; audio.play(sc.stars ? 'win' : 'lose');
  await wait(sc.stars ? 900 : 500); if (tok !== G.token) return;
  if (heard[L.id]) say('res' + sc.stars); else { heard[L.id] = 1; say('res' + sc.stars, 'les' + L.n); }
}

/* ---------------- title background: a card quietly working ---------------- */
let attractRun = null;
function startAttract() {
  const L = LEVELS[2]; G.cardId = 'cobra'; attractRun = createRun(L, 'cobra', 3);
  stage.buildCard('cobra', L); stage.resetWafer(); stage.setHot(0); stage.setLift(0);
  const tok = G.token, r = attractRun;
  (function loop() {
    if (tok !== G.token || G.screen === 'hud' || G.screen === 'result') return;
    if (r.done) return startAttract();
    const out = step(r, { od: 75, clean: 0 });
    stage.startTD(out, 0.55, L, { flat: 0, slide: CARDS.cobra.slide, contact: CARDS.cobra.contact }, {
      onResult: (o) => { for (const x of o.dies) stage.paintDie(x.d, x.res === 1 ? 'pass' : 'fail'); if (o.ev.includes('wafer')) setTimeout(() => stage.clearDies(), 300); },
      onDone: () => setTimeout(loop, 60),
    });
  })();
}

/* ---------------- references panel ---------------- */
const SRC = window.SOURCES;
function openRefs(n) {
  if (!SRC) return;
  const cite = (r) => (r.length ? `<span class="c">${r.map((k) => `<a href="#ref-${k}">[${k}]</a>`).join('')}</span>` : '');
  $('#refsBox').innerHTML = `<button class="btn sm x" id="refsClose">✕ 關閉</button><h2>參數依據與參考來源</h2><p>${SRC.intro}</p>
    <h3>遊戲裡的機制</h3><div class="tbl"><table><tr><th>機制</th><th>遊戲用的值</th><th>公開資料</th><th>來源</th></tr>${(SRC.game || []).map((x) => `<tr><td>${x.p}</td><td class="sim">${x.sim}</td><td class="real">${x.real}</td><td>${cite(x.r)}</td></tr>`).join('')}</table></div>
    <h3>針測流程</h3><ol>${SRC.steps.map((x) => `<li><b style="color:var(--text)">${x.zh}</b>　${x.d} ${cite(x.r)}</li>`).join('')}</ol>
    <h3>參數對照</h3><div class="tbl"><table><tr><th>參數</th><th>模擬器用的值</th><th>公開資料的典型範圍</th><th>來源</th></tr>${SRC.params.map((x) => `<tr><td>${x.p}</td><td class="sim">${x.sim}</td><td class="real">${x.real}</td><td>${cite(x.r)}</td></tr>`).join('')}</table></div>
    <h3>參考文獻</h3><ol>${SRC.refs.map((x, i) => `<li id="ref-${i + 1}"><a href="${x.u}" target="_blank" rel="noopener">${x.t}</a></li>`).join('')}</ol>`;
  $('#refs').classList.add('open'); $('#refs').scrollTop = 0;
  $('#refsClose').addEventListener('click', () => $('#refs').classList.remove('open'));
  if (n) setTimeout(() => jumpRef(n), 50);
}
function jumpRef(n) { const li = $('#ref-' + n); if (!li) return; li.scrollIntoView({ block: 'center' }); li.style.background = 'rgba(76,201,240,.18)'; setTimeout(() => (li.style.background = ''), 1800); }
$('#refs').addEventListener('click', (e) => { if (e.target.id === 'refs') $('#refs').classList.remove('open'); const a = e.target.closest('a[href^="#ref-"]'); if (a) { e.preventDefault(); jumpRef(a.getAttribute('href').slice(5)); } });
$('#rLesson').addEventListener('click', (e) => { const a = e.target.closest('a[data-ref]'); if (a) { e.preventDefault(); openRefs(+a.dataset.ref); } });
$('#srcLink').addEventListener('click', (e) => { e.preventDefault(); openRefs(); });

/* ---------------- wiring ---------------- */
function bind(sel, fn, snd = 'click') { $(sel).addEventListener('click', (e) => { if (snd) audio.play(snd); fn(e); }); }
bind('#startBtn', () => { const i = LEVELS.findIndex((L, k) => unlocked(k) && !((progress.best[L.id] || {}).stars >= 1)); openBrief(LEVELS[i < 0 ? 0 : i]); }, 'confirm');
bind('#bBack', goTitle, 'back'); bind('#bGo', () => { hush(); enterLevel(G.L); }, 'confirm');
bind('#menuBtn', goTitle, 'back'); bind('#rMenu', goTitle, 'back');
bind('#rRetry', () => { hush(); enterLevel(G.L); }, 'confirm');
bind('#rNext', () => { hush(); openBrief(LEVELS[LEVELS.indexOf(G.L) + 1]); }, 'confirm');
bind('#testBtn', doTest); bind('#runBtn', startRun, null);
document.querySelectorAll('.speed .btn').forEach((b) => b.addEventListener('click', () => { G.speed = +b.dataset.sp; document.querySelectorAll('.speed .btn').forEach((x) => x.classList.toggle('on', x === b)); audio.play('tick'); }));
function setMute(m) { audio.set('mute', m); $('#muteBtn').textContent = m ? '🔇' : '🔊'; $('#soundBtn').textContent = m ? '🔇 聲音關' : '🔊 聲音開'; }
$('#muteBtn').addEventListener('click', () => setMute(!audio.vol.mute)); $('#soundBtn').addEventListener('click', () => setMute(!audio.vol.mute));
setMute(!!audio.vol.mute);
window.addEventListener('pointerdown', () => audio.unlock(), { once: false, passive: true });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#refs').classList.remove('open'); });
window.addEventListener('resize', () => { stage.resize(); if (G.screen === 'hud' && G.run) { drawMap($('#map'), G.run.res, G.run.dmg, false); drawPads(G.lastC); } });

/* ---------------- main loop ---------------- */
let last = performance.now(), warned = false;
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  try { stage.update(dt); stage.render(); } catch (e) { if (!warned) { warned = true; console.error(e); } }
  requestAnimationFrame(loop);
}
stage.resize(); stage.setShot('title', true); renderLevels(); startAttract();
requestAnimationFrame(loop);
setTimeout(() => ($('#loading').style.opacity = 0), 400);
// hooks for automated checks
window.__game = { G, LEVELS, stage, audio, enter: (i) => enterLevel(LEVELS[i]), set: (o) => { for (const k in o) { G.rec[k] = o[k]; const el = $('#s_' + k); if (el) { el.value = o[k]; el.dispatchEvent(new Event('input')); } } }, test: doTest, run: startRun, card: (c) => { const el = document.querySelector(`.cardopt[data-c="${c}"]`); if (el) el.click(); } };
