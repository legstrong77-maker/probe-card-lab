"""Narration for the guided tour.

  python narration.py tts   # synthesize lines, retime the tour, write narration.js / narration.json
  python narration.py mix   # mux narration into build/silent.mp4 -> probe-card-lab.mp4

Voice: Gemini 3.8 Flash TTS (voice Kore). Each line gets one take; local faster-whisper transcribes it,
and if it hears a misread the line is retaken (up to four) and the take closest to the script wins. The API key comes
from GEMINI_API_KEY or a `.env` file in this folder or any parent — it is never stored in the repo.
If the free key runs out of its daily quota and GEMINI_API_KEY_PAID (a key from a billed project) is set,
the run switches to it and prints what it cost. Set NARR_ENGINE=edge to fall back to edge-tts.

Each line may carry `at` (a time on the original tour timeline). If the lines before it are still
talking at that moment, the tour is stretched by inserting a pause at `ins` (default: `at`), so the
picture always waits for the voice instead of the two drifting apart.
"""
import hashlib, json, os, re, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.stdout.reconfigure(encoding="utf-8")
AUDIO = os.path.join(HERE, "audio")
TAKES_DIR = os.path.join(HERE, "build", "tts")
GAP, LEAD = 0.18, 0.15          # pause between lines, delay after an anchor

ENGINE = os.environ.get("NARR_ENGINE", "gemini")
GEMINI_MODEL, GEMINI_VOICE = "gemini-3.8-flash-tts", "Kore"
# Only the TRANSCRIPT is spoken. Plain "Say ...:" prompts get read aloud, and extra pronunciation
# notes made the model ad-lib, so the notes stay short and about delivery only.
STYLE = ("### DIRECTOR'S NOTES\n"
         "Style: natural Taiwan Mandarin with a Taiwanese accent. A clear, confident, friendly young female host "
         "of a semiconductor tech explainer video. Crisp articulation, brisk energetic pace, no long pauses.\n\n"
         "### TRANSCRIPT\n")
SPACING = 7.0        # free tier allows 10 requests/min per model
TAKES, MAX_TAKES, CER_OK = 1, 4, 0.08     # one take per line; retake only when whisper hears a misread (quota is shared)
EDGE_VOICE, EDGE_RATE = "zh-TW-HsiaoChenNeural", "+12%"

LINES = [
    dict(at=0.3, zh="晶圓針測：探針卡一格一格地點測晶粒。", en="Wafer sort: a probe card testing the wafer, die by die."),
    dict(at=4.2, ins=3.3, zh="把整張卡拆開。", en="Take the whole card apart."),
    dict(zh="補強板、主板、MLO 載板、板背支撐，這四層是 DIS 做的。", en="Stiffener, main PCB, MLO substrate, backer — the four layers DIS builds."),
    dict(at=9.8, ins=8.9, zh="追一條訊號：測試機、主板、MLO 載板，", en="Follow one signal: tester, main PCB, MLO substrate,"),
    dict(zh="最後從探針落到晶粒上。", en="and finally down a probe onto the die."),
    dict(at=13.4, ins=12.5, zh="推高步進速度，晶圓圖一下子就填滿了。", en="Push the index rate and the wafer map fills right in."),
    dict(at=19.8, ins=19.8, zh="剖開探針頭：兩片導板中間，夾著一排排垂直探針。", en="Cut the probe head open: rows of vertical probes between two guide plates."),
    dict(at=24.1, ins=23.4, zh="時間放慢十倍。", en="Slow time down ten times."),
    dict(zh="載台頂上來，針尖碰到鋁墊還要再壓，這叫過驅量；", en="The chuck rises; after touching the pad it keeps pushing — that's overdrive."),
    dict(zh="探針彎曲，針尖在鋁墊上刮出針痕。", en="The probes bend and every tip scrubs a mark into its pad."),
    dict(zh="右邊：同樣過驅量下，懸臂針對垂直針。", en="On the right: cantilever vs vertical at the same overdrive."),
    dict(at=30.8, ins=28.5, zh="凍結時間，讓 MLO 載板翹曲一百微米。", en="Freeze time and warp the MLO substrate by 100 μm."),
    dict(at=34.5, ins=34.45, zh="翹起那一側的探針碰不到晶粒，變紅了。", en="Probes on the high side no longer reach the die — they turn red."),
    dict(at=35.8, ins=35.0, zh="那就加大過驅量來補償⋯⋯", en="So crank up the overdrive to compensate…"),
    dict(at=38.3, ins=38.3, zh="懸臂針刮出鋁墊、彎到回不來，垂直探針也超過降伏——壞了。", en="The cantilever scrubs off the pad and bends for good, the vertical probes pass yield — broken."),
    dict(at=42.6, ins=42.4, cap=False, zh="下一步，我想找出它的極限，所以會做成遊戲。", en="Next I want to find where it breaks, so a game is coming."),
    dict(cap=False, zh="用 Claude Opus 5.5 做的，直接在瀏覽器裡就能玩。", en="Built with Claude Opus 5.5 — it runs live in your browser."),
]
TOUR_END = 48.5      # original tour length
TAIL = 1.6           # hold after the last word


