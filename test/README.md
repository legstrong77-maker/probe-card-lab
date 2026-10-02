# 出貨前測試實驗室 · Test Lab

**▶ Live：https://legstrong77-maker.github.io/probe-card-lab/test/**

一片探針卡主板焊好 MLO 之後，出貨前要過好幾關測試。這一頁把六關排成一條 U 字形產線，每一關看的東西不一樣，抓得到的缺陷也不一樣。

**六站**

1. **光學檢查（AOI）**：相機看得出少件、極性、偏移；看不出阻值，也看不到 MLO 底下。可以調相機解析度，太粗就看不清極性標記。
2. **飛針測試**：探針飛到零件兩端一顆一顆量。電阻旁邊有並聯路徑時要開「護衛」；容許誤差設太緊，好零件會被誤判，設太鬆，錯件會被放過。
3. **網路測試**：每條網路量導通、網路之間量絕緣；電源路徑用四線量測扣掉探針接觸電阻，才看得出少了幾根導通孔。絕緣測試電壓太低，有些漏電還不會出現。
4. **X 光**：用真實的衰減係數和連續光譜算出影像。空洞、橋接看得清楚；枕頭效應要斜著拍；管電壓太低，錫球不透光。
5. **平整度量測**：在 MLO 表面自動對焦，扣掉傾斜後算平整度；點太少會量不出彎曲。
6. **上機診斷**：裝上跟客戶同型號、同樣儀器配置的測試機跑診斷程式；配置不同，有些通道就沒測到。

**怎麼玩**

- 在「放進缺陷」選幾個缺陷（12 種），按「▶ 跑一遍產線」，板子會一站一站走，抓到的缺陷會標在板子上，最後列出流到客戶端的缺陷和後果。
- 點表格上方的站名可以跳過那一站，看哪些缺陷會流出去。
- 點「▶ Guided tour」會跑一段有旁白的導覽。
- 網址加 `?st=4` 會直接打開第 5 站（平整度），其他站依此類推（0–5）。

What each pre-shipment test on a probe-card PCB with its MLO can and cannot catch: AOI, flying probe with guarding, net test with 4-wire Kelvin and high-voltage isolation, X-ray from real attenuation data, autofocus flatness, and diagnostics on a tester set up like the customer's.

> 個人作品，示意用途。量測原理是真的，板子、缺陷和數字是簡化過的例子；設備規格引用公開型錄的最佳值，不是任何公司的實際規格或流程，也不是官方資料。
> Personal, unofficial demo. The measurement principles are real; the board, the defects and the numbers are simplified examples, not any company's actual specification or process.

<!-- refs:start -->
## 參數依據與參考來源

這是示意模型：六站的量測原理是真的，板子、缺陷和數字是簡化過的例子。下面列出每一站在量什麼、這一頁用的值、公開資料裡的數字和出處。所有來源都是公開文件；設備規格多半是廠商型錄上的最佳值，不是任何公司的實際規格或流程。

### 六站在量什麼

1. **光學檢查（AOI）**：相機拍下零件，跟標準板比對亮度和顏色：少件、錯件、極性、偏移、連錫都看得出來；2D 量不到高度，3D 機型用結構光量高度。公開機型的解析度約 10–20 μm／像素，一張約 30 × 30 mm，每秒檢查 7–26 cm²。 [1] [2]
2. **飛針測試**：探針自己移到測點，不用做專用治具，適合少量多樣和試產的板子。電阻用定電流量，電容、電感用交流定電壓量，二極體量順向電壓；被量的電阻旁邊有並聯路徑時，用「護衛（guard）」把旁邊的電流引開。公開機型每一步 0.02–0.06 秒。 [3] [4] [5] [6] [8]
3. **網路測試**：每一條網路量導通，網路之間量絕緣。IPC-9252A 的 C 級：導通 ≤ 10 Ω、絕緣 ≥ 10 MΩ；自動設備至少加 40 V，很多測試廠用 100 V；太空與軍用的 3/A 級例子是 250 V、≥ 100 MΩ。細間距的飛針機可以打到幾十微米間距的接點，用四線量測抓導通孔斷開造成的微小電阻上升。 [9] [10] [11] [12] [13] [14]
4. **X 光檢查**：錫對 X 光的衰減遠大於銅和板材，所以錫球、橋接、空洞的對比很強。正上方拍看不出空洞在錫球的哪一層；空洞超過錫球影像面積 25 % 判為不良。枕頭效應（錫球和錫膏各自熔化卻沒有融合）建議斜 55–70° 拍，而且 X 光也不保證每顆都抓得到。 [18] [19] [24] [25] [26] [27]
5. **平整度量測**：影像量測儀在表面一點一點自動對焦，量出每點高度，用最小二乘法找出平面、扣掉傾斜，再取最高點和最低點的差。標準的平整度定義是「夾住表面的兩個平行面」，最小二乘法最常用，算出來會比它略大。 [28] [29] [30]
6. **上機診斷**：板子裝上測試機跑板子檢查程式：一顆顆切換繼電器、對通道強迫電流量電壓、強迫小電流量電壓和時間算出電容（C = I·Δt / ΔV）。查誤判時要逐一比對板子、彈簧針塔和測試機本身。探針卡可以壓在短路晶圓或驗證晶圓上，把探針端的迴路接回來。 [33] [34] [35] [36] [37] [38]

