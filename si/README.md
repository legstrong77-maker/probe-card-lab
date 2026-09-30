# 訊號與電源完整性實驗室 · Signal & Power Integrity Lab

**▶ Live：https://legstrong77-maker.github.io/probe-card-lab/si/**

測試載板和探針卡主板都是又厚、層數又多的 PCB。這一頁用一條高速訊號和一條大電流電源，說明這種板子最難的兩件事。

**訊號**

- 訊號從板子底面的測試機接點進來，穿過導通孔、走一段內層走線，再從另一個導通孔上到晶片。
- 導通孔用不到的那一截叫殘樁。調整板厚和走線層的深度，看殘樁在哪個頻率共振、把損耗曲線咬出缺口。
- 背鑽、換板材、改線寬和長度、切換速率（PCIe 3.0 到 112G PAM4）、打開接收端等化，眼圖會即時重算。

**電源**

- 電流一跳，電壓就往下掉。調整電流、上升時間、三種電容的數量、電源接腳和電源層，看阻抗曲線和電壓下陷怎麼變。
- 畫面會重播這次電流跳升，並標出每個時間點主要是誰在供電：晶片和封裝裡的電容、高頻電容、中電容、大電容，還是測試機電源。
- 遠端感測可以選不接、接在板上或接到晶片端，看直流壓降有沒有被補回來。

點「▶ Guided tour」會跑一段有旁白的導覽。

Two things a thick test board has to get right, shown with first-order models: one fast lane (via stubs, back-drilling, laminate loss, eye diagram) and one high-current rail (target impedance, decoupling, droop, remote sense).

> 個人作品，示意用途。用的是教科書等級的一階公式和集總電路，數字只代表趨勢，不能取代模擬軟體；也不是任何產品或專案的實際規格，不是官方資料。
> Personal, unofficial demo. First-order formulas and lumped circuits: good for trends, not a substitute for a field solver or a circuit simulator.

<!-- refs:start -->
## 參數依據與參考來源

這一頁用的是教科書等級的一階公式，目的是看出趨勢，不是取代模擬軟體。下面列出用到的公式、每個參數的預設值、公開資料裡的數字和出處。所有來源都是公開文件；數字是業界通用量級，不是任何產品或專案的規格。

### 用到的公式

1. **殘樁共振**：f = c ÷（4 × 殘樁長度 × √Dk）。開路的殘樁在四分之一波長時把訊號反相送回來，剛好抵消。這一頁把 Dk 乘上 1.69，因為實測的導通孔「看起來」的 Dk 比板材標示值高（實例 6.16 對 3.65）。 [1] [2]
2. **殘樁多長算太長**：經驗法則：殘樁要短於 300 mil ÷ 速率（Gb/s）。32 Gb/s 大約是 9 mil（0.24 mm）。超過 15 mil 的殘樁建議背鑽。 [3] [4] [5]
3. **走線損耗**：每英吋損耗（dB）≈ 31.6 × √f ÷（Z × (線寬 + 銅厚)）+ 2.32 × √Dk × Df × f，f 為 GHz、尺寸為 mil。前一項是銅的集膚效應，後一項是板材。粗糙銅面大約讓銅的損耗加倍。 [5] [6] [7]
4. **眼圖**：把一串隨機資料通過這條通道（損耗加兩個殘樁），每個位元疊在一起畫出來。眼高和眼寬取最佳取樣點附近的開口。PAM4 有三個眼，每個最多只有 NRZ 的三分之一。 [8] [9]
5. **不等化能撐多少**：經驗法則：NRZ 在 Nyquist 頻率損耗約 10 dB 以內不用等化；加上接收端等化後可以到 15–25 dB。 [10]
6. **目標阻抗**：Z 目標 = 電壓 × 容許漣波 ÷ 電流跳升量，電流跳升量取最大電流的一半。電源路徑的阻抗要在整個頻段都低於它。 [17] [18] [19]
7. **電容的自振頻率**：f = 1 ÷（2π√(LC)）。高於這個頻率，電容只剩電感的作用；所以要很多顆並聯，用不同容值由快到慢接力。 [15] [18]
8. **電壓下陷**：ΔV = ΔI × Z。電流一跳，先由晶片和封裝裡的電容撐住，再來是板上的高頻、中、大電容，最後才是測試機電源。 [18] [22]
9. **直流壓降與遠端感測**：1 oz 銅箔每平方 0.5 mΩ，2 oz 是 0.25 mΩ；多層並聯就除以層數。測試機電源用另一組感測線量測待測端的電壓，把路徑上的壓降補回來，但只補得到它反應得過來的頻率。 [23] [24] [25]

