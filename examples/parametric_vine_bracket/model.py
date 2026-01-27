"""Parametric Organic Vine Bracket

A decorative, 3D-printable wall bracket featuring an interwoven vine/lattice structure.
Combines biophilic design aesthetics with functional utility for shelving or hanging.

Key Features:
- Parametric vine density and leaf placement
- Organic sweeping paths using spline interpolation
- Manifold geometry suitable for 3D printing
- Structural integrity from continuous vine paths

This example demonstrates:
- Complex spline-based organic geometry
- Parametric randomization with seed control
- Multi-component assembly with boolean unions
- Creating natural-looking structures in CAD

Design Reference: Interwoven organic vine patterns with leaves for wall-mounted brackets.
"""

import cadquery as cq
import math
import random

# =============================================================================
# PARAMETERS
# =============================================================================

# Primary Dimensions (mm)
HEIGHT = 200        # Z-axis - total bracket height
DEPTH = 150         # Y-axis - how far bracket extends from wall
WIDTH = 30          # X-axis - width of mounting plate and vine cluster

# Mounting Plate
WALL_THICKNESS = 5      # Thickness of the mounting backplate
CHAMFER_SIZE = 2        # Edge chamfer for aesthetics
SCREW_HOLE_DIA = 5      # Clearance for #8 screws (4mm + clearance)
SCREW_HEAD_DIA = 10     # Countersink diameter for screw heads

# Vine Parameters
VINE_DENSITY = 6            # Number of primary vine paths (3-12)
VINE_RADIUS = 3.0           # Base radius of vine tubes
VINE_RADIUS_VAR = 0.5       # Variation in vine radius for organic look
LEAF_FREQUENCY = 0.2        # Probability of leaf at each lattice node (0.0-0.5)
NOISE_SEED = 42             # Random seed for reproducible "organic" layout

# Hook Parameters
HOOK_RADIUS = 20        # Radius of the curl at the tip
HOOK_THICKNESS = 8      # Thickness of the hook section

# Quality Settings
SPLINE_SEGMENTS = 24    # Number of segments for spline interpolation
SWEEP_SEGMENTS = 16     # Segments around vine circumference

# =============================================================================
# COLORS
# =============================================================================

# Forest green for natural vine appearance
VINE_GREEN = (60, 130, 60)
LEAF_GREEN = (45, 100, 45)
PLATE_GREEN = (50, 110, 50)

# =============================================================================
# RANDOM NUMBER GENERATOR WITH SEED
# =============================================================================

rng = random.Random(NOISE_SEED)

def seeded_random(min_val=0.0, max_val=1.0):
    """Get a seeded random value in range."""
    return rng.uniform(min_val, max_val)

def seeded_randint(min_val, max_val):
    """Get a seeded random integer in range."""
    return rng.randint(min_val, max_val)

# =============================================================================
# GEOMETRY HELPERS
# =============================================================================

def normalize(v):
    """Normalize a 3D vector."""
    mag = math.sqrt(v[0]**2 + v[1]**2 + v[2]**2)
    if mag == 0:
        return (0, 0, 1)
    return (v[0]/mag, v[1]/mag, v[2]/mag)

def cross_product(a, b):
    """Calculate cross product of two 3D vectors."""
    return (
        a[1]*b[2] - a[2]*b[1],
        a[2]*b[0] - a[0]*b[2],
        a[0]*b[1] - a[1]*b[0]
    )

def vec_add(a, b):
    """Add two 3D vectors."""
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])

def vec_scale(v, s):
    """Scale a 3D vector."""
    return (v[0] * s, v[1] * s, v[2] * s)

def lerp(a, b, t):
    """Linear interpolation between two values."""
    return a + (b - a) * t

def lerp_vec(a, b, t):
    """Linear interpolation between two 3D vectors."""
    return (lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t))

