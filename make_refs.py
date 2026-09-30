"""Copy the parameter table and reference list from sources.js into README.md.

  python make_refs.py      # needs node, which evaluates sources.js

The block between <!-- refs:start --> and <!-- refs:end --> is replaced.
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
print(f"README: {len(S['steps'])} steps, {len(S['params'])} parameters, {len(S['game'])} game rows, {len(S['refs'])} references")
