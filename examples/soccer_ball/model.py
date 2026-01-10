"""Soccer Ball Example

A classic black and white soccer ball with the iconic pentagon pattern.
The 12 black pentagons are positioned at the vertices of an icosahedron,
creating the recognizable soccer ball appearance.

This example demonstrates:
- Multi-component colored rendering
- Mathematical vertex calculations (golden ratio for icosahedron)
- 3D orientation of flat shapes on a sphere surface
- Creating regular polygons with proper orientation
"""

import cadquery as cq
import math

# =============================================================================
# PARAMETERS
# =============================================================================
BALL_RADIUS = 50  # mm - standard soccer ball is ~110mm diameter
PENTAGON_RADIUS = 18  # mm - size of each pentagon (corner to center)
PENTAGON_THICKNESS = 1  # mm - thickness of the pentagon disc

# Golden ratio - fundamental to icosahedron geometry
PHI = (1 + math.sqrt(5)) / 2

# Colors for the classic soccer ball
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)

# =============================================================================
# GEOMETRY HELPERS
# =============================================================================

def normalize(v, radius=1.0):
    """Normalize a vector to specified length."""
    mag = math.sqrt(v[0]**2 + v[1]**2 + v[2]**2)
    if mag == 0:
        return (0, 0, radius)
    return (v[0]/mag * radius, v[1]/mag * radius, v[2]/mag * radius)

def cross_product(a, b):
    """Calculate cross product of two 3D vectors."""
    return (
        a[1]*b[2] - a[2]*b[1],
        a[2]*b[0] - a[0]*b[2],
        a[0]*b[1] - a[1]*b[0]
    )

def create_pentagon_at_position(center, radius, thickness):
    """
    Create a pentagon disc at the given position on the sphere,
    oriented to be tangent to the sphere (facing outward).
    """
    # The normal vector points from origin to center (radially outward)
    normal = normalize(center)

    # Find a perpendicular vector for orientation
    # Use cross product with a reference vector
    if abs(normal[2]) < 0.9:
        ref = (0, 0, 1)
    else:
        ref = (1, 0, 0)

    # Create local coordinate system
    tangent1 = normalize(cross_product(normal, ref))
    tangent2 = cross_product(normal, tangent1)

    # Create pentagon vertices in local 2D, then transform to 3D
    pentagon_points = []
    for i in range(5):
        # Pentagon vertices - rotate by 90 degrees so one point faces up
        angle = 2 * math.pi * i / 5 - math.pi / 2
        local_x = radius * math.cos(angle)
        local_y = radius * math.sin(angle)

        # Transform to 3D position
        point = (
            center[0] + local_x * tangent1[0] + local_y * tangent2[0],
            center[1] + local_x * tangent1[1] + local_y * tangent2[1],
            center[2] + local_x * tangent1[2] + local_y * tangent2[2]
        )
        pentagon_points.append(point)

    # Create the pentagon as a face, then extrude inward toward sphere center
    # First, create a workplane at the center, oriented along the normal

    # Calculate rotation angles to align Z-axis with our normal
    # Using the direction to calculate the workplane orientation

    # Create pentagon using polyline in a transformed workplane
    try:
        # Create a workplane at the center point
        wp = cq.Workplane("XY")

        # Create the pentagon profile
        # We'll create it centered at origin then move it
        pts_2d = []
        for i in range(5):
            angle = 2 * math.pi * i / 5 - math.pi / 2
            pts_2d.append((radius * math.cos(angle), radius * math.sin(angle)))

        # Close the polygon
        pentagon = (
            wp.polyline(pts_2d + [pts_2d[0]])
            .close()
            .extrude(thickness)
        )

        # Now we need to rotate and translate this pentagon to the correct position
        # Calculate rotation to align Z-axis with normal vector

        # Spherical coordinates of the normal
        nx, ny, nz = normal

        # Rotation about Z-axis (azimuth)
        azimuth = math.atan2(ny, nx)

        # Rotation about Y-axis (elevation from XY plane)
        elevation = math.asin(nz)

        # Apply rotations: first around Y to get elevation, then around Z for azimuth
        pentagon = (
            pentagon
            .rotate((0, 0, 0), (0, 1, 0), math.degrees(math.pi/2 - elevation))
            .rotate((0, 0, 0), (0, 0, 1), math.degrees(azimuth))
            .translate(center)
        )

        return pentagon

    except Exception:
        # Fallback: return a small sphere if pentagon creation fails
        return cq.Workplane("XY").sphere(radius * 0.5).translate(center)

# =============================================================================
# ICOSAHEDRON GEOMETRY
# =============================================================================

# Icosahedron vertices using golden ratio coordinates
# These 12 vertices are where the black pentagons will be placed
icosa_vertices_raw = [
    (0, 1, PHI), (0, -1, PHI), (0, 1, -PHI), (0, -1, -PHI),
    (1, PHI, 0), (-1, PHI, 0), (1, -PHI, 0), (-1, -PHI, 0),
    (PHI, 0, 1), (-PHI, 0, 1), (PHI, 0, -1), (-PHI, 0, -1)
]

# Normalize vertices to sit on sphere surface (slightly inside for the pentagon base)
PENTAGON_INSET = 2  # How far the pentagon base sits inside the sphere
pentagon_positions = [normalize(v, BALL_RADIUS - PENTAGON_INSET) for v in icosa_vertices_raw]

# =============================================================================
# BUILD THE SOCCER BALL
# =============================================================================

# Start with a white sphere (the ball)
base_sphere = cq.Workplane("XY").sphere(BALL_RADIUS)

# Create the 12 black pentagonal panels
pentagon_panels = []
for pos in pentagon_positions:
    panel = create_pentagon_at_position(pos, PENTAGON_RADIUS, PENTAGON_THICKNESS * 2)
    pentagon_panels.append(panel)

# Combine all pentagon panels into one object
black_pentagons = pentagon_panels[0]
for panel in pentagon_panels[1:]:
    black_pentagons = black_pentagons.union(panel)

# Create components dict for colored rendering
components = {
    'ball': (base_sphere, WHITE),
    'pentagons': (black_pentagons, BLACK),
}

# For backwards compatibility with direct STL export
result = base_sphere.union(black_pentagons)
