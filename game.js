const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const gameFrame = document.querySelector("#game-frame");
const fullscreenToggle = document.querySelector("#fullscreen-toggle");
const menu = document.querySelector("#menu");
const panels = [...document.querySelectorAll(".panel")];
const modeStatus = document.querySelector("#mode-status");
const roomStatus = document.querySelector("#room-status");
const objectiveStatus = document.querySelector("#objective-status");
const networkMessage = document.querySelector("#network-message");
const joinForm = document.querySelector("#join-form");
const roomInput = document.querySelector("#room-code");
const onlineActions = document.querySelector("#online-actions");
const localAssign = document.querySelector("#local-assign");
const assignP1 = document.querySelector("#assign-p1");
const assignP2 = document.querySelector("#assign-p2");
const assignBlue = document.querySelector("#assign-blue");
const assignRed = document.querySelector("#assign-red");
const levelSelect = document.querySelector("#level-select");

const W = canvas.width;
const H = canvas.height;
const keys = new Set();
const previousKeys = new Set();
let previousPads = [];
let peer = null;
let conn = null;
let role = "single";
let rafId = 0;
let assignment = null;
let lastPlayerSend = 0;
let lastPlayerPacket = "";
let lastSendDuration = 0;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const pressed = (key) => keys.has(key) && !previousKeys.has(key);

