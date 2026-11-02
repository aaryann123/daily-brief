// Regenerates docs/screenshots/*.png from Tools/sample-edition.json (made-up stories, no Claude call, no feeds).
// Serves public/ itself, swapping in the sample edition, and drives headless Chrome over the DevTools protocol.
//
//   node Tools/screenshots.mjs
// Needs: Node 22+, Google Chrome (set CHROME elsewhere).
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..");
const OUT = path.join(ROOT, "docs", "screenshots");
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".ttf": "font/ttf", ".webmanifest": "application/manifest+json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = http.createServer((req, res) => {
  const p = new URL(req.url, "http://x").pathname;
  const file = p === "/edition.json" ? path.join(import.meta.dirname, "sample-edition.json") : path.join(ROOT, "public", p === "/" ? "index.html" : path.normalize(p));
  if (!file.startsWith(ROOT) || !fs.existsSync(file)) return res.writeHead(404).end();
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(fs.readFileSync(file));
}).listen(6299, "127.0.0.1");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "db-chrome-"));
const chrome = spawn(CHROME, ["--headless=new", "--remote-debugging-port=9336", `--user-data-dir=${profile}`, "--hide-scrollbars", "about:blank"], { stdio: "ignore" });

try {
  let target;
  for (let i = 0; i < 50 && !target; i++) {
    await sleep(200);
    try { target = await (await fetch("http://127.0.0.1:9336/json/new?about:blank", { method: "PUT" })).json(); } catch {}
  }
  if (!target) throw new Error("Chrome did not start");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener("open", r, { once: true }));
  let seq = 0;
  const pending = new Map();
  ws.addEventListener("message", (e) => { const m = JSON.parse(String(e.data)); pending.get(m.id)?.(m.result); pending.delete(m.id); });
  const cdp = (method, params = {}) => new Promise((r) => { const id = ++seq; pending.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async (expression) => (await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }))?.result?.value;
  const shot = async (name) => {
    fs.mkdirSync(OUT, { recursive: true });
    const { data } = await cdp("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(data, "base64"));
    console.log("wrote", `docs/screenshots/${name}.png`);
  };
  const go = async (page) => { await evaluate(`at = ${page}; place()`); await sleep(300); };

  await cdp("Page.enable");
  // A phone: 400 px wide at 4x gives 1600 px images.
  await cdp("Emulation.setDeviceMetricsOverride", { width: 400, height: 860, deviceScaleFactor: 4, mobile: true });
  await cdp("Page.navigate", { url: "http://127.0.0.1:6299/" });
  await sleep(1500);
  await evaluate("document.fonts.ready.then(() => true)");

  await go(0); await shot("cover");
  await go(1); await shot("story");
  await go(1); await evaluate("begin(1, deck.clientHeight * 0.85); ts.p = 0.42; ts.off = -40; draw()"); await sleep(200); await shot("turn");
  await go(11); await shot("quote");
  ws.close();
} finally {
  server.close(); chrome.kill();
  await new Promise((r) => chrome.once("exit", r));
  fs.rmSync(profile, { recursive: true, force: true });
}
