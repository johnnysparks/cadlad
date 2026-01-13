"""Opus's Outdoor Counter Cabinet FRAME ONLY — Construction-Ready CAD Model

FRAME-ONLY VERSION using exclusively 2×6 lumber.
This is the structural skeleton for construction - finish work builds on top.

Design specifications:
- 12' (144") length along fence line
- 18" depth (front to back)
- 36" finished counter height
- ALL LUMBER: 2×6 pressure-treated (5.5" × 1.5" actual)
- Back ledger bolted to 6×6 fence posts
- Front beam supported by five framed walls
- Standard deck-style base frame with 2×6s ON EDGE (5.5" toe kick)
- 2×6 joists at 12" on center spanning front to back
- 5 support walls: 2 outer (at cabinet ends) + 3 internal (at bay divisions)
- Support walls protrude past base frame for door mounting surface
- 4 equal bays (36" each) for future door installation

This version focuses on:
1. Cut list with exact lengths and quantities
2. Orientation (flat vs on-edge)
3. Material counts for construction
4. Minimizing cuts while maintaining structural integrity

Based on standard deck framing:
- Base frame = perimeter 2×6s ON EDGE (creates 5.5" toe kick)
- Back ledger = one long rail (2×6 on edge, bolted to fence)
- Front beam = one long rail (2×6 on edge)
- Joists = rungs every 12" (2×6 on edge)
- Support walls span base to countertop, protrude at front

TODO: Keep this frame design in sync with opus_outdoor_counter_cabinet
When updating dimensions or bay configuration in either design, update both:
- opus_outdoor_counter_cabinet (full design with finish work)
- opus_outdoor_counter_cabinet_frame (frame-only with 2×6s only)
"""

import cadquery as cq
import math

# ===== DESIGN PARAMETERS =====

# Overall dimensions
COUNTER_LENGTH = 144  # 12 feet in inches
COUNTER_DEPTH = 18    # 18" front to back
COUNTER_HEIGHT = 36   # 36" finished counter height

# ALL LUMBER: 2×6 (actual dimensions)
LUMBER_WIDTH = 5.5    # 2×6 actual width
LUMBER_THICKNESS = 1.5  # 2×6 actual thickness

# Rear ledger (bolted to 6×6 fence posts)
LEDGER_WIDTH = LUMBER_WIDTH      # 2×6 on edge (5.5")
LEDGER_THICKNESS = LUMBER_THICKNESS  # 1.5"

# Front beam (single 2×6 on edge)
FRONT_BEAM_WIDTH = LUMBER_WIDTH      # 2×6 on edge (5.5")
FRONT_BEAM_THICKNESS = LUMBER_THICKNESS  # 1.5"

# Midsection wall supports (2×6 framing instead of 2×4)
WALL_STUD_SIZE = LUMBER_WIDTH  # 2×6 actual dimension (5.5")
WALL_STUD_THICKNESS = LUMBER_THICKNESS  # 2×6 actual thickness (1.5")
WALL_STUD_SPACING = 16  # 16" on center for studs

# Deck-style base frame (2×6s ON EDGE for toe kick)
# Standard deck framing: perimeter boards on edge create 5.5" toe kick
BASE_FRAME_HEIGHT = LUMBER_WIDTH  # 2×6 on edge = 5.5" toe kick height
BASE_FRAME_THICKNESS = LUMBER_THICKNESS  # 1.5" board thickness

# Wall protrusion: walls extend past base frame at front for door mounting
WALL_PROTRUSION = 3  # 3" protrusion past front of base frame

# Joists (2×6 on edge, spanning front to back)
JOIST_WIDTH = LUMBER_THICKNESS     # 2×6 actual thickness (1.5")
JOIST_HEIGHT = LUMBER_WIDTH        # 2×6 actual width on edge (5.5")
JOIST_SPACING = 12    # 12" on center

# 6×6 fence posts (for reference - not modeled, just the ledger attachment)
FENCE_POST_SIZE = 5.5  # 6×6 actual dimension

# Cabinet bay configuration
NUM_BAYS = 4  # 4 bays of 36" each
NUM_INTERNAL_WALLS = 3  # Three internal support walls (between bays)

