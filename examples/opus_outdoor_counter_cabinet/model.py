"""Opus's Outdoor Counter Cabinet — Construction-Ready CAD Model

A fence-mounted outdoor counter/cabinet with concrete countertop.
Perfect for outdoor kitchens, BBQ stations, or potting benches.

Design specifications:
- 12' (144") length along fence line
- 18" depth (front to back)
- 36" finished counter height
- Back ledger bolted to 6×6 fence posts
- Front beam (double 2×8) supported by five framed walls
- Deck-style base frame of pressure treated 2×6 boards for level platform
- 2×6 joists at 12" on center spanning front to back
- 3/4" plywood deck for concrete form base
- 5 support walls: 2 outer (at cabinet ends) + 3 internal (at bay divisions)
- 4 equal bays (36" each) with double doors per bay
- Cabinet doors aligned to support walls for solid hinge anchor points
- Router-recessed pull handles on each door

Based on the "ladder frame" concept:
- Back ledger = one long rail
- Front beam = other long rail
- Joists = rungs every 12"
- Support walls at bay boundaries for structural integrity and door mounting
"""

import cadquery as cq
import math

# ===== DESIGN PARAMETERS =====

# Overall dimensions
COUNTER_LENGTH = 144  # 12 feet in inches
COUNTER_DEPTH = 18    # 18" front to back
COUNTER_HEIGHT = 36   # 36" finished counter height

# Rear ledger (bolted to 6×6 fence posts)
LEDGER_WIDTH = 7.25   # 2×8 actual width (on edge)
LEDGER_THICKNESS = 1.5  # 2×8 actual thickness

# Front beam (double 2×8)
FRONT_BEAM_WIDTH = 7.25   # 2×8 actual width (on edge)
FRONT_BEAM_THICKNESS = 3.0  # Double 2×8 = 2 × 1.5"

# Midsection wall supports (replacing individual posts)
WALL_STUD_SIZE = 3.5  # 2×4 actual dimension
WALL_STUD_THICKNESS = 1.5  # 2×4 actual thickness
WALL_SHEATHING_THICKNESS = 0.5  # 1/2" plywood sheathing
WALL_STUD_SPACING = 16  # 16" on center for studs

# Deck-style base frame (pressure treated platform)
BASE_BOARD_WIDTH = 5.5  # 2×6 actual width
BASE_BOARD_THICKNESS = 1.5  # 2×6 actual thickness
BASE_BOARD_SPACING = 16  # 16" on center

# Joists (2×6 on edge, spanning front to back)
JOIST_WIDTH = 1.5     # 2×6 actual thickness
JOIST_HEIGHT = 5.5    # 2×6 actual width (on edge for strength)
JOIST_SPACING = 12    # 12" on center

# Plywood deck (form base for concrete pour)
DECK_THICKNESS = 0.75  # 3/4" exterior plywood

# Shear panels (end caps for anti-racking)
PANEL_THICKNESS = 0.5  # 1/2" exterior plywood

# 6×6 fence posts (for reference - not modeled, just the ledger attachment)
FENCE_POST_SIZE = 5.5  # 6×6 actual dimension

# Cabinet bay configuration
NUM_BAYS = 4  # 4 bays of 36" each
NUM_INTERNAL_WALLS = 3  # Three internal support walls (between bays)

# Wall positions (placed at bay boundaries to align with doors)
# Walls divide the 144" length into 4 equal bays of 36" each
BAY_WIDTH = COUNTER_LENGTH / NUM_BAYS  # 36" per bay
WALL_POSITIONS = [
    BAY_WIDTH,      # Wall 1 at 36" from left (between bay 1 and 2)
    2 * BAY_WIDTH,  # Wall 2 at 72" from left (between bay 2 and 3)
    3 * BAY_WIDTH,  # Wall 3 at 108" from left (between bay 3 and 4)
]

# Air gap from fence
FENCE_GAP = 3  # 3" gap from fence boards

# Door specifications (double doors per bay)
DOOR_THICKNESS = 0.75  # 3/4" plywood or HDPE
DOOR_GAP = 0.25  # 1/4" gap between doors and frame
DOOR_CLEARANCE = 1.0  # 1" clearance from bay edges
DOOR_INSET = 0.5  # 1/2" inset from front face

