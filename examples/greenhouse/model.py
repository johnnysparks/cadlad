"""Greenhouse Structure — Wood Frame with Shed Roof

A small backyard greenhouse with shed-style (mono-pitch) roof,
wood frame construction, and door opening on the front.

Design specifications:
- 8' × 6' footprint (96" × 72")
- Shed roof: 8' front height, 6.5' back height
- 4×4 corner posts with 2×4 intermediate studs
- 2×4 horizontal rails for panel attachment
- Door opening on front face (32" wide)
- Designed for corrugated polycarbonate panel attachment

Frame-only model (no panels or door).
"""

import cadquery as cq
import math

# ===== DESIGN PARAMETERS =====

# Overall dimensions
WIDTH = 96       # 8 feet (side to side, X-axis)
DEPTH = 72       # 6 feet (front to back, Y-axis)
FRONT_HEIGHT = 96   # 8 feet at front wall
BACK_HEIGHT = 78    # 6.5 feet at back wall

# Roof overhang
ROOF_OVERHANG_FRONT = 6   # 6" overhang at front
ROOF_OVERHANG_BACK = 6    # 6" overhang at back
ROOF_OVERHANG_SIDE = 4    # 4" overhang on sides

# Lumber dimensions (actual)
POST_4X4 = 3.5        # 4×4 actual dimension
LUMBER_2X4_FLAT = 1.5  # 2×4 thickness
LUMBER_2X4_EDGE = 3.5  # 2×4 width

# Stud spacing for panels (approximate 24" OC)
STUD_SPACING = 24

# Door opening
DOOR_WIDTH = 32
DOOR_HEIGHT = 80   # Standard door height

# Rail heights (from ground)
BOTTOM_RAIL_HEIGHT = 12   # Bottom rail at 12" for low panels
MID_RAIL_HEIGHT = 48      # Mid-height rail at 4'

print(f"\n{'='*60}")
print(f"GREENHOUSE STRUCTURE — 8' × 6' with Shed Roof")
print(f"{'='*60}")
print(f"\nDimensions: {WIDTH}\" × {DEPTH}\" ({WIDTH/12:.0f}' × {DEPTH/12:.0f}')")
print(f"Front height: {FRONT_HEIGHT}\" ({FRONT_HEIGHT/12:.1f}')")
print(f"Back height: {BACK_HEIGHT}\" ({BACK_HEIGHT/12:.1f}')")
print(f"Roof pitch: {(FRONT_HEIGHT - BACK_HEIGHT)/DEPTH * 12:.1f}:12")

# ===== HELPER FUNCTIONS =====

def create_beam(length, width, height, position, name="beam"):
    """Create a rectangular beam at the given position."""
    beam = (
        cq.Workplane("XY")
        .box(length, width, height)
        .translate(position)
    )
    return beam

# ===== BUILD THE 3D MODEL =====

# Track components for colored rendering
sill_plates = None
corner_posts = None
studs = None
top_plates = None
mid_rails = None
bottom_rails = None
rafters = None
fascia = None

# ===== 1. SILL PLATES (2×4 flat on ground) =====
# Base frame around the perimeter

sill_z = LUMBER_2X4_FLAT / 2  # Center of sill plate

# Front sill (full width)
front_sill = create_beam(
    WIDTH, LUMBER_2X4_EDGE, LUMBER_2X4_FLAT,
    (0, DEPTH/2 - LUMBER_2X4_EDGE/2, sill_z)
)
sill_plates = front_sill

# Back sill (full width)
back_sill = create_beam(
    WIDTH, LUMBER_2X4_EDGE, LUMBER_2X4_FLAT,
    (0, -DEPTH/2 + LUMBER_2X4_EDGE/2, sill_z)
)
sill_plates = sill_plates.union(back_sill)

# Left sill (between front and back)
left_sill = create_beam(
    LUMBER_2X4_EDGE, DEPTH - 2*LUMBER_2X4_EDGE, LUMBER_2X4_FLAT,
    (-WIDTH/2 + LUMBER_2X4_EDGE/2, 0, sill_z)
)
sill_plates = sill_plates.union(left_sill)