# Wall positions (placed at bay boundaries to align with future doors)
# Walls divide the 144" length into 4 equal bays of 36" each
BAY_WIDTH = COUNTER_LENGTH / NUM_BAYS  # 36" per bay
WALL_POSITIONS = [
    BAY_WIDTH,      # Wall 1 at 36" from left (between bay 1 and 2)
    2 * BAY_WIDTH,  # Wall 2 at 72" from left (between bay 2 and 3)
    3 * BAY_WIDTH,  # Wall 3 at 108" from left (between bay 3 and 4)
]

# Air gap from fence
FENCE_GAP = 3  # 3" gap from fence boards

print(f"\n{'='*70}")
print(f"OPUS'S OUTDOOR COUNTER CABINET — FRAME ONLY (2×6 CONSTRUCTION)")
print(f"{'='*70}")
print(f"\nDimensions: {COUNTER_LENGTH}\" × {COUNTER_DEPTH}\" ({COUNTER_LENGTH/12:.1f}' × {COUNTER_DEPTH/12:.1f}')")
print(f"Finished counter height: {COUNTER_HEIGHT}\"")
print(f"Bay configuration: {NUM_BAYS} bays @ {BAY_WIDTH:.1f}\" each")
print(f"Support walls: {NUM_INTERNAL_WALLS} internal + 2 outer (framed ends)")
print(f"\n*** ALL LUMBER: 2×6 PRESSURE-TREATED ONLY ***")

# ===== CALCULATE COMPONENT HEIGHTS =====

# Work backwards from finished counter height
# For frame-only, we target the joist top at counter height minus typical deck thickness
ASSUMED_DECK_THICKNESS = 0.75  # Planning for 3/4" plywood later

# Joists will be topped later with plywood
joist_top = COUNTER_HEIGHT - ASSUMED_DECK_THICKNESS
joist_bottom = joist_top - JOIST_HEIGHT

# Ledger and front beam at joist level (joists hang from or rest on these)
# Using joist hangers, so beam/ledger top aligns with joist top
ledger_top = joist_top
ledger_bottom = ledger_top - LEDGER_WIDTH  # 2×6 on edge

front_beam_top = joist_top
front_beam_bottom = front_beam_top - FRONT_BEAM_WIDTH

# Base frame height (2×6 on edge = 5.5" toe kick)
base_top = BASE_FRAME_HEIGHT  # Top of base frame

# Midsection walls go from base top to bottom of front beam
wall_bottom = base_top  # Walls sit on top of base frame
wall_top = front_beam_bottom  # Walls support front beam
wall_height = wall_top - wall_bottom  # Height of wall framing above base

# Total wall depth including protrusion
wall_total_depth = COUNTER_DEPTH + WALL_PROTRUSION  # 18" + 3" = 21"

print(f"\nFRAME STRUCTURE (bottom to top):")
print(f"  Base frame (2×6 on edge): 0\" - {base_top:.2f}\" (creates {BASE_FRAME_HEIGHT:.1f}\" toe kick)")
print(f"  Support walls: {wall_bottom:.2f}\" - {wall_top:.2f}\" (protrude {WALL_PROTRUSION}\" at front)")
print(f"  Ledger (2×6 on edge): {ledger_bottom:.2f}\" - {ledger_top:.2f}\"")
print(f"  Front beam (2×6 on edge): {front_beam_bottom:.2f}\" - {front_beam_top:.2f}\"")
print(f"  Joists (2×6 on edge): {joist_bottom:.2f}\" - {joist_top:.2f}\"")
print(f"  [Future plywood deck: {joist_top:.2f}\" - {COUNTER_HEIGHT:.2f}\"]")

# ===== BUILD THE 3D MODEL =====

# Coordinate system:
# X = along counter length (left to right)
# Y = depth (back at fence = negative, front = positive)
# Z = height (ground = 0, up = positive)

# Center the model on X axis, fence at back (Y=0 is back edge)