# Router-recessed pull handles
HANDLE_HEIGHT = 6.0  # 6" tall
HANDLE_WIDTH = 2.0   # 2" wide
HANDLE_DEPTH = 0.5   # 1/2" deep router recess
HANDLE_TOP_MARGIN = 3.0  # 3" from top of door

print(f"\n{'='*60}")
print(f"OPUS'S OUTDOOR COUNTER CABINET — 12' × 18\"")
print(f"{'='*60}")
print(f"\nDimensions: {COUNTER_LENGTH}\" × {COUNTER_DEPTH}\" ({COUNTER_LENGTH/12:.1f}' × {COUNTER_DEPTH/12:.1f}')")
print(f"Finished counter height: {COUNTER_HEIGHT}\"")
print(f"Bay configuration: {NUM_BAYS} bays @ {BAY_WIDTH:.1f}\" each")
print(f"Support walls: {NUM_INTERNAL_WALLS} internal + 2 outer (framed ends)")

# ===== CALCULATE COMPONENT HEIGHTS =====

# Work backwards from finished counter height
# Top of plywood deck = counter height (forms get built on top)
deck_top = COUNTER_HEIGHT
deck_bottom = deck_top - DECK_THICKNESS

# Joists sit below deck
joist_top = deck_bottom
joist_bottom = joist_top - JOIST_HEIGHT

# Ledger and front beam at joist level (joists hang from or rest on these)
# Using joist hangers, so beam/ledger top aligns with joist top
ledger_top = joist_top
ledger_bottom = ledger_top - LEDGER_WIDTH  # 2×8 on edge

front_beam_top = joist_top
front_beam_bottom = front_beam_top - FRONT_BEAM_WIDTH

# Midsection walls go from base to bottom of front beam
wall_height = front_beam_bottom

# Deck base sits on ground
base_height = BASE_BOARD_THICKNESS

print(f"\nSTRUCTURE (bottom to top):")
print(f"  Deck base platform: 0\" - {base_height:.2f}\"")
print(f"  Midsection walls: {base_height:.2f}\" - {wall_height:.2f}\"")
print(f"  Ledger: {ledger_bottom:.2f}\" - {ledger_top:.2f}\"")
print(f"  Front beam: {front_beam_bottom:.2f}\" - {front_beam_top:.2f}\"")
print(f"  Joists: {joist_bottom:.2f}\" - {joist_top:.2f}\"")
print(f"  Plywood deck: {deck_bottom:.2f}\" - {deck_top:.2f}\"")

# ===== BUILD THE 3D MODEL =====

# Coordinate system:
# X = along counter length (left to right)
# Y = depth (back at fence = negative, front = positive)
# Z = height (ground = 0, up = positive)

# Center the model on X axis, fence at back (Y=0 is back edge)

# 1. REAR LEDGER (2×8 on edge, bolted to fence posts)
# Positioned at back, full length
ledger = (
    cq.Workplane("XY")
    .box(COUNTER_LENGTH, LEDGER_THICKNESS, LEDGER_WIDTH)
    .translate((0, -COUNTER_DEPTH/2 + LEDGER_THICKNESS/2, ledger_bottom + LEDGER_WIDTH/2))
)

# 2. FRONT BEAM (double 2×8 on edge)
# Positioned at front, full length
front_beam = (
    cq.Workplane("XY")
    .box(COUNTER_LENGTH, FRONT_BEAM_THICKNESS, FRONT_BEAM_WIDTH)
    .translate((0, COUNTER_DEPTH/2 - FRONT_BEAM_THICKNESS/2, front_beam_bottom + FRONT_BEAM_WIDTH/2))
)

# 3. DECK-STYLE BASE FRAME (pressure treated 2×6 platform)
# Create a grid of boards running both directions for stability

# Longitudinal boards (running along X axis, parallel to counter length)
base_longitudinal = cq.Workplane("XY")
num_longitudinal = int(COUNTER_DEPTH / BASE_BOARD_SPACING) + 1

