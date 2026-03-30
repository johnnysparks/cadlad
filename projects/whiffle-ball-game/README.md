# Whiffle Ball Carnival Shooter

Leaf blower powered PVC cannon fires 3" whiffle balls through a stack of slowly counter-rotating
plexiglass discs on a shared central axis.

---

## Core Concept (v2 — Spinning Disc Stack)

The game is a **depth + timing challenge**. A handheld or stand-mounted leaf blower feeds a PVC tube
that blasts neon whiffle balls horizontally through 3–4 circular plexiglass discs mounted on a
single horizontal shaft. Each disc has a different hole pattern cut into it, and adjacent discs spin
in **opposite directions** at slow, constant speed.

To score, the ball must thread through aligned openings in all spinning discs simultaneously. Because
each disc rotates against its neighbor, there are brief windows of alignment — getting deeper means
threading multiple moving gaps at once. The chaotic rattling of a ball that clears the first disc
but ricochets off the second is half the fun.

A black chalkboard backdrop provides contrast for the neon balls and carries chalk marker art, the
game name, and scoring zone labels.

---

## The Disc Stack

### Disc design options (from sketches)

| Name | Pattern | Open Area | Difficulty |
|---|---|---|---|
| **Ring** | 6–7 circles in a ring around a center hole | High | Front / easiest |
| **Clover** | 4 large petal-shaped lobes (+ cross gaps) | High-medium | Front-mid |
| **Quad-spoke** | 4 wide pie-slice openings, thick hub + spokes | Medium | Mid |
| **Hex-spoke** | 6 narrow pie-slice openings, thick spokes | Low | Back / hardest |
| **Bull's-eye** | Single large center hole | Very high | Novelty / warmup |

The progression front-to-back: lots of open area with generous holes → fewer, narrower openings that
require the ball to be precisely on-axis. The back disc's spokes should leave just 5–10mm clearance
per side for a 3" (76mm) ball.

### Rotation

- Discs spin slowly on a shared **horizontal shaft** (the shoot axis = +Y in the model)
- Adjacent discs rotate in **opposite directions** — e.g. disc 1 CW, disc 2 CCW, disc 3 CW
- Speed: slow enough for a player to read the gap, fast enough that timing matters (~5–15 RPM)
- Driven by a small motor at one end (or a hand-crank for the analog version)
- Each disc may be geared/belted to the next with a simple direction-reversal per stage

### Disc dimensions

