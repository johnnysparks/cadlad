"""
Decorative Vine Hook - Wall-mounted plant hanger bracket

A wrought iron style decorative hook featuring:
- Vertical mounting plate with screw holes
- Curving vine stem extending outward
- Decorative spiral curls
- Leaf shapes along the vine
- Hook end for hanging planters

All dimensions in millimeters.
"""

import cadquery as cq
import math

# ===== DESIGN PARAMETERS =====
BAR_RADIUS = 4.0

# Mounting plate
PLATE_HEIGHT = 180.0
PLATE_WIDTH = 25.0
PLATE_THICKNESS = 4.0
HOLE_DIAMETER = 6.0
HOLE_SPACING = 140.0

# Leaf dimensions
LEAF_LENGTH = 25.0
LEAF_WIDTH = 14.0
LEAF_THICKNESS = 2.5


# ===== HELPER FUNCTIONS =====

def make_mounting_plate():
    """Create the vertical mounting plate with screw holes."""
    plate = (
        cq.Workplane("XY")
        .box(PLATE_WIDTH, PLATE_THICKNESS, PLATE_HEIGHT)
        .translate((PLATE_WIDTH / 2, PLATE_THICKNESS / 2, PLATE_HEIGHT / 2))
    )

    for z_offset in [-HOLE_SPACING / 2, HOLE_SPACING / 2]:
        z_pos = PLATE_HEIGHT / 2 + z_offset
        hole = (
            cq.Workplane("XZ")
            .workplane(offset=PLATE_THICKNESS)
            .center(PLATE_WIDTH / 2, z_pos)
            .circle(HOLE_DIAMETER / 2)
            .extrude(-PLATE_THICKNESS * 2)
        )
        plate = plate.cut(hole)

    return plate


def make_tube_segment(p1, p2, radius=BAR_RADIUS):
    """Create a tube between two 3D points."""
    dx, dy, dz = p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]
    length = math.sqrt(dx*dx + dy*dy + dz*dz)
    if length < 1.0:
        return None

    cyl = cq.Workplane("XY").circle(radius).extrude(length)

    # Calculate rotation to align cylinder with direction
    if length > 0.001:
        dir_vec = (dx/length, dy/length, dz/length)
        angle_from_z = math.degrees(math.acos(max(-1, min(1, dir_vec[2]))))

        if abs(dir_vec[2]) < 0.9999:
            rx, ry = -dir_vec[1], dir_vec[0]
            r_len = math.sqrt(rx*rx + ry*ry)
            if r_len > 0.001:
                cyl = cyl.rotate((0, 0, 0), (rx/r_len, ry/r_len, 0), angle_from_z)
        elif dir_vec[2] < 0:
            cyl = cyl.rotate((0, 0, 0), (1, 0, 0), 180)

    return cyl.translate(p1)


def make_tube_chain(points, radius=BAR_RADIUS):
    """Create tube segments connected by spheres."""
    result = cq.Workplane("XY").sphere(radius).translate(points[0])

    for i in range(len(points) - 1):
        # Add sphere at each joint
        sphere = cq.Workplane("XY").sphere(radius).translate(points[i + 1])
        result = result.union(sphere)

        # Add cylinder segment
        seg = make_tube_segment(points[i], points[i + 1], radius)
        if seg is not None:
            result = result.union(seg)

    return result


def make_spiral_2d(cx, cy, z, start_angle, turns, start_r, end_r, cw, radius):
    """Create a 2D spiral in the XY plane at height z."""
    pts = []
    n = 6
    d = -1 if cw else 1

    for i in range(n):
        t = i / (n - 1)
        angle = start_angle + d * t * turns * 2 * math.pi
        r = start_r * (1 - t) + end_r * t
        pts.append((cx + r * math.cos(angle), cy + r * math.sin(angle), z))

    return make_tube_chain(pts, radius)


def make_leaf(x, y, z, angle_z=0):
    """Create a simple leaf shape."""
    leaf = (
        cq.Workplane("XY")
        .ellipse(LEAF_LENGTH / 2, LEAF_WIDTH / 2)
        .extrude(LEAF_THICKNESS)
    )

    # Add stem
    stem = (
        cq.Workplane("XY")
        .center(-LEAF_LENGTH / 2 - 5, 0)
        .rect(10, 3)
        .extrude(LEAF_THICKNESS)
    )
    leaf = leaf.union(stem)

    # Rotate and position
    leaf = leaf.rotate((0, 0, 0), (0, 0, 1), angle_z)
    leaf = leaf.translate((x, y, z))

    return leaf


# ===== BUILD COMPONENTS =====

z_base = PLATE_HEIGHT * 0.65

# Main vine stem
main_vine = make_tube_chain([
    (PLATE_WIDTH - 5, 0, z_base),
    (60, 18, z_base + 8),
    (120, 28, z_base + 5),
    (180, 22, z_base - 10),
])

# Upper decorative branch
upper_branch = make_tube_chain([
    (70, 20, z_base + 10),
    (110, 40, z_base + 28),
    (160, 48, z_base + 30),
], BAR_RADIUS * 0.85)

# Upper spiral
upper_spiral = make_spiral_2d(168, 45, z_base + 28, 0.3, 0.7, 15, 5, True, BAR_RADIUS * 0.7)
upper_branch = upper_branch.union(upper_spiral)

# Lower decorative branch
lower_branch = make_tube_chain([
    (100, 26, z_base),
    (140, 10, z_base - 20),
    (165, 0, z_base - 32),
], BAR_RADIUS * 0.85)

# Lower spiral
lower_spiral = make_spiral_2d(172, -8, z_base - 34, -0.3, 0.7, 12, 4, False, BAR_RADIUS * 0.7)
lower_branch = lower_branch.union(lower_spiral)

# Top decorative curl
top_curl = make_tube_chain([
    (PLATE_WIDTH / 2, 3, PLATE_HEIGHT - 8),
    (5, 12, PLATE_HEIGHT + 10),
    (-8, 10, PLATE_HEIGHT + 5),
], BAR_RADIUS * 0.85)

top_spiral = make_spiral_2d(-12, 6, PLATE_HEIGHT + 3, 2.5, 0.6, 10, 4, True, BAR_RADIUS * 0.65)
top_curl = top_curl.union(top_spiral)

# Hook at end
hook = make_tube_chain([
    (175, 20, z_base - 8),
    (192, 10, z_base - 28),
    (194, 12, z_base - 48),
    (186, 18, z_base - 55),
    (175, 20, z_base - 50),
])

hook_spiral = make_spiral_2d(168, 22, z_base - 48, 1.5, 0.5, 8, 3, False, BAR_RADIUS * 0.65)
hook = hook.union(hook_spiral)

# Leaves
leaf1 = make_leaf(60, 22, z_base + 10, -40)
leaf2 = make_leaf(115, 42, z_base + 28, -60)
leaf3 = make_leaf(148, 46, z_base + 30, -75)
leaf4 = make_leaf(85, 24, z_base + 8, 35)
leaf5 = make_leaf(135, 8, z_base - 18, 50)

# ===== ASSEMBLY =====
plate = make_mounting_plate()

result = plate
result = result.union(main_vine)
result = result.union(upper_branch)
result = result.union(lower_branch)
result = result.union(top_curl)
result = result.union(hook)
result = result.union(leaf1)
result = result.union(leaf2)
result = result.union(leaf3)
result = result.union(leaf4)
result = result.union(leaf5)

# Components for colored rendering
components = {
    'frame': (result, (45, 45, 45)),
}
