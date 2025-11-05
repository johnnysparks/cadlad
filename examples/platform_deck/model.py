"""Simple Platform Deck — Construction-Ready CAD Model

A simple rectangular platform deck with 2×6 decking, foundation posts,
beams, and joists.

Design specifications:
- 10' × 10' (120" × 120") rectangular perimeter
- 2×6 redwood decking running in one direction
- 10" total height including foundation
- Complete foundation with posts, beams, and joists
- Construction-ready with cut list and assembly notes
"""

import cadquery as cq
import math

# ===== DESIGN PARAMETERS =====

# Deck dimensions
DECK_WIDTH = 120  # 10 feet in inches
DECK_LENGTH = 120  # 10 feet in inches
DECK_HEIGHT = 10  # Total height 10"

# Decking boards
DECK_BOARD_WIDTH = 5.5  # 2×6 actual width
DECK_BOARD_THICKNESS = 1.5  # 2×6 actual thickness
DECK_BOARD_GAP = 0.125  # 1/8" gap between boards

# Foundation - Posts
POST_SIZE = 3.5  # 4×4 posts (actual)
POST_HEIGHT = 8  # Height below deck surface

# Foundation - Beams (perimeter)
BEAM_WIDTH = 5.5  # 2×6 beams (actual)
BEAM_HEIGHT = 1.5  # 2×6 thickness

# Foundation - Joists
JOIST_WIDTH = 1.5  # 2×6 joists (turned on edge)
JOIST_HEIGHT = 5.5  # 2×6 joists (turned on edge for strength)
JOIST_SPACING = 16  # 16" on center

print(f"\n{'='*60}")
print(f"SIMPLE RECTANGULAR DECK — 10' × 10'")
print(f"{'='*60}")
print(f"\nDimensions: {DECK_WIDTH}\" × {DECK_LENGTH}\" ({DECK_WIDTH/12:.1f}' × {DECK_LENGTH/12:.1f}')")
print(f"Total height: {DECK_HEIGHT}\" (including all foundation)")

# ===== BUILD THE 3D MODEL =====

# 1. Create deck boards
# Boards run along the length (parallel to Y-axis)
deck_surface = cq.Workplane("XY")

num_boards = int(DECK_WIDTH / (DECK_BOARD_WIDTH + DECK_BOARD_GAP)) + 1

for i in range(num_boards):
    board_x = -DECK_WIDTH/2 + i * (DECK_BOARD_WIDTH + DECK_BOARD_GAP)

    board = (
        cq.Workplane("XY")
        .box(DECK_BOARD_WIDTH, DECK_LENGTH, DECK_BOARD_THICKNESS)
        .translate((board_x, 0, DECK_HEIGHT - DECK_BOARD_THICKNESS/2))
    )

    if i == 0:
        deck_surface = board
    else:
        deck_surface = deck_surface.union(board)

# 2. Foundation Posts (4 corners)
post_inset = 8  # Inset from edges
post_locations = [
    (-DECK_WIDTH/2 + post_inset, -DECK_LENGTH/2 + post_inset),  # Bottom-left
    (DECK_WIDTH/2 - post_inset, -DECK_LENGTH/2 + post_inset),   # Bottom-right
    (-DECK_WIDTH/2 + post_inset, DECK_LENGTH/2 - post_inset),   # Top-left
    (DECK_WIDTH/2 - post_inset, DECK_LENGTH/2 - post_inset),    # Top-right
]

posts = cq.Workplane("XY")
for i, loc in enumerate(post_locations):
    post = (
        cq.Workplane("XY")
        .box(POST_SIZE, POST_SIZE, POST_HEIGHT)
        .translate((loc[0], loc[1], POST_HEIGHT/2))
    )
    if i == 0:
        posts = post
    else:
        posts = posts.union(post)

# 3. Perimeter Beams (2×6 flat around the edges)
beam_z = POST_HEIGHT + BEAM_HEIGHT/2

beams = cq.Workplane("XY")

# Four perimeter beams
beam_configs = [
    # (x, y, length, is_horizontal)
    (0, -DECK_LENGTH/2, DECK_WIDTH, True),   # Bottom edge
    (0, DECK_LENGTH/2, DECK_WIDTH, True),    # Top edge
    (-DECK_WIDTH/2, 0, DECK_LENGTH, False),  # Left edge
    (DECK_WIDTH/2, 0, DECK_LENGTH, False),   # Right edge
]

