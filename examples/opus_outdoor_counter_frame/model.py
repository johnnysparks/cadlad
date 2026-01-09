"""Opus's Outdoor Counter Frame — Construction-Ready CAD Model

A fence-mounted outdoor counter/cabinet frame for a concrete countertop pour.
Perfect for outdoor kitchens, BBQ stations, or potting benches.

Design specifications:
- 12' (144") length along fence line
- 18" depth (front to back)
- 36" finished counter height
- Back ledger bolted to 6×6 fence posts
- Front beam (double 2×8) supported by midsection walls
- Two 2×4 stud walls at 1/3 and 2/3 points for support
- Deck-style base frame of 2×6 pressure treated boards for level platform
- 2×6 joists at 12" on center spanning front to back
- 3/4" plywood deck for concrete form base
- 1/2" plywood shear panels on ends for anti-racking
- 3 equal bays (~48" each) for cabinet doors

Based on the "ladder frame" concept:
- Deck-style base frame = level foundation platform
- Two stud walls = primary vertical support
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

# Midsection support walls (2×4 stud walls)
STUD_WIDTH = 3.5      # 2×4 actual width
STUD_THICKNESS = 1.5  # 2×4 actual thickness
NUM_SUPPORT_WALLS = 2  # Two walls at 1/3 and 2/3 points
STUDS_PER_WALL = 3    # Top plate, bottom plate, and studs

# Base frame (deck-style, 2×6 pressure treated)
BASE_JOIST_WIDTH = 1.5    # 2×6 actual thickness
BASE_JOIST_HEIGHT = 5.5   # 2×6 actual width (on edge)
BASE_JOIST_SPACING = 24   # 24" on center for base frame

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
NUM_BAYS = 3  # 3 bays of ~48" each (divided by 2 support walls)

# Air gap from fence
FENCE_GAP = 3  # 3" gap from fence boards

print(f"\n{'='*60}")
print(f"OPUS'S OUTDOOR COUNTER FRAME — 12' × 18\"")
print(f"{'='*60}")
print(f"\nDimensions: {COUNTER_LENGTH}\" × {COUNTER_DEPTH}\" ({COUNTER_LENGTH/12:.1f}' × {COUNTER_DEPTH/12:.1f}')")
print(f"Finished counter height: {COUNTER_HEIGHT}\"")
print(f"Bay configuration: {NUM_BAYS} bays @ {COUNTER_LENGTH/NUM_BAYS:.1f}\" each")
print(f"Support structure: {NUM_SUPPORT_WALLS} midsection stud walls + deck-style base frame")

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

# Base frame sits on ground (or pavers)
base_frame_bottom = 0
base_frame_top = base_frame_bottom + BASE_JOIST_HEIGHT

# Support walls go from top of base frame to bottom of front beam
wall_bottom = base_frame_top
wall_top = front_beam_bottom
wall_height = wall_top - wall_bottom

print(f"\nSTRUCTURE (bottom to top):")
print(f"  Base frame: {base_frame_bottom:.2f}\" - {base_frame_top:.2f}\"")
print(f"  Support walls: {wall_bottom:.2f}\" - {wall_top:.2f}\" (height: {wall_height:.2f}\")")
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

# 3. BASE FRAME (deck-style, 2×6 pressure treated boards)
# Creates a level platform for the entire structure

# Front rim joist (full length at front)
front_rim = (
    cq.Workplane("XY")
    .box(COUNTER_LENGTH, BASE_JOIST_WIDTH, BASE_JOIST_HEIGHT)
    .translate((0, COUNTER_DEPTH/2 - BASE_JOIST_WIDTH/2, base_frame_top - BASE_JOIST_HEIGHT/2))
)

# Back rim joist (full length at back)
back_rim = (
    cq.Workplane("XY")
    .box(COUNTER_LENGTH, BASE_JOIST_WIDTH, BASE_JOIST_HEIGHT)
    .translate((0, -COUNTER_DEPTH/2 + BASE_JOIST_WIDTH/2, base_frame_top - BASE_JOIST_HEIGHT/2))
)

# Left end joist
left_end = (
    cq.Workplane("XY")
    .box(BASE_JOIST_WIDTH, COUNTER_DEPTH - 2*BASE_JOIST_WIDTH, BASE_JOIST_HEIGHT)
    .translate((-COUNTER_LENGTH/2 + BASE_JOIST_WIDTH/2, 0, base_frame_top - BASE_JOIST_HEIGHT/2))
)

# Right end joist
right_end = (
    cq.Workplane("XY")
    .box(BASE_JOIST_WIDTH, COUNTER_DEPTH - 2*BASE_JOIST_WIDTH, BASE_JOIST_HEIGHT)
    .translate((COUNTER_LENGTH/2 - BASE_JOIST_WIDTH/2, 0, base_frame_top - BASE_JOIST_HEIGHT/2))
)

# Interior base joists (running front to back)
base_joists = cq.Workplane("XY")
num_base_joists = int((COUNTER_LENGTH - 2*BASE_JOIST_WIDTH) / BASE_JOIST_SPACING)
base_joist_length = COUNTER_DEPTH - 2*BASE_JOIST_WIDTH

for i in range(1, num_base_joists + 1):
    base_joist_x = -COUNTER_LENGTH/2 + BASE_JOIST_WIDTH + i * BASE_JOIST_SPACING
    if base_joist_x >= COUNTER_LENGTH/2 - BASE_JOIST_WIDTH:
        break

    base_joist = (
        cq.Workplane("XY")
        .box(BASE_JOIST_WIDTH, base_joist_length, BASE_JOIST_HEIGHT)
        .translate((base_joist_x, 0, base_frame_top - BASE_JOIST_HEIGHT/2))
    )

    if i == 1:
        base_joists = base_joist
    else:
        base_joists = base_joists.union(base_joist)

base_frame = front_rim.union(back_rim).union(left_end).union(right_end).union(base_joists)

# 4. MIDSECTION SUPPORT WALLS (2×4 stud walls)
# Two walls at 1/3 and 2/3 points for support
support_walls = cq.Workplane("XY")
wall_positions = []

# Wall depth runs from front beam to back ledger area
wall_depth = COUNTER_DEPTH - FRONT_BEAM_THICKNESS - LEDGER_THICKNESS

for i in range(NUM_SUPPORT_WALLS):
    # Position walls at 1/3 and 2/3 points (dividing into 3 bays)
    wall_x = -COUNTER_LENGTH/2 + (i + 1) * (COUNTER_LENGTH / (NUM_SUPPORT_WALLS + 1))
    wall_positions.append(wall_x)

    # Bottom plate (horizontal 2×4 on the base frame)
    bottom_plate = (
        cq.Workplane("XY")
        .box(STUD_THICKNESS, wall_depth, STUD_WIDTH)
        .translate((wall_x, 0, wall_bottom + STUD_WIDTH/2))
    )

    # Top plate (horizontal 2×4 under the front beam)
    top_plate = (
        cq.Workplane("XY")
        .box(STUD_THICKNESS, wall_depth, STUD_WIDTH)
        .translate((wall_x, 0, wall_top - STUD_WIDTH/2))
    )

    # Vertical studs (3 studs: front, middle, back)
    stud_height = wall_height - 2 * STUD_WIDTH  # Between plates
    stud_positions_y = [
        -wall_depth/2 + STUD_WIDTH/2,   # Back stud
        0,                                # Middle stud
        wall_depth/2 - STUD_WIDTH/2      # Front stud
    ]

    studs = cq.Workplane("XY")
    for j, stud_y in enumerate(stud_positions_y):
        stud = (
            cq.Workplane("XY")
            .box(STUD_THICKNESS, STUD_WIDTH, stud_height)
            .translate((wall_x, stud_y, wall_bottom + STUD_WIDTH + stud_height/2))
        )
        if j == 0:
            studs = stud
        else:
            studs = studs.union(stud)

    wall = bottom_plate.union(top_plate).union(studs)

    if i == 0:
        support_walls = wall
    else:
        support_walls = support_walls.union(wall)

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
# Left end panel - now from top of base frame to bottom of deck
panel_height = deck_bottom - base_frame_top  # From top of base frame to bottom of deck
left_panel = (
    cq.Workplane("XY")
    .box(PANEL_THICKNESS, COUNTER_DEPTH, panel_height)
    .translate((-COUNTER_LENGTH/2 + PANEL_THICKNESS/2, 0, base_frame_top + panel_height/2))
)

# Right end panel
right_panel = (
    cq.Workplane("XY")
    .box(PANEL_THICKNESS, COUNTER_DEPTH, panel_height)
    .translate((COUNTER_LENGTH/2 - PANEL_THICKNESS/2, 0, base_frame_top + panel_height/2))
)

shear_panels = left_panel.union(right_panel)

# 8. COMBINE ALL COMPONENTS
result = (
    ledger
    .union(front_beam)
    .union(base_frame)
    .union(support_walls)
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

# Base frame
base_frame_perimeter_length = 2 * COUNTER_LENGTH + 2 * (COUNTER_DEPTH - 2 * BASE_JOIST_WIDTH)
actual_base_joists = sum(1 for i in range(1, num_base_joists + 1)
                        if -COUNTER_LENGTH/2 + BASE_JOIST_WIDTH + i * BASE_JOIST_SPACING < COUNTER_LENGTH/2 - BASE_JOIST_WIDTH)
print(f"\nBASE FRAME (deck-style foundation):")
print(f"  2×6 Pressure-treated rim joists: 2 @ {COUNTER_LENGTH/12:.0f}' (front & back)")
print(f"  2×6 Pressure-treated end joists: 2 @ {(COUNTER_DEPTH - 2*BASE_JOIST_WIDTH)/12:.1f}' (left & right)")
print(f"  2×6 Pressure-treated interior joists: {actual_base_joists} @ {base_joist_length/12:.1f}' (cut to {base_joist_length:.1f}\")")
print(f"  (Interior joist spacing: {BASE_JOIST_SPACING}\" on center)")

# Support walls
stud_height = wall_height - 2 * STUD_WIDTH
studs_per_wall = 3  # Front, middle, back
total_wall_studs = NUM_SUPPORT_WALLS * studs_per_wall
total_wall_plates = NUM_SUPPORT_WALLS * 2  # Top and bottom plate per wall
print(f"\nSUPPORT WALLS ({NUM_SUPPORT_WALLS} stud walls):")
print(f"  2×4 Pressure-treated plates: {total_wall_plates} @ {wall_depth/12:.1f}' (cut to {wall_depth:.1f}\")")
print(f"  2×4 Pressure-treated studs: {total_wall_studs} @ {stud_height/12:.1f}' (cut to {stud_height:.1f}\")")
print(f"  (Wall positions: 48\" and 96\" from left end)")

# Joists
print(f"\nUPPER JOISTS:")
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
print(f"  3\" Structural screws for base frame: ~50")
print(f"  3\" Structural screws for support walls: ~30")
print(f"  Simpson A35 framing angles: {NUM_SUPPORT_WALLS * 4} (wall to base & beam)")
print(f"  Joist hangers (2×6): {num_joists * 2} (both ends)")
print(f"  1-1/4\" Exterior screws for plywood: ~100")
print(f"  2-1/2\" Exterior screws for shear panels: ~50")

# Foundation
print(f"\nFOUNDATION:")
print(f"  Concrete pavers (16\"×16\"): 8-10 (under base frame corners & midpoints)")
print(f"  Crushed rock for leveling: 2-3 bags")
print(f"  Landscape fabric: 1 roll (under base frame)")

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
print(f"\nRecommended control joint locations:")
print(f"  At support wall positions (~48\" and ~96\" from left end)")
print(f"  Aligns with midsection support walls")
print(f"\nSlab thickness: 1.5\" - 2\" (with fiber mesh)")
print(f"Edge forms: Build up from plywood deck using melamine strips")
print(f"Overhang: 1\" - 1.5\" front and sides")

print(f"\n{'='*60}")
print(f"ASSEMBLY SEQUENCE")
print(f"{'='*60}")
print(f"1. Prepare ground: level area, lay landscape fabric")
print(f"2. Place concrete pavers at corners and support points")
print(f"3. Build and level deck-style base frame on pavers")
print(f"   - Assemble 2×6 perimeter (front/back rim + end joists)")
print(f"   - Install interior joists at {BASE_JOIST_SPACING}\" on center")
print(f"   - Use string line to ensure frame is level")
print(f"4. Build {NUM_SUPPORT_WALLS} support walls (2×4 stud walls)")
print(f"   - Each wall: bottom plate + top plate + 3 studs")
print(f"   - Wall height: {wall_height:.1f}\" (from base frame to beam)")
print(f"5. Stand support walls on base frame at 48\" and 96\" marks")
print(f"   - Secure with framing angles to base frame")
print(f"   - Plumb and brace temporarily")
print(f"6. Cut and bolt 2×8 ledger to 6×6 fence posts")
print(f"   - Ledger top at {ledger_top:.1f}\" from ground")
print(f"7. Install doubled 2×8 front beam on support walls")
print(f"   - Secure with framing angles")
print(f"   - Check level with ledger")
print(f"8. Install joist hangers and hang 2×6 joists")
print(f"   - {JOIST_SPACING}\" on center, {num_joists} total")
print(f"9. Screw down 3/4\" plywood deck")
print(f"10. Install 1/2\" plywood shear panels on ends")
print(f"11. Build concrete edge forms on deck")
print(f"12. Pour and finish concrete countertop")
print(f"\n{'='*60}\n")
