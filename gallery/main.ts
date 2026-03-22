/**
 * Gallery — renders all example models from the examples/ folder.
 *
 * Uses a SINGLE shared WebGL renderer to avoid the browser's context limit
 * (~8-16 contexts). Each model is rendered, captured to a static <img>,
 * then the geometry is disposed.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { evaluateModel } from "../src/api/runtime.js";
import type { Body } from "../src/engine/types.js";

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

const examples: Example[] = Object.entries(exampleModules)
  .map(([path, code]) => {
    const file = path.split("/").pop()!;
    const name = file
      .replace(".forge.js", "")
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    // code might be a string or might need coercion
    const codeStr = typeof code === "string" ? code : String(code);
    return { name, file, code: codeStr.trim() };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Render bodies to a data URL using an offscreen renderer. */
type RenderStyle = "default" | "high-contrast";

function renderToImage(
  bodies: Body[],
  width: number,
  height: number,
  cameraHint?: [number, number, number],
  style: RenderStyle = "default",
): string {
  const hiContrast = style === "high-contrast";

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(2);
  renderer.setClearColor(hiContrast ? 0xf5f5f0 : 0x181825);

  const scene = new THREE.Scene();

  if (hiContrast) {
    // Bright even lighting — no drama, max readability
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 0.5);
    key.position.set(200, 300, 200);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(-200, 100, -100);
    scene.add(fill);
  } else {
    // 3-point lighting for 3D readability
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(200, 300, 200);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(-200, 100, -100);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0xaaccff, 0.4);
    rim.position.set(0, -100, -300);
    scene.add(rim);
    const topFill = new THREE.DirectionalLight(0xffffff, 0.15);
    topFill.position.set(0, 400, 0);
    scene.add(topFill);
  }

  // Grid
  if (!hiContrast) {
    scene.add(new THREE.GridHelper(500, 50, 0x313244, 0x252536));
  } else {
    scene.add(new THREE.GridHelper(500, 50, 0xdddddd, 0xeeeeee));
  }

  // Auto-color palette for bodies without explicit color
  const autoColors: [number, number, number][] = [
    [0.55, 0.65, 0.78], [0.72, 0.58, 0.44], [0.50, 0.70, 0.55],
    [0.75, 0.52, 0.52], [0.60, 0.55, 0.72], [0.70, 0.68, 0.50],
    [0.50, 0.68, 0.70], [0.72, 0.55, 0.65],
  ];
  const isDefaultColor = (c?: [number, number, number, number]) =>
    !c || (Math.abs(c[0] - 0.6) < 0.01 && Math.abs(c[1] - 0.6) < 0.01 && Math.abs(c[2] - 0.65) < 0.01);

  // Add bodies — rotate Z-up (Manifold) to Y-up (Three.js)
  const group = new THREE.Group();
  group.rotation.x = -Math.PI / 2;

  // Edge angle threshold for EdgesGeometry (radians) — only show edges
  // where face normals differ by more than this angle
  const edgeThreshold = 30; // degrees

  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(body.mesh.positions, 3));
    geom.setAttribute("normal", new THREE.BufferAttribute(body.mesh.normals, 3));
    geom.setIndex(new THREE.BufferAttribute(body.mesh.indices, 1));

    if (hiContrast) {
      // Light gray surface
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0.88, 0.88, 0.86),
        metalness: 0.0,
        roughness: 0.9,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geom, mat);
      group.add(mesh);

      // Shape edges — medium stroke, darker gray
      const edges = new THREE.EdgesGeometry(geom, edgeThreshold);
      const isAssemblyPart = bodies.length > 1;
      const edgeMat = new THREE.LineBasicMaterial({
        color: isAssemblyPart ? 0x222222 : 0x555555,
        linewidth: 1, // WebGL only supports 1, but the color contrast does the work
      });
      group.add(new THREE.LineSegments(edges, edgeMat));
    } else {
      let color = body.color ?? [0.6, 0.6, 0.65, 1.0];
      if (isDefaultColor(body.color)) {
        const ac = autoColors[i % autoColors.length];
        color = [ac[0], ac[1], ac[2], 1.0];
      }
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color[0], color[1], color[2]),
        metalness: 0.1,
        roughness: 0.6,
        side: THREE.DoubleSide,
      });
      group.add(new THREE.Mesh(geom, mat));

      // Edge strokes — adaptive color: darken light surfaces, lighten dark ones
      const edges = new THREE.EdgesGeometry(geom, edgeThreshold);
      const luminance = color[0] * 0.299 + color[1] * 0.587 + color[2] * 0.114;
      const edgeColor = luminance > 0.45
        ? new THREE.Color(color[0] * 0.5, color[1] * 0.5, color[2] * 0.5)   // 50% darker
        : new THREE.Color(
            color[0] + (1 - color[0]) * 0.5,
            color[1] + (1 - color[1]) * 0.5,
            color[2] + (1 - color[2]) * 0.5,
          ); // 50% lighter
      group.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: edgeColor })));
    }
  }
  scene.add(group);

  // Fit camera
  const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 10000);
  const bbox = new THREE.Box3().setFromObject(group);
  if (!bbox.isEmpty()) {
    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 2.8;

    if (cameraHint) {
      camera.position.set(cameraHint[0], cameraHint[1], cameraHint[2]);
    } else {
      // 3/4 view: front-right, above (Y is now up after rotation)
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

/** Render a card with an interactive viewport (lazy, on click). */
function makeInteractive(container: HTMLElement, bodies: Body[]) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x181825);
  container.innerHTML = "";
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.4));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(200, 300, 200);
  scene.add(dir);
  scene.add(new THREE.GridHelper(500, 50, 0x313244, 0x252536));

  const group = new THREE.Group();
  group.rotation.x = -Math.PI / 2; // Z-up → Y-up
  for (const body of bodies) {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute("position", new THREE.BufferAttribute(body.mesh.positions, 3));
    geom.setAttribute("normal", new THREE.BufferAttribute(body.mesh.normals, 3));
    geom.setIndex(new THREE.BufferAttribute(body.mesh.indices, 1));
    const color = body.color ?? [0.6, 0.6, 0.65, 1.0];
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(color[0], color[1], color[2]),
      metalness: 0.1, roughness: 0.6, side: THREE.DoubleSide,
    });
    group.add(new THREE.Mesh(geom, mat));
  }
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

  // Cleanup when card is no longer interactive
  return () => {
    cancelAnimationFrame(animId);
    renderer.dispose();
  };
}

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

  // Style toggle button in the header
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

    // Render to static image (sequentially to avoid context exhaustion)
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
        const w = 480;
        const h = 360;
        const dataUrl = renderToImage(result.bodies, w, h, result.camera, currentStyle);
        const img = document.createElement("img");
        img.src = dataUrl;
        img.style.cssText = "width:100%;height:100%;object-fit:cover;cursor:pointer";
        img.title = "Click for interactive 3D view";
        vpContainer.appendChild(img);

        // Store for re-rendering on style toggle
        cardData.push({ vpContainer, bodies: result.bodies, camera: result.camera });

        // Click to activate interactive orbit controls (uses 1 WebGL context)
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
