// The journey bar shared by every page: wafer test → MLO → shipping tests → final test → SI/PI → game.
// Plain script, no dependencies: <script src="nav.js" defer></script> (or ../nav.js from a sub-page).
(function () {
  const base = (document.currentScript && document.currentScript.src.replace(/nav\.js(\?.*)?$/, '')) || './';
  const STEPS = [
    { id: 'lab', path: '', n: '1', zh: '探針卡', en: 'Probe card', d: '晶圓測試時，探針卡把測試機接到每一顆晶粒' },
    { id: 'mlo', path: 'mlo/', n: '2', zh: 'MLO 載板', en: 'Space transformer', d: '探針卡裡把細間距攤開到主板的多層有機載板' },
    { id: 'test', path: 'test/', n: '3', zh: '出貨測試', en: 'Test before shipping', d: '板子出貨前要過的六關測試' },
    { id: 'ft', path: 'ft/', n: '4', zh: '成品測試板', en: 'Final-test board', d: '封裝好的晶片在這片板子上做最後測試' },
    { id: 'si', path: 'si/', n: '5', zh: '訊號與電源', en: 'Signal & power', d: '厚板子上的高速訊號和大電流電源' },
    { id: 'game', path: 'game/', n: '🎮', zh: '遊戲', en: 'Game', d: '當一次針測工程師：調出不誤判的設定' },
  ];
  const here = (() => {
    const seg = location.pathname.replace(/index\.html$/, '').split('/').filter(Boolean).pop() || '';
    const s = STEPS.find((x) => x.path === seg + '/');
    return s ? s.id : 'lab';
  })();
  const css = `
.jny{display:flex;border:1px solid #273142;border-radius:9px;overflow:hidden;background:#0b1018;flex-shrink:0}
.jny a{flex:1 1 0;min-width:0;padding:6px 3px 5px;text-align:center;text-decoration:none;color:#566174;font:700 9.5px/1.1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:.5px;position:relative;transition:background .15s}
.jny a small{display:block;font:600 11.5px/1.25 Inter,"Noto Sans TC",system-ui,sans-serif;color:#aab4c3;margin-top:2px;letter-spacing:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jny a+a{border-left:1px solid #1b2330}
.jny a:hover{background:rgba(255,255,255,.04)}
.jny a.on{background:rgba(76,201,240,.15);color:#4cc9f0}
.jny a.on small{color:#eaf9ff}
.jny a.on::after{content:"";position:absolute;left:18%;right:18%;bottom:0;height:2px;background:#4cc9f0;border-radius:2px}
.jny-head{display:flex;justify-content:space-between;align-items:baseline;font:600 10.5px/1 "JetBrains Mono",ui-monospace,monospace;letter-spacing:2px;color:#4cc9f0;text-transform:uppercase;margin-bottom:-4px;flex-shrink:0}
.jny-head span{color:#566174;letter-spacing:.5px;text-transform:none;font:500 11px Inter,"Noto Sans TC",sans-serif}
.jny-next{display:inline-block;margin-top:10px;padding:10px 18px;border-radius:9px;border:1px solid #4cc9f0;background:rgba(76,201,240,.14);color:#d2f3ff;text-decoration:none;font:700 15px Inter,"Noto Sans TC",sans-serif;pointer-events:auto}
.jny-next small{display:block;font:500 11.5px Inter,sans-serif;color:#8fd8f5;margin-top:2px}
.jny-game{margin:16px 0 0;max-width:600px}
@media (max-width:560px){.jny a{padding:5px 1px 4px;font-size:8.5px}.jny a small{font-size:10px}.jny-next{font-size:13px;padding:8px 14px}}`;
  function build() {
    const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    const bar = document.createElement('nav'); bar.className = 'jny'; bar.setAttribute('aria-label', '從晶圓到出貨');
    bar.innerHTML = STEPS.map((s) => `<a href="${base}${s.path}" class="${s.id === here ? 'on' : ''}" title="${s.zh} · ${s.en}：${s.d}">${s.n}<small>${s.zh}</small></a>`).join('');
    const head = document.createElement('div'); head.className = 'jny-head';
    const cur = STEPS.find((s) => s.id === here);
    head.innerHTML = `從晶圓到出貨 · Journey <span>${cur.n === '🎮' ? '' : cur.n + ' / 5'}</span>`;
    const panel = document.getElementById('panel');
    if (panel) { panel.prepend(bar); panel.prepend(head); }
    else { const t = document.querySelector('#title .t-wrap'); if (t) { bar.classList.add('jny-game'); t.appendChild(bar); } }
    // "next stop" on the end card
    const end = document.getElementById('endcard');
    if (end) {
      const i = STEPS.findIndex((s) => s.id === here), nx = STEPS[(i + 1) % STEPS.length];
      const a = document.createElement('a'); a.className = 'jny-next'; a.href = base + nx.path;
      a.innerHTML = `下一站 ${nx.n === '🎮' ? '' : nx.n + ' '}${nx.zh} →<small>${nx.d}</small>`;
      a.addEventListener('click', (e) => e.stopPropagation());
      end.appendChild(a);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
