"""Outdoor Countertop with Concrete Surface and Cabinet Base

A 12' long outdoor countertop structure designed for a concrete pour-in-place surface
with integrated cabinet storage below. Features a ledger bolted to existing 6×6 fence
posts at the rear, a front beam on adjustable legs with pad footings, and a complete
structural deck for forming the concrete countertop.

Design specifications:
- 12' (144") length × 18" depth
- Rear ledger (2×8) bolted to 6×6 fence posts
- Front beam (double 2×8) on 4×4 legs with pad footings
- 2×6 joists at 12" OC spanning front-to-back
- ¾" plywood deck for concrete form
- Anti-racking shear panels at ends
- 36" finished counter height (typical)
- 4 cabinet bays with face frame and dividers
- 3" air gap between structure and fence boards
"""

import cadquery as cq
import math

# ===== DESIGN PARAMETERS =====

# Overall dimensions
STRUCTURE_LENGTH = 144  # 12 feet
STRUCTURE_DEPTH = 18    # Front to back depth

# Heights
FINISHED_COUNTER_HEIGHT = 36  # Standard counter height
CONCRETE_THICKNESS = 2        # Concrete slab thickness
DECK_THICKNESS = 0.75         # Plywood deck thickness
JOIST_HEIGHT = 5.5            # 2×6 on edge

# Calculate rear ledger height (this is where everything hangs from)
REAR_LEDGER_TOP = FINISHED_COUNTER_HEIGHT - CONCRETE_THICKNESS - DECK_THICKNESS
REAR_LEDGER_BOTTOM = REAR_LEDGER_TOP - 7.25  # 2×8 actual height

# Rear ledger/beam (bolted to 6×6 posts)
REAR_LEDGER_WIDTH = 1.5   # 2×8 actual width
REAR_LEDGER_HEIGHT = 7.25 # 2×8 actual height

# Front beam (double 2×8 for stiffness)
FRONT_BEAM_WIDTH = 3.0    # Double 2×8 (1.5" × 2)
FRONT_BEAM_HEIGHT = 7.25  # 2×8 actual height
FRONT_BEAM_TOP = REAR_LEDGER_TOP  # Level with rear ledger

# Front legs (4×4 posts on pads)
FRONT_LEG_SIZE = 3.5      # 4×4 actual size
NUM_FRONT_LEGS = 5        # Both ends + every 24-32"
FRONT_LEG_HEIGHT = FRONT_BEAM_TOP - FRONT_BEAM_HEIGHT/2  # To bottom of beam

# Joists (2×6 spanning front to back)
JOIST_WIDTH = 1.5         # 2×6 actual width
JOIST_HEIGHT = 5.5        # 2×6 actual height
JOIST_SPACING = 12        # 12" on center

# Deck (plywood for concrete form)
DECK_PLYWOOD_THICKNESS = 0.75  # ¾" exterior plywood

# Shear panels (end panels for anti-racking)
SHEAR_PANEL_THICKNESS = 0.5  # ½" exterior plywood

# Cabinet details
NUM_BAYS = 4              # 4 cabinet openings
FACE_FRAME_WIDTH = 0.75   # 1x material for face frame
FACE_FRAME_DEPTH = 3.5    # Face frame depth

# Fence integration
FENCE_POST_SIZE = 5.5     # 6×6 actual size
FENCE_POST_HEIGHT = 96    # 8' posts
FENCE_POST_SPACING = 72   # 6' on center (2 posts for 12' structure)
AIR_GAP = 3               # 3" gap from fence boards

print(f"\n{'='*70}")
print(f"OUTDOOR COUNTERTOP — 12' × 18\" WITH CONCRETE SURFACE")
print(f"{'='*70}")
print(f"\nDimensions: {STRUCTURE_LENGTH}\" × {STRUCTURE_DEPTH}\" ({STRUCTURE_LENGTH/12:.1f}' × {STRUCTURE_DEPTH/12:.1f}')")
print(f"Finished counter height: {FINISHED_COUNTER_HEIGHT}\"")
print(f"Concrete thickness: {CONCRETE_THICKNESS}\"")

# ===== BUILD THE 3D MODEL =====

# Position reference: rear ledger is at Y=0 (back edge), front beam at Y=STRUCTURE_DEPTH

# 1. FENCE POSTS (6×6 posts for context - these are existing)
fence_posts = cq.Workplane("XY")
fence_post_positions = [-STRUCTURE_LENGTH/4, STRUCTURE_LENGTH/4]  # Two posts, spaced across length

