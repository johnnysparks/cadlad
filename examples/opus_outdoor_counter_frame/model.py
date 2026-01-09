"""Opus's Outdoor Counter Frame — Construction-Ready CAD Model

A fence-mounted outdoor counter/cabinet frame for a concrete countertop pour.
Perfect for outdoor kitchens, BBQ stations, or potting benches.

Design specifications:
- 12' (144") length along fence line
- 18" depth (front to back)
- 36" finished counter height
- Back ledger bolted to 6×6 fence posts
- Front beam (double 2×8) supported by two midsection walls
- Deck-style base frame of pressure treated 2×6 boards for level platform
- 2×6 joists at 12" on center spanning front to back
- 3/4" plywood deck for concrete form base
- 1/2" plywood shear panels on ends for anti-racking
- 4 equal bays (~30" each) for cabinet doors

Based on the "ladder frame" concept:
- Back ledger = one long rail
- Front beam = other long rail
- Joists = rungs every 12"
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
NUM_BAYS = 4  # 4 bays of ~30" each
NUM_WALLS = 2  # Two midsection support walls

# Wall positions (placed to divide structure into thirds)
WALL_1_POSITION = COUNTER_LENGTH / 3  # At 48" from left
WALL_2_POSITION = 2 * COUNTER_LENGTH / 3  # At 96" from left

# Air gap from fence
FENCE_GAP = 3  # 3" gap from fence boards

print(f"\n{'='*60}")
print(f"OPUS'S OUTDOOR COUNTER FRAME — 12' × 18\"")
print(f"{'='*60}")
print(f"\nDimensions: {COUNTER_LENGTH}\" × {COUNTER_DEPTH}\" ({COUNTER_LENGTH/12:.1f}' × {COUNTER_DEPTH/12:.1f}')")
print(f"Finished counter height: {COUNTER_HEIGHT}\"")
print(f"Bay configuration: {NUM_BAYS} bays @ {COUNTER_LENGTH/NUM_BAYS:.1f}\" each")

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

# Create the two walls
wall_1 = create_wall(-COUNTER_LENGTH/2 + WALL_1_POSITION)
wall_2 = create_wall(-COUNTER_LENGTH/2 + WALL_2_POSITION)
walls = wall_1.union(wall_2)

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

# 7. SHEAR PANELS (1/2" plywood on ends for anti-racking)
# Left end panel
panel_height = COUNTER_HEIGHT - DECK_THICKNESS  # From ground to bottom of deck
left_panel = (
    cq.Workplane("XY")
    .box(PANEL_THICKNESS, COUNTER_DEPTH, panel_height)
    .translate((-COUNTER_LENGTH/2 + PANEL_THICKNESS/2, 0, panel_height/2))
)

# Right end panel
right_panel = (
    cq.Workplane("XY")
    .box(PANEL_THICKNESS, COUNTER_DEPTH, panel_height)
    .translate((COUNTER_LENGTH/2 - PANEL_THICKNESS/2, 0, panel_height/2))
)

shear_panels = left_panel.union(right_panel)

# 8. COMBINE ALL COMPONENTS
result = (
    base_frame
    .union(walls)
    .union(ledger)
    .union(front_beam)
    .union(joists)
    .union(deck)
    .union(shear_panels)
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

# Midsection walls
print(f"\nMIDSECTION WALL SUPPORTS ({NUM_WALLS} walls):")
studs_per_wall = int(COUNTER_DEPTH / WALL_STUD_SPACING) + 1
wall_stud_length = wall_height - base_height - 2 * WALL_STUD_SIZE
total_studs = studs_per_wall * NUM_WALLS
print(f"  2×4 Pressure-treated (wall studs):")
print(f"    - {total_studs} studs @ {math.ceil(wall_stud_length/12)}' each")
print(f"    - {NUM_WALLS * 2} plates (top/bottom) @ {math.ceil(COUNTER_DEPTH/12)}' each")
print(f"  1/2\" Plywood sheathing:")
wall_sheathing_area = NUM_WALLS * COUNTER_DEPTH * (wall_height - base_height)
wall_sheathing_sheets = math.ceil(wall_sheathing_area / (96 * 48))
print(f"    - {wall_sheathing_sheets} sheet(s) (4'×8')")

# Joists
print(f"\nJOISTS:")
print(f"  2×6 Pressure-treated: {num_joists} @ {math.ceil(joist_length/12)*12}\" (cut to {joist_length:.1f}\")")
print(f"  (Spacing: {JOIST_SPACING}\" on center)")

# Plywood deck
deck_sheets = math.ceil((COUNTER_LENGTH * COUNTER_DEPTH) / (96 * 48))  # 4'×8' sheets
print(f"\nPLYWOOD DECK (form base):")
print(f"  3/4\" Exterior plywood: {deck_sheets} sheet(s) (4'×8')")
print(f"  (Coverage: {COUNTER_LENGTH}\" × {COUNTER_DEPTH}\")")

# Shear panels
panel_area = 2 * (COUNTER_DEPTH * panel_height)
panel_sheets = math.ceil(panel_area / (96 * 48))
print(f"\nSHEAR PANELS (anti-racking):")
print(f"  1/2\" Exterior plywood: {panel_sheets} sheet(s) (4'×8')")
print(f"  (2 end panels @ {COUNTER_DEPTH}\" × {panel_height:.1f}\")")

# Hardware
print(f"\nHARDWARE:")
print(f"  1/2\" × 6\" Through-bolts for ledger: 6-8 (into 6×6 posts)")
print(f"  3\" Deck screws for base frame: ~{num_longitudinal * 10 + num_cross * 10}")
print(f"  2-1/2\" Framing screws for wall assembly: ~{total_studs * 4}")
print(f"  Joist hangers (2×6): {num_joists * 2} (both ends)")
print(f"  1-1/4\" Exterior screws for plywood deck: ~100")
print(f"  2-1/2\" Exterior screws for shear panels: ~50")
print(f"  1-5/8\" Screws for wall sheathing: ~{wall_sheathing_sheets * 50}")

# Foundation
print(f"\nFOUNDATION:")
print(f"  Leveling base: Crushed rock or sand (2-3 cubic feet)")
print(f"  Landscape fabric: {COUNTER_LENGTH}\" × {COUNTER_DEPTH}\" (optional)")
print(f"  Note: Deck base sits directly on prepared, level ground")

# Cabinet/door notes
bay_width = COUNTER_LENGTH / NUM_BAYS
print(f"\n{'='*60}")
print(f"CABINET CONFIGURATION")
print(f"{'='*60}")
print(f"\nBay layout: {NUM_BAYS} bays @ {bay_width:.1f}\" each")
print(f"Suggested door size: {bay_width - 2:.1f}\" wide (1\" clearance each side)")
print(f"Door opening height: {panel_height - 4:.1f}\" (2\" top/bottom rail)")
print(f"\nFace frame material (not included in model):")
print(f"  1×4 Cedar/HDPE: ~{math.ceil((COUNTER_LENGTH + panel_height * (NUM_BAYS + 1)) / 12)}' linear")

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
print(f"4. Build two midsection support walls:")
print(f"   - Wall 1 at {WALL_1_POSITION:.0f}\" from left end")
print(f"   - Wall 2 at {WALL_2_POSITION:.0f}\" from left end")
print(f"   - Frame with 2×4 plates and studs @ {WALL_STUD_SPACING}\" OC")
print(f"   - Sheath with 1/2\" plywood, stand and brace plumb")
print(f"5. Install doubled 2×8 front beam on wall tops:")
print(f"   - Check level with ledger")
print(f"   - Secure to wall top plates")
print(f"6. Install joist hangers and hang 2×6 joists:")
print(f"   - {JOIST_SPACING}\" on center, {num_joists} total")
print(f"7. Screw down 3/4\" plywood deck")
print(f"8. Install 1/2\" plywood shear panels on ends")
print(f"9. Build concrete edge forms on deck")
print(f"10. Pour and finish concrete countertop")
print(f"\n{'='*60}\n")