const LEVELS = [
  {
    name: "Level 1: Compression Gate",
    width: 3200,
    deathY: 820,
    start: { blue: [110, 560], red: [180, 560] },
    platforms: [
      { x: 0, y: 650, w: 780, h: 70 },
      { x: 840, y: 560, w: 320, h: 34 },
      { x: 1230, y: 480, w: 320, h: 34 },
      { x: 1620, y: 650, w: 540, h: 70 },
      { x: 2250, y: 560, w: 360, h: 34 },
      { x: 2660, y: 650, w: 540, h: 70 },
    ],
    walls: [
      { x: 720, y: 300, w: 52, h: 350, gate: "blue", open: false },
      { x: 1540, y: 250, w: 58, h: 400, gate: "red", open: false },
      { x: 2600, y: 250, w: 58, h: 400, gate: "final", open: false },
    ],
    plates: [
      { x: 580, y: 625, w: 80, h: 18, color: "blue", active: false },
      { x: 1370, y: 455, w: 80, h: 18, color: "red", active: false },
      { x: 2325, y: 535, w: 80, h: 18, color: "blue", active: false },
      { x: 2485, y: 535, w: 80, h: 18, color: "red", active: false },
    ],
    cores: [
      { x: 1040, y: 510, w: 28, h: 28, color: "blue", taken: false },
      { x: 1840, y: 602, w: 28, h: 28, color: "red", taken: false },
    ],
    hazards: [
      { x: 1180, y: 632, w: 250, h: 18 },
      { x: 2170, y: 632, w: 260, h: 18 },
    ],
    molecules: [
      { x: 1900, y: 602, r: 42, phase: 1.6 },
      { x: 2410, y: 518, r: 32, phase: 3.1 },
    ],
    movers: [
      { x: 940, baseX: 940, baseY: 500, y: 500, w: 62, h: 60, phase: 0, rangeX: 0, rangeY: 0, speed: 1 },
    ],
    door: { x: 3000, y: 505, w: 72, h: 145, open: false },
  },
  {
    name: "Level 2: Photon Ferry",
    width: 3600,
    deathY: 840,
    start: { blue: [100, 560], red: [170, 560] },
    platforms: [
      { x: 0, y: 650, w: 620, h: 70 },
      { x: 625, y: 612, w: 150, h: 30 },
      { x: 760, y: 580, w: 260, h: 34 },
      { x: 1080, y: 632, w: 90, h: 24 },
      { x: 1180, y: 500, w: 300, h: 34 },
      { x: 1660, y: 620, w: 420, h: 60 },
      { x: 2100, y: 632, w: 140, h: 24 },
      { x: 2260, y: 520, w: 320, h: 34 },
      { x: 2780, y: 650, w: 650, h: 70 },
    ],
    walls: [
      { x: 640, y: 265, w: 54, h: 385, gate: "blue", open: false },
      { x: 1530, y: 245, w: 58, h: 405, gate: "red", open: false },
      { x: 2660, y: 245, w: 58, h: 405, gate: "final", open: false },
    ],
    plates: [
      { x: 500, y: 625, w: 80, h: 18, color: "blue", active: false },
      { x: 1300, y: 475, w: 80, h: 18, color: "red", active: false },
      { x: 2300, y: 495, w: 80, h: 18, color: "blue", active: false },
      { x: 2460, y: 495, w: 80, h: 18, color: "red", active: false },
    ],
    cores: [
      { x: 905, y: 532, w: 28, h: 28, color: "blue", taken: false },
      { x: 1840, y: 572, w: 28, h: 28, color: "red", taken: false },
    ],
    hazards: [
      { x: 1040, y: 632, w: 130, h: 18 },
    ],
    molecules: [
      { x: 1980, y: 570, r: 36, phase: 1 },
    ],
    movers: [
      { x: 2140, baseX: 2140, baseY: 390, y: 390, w: 70, h: 70, phase: 2, rangeX: 0, rangeY: 135, speed: 1 },
    ],
    door: { x: 3330, y: 505, w: 72, h: 145, open: false },
  },
  {
    name: "Level 3: Electron Lift",
    width: 3900,
    deathY: 850,
    start: { blue: [100, 560], red: [170, 560] },
    platforms: [
      { x: 0, y: 650, w: 540, h: 70 },
      { x: 680, y: 540, w: 260, h: 34 },
      { x: 1120, y: 430, w: 260, h: 34 },
      { x: 1540, y: 610, w: 460, h: 60 },
      { x: 2140, y: 520, w: 300, h: 34 },
      { x: 2680, y: 440, w: 300, h: 34 },
      { x: 3180, y: 650, w: 580, h: 70 },
    ],
    walls: [
      { x: 560, y: 245, w: 54, h: 405, gate: "blue", open: false },
      { x: 1450, y: 220, w: 58, h: 430, gate: "red", open: false },
      { x: 3060, y: 230, w: 58, h: 420, gate: "final", open: false },
    ],
    plates: [
      { x: 410, y: 625, w: 80, h: 18, color: "blue", active: false },
      { x: 1230, y: 405, w: 80, h: 18, color: "red", active: false },
      { x: 2220, y: 495, w: 80, h: 18, color: "blue", active: false },
      { x: 2790, y: 415, w: 80, h: 18, color: "red", active: false },
    ],
    cores: [
      { x: 780, y: 492, w: 28, h: 28, color: "blue", taken: false },
      { x: 2300, y: 472, w: 28, h: 28, color: "red", taken: false },
    ],
    hazards: [
      { x: 980, y: 632, w: 170, h: 18 },
      { x: 2460, y: 632, w: 190, h: 18 },
    ],
    molecules: [
      { x: 1660, y: 560, r: 34, phase: 0.4 },
    ],
    movers: [
      { x: 1000, baseX: 1000, baseY: 440, y: 440, w: 70, h: 72, phase: 0, rangeX: 0, rangeY: 165, speed: 0.95 },
      { x: 2500, baseX: 2500, baseY: 500, y: 500, w: 82, h: 56, phase: 1.5, rangeX: 210, rangeY: 0, speed: 1.05 },
    ],
    door: { x: 3650, y: 505, w: 72, h: 145, open: false },
  },
  {
    name: "Level 4: Molecular Bridge",
    width: 4200,
    deathY: 860,
    start: { blue: [100, 560], red: [170, 560] },
    platforms: [
      { x: 0, y: 650, w: 560, h: 70 },
      { x: 720, y: 585, w: 240, h: 34 },
      { x: 1120, y: 510, w: 250, h: 34 },
      { x: 1540, y: 650, w: 480, h: 70 },
      { x: 2180, y: 565, w: 280, h: 34 },
      { x: 2660, y: 485, w: 280, h: 34 },
      { x: 3200, y: 590, w: 300, h: 34 },
      { x: 3660, y: 650, w: 420, h: 70 },
    ],
    walls: [
      { x: 590, y: 235, w: 54, h: 415, gate: "blue", open: false },
      { x: 1445, y: 245, w: 58, h: 405, gate: "red", open: false },
      { x: 3540, y: 240, w: 58, h: 410, gate: "final", open: false },
    ],
    plates: [
      { x: 420, y: 625, w: 80, h: 18, color: "blue", active: false },
      { x: 1225, y: 485, w: 80, h: 18, color: "red", active: false },
      { x: 2275, y: 540, w: 80, h: 18, color: "blue", active: false },
      { x: 3300, y: 565, w: 80, h: 18, color: "red", active: false },
    ],
    cores: [
      { x: 825, y: 537, w: 28, h: 28, color: "blue", taken: false },
      { x: 2740, y: 437, w: 28, h: 28, color: "red", taken: false },
    ],
    hazards: [
      { x: 980, y: 632, w: 120, h: 18 },
      { x: 2960, y: 632, w: 200, h: 18 },
    ],
    molecules: [
      { x: 1800, y: 600, r: 44, phase: 0 },
    ],
    movers: [
      { x: 1020, baseX: 1020, baseY: 548, y: 548, w: 76, h: 58, phase: 0, rangeX: 170, rangeY: 0, speed: 1 },
      { x: 3030, baseX: 3030, baseY: 410, y: 410, w: 72, h: 86, phase: 1, rangeX: 0, rangeY: 145, speed: 0.9 },
    ],
    door: { x: 3940, y: 505, w: 72, h: 145, open: false },
  },
  {
    name: "Level 5: Quantum Core",
    width: 4500,
    deathY: 870,
    start: { blue: [100, 560], red: [170, 560] },
    platforms: [
      { x: 0, y: 650, w: 520, h: 70 },
      { x: 700, y: 610, w: 230, h: 34 },
      { x: 1080, y: 520, w: 230, h: 34 },
      { x: 1460, y: 390, w: 250, h: 34 },
      { x: 1850, y: 610, w: 420, h: 60 },
      { x: 2470, y: 500, w: 260, h: 34 },
      { x: 2940, y: 405, w: 280, h: 34 },
      { x: 3380, y: 545, w: 280, h: 34 },
      { x: 3820, y: 650, w: 520, h: 70 },
    ],
    walls: [
      { x: 560, y: 190, w: 54, h: 460, gate: "blue", open: false },
      { x: 1750, y: 185, w: 58, h: 465, gate: "red", open: false },
      { x: 3660, y: 180, w: 62, h: 470, gate: "final", open: false },
    ],
    plates: [
      { x: 390, y: 625, w: 80, h: 18, color: "blue", active: false },
      { x: 1560, y: 365, w: 80, h: 18, color: "red", active: false },
      { x: 2560, y: 475, w: 80, h: 18, color: "blue", active: false },
      { x: 3460, y: 520, w: 80, h: 18, color: "red", active: false },
    ],
    cores: [
      { x: 795, y: 562, w: 28, h: 28, color: "blue", taken: false },
      { x: 3030, y: 357, w: 28, h: 28, color: "red", taken: false },
    ],
    hazards: [
      { x: 940, y: 632, w: 120, h: 18 },
      { x: 2280, y: 632, w: 170, h: 18 },
      { x: 3240, y: 632, w: 130, h: 18 },
    ],
    molecules: [
      { x: 1995, y: 565, r: 46, phase: 0.5 },
      { x: 3520, y: 492, r: 38, phase: 2.4 },
    ],
    movers: [
      { x: 990, baseX: 990, baseY: 560, y: 560, w: 64, h: 56, phase: 0, rangeX: 150, rangeY: 0, speed: 0.95 },
      { x: 2320, baseX: 2320, baseY: 355, y: 355, w: 76, h: 88, phase: 1.2, rangeX: 0, rangeY: 135, speed: 0.85 },
      { x: 3260, baseX: 3260, baseY: 500, y: 500, w: 74, h: 54, phase: 2.1, rangeX: 135, rangeY: 0, speed: 0.95 },
    ],
    door: { x: 4250, y: 505, w: 72, h: 145, open: false },
  },
];

let currentLevelIndex = 0;
let level = cloneLevel(currentLevelIndex);

function cloneLevel(index) {
  return JSON.parse(JSON.stringify(LEVELS[index]));
}

let game = createGame();

