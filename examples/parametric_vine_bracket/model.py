"""Parametric Organic Vine Bracket

A decorative, 3D-printable wall bracket featuring an interwoven vine/lattice structure.
Uses a solid frame approach with organic cutouts to create the vine pattern.

Design Reference: Interwoven organic vine patterns with leaves for wall-mounted brackets.
"""

import cadquery as cq
import math
import random

# =============================================================================
# PARAMETERS
# =============================================================================

HEIGHT = 200        # Z-axis
DEPTH = 150         # Y-axis
WIDTH = 25          # X-axis (thickness of vine structure)

WALL_THICKNESS = 8
SCREW_HOLE_DIA = 5
SCREW_HEAD_DIA = 10

VINE_THICKNESS = 6  # Thickness of individual vine strands
HOOK_RADIUS = 25
HOOK_THICKNESS = 12

NOISE_SEED = 42

# Colors
VINE_GREEN = (60, 130, 60)
LEAF_GREEN = (40, 95, 40)
PLATE_GREEN = (50, 110, 50)

rng = random.Random(NOISE_SEED)
def seeded_random(a=0.0, b=1.0):
    return rng.uniform(a, b)

# =============================================================================
# MOUNTING PLATE
# =============================================================================

def create_mounting_plate():
    """Create the wall mounting plate."""
    plate = (
        cq.Workplane("XZ")
        .rect(WIDTH, HEIGHT)
        .extrude(WALL_THICKNESS)
        .edges("|Y")
        .chamfer(2)
    )

    # Screw holes
    for z_pos in [HEIGHT/2 - 20, 0, -HEIGHT/2 + 20]:
        plate = plate.faces("<Y").workplane().moveTo(0, z_pos).hole(SCREW_HOLE_DIA)
        plate = plate.faces("<Y").workplane().moveTo(0, z_pos).cskHole(SCREW_HOLE_DIA, SCREW_HEAD_DIA, 82)

    # Diamond detail
    plate = (
        plate.faces(">Y").workplane()
        .moveTo(0, HEIGHT/2 - 20)
        .polygon(4, 16, circumscribed=True)
        .extrude(3)
    )

    return plate

# =============================================================================
# TRIANGULAR BRACKET FRAME
# =============================================================================

def create_bracket_frame():
    """
    Create the main triangular bracket shape as a solid frame.
    This forms the structural skeleton that will be filled with vine detail.
    """
    # The bracket is a triangular profile extruded in X
    # Points define a right-triangle shape
    profile_points = [
        (WALL_THICKNESS, HEIGHT/2 - 25),           # Top at plate
        (WALL_THICKNESS, -HEIGHT/2 + 25),          # Bottom at plate
        (DEPTH - HOOK_RADIUS + 10, -HEIGHT/2 + 25), # Bottom front
    ]

    # Create the triangular profile
    frame = (
        cq.Workplane("YZ")
        .polyline(profile_points + [profile_points[0]])
        .close()
        .extrude(WIDTH)
        .translate((-WIDTH/2, 0, 0))
    )

    # Round the edges slightly
    try:
        frame = frame.edges().fillet(3)
    except Exception:
        pass

    return frame

# =============================================================================
# VINE LATTICE (DIAGONAL BARS)
# =============================================================================

