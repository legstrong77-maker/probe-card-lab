"""Narration for the guided tour.

  python narration.py tts   # synthesize lines (edge-tts), retime the tour, write narration.js / narration.json
  python narration.py mix   # mux narration into build/silent.mp4 -> probe-card-lab.mp4

Each line may carry `at` (a time on the original tour timeline). If the lines before it are still
talking at that moment, the tour is stretched by inserting a pause at `ins` (default: `at`), so the
picture always waits for the voice instead of the two drifting apart.
"""
import asyncio, hashlib, json, os, subprocess, sys

import edge_tts

HERE = os.path.dirname(os.path.abspath(__file__))
sys.stdout.reconfigure(encoding="utf-8")
AUDIO = os.path.join(HERE, "audio")
VOICE, RATE = "zh-TW-HsiaoChenNeural", "+12%"
GAP, LEAD = 0.18, 0.15          # pause between lines, delay after an anchor

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
    return hashlib.sha1(f"{VOICE}|{RATE}|{text}".encode()).hexdigest()[:10]


def duration(path):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path])
    return float(out.strip())


async def synth_all():
    os.makedirs(AUDIO, exist_ok=True)
    want = {f"{key(l['zh'])}.mp3" for l in LINES}
    for f in os.listdir(AUDIO):
        if f.endswith(".mp3") and f not in want:
            os.remove(os.path.join(AUDIO, f))
    for l in LINES:
        path = os.path.join(AUDIO, f"{key(l['zh'])}.mp3")
        l["file"] = path
        if os.path.exists(path):
            continue
        for attempt in range(4):
            try:
                await edge_tts.Communicate(l["zh"], VOICE, rate=RATE).save(path)
                break
            except Exception as e:  # edge-tts drops the connection now and then; retrying fixes it
                print("retry", attempt + 1, e)
                await asyncio.sleep(2)
        else:
            sys.exit(f"TTS failed: {l['zh']}")
        print("synth", l["zh"])


def tts():
    asyncio.run(synth_all())
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
