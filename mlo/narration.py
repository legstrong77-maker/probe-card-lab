"""Narration for the MLO Lab tour.

  python mlo/narration.py tts            # synthesize the lines, fit the tour to them, write mlo/narration.js
  python mlo/narration.py mix [name]     # lay the narration over mlo/build/silent[-name].mp4 -> mlo/mlo-lab[-name].mp4

Same voice and the same Gemini TTS + whisper check as ../narration.py; only the script and the file locations differ.
A line with `at` is pinned to that moment of the tour (original timeline); `ins` says where the tour may
pause if the previous lines run long. Lines without `at` follow the one before.
`marks` are words whose spoken moment the tour needs: here the eight build-up steps, so each step
of the build animation starts as its name is said (found with whisper word timestamps).
"""
import json, os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.stdout.reconfigure(encoding="utf-8")
import narration as N

AUDIO = os.path.join(HERE, "audio")
LINES = [
    dict(at=0.3, zh="探針卡裡有一片 MLO 載板：上面接探針，下面接主板。", en="Inside a probe card sits an MLO substrate: probes on top, the PCB underneath."),
    dict(at=6.4, ins=5.6, zh="它的工作叫扇出：把八十微米的探針間距，一路攤開到主板上一毫米的錫球。", en="Its job is fan-out: spreading an 80-micron probe pitch out to millimetre solder balls on the PCB."),
    dict(at=11.4, ins=10.6, zh="拆開來看：中間是核心板，上下各壓了好幾層增層，", en="Take it apart: a core in the middle, several build-up layers on each side,"),
    dict(zh="有細線路的訊號層，也有整片的電源層和地層。", en="fine-line signal layers, and solid power and ground planes."),
    dict(at=19.3, ins=18.6, zh="剖開來，層與層之間靠雷射打出來的微孔相連，一層疊一層。", en="Cut it open: laser-drilled microvias join the layers, stacked one on another."),
    dict(at=25.2, ins=24.4, marks=["增層膜", "雷射", "除膠渣", "化學銅"], zh="每一層是這樣做出來的：壓上增層膜、雷射鑽孔、除膠渣、長一層化學銅，", en="Each layer is made like this: laminate a film, laser-drill the vias, desmear, grow a seed of copper,"),
    dict(marks=["光阻", "電鍍", "去光阻", "蝕刻"], zh="上光阻、電鍍、去光阻、把多餘的銅蝕刻掉。一層做完，再做下一層。", en="add resist, plate, strip, and etch away the rest. One layer done, on to the next."),
    dict(at=44.4, ins=43.6, zh="探針越密，中間幾排就越難拉出來，", en="The finer the pitch, the harder it is to route the inner rows out,"),
    dict(at=47.9, ins=47.2, zh="得用更細的線，或更多層。", en="so you need finer lines, or more layers."),
    dict(at=51.2, ins=50.4, zh="加熱到一百二十五度：有機材料膨脹得比矽多，角落的探針就對不準了。", en="Heat it to 125 degrees: the organic substrate grows more than silicon, and the corner probes miss their pads."),
    dict(at=54.9, ins=54.2, zh="所以探針圖案會先照測試溫度縮放。", en="So the probe pattern is pre-scaled for the test temperature."),
    dict(at=58.0, ins=57.2, zh="上下兩面的銅如果不平衡，冷卻之後整片就會翹起來。", en="And if the copper on the two sides is unbalanced, the substrate bows as it cools."),
    dict(at=64.0, ins=63.4, cap=False, zh="MLO 平不平、準不準，決定了上萬支探針能不能同時碰好。", en="How flat and true the MLO is decides whether tens of thousands of probes can land at once."),
    dict(cap=False, zh="用 Claude Opus 5.5 做的，直接在瀏覽器裡就能玩。", en="Built with Claude Opus 5.5 — it runs live in your browser."),
]
TOUR_END = 69.5


