# 成品測試板拆解實驗室 · Final Test Board Lab

**▶ Live：https://legstrong77-maker.github.io/probe-card-lab/ft/**

封裝好的晶片在出貨前還要再測一次，這一站叫成品測試（Final Test，FT）。這一頁把它的介面拆開給你看：測試頭、彈簧針介面、測試載板、測試座、晶片，還有把晶片壓進測試座的分類機。

- **拆解**：把整個介面一層一層拉開，每層都有標籤。
- **訊號路徑**：追幾條訊號，從測試頭穿過載板內層，經過彈簧針到錫球。
- **剖開測試座**：看每顆錫球底下的彈簧針怎麼被壓縮。
- **下壓行程與封裝翹曲**：行程不夠，角落的錫球碰不到探針；行程太大，探針壓到底。
- **產出**：調整測試時間、換料時間和同測顆數，看每小時產出怎麼變。
- **針尖沾錫**：快轉之後接觸電阻慢慢升高，誤判變多，直到你清潔測試座。

點「▶ Guided tour」會跑一段有旁白的導覽。

A final-test interface you can take apart in the browser: test head, spring-pin interface, load board, sockets and devices, with a pick-and-place handler running on top. Explode the stack, trace signals, cut a socket open, change stroke and package warpage, and see how test time, index time and site count set the throughput.

> 個人作品，示意用途。尺寸有放大、物理模型有簡化，所有數字都是業界通用的量級，不是任何產品或專案的實際規格，也不是官方資料。
> Personal, unofficial demo. Geometry is exaggerated, the physics is simplified, and every number is a generic, textbook-level value.

<!-- refs:start -->
## 參數依據與參考來源

這是示意模型：幾何尺寸有放大，物理是簡化公式。下面列出成品測試的流程、每個可調參數用的數值、公開資料裡的典型範圍，以及出處。所有來源都是公開文件；數字是業界通用量級，不是任何產品或專案的規格。

### 成品測試流程

1. **晶圓針測（前一站）**：晶粒還在晶圓上時先測一次，封裝之後再測一次，就是成品測試。 [2] [4]
2. **預燒 Burn-in（部分產品）**：通常是封裝後的第一步：約 95–105 °C、電壓比使用條件高約三成，把早期失效的晶片逼出來。 [5]
3. **取料 PICK**：分類機從料盤吸起待測晶片，一次可以抓好幾顆。 [15] [16]
4. **放入、下壓 PLACE / PLUNGE**：壓頭把晶片壓進測試座，每顆錫球各壓在一支彈簧針上。 [7] [10]
5. **電性測試 TEST**：測試機的訊號經過彈簧針介面、測試載板、測試座到晶片。成品測試常在高溫、常溫、低溫各測一次。 [4] [25]
6. **分類 SORT**：依測試結果把晶片放到不同料盤（分 bin）。 [15] [18]
7. **清潔測試座**：錫和氧化物會沾在針尖上，每隔一定的插入次數要清潔。 [27] [10]
8. **系統級測試 SLT（下一站）**：越來越多產品在成品測試之後，再用接近實際系統的環境測一次。 [6]

### 可調參數對照