def bezier_point(p0, p1, p2, p3, t):
    """Calculate point on cubic bezier curve at parameter t."""
    u = 1 - t
    return (
        u**3 * p0[0] + 3*u**2*t * p1[0] + 3*u*t**2 * p2[0] + t**3 * p3[0],
        u**3 * p0[1] + 3*u**2*t * p1[1] + 3*u*t**2 * p2[1] + t**3 * p3[1],
        u**3 * p0[2] + 3*u**2*t * p1[2] + 3*u*t**2 * p2[2] + t**3 * p3[2]
    )

def bezier_tangent(p0, p1, p2, p3, t):
    """Calculate tangent vector on cubic bezier curve at parameter t."""
    u = 1 - t
    return normalize((
        3*u**2 * (p1[0]-p0[0]) + 6*u*t * (p2[0]-p1[0]) + 3*t**2 * (p3[0]-p2[0]),
        3*u**2 * (p1[1]-p0[1]) + 6*u*t * (p2[1]-p1[1]) + 3*t**2 * (p3[1]-p2[1]),
        3*u**2 * (p1[2]-p0[2]) + 6*u*t * (p2[2]-p1[2]) + 3*t**2 * (p3[2]-p2[2])
    ))

# =============================================================================
# MOUNTING PLATE
# =============================================================================

def create_mounting_plate():
    """
    Create the wall mounting plate with screw holes.
    Positioned at Y=0 (against the wall) in the X-Z plane.
    """
    # Main plate body
    plate = (
        cq.Workplane("XZ")
        .rect(WIDTH, HEIGHT)
        .extrude(WALL_THICKNESS)
        .edges("|Y")
        .chamfer(CHAMFER_SIZE)
    )

    # Calculate screw hole positions (top, middle, bottom)
    hole_positions = [
        (0, HEIGHT/2 - 20),   # Top hole
        (0, 0),               # Middle hole
        (0, -HEIGHT/2 + 20),  # Bottom hole
    ]

    # Cut screw holes with countersink
    for x, z in hole_positions:
        plate = (
            plate
            .faces("<Y")
            .workplane()
            .moveTo(x, z)
            .hole(SCREW_HOLE_DIA, depth=WALL_THICKNESS * 2)
        )
        # Add countersink on back
        plate = (
            plate
            .faces("<Y")
            .workplane()
            .moveTo(x, z)
            .cskHole(SCREW_HOLE_DIA, SCREW_HEAD_DIA, 82)
        )

    # Add diamond reinforcement around top hole
    diamond_size = 15
    plate = (
        plate
        .faces(">Y")
        .workplane()
        .moveTo(0, HEIGHT/2 - 20)
        .polygon(4, diamond_size, circumscribed=True)
        .extrude(3)
    )

    return plate

# =============================================================================
# VINE PATH GENERATION
# =============================================================================

def generate_vine_path(vine_index, total_vines):
    """
    Generate a bezier curve path for a single vine.

    Vines originate from the mounting plate and curve toward the hook tip.
    Each vine has a unique path based on its index for natural variation.
    """
    # Distribute vine starting points across the plate
    angle_offset = (vine_index / total_vines) * 2 * math.pi

    # Starting point on mounting plate (with variation)
    start_x = seeded_random(-WIDTH/3, WIDTH/3)
    start_z = seeded_random(-HEIGHT/3, HEIGHT/3)
    start_y = WALL_THICKNESS
    start = (start_x, start_y, start_z)

    # End point at the hook
    end_x = seeded_random(-5, 5)
    end_y = DEPTH - HOOK_RADIUS
    end_z = -HEIGHT/2 + HOOK_RADIUS
    end = (end_x, end_y, end_z)

    # Control points create the organic curve
    # First control point - extend outward from plate
    ctrl1_x = start_x + seeded_random(-10, 10)
    ctrl1_y = start_y + DEPTH * 0.3
    ctrl1_z = start_z + seeded_random(-20, 20)
    ctrl1 = (ctrl1_x, ctrl1_y, ctrl1_z)

    # Second control point - guide toward hook
    ctrl2_x = end_x + seeded_random(-10, 10)
    ctrl2_y = end_y - DEPTH * 0.2
    ctrl2_z = end_z + seeded_random(10, 40)
    ctrl2 = (ctrl2_x, ctrl2_y, ctrl2_z)

    return (start, ctrl1, ctrl2, end)

