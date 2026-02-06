"""6-Inch Wall Vent Hood with Duct Stub and Redirected Discharge Chute

A parametric wall vent hood designed for exterior exhaust termination.
Features a face plate with gasket lip, round duct stub for interior
duct connection, a lofted hood projection, and a redirect chute that
routes discharge down and to the left.

Design specs:
- Face plate ~6.5" wide with gasket lip
- 8 screw holes: 4 corners at 6" OC + 4 midpoints
- Round duct stub OD ~5.7", wall thickness for ~5.1-5.4" ID
- Duct stub projects 2.4" toward interior (negative Z)
- Hood projects ~3.0" outward (positive Z)
- Redirect chute sweeps discharge down-left from hood mouth
"""

import cadquery as cq
import math

# ===== DESIGN PARAMETERS (inches) =====

# Face plate
PLATE_WIDTH = 6.5       # Overall face plate width
PLATE_HEIGHT = 6.5      # Overall face plate height
PLATE_THICKNESS = 0.20  # Sheet thickness of face plate

# Gasket lip (raised rim on back of plate for wall seal)
GASKET_LIP_WIDTH = 0.25   # Width of lip border
GASKET_LIP_DEPTH = 0.10   # How far lip protrudes behind plate

# Screw holes
SCREW_OC = 6.0            # On-center distance for corner screws
SCREW_HOLE_DIA = 0.190    # Clearance for #10 screw (~3/16")
SCREW_HEAD_CBORE = 0.0    # Set >0 for countersink (0 = through-hole only)

# Round duct stub (projects toward interior, negative Z)
DUCT_STUB_OD = 5.70       # Outer diameter of duct stub
DUCT_STUB_WALL = 0.25     # Wall thickness -> ID = OD - 2*wall
DUCT_STUB_LENGTH = 2.40   # Length of stub into wall

# Hood (projects outward, positive Z)
HOOD_LENGTH = 3.0          # How far hood projects from plate
HOOD_MOUTH_WIDTH = 6.0     # Width of hood opening at mouth
HOOD_MOUTH_HEIGHT = 4.0    # Height of hood opening at mouth
HOOD_WALL = 0.15           # Wall thickness of hood shell
HOOD_BASE_FILLET = 0.25    # Fillet where hood meets plate

# Redirect chute (extends from hood mouth, sweeps down-left)
CHUTE_ENABLED = True
CHUTE_WIDTH = HOOD_MOUTH_WIDTH   # Match hood mouth width
CHUTE_HEIGHT = HOOD_MOUTH_HEIGHT # Match hood mouth height
CHUTE_WALL = 0.15               # Chute wall thickness
CHUTE_EXTENSION = 2.5           # How far chute extends outward beyond hood
CHUTE_DROP = 4.0                # How far chute drops downward
CHUTE_LEFT_SHIFT = 3.0          # How far chute shifts to the left

# ===== DERIVED DIMENSIONS =====

DUCT_STUB_ID = DUCT_STUB_OD - 2 * DUCT_STUB_WALL
HALF_OC = SCREW_OC / 2.0

# ===== HELPER: inch coordinates =====
# CadQuery works in mm by default but we stay in inches throughout
# and the final model is in "inch units" — scale at export if needed.

# ===== BUILD THE MODEL =====

# ------------------------------------------------------------------
# 1. Face plate — rectangular slab
# ------------------------------------------------------------------
plate = (
    cq.Workplane("XY")
    .box(PLATE_WIDTH, PLATE_HEIGHT, PLATE_THICKNESS)
    # Center the plate so Z=0 is the wall-plane
    .translate((0, 0, -PLATE_THICKNESS / 2))
)