for i in range(num_longitudinal):
    board_y = -COUNTER_DEPTH/2 + i * BASE_BOARD_SPACING
    if board_y > COUNTER_DEPTH/2:
        break

    board = (
        cq.Workplane("XY")
        .box(COUNTER_LENGTH, BASE_BOARD_WIDTH, BASE_BOARD_THICKNESS)
        .translate((0, board_y, BASE_BOARD_THICKNESS/2))
    )

    if i == 0:
        base_longitudinal = board
    else:
        base_longitudinal = base_longitudinal.union(board)

# Cross boards (running along Y axis, perpendicular to length)
base_cross = cq.Workplane("XY")
num_cross = int(COUNTER_LENGTH / BASE_BOARD_SPACING) + 1

for i in range(num_cross):
    board_x = -COUNTER_LENGTH/2 + i * BASE_BOARD_SPACING
    if board_x > COUNTER_LENGTH/2:
        break

    board = (
        cq.Workplane("XY")
        .box(BASE_BOARD_WIDTH, COUNTER_DEPTH, BASE_BOARD_THICKNESS)
        .translate((board_x, 0, BASE_BOARD_THICKNESS/2))
    )

    if i == 0:
        base_cross = board
    else:
        base_cross = base_cross.union(board)

base_frame = base_longitudinal.union(base_cross)

# 4. MIDSECTION WALL SUPPORTS (replacing individual posts)
# Two framed walls at 1/3 and 2/3 positions

def create_wall(x_position):
    """Create a framed wall with 2×4 studs and plywood sheathing"""
    wall_parts = cq.Workplane("XY")

    # Wall framing: top plate, bottom plate, and vertical studs
    # Bottom plate (2×4 flat on base)
    bottom_plate = (
        cq.Workplane("XY")
        .box(WALL_STUD_THICKNESS, COUNTER_DEPTH, WALL_STUD_SIZE)
        .translate((x_position, 0, base_height + WALL_STUD_SIZE/2))
    )

    # Top plate (2×4 flat under front beam)
    top_plate = (
        cq.Workplane("XY")
        .box(WALL_STUD_THICKNESS, COUNTER_DEPTH, WALL_STUD_SIZE)
        .translate((x_position, 0, wall_height - WALL_STUD_SIZE/2))
    )

    # Vertical studs at 16" on center
    studs = cq.Workplane("XY")
    num_studs = int(COUNTER_DEPTH / WALL_STUD_SPACING) + 1

    for i in range(num_studs):
        stud_y = -COUNTER_DEPTH/2 + i * WALL_STUD_SPACING
        if stud_y > COUNTER_DEPTH/2:
            break

        stud_height = wall_height - base_height - 2 * WALL_STUD_SIZE  # Between plates
        stud = (
            cq.Workplane("XY")
            .box(WALL_STUD_SIZE, WALL_STUD_THICKNESS, stud_height)
            .translate((x_position, stud_y, base_height + WALL_STUD_SIZE + stud_height/2))
        )

        if i == 0:
            studs = stud
        else:
            studs = studs.union(stud)

    # Plywood sheathing on front face
    sheathing_height = wall_height - base_height
    sheathing = (
        cq.Workplane("XY")
        .box(WALL_SHEATHING_THICKNESS, COUNTER_DEPTH, sheathing_height)
        .translate((x_position + WALL_STUD_THICKNESS/2 + WALL_SHEATHING_THICKNESS/2,
                   0, base_height + sheathing_height/2))
    )

    return bottom_plate.union(top_plate).union(studs).union(sheathing)

# Create the three internal walls at bay boundaries
internal_walls = None
for wall_pos in WALL_POSITIONS:
    wall_x = -COUNTER_LENGTH/2 + wall_pos
    wall = create_wall(wall_x)
    if internal_walls is None:
        internal_walls = wall
    else:
        internal_walls = internal_walls.union(wall)

# 5. JOISTS (2×6 on edge, spanning front to back at 12" OC)
# Run perpendicular to ledger/beam (Y direction)
joists = cq.Workplane("XY")
num_joists = int(COUNTER_LENGTH / JOIST_SPACING) + 1