def key(text):
    who = f"gemini|{GEMINI_MODEL}|{GEMINI_VOICE}|{STYLE}" if ENGINE == "gemini" else f"edge|{EDGE_VOICE}|{EDGE_RATE}"
    return hashlib.sha1(f"{who}|{text}".encode()).hexdigest()[:10]


def duration(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path])
    return float(out.strip())


# ---------------------------------------------------------------- Gemini TTS + whisper check
def gemini_key(name="GEMINI_API_KEY", required=True):
    if os.environ.get(name):
        return os.environ[name]
    d = HERE
    while True:
        env = os.path.join(d, ".env")
        if os.path.exists(env):
            for ln in open(env, encoding="utf-8"):
                if ln.startswith(name + "="):
                    return ln.split("=", 1)[1].strip()
        up = os.path.dirname(d)
        if up == d:
            if required:
                sys.exit(f"{name} not found (env var or .env)")
            return None
        d = up


# Free key first. If it hits its daily limit and GEMINI_API_KEY_PAID (a key from a billed project) exists,
# switch to that key for the rest of the run and keep count of what it cost.
PRICE_IN, PRICE_OUT, AUDIO_TOK_PER_S = 0.50, 9.00, 25      # USD per 1M tokens, 3.8 Flash TTS until 2026-12-31
_last_call = [0.0]
_api = {"clients": [], "i": 0, "paid_req": 0, "paid_audio_s": 0.0, "paid_in_tok": 0}


def gemini_synth(_unused, types, text):
    import io, numpy as np, soundfile as sf
    cfg = types.GenerateContentConfig(
        response_modalities=["AUDIO"],
        speech_config=types.SpeechConfig(voice_config=types.VoiceConfig(
            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=GEMINI_VOICE))))
    for attempt in range(8):
        time.sleep(max(0.0, _last_call[0] + SPACING - time.time()))
        _last_call[0] = time.time()
        client, paid = _api["clients"][_api["i"]], _api["i"] > 0
        try:
            r = client.models.generate_content(model=GEMINI_MODEL, contents=STYLE + text, config=cfg)
            part = r.candidates[0].content.parts[0].inline_data
            if part.data[:4] == b"RIFF":                       # WAV with header
                pcm, rate = sf.read(io.BytesIO(part.data), dtype="float32")
            else:
                mt, rate = part.mime_type or "", 24000
                if "rate=" in mt:
                    rate = int(mt.split("rate=")[1].split(";")[0])
                pcm = np.frombuffer(part.data, dtype="<i2").astype(np.float32) / 32768.0
            if paid:
                um = getattr(r, "usage_metadata", None)
                _api["paid_req"] += 1
                _api["paid_audio_s"] += len(pcm) / rate
                _api["paid_in_tok"] += getattr(um, "prompt_token_count", None) or 120
            return pcm, rate
        except Exception as e:
            msg = str(e)
            m = re.search(r"retryDelay\W+(\d+(?:\.\d+)?)(ms|s)\b", msg)
            wait = (float(m.group(1)) / (1000 if m.group(2) == "ms" else 1) + 2) if m else (30 if "429" in msg else 5)
            if "PerDay" in msg:
                if _api["i"] + 1 < len(_api["clients"]):
                    _api["i"] += 1
                    print("  free daily quota used up — switching to the paid key", flush=True)
                    continue
                sys.exit("Gemini TTS daily quota is used up — add GEMINI_API_KEY_PAID to .env, try tomorrow, or set NARR_ENGINE=edge")
            wait = min(wait, 90)          # the key is shared with other projects; per-minute limits clear quickly
            print(f"  retry {attempt + 1} in {wait}s: {type(e).__name__} {msg[:90]}", flush=True)
            time.sleep(wait)
    sys.exit("Gemini TTS failed repeatedly")


