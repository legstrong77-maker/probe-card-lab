// Probe Card Lab — the game's words: briefings, lessons, and the after-action explanations.
// Reference numbers point into ../sources.js.

export const TEXT = {
  od: {
    tag: '過驅量的可用範圍',
    brief: '新卡上機。這是一張懸臂針卡，鋁墊 60 μm。把過驅量調到每支探針都壓穩，但別讓針痕刮出鋁墊，更別把針壓彎。',
    goal: '找到過驅量的可用範圍',
    lesson: '過驅量太小，最後碰到的探針壓不破鋁墊表面的氧化層，好晶粒會被誤判。太大，懸臂針的針痕會滑出鋁墊，再大針就彎了。業界常用 50–75 μm。',
    refs: [3, 4, 5],
  },
  pad: {
    tag: '小鋁墊要換針型',
    brief: '新產品的鋁墊只剩 40 μm。懸臂針每多壓一點，針尖就多滑一段。看看它還塞不塞得進去，或者換一張垂直針卡。',
    goal: '選對探針卡，再調過驅量',
    lesson: '懸臂針的針痕長度跟著過驅量增加，小鋁墊上能用的範圍很窄，對位稍有偏差就刮出去。垂直針的針痕主要是針尖本身的大小，幾乎不隨過驅量變長。',
    refs: [20, 15, 13],
  },
  clean: {
    tag: '清針間隔',
    brief: '這批要連測四片。每下一次針，針尖就多沾一點鋁屑，接觸電阻慢慢升高。決定多久清一次針：太久會誤判，太勤又浪費時間和針尖壽命。',
    goal: '找到最划算的清針間隔',
    lesson: '常見做法是每 50–100 次下針清一次，實際間隔要依產品調整。清太勤會拖慢產出、磨耗針尖，清太少則良率下滑。',
    refs: [29, 30],
  },
  flat: {
    tag: '平整度吃掉過驅量',
    brief: '這張卡的載板翹了 50 μm，遠超過約 25 μm 的平整度要求，翹起那一側的探針會晚碰到。你可以硬把過驅量加大，或把載板送回去整平，代價是 60 秒。',
    goal: '讓每支探針都碰到，又不壓傷鋁墊',
    lesson: '平整度吃掉的是過驅量的可用範圍：先碰到的探針已經壓得很深，最後碰到的才剛接觸。這就是載板和主板的平整度規格這麼嚴的原因。',
    refs: [4, 23, 17],
  },
  pins: {
    tag: '設定值不等於實際值',
    brief: 'AI 晶片的卡有十萬支探針。每支幾克，加起來就是幾百公斤，整張卡和機台都被壓到變形：你設定的過驅量，只有一部分真的壓到針上。載台最多承受 300 kgf。',
    goal: '讓實際過驅量夠，又不讓載台過載',
    lesson: '高針數卡上，實際過驅量可能只有設定值的一半，甚至更少。所以新一代探針把每針針壓降到 2 g 左右，主板和補強板也要夠硬、夠平。',
    refs: [25, 26, 24, 38],
  },
  hot: {
    tag: '高溫測試要預熱',
    brief: '車用晶片要在 125 °C 測。探針卡剛靠近熱載台時還是冷的，針尖離晶圓比較遠；熱起來之後會慢慢靠近。高溫下鋁墊也比較軟。預熱要花時間，不預熱就得邊跑邊修正。',
    goal: '冷卡、熱卡都要接觸得剛好',
    lesson: '探針卡從常溫到高溫，針尖高度可以變化數十微米，所以量產前要預熱。每次清針把載台移開，卡又會稍微變冷。',
    refs: [39, 40, 41, 37],
  },
};

const fmtR = (r) => !isFinite(r) ? '開路' : r >= 1000 ? (r / 1000).toFixed(1) + ' Ω' : Math.round(r) + ' mΩ';
export { fmtR };

