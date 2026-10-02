"""Narration for the Test Lab tour.

  python test/narration.py tts           # synthesize the lines, fit the tour to them, write test/narration.js
  python test/narration.py mix [name]    # lay the narration over test/build/silent[-name].mp4 -> test/test-lab[-name].mp4

Same voice and the same Gemini TTS + whisper check as ../narration.py; only the script and the file locations differ.
A line with `at` is pinned to that moment of the tour (original timeline); `ins` says where the tour may
pause if the previous lines run long. Lines without `at` follow the one before.
"""
import json, os, shutil, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
sys.stdout.reconfigure(encoding="utf-8")
import narration as N

AUDIO = os.path.join(HERE, "audio")
LINES = [
    dict(at=0.3, zh="探針卡主板焊上 MLO 之後，出貨前還要過六關測試。", en="With its MLO soldered on, the probe-card PCB has six tests to pass before it ships."),
    dict(at=5.5, ins=4.8, zh="我們先在板子上放進幾種常見的缺陷。", en="First, we plant a few common defects on the board."),
    dict(at=12.0, ins=11.0, zh="第一站光學檢查：相機看得出少了零件、極性裝反，", en="Station one, optical inspection: the camera sees a missing part or a reversed one,"),
    dict(zh="但看不出電阻值，也看不到 MLO 底下。", en="but it cannot read a resistor's value, or see under the MLO."),
    dict(at=20.0, ins=19.0, zh="第二站飛針：探針飛到零件兩端，一顆一顆量。", en="Station two, flying probe: the probes fly to each part and measure it."),
    dict(at=25.0, ins=24.2, zh="這顆電阻旁邊有並聯的路徑，要開護衛，才量得到它自己的值。", en="This resistor has a parallel path beside it; only with the guard on do you read its own value."),
    dict(at=32.0, ins=31.0, zh="第三站量每一條網路：通不通、彼此有沒有漏電。", en="Station three tests every net: is it connected, and is it isolated from the others."),
    dict(at=36.2, ins=35.4, zh="電源路徑用四線量測，扣掉探針的接觸電阻，才看得出少了幾根導通孔。", en="Power paths need a four-wire measurement, which removes the probe contact resistance, to show a few missing vias."),
    dict(at=45.0, ins=44.0, zh="第四站 X 光：錫最擋 X 光，空洞看得很清楚；", en="Station four, X-ray: solder stops X-rays best, so voids stand out;"),
    dict(at=50.0, ins=49.0, zh="要斜著拍，才看得出枕頭效應。", en="but it takes an oblique view to see head-in-pillow."),
    dict(at=55.5, ins=54.5, zh="第五站量平整度：在 MLO 上自動對焦，算出它翹了多少。", en="Station five measures flatness: autofocus across the MLO shows how far it bows."),
    dict(at=63.0, ins=62.0, zh="最後裝上跟客戶一樣的測試機，跑診斷程式，每顆繼電器都實際切一次。", en="Last, the board goes on a tester set up like the customer's, and a diagnostic program switches every relay for real."),
    dict(at=72.0, ins=71.0, zh="每一站抓到的缺陷都不一樣。", en="Each station catches different defects."),
    dict(at=76.0, ins=74.5, zh="跑一遍整條產線，看哪一站攔下哪一個缺陷。", en="Run the whole line and watch which station stops which defect."),
    dict(at=93.0, ins=92.0, zh="七個缺陷，全部在出貨前被攔了下來。", en="All seven defects are stopped before shipping."),
    dict(at=96.8, ins=96.0, zh="如果少做 X 光這一站，空洞和枕頭效應就會流到客戶那裡，", en="Skip the X-ray station, and the void and the head-in-pillow reach the customer,"),
    dict(zh="用了一陣子才出問題。", en="and fail only after a while in use."),
    dict(at=105.0, ins=104.4, cap=False, zh="每一關都比照真實狀況測過，才出得了門。", en="Every test run the way the board will really be used: that is what it takes to ship."),
    dict(cap=False, zh="用 Claude Opus 5.5 做的，直接在瀏覽器裡就能玩。", en="Built with Claude Opus 5.5 — it runs live in your browser."),
]
TOUR_END = 111.0


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
        f.write("window.TEST_NARR = " + json.dumps(data, ensure_ascii=False) + ";\n")
    for a, e in retime:
        print(f"  stretch +{e:.2f}s at t={a}")
    print(f"{len(out)} lines, tour length {end:.1f}s")


def mix(name=""):
    sfx = "-" + name if name else ""
    data = json.load(open(os.path.join(HERE, "narration.json"), encoding="utf-8"))
    silent, final = os.path.join(HERE, "build", f"silent{sfx}.mp4"), os.path.join(HERE, f"test-lab{sfx}.mp4")
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
