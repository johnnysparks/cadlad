import type { Body, GeometryBounds, GeometryPartStats, GeometryPairwisePartStats, GeometryStats } from "../cad-kernel/types.js";

export function computeModelStats(bodies: Body[]): GeometryStats | undefined {
  if (bodies.length === 0) return undefined;

  const parts: GeometryPartStats[] = [];
  const partIdCounts = new Map<string, number>();
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  let totalTriangles = 0;
  let totalVolume = 0;
  let totalArea = 0;

  for (let i = 0; i < bodies.length; i += 1) {
    const body = bodies[i];
    const part = computePartStats(body, i, partIdCounts);
    parts.push(part);

    totalTriangles += part.triangles;
    totalVolume += part.volume;
    totalArea += part.surfaceArea;

    minX = Math.min(minX, part.boundingBox.min[0]);
    minY = Math.min(minY, part.boundingBox.min[1]);
    minZ = Math.min(minZ, part.boundingBox.min[2]);
    maxX = Math.max(maxX, part.boundingBox.max[0]);
    maxY = Math.max(maxY, part.boundingBox.max[1]);
    maxZ = Math.max(maxZ, part.boundingBox.max[2]);
  }

  const pairwise: GeometryPairwisePartStats[] = [];
  for (let i = 0; i < parts.length; i += 1) {
    for (let j = i + 1; j < parts.length; j += 1) {
      const a = parts[i];
      const b = parts[j];
      const minDistance = bboxMinDistance(a.boundingBox, b.boundingBox);
      pairwise.push({
        partA: a.name,
        partAId: a.id,
        partB: b.name,
        partBId: b.id,
        intersects: minDistance === 0,
        minDistance,
      });
    }
  }

  const componentCount = countComponents(parts, pairwise);

  return {
    triangles: Math.floor(totalTriangles),
    bodies: bodies.length,
    componentCount,
    boundingBox: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] },
    volume: totalVolume,
    surfaceArea: totalArea,
    parts,
    pairwise,
    checks: {
      hasZeroVolume: totalVolume <= Number.EPSILON,
      hasDegenerateBoundingBox: (maxX - minX) <= Number.EPSILON || (maxY - minY) <= Number.EPSILON || (maxZ - minZ) <= Number.EPSILON,
      hasDisconnectedComponents: componentCount > 1,
    },
  };
}

function computePartStats(body: Body, index: number, partIdCounts: Map<string, number>): GeometryPartStats {
  const mesh = body.mesh;
  const positions = mesh.positions;
  const indices = mesh.indices;

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  let area = 0;
  let signedVolume = 0;
  for (let i = 0; i < indices.length; i += 3) {
    const ai = indices[i] * 3;
    const bi = indices[i + 1] * 3;
    const ci = indices[i + 2] * 3;

    const ax = positions[ai], ay = positions[ai + 1], az = positions[ai + 2];
    const bx = positions[bi], by = positions[bi + 1], bz = positions[bi + 2];
    const cx = positions[ci], cy = positions[ci + 1], cz = positions[ci + 2];

    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;

    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    area += 0.5 * Math.hypot(crossX, crossY, crossZ);

    const bxcx = by * cz - bz * cy;
    const bxcy = bz * cx - bx * cz;
    const bxcz = bx * cy - by * cx;
    signedVolume += (ax * bxcx + ay * bxcy + az * bxcz) / 6;
  }

  const name = body.name?.trim() || `part-${index + 1}`;
  const id = buildPartId(name, partIdCounts);
  return {
    index,
    id,
    name,
    triangles: indices.length / 3,
    boundingBox: {
      min: [minX, minY, minZ],
      max: [maxX, maxY, maxZ],
    },
    extents: {
      x: maxX - minX,
      y: maxY - minY,
      z: maxZ - minZ,
    },
    volume: Math.abs(signedVolume),
    surfaceArea: area,
  };
}

function buildPartId(name: string, partIdCounts: Map<string, number>): string {
  const slug = slugify(name);
  const next = (partIdCounts.get(slug) ?? 0) + 1;
  partIdCounts.set(slug, next);
  return next === 1 ? slug : `${slug}-${next}`;
}

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "part";
}

function bboxMinDistance(a: GeometryBounds, b: GeometryBounds): number {
  const dx = axisGap(a.min[0], a.max[0], b.min[0], b.max[0]);
  const dy = axisGap(a.min[1], a.max[1], b.min[1], b.max[1]);
  const dz = axisGap(a.min[2], a.max[2], b.min[2], b.max[2]);
  return Math.hypot(dx, dy, dz);
}

function axisGap(minA: number, maxA: number, minB: number, maxB: number): number {
  if (maxA < minB) return minB - maxA;
  if (maxB < minA) return minA - maxB;
  return 0;
}

function countComponents(parts: GeometryPartStats[], pairwise: GeometryPairwisePartStats[]): number {
  if (parts.length === 0) return 0;
  if (parts.length === 1) return 1;

  const adjacency = new Map<string, Set<string>>();
  for (const part of parts) {
    adjacency.set(part.id, new Set());
  }

  for (const pair of pairwise) {
    if (!pair.intersects) continue;
    adjacency.get(pair.partAId)?.add(pair.partBId);
    adjacency.get(pair.partBId)?.add(pair.partAId);
  }

  let components = 0;
  const visited = new Set<string>();

  for (const part of parts) {
    if (visited.has(part.id)) continue;
    components += 1;
    const queue = [part.id];
    visited.add(part.id);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (visited.has(neighbor)) continue;
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return components;
}
