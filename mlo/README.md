# MLO 載板實驗室 · MLO Lab

**▶ Live：https://legstrong77-maker.github.io/probe-card-lab/mlo/**

探針卡裡，探針和主板中間夾著一片多層有機載板（MLO，也叫空間轉換板）。上面接幾十微米間距的探針，下面接一毫米間距的錫球。這一頁把它拆開來看。

**扇出**

- 調探針間距、線寬線距、孔墊大小和要拉出的排數，看每一層能拉出幾排、總共要幾層訊號層。
- 拉不出來的接點會變紅。打開「訊號路徑」，可以看一條訊號從探針一路穿過微孔、核心通孔，走到底下的錫球。

**製程**

- 「拆解」把每一層分開；「剖開」切開看裡面的微孔和通孔。
- 「看它怎麼做」從核心板開始，一層一層跑一遍增層製程：壓膜、雷射鑽孔、除膠渣、化學銅、光阻、電鍍、去光阻、蝕刻。

**熱與翹曲**

- 拉高測試溫度：載板膨脹得比矽多，離中心越遠的探針偏得越多，超過容許範圍的探針會變紅。可以切換低膨脹材料、一般材料和陶瓷 MLC 比較，或把探針圖案先依 125 °C 縮放。
- 調上下兩面的銅量差或上下層數，用層疊理論算出整片會翹多少。

點「▶ Guided tour」會跑一段有旁白的導覽。

Take a probe card's multilayer organic space transformer apart: fan-out from an 80 µm probe pitch to 1 mm solder balls, the semi-additive build-up process layer by layer, and what heat and copper imbalance do to probe position and flatness.

> 個人作品，示意用途。幾何尺寸有放大，物理用的是一階公式（層疊理論、熱膨脹、簡化的走線規則）；數字是公開資料裡的業界通用量級，不是任何產品或專案的規格，也不是官方資料。
> Personal, unofficial demo. Geometry is exaggerated and the physics is first order; the numbers are typical public values, not any product's specification.

<!-- refs:start -->
## 參數依據與參考來源

這是示意模型：幾何尺寸有放大，物理是一階公式。下面列出 MLO 的製程、每個參數用的值、公開資料裡的數字和出處。所有來源都是公開文件；數字是業界通用量級，不是任何產品或專案的規格。

### MLO 是怎麼做出來的

1. **核心板**：核心板先鑽孔、電鍍通孔，再做出兩面的線路。核心板本身也可以是多層板（例如中間 18 層、30 層）。 [20] [24] [3] [5]
2. **壓合增層膜**：把增層膜真空壓合在核心板兩面，最後的壓合溫度 160–180 °C，再以 180–190 °C 熟化約 90 分鐘。增層膜沒有玻纖布，雷射比較好鑽。 [21] [13]
3. **雷射鑽孔**：用 CO2 或 UV 雷射鑽出盲孔，停在下一層的銅墊上；40 μm 以下的孔要用 UV 雷射。 [20]
4. **除膠渣**：用過錳酸鹽把孔底的殘膠清掉，順便把表面咬粗，讓銅抓得住。 [13] [22]
5. **化學銅**：整面長一層 0.25–1 μm 的化學銅，當作電鍍的晶種。 [35] [22]
6. **光阻與曝光**：貼乾膜光阻、曝光顯影，只露出要長線路的地方；細線路常用雷射直接成像。 [20] [23]
7. **電鍍銅**：圖形電鍍把線路長到約 18–20 μm，同時把微孔填滿。 [23]
8. **去光阻、快速蝕刻**：去掉光阻，再把露出來的薄晶種銅蝕刻掉（約 2–3 μm），線路就分開了。每一層重複一次，孔可以一層一層疊上去。 [22] [23] [24]
9. **收尾與檢查**：防焊、表面處理（例如化鎳鈀浸金：鎳 3–6 μm、鈀 0.05–0.30 μm、金 0.03–0.07 μm）、電性測試、量翹曲。探針接觸的接點會鍍鎳金。 [34] [2] [25]

### 可調參數對照