# ------------------------------------------------------------------
# 2. Gasket lip — raised rim on the back face of the plate
# ------------------------------------------------------------------
outer_lip = (
    cq.Workplane("XY")
    .box(PLATE_WIDTH, PLATE_HEIGHT, GASKET_LIP_DEPTH)
)
inner_cutout = (
    cq.Workplane("XY")
    .box(
        PLATE_WIDTH - 2 * GASKET_LIP_WIDTH,
        PLATE_HEIGHT - 2 * GASKET_LIP_WIDTH,
        GASKET_LIP_DEPTH + 0.1,  # oversized for clean subtraction
    )
)
gasket_lip = (
    outer_lip.cut(inner_cutout)
    .translate((0, 0, -(PLATE_THICKNESS + GASKET_LIP_DEPTH / 2)))
)
plate = plate.union(gasket_lip)

# ------------------------------------------------------------------
# 3. Central duct opening through the plate
# ------------------------------------------------------------------
duct_hole = (
    cq.Workplane("XY")
    .circle(DUCT_STUB_OD / 2)
    .extrude(PLATE_THICKNESS + GASKET_LIP_DEPTH + 1.0)  # generous cut
    .translate((0, 0, -(PLATE_THICKNESS + GASKET_LIP_DEPTH + 0.5)))
)
plate = plate.cut(duct_hole)

# ------------------------------------------------------------------
# 4. Screw holes — 4 corners + 4 midpoints (8 total)
# ------------------------------------------------------------------
corner_pts = [
    (-HALF_OC, -HALF_OC),
    ( HALF_OC, -HALF_OC),
    ( HALF_OC,  HALF_OC),
    (-HALF_OC,  HALF_OC),
]
mid_pts = [
    (0,         -HALF_OC),  # bottom center
    (0,          HALF_OC),  # top center
    (-HALF_OC,  0),         # left center
    ( HALF_OC,  0),         # right center
]
all_screw_pts = corner_pts + mid_pts

screw_holes = (
    cq.Workplane("XY")
    .pushPoints(all_screw_pts)
    .circle(SCREW_HOLE_DIA / 2)
    .extrude(PLATE_THICKNESS + GASKET_LIP_DEPTH + 1.0)
    .translate((0, 0, -(PLATE_THICKNESS + GASKET_LIP_DEPTH + 0.5)))
)
plate = plate.cut(screw_holes)

# ------------------------------------------------------------------
# 5. Duct stub — cylindrical tube on the interior side (negative Z)
# ------------------------------------------------------------------
duct_outer = (
    cq.Workplane("XY")
    .circle(DUCT_STUB_OD / 2)
    .extrude(DUCT_STUB_LENGTH)
    .translate((0, 0, -(PLATE_THICKNESS + DUCT_STUB_LENGTH)))
)
duct_inner = (
    cq.Workplane("XY")
    .circle(DUCT_STUB_ID / 2)
    .extrude(DUCT_STUB_LENGTH + 0.1)
    .translate((0, 0, -(PLATE_THICKNESS + DUCT_STUB_LENGTH + 0.05)))
)
duct_stub = duct_outer.cut(duct_inner)
plate = plate.union(duct_stub)

# ------------------------------------------------------------------
# 6. Hood — lofted rectangular frustum tube (positive Z)
#    Base matches the duct opening circle inscribed rectangle.
#    Mouth is HOOD_MOUTH_WIDTH x HOOD_MOUTH_HEIGHT.
# ------------------------------------------------------------------
# Strategy: build the outer shell as a loft, then subtract an inner
# loft to create the hollow wall.

# Base rectangle dimensions — fit inside the duct OD circle
HOOD_BASE_WIDTH = DUCT_STUB_OD * 0.90
HOOD_BASE_HEIGHT = DUCT_STUB_OD * 0.70

# Outer shell loft
hood_base_outer = (
    cq.Workplane("XY")
    .rect(HOOD_BASE_WIDTH, HOOD_BASE_HEIGHT)
)
hood_mouth_outer = (
    cq.Workplane("XY")
    .workplane(offset=HOOD_LENGTH)
    .rect(HOOD_MOUTH_WIDTH, HOOD_MOUTH_HEIGHT)
)
hood_outer = cq.Solid.makeLoft(
    [hood_base_outer.val(), hood_mouth_outer.val()]
)