# Right sill (between front and back)
right_sill = create_beam(
    LUMBER_2X4_EDGE, DEPTH - 2*LUMBER_2X4_EDGE, LUMBER_2X4_FLAT,
    (WIDTH/2 - LUMBER_2X4_EDGE/2, 0, sill_z)
)
sill_plates = sill_plates.union(right_sill)

# ===== 2. CORNER POSTS (4×4) =====
# Posts sit on sill plates, heights vary for shed roof

post_bottom = LUMBER_2X4_FLAT  # Top of sill plate

# Calculate post heights (to bottom of top plate)
front_post_height = FRONT_HEIGHT - LUMBER_2X4_FLAT - LUMBER_2X4_FLAT  # minus sill and top plate
back_post_height = BACK_HEIGHT - LUMBER_2X4_FLAT - LUMBER_2X4_FLAT

# Corner positions (center of posts, inset by half post width)
post_inset = POST_4X4 / 2 + LUMBER_2X4_FLAT  # Inset from outer edge

corner_posts_data = [
    # (x, y, height, name)
    (-WIDTH/2 + post_inset, DEPTH/2 - post_inset, front_post_height, "front-left"),
    (WIDTH/2 - post_inset, DEPTH/2 - post_inset, front_post_height, "front-right"),
    (-WIDTH/2 + post_inset, -DEPTH/2 + post_inset, back_post_height, "back-left"),
    (WIDTH/2 - post_inset, -DEPTH/2 + post_inset, back_post_height, "back-right"),
]

for i, (x, y, height, name) in enumerate(corner_posts_data):
    post = create_beam(
        POST_4X4, POST_4X4, height,
        (x, y, post_bottom + height/2)
    )
    if i == 0:
        corner_posts = post
    else:
        corner_posts = corner_posts.union(post)

# ===== 3. INTERMEDIATE STUDS (2×4) =====
# Vertical studs between corners for panel attachment

def interpolate_height(y_pos):
    """Calculate wall height at a given Y position (linear interpolation)."""
    # y ranges from -DEPTH/2 (back) to DEPTH/2 (front)
    t = (y_pos + DEPTH/2) / DEPTH  # 0 at back, 1 at front
    return back_post_height + t * (front_post_height - back_post_height)

# Front wall studs (excluding door opening area)
# Door is centered on front wall
door_left = -DOOR_WIDTH/2
door_right = DOOR_WIDTH/2

front_y = DEPTH/2 - post_inset
front_stud_height = front_post_height

# Calculate stud positions for front wall (avoiding door)
front_stud_positions = []
x = -WIDTH/2 + post_inset + STUD_SPACING
while x < WIDTH/2 - post_inset - POST_4X4/2:
    # Skip studs in door opening
    if x < door_left - LUMBER_2X4_EDGE/2 or x > door_right + LUMBER_2X4_EDGE/2:
        front_stud_positions.append(x)
    x += STUD_SPACING

# Add door frame studs
front_stud_positions.append(door_left - LUMBER_2X4_EDGE/2)
front_stud_positions.append(door_right + LUMBER_2X4_EDGE/2)

for x in front_stud_positions:
    stud = create_beam(
        LUMBER_2X4_EDGE, LUMBER_2X4_FLAT, front_stud_height,
        (x, front_y, post_bottom + front_stud_height/2)
    )
    if studs is None:
        studs = stud
    else:
        studs = studs.union(stud)

# Back wall studs
back_y = -DEPTH/2 + post_inset
back_stud_height = back_post_height

x = -WIDTH/2 + post_inset + STUD_SPACING
while x < WIDTH/2 - post_inset - POST_4X4/2:
    stud = create_beam(
        LUMBER_2X4_EDGE, LUMBER_2X4_FLAT, back_stud_height,
        (x, back_y, post_bottom + back_stud_height/2)
    )
    studs = studs.union(stud)
    x += STUD_SPACING