# 1. REAR LEDGER (2×6 on edge, bolted to fence posts)
# Positioned at back, full length
ledger = (
    cq.Workplane("XY")
    .box(COUNTER_LENGTH, LEDGER_THICKNESS, LEDGER_WIDTH)
    .translate((0, -COUNTER_DEPTH/2 + LEDGER_THICKNESS/2, ledger_bottom + LEDGER_WIDTH/2))
)

# 2. FRONT BEAM (2×6 on edge)
# Positioned at front, full length
front_beam = (
    cq.Workplane("XY")
    .box(COUNTER_LENGTH, FRONT_BEAM_THICKNESS, FRONT_BEAM_WIDTH)
    .translate((0, COUNTER_DEPTH/2 - FRONT_BEAM_THICKNESS/2, front_beam_bottom + FRONT_BEAM_WIDTH/2))
)

# 3. DECK-STYLE BASE FRAME (2×6s ON EDGE - creates toe kick)
# Standard deck framing: perimeter boards on edge
# This creates a 5.5" toe kick and provides structural base for walls

# Front rim board (creates toe kick face) - full length
front_rim = (
    cq.Workplane("XY")
    .box(COUNTER_LENGTH, BASE_FRAME_THICKNESS, BASE_FRAME_HEIGHT)
    .translate((0, COUNTER_DEPTH/2 - BASE_FRAME_THICKNESS/2, BASE_FRAME_HEIGHT/2))
)

# Back rim board - full length (parallel to fence)
back_rim = (
    cq.Workplane("XY")
    .box(COUNTER_LENGTH, BASE_FRAME_THICKNESS, BASE_FRAME_HEIGHT)
    .translate((0, -COUNTER_DEPTH/2 + BASE_FRAME_THICKNESS/2, BASE_FRAME_HEIGHT/2))
)

# Left end board (connects front to back)
# Length = depth minus two board thicknesses (fits between front and back)
end_board_length = COUNTER_DEPTH - 2 * BASE_FRAME_THICKNESS
left_end = (
    cq.Workplane("XY")
    .box(BASE_FRAME_THICKNESS, end_board_length, BASE_FRAME_HEIGHT)
    .translate((-COUNTER_LENGTH/2 + BASE_FRAME_THICKNESS/2, 0, BASE_FRAME_HEIGHT/2))
)

# Right end board
right_end = (
    cq.Workplane("XY")
    .box(BASE_FRAME_THICKNESS, end_board_length, BASE_FRAME_HEIGHT)
    .translate((COUNTER_LENGTH/2 - BASE_FRAME_THICKNESS/2, 0, BASE_FRAME_HEIGHT/2))
)

base_frame = front_rim.union(back_rim).union(left_end).union(right_end)

# 4. MIDSECTION WALL SUPPORTS (2×6 framing instead of 2×4)
# Five framed walls total: 3 internal + 2 outer

def create_wall(x_position):
    """Create a framed wall with 2×6 studs (no sheathing - frame only)

    Walls sit on top of base frame and extend to front beam.
    They protrude past the base frame at front for door mounting.
    """
    # Wall depth includes protrusion at front
    plate_length = wall_total_depth  # 18" + 3" protrusion = 21"

    # Y position: centered on counter depth but shifted forward for protrusion
    plate_center_y = WALL_PROTRUSION / 2  # Shift forward by half the protrusion

    # Bottom plate (2×6 flat on top of base frame)
    bottom_plate = (
        cq.Workplane("XY")
        .box(WALL_STUD_THICKNESS, plate_length, WALL_STUD_SIZE)
        .translate((x_position, plate_center_y, base_top + WALL_STUD_SIZE/2))
    )

    # Top plate (2×6 flat under front beam)
    top_plate = (
        cq.Workplane("XY")
        .box(WALL_STUD_THICKNESS, plate_length, WALL_STUD_SIZE)
        .translate((x_position, plate_center_y, wall_top - WALL_STUD_SIZE/2))
    )

    # Vertical studs - one at back, one at front (protrusion)
    # This minimizes cuts while providing structural support
    studs = cq.Workplane("XY")
    stud_height = wall_height - 2 * WALL_STUD_SIZE  # Between plates

    # Back stud (at back of cabinet)
    back_stud = (
        cq.Workplane("XY")
        .box(WALL_STUD_SIZE, WALL_STUD_THICKNESS, stud_height)
        .translate((x_position, -COUNTER_DEPTH/2 + WALL_STUD_THICKNESS/2,
                   base_top + WALL_STUD_SIZE + stud_height/2))
    )

    # Front stud (at front of protrusion - door mounting surface)
    front_stud = (
        cq.Workplane("XY")
        .box(WALL_STUD_SIZE, WALL_STUD_THICKNESS, stud_height)
        .translate((x_position, COUNTER_DEPTH/2 + WALL_PROTRUSION - WALL_STUD_THICKNESS/2,
                   base_top + WALL_STUD_SIZE + stud_height/2))
    )

    studs = back_stud.union(front_stud)

    return bottom_plate.union(top_plate).union(studs)

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