def create_vine_segment(center, radius, tangent):
    """
    Create a short cylindrical segment of vine at given position.
    Oriented along the tangent direction.
    """
    # Calculate rotation to align cylinder with tangent
    # Default cylinder is along Z axis
    default_dir = (0, 0, 1)

    # Find rotation axis (cross product)
    axis = cross_product(default_dir, tangent)
    axis_mag = math.sqrt(axis[0]**2 + axis[1]**2 + axis[2]**2)

    if axis_mag < 0.001:
        # Tangent is parallel to Z, no rotation needed
        return (
            cq.Workplane("XY")
            .cylinder(radius * 2, radius)
            .translate(center)
        )

    axis = (axis[0]/axis_mag, axis[1]/axis_mag, axis[2]/axis_mag)

    # Find rotation angle
    dot = default_dir[0]*tangent[0] + default_dir[1]*tangent[1] + default_dir[2]*tangent[2]
    angle = math.acos(max(-1, min(1, dot)))

    segment = (
        cq.Workplane("XY")
        .cylinder(radius * 2, radius)
        .rotate((0, 0, 0), axis, math.degrees(angle))
        .translate(center)
    )

    return segment

def create_vine_tube(path, base_radius):
    """
    Create a tube along a bezier path using a series of connected spheres.
    This approach avoids complex sweep operations and ensures manifold geometry.
    """
    p0, p1, p2, p3 = path
    vine = None

    # Sample points along the bezier curve
    num_samples = SPLINE_SEGMENTS

    for i in range(num_samples + 1):
        t = i / num_samples

        # Get position on curve
        pos = bezier_point(p0, p1, p2, p3, t)

        # Vary radius slightly for organic look
        radius = base_radius + seeded_random(-VINE_RADIUS_VAR, VINE_RADIUS_VAR)
        radius = max(radius, 1.5)  # Minimum radius for printability

        # Create sphere at this point
        sphere = cq.Workplane("XY").sphere(radius).translate(pos)

        if vine is None:
            vine = sphere
        else:
            vine = vine.union(sphere)

    return vine

# =============================================================================
# LEAF GENERATION
# =============================================================================

def create_leaf(position, direction, size=12):
    """
    Create a single leaf at the given position, oriented along direction.
    Leaf is an elongated ellipsoid shape.
    """
    # Leaf dimensions
    length = size
    width = size * 0.5
    thickness = size * 0.15

    # Create basic leaf shape as a scaled sphere
    leaf = (
        cq.Workplane("XY")
        .ellipse(width/2, length/2)
        .extrude(thickness)
        .translate((0, 0, -thickness/2))
    )

    # Add a slight bend/curve by tapering
    # Simplified: just use the ellipsoid for now

    # Rotate to align with direction
    dir_normalized = normalize(direction)
    default_dir = (0, 1, 0)  # Leaf points in Y by default

    # Calculate rotation
    axis = cross_product(default_dir, dir_normalized)
    axis_mag = math.sqrt(axis[0]**2 + axis[1]**2 + axis[2]**2)

    if axis_mag > 0.001:
        axis = (axis[0]/axis_mag, axis[1]/axis_mag, axis[2]/axis_mag)
        dot = default_dir[0]*dir_normalized[0] + default_dir[1]*dir_normalized[1] + default_dir[2]*dir_normalized[2]
        angle = math.acos(max(-1, min(1, dot)))
        leaf = leaf.rotate((0, 0, 0), axis, math.degrees(angle))

    # Add random rotation around the direction axis for variety
    random_twist = seeded_random(0, 360)
    leaf = leaf.rotate((0, 0, 0), dir_normalized, random_twist)

    # Move to position
    leaf = leaf.translate(position)

    return leaf

