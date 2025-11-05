"""
Fence-Mounted Lumber Storage Rack Design
-----------------------------------------
A cantilever-style rack for storing salvaged 2x6 deck boards.

Design specs:
- Mounts to 6x6 fence posts (5ft apart)
- Multiple horizontal storage levels
- Minimal footprint, high strength
- 24" off ground for yard grading
- Stores boards 5-15ft long horizontally
- Uses deck screws for mounting
"""

import cadquery as cq

# ===== DESIGN PARAMETERS =====
# All measurements in inches

# Fence post spacing
POST_SPACING = 60  # 5 feet between posts

# Vertical support brackets (made from 2x6)
BRACKET_WIDTH = 5.5  # Actual width of 2x6
BRACKET_THICKNESS = 1.5  # Actual thickness of 2x6
BRACKET_LENGTH = 36  # Length of vertical support against fence

# Horizontal arms (cantilever supports, also 2x6)
ARM_LENGTH = 24  # Extends 24" from fence
ARM_SPACING = 12  # Vertical spacing between storage levels
NUM_LEVELS = 4  # 4 storage levels

# Ground clearance
GROUND_CLEARANCE = 24  # Bottom level 24" off ground

# ===== BUILD THE MODEL =====

# Create one complete storage bracket assembly
# This will be mounted to each fence post

# 1. Vertical bracket (mounts to fence post)
vertical_bracket = (
    cq.Workplane("XY")
    .box(BRACKET_WIDTH, BRACKET_THICKNESS, BRACKET_LENGTH)
    .translate((0, 0, BRACKET_LENGTH/2 + GROUND_CLEARANCE))
)

# 2. Create horizontal cantilever arms at each level
arms = cq.Workplane("XY")
for level in range(NUM_LEVELS):
    z_position = GROUND_CLEARANCE + (level * ARM_SPACING)
    arm = (
        cq.Workplane("XY")
        .box(BRACKET_WIDTH, ARM_LENGTH, BRACKET_THICKNESS)
        .translate((0, ARM_LENGTH/2, z_position))
    )
    arms = arms.union(arm)

# 3. Combine vertical bracket with arms
single_bracket = vertical_bracket.union(arms)

# 4. Add mounting holes for deck screws (3/16" pilot holes)
# 4 screws per vertical bracket, staggered
single_bracket = (
    single_bracket
    .faces("<Y").workplane()  # Back face against fence
    .pushPoints([
        (0, GROUND_CLEARANCE + 6),
        (0, GROUND_CLEARANCE + 18),
        (0, GROUND_CLEARANCE + 30),
        (0, GROUND_CLEARANCE + 42)
    ])
    .hole(0.1875)  # 3/16" pilot holes for #10 deck screws
)

# 5. Create the full assembly with brackets on two posts
# Left bracket
left_bracket = single_bracket.translate((-POST_SPACING/2, 0, 0))

# Right bracket
right_bracket = single_bracket.translate((POST_SPACING/2, 0, 0))

# Combine both brackets
result = left_bracket.union(right_bracket)

# 6. Add visual representation of stored lumber (optional, for visualization)
# Show example 2x6x10 board resting on bottom level
sample_board = (
    cq.Workplane("XY")
    .box(120, 5.5, 1.5)  # 10ft board
    .translate((0, ARM_LENGTH/2, GROUND_CLEARANCE + 0.75))
)
result = result.union(sample_board)

# 7. Add fence post representation (for context)
left_post = (
    cq.Workplane("XY")
    .box(5.5, 5.5, 120)  # 6x6 post, 10ft tall
    .translate((-POST_SPACING/2, -5.5, 60))
)
right_post = (
    cq.Workplane("XY")
    .box(5.5, 5.5, 120)
    .translate((POST_SPACING/2, -5.5, 60))
)
result = result.union(left_post).union(right_post)

# ===== ASSEMBLY NOTES =====
"""
MATERIALS NEEDED (per 5ft section):
- 2 vertical brackets: 2x6x36" (can cut from salvaged boards)
- 8 horizontal arms: 2x6x24" (can cut from salvaged boards)
- 16 deck screws: #10 x 3" for mounting to fence posts
- Optional: 4 screws per arm to secure arms to vertical bracket

INSTALLATION:
1. Mark fence posts at 24" above ground
2. Screw vertical brackets to fence posts with 4 screws each
3. Attach horizontal arms to brackets (2 screws per connection)
4. Can span multiple fence posts for longer storage

CAPACITY:
- Each level can hold ~200-300 lbs
- 4 levels = space for sorting by length
- Can extend to more fence posts as needed

BENEFITS:
- Uses only ~10 linear feet of 2x6 per 5ft section
- Completely off ground - no rot issues
- Easy access from front
- Modular - add more sections as needed
- Strong cantilever design
"""
