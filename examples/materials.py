"""
Semantic Material Library for Example Renderings

This library provides semantically clear colors optimized for clarity over texture/realism.
Colors are chosen to be highly distinguishable and to clearly communicate the function
of different components in the model.

Color Philosophy:
- Structural elements use cool colors (blues, teals) with darker = more primary
- Surfaces use warm neutrals (tans, beiges) for clear distinction
- Enclosures use grays to differentiate from structural and surfaces
- Accents use darker saturated colors for functional elements
- Context/ground uses muted earth tones to not distract

All colors are RGB tuples in 0-255 range.
"""

# Structural Elements - Cool color family for load-bearing components
STRUCTURAL = {
    'posts': (45, 85, 140),          # Deep blue - vertical supports
    'beams': (70, 120, 180),         # Medium blue - horizontal primary
    'joists': (100, 150, 200),       # Light blue - secondary framing
    'ledger': (50, 95, 150),         # Navy blue - wall-attached support
    'base_frame': (60, 100, 160),    # Strong blue - foundation framing
}

# Surface Elements - Warm neutral family for decking/flooring
SURFACES = {
    'deck': (220, 190, 140),         # Warm tan - primary surface
    'plywood': (200, 170, 120),      # Golden tan - panel surfaces
    'countertop': (230, 200, 150),   # Light tan - work surfaces
}

# Enclosure Elements - Gray family for walls/panels
ENCLOSURES = {
    'walls': (180, 180, 180),        # Light gray - wall framing
    'panels': (160, 160, 160),       # Medium gray - panel infill
    'siding': (170, 170, 170),       # Silver gray - exterior finish
}

# Functional Elements - Accent colors for interactive/access components
FUNCTIONAL = {
    'doors': (100, 70, 50),          # Dark brown - cabinet/access doors
    'hardware': (80, 80, 90),        # Dark gray - metal hardware
    'trim': (140, 110, 80),          # Medium brown - decorative trim
}

# Context Elements - Muted colors for environment/reference
CONTEXT = {
    'ground_grass': (100, 140, 90),  # Muted green - grass/lawn
    'ground_concrete': (150, 145, 140), # Concrete gray - patio/hardscape
    'ground_dirt': (120, 100, 80),   # Brown-gray - earth/soil
}

# Semantic color groups for common component types
SEMANTIC_GROUPS = {
    # Deck/platform structures
    'deck_structure': {
        'posts': STRUCTURAL['posts'],
        'beams': STRUCTURAL['beams'],
        'joists': STRUCTURAL['joists'],
        'deck': SURFACES['deck'],
        'ground': CONTEXT['ground_grass'],
    },

    # Cabinet/enclosure structures
    'cabinet_structure': {
        'ledger': STRUCTURAL['ledger'],
        'front_beam': STRUCTURAL['beams'],
        'base_frame': STRUCTURAL['base_frame'],
        'walls': ENCLOSURES['walls'],
        'joists': STRUCTURAL['joists'],
        'deck': SURFACES['plywood'],
        'doors': FUNCTIONAL['doors'],
        'ground': CONTEXT['ground_concrete'],
    },
}


def get_component_color(component_name, structure_type='deck_structure'):
    """
    Get a semantically appropriate color for a component.

    Args:
        component_name: Name of the component (e.g., 'posts', 'beams', 'deck')
        structure_type: Type of structure ('deck_structure', 'cabinet_structure', etc.)

    Returns:
        RGB tuple (0-255 range), or None if not found
    """
    if structure_type in SEMANTIC_GROUPS:
        return SEMANTIC_GROUPS[structure_type].get(component_name)
    return None


def list_materials():
    """Print all available materials organized by category."""
    print("STRUCTURAL ELEMENTS:")
    for name, color in STRUCTURAL.items():
        print(f"  {name:20s} RGB{color}")

    print("\nSURFACE ELEMENTS:")
    for name, color in SURFACES.items():
        print(f"  {name:20s} RGB{color}")

    print("\nENCLOSURE ELEMENTS:")
    for name, color in ENCLOSURES.items():
        print(f"  {name:20s} RGB{color}")

    print("\nFUNCTIONAL ELEMENTS:")
    for name, color in FUNCTIONAL.items():
        print(f"  {name:20s} RGB{color}")

    print("\nCONTEXT ELEMENTS:")
    for name, color in CONTEXT.items():
        print(f"  {name:20s} RGB{color}")


if __name__ == '__main__':
    list_materials()
