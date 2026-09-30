"""Copy the parameter tables and reference lists from sources.js and ft/sources.js into README.md and ft/README.md.

  python make_refs.py      # needs node, which evaluates the sources files

The block between <!-- refs:start --> and <!-- refs:end --> in each README is replaced.
"""
import json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.stdout.reconfigure(encoding="utf-8")
js = "global.window={}; require('./sources.js'); process.stdout.write(JSON.stringify(window.SOURCES))"
S = json.loads(subprocess.check_output(["node", "-e", js], cwd=HERE).decode("utf-8"))

cite = lambda r: " ".join(f"[{n}]" for n in r)
out = ["<!-- refs:start -->", "## 參數依據與參考來源", "", S["intro"], "", "### 針測流程", ""]
out += [f"{i}. **{x['zh']}**：{x['d']} {cite(x['r'])}" for i, x in enumerate(S["steps"], 1)]
out += ["", "### 可調參數對照", "", "| 參數 | 模擬器用的值 | 公開資料的典型範圍 | 來源 |", "|---|---|---|---|"]
out += [f"| {x['p']} | {x['sim']} | {x['real']} | {cite(x['r'])} |" for x in S["params"]]
out += ["", S["left"], "", "### 遊戲加上的機制", "", "| 機制 | 遊戲用的值 | 公開資料 | 來源 |", "|---|---|---|---|"]
out += [f"| {x['p']} | {x['sim']} | {x['real']} | {cite(x['r'])} |" for x in S["game"]]
out += ["", "### 參考文獻", ""]
out += [f"{i}. [{x['t']}]({x['u']})" for i, x in enumerate(S["refs"], 1)]
out += ["<!-- refs:end -->"]
block = "\n".join(out)

p = os.path.join(HERE, "README.md")
s = open(p, encoding="utf-8").read()
if "<!-- refs:start -->" in s:
    a, b = s.index("<!-- refs:start -->"), s.index("<!-- refs:end -->") + len("<!-- refs:end -->")
    s = s[:a] + block + s[b:]
else:
    marker = "## 檔案"
    s = s.replace(marker, block + "\n\n" + marker, 1)
open(p, "w", encoding="utf-8", newline="\n").write(s)

# ---- Final Test Board Lab (ft/)
js = "global.window={}; require('./ft/sources.js'); process.stdout.write(JSON.stringify(window.FT_SOURCES))"
F = json.loads(subprocess.check_output(["node", "-e", js], cwd=HERE).decode("utf-8"))
out = ["<!-- refs:start -->", "## 參數依據與參考來源", "", F["intro"], "", "### 成品測試流程", ""]
out += [f"{i}. **{x['zh']}**：{x['d']} {cite(x['r'])}" for i, x in enumerate(F["steps"], 1)]
out += ["", "### 可調參數對照", "", "| 參數 | 模擬器用的值 | 公開資料的典型範圍 | 來源 |", "|---|---|---|---|"]
out += [f"| {x['p']} | {x['sim']} | {x['real']} | {cite(x['r'])} |" for x in F["params"]]
out += ["", F["left"] + " " + cite(F.get("leftRefs", [])), "", "### 參考文獻", ""]
out += [f"{i}. [{x['t']}]({x['u']})" for i, x in enumerate(F["refs"], 1)]
out += ["<!-- refs:end -->"]
p2 = os.path.join(HERE, "ft", "README.md")
s2 = open(p2, encoding="utf-8").read()
a, b = s2.index("<!-- refs:start -->"), s2.index("<!-- refs:end -->") + len("<!-- refs:end -->")
open(p2, "w", encoding="utf-8", newline="\n").write(s2[:a] + "\n".join(out) + s2[b:])
print(f"ft/README: {len(F['steps'])} steps, {len(F['params'])} parameters, {len(F['refs'])} references")
print(f"README: {len(S['steps'])} steps, {len(S['params'])} parameters, {len(S['game'])} game rows, {len(S['refs'])} references")