def word_times(lines):
    """Seconds into each line's clip at which each of its `marks` starts (whisper word timestamps,
    matched by toneless pinyin so homophones the recogniser picks still count)."""
    from faster_whisper import WhisperModel
    asr = WhisperModel("large-v3", device="cuda", compute_type="float16")
    out = {}
    for l in lines:
        segs, _ = asr.transcribe(l["file"], language="zh", beam_size=5, word_timestamps=True, initial_prompt=l["zh"])
        chars = []                                      # (syllable, start) for every spoken character
        for seg in segs:
            for w in seg.words:
                txt = [c for c in w.word.strip() if N.syllables(c)]
                for i, c in enumerate(txt):
                    chars.append((N.syllables(c)[0], w.start + (w.end - w.start) * i / len(txt)))
        syl, pos, got = [c[0] for c in chars], 0, []
        for m in l["marks"]:
            want = N.syllables(m)
            cands = [(N.edit(want, syl[i:i + len(want)]), i) for i in range(pos, len(syl) - len(want) + 1)]
            cost, i = min(cands)
            assert cost <= len(want) // 2, f"mark {m} not heard in {l['zh']}"
            got.append(round(chars[i][1], 3)); pos = i + len(want)
        out[l["zh"]] = got
        print("  marks", " ".join(f"{m}@{t:.2f}" for m, t in zip(l["marks"], got)))
    return out


def tts():
    os.makedirs(AUDIO, exist_ok=True)
    for l in LINES:
        l["file"] = os.path.join(AUDIO, f"{N.key(l['zh'])}.mp3")
    for l in LINES:                                     # a line shared with the Probe Card Lab tour is reused, not re-recorded
        shared = os.path.join(N.AUDIO, os.path.basename(l["file"]))
        if not os.path.exists(l["file"]) and os.path.exists(shared):
            shutil.copyfile(shared, l["file"])
    todo = [l for l in LINES if not os.path.exists(l["file"])]
    print(f"{len(LINES)} lines, {len(todo)} to synthesize", flush=True)
    if todo:
        N.synth_gemini(todo)
    want = {os.path.basename(l["file"]) for l in LINES}
    for f in os.listdir(AUDIO):
        if f.endswith(".mp3") and f not in want:
            os.remove(os.path.join(AUDIO, f))
    retime = []
    T = lambda t: t + sum(e for a, e in retime if t >= a)
    cursor, out = 0.0, []
    for l in LINES:
        d = N.duration(l["file"])
        if "at" in l:
            assert l.get("ins", l["at"]) <= l["at"], l["zh"]
            start = T(l["at"]) + N.LEAD
            late = cursor + N.GAP - start
            if late > 0.02:
                retime.append((l.get("ins", l["at"]), round(late, 3)))
                start = T(l["at"]) + N.LEAD
        else:
            start = cursor + N.GAP
        out.append(dict(t=round(start, 3), d=round(d, 3), zh=l["zh"], en=l["en"], cap=l.get("cap", True), src="audio/" + os.path.basename(l["file"])))
        cursor = start + d
    end = round(max(T(TOUR_END), cursor + N.TAIL), 3)
    marked = [l for l in LINES if l.get("marks")]
    wt = word_times(marked) if marked else {}
    marks = [round(o["t"] + t, 3) for o in out for t in wt.get(o["zh"], [])]
    data = dict(retime=retime, lines=out, end=end, marks=marks)
    with open(os.path.join(HERE, "narration.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    with open(os.path.join(HERE, "narration.js"), "w", encoding="utf-8", newline="\n") as f:
        f.write("// generated by narration.py — voice lines + how far the tour stretches to fit them\n")
        f.write("window.MLO_NARR = " + json.dumps(data, ensure_ascii=False) + ";\n")
    for a, e in retime:
        print(f"  stretch +{e:.2f}s at t={a}")
    print(f"{len(out)} lines, tour length {end:.1f}s")


def mix(name=""):
    sfx = "-" + name if name else ""
    data = json.load(open(os.path.join(HERE, "narration.json"), encoding="utf-8"))
    silent, final = os.path.join(HERE, "build", f"silent{sfx}.mp4"), os.path.join(HERE, f"mlo-lab{sfx}.mp4")
    cmd, parts = ["ffmpeg", "-nostdin", "-y", "-v", "error", "-i", silent], []
    for i, l in enumerate(data["lines"]):
        cmd += ["-i", os.path.join(HERE, l["src"])]
        ms = int(l["t"] * 1000)
        parts.append(f"[{i + 1}:a]aresample=48000,adelay={ms}|{ms}[a{i}]")
    n = len(data["lines"])
    graph = ";".join(parts) + ";" + "".join(f"[a{i}]" for i in range(n)) + f"amix=inputs={n}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,apad[aout]"
    cmd += ["-filter_complex", graph, "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-shortest", "-movflags", "+faststart", final]
    subprocess.check_call(cmd)
    print("wrote", final)


if __name__ == "__main__":
    {"tts": tts, "mix": mix}[sys.argv[1] if len(sys.argv) > 1 else "tts"](*sys.argv[2:3])
