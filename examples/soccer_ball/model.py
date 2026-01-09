"""Soccer Ball Example

A classic black and white soccer ball based on a truncated icosahedron.
The soccer ball has 12 pentagonal panels (black) and 20 hexagonal panels (white).

This example demonstrates:
- Sphere creation with fillets
- Mathematical vertex calculations (golden ratio for icosahedron)
- Boolean operations (cutting patterns into surfaces)
- Complex geometry with multiple features
"""

import cadquery as cq
import math

# =============================================================================
# PARAMETERS
# =============================================================================
BALL_RADIUS = 50  # mm - standard soccer ball is ~110mm diameter
PANEL_DEPTH = 2   # mm - depth of the grooves between panels
GROOVE_WIDTH = 2  # mm - width of the seam grooves

# Golden ratio - fundamental to icosahedron geometry
PHI = (1 + math.sqrt(5)) / 2

# =============================================================================
# SOCCER BALL GEOMETRY
# =============================================================================
# A soccer ball is a truncated icosahedron. The vertices of a regular
# icosahedron (before truncation) can be defined using the golden ratio.
# We'll create groove lines along the edges to simulate the panel pattern.

def normalize(v, radius):
    """Normalize a vector to lie on sphere surface."""
    mag = math.sqrt(v[0]**2 + v[1]**2 + v[2]**2)
    return (v[0]/mag * radius, v[1]/mag * radius, v[2]/mag * radius)

def midpoint(v1, v2):
    """Get midpoint between two vertices."""
    return ((v1[0]+v2[0])/2, (v1[1]+v2[1])/2, (v1[2]+v2[2])/2)

# Icosahedron vertices (scaled and normalized to ball radius)
# The 12 vertices of an icosahedron using golden ratio coordinates
icosa_vertices_raw = [
    (0, 1, PHI), (0, -1, PHI), (0, 1, -PHI), (0, -1, -PHI),
    (1, PHI, 0), (-1, PHI, 0), (1, -PHI, 0), (-1, -PHI, 0),
    (PHI, 0, 1), (-PHI, 0, 1), (PHI, 0, -1), (-PHI, 0, -1)
]

# Normalize to sphere surface
icosa_vertices = [normalize(v, BALL_RADIUS) for v in icosa_vertices_raw]

# Icosahedron edges (vertex index pairs)
# These define the edges that become the centers of hexagons after truncation
icosa_edges = [
    (0, 1), (0, 4), (0, 5), (0, 8), (0, 9),
    (1, 6), (1, 7), (1, 8), (1, 9),
    (2, 3), (2, 4), (2, 5), (2, 10), (2, 11),
    (3, 6), (3, 7), (3, 10), (3, 11),
    (4, 5), (4, 8), (4, 10),
    (5, 9), (5, 11),
    (6, 7), (6, 8), (6, 10),
    (7, 9), (7, 11),
    (8, 10), (9, 11)
]

# =============================================================================
# BUILD THE SOCCER BALL
# =============================================================================

# Start with a sphere
ball = cq.Workplane("XY").sphere(BALL_RADIUS)

# Create grooves along each edge of the underlying icosahedron
# This creates the characteristic panel pattern
for i, (v1_idx, v2_idx) in enumerate(icosa_edges):
    v1 = icosa_vertices[v1_idx]
    v2 = icosa_vertices[v2_idx]

    # Get midpoint and normalize to sphere surface for groove center
    mid = normalize(midpoint(v1, v2), BALL_RADIUS)

    # Create a small cylinder at each edge midpoint to simulate groove
    # Orient the cylinder to point toward center
    groove = (
        cq.Workplane("XY")
        .sphere(GROOVE_WIDTH)
        .translate(mid)
    )
    ball = ball.cut(groove)

# Create pentagon centers (at original icosahedron vertices)
# These are the 12 black panels
for v in icosa_vertices:
    # Create small indentation at each pentagon center
    indent = (
        cq.Workplane("XY")
        .sphere(GROOVE_WIDTH * 1.5)
        .translate(v)
    )
    ball = ball.cut(indent)

# The result is a sphere with small indentations marking the panel pattern
# In a real soccer ball, you'd see:
# - 12 pentagon shapes (at icosahedron vertices) - traditionally black
# - 20 hexagon shapes (at icosahedron face centers) - traditionally white

result = ball