# Side wall studs (left and right)
for side_x_base, side_sign in [(-WIDTH/2 + post_inset, -1), (WIDTH/2 - post_inset, 1)]:
    y = -DEPTH/2 + post_inset + STUD_SPACING
    while y < DEPTH/2 - post_inset - POST_4X4/2:
        stud_height = interpolate_height(y)
        stud = create_beam(
            LUMBER_2X4_FLAT, LUMBER_2X4_EDGE, stud_height,
            (side_x_base, y, post_bottom + stud_height/2)
        )
        studs = studs.union(stud)
        y += STUD_SPACING

# ===== 4. DOOR HEADER =====
# Horizontal beam above door opening
header_height = DOOR_HEIGHT + LUMBER_2X4_FLAT  # Top of door + header thickness
door_header = create_beam(
    DOOR_WIDTH + 2*LUMBER_2X4_EDGE, LUMBER_2X4_FLAT, LUMBER_2X4_EDGE,
    (0, front_y, header_height + LUMBER_2X4_EDGE/2)
)
# Add header to studs component
studs = studs.union(door_header)

# ===== 5. TOP PLATES (2×4 flat) =====
# Run along the top of the walls

front_plate_z = FRONT_HEIGHT - LUMBER_2X4_FLAT/2
back_plate_z = BACK_HEIGHT - LUMBER_2X4_FLAT/2

# Front top plate
front_plate = create_beam(
    WIDTH, LUMBER_2X4_EDGE, LUMBER_2X4_FLAT,
    (0, DEPTH/2 - LUMBER_2X4_EDGE/2, front_plate_z)
)
top_plates = front_plate

# Back top plate
back_plate = create_beam(
    WIDTH, LUMBER_2X4_EDGE, LUMBER_2X4_FLAT,
    (0, -DEPTH/2 + LUMBER_2X4_EDGE/2, back_plate_z)
)
top_plates = top_plates.union(back_plate)

# Side top plates (sloped - we'll use the rafters to span this)
# For simplicity, we'll add short plates at the ends
# Left side top plate - runs at an angle from front to back
# Create as series of short segments
num_segments = 4
for i in range(num_segments):
    y1 = -DEPTH/2 + LUMBER_2X4_EDGE + i * (DEPTH - 2*LUMBER_2X4_EDGE) / num_segments
    y2 = -DEPTH/2 + LUMBER_2X4_EDGE + (i + 1) * (DEPTH - 2*LUMBER_2X4_EDGE) / num_segments
    y_mid = (y1 + y2) / 2
    seg_length = (y2 - y1)

    # Height at this y position
    t = (y_mid + DEPTH/2) / DEPTH
    z_height = BACK_HEIGHT + t * (FRONT_HEIGHT - BACK_HEIGHT) - LUMBER_2X4_FLAT/2

    # Left side
    left_seg = create_beam(
        LUMBER_2X4_EDGE, seg_length, LUMBER_2X4_FLAT,
        (-WIDTH/2 + LUMBER_2X4_EDGE/2, y_mid, z_height)
    )
    top_plates = top_plates.union(left_seg)

    # Right side
    right_seg = create_beam(
        LUMBER_2X4_EDGE, seg_length, LUMBER_2X4_FLAT,
        (WIDTH/2 - LUMBER_2X4_EDGE/2, y_mid, z_height)
    )
    top_plates = top_plates.union(right_seg)

# ===== 6. MID-HEIGHT RAILS (2×4 flat) =====
# Horizontal rails at mid-height for panel support

mid_rail_z = MID_RAIL_HEIGHT + LUMBER_2X4_FLAT/2

# Front mid rail (with opening for door)
# Left section
front_mid_left = create_beam(
    WIDTH/2 - DOOR_WIDTH/2 - LUMBER_2X4_EDGE, LUMBER_2X4_FLAT, LUMBER_2X4_EDGE,
    (-WIDTH/4 - DOOR_WIDTH/4 - LUMBER_2X4_EDGE/2, DEPTH/2 - post_inset, mid_rail_z)
)
mid_rails = front_mid_left