function createGame() {
  level = cloneLevel(currentLevelIndex);
  for (const wall of level.walls) wall.open = false;
  for (const plate of level.plates) plate.active = false;
  for (const core of level.cores) core.taken = false;
  level.door.open = false;
  const blueStart = level.start.blue;
  const redStart = level.start.red;
  return {
    running: false,
    camera: 0,
    zoom: 1,
    time: 0,
    objective: "Choose a mode",
    endProgress: 0,
    completed: false,
    players: {
      blue: makePlayer("blue", blueStart[0], blueStart[1]),
      red: makePlayer("red", redStart[0], redStart[1]),
    },
  };
}

function makePlayer(color, x, y) {
  return { color, x, y, w: 38, h: 54, vx: 0, vy: 0, facing: 1, grounded: false, jumps: 2, activateFlash: 0, hurt: 0 };
}

function showPanel(id) {
  for (const panel of panels) panel.classList.toggle("active", panel.id === id);
  joinForm.classList.remove("active");
  onlineActions.classList.remove("active");
  localAssign.classList.remove("active");
  networkMessage.textContent = "";
  assignment = null;
}

function startSingle() {
  currentLevelIndex = 0;
  role = "single";
  roomStatus.textContent = "LOCAL";
  startLevel("Single");
}

function startLocalCoop() {
  currentLevelIndex = 0;
  assignment = { blue: null, red: null, pending: null, selected: "blue" };
  roomStatus.textContent = "LOCAL";
  networkMessage.textContent = "Claim an input device, then choose Blue or Red.";
  localAssign.classList.add("active");
  assignP1.textContent = "Waiting for input device.";
  assignP2.textContent = "Use Left / Right to select, then Enter / A to confirm.";
  renderAssignment();
}

function startLevel(mode) {
  lastPlayerPacket = "";
  lastPlayerSend = 0;
  game = createGame();
  game.running = true;
  modeStatus.textContent = mode;
  levelSelect.value = String(currentLevelIndex);
  objectiveStatus.textContent = level.name;
  menu.classList.add("hidden");
  loop();
}

function goToLevel(index) {
  currentLevelIndex = clamp(index, 0, LEVELS.length - 1);
  send({ type: "level", index: currentLevelIndex });
  startLevel(modeStatus.textContent === "Intro" ? "Single" : modeStatus.textContent);
}

function nextLevel() {
  if (!game.completed) return;
  if (currentLevelIndex < LEVELS.length - 1) {
    goToLevel(currentLevelIndex + 1);
    return;
  }
  game.completed = false;
  menu.classList.remove("hidden");
  showPanel("intro-panel");
  document.querySelector("#intro-panel h2").textContent = "Quantum Realm Cleared";
  document.querySelector("#intro-panel p").textContent = "Einstein escaped all five prototype levels. Restart from the menu to play again.";
}

function showOnlineActions() {
  assignment = null;
  localAssign.classList.remove("active");
  onlineActions.classList.add("active");
  joinForm.classList.remove("active");
  networkMessage.textContent = "Choose Host or Join.";
}

function detectAssignment(event) {
  if (!assignment) return;
  if (assignment.pending) return;
  if (event.type === "keyboard") {
    if (deviceAlreadyAssigned({ type: "keyboard" })) return;
    assignment.pending = { type: "keyboard" };
    assignP1.textContent = "Keyboard detected. Choose Blue or Red.";
    networkMessage.textContent = "Select a character for this input.";
    renderAssignment();
    return;
  }
  if (event.type === "pad") {
    const device = { type: "pad", index: event.index };
    if (deviceAlreadyAssigned(device)) return;
    assignment.pending = device;
    assignP1.textContent = `Controller ${event.index + 1} detected. Choose Blue or Red.`;
    networkMessage.textContent = "Select a character for this controller.";
    renderAssignment();
  }
}

function deviceAlreadyAssigned(device) {
  return ["blue", "red"].some((color) => {
    const assigned = assignment[color];
    return assigned && assigned.type === device.type && assigned.index === device.index;
  });
}

function chooseAssignment(color) {
  if (!assignment) return;
  assignment.selected = color;
  renderAssignment();
}

function confirmAssignment() {
  if (!assignment || !assignment.pending || assignment[assignment.selected]) return;
  assignment[assignment.selected] = assignment.pending;
  assignment.pending = null;
  const blueName = assignment.blue ? deviceName(assignment.blue) : "Waiting";
  const redName = assignment.red ? deviceName(assignment.red) : "Waiting";
  assignP1.textContent = `Blue: ${blueName}`;
  assignP2.textContent = `Red: ${redName}`;
  networkMessage.textContent = assignment.blue && assignment.red ? "Starting local co-op." : "Claim another input device.";
  renderAssignment();
  if (assignment.blue && assignment.red) {
    role = "local";
    roomStatus.textContent = "LOCAL";
    setTimeout(() => startLevel("Local Co-op"), 350);
  }
}

function deviceName(device) {
  if (!device) return "Waiting";
  return device.type === "keyboard" ? "Keyboard" : `Controller ${device.index + 1}`;
}

function renderAssignment() {
  if (!assignment) return;
  assignBlue.classList.toggle("selected", assignment.selected === "blue" && !assignment.blue);
  assignRed.classList.toggle("selected", assignment.selected === "red" && !assignment.red);
  assignBlue.classList.toggle("assigned-blue", Boolean(assignment.blue));
  assignRed.classList.toggle("assigned-red", Boolean(assignment.red));
  assignBlue.textContent = assignment.blue ? `Blue: ${deviceName(assignment.blue)}` : "Blue Einstein";
  assignRed.textContent = assignment.red ? `Red: ${deviceName(assignment.red)}` : "Red Einstein";
}

function makeRoomCode() {
  return Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
}

function hostGame() {
  if (!window.Peer) {
    networkMessage.textContent = "PeerJS could not load. Check internet access.";
    return;
  }
  const code = makeRoomCode();
  currentLevelIndex = 0;
  role = "host";
  roomStatus.textContent = code;
  networkMessage.textContent = `Hosting room ${code}. Share this code with player two.`;
  peer = new Peer(code, { debug: 1 });
  peer.on("open", () => startLevel("Host"));
  peer.on("connection", (connection) => {
    conn = connection;
    bindConnection();
    networkMessage.textContent = "Red Einstein connected.";
    send({ type: "player", color: "blue", player: packPlayer(game.players.blue) });
  });
  peer.on("error", (error) => {
    networkMessage.textContent = error.type === "unavailable-id" ? "Room code busy. Try Host again." : `Network error: ${error.type}`;
  });
}

