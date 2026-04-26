const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const overlay = document.querySelector("#overlay");
const startButton = document.querySelector("#start");
const stabilityText = document.querySelector("#stability");
const weaponText = document.querySelector("#weapon");
const coresText = document.querySelector("#cores");
const controllerStatus = document.querySelector("#controller-status");

const W = canvas.width;
const H = canvas.height;
const keys = new Set();
const previousKeys = new Set();
let previousPadButtons = [];
const weapons = ["Plasma Rifle", "Laser Blade", "Gravity Manipulator"];
let game;
let rafId;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const hit = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

function createGame() {
  for (const gate of level.gates) gate.open = false;
  for (const sw of level.switches) sw.active = false;
  level.exit.ready = false;
  level.exit.open = false;
  game = {
    running: false,
    won: false,
    lost: false,
    exiting: false,
    exitProgress: 0,
    time: 0,
    slowUntil: 0,
    camera: 0,
    message: "",
    player: {
      x: 64,
      y: 520,
      w: 38,
      h: 54,
      vx: 0,
      vy: 0,
      facing: 1,
      grounded: false,
      jumpsLeft: 2,
      jetTimer: 0,
      stability: 100,
      weapon: 0,
      cooldown: 0,
      hurtTimer: 0,
    },
    bullets: [],
    particles: [],
    cores: [
      { x: 560, y: 408, w: 26, h: 26, taken: false },
      { x: 1255, y: 315, w: 26, h: 26, taken: false },
      { x: 1975, y: 420, w: 26, h: 26, taken: false },
    ],
    enemies: [
      makeEnemy(420, 502, 110),
      makeEnemy(865, 452, 150),
      makeEnemy(1510, 498, 170),
      makeEnemy(2100, 442, 160),
    ],
    guardian: { x: 2280, y: 372, w: 86, h: 116, hp: 14, phase: 0, cooldown: 0 },
  };
  return game;
}

function resetGame() {
  createGame();
  game.running = true;
  overlay.classList.add("hidden");
  loop();
}

function makeEnemy(x, y, range) {
  return { x, y, w: 58, h: 58, base: x, range, vx: 1.05, hp: 5, alive: true, pulse: Math.random() * 6 };
}

const level = {
  width: 2520,
  platforms: [
    { x: 0, y: 662, w: 2520, h: 58, kind: "ground" },
    { x: 210, y: 560, w: 200, h: 22 },
    { x: 500, y: 480, w: 190, h: 22 },
    { x: 760, y: 510, w: 250, h: 22 },
    { x: 1115, y: 400, w: 240, h: 22 },
    { x: 1435, y: 560, w: 235, h: 22 },
    { x: 1810, y: 500, w: 250, h: 22 },
    { x: 2175, y: 500, w: 260, h: 22 },
  ],
  hazards: [
    { x: 690, y: 646, w: 155, h: 16 },
    { x: 1365, y: 646, w: 150, h: 16 },
    { x: 2058, y: 646, w: 130, h: 16 },
  ],
  gravityWells: [
    { x: 1015, y: 445, r: 86, strength: -0.9 },
    { x: 1708, y: 575, r: 92, strength: -1.1 },
  ],
  gates: [
    { x: 1012, y: 546, w: 42, h: 116, open: false },
    { x: 1710, y: 546, w: 42, h: 116, open: false },
  ],
  switches: [
    { x: 900, y: 474, w: 42, h: 20, gate: 0, active: false, label: "Gate A" },
    { x: 1580, y: 526, w: 42, h: 20, gate: 1, active: false, label: "Gate B" },
  ],
  exit: { x: 2415, y: 410, w: 54, h: 90 },
};

function loop(timestamp = 0) {
  cancelAnimationFrame(rafId);
  if (!game.running) return;
  update(timestamp / 1000);
  draw();
  rafId = requestAnimationFrame(loop);
}

