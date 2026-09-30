# 探針卡拆解實驗室 · Probe Card Lab

**▶ Live：https://legstrong77-maker.github.io/probe-card-lab/**

**🎮 遊戲「找出它的極限」：https://legstrong77-maker.github.io/probe-card-lab/game/**

**成品測試板拆解實驗室（Final Test）：https://legstrong77-maker.github.io/probe-card-lab/ft/** · [說明與參考來源](ft/README.md)

這是一張在瀏覽器裡就能拆開的晶圓針測（CP）探針卡。

- **拆解**：從彈簧針塔一路拆到晶圓，每一層都有標籤。
- **訊號路徑**：追一條訊號，從測試機走到晶粒。
- **測試時間與快轉**：調整每次測試時間，或用 10×、60× 快轉看晶圓圖填滿。
- **剖開探針頭**：看兩片導板中間的垂直探針。
- **慢動作**：時間放慢到 1/10，看針尖刮過鋁墊。
- **比較**：同一過驅量下，懸臂針和垂直針的針壓、針痕、接觸電阻。
- **平整度與過驅量**：凍結時間，讓 MLO 載板翹曲，再加大過驅量，直到探針撐不住。

點右下角「▶ Guided tour」會跑一段有旁白的導覽，也可以自己拖滑桿、轉視角。

## 遊戲：找出它的極限

你是針測工程師，要調出一組設定：不誤判、不傷鋁墊、不壓壞探針，還要準時交貨。每關先「試針」看接觸情況，再開始量產，結算時才會揭露哪些好晶粒被誤判、哪些鋁墊受損。

| 關卡 | 要學的事 |
|---|---|
| 1 第一次下針 | 過驅量有可用範圍：太小會誤判，太大會刮出鋁墊、壓彎探針 |
| 2 鋁墊縮小了 | 懸臂針的針痕隨過驅量變長，小鋁墊要換垂直針 |
| 3 針尖髒了 | 清針間隔：太久會誤判，太勤浪費時間和針尖壽命 |
| 4 載板翹了 | 平整度會吃掉過驅量的可用範圍 |
| 5 十萬針 | 整張卡受力變形，設定的過驅量只有一部分壓到針上 |
| 6 高溫測試 | 探針卡升溫後針尖高度會變，量產前要預熱 |

配樂和音效全部用 Web Audio 即時合成，沒有音檔；關卡說明和重點的語音是 Gemini TTS。物理模型在 `game/model.js`，是不依賴瀏覽器的純函式，`node game/tune.mjs` 會掃過每一關所有設定的得分，用來調整難度。

A wafer-sort probe card you can take apart in the browser. It covers:

- exploding the stack
- tracing a signal from tester to die
- fast-forwarding time to watch the wafer map fill
- cutting the probe head open
- slowing time to 1/10
- comparing cantilever and vertical probes at the same overdrive
- warping the substrate and cranking the overdrive until something breaks

> 個人作品，示意用途。尺寸有放大、物理模型有簡化，所有數字都是業界通用的量級，不是任何產品或專案的實際規格，也不是官方資料。
> Personal, unofficial demo. Geometry is exaggerated, the physics is simplified, and every number is a generic, textbook-level value.

<!-- refs:start -->
## 參數依據與參考來源

這是示意模型：幾何尺寸有放大，物理是簡化公式。下面列出每個步驟和可調參數用的數值、公開資料裡的典型範圍，以及出處。所有來源都是公開文件；數字是業界通用量級，不是任何產品或專案的規格。

### 針測流程

1. **上片與對位（模擬器省略）**：晶圓從晶舟載入、做晶圓對位，再用上看／下看相機把探針對準鋁墊（PTPA）。 [3] [10]
2. **步進 INDEX**：載台在 XY 方向移到下一組晶粒。含 Z 軸上下，典型步進時間約 0.7 秒。 [2] [7]
3. **上升接觸 Z-UP**：載台抬升，直到探針第一次碰到鋁墊（first contact）。 [3] [10]
4. **過驅 OVERDRIVE**：接觸後再往上壓一段距離，補償探針高低差，並讓針尖刮破鋁墊表面的氧化層。 [3] [5] [20]
5. **電性測試 TEST**：訊號由測試機經彈簧針、主板、MLO 載板、探針到晶粒。測試時間通常遠大於移動時間。 [31] [34] [7]
6. **離開 RELEASE**：載台下降，晶粒依結果分 bin 記進晶圓圖，再換下一組。 [30] [2]
7. **清針與針痕檢查**：每隔數十到上百次下針，用清針片清掉針尖的沾黏物，並定期檢查針痕（PMI）。模擬器只做了計數和接觸電阻漂移。 [29] [30] [11]
8. **溫度（模擬器省略）**：量產常在 −55 °C 到 150–200 °C 之間測試，探針卡和機台都需要預熱。 [37]