# Right section
front_mid_right = create_beam(
    WIDTH/2 - DOOR_WIDTH/2 - LUMBER_2X4_EDGE, LUMBER_2X4_FLAT, LUMBER_2X4_EDGE,
    (WIDTH/4 + DOOR_WIDTH/4 + LUMBER_2X4_EDGE/2, DEPTH/2 - post_inset, mid_rail_z)
)
mid_rails = mid_rails.union(front_mid_right)

# Back mid rail
back_mid_rail = create_beam(
    WIDTH - 2*post_inset, LUMBER_2X4_FLAT, LUMBER_2X4_EDGE,
    (0, -DEPTH/2 + post_inset, mid_rail_z)
)
mid_rails = mid_rails.union(back_mid_rail)

# Side mid rails
left_mid_rail = create_beam(
    LUMBER_2X4_FLAT, DEPTH - 2*post_inset, LUMBER_2X4_EDGE,
    (-WIDTH/2 + post_inset, 0, mid_rail_z)
)
mid_rails = mid_rails.union(left_mid_rail)

right_mid_rail = create_beam(
    LUMBER_2X4_FLAT, DEPTH - 2*post_inset, LUMBER_2X4_EDGE,
    (WIDTH/2 - post_inset, 0, mid_rail_z)
)
mid_rails = mid_rails.union(right_mid_rail)

# ===== 7. BOTTOM RAILS (2×4 flat) =====
# Low horizontal rails for bottom panel support

bottom_rail_z = BOTTOM_RAIL_HEIGHT + LUMBER_2X4_FLAT/2

# Front bottom rail (with opening for door)
front_bottom_left = create_beam(
    WIDTH/2 - DOOR_WIDTH/2 - LUMBER_2X4_EDGE, LUMBER_2X4_FLAT, LUMBER_2X4_EDGE,
    (-WIDTH/4 - DOOR_WIDTH/4 - LUMBER_2X4_EDGE/2, DEPTH/2 - post_inset, bottom_rail_z)
)
bottom_rails = front_bottom_left

front_bottom_right = create_beam(
    WIDTH/2 - DOOR_WIDTH/2 - LUMBER_2X4_EDGE, LUMBER_2X4_FLAT, LUMBER_2X4_EDGE,
    (WIDTH/4 + DOOR_WIDTH/4 + LUMBER_2X4_EDGE/2, DEPTH/2 - post_inset, bottom_rail_z)
)
bottom_rails = bottom_rails.union(front_bottom_right)

# Back bottom rail
back_bottom_rail = create_beam(
    WIDTH - 2*post_inset, LUMBER_2X4_FLAT, LUMBER_2X4_EDGE,
    (0, -DEPTH/2 + post_inset, bottom_rail_z)
)
bottom_rails = bottom_rails.union(back_bottom_rail)

# Side bottom rails
left_bottom_rail = create_beam(
    LUMBER_2X4_FLAT, DEPTH - 2*post_inset, LUMBER_2X4_EDGE,
    (-WIDTH/2 + post_inset, 0, bottom_rail_z)
)
bottom_rails = bottom_rails.union(left_bottom_rail)

right_bottom_rail = create_beam(
    LUMBER_2X4_FLAT, DEPTH - 2*post_inset, LUMBER_2X4_EDGE,
    (WIDTH/2 - post_inset, 0, bottom_rail_z)
)
bottom_rails = bottom_rails.union(right_bottom_rail)

# ===== 8. RAFTERS (2×4 on edge) =====
# Roof rafters running from front to back with overhang

# Calculate rafter geometry
rafter_run = DEPTH + ROOF_OVERHANG_FRONT + ROOF_OVERHANG_BACK
rafter_rise = FRONT_HEIGHT - BACK_HEIGHT
rafter_length = math.sqrt(rafter_run**2 + rafter_rise**2)
rafter_angle = math.atan2(rafter_rise, rafter_run)

# Rafters at approximately 24" OC
num_rafters = int(WIDTH / STUD_SPACING) + 1
rafter_spacing = WIDTH / (num_rafters - 1)

