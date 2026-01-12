"""Opus's Outdoor Counter Cabinet Frame — 2x6-Only Construction

A frame-only version of the outdoor counter cabinet using exclusively 2x6 lumber.
Designed for the structural frame build - finish work (plywood, doors) to be added later.

This is a simplified build that can be constructed with a single lumber size,
making it ideal for quick procurement and efficient construction.

Design specifications:
- 12' (144") length along fence line
- 18" depth (front to back)
- 36" finished counter height
- ALL FRAMING USES 2x6 LUMBER ONLY
- Back ledger bolted to 6×6 fence posts (2x6)
- Front beam (double 2×6) supported by five framed walls
- Deck-style base frame of pressure treated 2×6 boards for level platform
- 2×6 joists at 12" on center spanning front to back
- 5 support wall frames: 2 outer (at cabinet ends) + 3 internal (at bay divisions)
- Frame only - no plywood deck, no sheathing, no doors

Based on the "ladder frame" concept:
- Back ledger = one long rail (2x6)
- Front beam = other long rail (double 2x6)
- Joists = rungs every 12" (2x6)
- Support wall frames at bay boundaries (2x6 studs)

TODO: Keep this frame design in sync with the full opus_outdoor_counter_cabinet design.
      When updating either design, consider updating the other.
"""

import cadquery as cq
import math

# ===== DESIGN PARAMETERS =====

# Overall dimensions
COUNTER_LENGTH = 144  # 12 feet in inches
COUNTER_DEPTH = 18    # 18" front to back
COUNTER_HEIGHT = 36   # 36" finished counter height

# ALL LUMBER IS 2x6 (actual dimensions: 1.5" x 5.5")
LUMBER_THICKNESS = 1.5  # 2x6 actual thickness
LUMBER_WIDTH = 5.5      # 2x6 actual width

# Rear ledger (bolted to 6×6 fence posts) - 2x6 on edge
LEDGER_WIDTH = LUMBER_WIDTH     # 5.5" (on edge for strength)
LEDGER_THICKNESS = LUMBER_THICKNESS  # 1.5"

# Front beam (double 2×6) - on edge
FRONT_BEAM_WIDTH = LUMBER_WIDTH      # 5.5" (on edge)
FRONT_BEAM_THICKNESS = 3.0           # Double 2×6 = 2 × 1.5"

# Wall supports - 2x6 framing
WALL_STUD_SIZE = LUMBER_WIDTH        # 5.5" (2x6)
WALL_STUD_THICKNESS = LUMBER_THICKNESS  # 1.5"
WALL_STUD_SPACING = 16               # 16" on center for studs

# Deck-style base frame (pressure treated platform) - 2x6
BASE_BOARD_WIDTH = LUMBER_WIDTH      # 5.5"
BASE_BOARD_THICKNESS = LUMBER_THICKNESS  # 1.5"
BASE_BOARD_SPACING = 16              # 16" on center

# Joists (2×6 on edge, spanning front to back)
JOIST_WIDTH = LUMBER_THICKNESS    # 1.5" (2×6 thickness)
JOIST_HEIGHT = LUMBER_WIDTH       # 5.5" (on edge for strength)
JOIST_SPACING = 12                # 12" on center

# 6×6 fence posts (for reference - not modeled)
FENCE_POST_SIZE = 5.5  # 6×6 actual dimension

# Cabinet bay configuration
NUM_BAYS = 4  # 4 bays of 36" each
NUM_INTERNAL_WALLS = 3  # Three internal support walls (between bays)

# Wall positions (placed at bay boundaries)
BAY_WIDTH = COUNTER_LENGTH / NUM_BAYS  # 36" per bay
WALL_POSITIONS = [
    BAY_WIDTH,      # Wall 1 at 36" from left
    2 * BAY_WIDTH,  # Wall 2 at 72" from left
    3 * BAY_WIDTH,  # Wall 3 at 108" from left
]

# Air gap from fence
FENCE_GAP = 3  # 3" gap from fence boards