### 可調參數對照

| 參數 | 這一頁用的值 | 公開資料 | 來源 |
|---|---|---|---|
| 板厚 | 2.0–8.0 mm，預設 6.4 mm | 測試載板一般厚 0.200–0.300 英吋（5–7.6 mm）；公開例子為 4.8–7.6 mm、26–60 層 | [11] [12] |
| 背鑽後的殘樁 | 0.15 mm | 測試載板廠的規格是 0.15 ± 0.1 mm；一般板廠是 7 ± 5 mil（約 0.18 mm） | [12] [13] |
| 走線長度 | 2–50 cm，預設 25 cm | 測試載板上的高速線常有 25–50 cm | [14] |
| 線寬 | 4–20 mil，預設 6 mil | 高速板材上一般是 5–7 mil；測試載板也有用到 19 mil 的寬線來降低銅損 | [11] [14] |
| 差動阻抗 | 100 Ω（只用來算銅損） | 一般是 85–100 Ω，容許 ±10%；測試板廠標示可做到 ±5% | [15] [16] [5] |
| 板材 | FR-4（Dk 3.92、Df 0.025）、N4000-13 SI（3.2、0.008）、Megtron 6（3.62、0.0046）、I-Tera MT40（3.45、0.0031）、Megtron 7（3.31、0.0023）、Tachyon 100G（3.02、0.0021） | 都是原廠規格書在 10–14 GHz 的典型值。各家量測方法不同，不能直接比大小。公開的測試載板例子用的是 I-Tera、Meteorwave 2000 和 FR-4 | [26] [27] [28] [29] [30] [31] [12] |
| 每英吋損耗（檢查用） | 16 GHz：FR-4 約 2.0 dB、Megtron 6 約 0.49 dB（6 mil 線、平滑銅面） | 公開表格在 16 GHz 為 FR-4 1.29–1.84 dB、Megtron 6 0.34 dB（該表用的 Df 比規格書低）；經驗法則是 FR-4 每英吋每 GHz 0.2 dB、低損耗板材 0.1 dB | [5] [6] |
| 訊號速率 | PCIe 3.0／4.0／5.0／6.0 和 112G | Nyquist 頻率為 4／8／16／16／28 GHz；整條通道的損耗上限為 22／28／36／32 dB 和 28–30 dB。PCIe 6.0 和 112G 用 PAM4 | [32] [33] [34] [9] |
| 接收端等化 | 一個零點一個極點的 CTLE，最多補 12 dB（示意） | 實際的接收端還有 FFE 和 DFE，合起來大約可以補到 25 dB | [10] |
| 測試板上的訊號速度 | — | 公開資料提到測試載板上有 112 Gb/s PAM4 的迴路測試，訊號從板子底面進來、從頂面的測試座出去，每條線都要穿過好幾個導通孔 | [11] |
| 電壓與容許漣波 | 0.6／0.8／1.0 V，±2／3／5% | 核心電壓約 1 V 以下，並往 0.75、0.6、0.5 V 走。容許範圍的公開例子：核心電源 ±5%、類比電源 ±3%，也有 2–2.5% 的 | [35] [36] [17] [15] [19] |
| 最大電流 | 20–1540 A，預設 200 A | 高效能運算晶片需要 1,000–1,500 A；測試機單張電源卡可供 640 A，可以並聯 | [35] [37] |
| 電容 | 大 470 μF（25 mΩ、2.5 nH）、中 47 μF（10 mΩ、1.6 nH）、高頻 0.47 μF（10 mΩ、1.0 nH），電感含安裝 | 規格例：330–680 μF 鉭質電容 ESR 5–40 mΩ、ESL 1–2 nH；47–100 μF 陶瓷 ESR 1–40 mΩ、ESL 1 nH 以內；0.47 μF 陶瓷 ESR 1–20 mΩ、ESL 0.5 nH 以內。安裝另外加 0.3–4 nH；實測一顆 0402 的安裝電感約 0.52 nH | [15] [20] |
| 電源接腳 | 每對 4 nH、30 mΩ（導通孔加測試座探針），20–5000 對並聯 | 測試載板上，通到待測物的導通孔通常是電源路徑裡電感最大的一段；1.5 mm 厚的板子，導通孔約 0.3–1.5 nH，板子越厚越大。高效能晶片有上萬個電源和接地接點 | [22] [15] [35] |
| 電源層 | 2 oz 銅、每對 100 平方英吋，1–24 對；路徑算兩個正方形長 | 4 mil 間距的電源層每平方英吋約 225 pF。公開的案例用 2 oz 銅和多層電源層，2.4 kW 的晶片在板上發熱 83 W、不到 3.5% | [15] [22] |
| 遠端感測 | 感測點可選：無、板上、晶片端；約 100 kHz 以下有效（示意）。測試機電源每 20 A 一個通道並聯 | 測試機的元件電源用四線式連接：兩條送電、兩條量電壓。穩壓器只在幾十到幾百 kHz 以下有低阻抗 | [24] [25] [18] |
| 封裝與晶片裡的電容 | 每安培 1 μF（示意） | 封裝內的電容規格例：0.47–4.7 μF、電感 60–110 pH。晶片和封裝的電容負責板上電容來不及反應的頻段，這一段不是板子能改的 | [15] [18] |
| 電流上升時間 | 1 ns–10 μs，預設 100 ns | 晶片內部的第一次下陷發生在 50–200 MHz；掃描測試時電流會在單一測試裡劇烈變化 | [21] [35] |