# Rafter positions (centered over structure)
for i in range(num_rafters):
    rafter_x = -WIDTH/2 + ROOF_OVERHANG_SIDE + i * (WIDTH - 2*ROOF_OVERHANG_SIDE) / (num_rafters - 1) if num_rafters > 1 else 0
    if i == 0:
        rafter_x = -WIDTH/2 + LUMBER_2X4_EDGE/2
    elif i == num_rafters - 1:
        rafter_x = WIDTH/2 - LUMBER_2X4_EDGE/2

    # Rafter center position
    rafter_y_center = (DEPTH/2 + ROOF_OVERHANG_FRONT - DEPTH/2 + ROOF_OVERHANG_BACK) / 2 - ROOF_OVERHANG_BACK + DEPTH/2
    rafter_y_center = ROOF_OVERHANG_FRONT/2 - ROOF_OVERHANG_BACK/2
    rafter_z_center = (FRONT_HEIGHT + BACK_HEIGHT) / 2 + LUMBER_2X4_FLAT/2

    # Create rafter as a box, then rotate
    rafter = (
        cq.Workplane("XY")
        .box(LUMBER_2X4_FLAT, rafter_length, LUMBER_2X4_EDGE)
        .rotate((0, 0, 0), (1, 0, 0), math.degrees(-rafter_angle))
        .translate((rafter_x, rafter_y_center, rafter_z_center))
    )

    if i == 0:
        rafters = rafter
    else:
        rafters = rafters.union(rafter)

# ===== 9. FASCIA BOARDS =====
# Front and back fascia at roof edges

# Front fascia (at high end of roof)
front_fascia_z = FRONT_HEIGHT + LUMBER_2X4_FLAT + LUMBER_2X4_EDGE/2
front_fascia = create_beam(
    WIDTH + 2*ROOF_OVERHANG_SIDE, LUMBER_2X4_FLAT, LUMBER_2X4_EDGE,
    (0, DEPTH/2 + ROOF_OVERHANG_FRONT, front_fascia_z)
)
fascia = front_fascia

# Back fascia (at low end of roof)
back_fascia_z = BACK_HEIGHT + LUMBER_2X4_FLAT + LUMBER_2X4_EDGE/2
back_fascia = create_beam(
    WIDTH + 2*ROOF_OVERHANG_SIDE, LUMBER_2X4_FLAT, LUMBER_2X4_EDGE,
    (0, -DEPTH/2 - ROOF_OVERHANG_BACK, back_fascia_z)
)
fascia = fascia.union(back_fascia)

# ===== COMBINE ALL COMPONENTS =====

result = (
    sill_plates
    .union(corner_posts)
    .union(studs)
    .union(top_plates)
    .union(mid_rails)
    .union(bottom_rails)
    .union(rafters)
    .union(fascia)
)

# Export components dict for colored rendering
# Colors: (geometry, (R, G, B)) tuples
COLORS = {
    'sill_plates': (60, 100, 160),     # Base frame blue
    'corner_posts': (45, 85, 140),     # Deep blue for posts
    'studs': (80, 130, 190),           # Lighter blue for studs
    'top_plates': (70, 120, 180),      # Medium blue for beams
    'mid_rails': (100, 150, 200),      # Light blue for secondary
    'bottom_rails': (100, 150, 200),   # Light blue for secondary
    'rafters': (90, 140, 200),         # Roof framing
    'fascia': (110, 90, 70),           # Trim color (brown)
}

components = {
    'sill_plates': (sill_plates, COLORS['sill_plates']),
    'corner_posts': (corner_posts, COLORS['corner_posts']),
    'studs': (studs, COLORS['studs']),
    'top_plates': (top_plates, COLORS['top_plates']),
    'mid_rails': (mid_rails, COLORS['mid_rails']),
    'bottom_rails': (bottom_rails, COLORS['bottom_rails']),
    'rafters': (rafters, COLORS['rafters']),
    'fascia': (fascia, COLORS['fascia']),
}

# ===== MATERIALS CUT LIST =====

print(f"\n{'='*60}")
print(f"MATERIALS CUT LIST")
print(f"{'='*60}")

# Count components
num_front_studs = len(front_stud_positions)
num_back_studs = int((WIDTH - 2*post_inset) / STUD_SPACING)
num_side_studs = 2 * int((DEPTH - 2*post_inset) / STUD_SPACING)