print(f"\n{'='*60}")
print(f"OPUS'S OUTDOOR COUNTER CABINET FRAME — 2x6 ONLY")
print(f"{'='*60}")
print(f"\nDimensions: {COUNTER_LENGTH}\" × {COUNTER_DEPTH}\" ({COUNTER_LENGTH/12:.1f}' × {COUNTER_DEPTH/12:.1f}')")
print(f"Finished counter height: {COUNTER_HEIGHT}\"")
print(f"Bay configuration: {NUM_BAYS} bays @ {BAY_WIDTH:.1f}\" each")
print(f"Support walls: {NUM_INTERNAL_WALLS} internal + 2 outer (framed ends)")
print(f"\n*** ALL FRAMING USES 2x6 LUMBER (1.5\" × 5.5\" actual) ***")

# ===== CALCULATE COMPONENT HEIGHTS =====

# Work backwards from finished counter height
# For frame-only: top of joists = counter height minus deck/countertop allowance
# Allow 2.25" for future deck (0.75") and concrete (1.5")
DECK_ALLOWANCE = 2.25

# Top of joists
joist_top = COUNTER_HEIGHT - DECK_ALLOWANCE
joist_bottom = joist_top - JOIST_HEIGHT

# Ledger and front beam at joist level
ledger_top = joist_top
ledger_bottom = ledger_top - LEDGER_WIDTH

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
print(f"  (Allowance for deck/countertop: {DECK_ALLOWANCE}\")")

# ===== BUILD THE 3D MODEL =====

# Coordinate system:
# X = along counter length (left to right)
# Y = depth (back at fence = negative, front = positive)
# Z = height (ground = 0, up = positive)

# 1. REAR LEDGER (2×6 on edge, bolted to fence posts)
ledger = (
    cq.Workplane("XY")
    .box(COUNTER_LENGTH, LEDGER_THICKNESS, LEDGER_WIDTH)
    .translate((0, -COUNTER_DEPTH/2 + LEDGER_THICKNESS/2, ledger_bottom + LEDGER_WIDTH/2))
)

# 2. FRONT BEAM (double 2×6 on edge)
front_beam = (
    cq.Workplane("XY")
    .box(COUNTER_LENGTH, FRONT_BEAM_THICKNESS, FRONT_BEAM_WIDTH)
    .translate((0, COUNTER_DEPTH/2 - FRONT_BEAM_THICKNESS/2, front_beam_bottom + FRONT_BEAM_WIDTH/2))
)

# 3. DECK-STYLE BASE FRAME (pressure treated 2×6 platform grid)

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

# 4. WALL SUPPORT FRAMES (2x6 studs - no sheathing for frame-only version)

def create_wall_frame(x_position):
    """Create a wall frame with 2×6 studs (no sheathing)"""

    # Bottom plate (2×6 flat on base)
    bottom_plate = (
        cq.Workplane("XY")
        .box(WALL_STUD_THICKNESS, COUNTER_DEPTH, WALL_STUD_SIZE)
        .translate((x_position, 0, base_height + WALL_STUD_SIZE/2))
    )

    # Top plate (2×6 flat under front beam)
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

    return bottom_plate.union(top_plate).union(studs)

# Create internal wall frames at bay boundaries
internal_walls = None
for wall_pos in WALL_POSITIONS:
    wall_x = -COUNTER_LENGTH/2 + wall_pos
    wall = create_wall_frame(wall_x)
    if internal_walls is None:
        internal_walls = wall
    else:
        internal_walls = internal_walls.union(wall)

# 5. JOISTS (2×6 on edge at 12" OC)
joists = cq.Workplane("XY")
num_joists = int(COUNTER_LENGTH / JOIST_SPACING) + 1

# Joist length: from back of ledger to front of front beam
joist_length = COUNTER_DEPTH - LEDGER_THICKNESS - FRONT_BEAM_THICKNESS

for i in range(num_joists):
    joist_x = -COUNTER_LENGTH/2 + i * JOIST_SPACING

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

# 6. OUTER WALL FRAMES (at cabinet ends)