# 6. STRUCTURAL OUTER WALLS (framed walls at ends)
# These provide structural support and future door anchor points

def create_outer_wall(x_position):
    """Create a framed outer wall with 2×6 studs (frame only)

    Outer walls use the same construction as internal walls.
    They protrude past the base frame at front for door mounting.
    """
    # Use same construction as internal walls
    return create_wall(x_position)

# Left outer wall (at left end of cabinet)
left_outer_wall = create_outer_wall(-COUNTER_LENGTH/2 + WALL_STUD_THICKNESS/2)

# Right outer wall (at right end of cabinet)
right_outer_wall = create_outer_wall(COUNTER_LENGTH/2 - WALL_STUD_THICKNESS/2)

outer_walls = left_outer_wall.union(right_outer_wall)

# 7. COMBINE ALL FRAME COMPONENTS
all_walls = internal_walls.union(outer_walls)

result = (
    base_frame
    .union(all_walls)
    .union(ledger)
    .union(front_beam)
    .union(joists)
)

# ===== MATERIALS CUT LIST FOR CONSTRUCTION =====

print(f"\n{'='*70}")
print(f"CUT LIST — 2×6 PRESSURE-TREATED LUMBER ONLY")
print(f"{'='*70}")

# Count total 2×6 lumber needed
total_linear_feet = 0
cut_list = []

# 1. Ledger
ledger_length = COUNTER_LENGTH
cut_list.append(("REAR LEDGER", 1, ledger_length, "ON EDGE", "Bolted to fence posts"))
total_linear_feet += ledger_length / 12

print(f"\n1. REAR LEDGER (bolted to 6×6 fence posts):")
print(f"   Qty: 1")
print(f"   Length: {ledger_length/12:.0f}' ({ledger_length}\")")
print(f"   Orientation: ON EDGE (5.5\" height)")
print(f"   Notes: Bolt to fence posts at {ledger_bottom:.1f}\" - {ledger_top:.1f}\" height")

# 2. Front beam
front_beam_length = COUNTER_LENGTH
cut_list.append(("FRONT BEAM", 1, front_beam_length, "ON EDGE", "Front support"))
total_linear_feet += front_beam_length / 12

print(f"\n2. FRONT BEAM:")
print(f"   Qty: 1")
print(f"   Length: {front_beam_length/12:.0f}' ({front_beam_length}\")")
print(f"   Orientation: ON EDGE (5.5\" height)")
print(f"   Notes: Sits on wall tops at {front_beam_bottom:.1f}\" - {front_beam_top:.1f}\" height")

# 3. Base frame (perimeter 2×6s on edge - creates toe kick)
rim_length = COUNTER_LENGTH  # Front and back rim boards

print(f"\n3. BASE FRAME (2×6s ON EDGE - creates {BASE_FRAME_HEIGHT:.1f}\" toe kick):")
print(f"   Front rim board (toe kick face):")
print(f"     Qty: 1")
print(f"     Length: {rim_length/12:.0f}' ({rim_length}\")")
print(f"     Orientation: ON EDGE (5.5\" height)")
total_linear_feet += rim_length / 12
cut_list.append(("BASE FRONT RIM", 1, rim_length, "ON EDGE", "Toe kick face"))