/** One line of advice after a test touch: what the numbers mean, not what to set. */
export function advise(L, card, c) {
  if (c.overload) return { bad: true, zh: `總針壓 ${Math.round(c.load)} kgf，超過載台 ${L.loadLimit} kgf 上限，機台會拒絕下針。` };
  if (c.bend) return { bad: true, zh: `先碰到的探針要壓 ${Math.round(c.odFirst)} μm，超過這種探針的上限 ${card.limit} μm，會壓彎。` };
  if (c.odLast <= 0) return { bad: true, zh: `最後碰到的探針根本沒接觸（差 ${Math.round(-c.odLast)} μm）。` };
  if (c.breach) return { bad: true, zh: `先碰到的探針針痕 ${Math.round(c.markFirst)} μm，刮出 ${L.pad} μm 的鋁墊了。` };
  if (c.crackP > 0.02) return { bad: true, zh: `先碰到的探針壓了 ${Math.round(c.odFirst)} μm，鋁墊有壓傷的風險。` };
  if (c.rLast > 900) return { bad: true, zh: `最後碰到的探針只壓了 ${Math.round(c.odLast)} μm，接觸電阻 ${fmtR(c.rLast)}，會誤判。` };
  if (c.rLast > 500) return { bad: false, zh: `最後碰到的探針接觸電阻 ${fmtR(c.rLast)}，偏高，有誤判風險。` };
  return { bad: false, ok: true, zh: `接觸穩定：接觸電阻 ${fmtR(c.rLast)}，針痕 ${Math.round(c.markFirst)} μm 在鋁墊內。` };
}

/** Why the lot scored what it did. */
export function diagnose(run, sc, rec) {
  const { L, card, sum, log } = run, out = [];
  if (sum.bent) out.push({ bad: true, zh: `先碰到的探針被壓了 ${Math.round(log.maxOdFirst)} μm，超過上限 ${card.limit} μm，探針卡損壞、停機送修。` });
  if (sum.stopped) out.push({ bad: true, zh: `總針壓達 ${Math.round(log.maxLoad)} kgf，三次超過載台 ${L.loadLimit} kgf 上限，機台停機。這種針每支太用力了。` });
  if (sum.breach) out.push({ bad: true, zh: `${sum.breach} 顆晶粒的針痕刮出鋁墊。過驅量越大，針尖滑得越遠。` });
  if (sum.crack) out.push({ bad: true, zh: `${sum.crack} 顆晶粒的鋁墊被壓傷：先碰到的探針實際壓了 ${Math.round(log.maxOdFirst)} μm${L.thermal ? '，而且高溫下鋁墊比較軟' : ''}。` });
  if (sum.falseFail) {
    if (sum.opens) out.push({ bad: true, zh: `有 ${sum.opens} 次下針，最後碰到的探針完全沒接觸，整組晶粒被判成不良。` });
    else if (L.thermal && log.coldTd > 4 && log.minOdLast < 30) out.push({ bad: true, zh: `探針卡還冷的時候針尖離晶圓比較遠，前 ${log.coldTd} 次下針壓得不夠，${sum.falseFail} 顆好晶粒被誤判。` });
    else if (L.contam > 2 && log.maxR > 600) out.push({ bad: true, zh: `針尖沾黏讓接觸電阻升到 ${fmtR(log.maxR)}，${sum.falseFail} 顆好晶粒被誤判。清針間隔太長。` });
    else out.push({ bad: true, zh: `最後碰到的探針只壓了 ${Math.round(Math.max(0, log.minOdLast))} μm，接觸電阻偏高，${sum.falseFail} 顆好晶粒被誤判。` });
  }
  if (L.k && !sum.stopped && !sum.bent) out.push({ bad: false, zh: `設定 ${Math.round(rec.od)} μm，實際只壓到 ${Math.round(log.maxOdFirst)} μm（${Math.round(100 * log.maxOdFirst / Math.max(1, rec.od))}%）。其餘都被卡和機台的變形吃掉了。` });
  if (sc.cleanPen > 3) out.push({ bad: true, zh: `清了 ${run.cleans} 次針，耗掉的針尖壽命和時間都偏多。` });
  if (sc.over > 0) out.push({ bad: true, zh: `超時 ${Math.round(sc.over)} 秒${run.reworked ? '，重工整平花了 60 秒' : run.cleans > 5 ? '，清針太頻繁' : ''}。` });
  if (!out.some((x) => x.bad)) out.push({ bad: false, ok: true, zh: '所有好晶粒都正確測出，鋁墊和探針都完好。' });
  return out;
}

export const RANK = ['這批沒過，再試一次', '勉強過關', '過關，還能更好', '三顆星，漂亮'];