def create_vine_lattice():
    """
    Create a diagonal lattice pattern that looks like interwoven vines.
    Uses diagonal bars crossing in two directions.
    """
    lattice = None

    # Calculate the bounds of our triangle
    y_min = WALL_THICKNESS + 5
    y_max = DEPTH - HOOK_RADIUS
    z_top = HEIGHT/2 - 30
    z_bottom = -HEIGHT/2 + 30

    # Diagonal bars going one direction (/)
    num_bars_a = 6
    for i in range(num_bars_a):
        t = i / (num_bars_a - 1) if num_bars_a > 1 else 0.5

        # Start and end points for this diagonal
        # Start at plate side, end toward hook
        y1 = y_min
        z1 = z_top - t * (z_top - z_bottom) * 0.7

        y2 = y_min + (y_max - y_min) * (0.5 + t * 0.4)
        z2 = z_bottom + t * 30

        # Create a cylinder representing this vine
        dx, dy, dz = 0, y2 - y1, z2 - z1
        length = math.sqrt(dy**2 + dz**2)

        if length > 10:
            mid = (0, (y1 + y2)/2, (z1 + z2)/2)

            # Build vine as cylinder
            vine = cq.Workplane("XY").cylinder(length, VINE_THICKNESS/2)

            # Rotate to align with the line
            angle = math.atan2(dz, dy) * 180 / math.pi
            vine = vine.rotate((0, 0, 0), (1, 0, 0), 90 - angle)
            vine = vine.translate(mid)

            # Add organic bumps (spheres at ends)
            sph1 = cq.Workplane("XY").sphere(VINE_THICKNESS/2 * 1.2).translate((seeded_random(-2, 2), y1, z1))
            sph2 = cq.Workplane("XY").sphere(VINE_THICKNESS/2 * 1.2).translate((seeded_random(-2, 2), y2, z2))
            vine = vine.union(sph1).union(sph2)

            if lattice is None:
                lattice = vine
            else:
                lattice = lattice.union(vine)

    # Diagonal bars going the other direction (\)
    num_bars_b = 5
    for i in range(num_bars_b):
        t = (i + 0.5) / num_bars_b

        # Cross-bars
        y1 = y_min + 10
        z1 = z_bottom + t * (z_top - z_bottom) * 0.8

        y2 = y_min + (y_max - y_min) * (0.3 + t * 0.35)
        z2 = z1 + 50 * (1 - t)

        dx, dy, dz = 0, y2 - y1, z2 - z1
        length = math.sqrt(dy**2 + dz**2)

        if length > 10:
            mid = (0, (y1 + y2)/2, (z1 + z2)/2)

            vine = cq.Workplane("XY").cylinder(length, VINE_THICKNESS/2 * 0.9)

            angle = math.atan2(dz, dy) * 180 / math.pi
            vine = vine.rotate((0, 0, 0), (1, 0, 0), 90 - angle)
            vine = vine.translate(mid)

            sph1 = cq.Workplane("XY").sphere(VINE_THICKNESS/2).translate((seeded_random(-2, 2), y1, z1))
            sph2 = cq.Workplane("XY").sphere(VINE_THICKNESS/2).translate((seeded_random(-2, 2), y2, z2))
            vine = vine.union(sph1).union(sph2)

            if lattice:
                lattice = lattice.union(vine)
            else:
                lattice = vine

    # Add some curved connecting pieces
    curve_positions = [
        (y_min + 30, 20),
        (y_min + 50, -20),
        (y_min + 40, 50),
        (y_min + 60, -40),
    ]

    for y_mid, z_mid in curve_positions:
        # Create a small curved vine segment
        pts = []
        for j in range(5):
            s = j / 4
            arc = s * math.pi * 0.5 - math.pi * 0.25
            y = y_mid + 15 * math.cos(arc)
            z = z_mid + 20 * math.sin(arc)
            pts.append((seeded_random(-3, 3), y, z))

        # Connect points with spheres
        for pt in pts:
            sph = cq.Workplane("XY").sphere(VINE_THICKNESS/2 * 0.8).translate(pt)
            if lattice:
                lattice = lattice.union(sph)

    return lattice

# =============================================================================
# FRAME SPINES
# =============================================================================

def create_frame_spines():
    """Create the main structural vine spines along the bracket edges."""
    spines = None

    # Top spine - from top of plate curving down to hook area
    spine_points_top = []
    for i in range(10):
        t = i / 9
        y = WALL_THICKNESS + 5 + t * (DEPTH - HOOK_RADIUS - 15)
        z = (HEIGHT/2 - 30) - t * t * (HEIGHT - 40)
        x = seeded_random(-2, 2)
        spine_points_top.append((x, y, z))

    for pt in spine_points_top:
        sph = cq.Workplane("XY").sphere(VINE_THICKNESS/2 * 1.3).translate(pt)
        if spines is None:
            spines = sph
        else:
            spines = spines.union(sph)

    # Bottom spine - along the bottom edge
    spine_points_bottom = []
    for i in range(8):
        t = i / 7
        y = WALL_THICKNESS + 5 + t * (DEPTH - HOOK_RADIUS - 20)
        z = -HEIGHT/2 + 30 + 10 * math.sin(t * math.pi * 0.5)
        x = seeded_random(-2, 2)
        spine_points_bottom.append((x, y, z))

    for pt in spine_points_bottom:
        sph = cq.Workplane("XY").sphere(VINE_THICKNESS/2 * 1.2).translate(pt)
        spines = spines.union(sph)

    # Vertical spine along plate
    for i in range(8):
        t = i / 7
        z = (HEIGHT/2 - 30) - t * (HEIGHT - 60)
        y = WALL_THICKNESS + 5
        x = seeded_random(-2, 2)
        sph = cq.Workplane("XY").sphere(VINE_THICKNESS/2 * 1.1).translate((x, y, z))
        spines = spines.union(sph)

    return spines