for i, x_pos in enumerate(fence_post_positions):
    post = (
        cq.Workplane("XY")
        .box(FENCE_POST_SIZE, FENCE_POST_SIZE, FENCE_POST_HEIGHT)
        .translate((x_pos, -FENCE_POST_SIZE/2, FENCE_POST_HEIGHT/2))
    )
    if i == 0:
        fence_posts = post
    else:
        fence_posts = fence_posts.union(post)

# 2. REAR LEDGER (2×8 bolted to fence posts)
# Position: behind the fence posts with air gap
rear_ledger_y = -FENCE_POST_SIZE - AIR_GAP/2
rear_ledger_z = (REAR_LEDGER_TOP + REAR_LEDGER_BOTTOM) / 2

rear_ledger = (
    cq.Workplane("XY")
    .box(STRUCTURE_LENGTH, REAR_LEDGER_WIDTH, REAR_LEDGER_HEIGHT)
    .translate((0, rear_ledger_y, rear_ledger_z))
)

# 3. FRONT BEAM (double 2×8)
front_beam_y = STRUCTURE_DEPTH - FENCE_POST_SIZE - AIR_GAP
front_beam_z = FRONT_BEAM_TOP - FRONT_BEAM_HEIGHT/2

front_beam = (
    cq.Workplane("XY")
    .box(STRUCTURE_LENGTH, FRONT_BEAM_WIDTH, FRONT_BEAM_HEIGHT)
    .translate((0, front_beam_y, front_beam_z))
)

# 4. FRONT LEGS (4×4 posts on each support line)
front_legs = cq.Workplane("XY")
leg_spacing = STRUCTURE_LENGTH / (NUM_FRONT_LEGS - 1)

for i in range(NUM_FRONT_LEGS):
    leg_x = -STRUCTURE_LENGTH/2 + i * leg_spacing
    leg = (
        cq.Workplane("XY")
        .box(FRONT_LEG_SIZE, FRONT_LEG_SIZE, FRONT_LEG_HEIGHT)
        .translate((leg_x, front_beam_y, FRONT_LEG_HEIGHT/2))
    )
    if i == 0:
        front_legs = leg
    else:
        front_legs = front_legs.union(leg)

# 5. JOISTS (2×6 spanning front to back at 12" OC)
num_joists = int(STRUCTURE_LENGTH / JOIST_SPACING) + 1
joist_top_z = REAR_LEDGER_TOP
joist_z = joist_top_z - JOIST_HEIGHT/2
joist_span_length = front_beam_y - rear_ledger_y

joists = cq.Workplane("XY")
for i in range(num_joists):
    joist_x = -STRUCTURE_LENGTH/2 + i * JOIST_SPACING
    joist_y = (rear_ledger_y + front_beam_y) / 2

    joist = (
        cq.Workplane("XY")
        .box(JOIST_WIDTH, joist_span_length, JOIST_HEIGHT)
        .translate((joist_x, joist_y, joist_z))
    )

    if i == 0:
        joists = joist
    else:
        joists = joists.union(joist)

# 6. PLYWOOD DECK (¾" plywood on top of joists)
deck_z = joist_top_z + DECK_PLYWOOD_THICKNESS/2
deck_y = (rear_ledger_y + front_beam_y) / 2

deck = (
    cq.Workplane("XY")
    .box(STRUCTURE_LENGTH, joist_span_length, DECK_PLYWOOD_THICKNESS)
    .translate((0, deck_y, deck_z))
)

# 7. SHEAR PANELS (½" plywood at ends for anti-racking)
shear_panel_height = FRONT_LEG_HEIGHT + FRONT_BEAM_HEIGHT
shear_panel_z = shear_panel_height / 2

left_shear_panel = (
    cq.Workplane("YZ")
    .box(joist_span_length, shear_panel_height, SHEAR_PANEL_THICKNESS)
    .translate((-STRUCTURE_LENGTH/2 + SHEAR_PANEL_THICKNESS/2, deck_y, shear_panel_z))
)

right_shear_panel = (
    cq.Workplane("YZ")
    .box(joist_span_length, shear_panel_height, SHEAR_PANEL_THICKNESS)
    .translate((STRUCTURE_LENGTH/2 - SHEAR_PANEL_THICKNESS/2, deck_y, shear_panel_z))
)

shear_panels = left_shear_panel.union(right_shear_panel)