| 參數 | 模擬器用的值 | 公開資料的典型範圍 | 來源 |
|---|---|---|---|
| 彈簧針接觸力 | 剛碰到時 8 gf，之後每毫米增加 49 gf；0.45 mm 時約 30 gf | 每針 10–31 g；主流 BGA 測試座在工作行程下為 16–30 g。合適的彈簧針不到 20 g 就能壓破氧化層 | [8] [9] [10] [11] [12] [13] |
| 下壓行程 Stroke | 0–0.8 mm，預設 0.40 mm；0.35–0.50 mm 標為工作區，0.57 mm 壓到底 | 建議行程 0.40–0.50 mm；最大行程 0.40–0.57 mm | [8] [9] [11] |
| 接觸電阻 CRES | 壓穩後約 85 mΩ；接觸力小時偏高；約 0.4 Ω 以上開始出現誤判（示意） | 新針約 19–150 mΩ，多數在 30–80 mΩ；公開實驗以 500 mΩ 當作需要清潔的門檻 | [10] [11] [8] [9] |
| 探針長度 | 示意，沒有按比例 | 測試高度約 2.85–3.8 mm；也有訊號路徑約 2 mm 的短針 | [9] [11] [12] |
| 封裝翹曲 | 0–0.40 mm，預設 0.05 mm，超過 0.15 mm 會標示超標；角落錫球的行程 = 下壓行程 − 翹曲 | JEDEC 允許的最大不共面度是 0.15 mm，主要來自基板翹曲。彈簧針 0.4–0.57 mm 的行程就是用來吸收這個高低差 | [30] [11] |
| 錫球數與下壓力 | 畫面上每顆 100 球；註腳另外用 1,000 球估算 | 公開例子：407 球的 BGA、每針 30 g，換算約 12 kgf；約 7,300 個接點、每個約 35 g，壓蓋要施加 200 kgf 以上。分類機的下壓力為 120–900 kgf | [11] [14] [15] [16] [18] |
| 換料時間 Index time | 0.2–3 秒，預設 0.6 秒。畫面上由一支手臂做完取料、放入、分類（示意） | ×1–×16 為 0.38–0.8 秒，×32 約 3.9 秒。實際的分類機用多支手臂和梭車接力，才能這麼快 | [15] [16] [34] [19] |
| 測試時間 | 0.5–120 秒，預設 3 秒 | 公開例子有 3 秒、4 秒、5 秒、15 秒；記憶體可到 128 秒 | [17] [19] [20] |
| 同測顆數 Sites | ×1、×2、×4、×8 | 分類機支援 ×1 到 ×32；公開的測試載板例子為 2–16 顆 | [15] [17] [22] |
| 同測效率 MSE | 固定 90%：每多測一顆，測試時間增加 10% | RF、混合訊號、數位元件約 90–95%，記憶體接近 100%。效率要高於 90%，超過 8 顆同測才划算 | [20] [19] [21] |
| 每小時產出 UPH | 3600 × 顆數 ÷（測試時間 + 換料時間）；分類機上限 9,000 | 公式相同。分類機的上限為 9,000，選配或高階機種到 16,000–18,500 | [21] [20] [15] [16] [17] |
| 清潔間隔 | 每次插入讓接觸電阻升高 0.55 mΩ，600 次後提醒清潔（比實際快很多，方便觀察） | 皇冠針尖一般每 10,000–50,000 次插入清潔一次；公開比較中兩種探針分別是 2 萬和 4 萬次 | [27] [10] [11] [28] |
| 良率與誤判 | 真正的不良率 4%（示意）；其餘的不良都是接觸造成的誤判 | 公開比較中，換一種探針就讓第一次通過率從 80% 多變成 90% 多；超過七成的良率損失和重測與接觸有關 | [11] [29] |
| 探針壽命 | 沒有模擬 | 125,000 到 500,000 次以上 | [10] [11] [9] |
| 測試載板 | 標示「數十層」；剖面畫 22 層，並畫出背鑽（示意） | 公開例子為 26–60 層、厚 4.8–7.6 mm、404 × 404 到 680 × 520 mm；背鑽殘樁 0.15 mm；BGA 間距 0.3–0.5 mm | [22] [23] [24] |
| 測試機介面 | 板子兩側各一排彈簧針座 | 測試頭上的彈簧針頂到載板底面的接點；V93000 把這個介面分成 16 個區段 | [25] [26] [33] |
| 溫度 | 沒有模擬 | 成品測試常做高溫、常溫、低溫；分類機的範圍是 −55 到 +155 或 +175 °C | [4] [15] |
| 測試板與 DIS | 測試頭 → 彈簧針介面 → 補強框 → 測試載板 → 測試座 → 晶片 | DIS Tech 設計、製造並組裝成品測試板，板上裝有針對該封裝的測試座。DIS Tech 在 2024 年 5 月由 Technoprobe 自 Teradyne 收購 | [1] [2] [3] |

沒有模擬的部分：溫度（三溫測試與預熱）、探針磨耗與壽命、訊號完整性（阻抗與損耗）、供電、Kelvin 量測、重測流程，以及分類機卡料。導電膠（elastomer）這類接點也沒有畫出來：公開資料裡它的行程約 0.3–0.4 mm，訊號路徑比彈簧針短，壽命從數萬次到十萬次。 [31] [32] [14]

### 參考文獻

