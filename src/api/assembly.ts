/**
 * Assembly API.
 *
 * Groups multiple Solids with relative positioning.
 */

import type { Body } from "../engine/types.js";
import { Solid } from "../engine/solid.js";

export interface AssemblyPart {
  name: string;
  item: Solid | Assembly;
  position: [number, number, number];
}

export class Assembly {
  private _name: string;
  private _parts: AssemblyPart[] = [];

  constructor(name: string) {
    this._name = name;
  }

  /** Add a part or sub-assembly at the given position. */
  add(name: string, item: Solid | Assembly, position: [number, number, number] = [0, 0, 0]): this {
    this._parts.push({ name, item, position });
    return this;
  }

  /** Get all parts. */
  parts(): AssemblyPart[] {
    return [...this._parts];
  }

  /** Convert all parts to bodies for rendering, flattening the hierarchy. */
  toBodies(): Body[] {
    const allBodies: Body[] = [];
    for (const p of this._parts) {
      if (p.item instanceof Solid) {
        const translated = p.item.translate(p.position[0], p.position[1], p.position[2]);
        allBodies.push(translated.named(`${this._name}/${p.name}`).toBody());
      } else {
        // Nested assembly
        const subBodies = p.item.toBodies();
        for (const b of subBodies) {
          // Wrap the sub-body mesh in a temporary solid to translate it
          // This is a bit heavy but correct for current architecture
          const tempSolid = new Solid((b as any)._manifold); // Hack to get manifold
          // Actually, better: if item is Assembly, we should probably have a translate method on Assembly too
          // For now, let's just flatten and translate the sub-bodies
          const translated = b.mesh.positions.map((v, i) => v + p.position[i % 3]);
          allBodies.push({
            ...b,
            name: `${this._name}/${p.name}/${b.name}`,
            mesh: {
              ...b.mesh,
              positions: new Float32Array(translated),
            },
          });
        }
      }
    }
    return allBodies;
  }

  /** Merge all parts into a single solid (union). */
  toSolid(): Solid {
    if (this._parts.length === 0) {
      throw new Error("Assembly is empty");
    }

    let result: Solid | undefined;

    for (const p of this._parts) {
      const itemSolid = p.item instanceof Solid ? p.item : p.item.toSolid();
      const positioned = itemSolid.translate(p.position[0], p.position[1], p.position[2]);

      if (!result) {
        result = positioned;
      } else {
        result = result.union(positioned);
      }
    }

    return result!.named(this._name);
  }
}


/** Create a new named assembly. */
export function assembly(name: string): Assembly {
  return new Assembly(name);
}