function update(now) {
  const p = game.player;
  const input = readInput();
  const dt = game.slowUntil > now ? 0.52 : 1;
  game.time = now;
  p.cooldown = Math.max(0, p.cooldown - dt);
  p.hurtTimer = Math.max(0, p.hurtTimer - dt);
  p.jetTimer = Math.max(0, p.jetTimer - dt);

  if (input.tool0) p.weapon = 0;
  if (input.tool1) p.weapon = 1;
  if (input.tool2) p.weapon = 2;
  if (input.prevTool) p.weapon = (p.weapon + weapons.length - 1) % weapons.length;
  if (input.nextTool) p.weapon = (p.weapon + 1) % weapons.length;
  if (input.restartPressed) {
    previousPadButtons = input.padButtons;
    resetGame();
    return;
  }
  if (input.slow) game.slowUntil = now + 0.24;

  if (game.exiting) {
    updateExitAnimation(dt);
    return;
  }

  const accel = 0.52;
  if (input.move < -0.1) {
    p.vx += accel * input.move;
    p.facing = -1;
  }
  if (input.move > 0.1) {
    p.vx += accel * input.move;
    p.facing = 1;
  }
  p.vx *= 0.83;
  p.vx = clamp(p.vx, -5.25, 5.25);

  if (input.jumpPressed) jump();
  if (input.activatePressed) activateNearbySwitch();

  if (input.fire) fireWeapon();

  p.vy += 0.5 * dt;
  for (const well of level.gravityWells) {
    const dx = p.x + p.w / 2 - well.x;
    const dy = p.y + p.h / 2 - well.y;
    const distance = Math.hypot(dx, dy);
    if (distance < well.r) p.vy += well.strength * (1 - distance / well.r);
  }

  move(p, p.vx * dt, 0);
  p.grounded = false;
  move(p, 0, p.vy * dt);
  if (p.grounded) p.jumpsLeft = 2;
  p.x = clamp(p.x, 0, level.width - p.w);

  updateBullets(dt);
  updateEnemies(dt);
  updateGuardian(dt);
  updatePickups();
  updateHazards();
  updateParticles(dt);

  game.camera = clamp(p.x - W * 0.38, 0, level.width - W);
  const cores = game.cores.filter((core) => core.taken).length;
  stabilityText.textContent = `${Math.ceil(p.stability)}%`;
  weaponText.textContent = weapons[p.weapon];
  coresText.textContent = `${cores}/3`;

  if (p.stability <= 0) endGame(false, "The realm collapsed around Einstein.");
  if (cores === 3 && game.guardian.hp <= 0) level.exit.ready = true;
  if (cores < 3) game.message = "Recover three unstable cores.";
  else if (game.guardian.hp > 0) game.message = "Weaken the nucleus guardian.";
  else game.message = "Open the exit door with E / B.";

  previousKeys.clear();
  for (const key of keys) previousKeys.add(key);
  previousPadButtons = input.padButtons;
}

function updateExitAnimation(dt) {
  const p = game.player;
  game.exitProgress += 0.012 * dt;
  const doorCenter = level.exit.x + level.exit.w / 2 - p.w / 2;
  p.x += (doorCenter - p.x) * 0.08;
  p.y += (level.exit.y + 26 - p.y) * 0.07;
  game.camera = clamp(p.x - W * 0.38, 0, level.width - W);
  updateParticles(dt);
  if (Math.random() > 0.55) {
    burst(level.exit.x + level.exit.w / 2, level.exit.y + level.exit.h / 2, "#61e9ff", 2);
  }
  if (game.exitProgress >= 1) {
    endGame(true, "Einstein opens the quantum door and returns to normal scale.");
  }
}

