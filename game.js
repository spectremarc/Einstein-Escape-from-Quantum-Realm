const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
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

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const pressed = (key) => keys.has(key) && !previousKeys.has(key);

const level = {
  width: 3200,
  deathY: 820,
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
  crushers: [
    { x: 940, baseY: 500, y: 500, w: 62, h: 60, phase: 0, range: 0 },
  ],
  door: { x: 3000, y: 505, w: 72, h: 145, open: false },
};

let game = createGame();

function createGame() {
  for (const wall of level.walls) wall.open = false;
  for (const plate of level.plates) plate.active = false;
  for (const core of level.cores) core.taken = false;
  level.door.open = false;
  return {
    running: false,
    camera: 0,
    zoom: 1,
    time: 0,
    objective: "Choose a mode",
    endProgress: 0,
    players: {
      blue: makePlayer("blue", 110, 560),
      red: makePlayer("red", 180, 560),
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
  role = "single";
  roomStatus.textContent = "LOCAL";
  startLevel("Single");
}

function startLocalCoop() {
  assignment = { blue: null, red: null, pending: null, selected: "blue" };
  roomStatus.textContent = "LOCAL";
  networkMessage.textContent = "Claim an input device, then choose Blue or Red.";
  localAssign.classList.add("active");
  assignP1.textContent = "Waiting for input device.";
  assignP2.textContent = "Use Left / Right to select, then Enter / A to confirm.";
  renderAssignment();
}

function startLevel(mode) {
  game = createGame();
  game.running = true;
  modeStatus.textContent = mode;
  menu.classList.add("hidden");
  loop();
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
  });
  conn.on("close", () => {
    objectiveStatus.textContent = "Disconnected";
  });
}