# 8. FACE FRAME (front cabinet face)
face_frame_z = FRONT_LEG_HEIGHT / 2
face_frame_y = front_beam_y + FRONT_BEAM_WIDTH/2 + FACE_FRAME_DEPTH/2

# Horizontal rails (top and bottom)
top_rail = (
    cq.Workplane("XY")
    .box(STRUCTURE_LENGTH, FACE_FRAME_DEPTH, FACE_FRAME_WIDTH)
    .translate((0, face_frame_y, FRONT_LEG_HEIGHT - FACE_FRAME_WIDTH/2))
)

bottom_rail = (
    cq.Workplane("XY")
    .box(STRUCTURE_LENGTH, FACE_FRAME_DEPTH, FACE_FRAME_WIDTH)
    .translate((0, face_frame_y, FACE_FRAME_WIDTH/2))
)

# Vertical stiles (dividing the bays)
face_frame = top_rail.union(bottom_rail)
bay_width = STRUCTURE_LENGTH / NUM_BAYS

for i in range(NUM_BAYS + 1):  # NUM_BAYS + 1 stiles (including both ends)
    stile_x = -STRUCTURE_LENGTH/2 + i * bay_width
    stile = (
        cq.Workplane("XY")
        .box(FACE_FRAME_WIDTH, FACE_FRAME_DEPTH, FRONT_LEG_HEIGHT)
        .translate((stile_x, face_frame_y, face_frame_z))
    )
    face_frame = face_frame.union(stile)

# 9. CONCRETE COUNTERTOP (visualization)
concrete_z = deck_z + DECK_PLYWOOD_THICKNESS/2 + CONCRETE_THICKNESS/2

concrete = (
    cq.Workplane("XY")
    .box(STRUCTURE_LENGTH, joist_span_length, CONCRETE_THICKNESS)
    .translate((0, deck_y, concrete_z))
)

# 10. COMBINE ALL COMPONENTS
result = (
    fence_posts
    .union(rear_ledger)
    .union(front_beam)
    .union(front_legs)
    .union(joists)
    .union(deck)
    .union(shear_panels)
    .union(face_frame)
    .union(concrete)
)

# ===== MATERIALS CUT LIST =====

print(f"\n{'='*70}")
print(f"MATERIALS CUT LIST")
print(f"{'='*70}")

# Lumber
print(f"\nSTRUCTURAL LUMBER (Pressure-Treated):")
print(f"  2×8 × 10': 1 pc (rear ledger)")
print(f"  2×8 × 10': 2 pcs (front beam, doubled)")
print(f"  4×4 × 8': {math.ceil(NUM_FRONT_LEGS * FRONT_LEG_HEIGHT / 96)} pcs (cut for {NUM_FRONT_LEGS} legs @ {FRONT_LEG_HEIGHT:.1f}\" each)")
print(f"  2×6 × 8': {math.ceil(num_joists * 2.5 / 8)} pcs (cut for {num_joists} joists @ 30\" each)")

# Plywood
print(f"\nPLYWOOD:")
print(f"  ¾\" Exterior plywood: 2 sheets (deck surface for concrete form)")
print(f"  ½\" Exterior plywood: 1 sheet (end shear panels for anti-racking)")

# Face frame
print(f"\nFACE FRAME (Cedar, Redwood, or Composite):")
print(f"  1×4 × 10': 3 pcs (top rail, bottom rail, stiles)")

# Hardware
bolt_count = len(fence_post_positions) * 4  # 4 bolts per post connection
print(f"\nHARDWARE:")
print(f"  ½\" × 6\" Lag bolts + washers: {bolt_count} sets (ledger to fence posts)")
print(f"  2×6 Joist hangers: {num_joists * 2} (both ends of each joist)")
print(f"  3\" Structural screws: 5 lbs")
print(f"  2½\" Deck screws: 3 lbs")

# Pads/Footings
print(f"\nFOOTINGS:")
print(f"  12\"×12\" Concrete pavers: {NUM_FRONT_LEGS} (one per leg)")
print(f"  Crushed rock base: 1 bag (leveling bed for pavers)")

# Concrete for countertop
concrete_volume_cf = (STRUCTURE_LENGTH * joist_span_length * CONCRETE_THICKNESS) / 1728
concrete_bags_60lb = math.ceil(concrete_volume_cf / 0.45)  # 60lb countertop mix = ~0.45 cf
print(f"\nCOUNTERTOP CONCRETE:")
print(f"  Volume: {concrete_volume_cf:.1f} cubic feet")
print(f"  60lb Countertop Mix bags: {concrete_bags_60lb} bags")

