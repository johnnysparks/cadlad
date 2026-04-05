/**
 * Gallery — renders all project models from the projects/ folder.
 *
 * Uses a SINGLE disposable WebGL renderer per card to avoid the browser's
 * context limit (~8-16). Each model is rendered → captured to dataURL → disposed.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { evaluateModel } from "@cadlad/api/runtime.js";
import {
  createLighting,
  createGrid,
  buildBodyGroup,
  type RenderStyle,
} from "@cadlad/rendering/scene-builder.js";
import type { Body } from "@cadlad/kernel/types.js";

interface Example {
  name: string;
  file: string;
  code: string;
}

// Vite glob import — reads all .forge.js files as raw strings at build time
const exampleModules = import.meta.glob("../projects/*/*.forge.js", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

const examples: Example[] = Object.entries(exampleModules)
  .map(([path, code]) => {
    const file = path.split("/").pop()!;
    const name = file
      .replace(".forge.js", "")
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    const codeStr = typeof code === "string" ? code : String(code);
    return { name, file, code: codeStr.trim() };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Rendering ────────────────────────────────────────────────────

/** Render bodies to a data URL using a disposable renderer. */
function renderToImage(
  bodies: Body[],
  width: number,
  height: number,
  cameraHint?: [number, number, number],
  style: RenderStyle = "default",
): string {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(2);
  renderer.setClearColor(style === "high-contrast" ? 0xf5f5f0 : 0x181825);

  const scene = new THREE.Scene();
  for (const light of createLighting(style)) scene.add(light);
  scene.add(createGrid(style));

  const group = buildBodyGroup(bodies, { style, zUpToYUp: true });
  scene.add(group);

  // Fit camera
  const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 10000);
  const bbox = new THREE.Box3().setFromObject(group);
  if (!bbox.isEmpty()) {
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    const dist = Math.max(size.x, size.y, size.z) * 2.8;

    if (cameraHint) {
      camera.position.set(cameraHint[0], cameraHint[1], cameraHint[2]);
    } else {
      camera.position.set(
        center.x + dist * 0.6,
        center.y + dist * 0.45,
        center.z + dist * 0.6,
      );
    }
    camera.lookAt(center);
  }

  renderer.render(scene, camera);
  const dataUrl = renderer.domElement.toDataURL("image/png");

  // Cleanup
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      if (child.material instanceof THREE.Material) child.material.dispose();
    }
  });
  renderer.dispose();

  return dataUrl;
}

/** Create an interactive orbit-controlled viewport (lazy, on click). */
function makeInteractive(container: HTMLElement, bodies: Body[]) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x181825);
  container.innerHTML = "";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  for (const light of createLighting("default")) scene.add(light);
  scene.add(createGrid("default"));

  const group = buildBodyGroup(bodies, { zUpToYUp: true });
  scene.add(group);

  const w = container.clientWidth;
  const h = container.clientHeight;
  renderer.setSize(w, h);

  const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 10000);
  const bbox = new THREE.Box3().setFromObject(group);
  const center = bbox.getCenter(new THREE.Vector3());
  const size = bbox.getSize(new THREE.Vector3());
  const dist = Math.max(size.x, size.y, size.z) * 2.8;
  camera.position.set(
    center.x + dist * 0.6,
    center.y + dist * 0.45,
    center.z + dist * 0.6,
  );

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(center);
  controls.enableDamping = true;

  let animId = 0;
  const animate = () => {
    animId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  };
  animate();

  return () => {
    cancelAnimationFrame(animId);
    renderer.dispose();
  };
}

// ── Gallery App ──────────────────────────────────────────────────

let currentStyle: RenderStyle = "default";
const cardData: Array<{ vpContainer: HTMLElement; bodies: Body[]; camera?: [number, number, number] }> = [];

function rerenderAll() {
  for (const { vpContainer, bodies, camera } of cardData) {
    const img = vpContainer.querySelector("img");
    if (img && bodies.length > 0) {
      img.src = renderToImage(bodies, 480, 360, camera, currentStyle);
    }
  }
}

async function renderGallery() {
  const gallery = document.getElementById("gallery")!;
  let activeCleanup: (() => void) | null = null;

  // Style toggle
  const header = document.querySelector("header");
  if (header) {
    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = "High Contrast";
    toggleBtn.style.cssText = "margin-top:10px;padding:6px 16px;background:#313244;color:#cdd6f4;border:1px solid #6c7086;border-radius:4px;cursor:pointer;font-family:inherit;font-size:13px";
    toggleBtn.addEventListener("click", () => {
      currentStyle = currentStyle === "default" ? "high-contrast" : "default";
      toggleBtn.textContent = currentStyle === "default" ? "High Contrast" : "Default Style";
      rerenderAll();
    });
    header.appendChild(toggleBtn);
  }

  for (const example of examples) {
    const card = document.createElement("div");
    card.className = "card";

    const vpContainer = document.createElement("div");
    vpContainer.className = "card-viewport";
    const loading = document.createElement("div");
    loading.className = "loading";
    loading.textContent = "Loading model...";
    vpContainer.appendChild(loading);
    card.appendChild(vpContainer);

    const firstComment = example.code.match(/^\/\/\s*(.+)/)?.[1] ?? "";
    const studioUrl = `../?code=${encodeURIComponent(btoa(unescape(encodeURIComponent(example.code))))}`;

    const info = document.createElement("div");
    info.className = "card-info";
    info.innerHTML = `
      <h2>${escapeHtml(example.name)}</h2>
      <p>${escapeHtml(firstComment)}</p>
      <a href="${studioUrl}" class="open-studio">Open in Studio</a>
      <details>
        <summary>View source</summary>
        <pre><code>${escapeHtml(example.code)}</code></pre>
      </details>
    `;
    card.appendChild(info);
    gallery.appendChild(card);

    try {
      const result = await evaluateModel(example.code);
      loading.remove();

      if (result.errors.length > 0) {
        const errDiv = document.createElement("div");
        errDiv.className = "error-msg";
        errDiv.textContent = result.errors.join("\n");
        vpContainer.appendChild(errDiv);
        continue;
      }

      if (result.bodies.length > 0) {
        const dataUrl = renderToImage(result.bodies, 480, 360, result.camera, currentStyle);
        const img = document.createElement("img");
        img.src = dataUrl;
        img.style.cssText = "width:100%;height:100%;object-fit:cover;cursor:pointer";
        img.title = "Click for interactive 3D view";
        vpContainer.appendChild(img);

        cardData.push({ vpContainer, bodies: result.bodies, camera: result.camera });

        img.addEventListener("click", () => {
          if (activeCleanup) activeCleanup();
          activeCleanup = makeInteractive(vpContainer, result.bodies);
        });
      }
    } catch (err: unknown) {
      loading.remove();
      const errDiv = document.createElement("div");
      errDiv.className = "error-msg";
      errDiv.textContent = err instanceof Error ? err.message : String(err);
      vpContainer.appendChild(errDiv);
    }
  }
}

renderGallery().catch((err) => {
  console.error("Gallery render failed:", err);
  document.getElementById("gallery")!.innerHTML = `
    <pre style="color:#f38ba8;padding:20px">${err.message}\n\n${err.stack}</pre>
  `;
});
