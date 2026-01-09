"""Soccer Ball Example

A classic black and white soccer ball based on a truncated icosahedron.
The soccer ball has 12 pentagonal panels (black) and 20 hexagonal panels (white).

This example demonstrates:
- Multi-component colored rendering
- Mathematical vertex calculations (golden ratio for icosahedron)
- Spherical polygon construction
- Complex geometry with multiple features
"""

import cadquery as cq
import math

# =============================================================================
# PARAMETERS
# =============================================================================
BALL_RADIUS = 50  # mm - standard soccer ball is ~110mm diameter
PANEL_DEPTH = 0.5  # mm - depth of the panel recesses
PANEL_SIZE = 12    # mm - approximate size of each panel

# Golden ratio - fundamental to icosahedron geometry
PHI = (1 + math.sqrt(5)) / 2

# Colors for the classic soccer ball
BLACK = (0, 0, 0)
WHITE = (255, 255, 255)

# =============================================================================
# GEOMETRY HELPERS
# =============================================================================

def normalize(v, radius):
    """Normalize a vector to lie on sphere surface."""
    mag = math.sqrt(v[0]**2 + v[1]**2 + v[2]**2)
    return (v[0]/mag * radius, v[1]/mag * radius, v[2]/mag * radius)

def add_vectors(v1, v2):
    """Add two 3D vectors."""
    return (v1[0] + v2[0], v1[1] + v2[1], v1[2] + v2[2])

def scale_vector(v, s):
    """Scale a vector by scalar s."""
    return (v[0] * s, v[1] * s, v[2] * s)

# =============================================================================
# ICOSAHEDRON GEOMETRY
# =============================================================================

# Icosahedron vertices using golden ratio coordinates
icosa_vertices_raw = [
    (0, 1, PHI), (0, -1, PHI), (0, 1, -PHI), (0, -1, -PHI),
    (1, PHI, 0), (-1, PHI, 0), (1, -PHI, 0), (-1, -PHI, 0),
    (PHI, 0, 1), (-PHI, 0, 1), (PHI, 0, -1), (-PHI, 0, -1)
]

# Normalize to sphere surface
icosa_vertices = [normalize(v, BALL_RADIUS) for v in icosa_vertices_raw]

# 20 triangular faces of the icosahedron (vertex index triplets)
# Each face center will become a hexagon center in the truncated icosahedron
icosa_faces = [
    (0, 1, 8), (0, 8, 4), (0, 4, 5), (0, 5, 9), (0, 9, 1),
    (1, 9, 7), (1, 7, 6), (1, 6, 8), (2, 3, 10), (2, 10, 4),
    (2, 4, 5), (2, 5, 11), (2, 11, 3), (3, 11, 7), (3, 7, 6),
    (3, 6, 10), (4, 10, 8), (5, 9, 11), (6, 8, 10), (7, 11, 9)
]

# =============================================================================
# BUILD THE SOCCER BALL
# =============================================================================

# Start with a white sphere (base ball)
base_sphere = cq.Workplane("XY").sphere(BALL_RADIUS)

# Create black pentagonal panels at the 12 icosahedron vertices
pentagon_panels = []
for vertex in icosa_vertices:
    # Create a small sphere at each vertex position
    # This creates a circular panel that approximates a pentagon visually
    panel = (
        cq.Workplane("XY")
        .sphere(PANEL_SIZE)
        .translate(vertex)
    )
    pentagon_panels.append(panel)

# Combine all pentagon panels into one object
black_pentagons = pentagon_panels[0]
for panel in pentagon_panels[1:]:
    black_pentagons = black_pentagons.union(panel)

# Create white hexagonal panels at the 20 face centers
hexagon_panels = []
for face in icosa_faces:
    # Calculate face center (average of three vertices)
    v1, v2, v3 = [icosa_vertices[i] for i in face]
    center_raw = (
        (v1[0] + v2[0] + v3[0]) / 3,
        (v1[1] + v2[1] + v3[1]) / 3,
        (v1[2] + v2[2] + v3[2]) / 3
    )
    center = normalize(center_raw, BALL_RADIUS)

    # Create a small sphere at each face center
    # This creates a circular panel that approximates a hexagon visually
    panel = (
        cq.Workplane("XY")
        .sphere(PANEL_SIZE * 0.9)  # Slightly smaller than pentagons
        .translate(center)
    )
    hexagon_panels.append(panel)

# Combine all hexagon panels into one object
white_hexagons = hexagon_panels[0]
for panel in hexagon_panels[1:]:
    white_hexagons = white_hexagons.union(panel)

# Create components dict for colored rendering
components = {
    'base_sphere': (base_sphere, WHITE),
    'black_pentagons': (black_pentagons, BLACK),
    'white_hexagons': (white_hexagons, WHITE)
}

# For backwards compatibility with direct STL export
result = base_sphere.union(black_pentagons).union(white_hexagons)