| 參數 | 這一頁用的值 | 公開資料 | 來源 |
|---|---|---|---|
| 探針側間距 | 40–200 μm，預設 80 μm | 公開路線圖：80 μm 為主流、45 μm 已開發、30 μm 開發中；公開的探針卡最小到 40 μm | [3] [32] [30] |
| 主板側間距 | 1.0 mm | 2002 年的 MLO 錫球間距由 1.27 mm 走向 1.0、0.8、0.6 mm；也有 250 μm 轉到 1000 μm 的例子 | [2] [5] |
| 線寬／線距 | 5–30 μm，預設 12 μm | 公開的分級：SAP 30/30、20/20 μm，薄膜重佈線 5/5 μm；封裝載板量產約 10/10 μm，目標 5/5 μm | [4] [22] [24] |
| 孔墊直徑 | 20–80 μm，預設 30 μm | CO2 雷射孔 25 μm 配孔墊 50 μm；UV 雷射孔 15 μm 配孔墊 30 μm。80 μm 間距的探針卡載板：雷射孔 40 μm、增層厚 30 μm | [4] [3] |
| 走線規則 | 兩個孔墊之間可走 n 條線，n = ⌊(間距 − 孔墊 − 線距) ÷ (線寬 + 線距)⌋；每層拉出 n + 1 排（示意） | 公開表格的數字符合這條規則：不走線時最小間距 = 孔墊 + 線距；走一條線 = 孔墊 + 線寬 + 2 × 線距。BGA 外圈兩排可以直接在表層拉出，往內每多一層訊號層再拉出兩排 | [4] [29] |
| 層數 | 上下各 2–12 層，預設 6+核心+6 | 公開的演進：6-2-6（2006）→ 7-24-7（2015）→ 20-18-20（2024），中間的數字是核心層數；也有 12+30+12 的寫法 | [3] [5] |
| 厚度 | 增層膜 30 μm、每層銅 15 μm（示意）、核心 1.4 mm；6+核心+6 約 2.0 mm | 空間轉換板一般 0.5–3 mm；公開的 100 × 100 mm 測試載板厚 3 mm，傳統核心 1.4 mm | [10] [3] |
| 材料（一般） | 增層膜 39 ppm／5 GPa、核心 14 ppm／26.5 GPa、銅 16.5 ppm／130 GPa | 公開的探針卡載板材料；增層膜例：GX92 為 39 ppm、5 GPa；純銅手冊值 16.9 ppm、約 117 GPa | [3] [13] [18] |
| 材料（低膨脹） | 增層膜 20 ppm／13 GPa、核心 6 ppm／34 GPa | 公開的低膨脹組；增層膜例：GL 為 20 ppm、13 GPa。公開的核心板材從 14 ppm 到 0.5 ppm 都有 | [3] [13] [15] [16] |
| 整片的熱膨脹係數 | 用層疊理論算：一般組約 15.7 ppm/K、低膨脹組約 9.7 ppm/K | 公開實測：1.4 mm 核心的整片約 15.5 ppm/K，2.0 mm 核心約 12.5 ppm/K | [3] [27] |
| 陶瓷 MLC | 3.4 ppm/K | 低溫共燒陶瓷 3.4 ppm/K；氧化鋁 7.1；探針卡用陶瓷 4.7；另一家 3.6–4.4。2002 年的例子：訂製陶瓷要等三個月、貴上百倍；2025 年的公開簡報把多層有機列為探針載板的首選 | [17] [36] [7] [2] [31] |
| 矽 | 2.6 ppm/K | 2.6 × 10⁻⁶ /°C | [19] |
| 探針偏移 | 偏移 = (載板 − 矽) 的熱膨脹係數差 × 溫差 × 離中心距離；預設最遠 25 mm | 公開實測：25 → 150 °C，離中心 25 mm 處接點移動 48 μm（15.5 ppm）、39 μm（12.5 ppm）。實際載板比晶圓涼（實測約 86 °C 對 150 °C），本頁假設同溫，會高估 | [3] [6] |
| 容許偏移 | ±12.5 μm | 公開的針痕位置檢查上限：常溫 ±7.5 μm，高溫或低溫 ±12.5 μm | [8] |
| 依測試溫度縮放 | 探針圖案照 125 °C 縮放 | 把常溫的探針間距先縮放，讓它在測試溫度剛好對上；代價是每個溫度要一套 | [12] [3] |
| 測試溫度 | −40–150 °C | 高溫 125–200 °C、低溫 −40 到 −55 °C；也有 −40 / 150 °C 的例子 | [9] [37] |
| 翹曲 | 層疊理論算曲率，弓高 = 曲率 × 長度² ÷ 8；以 180 °C 為無應力溫度，長度 100 mm | 銅量不平衡、疊構不對稱、材料之間熱膨脹不匹配都會造成翹曲；100 mm 載板例：約 +90 μm（室溫）、−100 μm（240 °C） | [27] [28] [26] [33] [14] |
| 平整度上限 | 38 μm | 2002 年公開例子：整片 ≤ 0.0015 吋（38 μm）、探針區 ≤ 0.0005 吋（13 μm）；有機載板焊上後翹 60–70 μm，可銑平到 5 μm 以內 | [2] [11] |
| 與上下的連接 | 上面：探針壓在接點上；下面：錫球焊到主板 | 垂直探針壓在載板上方的接點（不焊）；下方錫球迴焊到主板再加底部填膠，也有用轉接板或機構固定的 | [10] [2] [1] |