# Reinforcement
print(f"  Welded wire mesh (6×6 W1.4×W1.4): 1 roll")
print(f"  Or: ½\" rebar grid @ 12\" OC")

# ===== ASSEMBLY NOTES =====

print(f"\n{'='*70}")
print(f"ASSEMBLY SEQUENCE")
print(f"{'='*70}")
print(f"\n1. REAR SUPPORT LINE:")
print(f"   - Position 2×8 ledger at {rear_ledger_z:.1f}\" height (centered)")
print(f"   - Bolt through 6×6 fence posts with ½\" × 6\" lag bolts")
print(f"   - Use (4) bolts per post connection + washers")
print(f"   - Maintain {AIR_GAP}\" air gap from fence boards")

print(f"\n2. FRONT SUPPORT LINE:")
print(f"   - Set {NUM_FRONT_LEGS} concrete pavers on leveled crushed rock")
leg_positions = ', '.join([f'{-STRUCTURE_LENGTH/2 + i*leg_spacing:.0f}"' for i in range(NUM_FRONT_LEGS)])
print(f"   - Position at: {leg_positions}")
print(f"   - Cut (5) 4×4 legs to {FRONT_LEG_HEIGHT:.1f}\"")
print(f"   - Assemble double 2×8 front beam (sandwich with screws)")
print(f"   - Set legs on pavers, attach to beam top")

print(f"\n3. JOISTS:")
print(f"   - Install {num_joists} joists (2×6 on edge) at 12\" OC")
print(f"   - Use joist hangers at rear ledger")
print(f"   - Attach to front beam with joist hangers or blocking")
print(f"   - Add solid blocking at each leg position")

print(f"\n4. ANTI-RACKING:")
print(f"   - Cut (2) end panels from ½\" plywood")
print(f"   - Screw to end joists, legs, and beams")
print(f"   - This prevents lateral racking/twisting")

print(f"\n5. DECK:")
print(f"   - Install ¾\" exterior plywood deck on top of joists")
print(f"   - Screw down every 6\" to ensure flat, stiff surface")
print(f"   - This becomes your concrete form base")

print(f"\n6. FACE FRAME & CABINET:")
print(f"   - Build face frame with 1×4 material")
print(f"   - {NUM_BAYS} bays @ {bay_width:.0f}\" each")
print(f"   - Attach to front beam and legs")
print(f"   - Add doors as desired (non-structural)")

print(f"\n7. CONCRETE COUNTERTOP:")
print(f"   - Build melamine edge forms on plywood deck")
print(f"   - Install reinforcement (wire mesh or rebar)")
print(f"   - Pour {concrete_bags_60lb} bags of countertop mix")
print(f"   - Thickness: {CONCRETE_THICKNESS}\"")
print(f"   - Optional: Add control joint at center ({STRUCTURE_LENGTH/2:.0f}\")")

print(f"\n{'='*70}")
print(f"CRITICAL STRUCTURAL NOTES")
print(f"{'='*70}")
print(f"• Ledger MUST bolt to 6×6 posts (NOT fence boards)")
print(f"• Front beam carries ~50% of load → double 2×8 recommended")
print(f"• Shear panels at ends are REQUIRED for concrete's rigidity")
print(f"• Level and square frame before pouring concrete")
print(f"• Concrete weighs ~150 lbs/cf × {concrete_volume_cf:.1f} cf = {150*concrete_volume_cf:.0f} lbs total")
print(f"• Check local codes for ledger connections and footing requirements")

print(f"\n{'='*70}")
print(f"HEIGHT BREAKDOWN (Bottom to Top)")
print(f"{'='*70}")
print(f"Ground: 0\"")
print(f"Front legs: 0\" - {FRONT_LEG_HEIGHT:.1f}\"")
print(f"Front beam bottom: {FRONT_BEAM_TOP - FRONT_BEAM_HEIGHT:.1f}\"")
print(f"Front beam top / Joist top: {FRONT_BEAM_TOP:.1f}\"")
print(f"Deck top: {deck_z + DECK_PLYWOOD_THICKNESS/2:.1f}\"")
print(f"Concrete top (FINISHED COUNTER): {FINISHED_COUNTER_HEIGHT:.1f}\"")

print(f"\n{'='*70}\n")
