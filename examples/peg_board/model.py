"""Peg Board Example

A parametric peg board with round pegs for organizing and storage.
Features 1/2" diameter pegs, 1" deep, spaced 4" apart.
"""

import cadquery as cq

# Parameters (in millimeters)
peg_diameter = 12.7  # 1/2 inch
peg_height = 25.4    # 1 inch
peg_spacing = 101.6  # 4 inches between centers

# Board dimensions
board_thickness = 6  # mm
pegs_x = 3  # number of pegs in X direction
pegs_y = 3  # number of pegs in Y direction

# Calculate board size based on peg layout
board_width = (pegs_x - 1) * peg_spacing + 2 * peg_spacing / 2
board_depth = (pegs_y - 1) * peg_spacing + 2 * peg_spacing / 2


def create_peg_board(peg_dia, peg_h, spacing, n_x, n_y, board_thick):
    """Create a peg board with round pegs arranged in a grid.

    Args:
        peg_dia: Diameter of each peg
        peg_h: Height of each peg
        spacing: Distance between peg centers
        n_x: Number of pegs in X direction
        n_y: Number of pegs in Y direction
        board_thick: Thickness of the base board
    """
    # Calculate board dimensions
    board_w = (n_x - 1) * spacing + 2 * spacing / 2
    board_d = (n_y - 1) * spacing + 2 * spacing / 2

    # Create base board
    result = cq.Workplane("XY").box(board_w, board_d, board_thick)

    # Calculate starting position (offset from center)
    start_x = -(n_x - 1) * spacing / 2
    start_y = -(n_y - 1) * spacing / 2

    # Add pegs in a grid pattern
    for i in range(n_x):
        for j in range(n_y):
            x_pos = start_x + i * spacing
            y_pos = start_y + j * spacing

            # Create peg at this position
            peg = (
                cq.Workplane("XY")
                .transformed(offset=(x_pos, y_pos, board_thick / 2))
                .circle(peg_dia / 2)
                .extrude(peg_h)
            )
            result = result.union(peg)

    return result


# Create the peg board
result = create_peg_board(
    peg_diameter,
    peg_height,
    peg_spacing,
    pegs_x,
    pegs_y,
    board_thickness
)