function joinGame(code) {
  if (!window.Peer) {
    networkMessage.textContent = "PeerJS could not load. Check internet access.";
    return;
  }
  role = "join";
  currentLevelIndex = 0;
  roomStatus.textContent = code;
  networkMessage.textContent = `Joining ${code}...`;
  peer = new Peer(undefined, { debug: 1 });
  peer.on("open", () => {
    conn = peer.connect(code, { reliable: false });
    bindConnection();
  });
  peer.on("error", (error) => {
    networkMessage.textContent = `Network error: ${error.type}`;
  });
}

function bindConnection() {
  conn.on("open", () => {
    if (role === "join") startLevel("Joined");
    if (role === "host") send({ type: "player", color: "blue", player: packPlayer(game.players.blue) });
    if (role === "join") send({ type: "player", color: "red", player: packPlayer(game.players.red) });
    send({ type: "hello" });
  });
  conn.on("data", (message) => {
    if (message.type === "player") {
      applyRemotePlayer(message.color, message.player);
    }
    if (message.type === "restart") {
      game = createGame();
      game.running = true;
    }
    if (message.type === "level") {
      currentLevelIndex = message.index;
      startLevel(modeStatus.textContent || "Joined");
    }
  });
  conn.on("close", () => {
    objectiveStatus.textContent = "Disconnected";
  });
}

function send(message) {
  if (conn && conn.open) conn.send(message);
}

function toggleFullscreen() {
  const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
  if (fullscreenElement) {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    return;
  }
  if (gameFrame.requestFullscreen) gameFrame.requestFullscreen();
  else if (gameFrame.webkitRequestFullscreen) gameFrame.webkitRequestFullscreen();
}

function updateFullscreenButton() {
  const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
  fullscreenToggle.textContent = fullscreenElement ? "Exit Fullscreen" : "Fullscreen";
}

function loop(timestamp = 0) {
  cancelAnimationFrame(rafId);
  if (!game.running) return;
  update(timestamp / 1000);
  draw();
  rafId = requestAnimationFrame(loop);
}

function update(now) {
  game.time = now;
  const pads = getGamepads();
  const blueInput = readAssignedInput("blue", pads);
  const redInput = readAssignedInput("red", pads);
  const localOnlineInput = readInput(0, true, pads);
  const restartPressed = role === "join" ? localOnlineInput.restart : blueInput.restart || redInput.restart;
  if (restartPressed) {
    game = createGame();
    game.running = true;
    send({ type: "restart" });
  }

  if (game.completed) {
    draw();
    previousFrame(pads);
    return;
  }

  if (role === "join") {
    updatePlayer(game.players.red, localOnlineInput);
    updateWorld();
    sendPlayerIfNeeded("red", now);
    previousFrame(pads);
    return;
  }

  updatePlayer(game.players.blue, blueInput);
  if (role === "local") updatePlayer(game.players.red, redInput);
  updateWorld();
  if (role === "host") sendPlayerIfNeeded("blue", now);
  previousFrame(pads);
}

function sendPlayerIfNeeded(color, now) {
  const packet = packPlayer(game.players[color]).join(",");
  const changed = packet !== lastPlayerPacket;
  const minInterval = lastSendDuration > 45 ? 1 / 20 : 1 / 45;
  const keepAlive = lastSendDuration > 45 ? 1 / 12 : 1 / 24;
  if (!changed && now - lastPlayerSend < keepAlive) return;
  if (changed && now - lastPlayerSend < minInterval) return;
  if (changed || now - lastPlayerSend > keepAlive) {
    const started = performance.now();
    send({ type: "player", color, player: packPlayer(game.players[color]) });
    lastSendDuration = performance.now() - started;
    lastPlayerPacket = packet;
    lastPlayerSend = now;
  }
}

function packPlayer(player) {
  return [Math.round(player.x), Math.round(player.y), Number(player.vx.toFixed(1)), Number(player.vy.toFixed(1)), player.facing, player.grounded ? 1 : 0, player.jumps, player.activateFlash, player.hurt];
}

function applyPackedPlayer(player, data) {
  player.x = data[0];
  player.y = data[1];
  player.vx = data[2];
  player.vy = data[3];
  player.facing = data[4];
  player.grounded = Boolean(data[5]);
  player.jumps = data[6];
  player.activateFlash = data[7];
  player.hurt = data[8];
}

function applyRemotePlayer(color, playerData) {
  const target = game.players[color];
  if (!target) return;
  applyPackedPlayer(target, playerData);
}

function updateWorld() {
  for (const molecule of level.molecules) molecule.phase += 0.035;
  for (const mover of level.movers) {
    const wave = Math.sin(game.time * mover.speed * 1.8 + mover.phase);
    mover.x = mover.baseX + wave * mover.rangeX;
    mover.y = mover.baseY + wave * mover.rangeY;
  }
  for (const player of activePlayers()) {
    player.activateFlash = Math.max(0, player.activateFlash - 1);
    player.hurt = Math.max(0, player.hurt - 1);
    if (player.y > level.deathY) resetPlayer(player);
    for (const hazard of level.hazards) {
      if (hit(player, hazard)) resetPlayer(player);
    }
    for (const molecule of level.molecules) {
      const m = { x: molecule.x - molecule.r, y: molecule.y - molecule.r, w: molecule.r * 2, h: molecule.r * 2 };
      if (hit(player, m)) resetPlayer(player);
    }
    for (const mover of level.movers) {
      if (hit(player, mover)) resetPlayer(player);
    }
  }

  updatePlates();
  updateCores();
  updateLocks();
  updateObjective();
  updateCamera();
}

function activePlayers() {
  return role === "single" ? [game.players.blue] : [game.players.blue, game.players.red];
}