print(f"\n4×4 CORNER POSTS:")
print(f"  Qty: 4")
print(f"  - 2 @ {front_post_height:.0f}\" ({front_post_height/12:.1f}') for front corners")
print(f"  - 2 @ {back_post_height:.0f}\" ({back_post_height/12:.1f}') for back corners")

print(f"\n2×4 SILL PLATES (perimeter base):")
sill_total = 2 * WIDTH + 2 * DEPTH
print(f"  Total linear feet: {sill_total/12:.1f}'")
print(f"  - 2 @ {WIDTH}\" ({WIDTH/12:.0f}') for front/back")
print(f"  - 2 @ {DEPTH}\" ({DEPTH/12:.0f}') for sides")

print(f"\n2×4 STUDS (vertical):")
total_studs = num_front_studs + num_back_studs + num_side_studs
print(f"  Qty: ~{total_studs}")
print(f"  - Front wall: {num_front_studs} @ {front_post_height:.0f}\"")
print(f"  - Back wall: {num_back_studs} @ {back_post_height:.0f}\"")
print(f"  - Side walls: {num_side_studs} @ varying heights")

print(f"\n2×4 TOP PLATES:")
top_plate_total = 2 * WIDTH + 2 * math.sqrt(DEPTH**2 + (FRONT_HEIGHT - BACK_HEIGHT)**2)
print(f"  Total linear feet: ~{top_plate_total/12:.1f}'")

print(f"\n2×4 HORIZONTAL RAILS (mid + bottom):")
rail_total = 4 * (2 * WIDTH + 2 * DEPTH)  # Approximate
print(f"  Total linear feet: ~{rail_total/12:.1f}'")

print(f"\n2×4 RAFTERS:")
print(f"  Qty: {num_rafters}")
print(f"  Length each: {rafter_length:.0f}\" ({rafter_length/12:.1f}')")

print(f"\n2×4 FASCIA:")
fascia_length = WIDTH + 2*ROOF_OVERHANG_SIDE
print(f"  - 2 @ {fascia_length:.0f}\" ({fascia_length/12:.1f}')")

print(f"\n{'='*60}")
print(f"DOOR OPENING:")
print(f"{'='*60}")
print(f"  Width: {DOOR_WIDTH}\" ({DOOR_WIDTH/12:.2f}')")
print(f"  Height: {DOOR_HEIGHT}\" ({DOOR_HEIGHT/12:.1f}')")
print(f"  Location: Centered on front wall")

print(f"\n{'='*60}")
print(f"ASSEMBLY NOTES:")
print(f"{'='*60}")
print(f"1. Layout footprint: {WIDTH}\" × {DEPTH}\" ({WIDTH/12:.0f}' × {DEPTH/12:.0f}')")
print(f"2. Install sill plates on level foundation (concrete blocks or pavers)")
print(f"3. Install 4×4 corner posts:")
print(f"   - Front posts: {front_post_height + LUMBER_2X4_FLAT + LUMBER_2X4_FLAT:.0f}\" total height")
print(f"   - Back posts: {back_post_height + LUMBER_2X4_FLAT + LUMBER_2X4_FLAT:.0f}\" total height")
print(f"4. Install intermediate 2×4 studs at {STUD_SPACING}\" OC")
print(f"5. Install top plates on all walls")
print(f"6. Frame door opening ({DOOR_WIDTH}\"W × {DOOR_HEIGHT}\"H) with header")
print(f"7. Install horizontal rails at {BOTTOM_RAIL_HEIGHT}\" and {MID_RAIL_HEIGHT}\"")
print(f"8. Install rafters at ~{STUD_SPACING}\" OC")
print(f"9. Install front and back fascia boards")
print(f"10. Attach corrugated polycarbonate panels to frame with screws")
print(f"\nRoof pitch: {(FRONT_HEIGHT - BACK_HEIGHT)/DEPTH * 12:.1f}:12 ({math.degrees(rafter_angle):.1f}°)")
print(f"\n{'='*60}\n")