沒有模擬的部分：核心板內部的多層線路、電性（阻抗、損耗、電源）、內嵌電容、疊孔的可靠度、玻璃核心與薄膜重佈線、載板和晶圓溫度不同（實際載板較涼），以及厚度方向的膨脹。走線用的是「每層拉出 n + 1 排」的簡化規則；實際 45 μm 以下的間距，孔墊之間已經放不下線，要靠孔中孔一路往下、在較深的層再展開。

### 參考文獻

1. [Chan & Leung (Intel) — C4 Probe Card Space Transformer Technology Overview, SWTW 2000](https://www.swtest.org/swtw_library/2000proc/PDF/S04_Chan.pdf)
2. [Fulton & Pardee (Wentworth Laboratories) — Using MLOs to Build Vertical Technology Space Transformers, SWTW 2002](https://www.swtest.org/swtw_library/2002proc/PDF/S04_03.pdf)
3. [Nozaka (FICT) — Space Transformer Organic Technologies for Next-Generation Probe Card Substrates, SWTest Asia 2024](https://www.swtestasia.org/2024proc/pdf/F06_01_NOZAKA_SWTestAsia2024.pdf)
4. [Yang (Princo Test) — An introduction for novel multi-layer thin film substrates applied in space transformers, SWTW 2018](http://www.swtest.org/swtw_library/2018proc/PDF/S09_02_Yang_SWTW2018.pdf)
5. [Furniturewala (R&D Altanova / Advantest) — Embedded Capacitors on the MLO for SerDes and PCIe loopback, SWTest 2023](https://www.swtest.org/library/2023proc/pdf/M01_03_Furniturewala_2023.pdf)
6. [Huang, Daly & Tai (Chunghwa Precision Test Tech.) — Thermal Challenges in the Fine Pitch Testing Solutions, SWTest 2023](https://www.swtest.org/library/2023proc/pdf/W08_03_Daly_2023.pdf)
7. [Cho et al. (SEMCNS) — Importance of Ceramic Substrates with Low Thermal Expansion Coefficient in Semiconductor Wafer Testing, SWTest 2023](https://www.swtest.org/library/2023proc/pdf/P01_05_In_SWTest_2023.pdf)
8. [Van Cauwenberghe (ON Semiconductor) — Wafer Probe Challenges for the Automotive Market, SWTW 2012](https://www.swtest.org/swtw_library/2012proc/PDF/S01_03_Cauwenberghe_SWTW2012.pdf)
9. [Sinsheimer & Buckholtz (Teradyne) — Wafer Sort at Extreme Temperatures, SWTW 2018](https://www.swtest.org/swtw_library/2018proc/PDF/P01_02_Buckholtz_SWTW2018.pdf)
10. [US11209463B2 (Technoprobe) — Probe card for a testing apparatus](https://patents.google.com/patent/US11209463B2/en)
11. [US10288645B2 — organic laminate probe substrate flattened before probe formation](https://patents.google.com/patent/US10288645B2/en)
12. [EP1356307A1 (Wentworth) — probe pitch compensated for the test temperature](https://patents.google.com/patent/EP1356307A1/en)
13. [Tatsumi, Fujishima & Sakauchi (Ajinomoto) — Advanced Build-up Materials for High Speed Transmission Application, IMAPS 2018](https://imapsource.scholasticahq.com/api/v1/articles/55935-advanced-build-up-materials-for-high-speed-transmission-application.pdf)
14. [Mitsukura (Resonac) & Hisada (Rapidus) — Trend of Organic Substrate Materials, IEEE EPS](https://eps.ieee.org/wp-content/uploads/2025/11/Trend_of_Organic_Substrate_Materials_Article__mitsukura_hisada.pdf)
15. [Resonac — MCL catalog 2023–2024 (core laminates)](https://www.resonac.com/sites/default/files/2024-07/2023-2024MCL_catalog_EN.pdf)
16. [Mitsubishi Gas Chemical — BT laminate lineup](https://www.mgc.co.jp/eng/products/sc/btprint/lineup/hfbt.html)
17. [Kyocera — fine ceramic material properties](https://global.kyocera.com/prdct/semicon/material/)
18. [Copper Development Association — C11000 properties](https://alloys.copper.org/alloy/C11000)
19. [Ioffe Institute — Silicon thermal properties](https://www.ioffe.ru/SVA/NSM/Semicond/Si/thermal.html)
20. [KLA — IC Substrates Part II: Six Yield-Critical Challenges for Manufacturers](https://www.kla.com/advance/innovation/ic-substrates-part-ii-six-yield-critical-challenges-for-manufacturers)
21. [Polymer Innovation Blog — Build-up films for flip-chip substrates, part one](https://polymerinnovationblog.com/polymers-in-electronic-packaging-build-up-films-for-flip-chip-semiconductor-substrates-part-one/)
22. [Kawashima & Tajima (Meltex) — Advanced Chemical Processes for Semi-additive PWB Fabrication, Line and Space 5 µm, IMAPS 2015](https://imapsource.org/api/v1/articles/57213-advanced-chemical-processes-for-semi-additive-pwb-fabrication-for-fine-line-formation-targeting-line-and-space-5-m-5-m.pdf)
23. [Bellemare & Kologe — Semiadditive Processing, PCD&F](https://www.pcdandf.com/pcdesign/index.php/editorial/menu-features/13128-semiadditive-processing-1811)
24. [Toppan — FC-BGA substrates](https://www.toppan.com/en/electronics/package/fc-bga/)
25. [JEITA ED-7306 — Measurement methods of package warpage at elevated temperature and the maximum permissible warpage](https://home.jeita.or.jp/tsc/std-pdf/ED-7306_E.pdf)
26. [Sierra Circuits — Balanced copper distribution and copper weight in PCBs](https://www.protoexpress.com/blog/balanced-copper-distribution-and-copper-weight-in-pcbs/)
27. [A summary of Classical Lamination Theory (course notes)](https://wstein.org/edu/2010/480b/projects/05-lamination_theory/A%20summary%20of%20Classical%20Lamination%20Theory.pdf)
28. [Wikipedia — Bimetallic strip (Timoshenko curvature)](https://en.wikipedia.org/wiki/Bimetallic_strip)
29. [Altium — How to successfully design a BGA](https://resources.altium.com/p/how-to-successfully-design-a-bga)
30. [DIS Tech — Our technologies](https://www.dis.tech/technologies-and-products/our-technologies)
31. [Technoprobe — Capital Markets Day 2025](https://www.technoprobe.com/wp-content/uploads/2025/04/Technoprobe-CMD2025.pdf)
32. [Technoprobe — What is a probe card](https://www.technoprobe.com/technologies-and-products/what-is-a-probe-card)
33. [Liu (Flextronics) — Challenges of Organic Substrates from EMS Perspective, iNEMI 2014](https://thor.inemi.org/webdownload/2014/Substrate_Pkg_WS_Apr/03_Flextronics.pdf)
34. [Milad — The IPC surface finish specifications, I-Connect007 2021](https://iconnect007.com/article/129297/the-plating-forum-the-ipc-surface-finish-specifications/129300/pcb)
35. [Peng et al. — Additive processing, PCD&F](https://pcdandf.com/pcdesign/index.php/editorial/menu-features/11588-additive-processing-1704)
36. [Kyocera — probe card ceramics ST300 (archived page)](http://web.archive.org/web/20250724022534/https://global.kyocera.com/prdct/semicon/search_application/detail/m_probecard.html)
37. [Dastmalchi, Harker (FormFactor) & Heitzer (Infineon) — Advancing Probe Card Parallelism for SOC Devices, SWTest 2022](https://www.swtest.org/library/2022proc/pdf/M03_03_Dastmalchi_SWTest_2022F.pdf)
<!-- refs:end -->

## 檔案

| 檔案 | 用途 |
|---|---|
| `index.html` | 版面與樣式 |
| `model.js` | 疊構、層疊理論（等效熱膨脹係數、曲率、翹曲）、探針偏移、走線通道與層數（純函式，可用 `node mlo/check.mjs` 檢查數字） |
| `scene.js` | 3D 載板：每層的銅、微孔、通孔、錫球、探針頭、剖面、增層動畫 |
| `main.js` | 剖面圖、製程圖、扇出與偏移圖、控制項、導覽 |
| `sources.js` | 製程、每個參數的預設值、公開資料的數字和出處（`python make_refs.py` 會把它寫進這份 README） |
| `narration.py`、`narration.js`、`audio/` | 導覽旁白 |

Built with Claude Opus 5.5.