function send(message) {
  if (conn && conn.open) conn.send(message);
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
  if (!changed && now - lastPlayerSend < 1 / 10) return;
  if (changed || now - lastPlayerSend > 1 / 20) {
    send({ type: "player", color, player: packPlayer(game.players[color]) });
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
  for (const crusher of level.crushers) {
    crusher.y = crusher.range
      ? crusher.baseY + (Math.sin(game.time * 1.8 + crusher.phase) + 1) * 0.5 * crusher.range
      : crusher.baseY;
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
    for (const crusher of level.crushers) {
      if (hit(player, crusher)) resetPlayer(player);
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
  if (role === "single") {
    game.zoom += (1 - game.zoom) * 0.08;
    game.camera = clamp(game.players.blue.x - W * 0.45, 0, level.width - W / game.zoom);
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
  player.vx += move * 0.56;
  player.vx *= 0.84;
  player.vx = clamp(player.vx, -5.4, 5.4);

  if (input.jump && player.jumps > 0) {
    player.vy = player.grounded ? -10.8 : -11.4;
    player.grounded = false;
    player.jumps -= 1;
  }
  if (input.activate) player.activateFlash = 12;

  player.vy += 0.52;
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
    const player = game.players[plate.color];
    plate.active = hit(player, plate) && player.activateFlash > 0;
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
  player.x = player.color === "blue" ? 110 : 180;
  player.y = 560;
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
  };
}

function blankInput() {
  return { move: 0, jump: false, activate: false, restart: false };
}

function readKeyboardInput() {
  return {
    move: (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0),
    jump: pressed("w") || pressed(" ") || pressed("arrowup"),
    activate: keys.has("e"),
    restart: pressed("r"),
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

  for (let i = 0; i < 90; i += 1) {
    const x = (i * 151 - game.camera * 0.18) % W;
    const y = (i * 89) % H;
    ctx.fillStyle = i % 3 === 0 ? "rgba(89,216,255,0.45)" : "rgba(246,239,226,0.3)";
    ctx.beginPath();
    ctx.arc(x < 0 ? x + W : x, y, (i % 4) + 1, 0, Math.PI * 2);
    ctx.fill();
  }
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

  for (const crusher of level.crushers) drawCrusher(crusher);
  for (const molecule of level.molecules) drawMolecule(molecule);
  for (const core of level.cores) if (!core.taken) drawCore(core);
  for (const plate of level.plates) drawPlate(plate);
  for (const wall of level.walls) drawWall(wall);
  drawDoor();
}

function drawCrusher(crusher) {
  ctx.save();
  ctx.shadowColor = "#ff5d6e";
  ctx.shadowBlur = 18;
  const body = ctx.createLinearGradient(crusher.x, crusher.y, crusher.x, crusher.y + crusher.h);
  body.addColorStop(0, "rgba(255,93,110,0.9)");
  body.addColorStop(0.5, "rgba(86,28,44,0.9)");
  body.addColorStop(1, "rgba(255,93,110,0.78)");
  ctx.fillStyle = body;
  ctx.fillRect(crusher.x, crusher.y, crusher.w, crusher.h);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#f6efe2";
  ctx.lineWidth = 3;
  ctx.strokeRect(crusher.x + 6, crusher.y + 6, crusher.w - 12, crusher.h - 12);
  ctx.fillStyle = "rgba(246,239,226,0.18)";
  ctx.fillRect(crusher.x + 14, crusher.y + 24, crusher.w - 28, 8);
  ctx.fillRect(crusher.x + 14, crusher.y + crusher.h - 32, crusher.w - 28, 8);
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
  const soloNeutral = role === "single" && plate.color === "red";
  ctx.shadowColor = plate.active ? "#75f0a2" : soloNeutral ? "#f2c14e" : plate.color === "blue" ? "#59d8ff" : "#ff5d6e";
  ctx.shadowBlur = plate.active ? 18 : 8;
  ctx.fillStyle = plate.active ? "#75f0a2" : soloNeutral ? "#6c5a26" : plate.color === "blue" ? "#246e9e" : "#923548";
  ctx.fillRect(plate.x, plate.y, plate.w, plate.h);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = soloNeutral ? "#f2c14e" : plate.color === "blue" ? "#59d8ff" : "#ff5d6e";
  ctx.strokeRect(plate.x - 6, plate.y - 6, plate.w + 12, plate.h + 12);
}

function drawWall(wall) {
  if (wall.open) {
    ctx.fillStyle = "rgba(117,240,162,0.15)";
    ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
    ctx.strokeStyle = "rgba(117,240,162,0.48)";
    ctx.strokeRect(wall.x + 8, wall.y + 10, wall.w - 16, wall.h - 20);
    return;
  }
  ctx.shadowColor = wall.gate === "blue" ? "#59d8ff" : wall.gate === "red" ? "#ff5d6e" : "#f2c14e";
  ctx.shadowBlur = 16;
  ctx.fillStyle = wall.gate === "blue" ? "rgba(89,216,255,0.68)" : wall.gate === "red" ? "rgba(255,93,110,0.68)" : "rgba(242,193,78,0.74)";
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
  ctx.fillText("Level 1 Completed", W / 2, H / 2 + 24);
  ctx.font = "700 16px Inter, sans-serif";
  ctx.fillStyle = "#aeb7c8";
  ctx.fillText("Press R to replay the level", W / 2, H / 2 + 58);
  ctx.textAlign = "left";
}

document.querySelector("#show-single").addEventListener("click", () => showPanel("single-panel"));
document.querySelector("#show-multi").addEventListener("click", () => showPanel("multi-panel"));
document.querySelector("#start-single").addEventListener("click", startSingle);
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
  if (assignment && assignment.pending && (event.key === "ArrowLeft" || event.key.toLowerCase() === "a")) chooseAssignment("blue");
  if (assignment && assignment.pending && (event.key === "ArrowRight" || event.key.toLowerCase() === "d")) chooseAssignment("red");
  if (event.key === "Enter") {
    if (assignment && assignment.pending) confirmAssignment();
    else detectAssignment({ type: "keyboard" });
  }
  if (event.key.toLowerCase() === "t") runFinishTest();
  if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) event.preventDefault();
});
window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));

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