### 可調參數對照

| 參數 | 模擬器用的值 | 公開資料的典型範圍 | 來源 |
|---|---|---|---|
| 過驅量 Overdrive | 0–200 μm，預設 75 μm；標示的常用範圍 50–100 μm | 懸臂針 25–100 μm，常用 50–75 μm；垂直針在鋁墊上約 75 μm；凸塊／銅柱可到 150–200 μm | [3] [4] [5] [17] [15] |
| 懸臂針針壓 | 0.06 gf/μm，75 μm 時約 4.5 gf（線性） | 鎢／鎢錸針 1.0–2.5 gf/mil，也就是 0.04–0.10 gf/μm | [4] [19] |
| 垂直針針壓 | Cobra 型挫曲針：75 μm 時約 4.5 gf，之後趨平 | Cobra／挫曲針在 75 μm 約 4.5–6.5 g；新一代 MEMS 垂直針只有 1–3 g | [12] [13] [14] [21] [24] |
| 針痕長度 | 懸臂 ≈ 0.22×OD＋6 μm（75 μm 時約 23 μm）；垂直 ≈ 0.05×OD＋10 μm（約 14 μm） | 懸臂 15–25 μm（文獻範圍 13–38 μm）；垂直 11–18 μm，主要是針尖本身的大小 | [20] [18] [16] [15] [13] |
| 鋁墊尺寸 | 60 μm | 打線鋁墊約 55–90 μm 見方 | [4] [13] [16] |
| 接觸電阻 CRES | 壓穩後約 0.1–0.3 Ω；過驅量太小時偏高 | 穩定值 < 0.25–0.3 Ω，規格常訂 < 1 Ω；過驅量超過約 25–60 μm 才會穩定 | [13] [17] [18] [6] |
| 過載上限（示意） | 懸臂 125 μm、垂直 170 μm | 懸臂針過驅量一般不超過 127 μm，否則針尖會損傷；挫曲針常用到 150 μm；MEMS 垂直針多限制在 100 μm。公開資料沒有實測的塑性變形門檻 | [22] [16] [14] [15] |
| 平整度 | 翹曲 0–100 μm，超過 25 μm 標為超標 | 探針平整度規格約 ≤25 μm 或 ±10–20 μm；受力或升溫後整張卡可再變形數十 μm | [4] [23] [17] [26] |
| 探針尺寸與材質 | 垂直針長約 5 mm；懸臂針為鎢錸 | Cobra／挫曲針長 4.3–6.4 mm、線徑 25–64 μm；鎢錸是最常見的懸臂針材料 | [13] [4] [22] |
| Z 分離距離 | 200 μm | 公開規格為 200–300 μm，量產機台由 recipe 設定 | [8] [9] |
| 每次移動時間 | 0.7 秒（步進 0.35＋上升 0.15＋過驅 0.08＋離開 0.12） | 典型步進時間 0.7 秒；工程機台 0.75–1.5 秒 | [7] [8] |
| 每次測試時間 | 0.2–60 秒，預設 1.5 秒（約 27 次／分）；另有 10×、60× 快轉 | 依產品從數秒到數分鐘，公開例子有 5 秒、10 秒、180 秒 | [1] [28] [7] |
| 同測顆數 | 每次下針 4 顆 | 大晶粒的 AI 處理器 x8–x16；一般邏輯可達 128 顆以上；DRAM 可以一次測完整片 | [27] [28] [1] |
| 清針間隔 | 每 100 次下針；接觸電阻隨次數緩慢升高（示意） | 常見做法是每 50–100 次清一次，實際間隔依產品調整 | [29] [30] |
| 探針數與總針壓 | 這張卡 224 針 | HPC 卡約 2 萬針、每針約 2 g；最新的卡超過 10 萬針，總針壓 170–280 kgf，接近載台約 300 kgf 的上限 | [24] [25] [26] |
| 晶圓與晶粒 | 300 mm 晶圓、約 18 mm 晶粒、157 顆 | 18 mm 晶粒、邊緣排除 3 mm 時約 170–180 顆毛晶粒（依標準公式推算） |  |
| 主板層數 | 標示「數十層」 | 公開的探針卡 PCB 例子為 42–76 層、厚 2.7–9.6 mm | [33] |
| 探針卡結構與 DIS | 彈簧針塔 → 補強板 → 主板 → MLO 載板 → 探針頭 → 晶圓 | 主板、（中介層）、空間轉換板、探針頭的組成與專利描述一致；補強板是機構件，不在訊號路徑上。DIS Tech 在 2024 年 5 月由 Technoprobe 自 Teradyne 收購 | [31] [32] [34] [35] [36] |