# Joist length: from back of ledger to front of front beam
joist_length = COUNTER_DEPTH - LEDGER_THICKNESS - FRONT_BEAM_THICKNESS

for i in range(num_joists):
    joist_x = -COUNTER_LENGTH/2 + i * JOIST_SPACING

    # Don't exceed counter length
    if joist_x > COUNTER_LENGTH/2:
        break

    joist = (
        cq.Workplane("XY")
        .box(JOIST_WIDTH, joist_length, JOIST_HEIGHT)
        .translate((joist_x, 0, joist_bottom + JOIST_HEIGHT/2))
    )

    if i == 0:
        joists = joist
    else:
        joists = joists.union(joist)

# 6. PLYWOOD DECK (3/4" exterior plywood)
# Full coverage on top of joists for form base
deck = (
    cq.Workplane("XY")
    .box(COUNTER_LENGTH, COUNTER_DEPTH, DECK_THICKNESS)
    .translate((0, 0, deck_bottom + DECK_THICKNESS/2))
)

# 7. STRUCTURAL OUTER WALLS (framed walls at ends for door anchoring)
# These provide proper hinge points for the outermost doors
panel_height = COUNTER_HEIGHT - DECK_THICKNESS  # From ground to bottom of deck

def create_outer_wall(x_position, is_left_wall=True):
    """Create a framed outer wall with 2×4 studs and plywood sheathing.

    Outer walls are similar to internal walls but positioned at cabinet ends
    and provide anchor points for door hinges.
    """
    wall_parts = cq.Workplane("XY")

    # Wall framing: top plate, bottom plate, and vertical studs
    # Bottom plate (2×4 flat on base)
    bottom_plate = (
        cq.Workplane("XY")
        .box(WALL_STUD_THICKNESS, COUNTER_DEPTH, WALL_STUD_SIZE)
        .translate((x_position, 0, base_height + WALL_STUD_SIZE/2))
    )

    # Top plate (2×4 flat under front beam)
    top_plate = (
        cq.Workplane("XY")
        .box(WALL_STUD_THICKNESS, COUNTER_DEPTH, WALL_STUD_SIZE)
        .translate((x_position, 0, wall_height - WALL_STUD_SIZE/2))
    )

    # Vertical studs at 16" on center
    studs = cq.Workplane("XY")
    num_studs = int(COUNTER_DEPTH / WALL_STUD_SPACING) + 1

    for i in range(num_studs):
        stud_y = -COUNTER_DEPTH/2 + i * WALL_STUD_SPACING
        if stud_y > COUNTER_DEPTH/2:
            break

        stud_height = wall_height - base_height - 2 * WALL_STUD_SIZE  # Between plates
        stud = (
            cq.Workplane("XY")
            .box(WALL_STUD_SIZE, WALL_STUD_THICKNESS, stud_height)
            .translate((x_position, stud_y, base_height + WALL_STUD_SIZE + stud_height/2))
        )

        if i == 0:
            studs = stud
        else:
            studs = studs.union(stud)

    # Plywood sheathing on outer face (facing outward from cabinet)
    sheathing_height = wall_height - base_height
    # Left wall: sheathing on left (negative X) side; Right wall: sheathing on right (positive X) side
    sheathing_offset = -WALL_STUD_THICKNESS/2 - WALL_SHEATHING_THICKNESS/2 if is_left_wall else WALL_STUD_THICKNESS/2 + WALL_SHEATHING_THICKNESS/2
    sheathing = (
        cq.Workplane("XY")
        .box(WALL_SHEATHING_THICKNESS, COUNTER_DEPTH, sheathing_height)
        .translate((x_position + sheathing_offset, 0, base_height + sheathing_height/2))
    )

    return bottom_plate.union(top_plate).union(studs).union(sheathing)

# Left outer wall (at left end of cabinet)
left_outer_wall = create_outer_wall(-COUNTER_LENGTH/2 + WALL_STUD_THICKNESS/2, is_left_wall=True)

# Right outer wall (at right end of cabinet)
right_outer_wall = create_outer_wall(COUNTER_LENGTH/2 - WALL_STUD_THICKNESS/2, is_left_wall=False)