function readInput() {
  const pad = getActiveGamepad();
  const buttons = pad ? pad.buttons.map((button) => button.pressed) : [];
  const pressed = (index) => buttons[index] && !previousPadButtons[index];
  const axis = pad ? normalizeAxis(pad.axes[0] || 0) : 0;
  const dpad = (buttons[15] ? 1 : 0) - (buttons[14] ? 1 : 0);
  const keyboardMove = (keys.has("d") || keys.has("arrowright") ? 1 : 0) - (keys.has("a") || keys.has("arrowleft") ? 1 : 0);
  const move = Math.abs(axis) > 0.22 ? axis : dpad || keyboardMove;
  updateControllerStatus(pad);

  return {
    move,
    jumpPressed: keyPressed("w") || keyPressed(" ") || keyPressed("arrowup") || pressed(0),
    fire: keys.has("j") || buttons[2] || buttons[7],
    activatePressed: keyPressed("e") || pressed(1) || pressed(3),
    slow: keys.has("shift") || buttons[3],
    tool0: keys.has("1"),
    tool1: keys.has("2"),
    tool2: keys.has("3"),
    prevTool: pressed(4),
    nextTool: pressed(5),
    restartPressed: pressed(8) || pressed(9),
    padButtons: buttons,
  };
}

function getActiveGamepad() {
  if (!navigator.getGamepads) return null;
  const pads = navigator.getGamepads();
  for (const pad of pads) {
    if (pad && pad.connected) return pad;
  }
  return null;
}

function normalizeAxis(value) {
  return Math.abs(value) < 0.22 ? 0 : clamp(value, -1, 1);
}

function updateControllerStatus(pad) {
  if (!controllerStatus) return;
  controllerStatus.textContent = pad ? `Controller: ${pad.id.slice(0, 28)}` : "Controller: press any button";
}

function keyPressed(key) {
  return keys.has(key) && !previousKeys.has(key);
}

function jump() {
  const p = game.player;
  if (p.grounded) {
    p.vy = -10.5;
    p.grounded = false;
    p.jumpsLeft = 1;
    burst(p.x + p.w / 2, p.y + p.h, "#61e9ff", 8);
    return;
  }

  if (p.jumpsLeft > 0) {
    p.vy = -11.5;
    p.jumpsLeft -= 1;
    p.jetTimer = 18;
    burst(p.x + p.w / 2, p.y + p.h + 4, "#f2c14e", 18);
    burst(p.x + p.w / 2, p.y + p.h + 8, "#61e9ff", 8);
  }
}

function activateNearbySwitch() {
  const p = game.player;
  const reach = { x: p.x - 18, y: p.y - 10, w: p.w + 36, h: p.h + 30 };
  for (const sw of level.switches) {
    if (hit(reach, sw) && !sw.active) {
      sw.active = true;
      level.gates[sw.gate].open = true;
      burst(sw.x + sw.w / 2, sw.y + sw.h / 2, "#7df59a", 24);
    }
  }

  const cores = game.cores.filter((core) => core.taken).length;
  if (hit(reach, level.exit) && level.exit.ready && !game.exiting) {
    level.exit.open = true;
    game.exiting = true;
    game.exitProgress = 0;
    p.vx = 0;
    p.vy = 0;
    burst(level.exit.x + level.exit.w / 2, level.exit.y + level.exit.h / 2, "#61e9ff", 34);
  } else if (hit(reach, level.exit) && (cores < 3 || game.guardian.hp > 0)) {
    burst(level.exit.x + level.exit.w / 2, level.exit.y + level.exit.h / 2, "#ff5c7a", 10);
  }
}

