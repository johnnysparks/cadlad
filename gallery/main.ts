/**
 * Gallery — renders all example models from the examples/ folder.
 *
 * Uses import.meta.glob to read .forge.js files at build time.
 * Single source of truth: add a .forge.js to examples/ and it appears here.
 */

import { Viewport } from "../src/studio/viewport.js";
import { evaluateModel } from "../src/api/runtime.js";

interface Example {
  name: string;
  file: string;
  code: string;
}

// Vite glob import — reads all .forge.js files as raw strings at build time
const exampleModules = import.meta.glob("../examples/*.forge.js", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

// Build example list from the file system
const examples: Example[] = Object.entries(exampleModules)
  .map(([path, code]) => {
    const file = path.split("/").pop()!;
    // Derive a display name from the filename: "box-with-hole.forge.js" → "Box With Hole"
    const name = file
      .replace(".forge.js", "")
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    return { name, file, code: code.trim() };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function renderGallery() {
  const gallery = document.getElementById("gallery")!;

  for (const example of examples) {
    // Card container
    const card = document.createElement("div");
    card.className = "card";

    // Viewport container
    const vpContainer = document.createElement("div");
    vpContainer.className = "card-viewport";
    const loading = document.createElement("div");
    loading.className = "loading";
    loading.textContent = "Loading model...";
    vpContainer.appendChild(loading);
    card.appendChild(vpContainer);

    // Info section — pull description from the first comment line in the code
    const firstComment = example.code.match(/^\/\/\s*(.+)/)?.[1] ?? "";
    const info = document.createElement("div");
    info.className = "card-info";
    info.innerHTML = `
      <h2>${escapeHtml(example.name)}</h2>
      <p>${escapeHtml(firstComment)}</p>
      <details>
        <summary>View source</summary>
        <pre><code>${escapeHtml(example.code)}</code></pre>
      </details>
    `;
    card.appendChild(info);

    gallery.appendChild(card);

    // Render asynchronously so cards appear immediately
    renderCard(vpContainer, loading, example);
  }
}

async function renderCard(
  container: HTMLElement,
  loading: HTMLElement,
  example: Example,
) {
  try {
    const result = await evaluateModel(example.code);
    loading.remove();

    if (result.errors.length > 0) {
      const errDiv = document.createElement("div");
      errDiv.className = "error-msg";
      errDiv.textContent = result.errors.join("\n");
      container.appendChild(errDiv);
      return;
    }

    if (result.bodies.length > 0) {
      const viewport = new Viewport(container);
      viewport.setBodies(result.bodies);
    }
  } catch (err: unknown) {
    loading.remove();
    const errDiv = document.createElement("div");
    errDiv.className = "error-msg";
    errDiv.textContent = err instanceof Error ? err.message : String(err);
    container.appendChild(errDiv);
  }
}

renderGallery().catch((err) => {
  console.error("Gallery render failed:", err);
  document.getElementById("gallery")!.innerHTML = `
    <pre style="color:#f38ba8;padding:20px">${err.message}\n\n${err.stack}</pre>
  `;
});