# =============================================================================
# HOOK
# =============================================================================

def create_hook():
    """Create the curved hook."""
    hook_y = DEPTH - HOOK_RADIUS
    hook_z = -HEIGHT/2 + HOOK_RADIUS

    hook = None
    for i in range(15):
        t = i / 14
        angle = math.pi/2 - t * math.pi * 1.5  # 270 degree arc
        y = hook_y + HOOK_RADIUS * math.cos(angle)
        z = hook_z + HOOK_RADIUS * math.sin(angle)
        x = seeded_random(-1, 1)

        sph = cq.Workplane("XY").sphere(HOOK_THICKNESS/2).translate((x, y, z))
        if hook is None:
            hook = sph
        else:
            hook = hook.union(sph)

    return hook

# =============================================================================
# LEAVES
# =============================================================================

def create_leaves():
    """Create decorative leaves."""
    leaves = None

    leaf_data = [
        (4, 35, 55, 45),
        (-5, 55, 25, -30),
        (3, 45, -25, 60),
        (-4, 70, 40, -45),
        (5, 60, -15, 30),
        (-3, 80, 15, -60),
        (4, 50, 65, 15),
        (-5, 65, -35, -20),
        (3, 90, 25, 45),
        (5, 40, -55, -40),
        (-4, 75, 50, 30),
    ]

    for x, y, z, rot in leaf_data:
        x += seeded_random(-2, 2)
        y += seeded_random(-3, 3)
        z += seeded_random(-3, 3)

        length = seeded_random(10, 16)
        width = length * 0.4

        try:
            leaf = (
                cq.Workplane("XY")
                .ellipse(width/2, length/2)
                .extrude(1.5)
            )
            leaf = leaf.rotate((0, 0, 0), (0, 1, 0), seeded_random(-30, 30))
            leaf = leaf.rotate((0, 0, 0), (0, 0, 1), rot + seeded_random(-20, 20))
            leaf = leaf.translate((x, y, z))

            if leaves is None:
                leaves = leaf
            else:
                leaves = leaves.union(leaf)
        except Exception:
            pass

    return leaves

# =============================================================================
# MAIN BUILD
# =============================================================================

def build_vine_bracket():
    print("=" * 60)
    print("PARAMETRIC ORGANIC VINE BRACKET")
    print("=" * 60)
    print(f"\nDimensions: {HEIGHT}mm H x {DEPTH}mm D x {WIDTH}mm W")

    print("\nGenerating geometry...")

    print("  Creating mounting plate...")
    plate = create_mounting_plate()

    print("  Creating frame spines...")
    spines = create_frame_spines()

    print("  Creating vine lattice...")
    lattice = create_vine_lattice()

    print("  Creating hook...")
    hook = create_hook()

    print("  Creating leaves...")
    leaves = create_leaves()

    print("  Assembling...")
    result = plate

    if spines:
        result = result.union(spines)
    if lattice:
        result = result.union(lattice)
    if hook:
        result = result.union(hook)
    if leaves:
        result = result.union(leaves)

    print("\nDone!")
    print("=" * 60)

    return result, plate, spines, lattice, hook, leaves

# =============================================================================
# BUILD
# =============================================================================

result, plate, spines, lattice, hook, leaves = build_vine_bracket()

# Components for rendering
components = {'plate': (plate, PLATE_GREEN)}
if spines:
    components['spines'] = (spines, VINE_GREEN)
if lattice:
    components['lattice'] = (lattice, VINE_GREEN)
if hook:
    components['hook'] = (hook, VINE_GREEN)
if leaves:
    components['leaves'] = (leaves, LEAF_GREEN)