def create_outer_wall_frame(x_position):
    """Create an outer wall frame with 2×6 studs (no sheathing)"""

    # Bottom plate (2×6 flat on base)
    bottom_plate = (
        cq.Workplane("XY")
        .box(WALL_STUD_THICKNESS, COUNTER_DEPTH, WALL_STUD_SIZE)
        .translate((x_position, 0, base_height + WALL_STUD_SIZE/2))
    )

    # Top plate (2×6 flat under front beam)
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

        stud_height = wall_height - base_height - 2 * WALL_STUD_SIZE
        stud = (
            cq.Workplane("XY")
            .box(WALL_STUD_SIZE, WALL_STUD_THICKNESS, stud_height)
            .translate((x_position, stud_y, base_height + WALL_STUD_SIZE + stud_height/2))
        )

        if i == 0:
            studs = stud
        else:
            studs = studs.union(stud)

    return bottom_plate.union(top_plate).union(studs)

# Left outer wall frame
left_outer_wall = create_outer_wall_frame(-COUNTER_LENGTH/2 + WALL_STUD_THICKNESS/2)

# Right outer wall frame
right_outer_wall = create_outer_wall_frame(COUNTER_LENGTH/2 - WALL_STUD_THICKNESS/2)

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

# ===== 2x6 MATERIALS CUT LIST =====

print(f"\n{'='*60}")
print(f"2x6 MATERIALS CUT LIST — FRAME ONLY")
print(f"{'='*60}")
print(f"\n*** ALL PIECES ARE 2x6 PRESSURE-TREATED LUMBER ***")
print(f"*** Actual dimensions: 1.5\" thick × 5.5\" wide ***")

# Ledger
print(f"\n1. REAR LEDGER (bolted to 6×6 fence posts):")
print(f"   Qty: 1")
print(f"   Length: {COUNTER_LENGTH}\" ({COUNTER_LENGTH/12:.0f}')")
print(f"   Orientation: On edge (5.5\" vertical)")
print(f"   Note: Pre-drill for lag bolts into fence posts")

# Front beam
print(f"\n2. FRONT BEAM (doubled):")
print(f"   Qty: 2")
print(f"   Length: {COUNTER_LENGTH}\" ({COUNTER_LENGTH/12:.0f}') each")
print(f"   Orientation: On edge (5.5\" vertical), laminated together")
print(f"   Note: Glue and screw together for 3\" total thickness")

# Deck-style base frame
longitudinal_length = COUNTER_LENGTH
cross_length = COUNTER_DEPTH
total_base_linear_inches = num_longitudinal * longitudinal_length + num_cross * cross_length

print(f"\n3. BASE FRAME GRID:")
print(f"   3a. Longitudinal boards (parallel to length):")
print(f"       Qty: {num_longitudinal}")
print(f"       Length: {longitudinal_length}\" ({longitudinal_length/12:.0f}') each")
print(f"       Orientation: Flat (5.5\" horizontal)")
print(f"")
print(f"   3b. Cross boards (perpendicular to length):")
print(f"       Qty: {num_cross}")
print(f"       Length: {cross_length}\" ({math.ceil(cross_length)}\" = 1.5') each")
print(f"       Orientation: Flat (5.5\" horizontal)")
print(f"")
print(f"   Spacing: {BASE_BOARD_SPACING}\" on center both directions")

# Wall frames
NUM_TOTAL_WALLS = NUM_INTERNAL_WALLS + 2
studs_per_wall = int(COUNTER_DEPTH / WALL_STUD_SPACING) + 1
wall_stud_length = wall_height - base_height - 2 * WALL_STUD_SIZE
total_studs = studs_per_wall * NUM_TOTAL_WALLS
plate_length = COUNTER_DEPTH

