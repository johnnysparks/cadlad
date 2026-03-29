# Screenshot Skill — Headless 3D Rendering Guide

How to capture CadLad model screenshots in any environment. The approach: sniff what's available, use it, install only what's missing.

## First Rule (Do This Every Time)

1. **Sniff first** — detect what browser tooling already exists.
2. **Use existing tools/cache** — don't install what's already there.
3. **Install only what's missing** — and install to `/tmp` to avoid polluting the project.

## Step 1: Sniff the Environment

Run all of these before doing anything else:

```bash
uname -s                                                          # OS
node -v && npm -v                                                 # runtime
which google-chrome || which chromium || which chromium-browser    # system browser
find ~/.cache/puppeteer -maxdepth 5 -type f -name chrome 2>/dev/null   # Puppeteer cache
find ~/.cache/ms-playwright -maxdepth 5 -type f -name chrome 2>/dev/null  # Playwright cache
node -e "try{console.log(require.resolve('puppeteer'))}catch{console.log('not found')}"  # Puppeteer pkg
ls /tmp/cadlad_sniff/node_modules/puppeteer 2>/dev/null           # temp install
```

You need two things: (A) a Chrome/Chromium binary, and (B) the Puppeteer npm package.

## Step 2: Find or Install Chrome

Check these locations in order. Use the **first one that exists**:

| Priority | Location | Notes |
|---|---|---|
| 1 | Playwright cache: `~/.cache/ms-playwright/chromium-*/chrome-linux/chrome` | Pre-cached in many CI/container environments |
| 2 | Puppeteer cache: `~/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome` | Downloaded by `npm install puppeteer` |
| 3 | System: `google-chrome`, `chromium`, `chromium-browser` | macOS: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` |
| 4 | `PUPPETEER_EXECUTABLE_PATH` or `CHROME_PATH` env var | Docker / CI override |

If no Chrome binary exists anywhere:
```bash
# Air-gapped? You're stuck. Chrome must be pre-installed.
# Have network? Install Puppeteer (downloads Chrome automatically):
mkdir -p /tmp/cadlad_sniff && cd /tmp/cadlad_sniff && npm init -y && npm install puppeteer
```

### Verify Chrome launches

```bash
CHROME_BIN="<path from above>"
ldd "$CHROME_BIN" 2>/dev/null | grep "not found" || echo "all libs present"
```

If shared libs are missing (Linux):
```bash
sudo apt-get update && sudo apt-get install -y \
  libatk1.0-0 libatk-bridge2.0-0 libcups2t64 libxkbcommon0 \
  libatspi2.0-0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libasound2t64
```

Quick launch test (static page only):
```bash
"$CHROME_BIN" --headless=new --no-sandbox --disable-gpu \
  --screenshot=/tmp/chrome-test.png --window-size=800,600 about:blank
```

## Step 3: Find or Install Puppeteer

`snapshot-test.mjs` searches these locations automatically:
1. Project `node_modules` (if added as devDep)
2. `/tmp/cadlad_sniff/node_modules/puppeteer`
3. Global node modules
4. npx cache

If none found:
```bash
mkdir -p /tmp/cadlad_sniff && cd /tmp/cadlad_sniff && npm init -y
PUPPETEER_SKIP_DOWNLOAD=true npm install puppeteer   # skip if you already have a Chrome binary
# OR: npm install puppeteer                           # downloads Chrome too
```

## Step 4: Launch with Correct Flags

### Critical: WebGL requires specific flags

CadLad renders 3D with Three.js/WebGL. The wrong flags produce blank or broken screenshots.

**Required flags for headless WebGL:**
```
--no-sandbox
--disable-setuid-sandbox
--enable-webgl
--ignore-gpu-blocklist
--use-gl=angle
--use-angle=swiftshader-webgl
--disable-dev-shm-usage
```

**Do NOT use `--disable-gpu`** — it kills WebGL context creation entirely. SwiftShader provides software rendering without a GPU.

When using a Chrome binary that wasn't downloaded by Puppeteer, pass `executablePath`:

```javascript
const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: '/path/to/chrome',  // from Step 2
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--enable-webgl', '--ignore-gpu-blocklist',
    '--use-gl=angle', '--use-angle=swiftshader-webgl',
    '--disable-dev-shm-usage',
  ],
});
```

`snapshot-test.mjs` handles all of this automatically — it finds Chrome via `findChromeBinary()` and applies the WebGL flags.

## Step 5: Capture Screenshots

### Using the render script

```bash
# Start dev server first
npm run dev &
sleep 3