outer_walls = left_outer_wall.union(right_outer_wall)

# 8. CABINET DOORS (double doors per bay with router-recessed pulls)
# Each bay gets two doors side-by-side, anchored to the support walls
# Doors hinge on the walls at bay boundaries, providing solid anchor points

def create_double_doors(bay_index, left_wall_x, right_wall_x):
    """Create double doors for a bay with router-recessed pull handles.

    Args:
        bay_index: Index of the bay (0-3)
        left_wall_x: X position of the left wall (hinge side for left door)
        right_wall_x: X position of the right wall (hinge side for right door)

    The doors are sized to fit between the walls with appropriate clearances.
    """
    # Calculate usable opening width (between wall faces)
    # Internal walls have sheathing on the front (+X) face
    # Left outer wall has sheathing on left (-X) face, right outer wall on right (+X) face
    opening_width = right_wall_x - left_wall_x

    # Account for wall stud thickness at bay edges
    # For internal walls, studs project into both adjacent bays
    # For outer walls, studs are at the cabinet edge
    effective_opening = opening_width - WALL_STUD_THICKNESS  # Subtract for stud overlap

    # Door dimensions
    door_height = panel_height - 2 * DOOR_CLEARANCE  # Height with top/bottom clearance
    single_door_width = (effective_opening - 2 * DOOR_CLEARANCE - DOOR_GAP) / 2  # Width for each door

    # Bay center for door positioning
    bay_x_center = (left_wall_x + right_wall_x) / 2

    # Y position: doors are inset from front face
    door_y = COUNTER_DEPTH/2 - DOOR_INSET - DOOR_THICKNESS/2

    # Z position: doors start from bottom with clearance
    door_z = DOOR_CLEARANCE + door_height/2

    # Left door X position (hinges on left wall)
    left_door_x = bay_x_center - DOOR_GAP/2 - single_door_width/2

    # Right door X position (hinges on right wall)
    right_door_x = bay_x_center + DOOR_GAP/2 + single_door_width/2

    # Create left door
    left_door = (
        cq.Workplane("XY")
        .box(single_door_width, DOOR_THICKNESS, door_height)
        .translate((left_door_x, door_y, door_z))
    )

    # Add router-recessed pull handle to left door (right side of door, near center gap)
    handle_x = left_door_x + single_door_width/2 - HANDLE_WIDTH/2 - 1.0  # 1" from right edge
    handle_y = door_y + DOOR_THICKNESS/2 - HANDLE_DEPTH/2
    handle_z = door_z + door_height/2 - HANDLE_TOP_MARGIN - HANDLE_HEIGHT/2

    handle = (
        cq.Workplane("XY")
        .box(HANDLE_WIDTH, HANDLE_DEPTH, HANDLE_HEIGHT)
        .translate((handle_x, handle_y, handle_z))
    )
    left_door = left_door.cut(handle)

    # Create right door
    right_door = (
        cq.Workplane("XY")
        .box(single_door_width, DOOR_THICKNESS, door_height)
        .translate((right_door_x, door_y, door_z))
    )

    # Add router-recessed pull handle to right door (left side of door, near center gap)
    handle_x = right_door_x - single_door_width/2 + HANDLE_WIDTH/2 + 1.0  # 1" from left edge
    handle_y = door_y + DOOR_THICKNESS/2 - HANDLE_DEPTH/2
    handle_z = door_z + door_height/2 - HANDLE_TOP_MARGIN - HANDLE_HEIGHT/2

    handle = (
        cq.Workplane("XY")
        .box(HANDLE_WIDTH, HANDLE_DEPTH, HANDLE_HEIGHT)
        .translate((handle_x, handle_y, handle_z))
    )
    right_door = right_door.cut(handle)

    return left_door.union(right_door)

