# Rustic table

Parametric table-only assembly reconstructed from the supplied reference image.

The model contains six tabletop boards, four square legs, four recessed aprons,
and eight symbolic bolt heads. It intentionally excludes the stump chairs,
flatware, cups, plates, flowers, and any hidden joinery. The single image does
not provide a reliable scale, so the default dimensions are a plausible
full-size dining table and remain editable through inch-based model parameters.

All wood members use dimensional-lumber sizes:

- Legs are nominal 4×4s, modeled at their actual finished 3.5″ × 3.5″ section.
- The tabletop and aprons are nominal 2×6s, modeled at 1.5″ × 5.5″.
- Top depth is derived from the 2×6 board count (six by default) plus 1/8″ seams.

CadLad converts those inch inputs to millimetres at the geometry boundary. Bolt
heads remain symbolic hardware rather than lumber or threaded fasteners.