1. [DIS Tech — company site](https://www.dis.tech/)
2. [DIS Tech — Device Interface Solutions](https://www.dis.tech/company/device-interface-solutions)
3. [Technoprobe — press release on closing the DIS acquisition, 27 May 2024](https://www.technoprobe.com/wp-content/uploads/2024/05/Technoprobe_Teradyne_-PR-Closing.pdf)
4. [Amkor — Test Services](https://amkor.com/test-services/)
5. [SemiEngineering — The Importance Of Product Burn-In Test](https://semiengineering.com/the-importance-of-product-burn-in-test/)
6. [SemiEngineering — System-Level Test: Where Does It Fit?](https://semiengineering.com/system-level-test-where-does-it-fit/)
7. [Smiths Interconnect — Semiconductor Test Sockets: Key to Shipping Quality ICs](https://www.smithsinterconnect.com/library/technical-library/article/semiconductor-test-sockets-key-to-shipping-quality-ics/)
8. [Smiths Interconnect — DaVinci high-speed test sockets, technical specifications](https://www.smithsinterconnect.com/getattachment/bf5fbbda-cbf2-430b-8e31-8b28152daf06/DaVinci_Tech-Specs-(1).pdf)
9. [Smiths Interconnect — DaVinci Micro catalogue](https://www.smithsinterconnect.com/getattachment/3a71e315-e1c7-44a1-a4ef-48160e09d88f/DaVinci-micro-catalogue-US-Web.pdf)
10. [Ironwood Electronics — Spring Pin Socket User Manual](https://www.ironwoodelectronics.com/catalog/Content/Drawings/SSI.pdf)
11. [BiTS Workshop 2010, Session 3 — spring probe papers (Multitest Mercury probe; contact resistance on Pb-free solder)](https://www.testconx.org/archive/archive2010/2010s3.pdf)
12. [Aries Electronics — CSP/µBGA test socket](https://www.arieselec.com/product/24011-csp-micro-bga-test-socket/)
13. [Solid State Technology — Optimizing contactors for high-performance test sockets, 2004](https://sst.semiconductor-digest.com/2004/03/optimizing-contactors-for-high-performance-test-sockets/)
14. [Divakar, Kabadi & Dhanpal (Ampere Computing) — Unified Socket Interconnect in the Test Ecosystem of High Pin Count and Large Body Size Packages, TestConX 2025](https://www.testconx.org/premium/wp-content/uploads/2025/TestConX2025s5p2Divakar_1832.pdf)
15. [Cohu — MATRiX pick-and-place handler product sheet](https://www.cohu.com/wp-content/uploads/2019/06/Matrix-Product-Sheet_PnP_20210907.pdf)
16. [Chroma — 3180 pick-and-place handler catalogue](https://www.chromaate.com/downloads/catalogue/Handler/3180-EN.pdf)
17. [Advantest — M4841 handler brochure](https://www3.advantest.com/documents/11348/146262/pdf_M4841-2E_en.pdf/76ad0f37-3ec2-4f8d-839a-a9e8f786d7c8)
18. [Cohu — Eclipse platform product sheet](https://www.cohu.com/wp-content/uploads/2019/06/Eclipse-Platform-Product-Sheet-031026-1.pdf)
19. [EDN — The challenge of multisite test, 2006](https://www.edn.com/the-challenge-of-multisite-test/)
20. [Kelly (Advantest) — Multi-Site Efficiency and Throughput](https://www3.advantest.com/documents/11348/d05328f9-2d91-4372-9a13-8344373c03b4)
21. [Khoo et al. — Comprehensive Multisite Efficiency Equation for Semiconductor Test Equipment, J. Eng. Sci. Technol. 15(6), 2020](https://jestec.taylors.edu.my/Vol%2015%20issue%206%20December%202020/15_6_31.pdf)
22. [TSE — Load board line-up and capability](https://www.tse21.com/eng/product/interfaceboard_loadboard.html)
23. [Hemeixin — ATE PCB boards](https://www.hemeixinpcb.com/rigid-pcb/ate-pcb-boards.html)
24. [Advantest — application note on dielectric materials for DUT loadboards](https://www3.advantest.com/documents/11348/08232f5c-6d6f-4920-b7d8-4c683a098bb5)
25. [US9921266B1 — background section: pogo-pin interface blocks between test head and load board](https://patents.google.com/patent/US9921266B1/en)
26. [MultiLane — AT93000 System User Guide (docking and pogo segments)](https://www.multilaneinc.com/img/solutions/AT93000-System-User-Guide-rev0.9.4.pdf)
27. [US7491069B1 — spring probe contactor cleaning](https://patents.google.com/patent/US7491069B1/en)
28. [Johnstech — The Importance of Test Contactor Specs, 2024](https://www.johnstech.com/wp-content/uploads/2024/06/Importance-of-Test-Contactor-Specs-14JUN24.pdf)
29. [TestConX 2013 tutorial — Package Test Is a Dirty Business (abstract)](https://www.testconx.org/premium/2013/tutorial-package-test-is-a-dirty-business/)
30. [Texas Instruments — Flip Chip Ball Grid Array Package Reference Guide, SPRU811A, 2005](https://www.ti.com/lit/pdf/spru811)
31. [iST — PCR conductive rubber sockets](https://www.istgroup.com/en/production/pcr/)
32. [Choi (TSE) — elastomer socket paper, TestConX 2025, session 5](https://www.testconx.org/premium/wp-content/uploads/2025/TestConX2025s5p1Choi_9982.pdf)
33. [Teradyne — UltraFLEX](https://www.teradyne.com/products/ultraflex/)
34. [Cohu — MT9510 XP product sheet](https://www.cohu.com/wp-content/uploads/2023/04/MT9510-XP_Product-Sheet_20230628.pdf)
<!-- refs:end -->

## 檔案

| 檔案 | 用途 |
|---|---|
| `index.html` | 版面與樣式 |
| `model.js` | 彈簧針接觸力、接觸電阻、誤判、產出公式（純函式） |
| `scene.js` | 3D 場景：測試頭、彈簧針座、載板、測試座、晶片、分類機、料盤 |
| `main.js` | 模擬迴圈、控制項、2D 圖表、標籤、導覽 |
| `sources.js` | 每個參數的模擬值、公開資料的典型範圍和出處（`python make_refs.py` 會把它寫進這份 README） |
| `narration.py`、`narration.js`、`audio/` | 導覽旁白（與探針卡那一頁同一套 Gemini TTS 加 whisper 檢查） |

Built with Claude Opus 5.5.