# Render a model from 7 angles
node /tmp/cadlad_sniff/render.mjs projects/phone-stand/phone-stand.forge.js /tmp
```

### Using snapshot-test.mjs (preferred)

```bash
npm run dev &
sleep 3
node scripts/snapshot-test.mjs --url http://localhost:5173           # compare to references
node scripts/snapshot-test.mjs --url http://localhost:5173 --update  # capture new references
```

### Manual Puppeteer script

```javascript
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({
  headless: 'new',
  executablePath: process.env.CHROME_BIN || undefined,
  args: [
    '--no-sandbox', '--disable-setuid-sandbox',
    '--enable-webgl', '--ignore-gpu-blocklist',
    '--use-gl=angle', '--use-angle=swiftshader-webgl',
    '--disable-dev-shm-usage',
  ],
});
const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
await page.goto('http://localhost:5173', { waitUntil: 'load', timeout: 30000 });

// Wait for WASM + WebGL to finish — fixed delay is the only reliable method
// (networkidle0 hangs because the render loop never goes idle)
await page.waitForFunction(() => !!(window).__cadlad, { timeout: 30000 });

// Load a model
await page.evaluate(code => window.__cadlad.setCode(code), modelCode);
await page.click('#btn-run');
await new Promise(r => setTimeout(r, 5000));

// Screenshot the viewport
const el = await page.$('#viewport');
await el.screenshot({ path: '/tmp/model.png' });

// Multi-angle: use setView()
for (const view of ['front', 'back', 'left', 'right', 'top', 'bottom', 'iso']) {
  await page.evaluate(v => window.__cadlad.setView(v), view);
  await new Promise(r => setTimeout(r, 500));
  await el.screenshot({ path: `/tmp/model_${view}.png` });
}

await browser.close();
```

## Troubleshooting

| Problem | Cause | Fix |
|---|---|---|
| "Could not create a WebGL context" | `--disable-gpu` flag | Remove it. Use `--use-gl=angle --use-angle=swiftshader-webgl` instead |
| "Loading geometry kernel..." in screenshot | WASM not loaded yet | Increase wait time (6–10s), or use `waitForFunction(() => !!window.__cadlad)` |
| `networkidle0` timeout | Three.js render loop keeps network "active" | Use `waitUntil: 'load'` + fixed delay |
| `--virtual-time-budget` hangs | WASM streaming + rAF incompatible | Don't use it with this app |
| Black/blank screenshot | WebGL not initialized | Check flags above; increase wait time |
| "No usable sandbox" on Linux | Missing sandbox setup | Add `--no-sandbox --disable-setuid-sandbox` |
| Chrome not found by Puppeteer | Binary not at expected path | Set `executablePath` explicitly |
| Missing shared libs (Linux) | Chrome depends on system libs | Run the apt-get install above, then `ldd chrome \| grep "not found"` |
| Puppeteer can't download Chrome | No network / air-gapped | Use Playwright's cached Chrome or pre-install via Docker |

## CI / Docker

```yaml
# GitHub Actions
- uses: browser-actions/setup-chrome@v1
- run: npm install puppeteer
- run: |
    npm run dev &
    sleep 3
    node scripts/snapshot-test.mjs --url http://localhost:5173
```

```dockerfile
# Docker (Debian-based)
RUN apt-get update && apt-get install -y chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
```

## Cross-platform Chrome Finder

```bash
find_chrome() {
  case "$(uname -s)" in
    Darwin)
      echo "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ;;
    Linux)
      # Playwright cache → Puppeteer cache → system
      find ~/.cache/ms-playwright -maxdepth 4 -name chrome -type f 2>/dev/null | head -1 \
        || find ~/.cache/puppeteer -maxdepth 5 -name chrome -type f 2>/dev/null | head -1 \
        || which google-chrome || which chromium || which chromium-browser ;;
    MINGW*|MSYS*|CYGWIN*)
      echo "/c/Program Files/Google/Chrome/Application/chrome.exe" ;;
  esac
}
```