for i, (x, y, length, is_horizontal) in enumerate(beam_configs):
    if is_horizontal:
        beam = cq.Workplane("XY").box(length, BEAM_WIDTH, BEAM_HEIGHT)
    else:
        beam = cq.Workplane("XY").box(BEAM_WIDTH, length, BEAM_HEIGHT)

    beam = beam.translate((x, y, beam_z))

    if i == 0:
        beams = beam
    else:
        beams = beams.union(beam)

# 4. Joists (2×6 on edge, running perpendicular to deck boards)
# Joists run along X-axis (perpendicular to the deck boards which run along Y-axis)
joist_z = POST_HEIGHT + BEAM_HEIGHT + JOIST_HEIGHT/2

num_joists = int(DECK_LENGTH / JOIST_SPACING) + 1

joists = cq.Workplane("XY")
for i in range(num_joists):
    joist_y = -DECK_LENGTH/2 + i * JOIST_SPACING

    joist = (
        cq.Workplane("XY")
        .box(DECK_WIDTH, JOIST_WIDTH, JOIST_HEIGHT)
        .translate((0, joist_y, joist_z))
    )

    if i == 0:
        joists = joist
    else:
        joists = joists.union(joist)

# 5. Combine all components
result = deck_surface.union(posts).union(beams).union(joists)

# ===== MATERIALS CUT LIST =====

print(f"\n{'='*60}")
print(f"MATERIALS CUT LIST")
print(f"{'='*60}")

# Decking
deck_board_count = num_boards
deck_board_length_ft = DECK_LENGTH / 12
print(f"\nDECKING:")
print(f"  2×6 Redwood: {deck_board_count} boards @ {deck_board_length_ft:.0f}' each")

# Posts
post_count = len(post_locations)
post_length_ft = math.ceil(POST_HEIGHT / 12)
print(f"\nPOSTS:")
print(f"  4×4 Pressure-treated: {post_count} posts @ {post_length_ft}' each")

# Beams
beam_total_length = 2 * DECK_WIDTH + 2 * DECK_LENGTH
beam_count = math.ceil(beam_total_length / 144)  # 12' boards
print(f"\nBEAMS (PERIMETER):")
print(f"  2×6 Pressure-treated: {beam_count} @ 12' each")
print(f"  (Total linear footage: {beam_total_length/12:.1f}')")

# Joists
joist_count = num_joists
joist_length_ft = DECK_WIDTH / 12
print(f"\nJOISTS:")
print(f"  2×6 Pressure-treated: {joist_count} @ {joist_length_ft:.0f}' each")
print(f"  (Spacing: {JOIST_SPACING}\" on center)")

# Hardware
print(f"\nHARDWARE:")
print(f"  3\" Deck screws: ~{deck_board_count * 20} count")
print(f"  1/2\" × 6\" Galvanized carriage bolts: {post_count * 4} (4 per post)")
print(f"  Joist hangers: {joist_count * 2} (both ends)")

# Concrete
footing_volume_per_post = 3.14 * (6**2) * 18 / 1728  # 12" dia × 18" deep, cubic feet
total_concrete = footing_volume_per_post * post_count
concrete_bags = math.ceil(total_concrete / 0.6)  # 60lb bags = 0.6 cf each
print(f"\nCONCRETE:")
print(f"  60lb bags: {concrete_bags} (for {post_count} footings @ 12\"Ø × 18\" deep)")

print(f"\n{'='*60}")
print(f"ASSEMBLY NOTES:")
print(f"{'='*60}")
print(f"1. Dig {post_count} post footings 18\" deep, 12\" diameter")
print(f"2. Set 4×4 posts in concrete footings")
print(f"3. Install perimeter 2×6 beams (flat) on top of posts")
print(f"4. Install {joist_count} joists (2×6 on edge) at {JOIST_SPACING}\" OC")
print(f"5. Install {deck_board_count} deck boards (2×6) with {DECK_BOARD_GAP}\" gaps")
print(f"6. Total deck height: {DECK_HEIGHT}\" including all layers")
print(f"\n{'='*60}\n")