print(f"   Back rim board:")
print(f"     Qty: 1")
print(f"     Length: {rim_length/12:.0f}' ({rim_length}\")")
print(f"     Orientation: ON EDGE (5.5\" height)")
total_linear_feet += rim_length / 12
cut_list.append(("BASE BACK RIM", 1, rim_length, "ON EDGE", "Back of base frame"))

print(f"   End boards (left and right):")
print(f"     Qty: 2")
print(f"     Length: {end_board_length:.1f}\" (fits between front/back rims)")
print(f"     Orientation: ON EDGE (5.5\" height)")
total_linear_feet += (2 * end_board_length) / 12
cut_list.append(("BASE LEFT END", 1, end_board_length, "ON EDGE", "Left end cap"))
cut_list.append(("BASE RIGHT END", 1, end_board_length, "ON EDGE", "Right end cap"))

# 4. Support walls (with protrusion for door mounting)
NUM_TOTAL_WALLS = NUM_INTERNAL_WALLS + 2  # 3 internal + 2 outer walls
studs_per_wall = 2  # Front stud + back stud (minimizes cuts)
wall_stud_length = wall_height - 2 * WALL_STUD_SIZE  # Between plates
total_studs = studs_per_wall * NUM_TOTAL_WALLS
total_plates = NUM_TOTAL_WALLS * 2  # Top and bottom plates
plate_length = wall_total_depth  # 21" (includes 3" protrusion)

print(f"\n4. SUPPORT WALLS ({NUM_INTERNAL_WALLS} internal + 2 outer = {NUM_TOTAL_WALLS} total):")
print(f"   Wall positions from left: 0\" (outer), {BAY_WIDTH:.0f}\", {2*BAY_WIDTH:.0f}\", {3*BAY_WIDTH:.0f}\", {COUNTER_LENGTH:.0f}\" (outer)")
print(f"   Walls protrude {WALL_PROTRUSION}\" past base frame at front for door mounting")
print(f"   ")
print(f"   Vertical studs (2×6 on edge):")
print(f"     Qty: {total_studs} total ({studs_per_wall} per wall - front and back)")
print(f"     Length: {math.ceil(wall_stud_length/12)*12}\" (cut to {wall_stud_length:.1f}\")")
print(f"     Orientation: ON EDGE (5.5\" width)")
print(f"     Notes: One stud at back, one at front (protrusion) for door mounting")
total_linear_feet += (total_studs * wall_stud_length) / 12

print(f"   ")
print(f"   Top/Bottom plates (2×6 on edge for strength):")
print(f"     Qty: {total_plates} ({NUM_TOTAL_WALLS} walls × 2 plates)")
print(f"     Length: {math.ceil(plate_length/12)*12}\" (cut to {plate_length:.1f}\")")
print(f"     Orientation: ON EDGE (5.5\" height)")
print(f"     Notes: Extended length includes {WALL_PROTRUSION}\" protrusion")
total_linear_feet += (total_plates * plate_length) / 12

# Add wall components to cut list
wall_names = ["LEFT OUTER", "INTERNAL #1", "INTERNAL #2", "INTERNAL #3", "RIGHT OUTER"]
for wall_idx in range(NUM_TOTAL_WALLS):
    wall_name = wall_names[wall_idx]
    cut_list.append((f"{wall_name} WALL - BOTTOM PLATE", 1, plate_length, "ON EDGE", "Bottom plate (on base frame)"))
    cut_list.append((f"{wall_name} WALL - TOP PLATE", 1, plate_length, "ON EDGE", "Top plate (under front beam)"))
    cut_list.append((f"{wall_name} WALL - BACK STUD", 1, wall_stud_length, "ON EDGE", "Back vertical stud"))
    cut_list.append((f"{wall_name} WALL - FRONT STUD", 1, wall_stud_length, "ON EDGE", "Front stud (door mounting)"))

