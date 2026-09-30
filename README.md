# 探針卡拆解實驗室 · Probe Card Lab

**▶ Live：https://legstrong77-maker.github.io/probe-card-lab/**

這是一張在瀏覽器裡就能拆開的晶圓針測（CP）探針卡。

- **拆解**：從彈簧針塔一路拆到晶圓，每一層都有標籤。
- **訊號路徑**：追一條訊號，從測試機走到晶粒。
- **步進速度**：推高步進速度，看晶圓圖填滿。
- **剖開探針頭**：看兩片導板中間的垂直探針。
- **慢動作**：時間放慢到 1/10，看針尖刮過鋁墊。
- **比較**：同一過驅量下，懸臂針和垂直針的針壓、針痕、接觸電阻。
- **平整度與過驅量**：凍結時間，讓 MLO 載板翹曲，再加大過驅量，直到探針撐不住。

點右下角「▶ Guided tour」會跑一段有旁白的導覽，也可以自己拖滑桿、轉視角。

A wafer-sort probe card you can take apart in the browser. It covers:

- exploding the stack
- tracing a signal from tester to die
- pushing the index rate
- cutting the probe head open
- slowing time to 1/10
- comparing cantilever and vertical probes at the same overdrive
- warping the substrate and cranking the overdrive until something breaks

> 個人作品，示意用途。尺寸有放大、物理模型有簡化，所有數字都是業界通用的量級，不是任何產品或專案的實際規格，也不是官方資料。
> Personal, unofficial demo. Geometry is exaggerated, the physics is simplified, and every number is a generic, textbook-level value.

## 檔案

| 檔案 | 用途 |
|---|---|
| `index.html` | 整個模擬器（three.js，從 CDN 載入） |
| `narration.js`、`audio/` | 導覽旁白與時間軸（由 `narration.py` 產生） |
| `narration.py` | 用 Gemini 3.8 Flash Lite TTS（Kore）合成旁白，每句錄一次，用本機 faster-whisper 聽寫比對，念錯就重錄，挑錯字最少的一次。接著依句長拉長導覽時間軸，把聲音混進影片。API 金鑰從 `GEMINI_API_KEY` 或上層資料夾的 `.env` 讀取，不在 repo 裡 |
| `record.py` | 用無頭 Chromium 逐幀錄下導覽，輸出 1080p30 MP4 |

## 重新錄影片

```bash
pip install playwright google-genai faster-whisper pypinyin soundfile && playwright install chromium   # 也需要 ffmpeg、CUDA GPU（whisper 檢查）
# 沒有 Gemini 金鑰時：NARR_ENGINE=edge 改用 edge-tts
python narration.py tts   # 改了旁白才需要
python record.py          # -> build/silent.mp4 -> probe-card-lab.mp4（含旁白）
```

Built with Claude Opus 5.5.