function move(entity, dx, dy) {
  entity.x += dx;
  entity.y += dy;
  const solids = level.platforms.concat(level.gates.filter((gate) => !gate.open));
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

function fireWeapon() {
  const p = game.player;
  if (p.cooldown > 0) return;

  if (p.weapon === 0) {
    game.bullets.push({
      x: p.x + (p.facing > 0 ? p.w : -8),
      y: p.y + 18,
      w: 14,
      h: 7,
      vx: 12 * p.facing,
      damage: 1,
      color: "#61e9ff",
      life: 80,
    });
    p.cooldown = 9;
  } else if (p.weapon === 1) {
    const blade = { x: p.x + (p.facing > 0 ? p.w : -48), y: p.y + 6, w: 48, h: 38 };
    damageIn(blade, 3);
    burst(blade.x + blade.w / 2, blade.y + blade.h / 2, "#f2c14e", 12);
    p.cooldown = 20;
  } else {
    const pulse = { x: p.x - 90, y: p.y - 70, w: p.w + 180, h: p.h + 140 };
    damageIn(pulse, 1);
    game.slowUntil = game.time + 0.35;
    burst(p.x + p.w / 2, p.y + p.h / 2, "#7df59a", 28);
    p.cooldown = 54;
  }
}

function damageIn(area, amount) {
  let connected = false;
  for (const enemy of game.enemies) {
    if (enemy.alive && hit(area, enemy)) {
      connected = true;
      enemy.hp -= amount;
      if (enemy.hp <= 0) {
        enemy.alive = false;
        burst(enemy.x + enemy.w / 2, enemy.y + enemy.h / 2, "#ff5c7a", 18);
      }
    }
  }
  if (game.guardian.hp > 0 && hit(area, game.guardian)) {
    connected = true;
    game.guardian.hp -= amount;
    burst(game.guardian.x + game.guardian.w / 2, game.guardian.y + 40, "#f2c14e", 10);
  }
  return connected;
}

function updateBullets(dt) {
  for (const bullet of game.bullets) {
    bullet.x += bullet.vx * dt;
    bullet.life -= dt;
    if (!bullet.hostile && damageIn(bullet, bullet.damage)) bullet.life = 0;
    for (const solid of level.platforms) {
      if (hit(bullet, solid)) bullet.life = 0;
    }
  }
  game.bullets = game.bullets.filter((bullet) => bullet.life > 0);
}

function updateSwitches() {
  const p = game.player;
  for (const sw of level.switches) {
    if (hit(p, sw)) level.gates[sw.gate].open = true;
  }
}

function updateEnemies(dt) {
  const p = game.player;
  for (const enemy of game.enemies) {
    if (!enemy.alive) continue;
    enemy.pulse += 0.08 * dt;
    enemy.x += enemy.vx * dt;
    if (Math.abs(enemy.x - enemy.base) > enemy.range) enemy.vx *= -1;
    if (hit(p, enemy)) hurt(0.55);
  }
}

function updateGuardian(dt) {
  const g = game.guardian;
  if (g.hp <= 0) return;
  g.phase += 0.035 * dt;
  g.y = 372 + Math.sin(g.phase) * 18;
  g.cooldown -= dt;
  if (g.cooldown <= 0) {
    const dir = game.player.x < g.x ? -1 : 1;
    game.bullets.push({ x: g.x + 36, y: g.y + 50, w: 22, h: 12, vx: 7 * dir, damage: 0, hostile: true, color: "#ff5c7a", life: 150 });
    g.cooldown = 62;
  }
  if (hit(game.player, g)) hurt(0.9);

  for (const bullet of game.bullets) {
    if (bullet.hostile && hit(bullet, game.player)) {
      bullet.life = 0;
      hurt(8);
    }
  }
}

function updatePickups() {
  for (const core of game.cores) {
    if (!core.taken && hit(game.player, core)) {
      core.taken = true;
      burst(core.x + core.w / 2, core.y + core.h / 2, "#7df59a", 22);
    }
  }
}

function updateHazards() {
  for (const hazard of level.hazards) {
    if (hit(game.player, hazard)) hurt(1.4);
  }
  if (game.player.y > H + 80) {
    game.player.x = 80;
    game.player.y = 520;
    game.player.vy = 0;
    hurt(20);
  }
}

function hurt(amount) {
  const p = game.player;
  if (p.hurtTimer > 0) return;
  p.stability -= amount;
  p.hurtTimer = amount > 2 ? 12 : 4;
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    game.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 7,
      vy: (Math.random() - 0.5) * 7,
      size: Math.random() * 3 + 2,
      life: Math.random() * 26 + 18,
      color,
    });
  }
}