print(f"\n4. WALL FRAMES ({NUM_TOTAL_WALLS} total: 2 outer + {NUM_INTERNAL_WALLS} internal):")
print(f"   4a. Top & Bottom plates:")
print(f"       Qty: {NUM_TOTAL_WALLS * 2} (2 per wall)")
print(f"       Length: {plate_length}\" ({math.ceil(plate_length)}\" = 1.5') each")
print(f"       Orientation: Flat (5.5\" horizontal)")
print(f"")
print(f"   4b. Vertical studs:")
print(f"       Qty: {total_studs} ({studs_per_wall} per wall)")
print(f"       Length: {wall_stud_length:.1f}\" ({wall_stud_length/12:.2f}') each")
print(f"       Orientation: On edge (5.5\" in wall plane)")
print(f"       Spacing: {WALL_STUD_SPACING}\" on center")
print(f"")
print(f"   Wall positions from left end:")
print(f"       - Left outer: 0\"")
print(f"       - Internal 1: {BAY_WIDTH:.0f}\"")
print(f"       - Internal 2: {2*BAY_WIDTH:.0f}\"")
print(f"       - Internal 3: {3*BAY_WIDTH:.0f}\"")
print(f"       - Right outer: {COUNTER_LENGTH:.0f}\"")

# Joists
print(f"\n5. JOISTS:")
print(f"   Qty: {num_joists}")
print(f"   Length: {joist_length:.1f}\" (cut from 2' stock)")
print(f"   Orientation: On edge (5.5\" vertical)")
print(f"   Spacing: {JOIST_SPACING}\" on center")
print(f"   Note: Use joist hangers at ledger and front beam")

# ===== TOTAL LUMBER SUMMARY =====

print(f"\n{'='*60}")
print(f"LUMBER PURCHASE SUMMARY — 2x6 ONLY")
print(f"{'='*60}")

# Calculate total linear feet needed
ledger_lf = COUNTER_LENGTH / 12
front_beam_lf = 2 * COUNTER_LENGTH / 12
base_longitudinal_lf = num_longitudinal * longitudinal_length / 12
base_cross_lf = num_cross * cross_length / 12
wall_plates_lf = NUM_TOTAL_WALLS * 2 * plate_length / 12
wall_studs_lf = total_studs * wall_stud_length / 12
joists_lf = num_joists * joist_length / 12

total_lf = (ledger_lf + front_beam_lf + base_longitudinal_lf +
            base_cross_lf + wall_plates_lf + wall_studs_lf + joists_lf)

print(f"\nLinear feet breakdown:")
print(f"  Ledger:           {ledger_lf:6.1f} ft")
print(f"  Front beam:       {front_beam_lf:6.1f} ft")
print(f"  Base longitudinal:{base_longitudinal_lf:6.1f} ft")
print(f"  Base cross:       {base_cross_lf:6.1f} ft")
print(f"  Wall plates:      {wall_plates_lf:6.1f} ft")
print(f"  Wall studs:       {wall_studs_lf:6.1f} ft")
print(f"  Joists:           {joists_lf:6.1f} ft")
print(f"  --------------------------")
print(f"  TOTAL:            {total_lf:6.1f} ft")

# Recommend board counts by length (with 10% waste factor)
waste_factor = 1.10
adjusted_lf = total_lf * waste_factor

print(f"\n  With 10% waste:   {adjusted_lf:6.1f} ft")

# Board recommendations
print(f"\nSUGGESTED BOARD PURCHASE:")
print(f"  12' boards (for ledger, front beam, base longitudinals):")
num_12ft = math.ceil((ledger_lf + front_beam_lf + base_longitudinal_lf) / 12)
print(f"     {num_12ft} boards")
print(f"")
print(f"  8' boards (for joists, wall studs, plates):")
remaining_lf = base_cross_lf + wall_plates_lf + wall_studs_lf + joists_lf
num_8ft = math.ceil(remaining_lf * waste_factor / 8)
print(f"     {num_8ft} boards")
print(f"")
print(f"  OR order as:")
print(f"     {math.ceil(adjusted_lf / 12)} × 12-foot 2x6 boards")
print(f"     (allows flexibility in cutting)")