### 可調參數對照

| 參數 | 這一頁用的值 | 公開資料 | 來源 |
|---|---|---|---|
| 相機解析度 | 5–40 μm／像素，預設 15 | 公開 3D AOI：15 μm，4 MP 一張 30 × 30.72 mm；其他機型 10、20 μm | [1] [2] |
| AOI 速度 | 15 μm 時每秒 15 cm²，隨像素面積變（示意） | 公開機型每秒 7.1–26.2 cm²，最快 52.3 cm² | [2] |
| 極性標記 | 0.15 mm，至少 4 個像素才判得準（示意） | AOI 的檢查項目包含極性、少件、錯件、偏移、連錫；2D 量不到高度 | [1] [2] |
| 飛針速度 | 每步 0.05 秒 × 400 步 | 公開機型每步 0.02–0.06 秒（2.5 mm 移動）；另一款最快 0.025 秒 | [3] [5] |
| 飛針定位 | — | 重複精度 ±25 μm、最小接點 50 μm、最小間距 150 μm（高精度模式） | [4] |
| 護衛 | 三線護衛：旁邊兩顆 4.7 kΩ，護衛探針 1 Ω | 沒護衛時電流分到並聯路徑；護衛點接地後，旁邊那顆兩端幾乎同電位、沒有電流 | [6] |
| 量測誤差 | 1σ 0.5 %（示意）；好的電阻 ±1 % | 公開的針床式 ICT：有護衛（比 1000:1）時 10 kΩ 為 ±2.5 % | [7] |
| 電阻容許誤差 | ±1–15 %，預設 ±5 % | 判定上下限可以自己設（公開機型 −999.9 % 到 +999.9 %） | [3] |
| 繼電器 | 飛針這一站只量線圈和二極體 | 有些專門測負載板的飛針機，也能量繼電器切換時間和整條通道的導通 | [41] |
| 去耦電容 | 52 顆並聯，少 1 顆總電容只少 1.9 % | 並聯在同一條電源上的電容，在電路上量到的是總和；少件要靠 AOI 看 | [1] [6] |
| 導通上限 | 10 Ω | IPC-9252A：A 級 100 Ω、B 級 50 Ω、C 級 10 Ω | [9] [10] |
| 絕緣下限 | 100 MΩ | IPC-9252A：A 級 500 kΩ、B 級 2 MΩ、C 級 10 MΩ；3/A 級例子 100 MΩ @ 250 V | [9] |
| 絕緣測試電壓 | 5–250 V，預設 100 V | 自動設備至少 40 V，人工至少 200 V；很多測試廠用 100 V；CAF 試驗也用 100 V 量絕緣 | [9] [42] |
| 有殘留物的漏電 | 低電壓約 5 GΩ，30 V 以上開始漏，80 V 時跌破 100 MΩ（示意） | 探針卡 FR-4 走線之間 > 100 MΩ（5 V 下 < 100 nA）；探針卡進料規格例子：針與針之間漏電 < 100 nA | [39] [40] |
| 量測上限 | 100 GΩ | 公開的細間距飛針機：絕緣 1 kΩ–100 GΩ | [11] [12] [13] |
| 細間距 | — | 公開的細間距飛針機：最小間距 34–45 μm、接點 4–15 μm（特定探針） | [11] [13] |
| 四線量測 | 兩線會多算兩個接觸電阻 | 量測導線本身 1–10 mΩ，兩線量測在 10–100 Ω 以下就不可靠；四線把送電流和量電壓分開，接觸壓降不算進去 | [14] |
| 探針接觸電阻 | 每點 10–150 mΩ | 彈簧探針 10–150 mΩ，最常見 20 mΩ | [15] |
| 電源路徑 | 4.0 mΩ；少四分之一的孔變 5.2 mΩ；上下限 ±10 % | 細間距飛針機用四線量測抓「導通孔斷開造成的電阻上升」；導通孔可靠度試驗以電阻變化 10 %（IST）或 5 %（回焊模擬）判失效 | [11] [12] [16] [17] |
| X 光管電壓 | 50–130 kV，預設 90 kV | 公開設備 30–160 kV | [20] [21] |
| 衰減係數 | 錫 60 keV 6.56 cm²/g、銅 1.59；錫球密度 7.49 g/cm³；板材用水和玻璃的平均代替 | 0.6 mm 的錫在 60 keV 只透過約 5.6 %，35 μm 的銅透過約 95 % | [18] [19] [22] [23] |
| X 光光譜 | 鎢靶連續光譜（Kramers 定律），穿過越多材料越「硬」 | 管電壓是最高能量，平均能量低很多；穿過材料後低能量先被吸收 | [18] |
| 空洞上限 | 25 %（錫球影像面積） | IPC-A-610D/E：超過 25 % 為不良；IPC-7095A 依等級和位置 4–36 %；正上方拍無法判斷位置時用最嚴的 | [24] |
| 斜拍角度 | 0–70°；55° 以上才看得出枕頭效應 | 建議 55–70° 斜拍、360° 旋轉；設備最大 70–75°；X 光判枕頭效應不完全可靠 | [25] [26] [27] [20] [21] |
| 偵測器 | 每秒 30 張，可疊加 1–32 張 | 公開設備：6.5 MP、每秒 30 張 | [20] |
| 對焦點數 | 2 × 2 到 15 × 15 點，每點 1 秒（示意） | 每點時間依機型和量測程式而定 |  |
| 高度量測誤差 | 每點 1 μm | 雷射對焦重複性 2σ ≤ 0.5 μm；Z 軸誤差 1.2 + 5L/1000 μm（L 單位 mm） | [28] |
| 平整度定義 | 最小二乘平面的峰谷值 | 標準定義是最小區域（兩平行面）；最小二乘法最常用、結果略大 | [29] |
| 平整度上限 | 38 μm | 2002 年 MLO 例子：整片 ≤ 0.0015 吋（38 μm）；探針卡平面度例子 < 30 μm，進料 ±50 μm | [30] [31] [40] |
| 探針卡分析儀 | 沒有模擬 | 分析儀用影像量探針位置，也量平面度、接觸電阻、漏電和配線 | [32] [40] |
| 上機診斷 | 每個通道 1 mA、繼電器逐顆切換、電源電容 ±10 % | 板子檢查程式：切換繼電器、強迫電流量電壓；電容用 C = I·Δt / ΔV 算；在批量開始、中間、結束都跑 | [33] |
| PMU 量程 | 1 mA | 公開的量測單元晶片：±5 μA、±20 μA、±200 μA、±2 mA（外接可到 ±80 mA）；強迫電流、量電壓 | [35] [36] |
| 同型號、同配置 | 12 個儀器槽要對上這片板子要的儀器 | 診斷程式寫在該型測試機的程式裡、用它自己的儀器；查誤判時要逐一比對板子、彈簧針塔、測試機。「要用跟客戶一樣的機型和配置」是本頁的歸納 | [33] [34] |
| 探針端接回 | — | 探針卡可以放在驗證晶圓上，或用全部接地的短路探針卡，把迴路接回來找開路、短路 | [37] [38] |
| DIS | — | DIS Tech 官網：首批板子良率超過 90 % | [43] |