function updateCamera() {
  const localPlayer = role === "join" ? game.players.red : game.players.blue;
  const viewInput = role === "join" ? readInput(0, true, getGamepads()) : readAssignedInput("blue", getGamepads());

  if (role === "single" || !viewInput.teamView) {
    game.zoom += (1 - game.zoom) * 0.08;
    game.camera = clamp(localPlayer.x - W * 0.45, 0, level.width - W / game.zoom);
    return;
  }

  const players = activePlayers();
  const minX = Math.min(...players.map((player) => player.x));
  const maxX = Math.max(...players.map((player) => player.x + player.w));
  const centerX = (minX + maxX) / 2;
  const spread = maxX - minX;
  const targetZoom = clamp(W / (spread + 520), 0.58, 1);
  game.zoom += (targetZoom - game.zoom) * 0.08;
  game.camera = clamp(centerX - (W / game.zoom) / 2, 0, level.width - W / game.zoom);
}

function updatePlayer(player, input) {
  const move = input.move || 0;
  if (move < -0.1) player.facing = -1;
  if (move > 0.1) player.facing = 1;
  player.vx += move * 0.49;
  player.vx *= 0.84;
  player.vx = clamp(player.vx, -4.8, 4.8);

  if (input.jump && player.jumps > 0) {
    player.vy = player.grounded ? -12.1 : -12.9;
    player.grounded = false;
    player.jumps -= 1;
  }
  if (input.activate) player.activateFlash = 12;

  player.vy += 0.5;
  moveEntity(player, player.vx, 0);
  player.grounded = false;
  moveEntity(player, 0, player.vy);
  if (player.grounded) player.jumps = 2;
  player.x = clamp(player.x, 0, level.width - player.w);
}

function moveEntity(entity, dx, dy) {
  entity.x += dx;
  entity.y += dy;
  const closedWalls = level.walls.filter((wall) => !wall.open);
  const solids = level.platforms.concat(closedWalls);
  for (const solid of solids) {
    if (!hit(entity, solid)) continue;
    if (dx > 0) entity.x = solid.x - entity.w;
    if (dx < 0) entity.x = solid.x + solid.w;
    if (dy > 0) {
      entity.y = solid.y - entity.h;
      entity.vy = 0;
      entity.grounded = true;
    }
    if (dy < 0) {
      entity.y = solid.y + solid.h;
      entity.vy = 0;
    }
  }
}

function updatePlates() {
  for (const plate of level.plates) {
    const player = role === "single" ? game.players.blue : game.players[plate.color];
    plate.active = plate.active || (hit(player, plate) && player.activateFlash > 0);
  }
}

function updateCores() {
  for (const core of level.cores) {
    const collector = role === "single" ? game.players.blue : game.players[core.color];
    if (!core.taken && hit(collector, core)) core.taken = true;
  }
}

function updateLocks() {
  const bluePlate = level.plates[0].active;
  const redPlate = level.plates[1].active;
  const finalBlue = level.plates[2].active;
  const finalRed = level.plates[3].active;
  const blueWall = level.walls.find((wall) => wall.gate === "blue");
  const redWall = level.walls.find((wall) => wall.gate === "red");
  const finalWall = level.walls.find((wall) => wall.gate === "final");
  blueWall.open = blueWall.open || bluePlate;
  redWall.open = redWall.open || (role === "single" ? redPlate || bluePlate : redPlate);
  finalWall.open = finalWall.open || (role === "single"
    ? finalBlue && level.cores.every((core) => core.taken)
    : finalBlue && finalRed && level.cores.every((core) => core.taken));
  level.door.open = level.walls.find((wall) => wall.gate === "final").open;

  const doorReached = role === "single"
    ? hit(game.players.blue, level.door)
    : hit(game.players.blue, level.door) && hit(game.players.red, level.door);
  if (level.door.open && doorReached) {
    game.endProgress += 0.018;
    if (game.endProgress >= 1) {
      game.running = false;
      objectiveStatus.textContent = "Level Complete";
      game.completed = true;
    }
  } else {
    game.endProgress = 0;
  }
}

function runFinishTest() {
  if (!game.running) return;
  for (const core of level.cores) core.taken = true;
  for (const wall of level.walls) wall.open = true;
  level.door.open = true;
  game.players.blue.x = level.door.x + 12;
  game.players.blue.y = level.door.y + level.door.h - game.players.blue.h;
  game.players.blue.vx = 0;
  game.players.blue.vy = 0;
  if (role !== "single") {
    game.players.red.x = level.door.x + 28;
    game.players.red.y = level.door.y + level.door.h - game.players.red.h;
    game.players.red.vx = 0;
    game.players.red.vy = 0;
  }
  game.endProgress = 0.98;
  game.objective = "Dev test: completing level.";
  objectiveStatus.textContent = game.objective;
}

function resetPlayer(player) {
  const start = level.start[player.color];
  player.x = start[0];
  player.y = start[1];
  player.vx = 0;
  player.vy = 0;
  player.grounded = false;
  player.jumps = 2;
  player.hurt = 24;
}

function updateObjective() {
  if (!level.walls[0].open) game.objective = "Blue stands on blue lock and activates.";
  else if (!level.walls[1].open) game.objective = role === "single" ? "Reach the second lock and activate." : "Red reaches red lock and activates.";
  else if (!level.cores.every((core) => core.taken)) game.objective = role === "single" ? "Collect both quantum cores." : "Each twin collects their matching core.";
  else if (!level.walls[2].open) game.objective = role === "single" ? "Activate the final blue lock." : "Both twins hold final locks together.";
  else game.objective = role === "single" ? "Enter the quantum door." : "Both twins enter the quantum door.";
  objectiveStatus.textContent = game.objective;
}

function readAssignedInput(playerKey, pads = getGamepads()) {
  if (role === "local" && assignment && assignment[playerKey]) {
    const device = assignment[playerKey];
    if (device.type === "keyboard") return readKeyboardInput();
    return readPadInput(device.index, pads);
  }
  return readInput(playerKey === "blue" ? 0 : 1, playerKey === "blue", pads);
}

function readInput(padIndex = 0, includeKeyboard = true, pads = getGamepads()) {
  const keyboard = includeKeyboard ? readKeyboardInput() : blankInput();
  const pad = readPadInput(padIndex, pads);
  return {
    move: pad.move || keyboard.move,
    jump: pad.jump || keyboard.jump,
    activate: pad.activate || keyboard.activate,
    restart: pad.restart || keyboard.restart,
    teamView: pad.teamView || keyboard.teamView,
  };
}

