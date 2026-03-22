/**
 * Three.js viewport for rendering Solid bodies.
 */

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
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

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x181825);
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    // Scene
    this.scene = new THREE.Scene();

    // Camera
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10000);
    this.camera.position.set(150, 150, 150);

    // Controls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(200, 300, 200);
    dir.castShadow = true;
    this.scene.add(dir);

    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(-100, 50, -100);
    this.scene.add(fill);

    // Grid
    const grid = new THREE.GridHelper(500, 50, 0x313244, 0x252536);
    this.scene.add(grid);

    // Mesh group
    this.meshGroup = new THREE.Group();
    this.scene.add(this.meshGroup);

    // Resize
    this.resize();
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);

    // Animate
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

    for (const body of bodies) {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(body.mesh.positions, 3));
      geom.setAttribute("normal", new THREE.BufferAttribute(body.mesh.normals, 3));
      geom.setIndex(new THREE.BufferAttribute(body.mesh.indices, 1));

      const color = body.color ?? [0.6, 0.6, 0.65, 1.0];
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color[0], color[1], color[2]),
        metalness: 0.1,
        roughness: 0.6,
        side: THREE.DoubleSide,
        transparent: color[3] < 1,
        opacity: color[3],
      });

      const mesh = new THREE.Mesh(geom, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.meshGroup.add(mesh);
    }

    // Auto-fit camera to content
    this.fitCamera();
  }

  private fitCamera(): void {
    const bbox = new THREE.Box3().setFromObject(this.meshGroup);
    if (bbox.isEmpty()) return;

    const center = bbox.getCenter(new THREE.Vector3());
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const dist = maxDim * 2;

    this.camera.position.set(
      center.x + dist * 0.7,
      center.y + dist * 0.5,
      center.z + dist * 0.7,
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

    // Three.js: Y is up, grid is on XZ plane.
    // CadLad/Manifold: Z is up in the model, but viewport maps Z-up to Y-up.
    // Camera views are relative to the rendered scene (Y-up).
    const views: Record<string, [number, number, number]> = {
      front:  [0, 0, dist],       // looking along -Z
      back:   [0, 0, -dist],      // looking along +Z
      top:    [0, dist, 0.001],   // looking down Y axis
      bottom: [0, -dist, 0.001],  // looking up Y axis
      left:   [-dist, 0, 0],      // looking along +X
      right:  [dist, 0, 0],       // looking along -X
      iso:    [dist * 0.7, dist * 0.5, dist * 0.7],
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