function updateParticles(dt) {
  for (const particle of game.particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.life -= dt;
  }
  game.particles = game.particles.filter((particle) => particle.life > 0);
}

function endGame(won, message) {
  game.running = false;
  game.won = won;
  game.lost = !won;
  game.message = message;
  overlay.classList.remove("hidden");
  overlay.querySelector("h2").textContent = won ? "Reality Stabilized" : "Quantum Collapse";
  overlay.querySelector("p").textContent = `${message} Press R or begin again.`;
  startButton.textContent = "Restart Experiment";
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  const cam = game.camera;
  drawBackground(cam);
  ctx.save();
  ctx.translate(-cam, 0);
  drawLevel();
  drawCores();
  drawEnemies();
  drawGuardian();
  drawBullets();
  drawPlayer();
  drawParticles();
  ctx.restore();
  drawObjective();
  drawVignette();
}

function drawObjective() {
  ctx.fillStyle = "rgba(8,9,13,0.62)";
  ctx.fillRect(24, 24, 360, 42);
  ctx.strokeStyle = "rgba(97,233,255,0.35)";
  ctx.strokeRect(24, 24, 360, 42);
  ctx.fillStyle = "#f4efe6";
  ctx.font = "800 15px Inter, sans-serif";
  ctx.fillText(game.message || "Recover three unstable cores.", 40, 51);
}

