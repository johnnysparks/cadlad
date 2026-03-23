# Aluminum Can

Standard 12oz aluminum beverage can — the most manufactured object in human history.

## Design

Component-based assembly with three distinct parts:

- **Body**: Cylinder + truncated cone shoulder + rim ring, hollowed by subtracting an inner cavity. Bottom dome for pressure resistance via revolved profile.
- **Lid**: Recessed disc inside the rim with a kidney-shaped drink opening.
- **Pull Tab**: Paddle-shaped tab with finger hole and rivet, slightly tilted at the pull end.

## Parameters

| Parameter | Default | Range | Notes |
|---|---|---|---|
| Can Radius | 33mm | 25–45mm | Standard 12oz is ~33mm |
| Can Height | 115mm | 80–160mm | Standard 12oz is ~115mm |
| Wall Thickness | 1.5mm | 1–3mm | Real cans are ~0.1mm; thicker here for printability |
| Neck Radius | 27mm | 20–40mm | Narrower than body for the shoulder taper |

## What worked

- **Primitives over revolve for the body** — cylinder + cone gives clean geometry without internal face artifacts that appeared with revolved thin-wall profiles.
- **Revolve for the dome only** — the bottom dome's curved profile benefits from revolve; it's unioned onto the solid body cleanly.
- **Assembly for colors** — body, lid, and tab each get distinct aluminum tones without the `.color()` after `.union()` gotcha.
- **Oversized cutters** — drink opening and finger hole cylinders extend +4mm beyond the lid/tab thickness.

## What didn't work

- **Revolved thin-wall shell** (v1-v3): revolving the full cross-section (outer + inner wall profile) created internal faces visible through thin walls in the edge renderer.
- **Sphere subtraction for dome** (v1-v2): subtracting a sphere from inside the body created internal geometry artifacts at the tangent point.
- **Camera hints in Z-up model coords**: the gallery sets camera position in Y-up Three.js space; Z-up values produced wrong viewing angles. Removed hint and let auto-camera handle it.
