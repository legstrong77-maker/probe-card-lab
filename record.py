"""Render the guided tour of index.html frame-by-frame into an MP4.

usage:
  python record.py                      # full video -> build/silent.mp4, then narration mixed in -> probe-card-lab.mp4
  python record.py --shots 0,5,12.5     # save PNG stills at those tour times
  python record.py --headed             # use a visible (GPU) browser window
"""
import argparse, base64, http.server, os, subprocess, sys, threading, time
from functools import partial
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
W, H, FPS = 1920, 1080, 30


def serve():
    handler = partial(http.server.SimpleHTTPRequestHandler, directory=HERE)
    handler.log_message = lambda *a: None
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv.server_address[1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shots", default="")
    ap.add_argument("--out", default=os.path.join(HERE, "build", "silent.mp4"))
    ap.add_argument("--shotdir", default=os.path.join(HERE, "shots"))
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--fps", type=int, default=FPS)
    args = ap.parse_args()

    port = serve()
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=not args.headed,
            args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader",
                  "--window-position=-2400,0", f"--window-size={W},{H + 140}"],
        )
        page = browser.new_page(viewport={"width": W, "height": H}, device_scale_factor=1)
        page.on("console", lambda m: print("console:", m.type, m.text) if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: print("pageerror:", e))
        page.goto(f"http://127.0.0.1:{port}/index.html?record=1")
        page.wait_for_function("window.__ready === true", timeout=120_000)
        print("renderer:", page.evaluate("(() => { const c = document.createElement('canvas').getContext('webgl2'); const e = c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; })()"))
        cdp = page.context.new_cdp_session(page)

        def grab(fmt="jpeg"):
            opts = {"format": fmt}
            if fmt == "jpeg":
                opts["quality"] = 95
            return base64.b64decode(cdp.send("Page.captureScreenshot", opts)["data"])

        if args.shots:
            os.makedirs(args.shotdir, exist_ok=True)
            for t in sorted(float(s) for s in args.shots.split(",")):
                got = page.evaluate(f"window.__seek({t})")
                path = os.path.join(args.shotdir, f"t{t:05.1f}.png")
                with open(path, "wb") as f:
                    f.write(grab("png"))
                print(f"shot t={got:.2f} -> {path}", page.evaluate("window.__info()"))
            browser.close()
            return

        info = page.evaluate("window.__info()")
        n = int(info["dur"] * args.fps)
        os.makedirs(os.path.dirname(args.out), exist_ok=True)
        ff = subprocess.Popen(
            ["ffmpeg", "-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", str(args.fps), "-c:v", "mjpeg", "-i", "-",
             "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart", args.out],
            stdin=subprocess.PIPE,
        )
        t0 = time.time()
        for i in range(n):
            page.evaluate(f"window.__advance({1 / args.fps})")
            ff.stdin.write(grab())
            if i % 60 == 0:
                el = time.time() - t0
                print(f"frame {i}/{n}  {el:.0f}s elapsed  eta {el / max(i, 1) * (n - i):.0f}s", flush=True)
        ff.stdin.close()
        ff.wait()
        browser.close()
        print("wrote", args.out, f"in {time.time() - t0:.0f}s")
    if not args.shots and os.path.exists(os.path.join(HERE, "narration.json")):
        subprocess.check_call([sys.executable, os.path.join(HERE, "narration.py"), "mix"])


if __name__ == "__main__":
    main()
