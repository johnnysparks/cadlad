// Whiffle Ball Carnival Game — tabletop toss game with scoring pockets
// Status: scaffold — ready for vibe-modeling session

const boardW = param("Board Width", 300, { min: 200, max: 500, unit: "mm" });
const boardH = param("Board Height", 400, { min: 300, max: 600, unit: "mm" });
const boardD = param("Board Depth", 10, { min: 5, max: 20, unit: "mm" });
const rimH = param("Rim Height", 30, { min: 15, max: 60, unit: "mm" });
const tilt = param("Tilt Angle", 15, { min: 5, max: 30, unit: "deg" });

// Backboard
const board = box(boardW, boardD, boardH)
  .translate(0, 0, boardH / 2)
  .color("#8B6914");

// Side rims
const rimL = box(boardD, boardD, boardH)
  .translate(-boardW / 2 + boardD / 2, boardD / 2 + boardD / 2, boardH / 2)
  .color("#6B4914");
const rimR = box(boardD, boardD, boardH)
  .translate(boardW / 2 - boardD / 2, boardD / 2 + boardD / 2, boardH / 2)
  .color("#6B4914");

// Bottom lip / ball catch
const lip = box(boardW, rimH, boardD)
  .translate(0, boardD / 2 + rimH / 2, boardD / 2)
  .color("#6B4914");

// Assemble and tilt
const game = assembly("Whiffle Ball Game")
  .add("Board", board)
  .add("Left Rim", rimL)
  .add("Right Rim", rimR)
  .add("Lip", lip);

return {
  model: game,
  camera: [400, -300, 300],
};