function drawBackground(cam) {
  const gradient = ctx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, "#070813");
  gradient.addColorStop(0.55, "#10131c");
  gradient.addColorStop(1, "#050609");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);

  for (let i = 0; i < 80; i += 1) {
    const x = (i * 157 - cam * (0.15 + (i % 4) * 0.04)) % W;
    const y = (i * 83) % H;
    ctx.fillStyle = i % 7 === 0 ? "rgba(242,193,78,0.6)" : "rgba(97,233,255,0.38)";
    ctx.beginPath();
    ctx.arc(x < 0 ? x + W : x, y, (i % 5) + 1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(97,233,255,0.09)";
  ctx.lineWidth = 2;
  for (let x = -120; x < W + 180; x += 150) {
    ctx.beginPath();
    ctx.ellipse(x - (cam * 0.08) % 150, H * 0.55, 190, 40, -0.4, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawLevel() {
  for (const platform of level.platforms) {
    ctx.fillStyle = platform.kind === "ground" ? "#171b24" : "#242938";
    ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
    ctx.fillStyle = "rgba(97,233,255,0.34)";
    ctx.fillRect(platform.x, platform.y, platform.w, 3);
  }

  for (const hazard of level.hazards) {
    ctx.fillStyle = "#ff5c7a";
    ctx.fillRect(hazard.x, hazard.y, hazard.w, hazard.h);
    ctx.fillStyle = "rgba(255,92,122,0.35)";
    ctx.fillRect(hazard.x - 8, hazard.y - 10, hazard.w + 16, 10);
  }

  for (const well of level.gravityWells) {
    const glow = ctx.createRadialGradient(well.x, well.y, 5, well.x, well.y, well.r);
    glow.addColorStop(0, "rgba(125,245,154,0.3)");
    glow.addColorStop(1, "rgba(125,245,154,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(well.x, well.y, well.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(125,245,154,0.55)";
    ctx.stroke();
  }

  for (let i = 0; i < level.gates.length; i += 1) {
    const gate = level.gates[i];
    ctx.fillStyle = gate.open ? "rgba(125,245,154,0.18)" : "rgba(255,92,122,0.72)";
    ctx.fillRect(gate.x, gate.y, gate.w, gate.h);
    ctx.strokeStyle = gate.open ? "#7df59a" : "#ff5c7a";
    ctx.strokeRect(gate.x + 6, gate.y + 8, gate.w - 12, gate.h - 16);
    ctx.fillStyle = "#f4efe6";
    ctx.font = "700 14px Inter, sans-serif";
    ctx.fillText(gate.open ? "OPEN" : `LOCK ${i + 1}`, gate.x - 10, gate.y - 10);
  }

  for (const sw of level.switches) {
    ctx.fillStyle = sw.active ? "#7df59a" : "#f2c14e";
    ctx.fillRect(sw.x, sw.y, sw.w, sw.h);
    ctx.strokeStyle = "#f4efe6";
    ctx.strokeRect(sw.x - 6, sw.y - 26, sw.w + 12, 24);
    ctx.fillStyle = sw.active ? "#7df59a" : "#f4efe6";
    ctx.font = "700 13px Inter, sans-serif";
    ctx.fillText(sw.active ? "ACTIVE" : "ACTIVATE", sw.x - 10, sw.y - 10);
  }

  const doorGlow = level.exit.open ? 0.72 : level.exit.ready ? 0.42 : 0.18;
  ctx.fillStyle = `rgba(97,233,255,${doorGlow})`;
  ctx.fillRect(level.exit.x, level.exit.y, level.exit.w, level.exit.h);
  ctx.strokeStyle = level.exit.ready ? "#7df59a" : "#61e9ff";
  ctx.lineWidth = 3;
  ctx.strokeRect(level.exit.x, level.exit.y, level.exit.w, level.exit.h);
  ctx.fillStyle = "#f4efe6";
  ctx.font = "700 14px Inter, sans-serif";
  ctx.fillText(level.exit.ready ? "OPEN WITH E / B" : "NEEDS 3 CORES", level.exit.x - 52, level.exit.y - 12);
  if (level.exit.open) {
    const swirl = game.exitProgress * Math.PI * 8;
    ctx.strokeStyle = "rgba(244,239,230,0.75)";
    for (let i = 0; i < 4; i += 1) {
      ctx.beginPath();
      ctx.arc(level.exit.x + level.exit.w / 2, level.exit.y + level.exit.h / 2, 14 + i * 11, swirl + i, swirl + i + Math.PI * 1.2);
      ctx.stroke();
    }
  }
}

function drawPlayer() {
  const p = game.player;
  ctx.save();
  ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
  if (game.exiting) {
    const scale = clamp(1 - game.exitProgress * 0.62, 0.28, 1);
    ctx.scale(scale, scale);
    ctx.rotate(Math.sin(game.exitProgress * Math.PI * 4) * 0.1);
  }
  if (p.hurtTimer > 0) ctx.globalAlpha = 0.55;

  ctx.fillStyle = "#2a3142";
  ctx.fillRect(-16, -2, 32, 28);
  ctx.fillStyle = "#596273";
  ctx.fillRect(-22, 5, 8, 18);
  ctx.fillRect(14, 5, 8, 18);
  if (!p.grounded || p.jetTimer > 0) {
    ctx.fillStyle = "#61e9ff";
    ctx.fillRect(-21, 23, 5, 12 + Math.sin(game.time * 22) * 4);
    ctx.fillRect(16, 23, 5, 12 + Math.cos(game.time * 22) * 4);
    ctx.fillStyle = "#f2c14e";
    ctx.fillRect(-19, 32, 3, 9);
    ctx.fillRect(18, 32, 3, 9);
  }
  ctx.fillStyle = "#11151e";
  ctx.fillRect(-13, 26, 11, 22);
  ctx.fillRect(2, 26, 11, 22);
  ctx.fillStyle = "#f4efe6";
  ctx.fillRect(-5, -2, 10, 24);
  ctx.fillStyle = "#c2313f";
  ctx.fillRect(-4, 5, 8, 5);

  ctx.fillStyle = "#f2c14e";
  ctx.fillRect(-13, -30, 26, 24);
  ctx.fillStyle = "#f4efe6";
  ctx.fillRect(-18, -33, 8, 12);
  ctx.fillRect(10, -33, 8, 12);
  ctx.fillRect(-17, -23, 6, 13);
  ctx.fillRect(11, -23, 6, 13);
  ctx.fillRect(-10, -39, 20, 9);
  ctx.fillRect(-3, -44, 6, 6);

  ctx.fillStyle = "#10131a";
  ctx.fillRect(-7, -21, 4, 4);
  ctx.fillRect(4, -21, 4, 4);
  ctx.fillRect(-8, -12, 16, 4);

  ctx.strokeStyle = "#f4efe6";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-9, -22);
  ctx.lineTo(-1, -21);
  ctx.moveTo(1, -21);
  ctx.lineTo(9, -22);
  ctx.stroke();

  ctx.fillStyle = "#f2c14e";
  ctx.fillRect(p.facing > 0 ? 16 : -22, 3, 6, 18);
  ctx.fillStyle = "#61e9ff";
  ctx.fillRect(p.facing > 0 ? 20 : -42, 10, 24, 7);
  ctx.restore();
}

function drawEnemies() {
  for (const enemy of game.enemies) {
    if (!enemy.alive) continue;
    const cx = enemy.x + enemy.w / 2;
    const cy = enemy.y + enemy.h / 2;
    const radius = enemy.w * 0.45 + Math.sin(enemy.pulse) * 4;
    ctx.fillStyle = "#ff5c7a";
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(244,239,230,0.55)";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = "#08090d";
    ctx.beginPath();
    ctx.arc(cx - 9, cy - 8, 6, 0, Math.PI * 2);
    ctx.arc(cx + 9, cy - 8, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawGuardian() {
  const g = game.guardian;
  if (g.hp <= 0) return;
  ctx.fillStyle = "#221826";
  ctx.fillRect(g.x, g.y, g.w, g.h);
  ctx.fillStyle = "#ff5c7a";
  ctx.beginPath();
  ctx.arc(g.x + g.w / 2, g.y + 36, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#f2c14e";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(g.x + g.w / 2, g.y + 36, 48, 0, Math.PI * 2 * (g.hp / 24));
  ctx.stroke();
}

function drawBullets() {
  for (const bullet of game.bullets) {
    ctx.fillStyle = bullet.color;
    ctx.fillRect(bullet.x, bullet.y, bullet.w, bullet.h);
  }
}

function drawCores() {
  for (const core of game.cores) {
    if (core.taken) continue;
    ctx.save();
    ctx.translate(core.x + core.w / 2, core.y + core.h / 2);
    ctx.rotate(game.time * 2);
    ctx.fillStyle = "#7df59a";
    ctx.fillRect(-13, -13, 26, 26);
    ctx.strokeStyle = "#f4efe6";
    ctx.strokeRect(-18, -18, 36, 36);
    ctx.restore();
  }
}

function drawParticles() {
  for (const particle of game.particles) {
    ctx.globalAlpha = clamp(particle.life / 24, 0, 1);
    ctx.fillStyle = particle.color;
    ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    ctx.globalAlpha = 1;
  }
}

function drawVignette() {
  const gradient = ctx.createRadialGradient(W / 2, H / 2, 160, W / 2, H / 2, 680);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
}

window.addEventListener("keydown", (event) => {
  keys.add(event.key.toLowerCase());
  if (event.key.toLowerCase() === "r") resetGame();
  if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)) event.preventDefault();
});

window.addEventListener("keyup", (event) => keys.delete(event.key.toLowerCase()));
startButton.addEventListener("click", resetGame);

createGame();
draw();
setInterval(() => {
  if (game.running || !navigator.getGamepads) return;
  const pad = getActiveGamepad();
  const buttons = pad ? pad.buttons.map((button) => button.pressed) : [];
  updateControllerStatus(pad);
  if ((buttons[0] && !previousPadButtons[0]) || (buttons[9] && !previousPadButtons[9])) resetGame();
  previousPadButtons = buttons;
}, 120);

window.addEventListener("gamepadconnected", (event) => {
  updateControllerStatus(event.gamepad);
});

window.addEventListener("gamepaddisconnected", () => {
  previousPadButtons = [];
  updateControllerStatus(null);
});