function blankInput() {
  return { move: 0, jump: false, activate: false, restart: false, teamView: false };
}

function readKeyboardInput() {
  return {
    move: (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0),
    jump: pressed("w") || pressed(" ") || pressed("arrowup"),
    activate: keys.has("e"),
    restart: pressed("r"),
    teamView: keys.has("q"),
  };
}

function readPadInput(padIndex, pads = getGamepads()) {
  const pad = pads.find((candidate) => candidate.index === padIndex) || null;
  if (!pad) return blankInput();
  const buttons = pad.buttons.map((button) => button.pressed);
  const previousButtons = previousPads[pad.index] || [];
  const axis = deadzone(pad.axes[0] || 0);
  const dpad = (buttons[15] ? 1 : 0) - (buttons[14] ? 1 : 0);
  return {
    move: axis || dpad,
    jump: buttons[0] && !previousButtons[0],
    activate: buttons[1],
    restart: buttons[9] && !previousButtons[9],
    teamView: buttons[3],
  };
}

function getGamepads() {
  if (!navigator.getGamepads) return [];
  return [...navigator.getGamepads()].filter((pad) => pad && pad.connected);
}

function deadzone(value) {
  return Math.abs(value) < 0.2 ? 0 : clamp(value, -1, 1);
}

function previousFrame(pads = getGamepads()) {
  previousKeys.clear();
  for (const key of keys) previousKeys.add(key);
  previousPads = [];
  for (const pad of pads) previousPads[pad.index] = pad.buttons.map((button) => button.pressed);
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawBackground();
  ctx.save();
  ctx.scale(game.zoom, game.zoom);
  ctx.translate(-game.camera, 0);
  drawLevel();
  drawPlayers();
  drawWorldLighting();
  ctx.restore();
  drawHud();
  if (game.completed) drawCompletionBanner();
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, "#050814");
  gradient.addColorStop(0.45, "#101826");
  gradient.addColorStop(1, "#030509");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(-game.camera * 0.08, 0);
  for (let i = -2; i < 16; i += 1) {
    const x = i * 310;
    const tower = ctx.createLinearGradient(x, 140, x + 190, 640);
    tower.addColorStop(0, "rgba(89,216,255,0.04)");
    tower.addColorStop(1, "rgba(246,239,226,0.01)");
    ctx.fillStyle = tower;
    ctx.beginPath();
    ctx.moveTo(x + 40, 620);
    ctx.lineTo(x + 110, 180 + Math.sin(i) * 60);
    ctx.lineTo(x + 210, 620);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(89,216,255,0.055)";
    ctx.stroke();
  }
  for (let i = -2; i < 18; i += 1) {
    const x = i * 220;
    ctx.strokeStyle = "rgba(89,216,255,0.08)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, 380 + Math.sin(i) * 55, 150, 34, -0.42, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,93,110,0.055)";
    ctx.beginPath();
    ctx.ellipse(x + 90, 270 + Math.cos(i) * 44, 110, 24, 0.55, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  const coreGlow = ctx.createRadialGradient(W * 0.72, H * 0.34, 60, W * 0.72, H * 0.34, 520);
  coreGlow.addColorStop(0, "rgba(117,240,162,0.13)");
  coreGlow.addColorStop(0.45, "rgba(89,216,255,0.06)");
  coreGlow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = coreGlow;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 90; i += 1) {
    const x = (i * 151 - game.camera * 0.18) % W;
    const y = (i * 89) % H;
    ctx.fillStyle = i % 3 === 0 ? "rgba(89,216,255,0.45)" : "rgba(246,239,226,0.3)";
    ctx.beginPath();
    ctx.arc(x < 0 ? x + W : x, y, (i % 4) + 1, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawWorldLighting() {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const player of activePlayers()) {
    const color = player.color === "blue" ? "89,216,255" : "255,93,110";
    const light = ctx.createRadialGradient(player.x + player.w / 2, player.y + 18, 8, player.x + player.w / 2, player.y + 18, 190);
    light.addColorStop(0, `rgba(${color},0.18)`);
    light.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = light;
    ctx.fillRect(player.x - 190, player.y - 180, 380, 380);
  }
  const doorLight = ctx.createRadialGradient(level.door.x + 36, level.door.y + 70, 10, level.door.x + 36, level.door.y + 70, 260);
  doorLight.addColorStop(0, level.door.open ? "rgba(117,240,162,0.28)" : "rgba(89,216,255,0.12)");
  doorLight.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = doorLight;
  ctx.fillRect(level.door.x - 240, level.door.y - 190, 520, 520);
  ctx.restore();
}

function drawLevel() {
  for (const platform of level.platforms) {
    drawPlatform(platform);
  }

  for (const hazard of level.hazards) {
    ctx.fillStyle = "rgba(255,93,110,0.85)";
    ctx.fillRect(hazard.x, hazard.y, hazard.w, hazard.h);
    ctx.fillStyle = "rgba(255,93,110,0.22)";
    ctx.fillRect(hazard.x - 8, hazard.y - 18, hazard.w + 16, 18);
  }

  ctx.fillStyle = "rgba(255,93,110,0.12)";
  ctx.fillRect(game.camera - 200, level.deathY - 24, W / game.zoom + 400, 80);
  ctx.fillStyle = "rgba(255,93,110,0.4)";
  ctx.fillRect(game.camera - 200, level.deathY - 24, W / game.zoom + 400, 4);

  for (const mover of level.movers) drawMover(mover);
  for (const molecule of level.molecules) drawMolecule(molecule);
  for (const core of level.cores) if (!core.taken) drawCore(core);
  for (const plate of level.plates) drawPlate(plate);
  for (const wall of level.walls) drawWall(wall);
  drawDoor();
}

function drawMover(mover) {
  ctx.save();
  ctx.shadowColor = "#ff5d6e";
  ctx.shadowBlur = 18;
  const body = ctx.createLinearGradient(mover.x, mover.y, mover.x, mover.y + mover.h);
  body.addColorStop(0, "rgba(255,93,110,0.9)");
  body.addColorStop(0.5, "rgba(86,28,44,0.9)");
  body.addColorStop(1, "rgba(255,93,110,0.78)");
  ctx.fillStyle = body;
  ctx.fillRect(mover.x, mover.y, mover.w, mover.h);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#f6efe2";
  ctx.lineWidth = 3;
  ctx.strokeRect(mover.x + 6, mover.y + 6, mover.w - 12, mover.h - 12);
  ctx.fillStyle = "rgba(246,239,226,0.18)";
  ctx.fillRect(mover.x + 14, mover.y + 18, mover.w - 28, 8);
  ctx.fillRect(mover.x + 14, mover.y + mover.h - 26, mover.w - 28, 8);
  ctx.restore();
}

function drawPlatform(platform) {
  const body = ctx.createLinearGradient(0, platform.y, 0, platform.y + platform.h);
  body.addColorStop(0, "#344256");
  body.addColorStop(0.42, "#202a3a");
  body.addColorStop(1, "#121824");
  ctx.fillStyle = body;
  ctx.fillRect(platform.x, platform.y, platform.w, platform.h);

  ctx.fillStyle = "rgba(89,216,255,0.55)";
  ctx.fillRect(platform.x, platform.y, platform.w, 5);
  ctx.fillStyle = "rgba(246,239,226,0.11)";
  for (let x = platform.x + 24; x < platform.x + platform.w - 12; x += 74) {
    ctx.fillRect(x, platform.y + 12, 36, 4);
  }
  ctx.strokeStyle = "rgba(89,216,255,0.22)";
  ctx.lineWidth = 2;
  ctx.strokeRect(platform.x + 2, platform.y + 2, platform.w - 4, platform.h - 4);
}

function drawMolecule(molecule) {
  const x = molecule.x;
  const y = molecule.y + Math.sin(game.time * 2 + molecule.phase) * 10;
  const glow = ctx.createRadialGradient(x, y, 8, x, y, molecule.r * 2.2);
  glow.addColorStop(0, "rgba(246,239,226,0.16)");
  glow.addColorStop(1, "rgba(246,239,226,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, molecule.r * 2.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(246,239,226,0.56)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x - 24, y);
  ctx.lineTo(x + 24, y + 12);
  ctx.lineTo(x + 4, y - 28);
  ctx.stroke();
  for (const atom of [[-24, 0, "#59d8ff"], [24, 12, "#ff5d6e"], [4, -28, "#75f0a2"]]) {
    ctx.shadowColor = atom[2];
    ctx.shadowBlur = 18;
    ctx.fillStyle = atom[2];
    ctx.beginPath();
    ctx.arc(x + atom[0], y + atom[1], molecule.r * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(246,239,226,0.42)";
    ctx.beginPath();
    ctx.arc(x + atom[0] - 4, y + atom[1] - 4, molecule.r * 0.12, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawCore(core) {
  ctx.save();
  ctx.translate(core.x + core.w / 2, core.y + core.h / 2);
  ctx.rotate(game.time * 2.5);
  ctx.fillStyle = role === "single" ? "#75f0a2" : core.color === "blue" ? "#59d8ff" : "#ff5d6e";
  ctx.fillRect(-14, -14, 28, 28);
  ctx.strokeStyle = "#f6efe2";
  ctx.strokeRect(-20, -20, 40, 40);
  ctx.restore();
}

function drawPlate(plate) {
  const plateColor = role === "single" ? "blue" : plate.color;
  const baseColor = plateColor === "blue" ? "#59d8ff" : "#ff5d6e";
  ctx.shadowColor = plate.active ? "#243447" : baseColor;
  ctx.shadowBlur = plate.active ? 2 : 26;
  ctx.fillStyle = plate.active ? "rgba(75,90,105,0.75)" : plateColor === "blue" ? "#40c8ff" : "#ff4f68";
  ctx.fillRect(plate.x, plate.y, plate.w, plate.h);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = plate.active ? "rgba(246,239,226,0.28)" : "#f6efe2";
  ctx.strokeRect(plate.x - 6, plate.y - 6, plate.w + 12, plate.h + 12);
  if (!plate.active) {
    ctx.fillStyle = "rgba(246,239,226,0.38)";
    ctx.fillRect(plate.x + 12, plate.y + 5, plate.w - 24, 4);
  }
}

function drawWall(wall) {
  if (wall.open) {
    ctx.fillStyle = "rgba(117,240,162,0.15)";
    ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
    ctx.strokeStyle = "rgba(117,240,162,0.48)";
    ctx.strokeRect(wall.x + 8, wall.y + 10, wall.w - 16, wall.h - 20);
    return;
  }
  const wallColor = role === "single" ? "blue" : wall.gate;
  ctx.shadowColor = wallColor === "blue" ? "#59d8ff" : wallColor === "red" ? "#ff5d6e" : "#f2c14e";
  ctx.shadowBlur = 16;
  ctx.fillStyle = wallColor === "blue" ? "rgba(89,216,255,0.68)" : wallColor === "red" ? "rgba(255,93,110,0.68)" : "rgba(242,193,78,0.74)";
  ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#f6efe2";
  ctx.strokeRect(wall.x + 8, wall.y + 10, wall.w - 16, wall.h - 20);
}

function drawDoor() {
  ctx.shadowColor = level.door.open ? "#75f0a2" : "#59d8ff";
  ctx.shadowBlur = level.door.open ? 24 : 10;
  ctx.fillStyle = level.door.open ? "rgba(117,240,162,0.62)" : "rgba(89,216,255,0.22)";
  ctx.fillRect(level.door.x, level.door.y, level.door.w, level.door.h);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = level.door.open ? "#75f0a2" : "#59d8ff";
  ctx.lineWidth = 4;
  ctx.strokeRect(level.door.x, level.door.y, level.door.w, level.door.h);
  if (level.door.open) {
    ctx.strokeStyle = "rgba(246,239,226,0.75)";
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.arc(level.door.x + 36, level.door.y + 72, 14 + i * 10, game.time * 3 + i, game.time * 3 + i + Math.PI);
      ctx.stroke();
    }
  }
}

function drawPlayers() {
  drawEinstein(game.players.blue);
  if (role !== "single") drawEinstein(game.players.red);
}

function drawEinstein(player) {
  ctx.save();
  ctx.translate(player.x + player.w / 2, player.y + player.h);
  if (player.hurt > 0) ctx.globalAlpha = 0.55;
  ctx.fillStyle = player.color === "blue" ? "#2478ad" : "#9b3142";
  ctx.fillRect(-16, -48, 32, 26);
  ctx.fillStyle = "#f2c14e";
  ctx.fillRect(-13, -76, 26, 24);
  ctx.fillStyle = "#f6efe2";
  ctx.fillRect(-18, -81, 8, 16);
  ctx.fillRect(10, -81, 8, 16);
  ctx.fillRect(-10, -85, 20, 9);
  ctx.fillStyle = "#10131a";
  ctx.fillRect(-7, -67, 4, 4);
  ctx.fillRect(4, -67, 4, 4);
  ctx.fillRect(-8, -58, 16, 4);
  ctx.fillStyle = "#111722";
  ctx.fillRect(-13, -22, 11, 22);
  ctx.fillRect(2, -22, 11, 22);
  ctx.fillStyle = "rgba(246,239,226,0.9)";
  ctx.fillRect(-15, -2, 14, 3);
  ctx.fillRect(1, -2, 14, 3);
  if (!player.grounded) {
    ctx.fillStyle = player.color === "blue" ? "#59d8ff" : "#ff5d6e";
    ctx.fillRect(-18, -10, 5, 14);
    ctx.fillRect(13, -10, 5, 14);
  }
  if (player.activateFlash > 0) {
    ctx.strokeStyle = "#75f0a2";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, -34, 38 + player.activateFlash, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHud() {
  ctx.fillStyle = "rgba(3,5,10,0.62)";
  ctx.fillRect(24, 24, 510, 44);
  ctx.strokeStyle = "rgba(89,216,255,0.34)";
  ctx.strokeRect(24, 24, 510, 44);
  ctx.fillStyle = "#f6efe2";
  ctx.font = "800 15px Inter, sans-serif";
  ctx.fillText(game.objective, 40, 52);
}

function drawCompletionBanner() {
  ctx.fillStyle = "rgba(3,5,10,0.72)";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(117,240,162,0.18)";
  ctx.fillRect(W / 2 - 330, H / 2 - 92, 660, 184);
  ctx.strokeStyle = "#75f0a2";
  ctx.lineWidth = 4;
  ctx.strokeRect(W / 2 - 330, H / 2 - 92, 660, 184);
  ctx.fillStyle = "#f6efe2";
  ctx.font = "900 42px Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("CONGRATULATIONS", W / 2, H / 2 - 22);
  ctx.font = "800 24px Inter, sans-serif";
  ctx.fillText(`${level.name} Completed`, W / 2, H / 2 + 24);
  ctx.font = "700 16px Inter, sans-serif";
  ctx.fillStyle = "#aeb7c8";
  ctx.fillText(currentLevelIndex < LEVELS.length - 1 ? "Press N for next level or R to replay" : "All levels complete. Press R to replay.", W / 2, H / 2 + 58);
  ctx.textAlign = "left";
}

document.querySelector("#show-single").addEventListener("click", () => showPanel("single-panel"));
document.querySelector("#show-multi").addEventListener("click", () => showPanel("multi-panel"));
document.querySelector("#start-single").addEventListener("click", startSingle);
fullscreenToggle.addEventListener("click", toggleFullscreen);
levelSelect.addEventListener("change", () => goToLevel(Number(levelSelect.value)));
document.querySelector("#local-coop").addEventListener("click", startLocalCoop);
document.querySelector("#online-menu").addEventListener("click", showOnlineActions);
document.querySelector("#host-game").addEventListener("click", hostGame);
assignBlue.addEventListener("click", () => {
  chooseAssignment("blue");
  confirmAssignment();
});
assignRed.addEventListener("click", () => {
  chooseAssignment("red");
  confirmAssignment();
});
document.querySelector("#join-game").addEventListener("click", () => {
  joinForm.classList.add("active");
  roomInput.focus();
});
for (const back of document.querySelectorAll(".back")) back.addEventListener("click", () => showPanel("intro-panel"));
joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const code = roomInput.value.trim().toUpperCase();
  if (code.length !== 6) {
    networkMessage.textContent = "Enter the 6-character room code.";
    return;
  }
  joinGame(code);
});

window.addEventListener("keydown", (event) => {
  keys.add(event.key.toLowerCase());
  if (event.key.toLowerCase() === "r" && game.completed) {
    startLevel(modeStatus.textContent || "Single");
    return;
  }
  if (event.key.toLowerCase() === "n" && game.completed) {
    nextLevel();
    return;
  }
  if (assignment && assignment.pending && (event.key === "ArrowLeft" || event.key.toLowerCase() === "a")) chooseAssignment("blue");
  if (assignment && assignment.pending && (event.key === "ArrowRight" || event.key.toLowerCase() === "d")) chooseAssignment("red");
  if (event.key === "Enter") {
    if (assignment && assignment.pending) confirmAssignment();
    else detectAssignment({ type: "keyboard" });
  }
  if (event.key.toLowerCase() === "t") runFinishTest();
  if (event.key.toLowerCase() === "f") toggleFullscreen();
  if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) event.preventDefault();
});
window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
document.addEventListener("fullscreenchange", updateFullscreenButton);
document.addEventListener("webkitfullscreenchange", updateFullscreenButton);

setInterval(() => {
  if (!assignment) return;
  const pads = getGamepads();
  for (let index = 0; index < pads.length; index += 1) {
    const pad = pads[index];
    const buttons = pad.buttons.map((button) => button.pressed);
    const oldButtons = previousPads[pad.index] || [];
    const move = deadzone(pad.axes[0] || 0) || ((buttons[15] ? 1 : 0) - (buttons[14] ? 1 : 0));
    if (assignment.pending && assignment.pending.type === "pad" && assignment.pending.index === pad.index) {
      if (move < -0.45) chooseAssignment("blue");
      if (move > 0.45) chooseAssignment("red");
      if (buttons[0] && !oldButtons[0]) confirmAssignment();
    }
    if (buttons.some((button, buttonIndex) => button && !oldButtons[buttonIndex])) {
      detectAssignment({ type: "pad", index: pad.index });
    }
  }
  previousPads = [];
  for (const pad of pads) previousPads[pad.index] = pad.buttons.map((button) => button.pressed);
}, 120);

draw();