# Create doors for all 4 bays, anchored to support walls
# Wall X positions (center of wall studs):
# - Left outer wall: -COUNTER_LENGTH/2 + WALL_STUD_THICKNESS/2
# - Internal wall 1: -COUNTER_LENGTH/2 + BAY_WIDTH (at 36")
# - Internal wall 2: -COUNTER_LENGTH/2 + 2*BAY_WIDTH (at 72")
# - Internal wall 3: -COUNTER_LENGTH/2 + 3*BAY_WIDTH (at 108")
# - Right outer wall: COUNTER_LENGTH/2 - WALL_STUD_THICKNESS/2

left_outer_x = -COUNTER_LENGTH/2 + WALL_STUD_THICKNESS/2
right_outer_x = COUNTER_LENGTH/2 - WALL_STUD_THICKNESS/2
wall_1_x = -COUNTER_LENGTH/2 + BAY_WIDTH
wall_2_x = -COUNTER_LENGTH/2 + 2 * BAY_WIDTH
wall_3_x = -COUNTER_LENGTH/2 + 3 * BAY_WIDTH

# Bay 1 (leftmost): between left outer wall and wall 1
doors_bay_1 = create_double_doors(0, left_outer_x, wall_1_x)

# Bay 2: between wall 1 and wall 2
doors_bay_2 = create_double_doors(1, wall_1_x, wall_2_x)

# Bay 3: between wall 2 and wall 3
doors_bay_3 = create_double_doors(2, wall_2_x, wall_3_x)

# Bay 4 (rightmost): between wall 3 and right outer wall
doors_bay_4 = create_double_doors(3, wall_3_x, right_outer_x)

# Combine all doors
all_doors = doors_bay_1.union(doors_bay_2).union(doors_bay_3).union(doors_bay_4)

# 9. COMBINE ALL COMPONENTS
# Combine internal walls and outer walls
all_walls = internal_walls.union(outer_walls)

result = (
    base_frame
    .union(all_walls)
    .union(ledger)
    .union(front_beam)
    .union(joists)
    .union(deck)
    .union(all_doors)
)

# ===== MATERIALS CUT LIST =====

print(f"\n{'='*60}")
print(f"MATERIALS CUT LIST")
print(f"{'='*60}")

# Ledger
print(f"\nREAR LEDGER (bolted to 6×6 fence posts):")
print(f"  2×8 Pressure-treated: 1 @ {COUNTER_LENGTH/12:.0f}' ({COUNTER_LENGTH}\")")

# Front beam
print(f"\nFRONT BEAM (double 2×8):")
print(f"  2×8 Pressure-treated: 2 @ {COUNTER_LENGTH/12:.0f}' ({COUNTER_LENGTH}\" each)")

# Deck-style base frame
print(f"\nDECK-STYLE BASE FRAME (level platform):")
longitudinal_length = COUNTER_LENGTH
cross_length = COUNTER_DEPTH
total_linear_feet = (num_longitudinal * longitudinal_length + num_cross * cross_length) / 12
print(f"  2×6 Pressure-treated: ~{math.ceil(total_linear_feet)}' total")
print(f"    - {num_longitudinal} longitudinal @ {longitudinal_length/12:.0f}' each")
print(f"    - {num_cross} cross boards @ {math.ceil(cross_length/12)}' each")
print(f"  (Spacing: {BASE_BOARD_SPACING}\" on center)")

# Support walls (internal + outer)
NUM_TOTAL_WALLS = NUM_INTERNAL_WALLS + 2  # 3 internal + 2 outer walls
print(f"\nSUPPORT WALLS ({NUM_INTERNAL_WALLS} internal + 2 outer = {NUM_TOTAL_WALLS} total):")
studs_per_wall = int(COUNTER_DEPTH / WALL_STUD_SPACING) + 1
wall_stud_length = wall_height - base_height - 2 * WALL_STUD_SIZE
total_studs = studs_per_wall * NUM_TOTAL_WALLS
print(f"  2×4 Pressure-treated (wall studs):")
print(f"    - {total_studs} studs @ {math.ceil(wall_stud_length/12)}' each")
print(f"    - {NUM_TOTAL_WALLS * 2} plates (top/bottom) @ {math.ceil(COUNTER_DEPTH/12)}' each")
print(f"  1/2\" Plywood sheathing:")
wall_sheathing_area = NUM_TOTAL_WALLS * COUNTER_DEPTH * (wall_height - base_height)
wall_sheathing_sheets = math.ceil(wall_sheathing_area / (96 * 48))
print(f"    - {wall_sheathing_sheets} sheet(s) (4'×8')")
print(f"  Wall positions from left end: {BAY_WIDTH:.0f}\", {2*BAY_WIDTH:.0f}\", {3*BAY_WIDTH:.0f}\" (internal)")
print(f"  Outer walls at cabinet ends provide door anchor points")