模擬器沒有做的部分：溫度、上片與對位、針痕檢查、探針磨耗與壽命（公開資料為 100 萬次以上）、電流承載能力，以及整張卡受力後的變形（高針數卡上，實際過驅量只有設定值的一部分）。溫度和整張卡的變形，在遊戲的第 5、6 關有簡化的版本。

### 遊戲加上的機制

| 機制 | 遊戲用的值 | 公開資料 | 來源 |
|---|---|---|---|
| 誤判 | 最後碰到的探針接觸電阻超過 0.5 Ω 開始有好晶粒被判成不良，1.3 Ω 以上約九成（示意） | 接觸電阻規格常訂 < 1 Ω；接觸電阻升高是針測誤判的主要來源 | [13] [18] [29] |
| 平整度 | 最後碰到的探針，實際過驅量 = 過驅量 − 平整度。一般關卡 10–15 μm；第 4 關載板再翹 50 μm，整平後 15 μm | 探針平整度規格約 ≤25 μm 或 ±10–20 μm | [4] [23] [17] |
| 小鋁墊（第 2 關） | 鋁墊 40 μm，對位誤差 ±4 μm | 50 μm 間距的產品，鋁墊只有 40 μm 上下；針痕要留在鋁墊內，懸臂針的可用範圍很窄 | [23] [15] [20] |
| 鋁墊壓傷 | Cobra 針實際過驅量 120 μm 以上、MEMS 針 88 μm 以上開始有機率壓傷；125 °C 時從 80 μm 起（示意） | 針痕面積隨過驅量變大；車用產品對針痕面積訂有上限，高溫下還有銲球脫落的風險。公開資料沒有通用的門檻值 | [15] [40] |
| 清針的代價 | 每次清針 12–15 秒，並扣 0.6 分代表針尖磨耗；每次下針讓接觸電阻升高 7–9 mΩ（比實際快，方便在幾片晶圓內看到效果） | 常見每 50–100 次清一次；公開例子：每 100 顆晶粒清一次，每次下針 25 下、過驅量 20 μm | [29] [30] [40] |
| 整張卡受力變形（第 5 關） | 10 萬針；總針壓每增加 1 kgf，卡與機台退讓 1 μm；載台上限 300 kgf | 4 萬針的卡，實際過驅量最好也只有設定值的一半左右；10 萬針的卡總針壓 170–280 kgf，接近載台約 300 kgf 的上限 | [38] [25] [26] [24] |
| 高溫漂移（第 6 關） | 125 °C；冷卡的針尖比熱卡遠 60 μm。升溫時間常數 60 秒，載台移開後以 120 秒冷卻（時間大幅壓縮） | 室溫到 90 °C，大面積探針卡的針尖高度可變化 50 μm；175 °C 下最好的卡約 15 μm。實際預熱：機台 2 小時、探針卡 10–15 分鐘。清針、換片把載台移開幾分鐘，針尖高度會再跑掉 | [39] [40] [41] |
| 重工整平（第 4 關） | 載板翹曲 50 → 15 μm，花 60 秒（示意） | 遊戲設計。實際上是把卡送回供應商重新整平，需要數天 |  |
| 計分 | 正確測出且沒受傷的好晶粒比例，再扣清針、超時和損壞的分數 | 遊戲設計，不是業界指標 |  |

### 參考文獻