# 5. Joists
joist_cut_length = math.ceil(joist_length/12)*12  # Round up to nearest foot
print(f"\n5. JOISTS (2×6 on edge):")
print(f"   Qty: {num_joists}")
print(f"   Length: {joist_cut_length}\" (cut to {joist_length:.1f}\")")
print(f"   Orientation: ON EDGE (5.5\" height)")
print(f"   Spacing: {JOIST_SPACING}\" on center")
print(f"   Notes: Span from ledger to front beam using joist hangers")
total_linear_feet += (num_joists * joist_length) / 12

for i in range(num_joists):
    cut_list.append((f"JOIST #{i+1}", 1, joist_length, "ON EDGE", f"@ {-COUNTER_LENGTH/2 + i * JOIST_SPACING:.1f}\" X"))

# Summary
print(f"\n{'='*70}")
print(f"LUMBER SUMMARY")
print(f"{'='*70}")
print(f"\nTOTAL 2×6 PRESSURE-TREATED: {math.ceil(total_linear_feet)}' ({total_linear_feet:.1f}' calculated)")
print(f"")
base_frame_linear = (2 * rim_length + 2 * end_board_length) / 12
print(f"Breakdown by component:")
print(f"  - Ledger: {ledger_length/12:.0f}'")
print(f"  - Front beam: {front_beam_length/12:.0f}'")
print(f"  - Base frame (perimeter): {base_frame_linear:.1f}'")
print(f"  - Wall studs: {(total_studs * wall_stud_length / 12):.1f}'")
print(f"  - Wall plates: {(total_plates * plate_length / 12):.1f}'")
print(f"  - Joists: {(num_joists * joist_length / 12):.1f}'")

# Add buffer for waste
buffer_percentage = 10
total_with_buffer = math.ceil(total_linear_feet * (1 + buffer_percentage/100))
print(f"\nRECOMMENDED PURCHASE (with {buffer_percentage}% waste factor): {total_with_buffer}' of 2×6 lumber")

# Hardware
print(f"\n{'='*70}")
print(f"HARDWARE & FASTENERS")
print(f"{'='*70}")
print(f"\nBolts for ledger:")
print(f"  - 1/2\" × 6\" Through-bolts: 6-8 (for bolting ledger to 6×6 fence posts)")
print(f"  - 1/2\" Washers and nuts: 6-8 sets")
print(f"")
print(f"Deck screws for base frame:")
print(f"  - 3\" Deck screws: ~24 (perimeter frame corners and joints)")
print(f"")
print(f"Framing screws for walls:")
print(f"  - 3\" Framing screws: ~{total_studs * 4 + total_plates * 10} (wall assembly)")
print(f"")
print(f"Joist hangers:")
print(f"  - 2×6 Joist hangers: {num_joists * 2} (both ends of each joist)")
print(f"  - 1-1/2\" Joist hanger nails: ~{num_joists * 2 * 8}")

# Foundation
print(f"\n{'='*70}")
print(f"SITE PREPARATION")
print(f"{'='*70}")
print(f"\nFootprint: {COUNTER_LENGTH}\" × {COUNTER_DEPTH}\" ({COUNTER_LENGTH/12:.0f}' × {COUNTER_DEPTH/12:.0f}')")
print(f"")
print(f"Leveling base:")
print(f"  - Crushed rock or sand: 2-3 cubic feet")
print(f"  - Landscape fabric: {COUNTER_LENGTH}\" × {COUNTER_DEPTH}\" (optional)")
print(f"")
print(f"Notes:")
print(f"  - Clear and level area")
print(f"  - Add 2-3\" crushed rock/sand base")
print(f"  - Compact and level thoroughly")

