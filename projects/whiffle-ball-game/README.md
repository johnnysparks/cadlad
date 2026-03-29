# Whiffle Ball Carnival Shooter

Leaf blower powered PVC cannon fires 3" whiffle balls through layered plexiglass panels.

## Design Intent

A carnival-style depth shooter. A leaf blower feeds a PVC pipe cannon that blasts neon whiffle balls
at 3 suspended plexiglass panels (2×4ft each, 6" apart). The front panel has generously wide holes
(~164mm dia), the middle panel narrows (~108mm), and the back panel is tight (~88mm — only 6mm
clearance per side on a 3" ball). Balls that clear the early panels but miss the back ones bounce
chaotically between the sandwiched panels. Black chalkboard panels in the background provide contrast
for the neon balls and serve as a canvas for chalk marker artwork and scoring zones.

## Key Dimensions

| Parameter | Default | Range | Notes |
|---|---|---|---|
| Panel Width | 610mm | 400-800mm | 2ft nominal |
| Panel Height | 1220mm | 800-1600mm | 4ft nominal |
| Panel Thickness | 10mm | 6-16mm | Plexiglass stock |
| Layer Gap | 152mm | 100-300mm | 6" between panels |
| Ball Radius | 38mm | 30-45mm | 3" whiffle ball |
| Front Hole Radius | 82mm | — | 164mm dia — easy entry |
| Mid Hole Radius | 54mm | — | 108mm dia — moderate |
| Back Hole Radius | 44mm | — | 88mm dia — tight (6mm/side) |

## Geometry Notes

- Panels are plexiglass in XZ plane, stacked along Y (depth axis)
- Cannon barrel rotates -90° around X so it points along +Y toward panels
- Hole cutters: cylinder(-90°X) centered at panel Y position
- Chalkboard sits ~95mm behind back panel, full-width + 120mm
- Frame: 40mm steel square tube, 4 corner posts + top perimeter rails

## Build Log

### Session 2026-03-29
- Changes: Full redesign — leaf blower cannon + layered plexiglass panels replacing original tabletop toss concept
- Added: 3 plexiglass panels with scaled hole sizes, 4-post aluminum frame, PVC cannon + leaf blower body, stand, 2 neon balls
- Screenshot: ![iso](snapshots/whiffle-ball-game-iso.png)
- Status: first pass complete — ready for iteration
- Next: tripod stand, camera angle, hole count param, chalkboard art zones