# Joists
print(f"\nJOISTS:")
print(f"  2×6 Pressure-treated: {num_joists} @ {math.ceil(joist_length/12)*12}\" (cut to {joist_length:.1f}\")")
print(f"  (Spacing: {JOIST_SPACING}\" on center)")

# Plywood deck
deck_sheets = math.ceil((COUNTER_LENGTH * COUNTER_DEPTH) / (96 * 48))  # 4'×8' sheets
print(f"\nPLYWOOD DECK (form base):")
print(f"  3/4\" Exterior plywood: {deck_sheets} sheet(s) (4'×8')")
print(f"  (Coverage: {COUNTER_LENGTH}\" × {COUNTER_DEPTH}\")")

# Note: Outer walls replace separate shear panels - sheathing provides racking resistance

# Cabinet doors (sized to fit between support walls)
door_height = panel_height - 2 * DOOR_CLEARANCE
# Door width accounts for wall thickness at bay edges
effective_bay_width = BAY_WIDTH - WALL_STUD_THICKNESS  # Subtract for stud overlap
single_door_width = (effective_bay_width - 2 * DOOR_CLEARANCE - DOOR_GAP) / 2
num_doors = NUM_BAYS * 2  # 2 doors per bay
door_area = num_doors * single_door_width * door_height
door_sheets = math.ceil(door_area / (96 * 48))
print(f"\nCABINET DOORS ({NUM_BAYS} bays, double doors):")
print(f"  3/4\" HDPE or Exterior plywood: {door_sheets} sheet(s) (4'×8')")
print(f"  ({num_doors} doors @ {single_door_width:.1f}\" × {door_height:.1f}\" each)")
print(f"  Router-recessed pulls: {HANDLE_WIDTH}\" × {HANDLE_HEIGHT}\" × {HANDLE_DEPTH}\" deep")
print(f"  (Positioned {HANDLE_TOP_MARGIN}\" from top, 1\" from center edge)")
print(f"  Doors hinge on support walls for solid anchor points")

# Hardware
print(f"\nHARDWARE:")
print(f"  1/2\" × 6\" Through-bolts for ledger: 6-8 (into 6×6 posts)")
print(f"  3\" Deck screws for base frame: ~{num_longitudinal * 10 + num_cross * 10}")
print(f"  2-1/2\" Framing screws for wall assembly: ~{total_studs * 4}")
print(f"  Joist hangers (2×6): {num_joists * 2} (both ends)")
print(f"  1-1/4\" Exterior screws for plywood deck: ~100")
print(f"  1-5/8\" Screws for wall sheathing: ~{wall_sheathing_sheets * 50}")
print(f"  Outdoor cabinet hinges: {num_doors * 2} pairs (2 per door)")
print(f"  Magnetic catches: {num_doors} (1 per door)")
print(f"  1-1/4\" Screws for door installation: ~{num_doors * 8}")

# Foundation
print(f"\nFOUNDATION:")
print(f"  Leveling base: Crushed rock or sand (2-3 cubic feet)")
print(f"  Landscape fabric: {COUNTER_LENGTH}\" × {COUNTER_DEPTH}\" (optional)")
print(f"  Note: Deck base sits directly on prepared, level ground")

