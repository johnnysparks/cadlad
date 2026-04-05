import type { Vec3 } from "@cadlad/kernel/types.js";
import { Solid } from "@cadlad/kernel/solid.js";

export type Plane = {
  origin: Vec3;
  normal: Vec3;
};

export type Axis = {
  origin: Vec3;
  direction: Vec3;
};

export type Datum = {
  name?: string;
  point: Vec3;
};

export type MidplaneAxis = "x" | "y" | "z";
export type BBoxAnchor =
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "front"
  | "back"
  | "top-front-right"
  | "top-front-left"
  | "top-back-right"
  | "top-back-left"
  | "bottom-front-right"
  | "bottom-front-left"
  | "bottom-back-right"
  | "bottom-back-left";

function axisVector(axis: MidplaneAxis): Vec3 {
  if (axis === "x") return [1, 0, 0];
  if (axis === "y") return [0, 1, 0];
  return [0, 0, 1];
}

function bboxAnchorPoint(solid: Solid, anchor: BBoxAnchor): Vec3 {
  const bb = solid.boundingBox();
  const center: Vec3 = [
    (bb.min[0] + bb.max[0]) / 2,
    (bb.min[1] + bb.max[1]) / 2,
    (bb.min[2] + bb.max[2]) / 2,
  ];

  const x = {
    left: bb.min[0],
    center: center[0],
    right: bb.max[0],
  };
  const y = {
    front: bb.min[1],
    center: center[1],
    back: bb.max[1],
  };
  const z = {
    bottom: bb.min[2],
    center: center[2],
    top: bb.max[2],
  };

  switch (anchor) {
    case "center": return [x.center, y.center, z.center];
    case "top": return [x.center, y.center, z.top];
    case "bottom": return [x.center, y.center, z.bottom];
    case "left": return [x.left, y.center, z.center];
    case "right": return [x.right, y.center, z.center];
    case "front": return [x.center, y.front, z.center];
    case "back": return [x.center, y.back, z.center];
    case "top-front-right": return [x.right, y.front, z.top];
    case "top-front-left": return [x.left, y.front, z.top];
    case "top-back-right": return [x.right, y.back, z.top];
    case "top-back-left": return [x.left, y.back, z.top];
    case "bottom-front-right": return [x.right, y.front, z.bottom];
    case "bottom-front-left": return [x.left, y.front, z.bottom];
    case "bottom-back-right": return [x.right, y.back, z.bottom];
    case "bottom-back-left": return [x.left, y.back, z.bottom];
  }
}

export const plane = {
  XY(zOffset = 0): Plane {
    return { origin: [0, 0, zOffset], normal: [0, 0, 1] };
  },

  XZ(yOffset = 0): Plane {
    return { origin: [0, yOffset, 0], normal: [0, 1, 0] };
  },

  YZ(xOffset = 0): Plane {
    return { origin: [xOffset, 0, 0], normal: [1, 0, 0] };
  },

  midplane(solid: Solid, axis: MidplaneAxis): Plane {
    const bb = solid.boundingBox();
    const center: Vec3 = [
      (bb.min[0] + bb.max[0]) / 2,
      (bb.min[1] + bb.max[1]) / 2,
      (bb.min[2] + bb.max[2]) / 2,
    ];
    return {
      origin: center,
      normal: axisVector(axis),
    };
  },
};

export const axis = {
  X(origin: Vec3 = [0, 0, 0]): Axis {
    return { origin, direction: [1, 0, 0] };
  },
  Y(origin: Vec3 = [0, 0, 0]): Axis {
    return { origin, direction: [0, 1, 0] };
  },
  Z(origin: Vec3 = [0, 0, 0]): Axis {
    return { origin, direction: [0, 0, 1] };
  },
};

export const datum = {
  point(point: Vec3, name?: string): Datum {
    return { point, name };
  },

  fromBBox(solid: Solid, anchor: BBoxAnchor, name?: string): Datum {
    return {
      point: bboxAnchorPoint(solid, anchor),
      name,
    };
  },
};