def place_leaves_on_vine(path):
    """
    Place leaves along a vine path based on leaf_frequency.
    """
    p0, p1, p2, p3 = path
    leaves = None

    # Sample points for potential leaf placement
    num_checks = 12

    for i in range(1, num_checks):  # Skip start and end
        t = i / num_checks

        # Random chance to place a leaf
        if seeded_random() > LEAF_FREQUENCY:
            continue

        # Get position and tangent on curve
        pos = bezier_point(p0, p1, p2, p3, t)
        tangent = bezier_tangent(p0, p1, p2, p3, t)

        # Calculate perpendicular direction for leaf orientation
        # Leaf should point outward from vine
        up = (0, 0, 1)
        perp = cross_product(tangent, up)
        perp_mag = math.sqrt(perp[0]**2 + perp[1]**2 + perp[2]**2)
        if perp_mag < 0.001:
            perp = (1, 0, 0)
        else:
            perp = (perp[0]/perp_mag, perp[1]/perp_mag, perp[2]/perp_mag)

        # Random angle around vine
        leaf_angle = seeded_random(0, 2 * math.pi)

        # Calculate leaf direction (blend of tangent and perpendicular)
        leaf_dir = vec_add(
            vec_scale(tangent, 0.3),
            vec_scale(perp, 0.7)
        )
        leaf_dir = normalize(leaf_dir)

        # Offset position slightly from vine center
        leaf_pos = vec_add(pos, vec_scale(perp, VINE_RADIUS + 1))

        # Create and add leaf
        leaf_size = seeded_random(8, 15)
        leaf = create_leaf(leaf_pos, leaf_dir, leaf_size)

        if leaves is None:
            leaves = leaf
        else:
            leaves = leaves.union(leaf)

    return leaves

# =============================================================================
# HOOK GENERATION
# =============================================================================

def create_hook():
    """
    Create the curved hook at the terminal end of the bracket.
    The hook curls upward to prevent items from slipping off.
    Uses a series of spheres along a curved path for reliable geometry.
    """
    # Position of hook arc center
    hook_center_y = DEPTH - HOOK_RADIUS
    hook_center_z = -HEIGHT/2 + HOOK_RADIUS

    hook = None

    # Create hook as a series of spheres along an arc (270 degrees)
    # Arc goes from pointing toward wall (-Y), down (-Z), to pointing up (+Z)
    num_segments = 20
    start_angle = math.pi / 2   # Start pointing in -Y direction
    end_angle = -math.pi        # End pointing in +Z direction (270 degree arc)

    for i in range(num_segments + 1):
        t = i / num_segments
        angle = lerp(start_angle, end_angle, t)

        # Calculate position on arc (in YZ plane)
        y = hook_center_y + HOOK_RADIUS * math.cos(angle)
        z = hook_center_z + HOOK_RADIUS * math.sin(angle)

        # Slightly vary the thickness for organic look
        radius = HOOK_THICKNESS / 2 + seeded_random(-0.5, 0.5)
        radius = max(radius, 2.0)

        sphere = cq.Workplane("XY").sphere(radius).translate((0, y, z))

        if hook is None:
            hook = sphere
        else:
            hook = hook.union(sphere)

    return hook

# =============================================================================
# CROSS-VINE CONNECTIONS (LATTICE EFFECT)
# =============================================================================

