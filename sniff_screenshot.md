# Screenshot Skill — Environment Sniff Results & Instructions

> **Tested and confirmed working** on macOS (Darwin 24.6.0, arm64) — 2026-03-21

## Environment Summary

| Capability | Status | Path / Notes |
|---|---|---|
| Node.js | v22.19.0 | `node` |
| Chrome (macOS) | YES | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |
| Chrome headless | YES | `--headless=new` — works for static pages |
| WebGL in headless | YES | Confirmed: Three.js renders in headless Chrome |
| Puppeteer | YES | Install to temp dir or project devDep. Chromium cached at `~/.cache/puppeteer/` |
| Playwright Chromium | cached | `~/Library/Caches/ms-playwright/chromium-1208/` |
| macOS screencapture | YES | `/usr/sbin/screencapture` (needs display — not useful for headless) |

## Key Findings

1. **Chrome `--screenshot` is too fast for WebGL apps.** It captures at first paint, before WASM (Manifold) loads and Three.js renders. You get the "Loading geometry kernel..." splash, not the model.
2. **`--virtual-time-budget` hangs** on this app (WASM streaming + WebGL animation loop don't play well with virtual time).
3. **Puppeteer with `waitUntil: 'load'` + a delay is the reliable method.** Confirmed working with full 3D model render.

## Confirmed Working Method: Puppeteer Script

### Setup (one-time, ~10s)

```bash
# Option A: temp directory (no project changes)
mkdir -p /tmp/cadlad_sniff && cd /tmp/cadlad_sniff
npm init -y && npm install puppeteer

# Option B: add as project devDep
npm install --save-dev puppeteer
```

### Take a screenshot (~8s after setup)

Save as `screenshot.mjs` (or inline):

```javascript
import puppeteer from 'puppeteer';

const url = process.argv[2] || 'http://localhost:5173';
const out = process.argv[3] || '/tmp/cadlad_screenshot.png';
const wait = parseInt(process.argv[4] || '6000');

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu']
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'load', timeout: 30000 });

// IMPORTANT: waitUntil:'load' returns before WASM + WebGL finish.
// networkidle0 will timeout because the render loop never goes idle.
// A fixed delay is the simplest reliable approach.
await new Promise(r => setTimeout(r, wait));

await page.screenshot({ path: out });
console.log(`Screenshot saved to ${out}`);
await browser.close();
```

```bash
# Full page
node screenshot.mjs http://localhost:5173 /tmp/full.png

# Viewport element only
node -e "
import puppeteer from 'puppeteer';
const b = await puppeteer.launch({headless:'new', args:['--no-sandbox']});
const p = await b.newPage();
await p.setViewport({width:1920, height:1080, deviceScaleFactor:2});
await p.goto('http://localhost:5173', {waitUntil:'load'});
await new Promise(r => setTimeout(r, 6000));
const el = await p.$('#viewport');
if (el) await el.screenshot({path: '/tmp/viewport.png'});
await b.close();
"
```

### Multi-angle snapshots

The app has built-in view buttons (Front, Back, Left, Right, Top, Bottom) in the View Panel. Click them programmatically:

```javascript
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu']
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 2 });
await page.goto('http://localhost:5173', { waitUntil: 'load' });
await new Promise(r => setTimeout(r, 6000));

// The View Panel has named view buttons — click each and screenshot
const views = ['Front', 'Back', 'Left', 'Right', 'Top', 'Bottom', 'Fit'];
for (const view of views) {
  // Click the view button by text content
  const clicked = await page.evaluate((name) => {
    const buttons = [...document.querySelectorAll('button')];
    const btn = buttons.find(b => b.textContent.trim() === name);
    if (btn) { btn.click(); return true; }
    return false;
  }, view);

  if (clicked) {
    await new Promise(r => setTimeout(r, 500)); // let camera animate
    const el = await page.$('#viewport');
    if (el) await el.screenshot({ path: `/tmp/cadlad_${view.toLowerCase()}.png` });
    console.log(`${view}: saved`);
  } else {
    console.log(`${view}: button not found`);
  }
}

await browser.close();
```

## Quick Reference: Chrome Headless (static pages only)

For pages that don't need WASM/WebGL wait time:

```bash
# macOS
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --disable-gpu --no-sandbox \
  --screenshot=/tmp/output.png --window-size=1200,900 \
  "http://localhost:5173"

# Linux
google-chrome --headless=new --disable-gpu --no-sandbox \
  --screenshot=/tmp/output.png --window-size=1200,900 \
  "http://localhost:5173"

# Windows (PowerShell)
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --headless=new --disable-gpu --no-sandbox `
  --screenshot=output.png --window-size=1200,900 `
  "http://localhost:5173"
```

> **Warning:** This captures at first paint. For ForgeCAD/CadLad, you'll get the loading splash, not the rendered model. Use the Puppeteer method above instead.

### Cross-platform Chrome finder

```bash
find_chrome() {
  case "$(uname -s)" in
    Darwin)
      echo "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ;;
    Linux)
      which google-chrome || which chromium || which chromium-browser \
        || echo "$HOME/.cache/puppeteer/chrome/*/chrome-linux*/chrome" ;;
    MINGW*|MSYS*|CYGWIN*)
      echo "/c/Program Files/Google/Chrome/Application/chrome.exe" ;;
  esac
}
```

## Troubleshooting

| Problem | Fix |
|---|---|
| "Loading geometry kernel..." in screenshot | Increase wait time (default 6s, try 10s). WASM hasn't finished loading. |
| `networkidle0` timeout | Use `waitUntil: 'load'` instead — the Three.js render loop keeps the network "active" forever. |
| `--virtual-time-budget` hangs | Don't use it with this app. WASM streaming + rAF loop breaks virtual time. |
| Black/blank screenshot | Add `--disable-gpu` flag. Or increase wait time. |
| "No usable sandbox" on Linux CI | Add `--no-sandbox --disable-setuid-sandbox` |
| Chrome not found | Set `CHROME_PATH` env var, or install `google-chrome-stable` |
| Puppeteer can't find Chrome | Run `npx puppeteer browsers install chrome` first |

## CI / Docker

```yaml
# GitHub Actions
- uses: browser-actions/setup-chrome@v1
- run: npm install puppeteer
- run: |
    npm run dev &
    sleep 3
    node screenshot.mjs http://localhost:5173 screenshot.png 8000
```

```dockerfile
# Docker (Debian-based)
RUN apt-get update && apt-get install -y chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```
