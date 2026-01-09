"""Opus's Outdoor Counter Frame — Construction-Ready CAD Model

A fence-mounted outdoor counter/cabinet frame for a concrete countertop pour.
Perfect for outdoor kitchens, BBQ stations, or potting benches.

Design specifications:
- 10' (120") length along fence line
- 30" depth (front to back)
- 36" finished counter height
- Back ledger bolted to 6×6 fence posts
- Front beam (double 2×8) on 4×4 legs with pads
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
COUNTER_LENGTH = 120  # 10 feet in inches
COUNTER_DEPTH = 30    # 30" front to back
COUNTER_HEIGHT = 36   # 36" finished counter height

# Rear ledger (bolted to 6×6 fence posts)
LEDGER_WIDTH = 7.25   # 2×8 actual width (on edge)
LEDGER_THICKNESS = 1.5  # 2×8 actual thickness

# Front beam (double 2×8)
FRONT_BEAM_WIDTH = 7.25   # 2×8 actual width (on edge)
FRONT_BEAM_THICKNESS = 3.0  # Double 2×8 = 2 × 1.5"

# Front legs (4×4 posts)
LEG_SIZE = 3.5  # 4×4 actual dimension

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
NUM_LEGS = 5  # Legs at both ends + 3 intermediate

# Air gap from fence
FENCE_GAP = 3  # 3" gap from fence boards

print(f"\n{'='*60}")
print(f"OPUS'S OUTDOOR COUNTER FRAME — 10' × 30\"")
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

# Front legs go from ground to bottom of front beam
leg_height = front_beam_bottom

print(f"\nSTRUCTURE (bottom to top):")
print(f"  Front legs: 0\" - {leg_height:.2f}\"")
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

# 3. FRONT LEGS (4×4 posts on pads)
# Evenly spaced: at ends + every ~30" (5 legs for 4 bays)
legs = cq.Workplane("XY")
leg_positions = []

for i in range(NUM_LEGS):
    # Distribute legs evenly, inset slightly from ends
    leg_inset = LEG_SIZE  # Inset from end by leg width
    usable_length = COUNTER_LENGTH - 2 * leg_inset
    if NUM_LEGS > 1:
        leg_x = -COUNTER_LENGTH/2 + leg_inset + i * (usable_length / (NUM_LEGS - 1))
    else:
        leg_x = 0

    leg_y = COUNTER_DEPTH/2 - FRONT_BEAM_THICKNESS/2  # Centered under front beam

    leg = (
        cq.Workplane("XY")
        .box(LEG_SIZE, LEG_SIZE, leg_height)
        .translate((leg_x, leg_y, leg_height/2))
    )

    leg_positions.append((leg_x, leg_y))

    if i == 0:
        legs = leg
    else:
        legs = legs.union(leg)

# 4. JOISTS (2×6 on edge, spanning front to back at 12" OC)
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

# 5. PLYWOOD DECK (3/4" exterior plywood)
# Full coverage on top of joists for form base
deck = (
    cq.Workplane("XY")
    .box(COUNTER_LENGTH, COUNTER_DEPTH, DECK_THICKNESS)
    .translate((0, 0, deck_bottom + DECK_THICKNESS/2))
)

# 6. SHEAR PANELS (1/2" plywood on ends for anti-racking)
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

# 7. COMBINE ALL COMPONENTS
result = (
    ledger
    .union(front_beam)
    .union(legs)
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

# Front legs
print(f"\nFRONT LEGS:")
print(f"  4×4 Pressure-treated: {NUM_LEGS} @ {math.ceil(leg_height/12)}' each")
print(f"  (Actual cut length: {leg_height:.1f}\")")

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
print(f"  1/2\" × 4\" Lag screws for front beam to legs: {NUM_LEGS * 4}")
print(f"  Joist hangers (2×6): {num_joists * 2} (both ends)")
print(f"  1-1/4\" Exterior screws for plywood: ~100")
print(f"  2-1/2\" Exterior screws for shear panels: ~50")

# Concrete pads
print(f"\nFOUNDATION:")
print(f"  Concrete pavers (16\"×16\"): {NUM_LEGS} (one per leg)")
print(f"  Crushed rock for leveling: 1 bag")

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
print(f"1. Level and place concrete pavers for front legs")
print(f"2. Cut and bolt 2×8 ledger to 6×6 fence posts")
print(f"   - Set height so finished counter = {COUNTER_HEIGHT}\"")
print(f"   - Ledger top at {ledger_top:.1f}\" from ground")
print(f"3. Set 4×4 front legs on pavers, plumb and brace")
print(f"4. Install doubled 2×8 front beam on legs")
print(f"   - Check level with ledger")
print(f"5. Install joist hangers and hang 2×6 joists")
print(f"   - {JOIST_SPACING}\" on center, {num_joists} total")
print(f"6. Screw down 3/4\" plywood deck")
print(f"7. Install 1/2\" plywood shear panels on ends")
print(f"8. Build concrete edge forms on deck")
print(f"9. Pour and finish concrete countertop")
print(f"\n{'='*60}\n")
