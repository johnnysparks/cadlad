/**
 * Assembly API.
 *
 * Groups multiple Solids with relative positioning.
 */

import { Solid } from "@cadlad/kernel/solid.js";
import type { Body } from "@cadlad/kernel/types.js";

export interface AssemblyPart {
  name: string;
  solid: Solid;
  position: [number, number, number];
}

export class Assembly {
  private _parts: AssemblyPart[] = [];
  private _name: string;

  constructor(name: string) {
    this._name = name;
  }

  /** Add a part at the given position. */
  add(name: string, solid: Solid, position: [number, number, number] = [0, 0, 0]): this {
    this._parts.push({ name, solid, position });
    return this;
  }

  /** Get all parts. */
  parts(): AssemblyPart[] {
    return [...this._parts];
  }

  /** Convert all parts to bodies for rendering. */
  toBodies(): Body[] {
    return this._parts.map((p) => {
      const translated = p.solid.translate(p.position[0], p.position[1], p.position[2]);
      return translated.named(`${this._name}/${p.name}`).toBody();
    });
  }

  /** Merge all parts into a single solid (union). */
  toSolid(): Solid {
    if (this._parts.length === 0) {
      throw new Error("Assembly is empty");
    }
    let result = this._parts[0].solid.translate(
      this._parts[0].position[0],
      this._parts[0].position[1],
      this._parts[0].position[2],
    );
    for (let i = 1; i < this._parts.length; i++) {
      const p = this._parts[i];
      const part = p.solid.translate(p.position[0], p.position[1], p.position[2]);
      result = result.union(part);
    }
    return result.named(this._name);
  }
}

/** Create a new named assembly. */
export function assembly(name: string): Assembly {
  return new Assembly(name);
}