# Assembly sequence
print(f"\n{'='*70}")
print(f"ASSEMBLY SEQUENCE FOR CONSTRUCTION")
print(f"{'='*70}")
print(f"\n1. SITE PREPARATION")
print(f"   - Clear {COUNTER_LENGTH}\" × {COUNTER_DEPTH}\" area")
print(f"   - Add and compact 2-3\" base material")
print(f"   - Level in all directions")
print(f"")
print(f"2. BUILD BASE FRAME (creates {BASE_FRAME_HEIGHT:.1f}\" toe kick)")
print(f"   - Cut 2 × 2×6 @ {rim_length/12:.0f}' ({rim_length}\") for front/back rims")
print(f"   - Cut 2 × 2×6 @ {end_board_length:.1f}\" for end caps")
print(f"   - Assemble perimeter frame with all boards ON EDGE")
print(f"   - Front rim = toe kick face, back rim parallel to fence")
print(f"   - Screw corners with 3\" deck screws")
print(f"   - Verify level and square")
print(f"")
print(f"3. INSTALL REAR LEDGER")
print(f"   - Cut 1 × 2×6 @ {ledger_length/12:.0f}' ({ledger_length}\")")
print(f"   - Position ON EDGE at back")
print(f"   - Bolt to fence posts with 1/2\" × 6\" through-bolts")
print(f"   - Top of ledger at {ledger_top:.1f}\" height")
print(f"")
print(f"4. BUILD SUPPORT WALLS ({NUM_TOTAL_WALLS} total)")
print(f"   - Cut {total_plates} plates @ {plate_length:.1f}\" (ON EDGE orientation)")
print(f"   - Cut {total_studs} studs @ {wall_stud_length:.1f}\" (ON EDGE orientation)")
print(f"   - Assemble each wall: bottom plate + 2 studs (front & back) + top plate")
print(f"   - Stand walls on base frame at positions: 0\", {BAY_WIDTH:.0f}\", {2*BAY_WIDTH:.0f}\", {3*BAY_WIDTH:.0f}\", {COUNTER_LENGTH:.0f}\"")
print(f"   - Front studs protrude {WALL_PROTRUSION}\" past base frame for door mounting")
print(f"   - Brace plumb and secure to base frame")
print(f"")
print(f"5. INSTALL FRONT BEAM")
print(f"   - Cut 1 × 2×6 @ {front_beam_length/12:.0f}' ({front_beam_length}\")")
print(f"   - Place ON EDGE on wall tops")
print(f"   - Level with rear ledger")
print(f"   - Secure to wall top plates with 3\" screws")
print(f"")
print(f"6. INSTALL JOISTS")
print(f"   - Cut {num_joists} × 2×6 @ {joist_cut_length}\" (trim to {joist_length:.1f}\")")
print(f"   - Install joist hangers on ledger and front beam")
print(f"   - Place joists ON EDGE @ {JOIST_SPACING}\" on center")
print(f"   - Nail with joist hanger nails")
print(f"")
print(f"7. FRAME COMPLETE - READY FOR FINISH WORK")
print(f"   Next steps (not included in this frame):")
print(f"   - Add 3/4\" plywood deck")
print(f"   - Add wall sheathing")
print(f"   - Build and hang cabinet doors")
print(f"   - Pour concrete countertop")

print(f"\n{'='*70}")
print(f"NOTES")
print(f"{'='*70}")
print(f"\n- All lumber: 2×6 pressure-treated")
print(f"- This is FRAME ONLY - finish work separate")
print(f"- Base frame creates {BASE_FRAME_HEIGHT:.1f}\" toe kick (2×6s on edge)")
print(f"- Walls protrude {WALL_PROTRUSION}\" past base for door mounting surface")
print(f"- Bay divisions at 36\" intervals for future door installation")
print(f"- Frame designed to support concrete countertop")
print(f"- Keep design synced with opus_outdoor_counter_cabinet")

print(f"\n{'='*70}\n")

# Print detailed cut list for reference
print(f"\n{'='*70}")
print(f"DETAILED CUT LIST (for cut sheet)")
print(f"{'='*70}")
print(f"\n{'COMPONENT':<40} {'QTY':<5} {'LENGTH':<12} {'ORIENT':<10} {'NOTES':<30}")
print(f"{'-'*40} {'-'*5} {'-'*12} {'-'*10} {'-'*30}")
for component, qty, length, orient, notes in cut_list:
    length_str = f"{length/12:.1f}' ({length:.1f}\")" if length > 12 else f"{length:.1f}\""
    print(f"{component:<40} {qty:<5} {length_str:<12} {orient:<10} {notes:<30}")
print(f"\n{'='*70}\n")
