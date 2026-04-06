/**
 * Headless renderer — captures multi-angle PNG screenshots using Playwright.
 *
 * Uses the studio's CadladAutomationApi (window.__cadlad) directly:
 *   - run() awaits real render completion (no fixed sleep)
 *   - captureFrame(view) returns a dataURL (no element screenshot needed)
 *
 * One RenderSession per eval run. Shared across iterations to amortize
 * browser launch cost (~1-2s once) vs per-render cost (~100-200ms each).
 *
 * Requires: dev server at BASE_URL (npm run dev or vite preview)
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";

export type ViewAngle = "iso" | "front" | "back" | "left" | "right" | "top" | "bottom";
export const ALL_VIEWS: ViewAngle[] = ["iso", "front", "back", "left", "right", "top", "bottom"];
export const DEFAULT_VIEWS: ViewAngle[] = ["iso", "front", "right", "top"];

/**
 * A long-lived browser session for capturing model renders.
 * Create once per eval run, share across iterations.
 */
export class RenderSession {
  private browser: any;
  private page: any;
  readonly baseUrl: string;

  private constructor(browser: unknown, page: unknown, baseUrl: string) {
    this.browser = browser;
    this.page = page;
    this.baseUrl = baseUrl;
  }

  /**
   * Launch a browser, navigate to the studio, and wait for the API to be ready.
   * Throws if the dev server is not reachable or the API does not initialize.
   */
  static async start(options?: { baseUrl?: string; timeoutMs?: number }): Promise<RenderSession> {
    const baseUrl = options?.baseUrl ?? "http://localhost:5173";
    const timeout = options?.timeoutMs ?? 30_000;

    // Verify server is up before launching a browser
    try {
      const resp = await fetch(baseUrl, { signal: AbortSignal.timeout(5000) });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    } catch (err) {
      throw new Error(
        `Dev server not reachable at ${baseUrl}. Start it with: npm run dev\n${err}`,
      );
    }

    const { chromium } = await import("playwright-core");
    const browser = await chromium.launch({
      executablePath: findChromiumBinary(),
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--enable-webgl",
        "--ignore-gpu-blocklist",
        "--use-gl=angle",
        "--use-angle=swiftshader-webgl",
        "--disable-dev-shm-usage",
      ],
    });

    const page = await browser.newPage();
    page.setDefaultTimeout(timeout);
    await page.setViewportSize({ width: 1200, height: 900 });

    page.on("console", (msg) => {
      console.log(`[browser] ${msg.type().toUpperCase()}: ${msg.text()}`);
    });

    page.on("requestfailed", (request) => {
      console.log(`[browser] REQUEST_FAILED: ${request.url()} - ${request.failure()?.errorText}`);
    });

    console.log(`[renderer] Navigating to ${baseUrl}/viewer.html ...`);
    await page.goto(`${baseUrl}/viewer.html`, { waitUntil: "load", timeout });
    console.log(`[renderer] Page loaded. Waiting for __cadlad API...`);
    await page.waitForFunction(() => !!(window as Window & { __cadlad?: unknown }).__cadlad, {
      timeout,
    });
    console.log(`[renderer] __cadlad API ready.`);

    return new RenderSession(browser, page, baseUrl);
  }

  /**
   * Inject model code, wait for render to complete, then capture each view.
   * Returns absolute paths to written PNG files.
   */
  async renderCode(
    code: string,
    outputDir: string,
    modelName: string,
    views: ViewAngle[] = DEFAULT_VIEWS,
  ): Promise<string[]> {
    console.log(`[renderer] Rendering code for ${modelName}...`);
    await mkdir(outputDir, { recursive: true });

    // Inject code and run — run() awaits the actual render completion
    await this.page.evaluate((src: string) => {
      console.log("[browser] setCode called");
      (window as Window & { __cadlad?: { setCode(c: string): void } }).__cadlad!.setCode(src);
    }, code);

    console.log(`[renderer] Code injected. Calling run()...`);
    const result = await this.page.evaluate(async () => {
      console.log("[browser] api.run() starting");
      const api = (window as Window & { __cadlad?: { run(): Promise<{ errors: string[] }> } }).__cadlad!;
      const r = await api.run();
      console.log("[browser] api.run() finished", r?.errors);
      return { errors: r?.errors ?? [] };
    });

    if (result.errors.length > 0) {
      throw new Error(`Model errors: ${result.errors.join("; ")}`);
    }

    // captureFrame(view) sets the camera and returns a dataURL — no sleep needed
    const outputPaths: string[] = [];
    for (const view of views) {
      const dataUrl: string = await this.page.evaluate((v: string) => {
        const api = (window as Window & {
          __cadlad?: { captureFrame(view: string): string };
        }).__cadlad!;
        return api.captureFrame(v as Parameters<typeof api.captureFrame>[0]);
      }, view);

      // dataURL → PNG file
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      const buf = Buffer.from(base64, "base64");
      const filePath = resolve(join(outputDir, `${modelName}-${view}.png`));
      await writeFile(filePath, buf);
      outputPaths.push(filePath);
    }

    return outputPaths;
  }

  async close(): Promise<void> {
    await this.browser.close();
  }
}

/** Find the system-installed Chrome binary. Throws if not found. */
function findChromiumBinary(): string {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", // macOS
    "/usr/bin/google-chrome-stable",                                  // Linux CI (GitHub Actions, etc.)
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  throw new Error(
    "Chrome not found. Expected one of:\n" +
    candidates.map((p) => `  ${p}`).join("\n") +
    "\nInstall Google Chrome or set CHROME_PATH in your environment.",
  );
}