# Hardware
print(f"\n{'='*60}")
print(f"HARDWARE LIST")
print(f"{'='*60}")
print(f"\n  1/2\" × 6\" Lag bolts (ledger to posts): 6-8")
print(f"  3\" Deck screws (base frame): ~{num_longitudinal * 10 + num_cross * 10}")
print(f"  3\" Framing screws (wall assembly): ~{total_studs * 4}")
print(f"  Joist hangers (2×6): {num_joists * 2} (both ends)")
print(f"  1-1/2\" Joist hanger nails: ~{num_joists * 2 * 10}")
print(f"  Construction adhesive: 2 tubes (for doubled front beam)")

# Foundation
print(f"\n{'='*60}")
print(f"SITE PREPARATION")
print(f"{'='*60}")
print(f"\n  Clear area: {COUNTER_LENGTH}\" × {COUNTER_DEPTH}\" ({COUNTER_LENGTH/12:.0f}' × {COUNTER_DEPTH/12:.1f}')")
print(f"  Leveling base: 2-3\" crushed rock or sand")
print(f"  Landscape fabric: {COUNTER_LENGTH}\" × {COUNTER_DEPTH}\" (optional)")

# Assembly sequence
print(f"\n{'='*60}")
print(f"ASSEMBLY SEQUENCE — FRAME BUILD")
print(f"{'='*60}")
print(f"""
1. SITE PREP
   - Clear and level {COUNTER_LENGTH}\" × {COUNTER_DEPTH}\" area
   - Add 2-3\" crushed rock/sand, compact and level
   - Optional: lay landscape fabric

2. BUILD BASE FRAME GRID
   - Lay {num_longitudinal} longitudinal 2×6 boards @ {BASE_BOARD_SPACING}\" OC
   - Lay {num_cross} cross 2×6 boards @ {BASE_BOARD_SPACING}\" OC
   - Screw together at intersections (2 screws per joint)
   - Verify level in all directions

3. INSTALL REAR LEDGER
   - Cut 2×6 to {COUNTER_LENGTH}\"
   - Position on fence posts with top at {ledger_top:.1f}\" from base
   - Pre-drill and lag bolt to each 6×6 post

4. BUILD WALL FRAMES (build flat, then stand up)
   - For each of {NUM_TOTAL_WALLS} walls:
     a. Cut 2 plates @ {plate_length}\" each
     b. Cut {studs_per_wall} studs @ {wall_stud_length:.1f}\" each
     c. Lay plates parallel, {wall_stud_length:.1f}\" apart
     d. Install studs @ {WALL_STUD_SPACING}\" OC between plates
     e. Stand wall up and brace plumb

5. POSITION WALL FRAMES
   - Left outer wall at 0\" (cabinet left end)
   - Internal wall 1 at {BAY_WIDTH:.0f}\"
   - Internal wall 2 at {2*BAY_WIDTH:.0f}\"
   - Internal wall 3 at {3*BAY_WIDTH:.0f}\"
   - Right outer wall at {COUNTER_LENGTH:.0f}\" (cabinet right end)
   - Screw bottom plates to base frame

6. INSTALL FRONT BEAM
   - Glue and screw two 2×6 × {COUNTER_LENGTH}\" boards together
   - Set on top of wall frames
   - Verify level with rear ledger
   - Secure to wall top plates

7. INSTALL JOISTS
   - Mount joist hangers on ledger and front beam @ {JOIST_SPACING}\" OC
   - Cut {num_joists} joists @ {joist_length:.1f}\" each
   - Install joists in hangers

8. VERIFY AND BRACE
   - Check all walls for plumb
   - Check top surface for level
   - Add temporary diagonal bracing if needed
   - Frame is ready for deck/finish work
""")

print(f"\n{'='*60}")
print(f"FUTURE FINISH WORK (not included in this build)")
print(f"{'='*60}")
print(f"""
- 3/4\" plywood deck on top of joists
- 1/2\" plywood sheathing on wall frames
- Cabinet doors (4 bays × 2 doors = 8 doors)
- Concrete countertop forms and pour
- Door hardware (hinges, catches, pulls)
""")

print(f"\n{'='*60}\n")