沒有模擬的部分：串音、阻抗不連續造成的反射（除了殘樁）、連接器和測試座、抖動、FFE／DFE 等化、電源層的共振、電容擺放位置、溫度，以及封裝內部的細節。眼圖和電源阻抗都是用集總或一維模型算的，數字只代表趨勢。

### 參考文獻

1. [Simonovich — Via Stubs Demystified, 2017](https://blog.lamsimenterprises.com/2017/03/08/via-stubs-demystified/)
2. [Bogatin — The quarter-wave stub frequency: Rule of Thumb #17, EDN 2014](https://www.edn.com/the-quarter-wave-stub-frequency-rule-of-thumb-17/)
3. [Telian — Fixing the Problem of Stubs, Signal Integrity Journal 2023](https://www.signalintegrityjournal.com/articles/2962-fixing-the-problem-of-stubs)
4. [Simonovich — The Poor Man's PCB Via Modeling Methodology, 2011](https://blog.lamsimenterprises.com/2011/03/14/the-poor-mans-pcb-via-modeling-methodology/)
5. [Texas Instruments — High-Speed PCB Layout for PCIe Gen 5, SNLA426, 2023](https://www.ti.com/lit/pdf/snla426)
6. [Bogatin — Loss in a channel: Rule of Thumb #9, EDN 2014](https://www.edn.com/loss-in-a-channel-rule-of-thumb-9/)
7. [Bogatin — How to Reduce Attenuation in a Differential Channel, Signal Integrity Journal 2020](https://www.signalintegrityjournal.com/articles/1734-how-to-reduce-attenuation-in-a-differential-channel)
8. [Keysight — Analyzing Data using Eye Diagrams](https://helpfiles.keysight.com/csg/N1930xB/Analyzing/Analyzing_Data_using_Eye_Diagrams.html)
9. [Intel/Altera — AN 835: PAM4 Signaling Fundamentals](https://docs.altera.com/r/docs/683852/current/an-835-pam4-signaling-fundamentals)
10. [Bogatin — How much attenuation is too much?: Rule of Thumb #10, EDN 2014](https://www.edn.com/how-much-attenuation-is-too-much-rule-of-thumb-10/)
11. [Armstrong & Thompson (Advantest) — HSIO Loopback Turns Challenges Into Opportunities For Test At 112 Gbps, SemiEngineering 2021](https://semiengineering.com/hsio-loopback-turns-challenges-into-opportunities-for-test-at-112-gbps/)
12. [TSE — Load board line-up and capability](https://www.tse21.com/eng/product/interfaceboard_loadboard.html)
13. [TTM Technologies — Back Drill Design Guideline, 2023](https://www.ttm.com/sites/default/files/documents/BackDrilling_TechBulletin.pdf)
14. [Moreira & Barnes (Verigy) — Choosing the Dielectric Material for a V93000 DUT Loadboard, 2008](https://www3.advantest.com/documents/11348/08232f5c-6d6f-4920-b7d8-4c683a098bb5)
15. [Xilinx — 7 Series FPGAs PCB Design Guide, UG483](https://docs.amd.com/v/u/en-US/ug483_7Series_PCB)
16. [Hemeixin — ATE PCB boards](https://www.hemeixinpcb.com/rigid-pcb/ate-pcb-boards.html)
17. [Altera — Device-Specific Power Delivery Network (PDN) Tool User Guide, 2014](https://docs.altera.com/v/u/docs/654614/device-specific-power-delivery-network-pdn-tool-user-guide)
18. [Altera — AN 574: PCB Power Delivery Network (PDN) Design Methodology, 2009](https://docs.altera.com/v/u/docs/654973/an-574-printed-circuit-board-pcb-power-delivery-network-pdn-design-methodology)
19. [Texas Instruments — Sitara Processor Power Distribution Networks: Implementation and Analysis, SPRAC76](https://www.ti.com/lit/an/sprac76h/sprac76h.pdf)
20. [McCaffrey, Huddleston, Dannan & Kuszewski — Who Put That Inductor in My Capacitor?, Signal Integrity Journal 2024](https://www.signalintegrityjournal.com/articles/3445-who-put-that-inductor-in-my-capacitor)
21. [Kim et al. (UT Austin / AMD) — AUDIT: Stress Testing the Automatic Way, MICRO 2012](https://lca.ece.utexas.edu/pubs/young_micro12.pdf)
22. [Furniturewala (R&D Altanova / Advantest) — Design Considerations For Ultra-High Current Power Delivery Networks, SemiEngineering 2023](https://semiengineering.com/design-considerations-for-ultra-high-current-power-delivery-networks/)
23. [Bogatin — Sheet resistance of copper foil: Rule of Thumb #13, EDN 2014](https://www.edn.com/sheet-resistance-of-copper-foil-rule-of-thumb-13/)
24. [Evaluation Engineering — Applying Kelvin Measurements To PMIC Testing on ATE, 2007](https://www.electronicdesign.com/technologies/test-measurement/article/21201453/applying-kelvin-measurements-to-pmic-testing-on-ate)
25. [EESemi — ATE Load Boards / DUT Boards / Interface Boards](https://www.eesemi.com/loadbrds.htm)
26. [Isola — 370HR data sheet](https://www.isola-group.com/wp-content/uploads/data-sheets/370hr.pdf)
27. [AGC — N4000-13 SI technical data sheet](https://www.agc-multimaterial.com/agc-downloads/AGC_N4000-13SI_TDS.pdf)
28. [Panasonic — MEGTRON 6 data sheet](https://industrial.panasonic.com/content/data/EM/PDF/DataS_MEGTRON6_R-5775_en_202410.pdf)
29. [Isola — I-Tera MT40 data sheet](https://www.isola-group.com/wp-content/uploads/data-sheets/i-tera-mt40.pdf)
30. [Panasonic — MEGTRON 7 data sheet](https://industrial.panasonic.com/content/data/EM/PDF/DataS_MEGTRON7_R-5785_en_2022.pdf)
31. [Isola — Tachyon 100G data sheet](https://www.isola-group.com/wp-content/uploads/data-sheets/tachyon-100g-laminate-and-prepreg.pdf)
32. [Astera Labs — PCI Express 5.0 Architecture Channel Insertion Loss Budget](https://www.asteralabs.com/pci-express-5-0-architecture-channel-insertion-loss-budget/)
33. [Krooswyk, Fellbaum & Burns (Samtec) — How To Choose an Interconnect for PCIe 6.0 High-Speed Systems, Signal Integrity Journal 2023](https://www.signalintegrityjournal.com/articles/2964-how-to-choose-an-interconnect-for-pcie-60-high-speed-systems)
34. [OIF — CEI Interoperability Demo at OFC 2024](https://www.oiforum.com/wp-content/uploads/OIF_CEI_Demo_OFC2024_Final.pdf)
35. [SemiEngineering — Delivering On Power During HPC Test, 2024](https://semiengineering.com/delivering-on-power-during-hpc-test/)
36. [Leventhal (Advantest) — AI Semiconductors Require An Integrated Test Solution, SemiEngineering 2025](https://semiengineering.com/ai-semiconductors-require-an-integrated-test-solution/)
37. [Advantest — DC Scale XHC32 ultra-high-current power supply, news release 2024](https://www.advantest.com/en/news/2024/20240515.html)
<!-- refs:end -->

## 檔案

| 檔案 | 用途 |
|---|---|
| `index.html` | 版面與樣式 |
| `model.js` | 殘樁共振、走線損耗、通道頻率響應、眼圖（FFT）、電源網路的阻抗與暫態（純函式，可用 `node si/check.mjs` 檢查數字） |
| `main.js` | 板子剖面的繪製、圖表、控制項、導覽 |
| `sources.js` | 公式、每個參數的預設值、公開資料的數字和出處（`python make_refs.py` 會把它寫進這份 README） |
| `narration.py`、`narration.js`、`audio/` | 導覽旁白 |

Built with Claude Opus 5.5.