| Parameter | Value | Notes |
|---|---|---|
| Disc diameter | 500–600mm (20–24") | Fits 3" ball + 4–6" clearance to edge |
| Disc thickness | 6–10mm | Clear cast acrylic or polycarbonate |
| Spacing between discs | 150–200mm (6–8") | Enough for a ball to bounce freely between layers |
| Shaft diameter | 25–32mm | Steel rod or pipe |
| Spoke/web min width | 80–100mm | Wide enough to structurally hold the disc |
| Hole clearance (back disc) | ~5mm per side | 86mm opening for 76mm ball |

---

## Disc Orientation

**Perfectly vertical.** The shooter aims horizontally, the discs face them like wheels. The whole
machine can be shimmed for a slight tilt if needed, but the designed position is vertical.

---

## Drive Mechanism — REVISED: Passive Rocker / Pendulum

> v3 pivot: No motor. Each disc is a "flower" on a counterweighted rocker arm.
> A push or a ball hit sets it swaying; high inertia + low dampening keeps it going.
> Adjacent rockers sway in different phases, making simultaneous hole alignment unpredictable.

### Rocker anatomy (one unit)

```
     [flower disc — big petals with gaps]
           |
           |  ← upper arm
           |
    ⊙ ← pivot bearing on shaft   (Z = pivotZ ~750mm)
           |
           |  ← lower arm
           |
     [●●●] ← heavy counterweight (iron/steel disc)
```

- **Pivot shaft**: one horizontal rod running along Y (depth axis) through ALL rocker bearings
- **Upper arm**: arm length from pivot to flower center (~300mm)
- **Lower arm**: arm length from pivot to counterweight (~220mm)
- **Counterweight**: heavy cylindrical iron/steel weight — provides inertia, returns to center
- **Motion**: each rocker is an independent pendulum swinging side-to-side (X axis sway)
  - High mass → high inertia → keeps swaying after a single push or ball hit
  - Low friction at bearing → minimal dampening → long oscillation duration
  - Adjacent rockers set to sway in different phases for maximum unpredictability

### No motor / no drill needed

The game operator gives each rocker a starting push. Ball impacts add energy. The counterweights
do the rest. Simple, reliable, silent, zero electronics.

## Drive Mechanism — ARCHIVED: Friction Roller System

This is the key mechanical detail. There is **no motor per disc**.

```
   [Central shaft — alignment + structural only, does not drive]
         |         |         |
        [D1]      [D2]      [D3]   ← discs, vertical, on central shaft
         |         |         |
   ======|=========|=========|====  ← bottom roller shaft A (driven)
   ======|=========|=========|====  ← bottom roller shaft B (guide/reverse)
```

### How it works

1. **Central shaft** runs horizontally through all disc centers. Its job is alignment and lateral
   stiffness — it keeps discs from tilting or drifting along the axis. It does **not** drive rotation.

2. **Bottom roller shafts** (2×, parallel to the central shaft, positioned below disc centers) carry
   **rubber-tired wheels or dowel rollers** that contact the disc rim or face. The disc weight rests
   on these rollers — they provide radial support and are the friction drive surface.

3. **One bottom shaft is powered.** A hand drill connects to a short dowel or rubber wheel coupling
   on one end of the shaft. Spinning the drill spins that shaft, which friction-drives all discs
   that contact it.

4. **Counter-rotation between adjacent discs** comes from roller geometry:
   - Odd discs (1, 3) contact the powered shaft from above → spin direction A
   - Even discs (2, 4) contact the opposing shaft (or a small idler between them and the powered
     shaft) → spin direction B (reversed)
   - Simple belt or chain between the two bottom shafts reverses direction, no gearbox needed

5. **Speed control** = drill trigger. Slow squeeze = slow spin, full trigger = fast spin.
   No electronics required.

### Frame & Mounting

- **Rectangular box frame** in 2×4 lumber or steel square tube — shooter-facing open face
- Central shaft: pillow-block bearings at each end of the frame
- Bottom roller shafts: pillow-block or simple flange bearings, positioned ~disc_radius below center
- Frame height: disc center at ~950–1050mm (chest height — easier to aim level)
- Frame depth: (disc count × spacing) + ~150mm for bearing overhangs each end
- Discs slot onto the central shaft — removable for transport, configurable difficulty order

---

## The Cannon

- **Leaf blower** (handheld — Ryobi, EGO, or similar cordless) fitted with a **PVC adapter cone**
- Cone narrows the blower output to match the PVC tube bore (~80mm ID for 3" balls)
- PVC tube: ~600–900mm long, supported on a **V-notch rest or cradle** on the counter/table
- Ball feed: drop balls in the back of the tube — blower pressure fires one at a time
- Optional ball hopper: a vertical clear tube above the breach lets you stack 4–6 balls

---

## Backdrop

- **2×4ft black chalkboard panels** (or painted MDF/hardboard) behind the disc stack
- Positioned ~150–200mm behind the last disc
- Decorated with chalk marker art: game name, scoring tiers, "AIM FOR DEPTH!", target rings
- High contrast for neon yellow-green (or pink) balls in flight

---

## Scoring Zones (conceptual)

| Depth cleared | Points | Label on chalkboard |
|---|---|---|
| Front disc only | 1 pt | "LEVEL 1" |
| First + second disc | 3 pts | "LEVEL 2" |
| All 3 discs | 10 pts | "DEPTH MASTER!" |
| All discs + bull's-eye center | 25 pts | "JACKPOT" |

---

## Key Dimensions

| Parameter | Default | Range | Notes |
|---|---|---|---|
| Disc Diameter | 550mm | 450–650mm | Cut from 24"×24" plexi sheet |
| Disc Thickness | 8mm | 6–10mm | Cast acrylic |
| Disc Count | 3 | 2–4 | More = harder |
| Layer Spacing | 165mm | 130–220mm | ~6.5" |
| Shaft Diameter | 28mm | 25–35mm | Steel rod |
| Ball Diameter | 76mm | 70–82mm | Standard 3" whiffle |
| Rotation Speed | 8 RPM | 3–20 RPM | Motor-controlled |

---

## Build Log

### Session 2026-03-29 — v1 (rectangular panels)
- Initial rectangular panel model: 3 plexiglass panels, 4-post frame, PVC cannon + leaf blower
- Screenshot: ![iso](snapshots/whiffle-ball-game-iso.png)
- Status: superseded by v2 disc concept

### Session 2026-03-29 — v2 concept (spinning disc stack)
- Major pivot: rectangular panels → circular rotating discs on central axis
- Inspired by reference photos and hand sketches
- Disc patterns: ring, clover, quad-spoke, hex-spoke (front-to-back = easy-to-hard)
- Added rotation mechanic: adjacent discs counter-rotate for timing challenge
- Status: concept documented — 3D model iteration next