DIG = dict(zip("0123456789", "零一二三四五六七八九"))


def syllables(text):
    """Toneless pinyin for Chinese, single letters for Latin, so ASR homophones don't count as misreads."""
    from pypinyin import lazy_pinyin
    text = re.sub(r"[0-9]", lambda m: DIG[m.group(0)], text)
    out = []
    for tok in re.findall(r"[A-Za-z]+|[^A-Za-z]+", text):
        if tok.isascii() and tok.isalpha():
            out += list(tok.lower())
        else:
            out += [p for p in (re.sub(r"[^a-z]", "", s.lower()) for s in lazy_pinyin(tok, errors="ignore")) if p]
    return out


def edit(a, b):
    d = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        prev, d[0] = d[0], i
        for j, y in enumerate(b, 1):
            prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (x != y))
    return d[len(b)]


def clean_to_mp3(wav_path, mp3_path):
    """Trim silence at both ends, short fades, normalize, encode mono MP3."""
    import numpy as np, soundfile as sf
    w, sr = sf.read(wav_path, dtype="float32")
    hop = int(sr * 0.01)
    rms = np.array([np.sqrt(np.mean(w[i * hop:(i + 1) * hop] ** 2) + 1e-12) for i in range(len(w) // hop)])
    db = 20 * np.log10(rms / (rms.max() + 1e-12))
    v = np.where(db > -38)[0]
    s0, s1 = (v[0] * hop, (v[-1] + 1) * hop) if len(v) else (0, len(w))
    w = w[max(0, s0 - int(0.04 * sr)):min(len(w), s1 + int(0.12 * sr))].copy()
    fi, fo = int(0.012 * sr), int(0.08 * sr)
    w[:fi] *= np.linspace(0, 1, fi)
    w[-fo:] *= np.linspace(1, 0, fo) ** 2
    w = (w - w.mean()) * (0.89 / (np.abs(w).max() + 1e-9))
    tmp = mp3_path + ".wav"
    sf.write(tmp, w.astype(np.float32), sr, subtype="PCM_16")
    subprocess.check_call(["ffmpeg", "-y", "-v", "error", "-i", tmp, "-ac", "1", "-c:a", "libmp3lame", "-q:a", "3", mp3_path])
    os.remove(tmp)


def synth_gemini(todo):
    import soundfile as sf
    from google import genai
    from google.genai import types
    from faster_whisper import WhisperModel
    _api["clients"] = [genai.Client(api_key=gemini_key())]
    paid_key = gemini_key("GEMINI_API_KEY_PAID", required=False)
    if paid_key:
        _api["clients"].append(genai.Client(api_key=paid_key))
    client = None
    asr = WhisperModel("large-v3", device="cuda", compute_type="float16")
    os.makedirs(TAKES_DIR, exist_ok=True)
    report = []
    for l in todo:
        k, ref = key(l["zh"]), syllables(l["zh"])
        best = None
        for t in range(MAX_TAKES):
            wav = os.path.join(TAKES_DIR, f"{k}_t{t}.wav")
            if not os.path.exists(wav):
                pcm, rate = gemini_synth(client, types, l.get("tts", l["zh"]))
                sf.write(wav, pcm, rate, subtype="PCM_16")
            segs, _ = asr.transcribe(wav, language="zh", beam_size=5, initial_prompt="以下是繁體中文的句子。")
            hyp = "".join(s.text for s in segs).strip()
            cer = edit(ref, syllables(hyp)) / max(1, len(ref))
            print(f"  take {t}  cer={cer:.2f}  {hyp}", flush=True)
            if best is None or cer < best[0]:
                best = (cer, wav, hyp)
            if t + 1 >= TAKES and best[0] <= CER_OK:
                break
        clean_to_mp3(best[1], l["file"])
        flag = "OK   " if best[0] <= CER_OK else "CHECK"
        print(f"{flag} {l['zh']}  (cer {best[0]:.2f})", flush=True)
        report.append(dict(zh=l["zh"], heard=best[2], cer=round(best[0], 3), flag=flag.strip()))
    with open(os.path.join(HERE, "build", "tts_report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=1)
    if _api["paid_req"]:
        usd = _api["paid_audio_s"] * AUDIO_TOK_PER_S / 1e6 * PRICE_OUT + _api["paid_in_tok"] / 1e6 * PRICE_IN
        print(f"paid key: {_api['paid_req']} requests, {_api['paid_audio_s']:.0f} s audio ≈ US${usd:.3f}", flush=True)


# ---------------------------------------------------------------- edge-tts fallback
def synth_edge(todo):
    import asyncio, edge_tts

    async def run():
        for l in todo:
            for attempt in range(4):
                try:
                    await edge_tts.Communicate(l["zh"], EDGE_VOICE, rate=EDGE_RATE).save(l["file"])
                    break
                except Exception as e:  # edge-tts drops the connection now and then; retrying fixes it
                    print("retry", attempt + 1, e)
                    await asyncio.sleep(2)
            else:
                sys.exit(f"TTS failed: {l['zh']}")
            print("synth", l["zh"])
    asyncio.run(run())


def synth_all():
    os.makedirs(AUDIO, exist_ok=True)
    for l in LINES:
        l["file"] = os.path.join(AUDIO, f"{key(l['zh'])}.mp3")
    todo = [l for l in LINES if not os.path.exists(l["file"])]
    if todo:
        (synth_gemini if ENGINE == "gemini" else synth_edge)(todo)
    # only clear the previous voice once every new line exists, so a failed run leaves the old narration working
    want = {os.path.basename(l["file"]) for l in LINES}
    for f in os.listdir(AUDIO):
        if f.endswith(".mp3") and f not in want:
            os.remove(os.path.join(AUDIO, f))


def tts():
    synth_all()
    retime = []                                            # [(original t, extra seconds)]
    T = lambda t: t + sum(e for a, e in retime if t >= a)
    cursor, out = 0.0, []
    for l in LINES:
        d = duration(l["file"])
        if "at" in l:
            assert l.get("ins", l["at"]) <= l["at"], l["zh"]
            start = T(l["at"]) + LEAD
            late = cursor + GAP - start
            if late > 0.02:
                retime.append((l.get("ins", l["at"]), round(late, 3)))
                start = T(l["at"]) + LEAD
        else:
            start = cursor + GAP
        out.append(dict(t=round(start, 3), d=round(d, 3), zh=l["zh"], en=l["en"], cap=l.get("cap", True),
                        src="audio/" + os.path.basename(l["file"]).replace("\\", "/")))
        cursor = start + d
    end = round(max(T(TOUR_END), cursor + TAIL), 3)
    data = dict(retime=retime, lines=out, end=end)
    with open(os.path.join(HERE, "narration.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    with open(os.path.join(HERE, "narration.js"), "w", encoding="utf-8") as f:
        f.write("// generated by narration.py — voice lines + how far the tour stretches to fit them\n")
        f.write("window.NARR = " + json.dumps(data, ensure_ascii=False) + ";\n")
    for a, e in retime:
        print(f"  stretch +{e:.2f}s at t={a}")
    print(f"{len(out)} lines, tour length {end:.1f}s")


def mix():
    data = json.load(open(os.path.join(HERE, "narration.json"), encoding="utf-8"))
    silent = os.path.join(HERE, "build", "silent.mp4")
    final = os.path.join(HERE, "probe-card-lab.mp4")
    cmd = ["ffmpeg", "-y", "-v", "error", "-i", silent]
    parts = []
    for i, l in enumerate(data["lines"]):
        cmd += ["-i", os.path.join(HERE, l["src"])]
        ms = int(l["t"] * 1000)
        parts.append(f"[{i + 1}:a]aresample=48000,adelay={ms}|{ms}[a{i}]")
    n = len(data["lines"])
    graph = ";".join(parts) + ";" + "".join(f"[a{i}]" for i in range(n)) + \
        f"amix=inputs={n}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad[aout]"
    cmd += ["-filter_complex", graph, "-map", "0:v", "-map", "[aout]", "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", final]
    subprocess.check_call(cmd)
    print("wrote", final)


if __name__ == "__main__":
    {"tts": tts, "mix": mix}[sys.argv[1] if len(sys.argv) > 1 else "tts"]()