沒有模擬的部分：功能測試（實際跑晶片的測試程式）、高頻的 TDR 和插入損耗、熱循環後才出現的裂縫（微孔裂縫冷卻後可能又接上，室溫量不到）、X 光的電腦斷層與分層攝影、探針卡分析儀（量探針高度、位置、接觸電阻、漏電）、清潔與外觀檢查。每一站的時間是示意值；設備規格引用的是公開型錄上的最佳值。

### 參考文獻

1. [Omron VT-S730 3D AOI (distributor page) — resolution, field of view, inspection items](https://www.etek-europe.com/divisions/imaging-ndt-x-ray-ct-systems/omron/3d-aoi-systems/omron-vt-s730/)
2. [Koh Young — What is automated optical inspection](https://kohyoungamerica.com/what-is-automated-optical-inspection/)
3. [Takaya APT-1600FD catalogue (2022, distributor copy)](https://accelonix.nl/wp-content/uploads/APT-1600FD-Catalog_2022.4.19_ENU.pdf)
4. [Takaya APT-2600FD flying-probe tester](https://www.takaya-itochu.com/products/apt-2600fd/)
5. [Hioki FA1240 populated-board flying-probe tester](https://www.hioki.com/us-en/products/bare-board/populated-board/id_6638)
6. [Suto (Teradyne) — Principles of Analog In-Circuit Testing, 2012](https://smtnet.com/library/files/upload/PrinciplesofAnalogInCircuitTesting.pdf)
7. [Keysight i3070 Series 6 data sheet (reseller copy)](https://docs.alltest.net/manual/Alltest-Agilent-Keysight-E9902G-Datasheet-29440-.pdf)
8. [Wikipedia — Flying probe](https://en.wikipedia.org/wiki/Flying_probe)
9. [Kolmodin (Gardien) — IPC 9252A Electrical Test Considerations & Military Specifications versus Electrical Test](https://www.smtnet.com/library/files/upload/IPC-9252A-considerations.pdf)
10. [Meraw & Kolmodin (Gardien) — Electrical Test Conditions & Considerations](https://www.electronics.org/system/files/technical_resource/E2&S26_01.pdf)
11. [Hioki FA1817 flying-probe tester (fine pitch, 4-wire open-via detection)](https://www.hioki.com/us-en/products/bare-board/flying-probe/id_6719)
12. [Hioki FA1283 flying-probe tester (4-terminal low resistance for open vias)](https://www.hioki.com/global/products/bare-board/flying-probe/id_6604)
13. [Hioki FA1815-20 flying-probe tester](https://www.hioki.com/global/products/bare-board/flying-probe/id_1266709)
14. [Keithley — Low Level Measurements Handbook, chapter 3 (mirror copy)](https://docs.ampnuts.ru/eevblog.docs/Keithley/Ch3_LowLevMsHandbk.pdf)
15. [Feinmetall ICT/FCT spring-probe catalogue (distributor copy)](https://www.imtts.cz/wp-content/uploads/2021/08/Feinmetall-katalog-ICT-FCT.pdf)
16. [IPC-TM-650 2.6.26A — DC current induced thermal cycling (IST)](https://www.electronics.org/sites/default/files/test_methods_docs/2-6_2-6-26a.pdf)
17. [ATCO — D-coupon testing per IPC-TM-650 2.6.27 for microvia reliability](https://www.atco-us.com/2023/12/26/ipc-d-coupon-testing-per-ipc-tm-650-2-6-27-for-microvia-reliability-verification/)
18. [NIST X-ray mass attenuation coefficients — tin (SRD 126)](https://physics.nist.gov/PhysRefData/XrayMassCoef/ElemTab/z50.html)
19. [NIST X-ray mass attenuation coefficients — copper](https://physics.nist.gov/PhysRefData/XrayMassCoef/ElemTab/z29.html)
20. [Nordson Quadra 7 Pro X-ray data sheet (distributor copy)](https://amtest-group.com/wp-content/uploads/2023/04/Quadra-7-Pro-Datasheet-Nordson-TI_XRAY_M.pdf)
21. [Nikon XT V 160 electronics X-ray system (distributor page)](https://www.exceltechnologies.com/measuring/x-ray-and-ct-systems/nikon-xt-v-160-electronics-x-ray-system)
22. [MG Chemicals — SAC305 solder technical data sheet](https://www.mgchemicals.com/downloads/tds/tds-4925-4926.pdf)
23. [NIST X-ray mass attenuation coefficients — water and borosilicate glass (laminate stand-ins)](https://physics.nist.gov/PhysRefData/XrayMassCoef/ComTab/pyrex.html)
24. [Balsavar (Agilent) — X-ray Inspection of Voids in BGA Joints with Respect to the IPC-7095A Specification, IPC APEX 2006](https://www.electronics.org/system/files/technical_resource/E16&S16-02.pdf)
25. [Feng et al. (Flextronics, Dage) — Modern 2D X-ray Tackles BGA Defects, I-Connect007](https://iconnect007.com/index.php/article/44225/modern-2d-xndashray-tackles-bga-defects/44228)
26. [Bruno & Gustafson (Ericsson) — Head-on-Pillow Defect Detection: X-ray Inspection Limitations](https://smtnet.com/library/files/upload/S03-2.pdf)
27. [Castellanos et al. (Flextronics) — Head in Pillow X-ray Inspection at Flextronics](https://smtnet.com/library/files/upload/head-in-pillow-inspection-flextronics.pdf)
28. [Nikon NEXIV VMZ-S video measuring system — specifications](https://nikon.com/products/industrial-metrology/lineup/nexiv/vmzr_series/vmzr_6555/spec.htm)
29. [Srinivasan, Shakarji & Morse (NIST) — On the Enduring Appeal of Least-squares Fitting in Computational Coordinate Metrology](https://tsapps.nist.gov/publication/get_pdf.cfm?pub_id=907559)
30. [Fulton & Pardee (Wentworth) — Using MLOs to Build Vertical Technology Space Transformers, SWTW 2002](https://www.swtest.org/swtw_library/2002proc/PDF/S04_03.pdf)
31. [Wolfe et al. (TI, MJC) — 50um In-line Pitch Vertical Probe Card, SWTW 2009](https://www.swtest.org/swtw_library/2009proc/PDF/S08_02_Wolfe_SWTW2009.pdf)
32. [Schwartz — Measurement Repeatability Key to Probe-Card Metrology, 1998](https://www.electronicdesign.com/home/article/21200247/measurement-repeatability-key-to-probe-card-metrology)
33. [Martinez, Perez & Dela Cruz (TI Philippines) — Finding the Sweet Spot: Non-Genuine Load Board Check Fails, ASEMEP](https://seipi.org.ph/wp-content/uploads/2025/05/FINDING-THESWEET-SPOT-A-DEEP-DIVE-ANALYSIS-ON-NON-GENUINELOAD-BOARD-CHECK-FAILS.pdf)
34. [Teradyne — software services (DIB Diagnostics, DIB Health Monitor)](https://www.teradyne.com/services/teradyne-software-services/)
35. [Jung, Kim & Kim — Cost Effective Test Methodology Using PMU for ATE Systems, VLSICS 2014](https://aircconline.com/vlsics/V5N1/5114vlsi02.pdf)
36. [Analog Devices AD5522 — quad parametric measurement unit data sheet](https://www.analog.com/media/en/technical-documentation/data-sheets/ad5522.pdf)
37. [US6911814B2 (FormFactor) — probe card verification wafer](https://patents.google.com/patent/US6911814B2/en)
38. [US11821919B2 (Winbond) — short-circuit probe card for locating tester faults](https://patents.google.com/patent/US11821919B2/en)
39. [Tektronix — Probe Card Tutorial](https://www.tek.com/en/documents/whitepaper/probe-card-tutorial)
40. [Mair & Copeland (TI) — probe-card incoming checks, SWTW 2015](https://www.swtest.org/swtw_library/2015proc/PDF/S08_01_Mair_SWTW2015R.pdf)
41. [Acculogic — load board test (flying prober for load boards)](https://www.acculogic.com/products/load-board-test)
42. [IPC-TM-650 2.6.25C — conductive anodic filament (CAF) test](https://www.electronics.org/sites/default/files/test_methods_docs/2.6.25C.pdf)
43. [DIS Tech — Our technologies](https://www.dis.tech/technologies-and-products/our-technologies)
<!-- refs:end -->

## 檔案

| 檔案 | 用途 |
|---|---|
| `index.html` | 版面與樣式 |
| `model.js` | 每一站的量測模型：AOI 像素、三線護衛、兩線／四線、絕緣、X 光衰減與光譜、平整度平面擬合、上機診斷（純函式，可用 `node test/check.mjs` 檢查） |
| `scene.js` | 3D 產線：板子、六台機台、U 字形路線 |
| `main.js` | 各站的讀值畫面（含 X 光影像的光線追蹤）、缺陷表、跑產線、導覽 |
| `sources.js` | 每一站的原理、每個參數的值、公開資料的數字和出處（`python make_refs.py` 會把它寫進這份 README） |
| `narration.py`、`narration.js`、`audio/` | 導覽旁白 |

Built with Claude Opus 5.5.
