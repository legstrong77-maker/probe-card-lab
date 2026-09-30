"""Render the guided tour of index.html frame-by-frame into an MP4.

usage:
  python record.py                      # full video -> build/silent.mp4, then narration mixed in -> probe-card-lab.mp4
  python record.py --shots 0,5,12.5     # save PNG stills at those tour times
  python record.py --headed             # use a visible (GPU) browser window
  python record.py --page ft            # the Final Test Board Lab tour -> ft/build/silent.mp4 -> ft/ft-board-lab.mp4
  python record.py --size 540x960 --dpr 2 --name vertical   # 9:16 version (the page's phone layout at 1080x1920) -> probe-card-lab-vertical.mp4
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
    ap.add_argument("--page", default="", help="sub-folder whose tour to record (e.g. ft); default is the Probe Card Lab")
    ap.add_argument("--out", default="")
    ap.add_argument("--shotdir", default=os.path.join(HERE, "shots"))
    ap.add_argument("--headed", action="store_true")
    ap.add_argument("--fps", type=int, default=FPS)
    ap.add_argument("--size", default=f"{W}x{H}", help="viewport, e.g. 1080x1920 for a vertical video")
    ap.add_argument("--name", default="", help="suffix for the output files, e.g. vertical")
    ap.add_argument("--query", default="", help="extra query string for the page, e.g. lang=en")
    ap.add_argument("--dpr", type=int, default=1, help="device pixel ratio; --size 540x960 --dpr 2 records the phone layout at 1080x1920")
    args = ap.parse_args()
    base = os.path.join(HERE, args.page) if args.page else HERE
    w, h = (int(v) for v in args.size.lower().split("x"))
    args.out = args.out or os.path.join(base, "build", f"silent{'-' + args.name if args.name else ''}.mp4")

    port = serve()
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=not args.headed,
            args=["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader",
                  "--window-position=-2400,0", f"--window-size={w},{h + 140}"],
        )
        page = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=args.dpr)
        page.on("console", lambda m: print("console:", m.type, m.text) if m.type in ("error", "warning") else None)
        page.on("pageerror", lambda e: print("pageerror:", e))
        page.goto(f"http://127.0.0.1:{port}/{args.page + '/' if args.page else ''}index.html?record=1{'&dpr=' + str(args.dpr) if args.dpr > 1 else ''}{'&' + args.query if args.query else ''}")
        page.wait_for_function("window.__ready === true", timeout=120_000)
        print("renderer:", page.evaluate("(() => { const c = document.createElement('canvas').getContext('webgl2'); const e = c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; })()"))
        cdp = page.context.new_cdp_session(page)

        def grab(fmt="jpeg"):
            opts = {"format": fmt}
            if args.dpr > 1:              # without a clip the screenshot comes back at CSS size
                opts["clip"] = {"x": 0, "y": 0, "width": w, "height": h, "scale": args.dpr}
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
    if not args.shots and os.path.exists(os.path.join(base, "narration.json")):
        subprocess.check_call([sys.executable, os.path.join(base, "narration.py"), "mix"] + ([args.name] if args.name else []))


if __name__ == "__main__":
    main()