def create_cross_connections(paths):
    """
    Create small connecting segments between vines for structural lattice.
    """
    connections = None

    if len(paths) < 2:
        return connections

    # Sample points on each path and connect nearby ones
    num_samples = 6

    for i, path1 in enumerate(paths):
        for j, path2 in enumerate(paths):
            if j <= i:
                continue

            # Check a few points along each path
            for t in [0.3, 0.5, 0.7]:
                p1 = bezier_point(*path1, t + seeded_random(-0.05, 0.05))
                p2 = bezier_point(*path2, t + seeded_random(-0.05, 0.05))

                # Calculate distance
                dist = math.sqrt((p2[0]-p1[0])**2 + (p2[1]-p1[1])**2 + (p2[2]-p1[2])**2)

                # Connect if close enough
                if dist < 25 and seeded_random() < 0.4:
                    # Create thin connecting vine
                    mid = lerp_vec(p1, p2, 0.5)
                    conn_radius = VINE_RADIUS * 0.6

                    # Series of spheres for the connection
                    for k in range(5):
                        t_conn = k / 4
                        pos = lerp_vec(p1, p2, t_conn)
                        sphere = cq.Workplane("XY").sphere(conn_radius).translate(pos)

                        if connections is None:
                            connections = sphere
                        else:
                            connections = connections.union(sphere)

    return connections

# =============================================================================
# MAIN ASSEMBLY
# =============================================================================

def build_vine_bracket():
    """
    Assemble the complete vine bracket.
    """
    print("=" * 60)
    print("PARAMETRIC ORGANIC VINE BRACKET")
    print("=" * 60)
    print(f"\nDimensions:")
    print(f"  Height (Z): {HEIGHT} mm")
    print(f"  Depth (Y):  {DEPTH} mm")
    print(f"  Width (X):  {WIDTH} mm")
    print(f"\nVine Parameters:")
    print(f"  Vine Density:    {VINE_DENSITY} paths")
    print(f"  Vine Radius:     {VINE_RADIUS} mm")
    print(f"  Leaf Frequency:  {LEAF_FREQUENCY}")
    print(f"  Random Seed:     {NOISE_SEED}")
    print(f"\nGenerating geometry...")

    # 1. Create mounting plate
    print("  Creating mounting plate...")
    plate = create_mounting_plate()

    # 2. Generate vine paths
    print(f"  Generating {VINE_DENSITY} vine paths...")
    paths = []
    for i in range(VINE_DENSITY):
        path = generate_vine_path(i, VINE_DENSITY)
        paths.append(path)

    # 3. Create vine tubes
    print("  Creating vine geometry...")
    vines = None
    for i, path in enumerate(paths):
        vine_radius = VINE_RADIUS + seeded_random(-0.5, 0.5)
        vine = create_vine_tube(path, vine_radius)

        if vines is None:
            vines = vine
        else:
            vines = vines.union(vine)

    # 4. Add leaves
    print("  Adding leaves...")
    all_leaves = None
    for path in paths:
        leaves = place_leaves_on_vine(path)
        if leaves is not None:
            if all_leaves is None:
                all_leaves = leaves
            else:
                all_leaves = all_leaves.union(leaves)

    # 5. Create cross-connections
    print("  Creating lattice connections...")
    connections = create_cross_connections(paths)

    # 6. Create hook
    print("  Creating hook...")
    hook = create_hook()

    # 7. Assemble all components
    print("  Assembling components...")
    result = plate

    if vines is not None:
        result = result.union(vines)

    if all_leaves is not None:
        result = result.union(all_leaves)

    if connections is not None:
        result = result.union(connections)

    result = result.union(hook)

    print("\nAssembly complete!")
    print(f"\n3D Printing Notes:")
    print(f"  - Print on side (X-Y plane) for vine strength")
    print(f"  - Use 4+ walls, 25% gyroid infill")
    print(f"  - Supports required for hook overhang")
    print(f"  - Recommended materials: PLA+, PETG, ASA")
    print("=" * 60)

    return result, plate, vines, all_leaves, hook

# =============================================================================
# BUILD MODEL
# =============================================================================

result, plate, vines, leaves, hook = build_vine_bracket()

# Create components dict for colored rendering
components = {
    'mounting_plate': (plate, PLATE_GREEN),
    'vines': (vines, VINE_GREEN) if vines is not None else None,
    'leaves': (leaves, LEAF_GREEN) if leaves is not None else None,
    'hook': (hook, VINE_GREEN),
}

# Filter out None components
components = {k: v for k, v in components.items() if v is not None}