1. [Wikipedia — Probe card](https://en.wikipedia.org/wiki/Probe_card)
2. [Wikipedia — Wafer testing](https://en.wikipedia.org/wiki/Wafer_testing)
3. [ITC / Cerprobe — Introduction to Probe Cards, SWTW 1998](http://www.swtest.org/swtw_library/1998proc/PDF/T2_itc1.pdf)
4. [Tektronix / Keithley — Probe Card Tutorial](https://www.tek.com/en/documents/whitepaper/probe-card-tutorial)
5. [Goldstein — Probe Cards Enable Wafer-level Test, Solid State Technology 2005](https://sst.semiconductor-digest.com/2005/12/probe-cards-enable-wafer-level-test/)
6. [Tunaboylu & Soydan — MEMS Technologies Enabling the Future Wafer Test Systems, IntechOpen 2018](https://www.intechopen.com/chapters/58798)
7. [Goel & Marinissen — On-Chip Test Infrastructure Design for Optimal Multi-Site Testing](https://arxiv.org/pdf/0710.4687)
8. [FormFactor — CM300xi data sheet](https://www.formfactor.com/download/cm300xi-data-sheet/?wpdmdl=3294)
9. [MPI — TS150 / TS200 / TS300 probe systems](https://www.mpi-corporation.com/ast/engineering-probe-systems/mpi-manual-probe-systems/mpi-ts150-ts200-ts300/)
10. [US10416228B2 (Tokyo Seimitsu) — Prober](https://patents.google.com/patent/US10416228B2/en)
11. [Tokyo Electron — Inspection Features, P-8 Prober Family, SWTW 1997](http://www.swtest.org/swtw_library/1997proc/PDF/tel8_ml.pdf)
12. [Vallauri et al. (Technoprobe) — TPEG MEMS vertical probes, SWTW 2012](https://www.swtest.org/swtw_library/2012proc/PDF/S05_04_Vallauri_SWTW2012.pdf)
13. [Mialhe et al. (K&S) — Cobra FP Probe Card, SWTW 2005](https://www.swtest.org/swtw_library/2005proc/PDF/S04_02_Mialhe.pdf)
14. [Lindsey et al. — How To Buckle Under Pressure, SWTW 2009](https://www.swtest.org/swtw_library/2009proc/PDF/S01_02_Lindsey_SWTW2009.pdf)
15. [Broz et al. (MJC) — Advanced Vertical Technologies for Low Damage Probing, SWTW 2017](https://www.swtest.org/swtw_library/2017proc/PDF/S07_01_Broz_SWTW2017R2.pdf)
16. [Sangiorgio & Vettori (Technoprobe) — TPEG Mantis, SWTW 2018](http://www.swtest.org/swtw_library/2018proc/PDF/S03_01_Vettori_SWTW2018.pdf)
17. [Yun & Vallauri (Technoprobe) — HBM microbump probing, SWTW 2017](https://www.swtest.org/swtw_library/2017proc/PDF/S03_01_Vallauri_SWTW2017.pdf)
18. [Bischoff et al. (TI / ITS / FormFactor) — SWTW 2012](https://www.swtest.org/swtw_library/2012proc/PDF/S02_02_Bischoff_SWTW2012.pdf)
19. [Doutre et al. — SWTW 2015](https://www.swtest.org/swtw_library/2015proc/PDF/S05_03_Doutre_SWTW2015R.pdf)
20. [US5773987A — cantilever probe scrub](https://patents.google.com/patent/US5773987A/en)
21. [US10996243B2 — vertical probe force curve](https://patents.google.com/patent/US10996243B2/en)
22. [Electronic Design — Wafer Testing with Tungsten and Tungsten-Rhenium Probe Needles](https://www.electronicdesign.com/home/article/21199980/wafer-testing-with-tungsten-and-tungsten-rhenium-probe-needles)
23. [Wolfe (TI / MJC) — 50 μm pitch vertical probing, SWTW 2009](https://www.swtest.org/swtw_library/2009proc/PDF/S08_02_Wolfe_SWTW2009.pdf)
24. [SemiEngineering — Delivering On Power During HPC Test, 2024](https://semiengineering.com/delivering-on-power-during-hpc-test/)
25. [Ghidoni et al. (Technoprobe / Advantest) — Towards Ultra-High Pin Count Probe Card, SWTest Asia 2024](https://www.swtestasia.org/2024proc/pdf/poster/P00_15_GHIDONI_SWTestAsia2024.pdf)
26. [Hsieh (MPI) — 100K+ Ultra High Pin Count Probe Card, SWTest Asia 2024](https://www.swtestasia.org/2024proc/pdf/T02_03_HSIEH_SWTestAsia2024.pdf)
27. [FormFactor — AI Processors (high-volume wafer test)](https://www.formfactor.com/applications/high-volume-test-on-wafer/ai-processors/)
28. [Dastmalchi, Heitzer & Harker — Advancing Probe Card Parallelism for SOC Devices, SWTest 2022](https://www.swtest.org/library/2022proc/pdf/M03_03_Dastmalchi_SWTest_2022F.pdf)
29. [SemiEngineering — Cleaning Up During IC Test](https://semiengineering.com/cleaning-up-during-ic-test/)
30. [Broz et al. — Probe Card Cleaning: A Short Tutorial, SWTW 2007](https://www.swtest.org/swtw_library/2007proc/PDF/T00_01_Broz_SWTW2007.pdf)
31. [US7217139B2 — Interconnect assembly for a probe card](https://patents.google.com/patent/US7217139B2/en)
32. [US11209463B2 (Technoprobe) — Probe card for a testing apparatus](https://patents.google.com/patent/US11209463B2/en)
33. [FICT — probe card PCB examples](https://www.fict-g.com/en/product/probe.html)
34. [DIS Tech — Our technologies](https://www.dis.tech/technologies-and-products/our-technologies)
35. [DIS Tech — company site](https://www.dis.tech/)
36. [Teradyne — Form 10-K, fiscal year 2024](https://www.sec.gov/Archives/edgar/data/97210/000095017025023784/ter-20241231.htm)
37. [KYEC — Wafer Probing service](https://www.kyec.com.tw/en/Service/wafer-probing)
38. [Huebner (FormFactor) — 40k Probes on 300mm: Another Step Towards 1 Touchdown DRAM Sort, SWTW 2008](https://www.formfactor.com/wp-content/uploads/S05_02_Huebner_SWTW2008.pdf)
39. [US8531202B2 — Probe card test apparatus and method](https://patents.google.com/patent/US8531202B2/en)
40. [Van Cauwenberghe (ON Semiconductor) — Wafer Probe Challenges for the Automotive Market, SWTW 2012](https://www.swtest.org/swtw_library/2012proc/PDF/S01_03_Cauwenberghe_SWTW2012.pdf)
41. [Sinsheimer & Buckholtz (Teradyne) — Wafer Sort at Extreme Temperatures, SWTW 2018](https://www.swtest.org/swtw_library/2018proc/PDF/P01_02_Buckholtz_SWTW2018.pdf)
<!-- refs:end -->

## 檔案

| 檔案 | 用途 |
|---|---|
| `index.html` | 整個模擬器（three.js，從 CDN 載入） |
| `narration.js`、`audio/` | 導覽旁白與時間軸（由 `narration.py` 產生） |
| `sources.js` | 每個參數的模擬值、公開資料的典型範圍和出處；網站的「參數依據」視窗和本頁的參考來源都由它產生（`python make_refs.py`） |
| `narration.py` | 用 Gemini 3.8 Flash Lite TTS（Kore）合成旁白，每句錄一次，用本機 faster-whisper 聽寫比對，念錯就重錄，挑錯字最少的一次。接著依句長拉長導覽時間軸，把聲音混進影片。API 金鑰從 `GEMINI_API_KEY` 或上層資料夾的 `.env` 讀取，不在 repo 裡 |
| `record.py` | 用無頭 Chromium 逐幀錄下導覽，輸出 1080p30 MP4 |
| `game/model.js` | 遊戲的物理與計分（純函式）；`game/tune.mjs` 用它掃描每關的得分分布 |
| `game/scene.js`、`game/audio.js` | 遊戲的 3D 場景，以及即時合成的配樂與音效 |
| `game/content.js`、`game/main.js` | 關卡文字與結算說明；畫面與流程 |
| `game/make_voice.py`、`game/voice/` | 由 `content.js` 的文字產生語音（與旁白同一套 Gemini TTS＋whisper 檢查） |

## 重新錄影片

```bash
pip install playwright google-genai faster-whisper pypinyin soundfile && playwright install chromium   # 也需要 ffmpeg、CUDA GPU（whisper 檢查）
# 沒有 Gemini 金鑰時：NARR_ENGINE=edge 改用 edge-tts
python narration.py tts   # 改了旁白才需要
python record.py          # -> build/silent.mp4 -> probe-card-lab.mp4（含旁白）
```

Built with Claude Opus 5.5.
