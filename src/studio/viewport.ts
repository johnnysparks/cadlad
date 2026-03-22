/**
 * Three.js viewport for rendering Solid bodies.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { createLighting, createGrid, buildBodyGroup } from "../rendering/scene-builder.js";
import type { Body } from "../engine/types.js";

export class Viewport {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private container: HTMLElement;
  private meshGroup: THREE.Group;
  private animId = 0;

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x181825);
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
    this.camera.position.set(150, 150, 150);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    // Lighting and grid from shared module
    for (const light of createLighting("default")) this.scene.add(light);
    this.scene.add(createGrid("default"));

    this.meshGroup = new THREE.Group();
    this.scene.add(this.meshGroup);

    this.resize();
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);

    this.animate();
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  private animate = (): void => {
    this.animId = requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  /** Replace all displayed bodies. */
  setBodies(bodies: Body[]): void {
    // Clear old meshes
    while (this.meshGroup.children.length) {
      const child = this.meshGroup.children[0];
      this.meshGroup.remove(child);
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) child.material.dispose();
      }
    }

    // Build body group with Z-up → Y-up conversion (Manifold → Three.js)
    // The returned group has rotation.x = -PI/2 applied, so add it as a whole
    const group = buildBodyGroup(bodies, { zUpToYUp: true });
    this.meshGroup.add(group);

    this.fitCamera();
  }

  private fitCamera(): void {
    const bbox = new THREE.Box3().setFromObject(this.meshGroup);
    if (bbox.isEmpty()) return;

    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 2.5;

    // Y-up "product shot": front-right, above
    this.camera.position.set(
      center.x + dist * 0.6,
      center.y + dist * 0.45,
      center.z + dist * 0.6,
    );
    this.controls.target.copy(center);
    this.controls.update();
  }

  /** Set camera to a named view (for screenshots and automation). */
  setView(view: "front" | "back" | "top" | "bottom" | "left" | "right" | "iso"): void {
    const bbox = new THREE.Box3().setFromObject(this.meshGroup);
    if (bbox.isEmpty()) return;

    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    const dist = Math.max(size.x, size.y, size.z) * 2.2;

    // Y-up (post coordinate transform). Front = +Z, Up = +Y.
    const views: Record<string, [number, number, number]> = {
      front:  [0, 0, dist],
      back:   [0, 0, -dist],
      top:    [0, dist, 0.001],
      bottom: [0, -dist, 0.001],
      left:   [-dist, 0, 0],
      right:  [dist, 0, 0],
      iso:    [dist * 0.6, dist * 0.45, dist * 0.6],
    };

    const [dx, dy, dz] = views[view] ?? views.iso;
    this.camera.position.set(center.x + dx, center.y + dy, center.z + dz);
    this.controls.target.copy(center);
    this.controls.update();
  }

  dispose(): void {
    cancelAnimationFrame(this.animId);
    this.renderer.dispose();
  }
}
