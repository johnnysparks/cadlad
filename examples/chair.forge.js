// Simple wooden chair — legs, seat, and backrest
const seatW = param("Seat Width", 40, { min: 30, max: 60, unit: "mm" });
const seatD = param("Seat Depth", 40, { min: 30, max: 60, unit: "mm" });
const seatT = param("Seat Thickness", 3, { min: 2, max: 6, unit: "mm" });
const legH = param("Leg Height", 40, { min: 25, max: 60, unit: "mm" });
const legW = param("Leg Width", 3, { min: 2, max: 6, unit: "mm" });
const backH = param("Back Height", 35, { min: 20, max: 50, unit: "mm" });
const backT = param("Back Thickness", 2, { min: 1.5, max: 4, unit: "mm" });

// Seat
const seat = box(seatW, seatD, seatT)
  .translate(0, 0, legH)
  .color("#c4a882");

// Four legs
const leg = box(legW, legW, legH);
const xOff = seatW / 2 - legW / 2;
const yOff = seatD / 2 - legW / 2;
const legZ = legH / 2 - seatT / 2;

const fl = leg.translate(-xOff, -yOff, legZ);
const fr = leg.translate( xOff, -yOff, legZ);
const bl = leg.translate(-xOff,  yOff, legZ);
const br = leg.translate( xOff,  yOff, legZ);

// Backrest
const back = box(seatW, backT, backH)
  .translate(0, seatD / 2 - backT / 2, legH + seatT / 2 + backH / 2)
  .color("#a08060");

const chair = seat
  .union(fl).union(fr).union(bl).union(br)
  .union(back)
  .named("Chair")
  .color("#c4a882");

return chair;
