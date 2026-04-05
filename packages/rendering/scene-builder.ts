/**
 * Shared rendering utilities for building Three.js scenes from Body arrays.
 *
 * Used by: studio viewport, gallery static render, gallery interactive viewer.
 * Single source of truth for lighting, auto-color, edge strokes, and materials.
 */

import * as THREE from "three";
import type { Body } from "@cadlad/kernel/types.js";

export type RenderStyle = "default" | "high-contrast";

/** Muted color palette for bodies without explicit .color() */
const AUTO_COLORS: [number, number, number][] = [
  [0.55, 0.65, 0.78], // steel blue
  [0.72, 0.58, 0.44], // warm tan
  [0.50, 0.70, 0.55], // sage green
  [0.75, 0.52, 0.52], // muted red
  [0.60, 0.55, 0.72], // lavender
  [0.70, 0.68, 0.50], // olive
  [0.50, 0.68, 0.70], // teal
  [0.72, 0.55, 0.65], // mauve
];

const EDGE_ANGLE_THRESHOLD = 30; // degrees

/** Check if a color is the default gray (no explicit .color() was set). */
function isDefaultColor(color?: [number, number, number, number]): boolean {
  if (!color) return true;
  return (
    Math.abs(color[0] - 0.6) < 0.01 &&
    Math.abs(color[1] - 0.6) < 0.01 &&
    Math.abs(color[2] - 0.65) < 0.01
  );
}

/** Compute luminance for adaptive edge color. */
function luminance(r: number, g: number, b: number): number {
  return r * 0.299 + g * 0.587 + b * 0.114;
}

/** Get an edge color that contrasts with the surface: 50% darker or lighter. */
function adaptiveEdgeColor(r: number, g: number, b: number): THREE.Color {
  if (luminance(r, g, b) > 0.45) {
    return new THREE.Color(r * 0.5, g * 0.5, b * 0.5);
  }
  return new THREE.Color(
    r + (1 - r) * 0.5,
    g + (1 - g) * 0.5,
    b + (1 - b) * 0.5,
  );
}

/** Create the standard 3-point + rim lighting setup. */
export function createLighting(style: RenderStyle): THREE.Light[] {
  const lights: THREE.Light[] = [];

  if (style === "high-contrast") {
    lights.push(new THREE.AmbientLight(0xffffff, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 0.5);
    key.position.set(200, 300, 200);
    lights.push(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(-200, 100, -100);
    lights.push(fill);
  } else {
    lights.push(new THREE.AmbientLight(0xffffff, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 0.8);
    key.position.set(200, 300, 200);
    key.castShadow = true;
    lights.push(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.3);
    fill.position.set(-200, 100, -100);
    lights.push(fill);
    const rim = new THREE.DirectionalLight(0xaaccff, 0.4);
    rim.position.set(0, -100, -300);
    lights.push(rim);
    const topFill = new THREE.DirectionalLight(0xffffff, 0.15);
    topFill.position.set(0, 400, 0);
    lights.push(topFill);
  }

  return lights;
}

/** Create a grid helper matching the style. */
export function createGrid(style: RenderStyle): THREE.GridHelper {
  if (style === "high-contrast") {
    return new THREE.GridHelper(500, 50, 0xdddddd, 0xeeeeee);
  }
  return new THREE.GridHelper(500, 50, 0x313244, 0x252536);
}

export interface BuildBodyGroupOptions {
  style?: RenderStyle;
  /** Rotate -90° on X to convert Manifold Z-up to Three.js Y-up. */
  zUpToYUp?: boolean;
}

/**
 * Build a THREE.Group containing meshes + edge strokes for the given bodies.
 *
 * Handles: auto-color palette, material creation, adaptive edge strokes,
 * high-contrast mode, and optional Z-up to Y-up coordinate conversion.
 */
export function buildBodyGroup(
  bodies: Body[],
  options: BuildBodyGroupOptions = {},
): THREE.Group {
  const { style = "default", zUpToYUp = false } = options;
  const hiContrast = style === "high-contrast";

  const group = new THREE.Group();
  if (zUpToYUp) {
    group.rotation.x = -Math.PI / 2;
  }

  for (let i = 0; i < bodies.length; i++) {
    const body = bodies[i];
    const isToolBody = body.kind === "tool-body";
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(body.mesh.positions, 3));
    geometry.setAttribute("normal", new THREE.BufferAttribute(body.mesh.normals, 3));
    geometry.setIndex(new THREE.BufferAttribute(body.mesh.indices, 1));

    // Resolve color
    let r: number, g: number, b: number;
    if (hiContrast) {
      r = 0.88; g = 0.88; b = 0.86;
    } else if (isDefaultColor(body.color)) {
      const ac = AUTO_COLORS[i % AUTO_COLORS.length];
      [r, g, b] = ac;
    } else {
      [r, g, b] = body.color!;
    }

    // Surface material
    const material = isToolBody
      ? new THREE.MeshBasicMaterial({
          color: new THREE.Color(0.95, 0.45, 0.2),
          wireframe: true,
          transparent: true,
          opacity: 0.85,
        })
      : new THREE.MeshStandardMaterial({
          color: new THREE.Color(r, g, b),
          metalness: hiContrast ? 0.0 : 0.1,
          roughness: hiContrast ? 0.9 : 0.6,
          side: THREE.DoubleSide,
          transparent: !hiContrast && (body.color?.[3] ?? 1) < 1,
          opacity: hiContrast ? 1 : (body.color?.[3] ?? 1),
        });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    // Edge strokes
    if (!isToolBody) {
      const edges = new THREE.EdgesGeometry(geometry, EDGE_ANGLE_THRESHOLD);
      let edgeColor: THREE.Color;
      if (hiContrast) {
        edgeColor = new THREE.Color(bodies.length > 1 ? 0x222222 : 0x555555);
      } else {
        edgeColor = adaptiveEdgeColor(r, g, b);
      }
      group.add(new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: edgeColor })));
    }
  }

  return group;
}