# Cabinet/door notes
print(f"\n{'='*60}")
print(f"CABINET CONFIGURATION")
print(f"{'='*60}")
print(f"\nBay layout: {NUM_BAYS} bays @ {BAY_WIDTH:.1f}\" nominal each")
print(f"Support walls: {NUM_INTERNAL_WALLS} internal + 2 outer (at cabinet ends)")
print(f"Wall positions: 0\" (left), {BAY_WIDTH:.0f}\", {2*BAY_WIDTH:.0f}\", {3*BAY_WIDTH:.0f}\", {COUNTER_LENGTH:.0f}\" (right)")
print(f"Double doors per bay: {num_doors} total doors")
print(f"Single door size: {single_door_width:.1f}\" × {door_height:.1f}\"")
print(f"Door clearance: {DOOR_CLEARANCE}\" top/bottom/sides, {DOOR_GAP}\" center gap")
print(f"Router-recessed pulls: {HANDLE_WIDTH}\" × {HANDLE_HEIGHT}\" × {HANDLE_DEPTH}\" deep")
print(f"Handle position: {HANDLE_TOP_MARGIN}\" from top, 1\" from center edge")
print(f"Door anchoring: Hinges mount to support walls at each bay boundary")

# Control joint note
print(f"\n{'='*60}")
print(f"CONCRETE POUR NOTES")
print(f"{'='*60}")
print(f"\nRecommended control joint location:")
print(f"  At center (~{COUNTER_LENGTH/2}\" from each end)")
print(f"  Aligns with middle leg/divider")
print(f"\nSlab thickness: 1.5\" - 2\" (with fiber mesh)")
print(f"Edge forms: Build up from plywood deck using melamine strips")
print(f"Overhang: 1\" - 1.5\" front and sides")

print(f"\n{'='*60}")
print(f"ASSEMBLY SEQUENCE")
print(f"{'='*60}")
print(f"1. Prepare ground area:")
print(f"   - Clear and level {COUNTER_LENGTH}\" × {COUNTER_DEPTH}\" footprint")
print(f"   - Add 2-3\" crushed rock/sand base, compact and level")
print(f"   - Optional: Lay landscape fabric")
print(f"2. Build deck-style base frame on ground:")
print(f"   - Lay {num_longitudinal} longitudinal 2×6 boards @ {BASE_BOARD_SPACING}\" OC")
print(f"   - Lay {num_cross} cross 2×6 boards @ {BASE_BOARD_SPACING}\" OC")
print(f"   - Screw together to create stable grid platform")
print(f"   - Verify level in all directions")
print(f"3. Cut and bolt 2×8 ledger to 6×6 fence posts:")
print(f"   - Set height so finished counter = {COUNTER_HEIGHT}\"")
print(f"   - Ledger top at {ledger_top:.1f}\" from base top")
print(f"4. Build {NUM_TOTAL_WALLS} support walls (2 outer + {NUM_INTERNAL_WALLS} internal):")
print(f"   - Outer walls at cabinet ends (0\" and {COUNTER_LENGTH}\")")
print(f"   - Internal walls at {BAY_WIDTH:.0f}\", {2*BAY_WIDTH:.0f}\", {3*BAY_WIDTH:.0f}\" from left")
print(f"   - Frame with 2×4 plates and studs @ {WALL_STUD_SPACING}\" OC")
print(f"   - Sheath with 1/2\" plywood, stand and brace plumb")
print(f"   - Walls align with bay divisions for door mounting")
print(f"5. Install doubled 2×8 front beam on wall tops:")
print(f"   - Check level with ledger")
print(f"   - Secure to wall top plates")
print(f"6. Install joist hangers and hang 2×6 joists:")
print(f"   - {JOIST_SPACING}\" on center, {num_joists} total")
print(f"7. Screw down 3/4\" plywood deck")
print(f"8. Cut and router cabinet doors:")
print(f"   - {num_doors} doors @ {single_door_width:.1f}\" × {door_height:.1f}\" each")
print(f"   - Router {HANDLE_WIDTH}\" × {HANDLE_HEIGHT}\" × {HANDLE_DEPTH}\" recesses for pulls")
print(f"   - Install hinges to support walls (solid anchor points)")
print(f"   - Install magnetic catches")
print(f"   - Mount doors with {DOOR_CLEARANCE}\" clearance and {DOOR_GAP}\" center gap")
print(f"9. Build concrete edge forms on deck")
print(f"10. Pour and finish concrete countertop")
print(f"\n{'='*60}\n")