# Inner shell loft (offset inward by wall thickness)
hood_base_inner = (
    cq.Workplane("XY")
    .rect(HOOD_BASE_WIDTH - 2 * HOOD_WALL, HOOD_BASE_HEIGHT - 2 * HOOD_WALL)
)
hood_mouth_inner = (
    cq.Workplane("XY")
    .workplane(offset=HOOD_LENGTH)
    .rect(HOOD_MOUTH_WIDTH - 2 * HOOD_WALL, HOOD_MOUTH_HEIGHT - 2 * HOOD_WALL)
)
hood_inner = cq.Solid.makeLoft(
    [hood_base_inner.val(), hood_mouth_inner.val()]
)

# Hollow hood shell
hood_shell = cq.Workplane("XY").newObject([hood_outer]).cut(
    cq.Workplane("XY").newObject([hood_inner])
)

plate = plate.union(hood_shell)

# ------------------------------------------------------------------
# 7. Redirect chute — swept rectangular tube from hood mouth
#    Path: from hood mouth, extends out + down + to the left
# ------------------------------------------------------------------
if CHUTE_ENABLED:
    # Define the chute as a series of box segments along a polyline.
    # We build it as a sequence of lofted sections for smooth transition.

    # Waypoints (X, Y, Z) from hood mouth:
    #   Start = center of hood mouth (0, 0, HOOD_LENGTH)
    #   Mid   = outward + slight drop + slight left
    #   End   = outward + full drop + full left shift
    p0 = (0, 0, HOOD_LENGTH)
    p1 = (
        -CHUTE_LEFT_SHIFT * 0.4,
        -CHUTE_DROP * 0.3,
        HOOD_LENGTH + CHUTE_EXTENSION * 0.5,
    )
    p2 = (
        -CHUTE_LEFT_SHIFT,
        -CHUTE_DROP,
        HOOD_LENGTH + CHUTE_EXTENSION,
    )

    def _make_chute_section(center, width, height, tangent):
        """Create a rectangular wire at a given center, oriented to face
        along the tangent direction."""
        # We use a simple approach: create a rect on XY and rotate/translate.
        # For a discharge chute the cross-section stays roughly upright,
        # so we just translate the rectangles to each waypoint.
        wp = (
            cq.Workplane("XY")
            .transformed(offset=cq.Vector(*center))
            .rect(width, height)
        )
        return wp.val()

    # Build three cross-section wires at the waypoints
    sec0 = _make_chute_section(
        p0, CHUTE_WIDTH, CHUTE_HEIGHT, (0, 0, 1)
    )
    sec1 = _make_chute_section(
        p1, CHUTE_WIDTH * 0.9, CHUTE_HEIGHT * 0.85, (0, -1, 1)
    )
    sec2 = _make_chute_section(
        p2, CHUTE_WIDTH * 0.75, CHUTE_HEIGHT * 0.7, (0, -1, 0.3)
    )

    # Outer loft
    chute_outer = cq.Solid.makeLoft([sec0, sec1, sec2])

    # Inner loft (reduced by wall thickness)
    isec0 = _make_chute_section(
        p0, CHUTE_WIDTH - 2 * CHUTE_WALL, CHUTE_HEIGHT - 2 * CHUTE_WALL,
        (0, 0, 1),
    )
    isec1 = _make_chute_section(
        p1,
        CHUTE_WIDTH * 0.9 - 2 * CHUTE_WALL,
        CHUTE_HEIGHT * 0.85 - 2 * CHUTE_WALL,
        (0, -1, 1),
    )
    isec2 = _make_chute_section(
        p2,
        CHUTE_WIDTH * 0.75 - 2 * CHUTE_WALL,
        CHUTE_HEIGHT * 0.7 - 2 * CHUTE_WALL,
        (0, -1, 0.3),
    )

    chute_inner = cq.Solid.makeLoft([isec0, isec1, isec2])

    chute_shell = cq.Workplane("XY").newObject([chute_outer]).cut(
        cq.Workplane("XY").newObject([chute_inner])
    )

    plate = plate.union(chute_shell)

# ------------------------------------------------------------------
# Final result
# ------------------------------------------------------------------
result = plate
