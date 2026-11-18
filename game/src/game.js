// Neon Bay — the whole game: world state, driving, combat, police, missions,
// rendering, HUD and minimap. Original city, characters and story throughout.
import { createCity, collideBuildings, pointInRect, WORLD, BLOCK, STREET } from './city.js';
import { createAudio } from './audio.js';
import { mulberry32, clamp, lerp, dist, angleTo, angleDiff, pick, randRange, fmtMoney, fmtClock } from './util.js';

export const SAVE_KEY = 'neon-bay.save.v1';

const CAR_TYPES = {
  sedan: { accel: 260, top: 420, turn: 2.6, color: '#4a90d9', w: 46, h: 22, name: 'Sedan' },
  taxi: { accel: 240, top: 400, turn: 2.7, color: '#f2c200', w: 46, h: 22, name: 'Taxi' },
  truck: { accel: 170, top: 300, turn: 2.0, color: '#8a8f98', w: 58, h: 26, name: 'Truck' },
  sports: { accel: 360, top: 560, turn: 3.1, color: '#e5316e', w: 46, h: 20, name: 'Sports' },
  police: { accel: 330, top: 500, turn: 3.0, color: '#1c2733', w: 48, h: 22, name: 'Interceptor' },
};

const MISSIONS = [
  { title: '1 · First Wheels', intro: 'Ray needs a driver. Get to Ray’s Garage, take the sports car, and bring it to Club Volt.', reward: 150,
    steps: [
      { type: 'goto', x: 565, y: 1965, text: 'Go to Ray’s Garage' },
      { type: 'drive', x: 1535, y: 545, text: 'Drive the car to Club Volt' },
    ] },
  { title: '2 · Hot Wheels Getaway', intro: 'The crew needs a clean ride. Steal any car on the street, then lose the heat at the Harbor Pier.', reward: 300,
    steps: [
      { type: 'steal', x: 0, y: 0, text: 'Steal a car (walk up and press E)' },
      { type: 'drive', x: 1600, y: 2225, text: 'Reach the Harbor Pier' },
    ] },
  { title: '3 · The Drop', intro: 'A package is waiting at St. Maria Hospital. Pick it up and deliver it to Club Volt — fast. 90 seconds.', reward: 350,
    steps: [
      { type: 'goto', x: 565, y: 545, text: 'Pick up the package at the Hospital' },
      { type: 'deliver', x: 1535, y: 545, text: 'Deliver the package to Club Volt', timer: 90 },
    ] },
  { title: '4 · Rival Turf', intro: 'The Vipers took our corner. Clear out 5 of their shooters near the east blocks.', reward: 500,
    steps: [
      { type: 'goto', x: 2400, y: 1500, text: 'Reach the Viper turf' },
      { type: 'kill', x: 2400, y: 1500, text: 'Defeat 5 Viper gang members', count: 5 },
    ] },
  { title: '5 · Harbor Heist', intro: 'The big one. Grab the loot at the Harbor Pier, then escape to Ray’s Garage with the whole city on your tail.', reward: 1000,
    steps: [
      { type: 'goto', x: 1600, y: 2225, text: 'Reach the Harbor Pier' },
      { type: 'grab', x: 1600, y: 2225, text: 'Grab the loot' },
      { type: 'drive', x: 565, y: 1965, text: 'Escape to Ray’s Garage' },
    ] },
];

export function createGame(canvas, seed) {
  const rng = mulberry32(seed);
  const city = createCity(rng);
  const audio = createAudio();
  const ctx = canvas.getContext('2d');

  const state = {
    screen: 'title', // title | play | paused | over | done
    time: 0, clock: 19 * 60 + 20, // dusk, 19:20
    cash: 120, health: 100, ammo: 48, wanted: 0, heat: 0, hiddenTimer: 0,
    missionIndex: 0, missionStep: 0, missionTimer: 0, missionMsg: '', missionFlash: 0,
    kills: 0, carsStolen: 0, storyDone: false, muted: false,
    camX: 0, camY: 0, shake: 0, sirenTimer: 0, copTimer: 4, pedTimer: 0, trafficTimer: 0,
    banner: '', bannerTimer: 0, toast: '', toastTimer: 0,
  };

  const player = { x: 565, y: 1850, angle: -Math.PI / 2, speed: 0, car: null, aim: 0, shootCd: 0, hurtCd: 0 };
  let cars = [];
  let peds = [];
  let cops = []; // on-foot cops
  let enemies = [];
  let bullets = [];
  let particles = [];
  let pickups = [];
  let skids = [];
  let carId = 0;

  const keys = {};
  const mouse = { x: 0, y: 0, down: false, clicked: false };

  function spawnCar(type, x, y, angle, driver) {
    const t = CAR_TYPES[type];
    const car = { id: ++carId, type, x, y, angle, speed: 0, w: t.w, h: t.h, color: t.color, driver, aiTurn: 0, stuck: 0, siren: 0 };
    cars.push(car);
    return car;
  }

  function spawnPed(x, y) {
    peds.push({ x, y, angle: rng() * Math.PI * 2, speed: randRange(rng, 30, 55), dir: pick(rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]), color: pick(rng, ['#e8c39e', '#c98d5f', '#8a5a3b', '#f0d0b0']), shirt: pick(rng, ['#d94f4f', '#4fd94f', '#4f7ad9', '#e8d44f', '#b04fd9']), panic: 0 });
  }

  function spawnEnemy(x, y) {
    enemies.push({ x, y, angle: 0, hp: 3, shootCd: randRange(rng, 0.5, 1.5), speed: 95, color: '#7a1f2e' });
  }

  function spawnCopCar() {
    const a = rng() * Math.PI * 2;
    const x = clamp(player.x + Math.cos(a) * 700, 100, WORLD.w - 100);
    const y = clamp(player.y + Math.sin(a) * 500, 100, WORLD.h - 100);
    const car = spawnCar('police', x, y, angleTo(x, y, player.x, player.y), 'cop');
    car.siren = 1;
    return car;
  }

  function spawnCopFoot() {
    const a = rng() * Math.PI * 2;
    cops.push({ x: clamp(player.x + Math.cos(a) * 420, 40, WORLD.w - 40), y: clamp(player.y + Math.sin(a) * 320, 40, WORLD.h - 40), angle: 0, hp: 2, shootCd: 1, speed: 150 });
  }

  function addParticles(x, y, color, n, spd) {
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      particles.push({ x, y, vx: Math.cos(a) * spd * (0.3 + rng() * 0.7), vy: Math.sin(a) * spd * (0.3 + rng() * 0.7), life: 0.4 + rng() * 0.5, max: 0.9, color, size: 2 + rng() * 3 });
    }
    if (particles.length > 400) particles.splice(0, particles.length - 400);
  }

  function addSkid(x, y, angle) { skids.push({ x, y, angle, life: 6 }); if (skids.length > 300) skids.shift(); }

  function raiseWanted(n, reason) {
    const before = state.wanted;
    state.wanted = clamp(state.wanted + n, 0, 5);
    state.heat = 20;
    state.hiddenTimer = 0;
    if (state.wanted > before) showToast('WANTED ' + '★'.repeat(state.wanted) + (reason ? ' — ' + reason : ''));
  }

  function showToast(msg) { state.toast = msg; state.toastTimer = 3; }
  function showBanner(msg) { state.banner = msg; state.bannerTimer = 3.5; }

  function currentMission() { return MISSIONS[state.missionIndex] || null; }
  function currentStep() { const m = currentMission(); return m ? m.steps[state.missionStep] : null; }

  function missionObjectiveText() {
    const m = currentMission();
    if (!m) return 'Neon Bay is yours — free roam';
    const s = currentStep();
    return m.title + ' — ' + (s ? s.text : 'Done');
  }

  function advanceMission() {
    const m = currentMission();
    state.missionStep++;
    audio.mission();
    if (state.missionStep >= m.steps.length) {
      state.cash += m.reward;
      showBanner('MISSION COMPLETE — ' + m.title + '  +' + fmtMoney(m.reward));
      state.missionFlash = 2;
      state.missionIndex++;
      state.missionStep = 0;
      if (state.missionIndex >= MISSIONS.length) {
        state.storyDone = true;
        showBanner('STORY COMPLETE — You own Neon Bay. Free roam!');
      } else {
        const nm = currentMission();
        state.missionMsg = nm.title + ': ' + nm.intro;
        state.missionFlash = 5;
      }
      saveGame();
    } else {
      const s = currentStep();
      if (s.timer) state.missionTimer = s.timer;
      showToast('Objective: ' + s.text);
    }
  }

  function failMission(reason) {
    audio.fail();
    showBanner('MISSION FAILED — ' + reason);
    state.missionStep = 0;
    state.missionTimer = 0;
    state.wanted = Math.max(0, state.wanted - 1);
  }

  function resetWorld(fresh) {
    cars = []; peds = []; cops = []; enemies = []; bullets = []; particles = []; pickups = []; skids = [];
    player.x = 565; player.y = 1850; player.angle = -Math.PI / 2; player.car = null; player.speed = 0;
    state.health = 100; state.ammo = 48; state.wanted = 0; state.heat = 0;
    state.missionIndex = 0; state.missionStep = 0; state.missionTimer = 0;
    state.cash = fresh ? 120 : state.cash;
    state.clock = 19 * 60 + 20; state.time = 0;
    // Parked + traffic cars scattered on streets.
    const spots = [[700, 220], [1150, 220], [2050, 220], [700, 700], [1600, 700], [2500, 700], [700, 1180], [1150, 1650], [2050, 1180], [2500, 1650], [1150, 2130], [2050, 2130]];
    const types = ['sedan', 'taxi', 'truck', 'sports', 'sedan', 'taxi'];
    spots.forEach((s, i) => {
      const type = types[i % types.length];
      spawnCar(type, s[0], s[1], i % 2 ? 0 : Math.PI / 2, i < 6 ? 'traffic' : 'parked');
    });
    // The mission sports car at the garage.
    spawnCar('sports', 620, 1965, -Math.PI / 2, 'parked');
    for (let i = 0; i < 26; i++) {
      const x = randRange(rng, 120, WORLD.w - 120);
      const y = randRange(rng, 120, WORLD.h - 120);
      if (dist(x, y, player.x, player.y) < 200) continue;
      spawnPed(x, y);
    }
    pickups.push({ x: 620, y: 560, kind: 'health' });
    pickups.push({ x: 1500, y: 2100, kind: 'ammo' });
    pickups.push({ x: 2500, y: 600, kind: 'health' });
    const m = currentMission();
    state.missionMsg = m.title + ': ' + m.intro;
    state.missionFlash = 6;
  }

  function saveGame() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({ cash: state.cash, missionIndex: state.missionIndex, health: state.health, ammo: state.ammo, x: player.x, y: player.y }));
    } catch { /* storage off */ }
  }

  function loadSave() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }

  function startGame(continued) {
    const save = continued ? loadSave() : null;
    resetWorld(!save);
    if (save) {
      state.cash = save.cash || 120;
      state.missionIndex = Math.min(save.missionIndex || 0, MISSIONS.length - 1);
      state.health = save.health || 100;
      state.ammo = save.ammo || 48;
      player.x = save.x || player.x; player.y = save.y || player.y;
      state.missionMsg = currentMission().title + ': ' + currentMission().intro;
      state.missionFlash = 5;
    }
    state.screen = 'play';
    audio.unlock(); audio.startMusic(); audio.startEngine();
  }

  function nearestCar(maxD) {
    let best = null; let bd = maxD;
    for (const c of cars) {
      if (c.driver === 'cop') continue;
      const d = dist(player.x, player.y, c.x, c.y);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  function enterCar(car) {
    player.car = car;
    car.driver = 'player';
    audio.door();
    if (car.type === 'police') raiseWanted(1, 'stole a police car');
    showToast('Driving a ' + CAR_TYPES[car.type].name + ' — W/S drive, A/D steer, Space handbrake');
  }

  function exitCar() {
    if (!player.car) return;
    const car = player.car;
    car.driver = 'none';
    car.speed = 0;
    player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
    player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
    player.car = null;
    audio.door();
  }

  function trySteal() {
    const car = nearestCar(70);
    if (!car) return;
    if (car.driver === 'traffic') {
      raiseWanted(1, 'car theft');
      state.carsStolen++;
      spawnPed(car.x + 30, car.y + 20);
      const p = peds[peds.length - 1]; if (p) p.panic = 3;
      showToast('You pulled the driver out!');
    }
    enterCar(car);
    const s = currentStep();
    if (s && s.type === 'steal') advanceMission();
  }

  function shoot() {
    if (player.shootCd > 0 || state.ammo <= 0) return;
    player.shootCd = 0.22;
    state.ammo--;
    audio.shoot();
    const ox = player.car ? player.car.x : player.x;
    const oy = player.car ? player.car.y : player.y;
    const a = player.aim;
    bullets.push({ x: ox + Math.cos(a) * 26, y: oy + Math.sin(a) * 26, vx: Math.cos(a) * 900, vy: Math.sin(a) * 900, life: 0.7, from: 'player' });
    addParticles(ox + Math.cos(a) * 30, oy + Math.sin(a) * 30, '#ffd76a', 4, 160);
    state.shake = Math.max(state.shake, 3);
    if (state.wanted === 0) raiseWanted(1, 'shots fired');
    else state.heat = 20;
  }

  function damagePlayer(n) {
    if (player.hurtCd > 0) return;
    player.hurtCd = 0.5;
    state.health -= n;
    audio.hit();
    state.shake = Math.max(state.shake, 6);
    addParticles(player.x, player.y, '#ff3b3b', 8, 200);
    if (state.health <= 0) {
      state.health = 0;
      state.screen = 'over';
      try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
    }
  }

  function killEnemy(e, idx) {
    addParticles(e.x, e.y, '#ff3b3b', 14, 260);
    enemies.splice(idx, 1);
    state.kills++;
    const drop = Math.floor(randRange(rng, 20, 80));
    pickups.push({ x: e.x, y: e.y, kind: 'cash', value: drop });
    const s = currentStep();
    if (s && s.type === 'kill') {
      s.done = (s.done || 0) + 1;
      showToast('Vipers down: ' + s.done + ' / ' + s.count);
      if (s.done >= s.count) advanceMission();
    }
  }

  // ---------- update ----------
  function update(dt) {
    state.time += dt;
    state.clock = (state.clock + dt * 0.9) % (24 * 60);
    if (state.toastTimer > 0) state.toastTimer -= dt;
    if (state.bannerTimer > 0) state.bannerTimer -= dt;
    if (state.missionFlash > 0) state.missionFlash -= dt;
    if (player.shootCd > 0) player.shootCd -= dt;
    if (player.hurtCd > 0) player.hurtCd -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 22);

    // Wanted decay: stay out of sight and the heat cools off.
    if (state.heat > 0) state.heat -= dt;
    else if (state.wanted > 0) {
      state.hiddenTimer += dt;
      if (state.hiddenTimer > 14) { state.wanted--; state.hiddenTimer = 0; showToast('Heat cooling off… ' + '★'.repeat(state.wanted)); }
    }

    // Clock-based dusk: palette shifts as the night deepens (handled in render).
    const px = player.car ? player.car.x : player.x;
    const py = player.car ? player.car.y : player.y;

    // --- player on foot ---
    if (!player.car) {
      let mx = 0; let my = 0;
      if (keys['KeyW'] || keys['ArrowUp']) my -= 1;
      if (keys['KeyS'] || keys['ArrowDown']) my += 1;
      if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
      if (mx || my) {
        const len = Math.hypot(mx, my);
        player.x += (mx / len) * 210 * dt;
        player.y += (my / len) * 210 * dt;
        player.angle = Math.atan2(my, mx);
      }
      player.x = clamp(player.x, 20, WORLD.w - 20);
      player.y = clamp(player.y, 20, WORLD.h - 20);
      collideBuildings(city, player, 14);
      // Aim at the mouse.
      const rect = canvas.getBoundingClientRect();
      const wx = state.camX + (mouse.x - rect.width / 2);
      const wy = state.camY + (mouse.y - rect.height / 2);
      player.aim = angleTo(player.x, player.y, wx, wy);
      if (mouse.down || mouse.clicked) shoot();
      // Pickups.
      for (let i = pickups.length - 1; i >= 0; i--) {
        const p = pickups[i];
        if (dist(player.x, player.y, p.x, p.y) < 30) {
          if (p.kind === 'health') { state.health = Math.min(100, state.health + 40); showToast('Health +40'); }
          if (p.kind === 'ammo') { state.ammo += 24; showToast('Ammo +24'); }
          if (p.kind === 'cash') { state.cash += p.value || 25; showToast('+' + fmtMoney(p.value || 25)); audio.cash(); }
          audio.pickup();
          pickups.splice(i, 1);
        }
      }
      // Spray shop on foot does nothing; it needs a car.
    }

    // --- driving ---
    if (player.car) {
      const car = player.car;
      const t = CAR_TYPES[car.type];
      const fwd = (keys['KeyW'] || keys['ArrowUp']) ? 1 : (keys['KeyS'] || keys['ArrowDown']) ? -0.6 : 0;
      const steer = (keys['KeyA'] || keys['ArrowLeft']) ? -1 : (keys['KeyD'] || keys['ArrowRight']) ? 1 : 0;
      const handbrake = !!keys['Space'];
      car.speed += fwd * t.accel * dt;
      if (!fwd) car.speed *= Math.pow(0.4, dt);
      if (handbrake) { car.speed *= Math.pow(0.05, dt); if (Math.abs(car.speed) > 120 && Math.random() < 0.5) { addSkid(car.x, car.y, car.angle); audio.skid(); } }
      car.speed = clamp(car.speed, -t.top * 0.5, t.top);
      const dir = car.speed >= 0 ? 1 : -1;
      car.angle += steer * t.turn * dt * clamp(Math.abs(car.speed) / 120, 0, 1) * dir;
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      car.x = clamp(car.x, 24, WORLD.w - 24);
      car.y = clamp(car.y, 24, WORLD.h - 24);
      if (collideBuildings(city, car, 24)) {
        if (Math.abs(car.speed) > 200) { addParticles(car.x, car.y, '#ffb347', 10, 220); audio.hit(); state.shake = 5; }
        car.speed *= -0.25;
      }
      // Running over pedestrians is a crime.
      for (let i = peds.length - 1; i >= 0; i--) {
        const p = peds[i];
        if (dist(car.x, car.y, p.x, p.y) < 30 && Math.abs(car.speed) > 60) {
          addParticles(p.x, p.y, '#ff3b3b', 12, 240);
          peds.splice(i, 1);
          raiseWanted(1, 'hit a pedestrian');
          audio.hit();
        }
      }
      // Spray shop: repaint clears wanted for $200.
      const spray = city.landmarks.spray;
      if (pointInRect(car.x, car.y, { x: spray.x - 40, y: spray.y - 40, w: spray.w + 80, h: spray.h + 80 }) && state.wanted > 0 && state.cash >= 200) {
        state.cash -= 200; state.wanted = 0; state.heat = 0;
        car.color = pick(rng, ['#4a90d9', '#e5316e', '#37c978', '#f2c200', '#7c4dff']);
        showBanner('REPAINTED — Wanted cleared (-$200)');
        audio.cash();
      }
      audio.setEngine(Math.abs(car.speed) / t.top, true);
      player.aim = car.angle;
      if (mouse.clicked) shoot();
    } else {
      audio.setEngine(0, false);
    }
    mouse.clicked = false;

    // --- traffic AI: follow streets, turn at intersections ---
    state.trafficTimer -= dt;
    if (state.trafficTimer <= 0) {
      state.trafficTimer = 2;
      const traffic = cars.filter((c) => c.driver === 'traffic');
      if (traffic.length < 10) {
        const a = rng() * Math.PI * 2;
        const x = clamp(px + Math.cos(a) * 800, 80, WORLD.w - 80);
        const y = clamp(py + Math.sin(a) * 600, 80, WORLD.h - 80);
        spawnCar(pick(rng, ['sedan', 'taxi', 'truck']), x, y, pick(rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]), 'traffic');
      }
    }
    for (const car of cars) {
      if (car.driver === 'player') continue;
      const t = CAR_TYPES[car.type];
      if (car.driver === 'cop') {
        // Police chase: steer toward the player, ram on contact.
        const target = angleTo(car.x, car.y, px, py);
        car.angle += clamp(angleDiff(car.angle, target), -2.4 * dt, 2.4 * dt);
        car.speed = lerp(car.speed, t.top * 0.9, dt * 0.8);
        car.x += Math.cos(car.angle) * car.speed * dt;
        car.y += Math.sin(car.angle) * car.speed * dt;
        car.siren += dt;
        if (state.sirenTimer <= 0) { audio.siren(); state.sirenTimer = 1.1; }
        state.sirenTimer -= dt;
        if (collideBuildings(city, car, 24)) car.speed *= -0.3;
        const d = dist(car.x, car.y, px, py);
        if (d < 46) {
          if (player.car) { player.car.speed *= 0.6; state.shake = 6; audio.hit(); }
          else damagePlayer(8);
        }
        continue;
      }
      // Civilian traffic: cruise along its heading, turn at random intersections.
      car.speed = lerp(car.speed, t.top * 0.45, dt);
      const aheadX = car.x + Math.cos(car.angle) * 60;
      const aheadY = car.y + Math.sin(car.angle) * 60;
      const cellX = Math.floor(aheadX / (BLOCK + STREET));
      const cellY = Math.floor(aheadY / (BLOCK + STREET));
      const nearEdge = (aheadX % (BLOCK + STREET)) > BLOCK + STREET - 70 || (aheadY % (BLOCK + STREET)) > BLOCK + STREET - 70;
      if (nearEdge && rng() < 0.02) car.angle += pick(rng, [Math.PI / 2, -Math.PI / 2]);
      // Stay on road: nudge back toward the street centre.
      if (Math.abs(Math.sin(car.angle)) < 0.1) car.y += clamp(((Math.floor(car.y / (BLOCK + STREET)) * (BLOCK + STREET)) + STREET / 2) - car.y, -40 * dt, 40 * dt);
      if (Math.abs(Math.cos(car.angle)) < 0.1) car.x += clamp(((Math.floor(car.x / (BLOCK + STREET)) * (BLOCK + STREET)) + STREET / 2) - car.x, -40 * dt, 40 * dt);
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      if (car.x < 30 || car.y < 30 || car.x > WORLD.w - 30 || car.y > WORLD.h - 30) car.angle += Math.PI;
      if (collideBuildings(city, car, 24)) { car.angle += Math.PI / 2; car.speed *= 0.4; }
    }
    // Car-car bumps.
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i]; const b = cars[j];
        const d = dist(a.x, a.y, b.x, b.y);
        if (d < 40 && d > 0.01) {
          const push = (40 - d) / 2;
          const nx = (b.x - a.x) / d; const ny = (b.y - a.y) / d;
          a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
          if (a.driver === 'player' || b.driver === 'player') { a.speed *= 0.7; b.speed *= 0.7; }
        }
      }
    }
    // Despawn far traffic.
    cars = cars.filter((c) => c.driver !== 'traffic' || dist(c.x, c.y, px, py) < 1400);

    // --- pedestrians wander sidewalks, panic near gunfire ---
    state.pedTimer -= dt;
    if (state.pedTimer <= 0) { state.pedTimer = 3; if (peds.length < 30) spawnPed(clamp(px + randRange(rng, -700, 700), 60, WORLD.w - 60), clamp(py + randRange(rng, -500, 500), 60, WORLD.h - 60)); }
    for (let i = peds.length - 1; i >= 0; i--) {
      const p = peds[i];
      if (dist(p.x, p.y, px, py) > 1300) { peds.splice(i, 1); continue; }
      if (p.panic > 0) { p.panic -= dt; p.angle = angleTo(px, py, p.x, p.y); p.x += Math.cos(p.angle) * 160 * dt; p.y += Math.sin(p.angle) * 160 * dt; continue; }
      if (rng() < 0.01) p.dir = pick(rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]);
      p.x += Math.cos(p.dir) * p.speed * dt;
      p.y += Math.sin(p.dir) * p.speed * dt;
      p.x = clamp(p.x, 30, WORLD.w - 30); p.y = clamp(p.y, 30, WORLD.h - 30);
      collideBuildings(city, p, 10);
    }

    // --- police response scales with wanted level ---
    const wantCops = state.wanted >= 1 ? Math.min(2 + state.wanted, 6) : 0;
    const copCars = cars.filter((c) => c.driver === 'cop').length;
    state.copTimer -= dt;
    if (state.copTimer <= 0) {
      state.copTimer = 3;
      if (copCars < wantCops && state.wanted > 0) spawnCopCar();
      if (state.wanted >= 3 && cops.length < 3) spawnCopFoot();
    }
    if (state.wanted === 0) {
      for (const c of cars) if (c.driver === 'cop') c.driver = 'traffic';
      cops.length = 0;
    }
    for (let i = cops.length - 1; i >= 0; i--) {
      const c = cops[i];
      const d = dist(c.x, c.y, px, py);
      if (d > 1200) { cops.splice(i, 1); continue; }
      c.angle = angleTo(c.x, c.y, px, py);
      if (d > 60) { c.x += Math.cos(c.angle) * c.speed * dt; c.y += Math.sin(c.angle) * c.speed * dt; }
      c.shootCd -= dt;
      if (d < 420 && d > 50 && c.shootCd <= 0) {
        c.shootCd = 1.1;
        audio.enemyShoot();
        bullets.push({ x: c.x, y: c.y, vx: Math.cos(c.angle) * 620, vy: Math.sin(c.angle) * 620, life: 0.9, from: 'cop' });
      }
      if (d < 34 && !player.car) { damagePlayer(6); cops.splice(i, 1); showToast('Busted! You lost $100'); state.cash = Math.max(0, state.cash - 100); state.wanted = Math.max(0, state.wanted - 1); }
    }

    // --- gang enemies ---
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      const d = dist(e.x, e.y, px, py);
      e.angle = angleTo(e.x, e.y, px, py);
      if (d > 420) { e.x += Math.cos(e.angle) * e.speed * 0.5 * dt; e.y += Math.sin(e.angle) * e.speed * 0.5 * dt; }
      else if (d > 180) { e.x += Math.cos(e.angle) * e.speed * dt; e.y += Math.sin(e.angle) * e.speed * dt; }
      e.shootCd -= dt;
      if (d < 460 && e.shootCd <= 0) {
        e.shootCd = randRange(rng, 0.9, 1.6);
        audio.enemyShoot();
        bullets.push({ x: e.x, y: e.y, vx: Math.cos(e.angle + randRange(rng, -0.08, 0.08)) * 600, vy: Math.sin(e.angle + randRange(rng, -0.08, 0.08)) * 600, life: 0.9, from: 'enemy' });
      }
      collideBuildings(city, e, 12);
    }

    // --- bullets ---
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      let dead = b.life <= 0 || b.x < 0 || b.y < 0 || b.x > WORLD.w || b.y > WORLD.h;
      if (!dead) {
        // Buildings block bullets.
        for (const bd of city.buildings) {
          if (b.x > bd.x && b.x < bd.x + bd.w && b.y > bd.y && b.y < bd.y + bd.h) { addParticles(b.x, b.y, '#c9c9c9', 4, 120); dead = true; break; }
        }
      }
      if (!dead && b.from === 'player') {
        for (let j = enemies.length - 1; j >= 0; j--) {
          if (dist(b.x, b.y, enemies[j].x, enemies[j].y) < 18) { enemies[j].hp--; addParticles(b.x, b.y, '#ff3b3b', 6, 180); if (enemies[j].hp <= 0) killEnemy(enemies[j], j); dead = true; break; }
        }
        if (!dead) for (let j = cops.length - 1; j >= 0; j--) {
          if (dist(b.x, b.y, cops[j].x, cops[j].y) < 18) { cops[j].hp--; addParticles(b.x, b.y, '#3b7bff', 6, 180); if (cops[j].hp <= 0) { addParticles(cops[j].x, cops[j].y, '#3b7bff', 12, 220); cops.splice(j, 1); raiseWanted(1, 'killed a cop'); } dead = true; break; }
        }
        if (!dead) for (let j = peds.length - 1; j >= 0; j--) {
          if (dist(b.x, b.y, peds[j].x, peds[j].y) < 16) { addParticles(peds[j].x, peds[j].y, '#ff3b3b', 10, 200); peds.splice(j, 1); raiseWanted(1, 'hit a pedestrian'); dead = true; break; }
        }
        if (!dead) for (const c of cars) {
          if (c.driver !== 'player' && dist(b.x, b.y, c.x, c.y) < 26) { addParticles(b.x, b.y, '#ffb347', 6, 160); if (rng() < 0.25) { addParticles(c.x, c.y, '#ff6a00', 20, 300); audio.explosion(); c.driver = 'none'; c.speed = 0; raiseWanted(1, 'blew up a car'); } dead = true; break; }
        }
      }
      if (!dead && b.from !== 'player') {
        const tx = player.car ? player.car.x : player.x;
        const ty = player.car ? player.car.y : player.y;
        const r = player.car ? 26 : 14;
        if (dist(b.x, b.y, tx, ty) < r) { damagePlayer(b.from === 'cop' ? 5 : 7); dead = true; }
      }
      if (dead) bullets.splice(i, 1);
    }

    // --- particles / skids ---
    for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; if (p.life <= 0) particles.splice(i, 1); }
    for (let i = skids.length - 1; i >= 0; i--) { skids[i].life -= dt; if (skids[i].life <= 0) skids.splice(i, 1); }

    // --- mission logic ---
    const m = currentMission();
    if (m) {
      const s = currentStep();
      if (s) {
        if (s.timer !== undefined && s.type === 'deliver') {
          state.missionTimer -= dt;
          if (state.missionTimer <= 0) failMission('Out of time on the drop.');
        }
        const tx = player.car ? player.car.x : player.x;
        const ty = player.car ? player.car.y : player.y;
        if (s.type === 'goto' && dist(tx, ty, s.x, s.y) < 90) advanceMission();
        if (s.type === 'drive' && player.car && dist(tx, ty, s.x, s.y) < 100) advanceMission();
        if (s.type === 'drive' && !player.car && s.x) { /* must be driving */ }
        if (s.type === 'grab' && dist(player.x, player.y, s.x, s.y) < 80 && !player.car) { state.cash += 0; showToast('Loot grabbed — RUN!'); raiseWanted(2, 'harbor heist'); advanceMission(); }
        if (s.type === 'pickup') { /* goto handles pickup */ }
        if (s.type === 'kill' && enemies.length === 0 && (s.done || 0) === 0 && dist(tx, ty, s.x, s.y) < 260) {
          for (let k = 0; k < 5; k++) spawnEnemy(s.x + randRange(rng, -160, 160), s.y + randRange(rng, -120, 120));
          showToast('Vipers incoming!');
        }
        // Mission 2: getting wanted while driving to the pier clears the heat on arrival.
        if (state.missionIndex === 1 && s.type === 'drive' && dist(tx, ty, s.x, s.y) < 100 && state.wanted > 0) { state.wanted = 0; state.heat = 0; }
      }
    }

    // Autosave every ~10s while playing.
    if (Math.floor(state.time) % 10 === 0 && Math.floor((state.time - dt) % 10) !== 0) saveGame();

    // Camera follows the player with a little look-ahead while driving.
    const lookX = player.car ? Math.cos(player.car.angle) * 60 : 0;
    const lookY = player.car ? Math.sin(player.car.angle) * 60 : 0;
    state.camX = lerp(state.camX, px + lookX, 1 - Math.pow(0.001, dt));
    state.camY = lerp(state.camY, py + lookY, 1 - Math.pow(0.001, dt));
  }

  // ---------- render ----------
  function drawCar(c) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-c.w / 2 + 3, -c.h / 2 + 4, c.w, c.h);
    ctx.fillStyle = c.color;
    ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
    ctx.fillStyle = '#101018';
    ctx.fillRect(-c.w / 2 + 8, -c.h / 2 + 3, 12, c.h - 6);
    ctx.fillStyle = '#9fd8ff';
    ctx.fillRect(c.w / 2 - 14, -c.h / 2 + 3, 8, c.h - 6);
    if (c.type === 'taxi') { ctx.fillStyle = '#111'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('TAXI', 0, 3); }
    if (c.type === 'police') {
      ctx.fillStyle = '#fff'; ctx.fillRect(-c.w / 2 + 14, -c.h / 2, 10, c.h);
      ctx.fillStyle = (Math.floor(state.time * 4) % 2 === 0) ? '#ff2d2d' : '#2d7bff';
      ctx.fillRect(-4, -c.h / 2 - 2, 8, 4);
    }
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(c.w / 2 - 2, -c.h / 2 + 2, 2, 4);
    ctx.fillRect(c.w / 2 - 2, c.h / 2 - 6, 2, 4);
    ctx.restore();
  }

  function drawPed(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(1, 2, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.shirt;
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(0, 0, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function render() {
    const w = canvas.width; const h = canvas.height;
    const dusk = clamp((state.clock - 17 * 60) / 240, 0, 1); // 0 day → 1 night
    const sky = dusk > 0.5 ? '#0b0b1e' : '#1a1a3a';
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    const shX = state.shake ? (Math.random() - 0.5) * state.shake : 0;
    const shY = state.shake ? (Math.random() - 0.5) * state.shake : 0;
    const ox = w / 2 - state.camX + shX;
    const oy = h / 2 - state.camY + shY;
    ctx.save();
    ctx.translate(ox, oy);

    // Ground: blocks and streets.
    ctx.fillStyle = '#23233a';
    ctx.fillRect(-100, -100, WORLD.w + 200, WORLD.h + 200);
    // Harbor water along the south edge.
    ctx.fillStyle = '#0e2f4a';
    ctx.fillRect(-100, WORLD.h - 60, WORLD.w + 200, 160);
    ctx.fillStyle = '#155a7a';
    for (let i = 0; i < 40; i++) ctx.fillRect((i * 173) % WORLD.w, WORLD.h - 40 + (i % 3) * 18, 60, 3);
    // Streets.
    ctx.fillStyle = '#171726';
    const cell = BLOCK + STREET;
    for (let x = 0; x <= WORLD.w; x += cell) ctx.fillRect(x, 0, STREET, WORLD.h);
    for (let y = 0; y <= WORLD.h; y += cell) ctx.fillRect(0, y, WORLD.w, STREET);
    // Lane dashes.
    ctx.fillStyle = '#c9a227';
    for (let x = 0; x <= WORLD.w; x += cell) for (let y = 0; y < WORLD.h; y += 46) ctx.fillRect(x + STREET / 2 - 2, y, 4, 22);
    for (let y = 0; y <= WORLD.h; y += cell) for (let x = 0; x < WORLD.w; x += 46) ctx.fillRect(x, y + STREET / 2 - 2, 22, 4);
    // Sidewalk edges.
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= WORLD.w; x += cell) { ctx.strokeRect(x + STREET - 2, 0, BLOCK + 4, WORLD.h); }

    // Skid marks.
    for (const s of skids) {
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.angle);
      ctx.fillStyle = 'rgba(10,10,14,' + (s.life / 6) * 0.6 + ')';
      ctx.fillRect(-14, -9, 28, 3); ctx.fillRect(-14, 6, 28, 3);
      ctx.restore();
    }

    // Landmarks.
    for (const [key, lm] of Object.entries(city.landmarks)) {
      ctx.fillStyle = key === 'pier' ? '#3a2a1a' : '#2e2e4e';
      ctx.fillRect(lm.x, lm.y, lm.w, lm.h);
      ctx.strokeStyle = lm.color; ctx.lineWidth = 3; ctx.strokeRect(lm.x, lm.y, lm.w, lm.h);
      ctx.fillStyle = lm.color; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(lm.label, lm.x + lm.w / 2, lm.y + lm.h / 2 + 5);
    }

    // Buildings with lit windows and neon trim.
    for (const b of city.buildings) {
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
      ctx.fillStyle = 'rgba(255, 214, 90, 0.75)';
      const cols = Math.floor(b.w / 22); const rows = Math.floor(b.h / 22);
      for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
        if ((i * 7 + j * 3 + b.floors) % 4 === 0) ctx.fillRect(b.x + 8 + i * 22, b.y + 8 + j * 22, 10, 12);
      }
      ctx.strokeStyle = b.neon; ctx.lineWidth = 2; ctx.globalAlpha = 0.85;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.globalAlpha = 1;
    }
    // Neon signs.
    ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
    for (const s of city.signs) {
      ctx.fillStyle = s.color;
      ctx.globalAlpha = 0.7 + 0.3 * Math.sin(state.time * 3 + s.x);
      ctx.fillText(s.text, s.x, s.y);
    }
    ctx.globalAlpha = 1;

    // Pickups.
    for (const p of pickups) {
      ctx.save(); ctx.translate(p.x, p.y);
      const bob = Math.sin(state.time * 4 + p.x) * 2;
      ctx.fillStyle = p.kind === 'health' ? '#ff4d6d' : p.kind === 'ammo' ? '#ffd76a' : '#37c978';
      ctx.beginPath(); ctx.arc(0, bob, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0b0b1e'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(p.kind === 'health' ? '+' : p.kind === 'ammo' ? 'A' : '$', 0, bob + 5);
      ctx.restore();
    }

    // Mission waypoint marker.
    const s = currentStep();
    if (s && s.x) {
      const pulse = 26 + Math.sin(state.time * 5) * 6;
      ctx.save(); ctx.translate(s.x, s.y);
      ctx.strokeStyle = '#ffe600'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(0, 0, pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffe600';
      ctx.beginPath(); ctx.moveTo(0, -pulse - 22); ctx.lineTo(10, -pulse - 4); ctx.lineTo(-10, -pulse - 4); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    for (const c of cars) drawCar(c);
    for (const p of peds) drawPed(p);
    for (const e of enemies) {
      ctx.save(); ctx.translate(e.x, e.y);
      ctx.fillStyle = '#7a1f2e'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffb3c1'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#222'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(e.angle) * 20, Math.sin(e.angle) * 20); ctx.stroke();
      ctx.fillStyle = '#ff4d6d'; ctx.fillRect(-11, -18, 22 * (e.hp / 3), 3);
      ctx.restore();
    }
    for (const c of cops) {
      ctx.save(); ctx.translate(c.x, c.y);
      ctx.fillStyle = '#1c3a6e'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#dfe9ff'; ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1c3a6e'; ctx.fillRect(-6, -14, 12, 5);
      ctx.restore();
    }
    // Player.
    if (!player.car) {
      ctx.save(); ctx.translate(player.x, player.y);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(1, 2, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.rotate(player.angle);
      ctx.fillStyle = '#37c978'; ctx.fillRect(-9, -7, 18, 14);
      ctx.fillStyle = '#f0d0b0'; ctx.beginPath(); ctx.arc(4, 0, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#111'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(22, 0); ctx.stroke();
      ctx.restore();
      // Aim line.
      ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(player.x, player.y); ctx.lineTo(player.x + Math.cos(player.aim) * 46, player.y + Math.sin(player.aim) * 46); ctx.stroke();
    } else {
      // Player marker ring on their car.
      ctx.strokeStyle = '#37c978'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(player.car.x, player.car.y, 34, 0, Math.PI * 2); ctx.stroke();
    }
    // Bullets.
    for (const b of bullets) {
      ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02); ctx.stroke();
    }
    // Particles.
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // Dusk tint over everything.
    if (dusk > 0.25) {
      ctx.fillStyle = 'rgba(20, 10, 60,' + (dusk * 0.22) + ')';
      ctx.fillRect(0, 0, w, h);
    }

    if (state.screen === 'play' || state.screen === 'paused') drawHUD(w, h);
    if (state.screen === 'title') drawTitle(w, h);
    if (state.screen === 'paused') drawPause(w, h);
    if (state.screen === 'over') drawGameOver(w, h);
    if (state.screen === 'done') drawDone(w, h);
  }

  function drawHUD(w, h) {
    const m = currentMission();
    // Top-left panel: health, cash, ammo, wanted.
    ctx.fillStyle = 'rgba(8,8,20,0.72)';
    ctx.fillRect(14, 12, 300, 112);
    ctx.strokeStyle = '#ff2d78'; ctx.lineWidth = 2; ctx.strokeRect(14, 12, 300, 112);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff'; ctx.font = 'bold 17px sans-serif';
    ctx.fillText('NEON BAY', 26, 34);
    ctx.fillStyle = '#ff4d6d'; ctx.fillRect(26, 44, 150, 12);
    ctx.fillStyle = '#37c978'; ctx.fillRect(26, 44, 150 * clamp(state.health / 100, 0, 1), 12);
    ctx.fillStyle = '#fff'; ctx.font = '13px sans-serif';
    ctx.fillText('HP ' + Math.ceil(state.health), 182, 55);
    ctx.fillStyle = '#37c978'; ctx.font = 'bold 16px sans-serif';
    ctx.fillText(fmtMoney(state.cash), 26, 80);
    ctx.fillStyle = '#ffd76a'; ctx.font = '14px sans-serif';
    ctx.fillText('AMMO ' + state.ammo, 130, 80);
    ctx.fillStyle = '#ffd76a'; ctx.font = '13px sans-serif';
    ctx.fillText(fmtClock(state.clock), 240, 80);
    // Wanted stars.
    ctx.font = '22px sans-serif';
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < state.wanted ? '#ff2d2d' : 'rgba(255,255,255,0.25)';
      ctx.fillText('★', 26 + i * 26, 104);
    }
    // Objective bar.
    ctx.fillStyle = 'rgba(8,8,20,0.72)';
    const obj = missionObjectiveText();
    ctx.font = 'bold 15px sans-serif';
    const ow = Math.min(560, ctx.measureText(obj).width + 28);
    ctx.fillRect((w - ow) / 2, 12, ow, 34);
    ctx.strokeStyle = '#ffe600'; ctx.strokeRect((w - ow) / 2, 12, ow, 34);
    ctx.fillStyle = '#ffe600'; ctx.textAlign = 'center';
    ctx.fillText(obj, w / 2, 35);
    // Speed when driving.
    if (player.car) {
      const t = CAR_TYPES[player.car.type];
      const kmh = Math.round(Math.abs(player.car.speed) * 0.36);
      ctx.fillStyle = 'rgba(8,8,20,0.72)';
      ctx.fillRect(w - 190, h - 76, 176, 62);
      ctx.strokeStyle = '#00e5ff'; ctx.strokeRect(w - 190, h - 76, 176, 62);
      ctx.fillStyle = '#fff'; ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'right';
      ctx.fillText(kmh + ' km/h', w - 28, h - 38);
      ctx.fillStyle = '#00e5ff'; ctx.font = '13px sans-serif';
      ctx.fillText(t.name.toUpperCase(), w - 28, h - 20);
    }
    // Controls hint.
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = '12px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(player.car ? 'W/S drive · A/D steer · Space brake · F exit · E — · M mute · Esc pause' : 'WASD move · Mouse aim · Click shoot · E enter car · M mute · Esc pause', 16, h - 14);
    // Toast + banner.
    if (state.toastTimer > 0) {
      ctx.fillStyle = 'rgba(8,8,20,0.8)'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center';
      const tw = ctx.measureText(state.toast).width + 30;
      ctx.fillRect((w - tw) / 2, h - 130, tw, 32);
      ctx.fillStyle = '#fff'; ctx.fillText(state.toast, w / 2, h - 108);
    }
    if (state.bannerTimer > 0) {
      ctx.fillStyle = 'rgba(255,45,120,0.9)'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
      const bw = ctx.measureText(state.banner).width + 40;
      ctx.fillRect((w - bw) / 2, h / 2 - 90, bw, 44);
      ctx.fillStyle = '#fff'; ctx.fillText(state.banner, w / 2, h / 2 - 60);
    }
    if (state.missionFlash > 0) {
      ctx.fillStyle = 'rgba(8,8,20,0.85)';
      const lines = wrapText(state.missionMsg, 46);
      const bh = 70 + lines.length * 22;
      ctx.fillRect((w - 560) / 2, h / 2 - 120, 560, bh);
      ctx.strokeStyle = '#ff2d78'; ctx.lineWidth = 2; ctx.strokeRect((w - 560) / 2, h / 2 - 120, 560, bh);
      ctx.fillStyle = '#ffe600'; ctx.font = 'bold 18px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('NEW MISSION', w / 2, h / 2 - 88);
      ctx.fillStyle = '#fff'; ctx.font = '15px sans-serif';
      lines.forEach((ln, i) => ctx.fillText(ln, w / 2, h / 2 - 58 + i * 22));
    }
    drawMinimap(w, h);
  }

  function wrapText(text, max) {
    const words = text.split(' ');
    const lines = []; let cur = '';
    for (const word of words) {
      if ((cur + ' ' + word).trim().length > max) { lines.push(cur.trim()); cur = word; }
      else cur += ' ' + word;
    }
    if (cur.trim()) lines.push(cur.trim());
    return lines;
  }

  function drawMinimap(w, h) {
    const mw = 220; const mh = 165;
    const mx = w - mw - 14; const my = 14;
    const sx = mw / WORLD.w; const sy = mh / WORLD.h;
    ctx.fillStyle = 'rgba(8,8,20,0.8)';
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 2; ctx.strokeRect(mx, my, mw, mh);
    ctx.fillStyle = '#1c2733';
    for (const b of city.buildings) ctx.fillRect(mx + b.x * sx, my + b.y * sy, Math.max(2, b.w * sx), Math.max(2, b.h * sy));
    ctx.fillStyle = '#0e2f4a'; ctx.fillRect(mx, my + (WORLD.h - 60) * sy, mw, 60 * sy);
    ctx.fillStyle = '#ffd76a';
    for (const c of cars) ctx.fillRect(mx + c.x * sx - 1, my + c.y * sy - 1, 3, 3);
    ctx.fillStyle = '#ff2d2d';
    for (const c of cars) if (c.driver === 'cop') ctx.fillRect(mx + c.x * sx - 2, my + c.y * sy - 2, 5, 5);
    ctx.fillStyle = '#7c4dff';
    for (const e of enemies) ctx.fillRect(mx + e.x * sx - 2, my + e.y * sy - 2, 4, 4);
    const s = currentStep();
    if (s && s.x) {
      ctx.fillStyle = '#ffe600';
      ctx.beginPath(); ctx.arc(mx + s.x * sx, my + s.y * sy, 5 + Math.sin(state.time * 5) * 1.5, 0, Math.PI * 2); ctx.fill();
    }
    const px = player.car ? player.car.x : player.x;
    const py = player.car ? player.car.y : player.y;
    ctx.fillStyle = '#37c978';
    ctx.beginPath(); ctx.arc(mx + px * sx, my + py * sy, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(mx + px * sx, my + py * sy, 5, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('N ↑', mx + 6, my + mh - 8);
  }

  function drawTitle(w, h) {
    ctx.fillStyle = 'rgba(6,6,18,0.55)'; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff2d78'; ctx.font = 'bold 84px sans-serif';
    ctx.shadowColor = '#ff2d78'; ctx.shadowBlur = 34;
    ctx.fillText('NEON BAY', w / 2, h / 2 - 110);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#00e5ff'; ctx.font = 'bold 22px sans-serif';
    ctx.fillText('AN OPEN-WORLD CRIME STORY', w / 2, h / 2 - 70);
    ctx.fillStyle = '#fff'; ctx.font = '16px sans-serif';
    ctx.fillText('Steal cars. Outrun the law. Run five missions and own the city.', w / 2, h / 2 - 34);
    const hasSave = !!loadSave();
    ctx.fillStyle = '#ffe600'; ctx.font = 'bold 20px sans-serif';
    ctx.fillText(hasSave ? '[ ENTER ] New Game      [ C ] Continue' : '[ ENTER / CLICK ] New Game', w / 2, h / 2 + 14);
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = '14px sans-serif';
    const lines = [
      'WASD move · Mouse aim · Click shoot · E enter / steal car · F exit car',
      'W/S drive · A/D steer · Space handbrake · Esc pause · M mute',
      'Wanted stars bring the police — hide, or pay $200 at the Spray Shop.',
    ];
    lines.forEach((ln, i) => ctx.fillText(ln, w / 2, h / 2 + 52 + i * 22));
    ctx.fillStyle = '#8b93a3'; ctx.font = '12px sans-serif';
    ctx.fillText('An original game. Neon Bay, its people and its story are invented — nothing here is from any existing game.', w / 2, h - 22);
  }

  function drawPause(w, h) {
    ctx.fillStyle = 'rgba(6,6,18,0.6)'; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.font = 'bold 44px sans-serif';
    ctx.fillText('PAUSED', w / 2, h / 2 - 20);
    ctx.font = '16px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('Esc resume · M mute · R restart · Progress autosaves', w / 2, h / 2 + 20);
  }

  function drawGameOver(w, h) {
    ctx.fillStyle = 'rgba(20,4,10,0.75)'; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center'; ctx.fillStyle = '#ff2d2d'; ctx.font = 'bold 64px sans-serif';
    ctx.fillText('BUSTED / FLATLINED', w / 2, h / 2 - 40);
    ctx.fillStyle = '#fff'; ctx.font = '18px sans-serif';
    ctx.fillText('Neon Bay got the better of you this time.', w / 2, h / 2 + 4);
    ctx.fillStyle = '#ffe600'; ctx.font = 'bold 20px sans-serif';
    ctx.fillText('[ ENTER ] Try again', w / 2, h / 2 + 48);
  }

  function drawDone(w, h) {
    ctx.fillStyle = 'rgba(6,18,10,0.7)'; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center'; ctx.fillStyle = '#37c978'; ctx.font = 'bold 56px sans-serif';
    ctx.fillText('YOU OWN NEON BAY', w / 2, h / 2 - 30);
    ctx.fillStyle = '#fff'; ctx.font = '18px sans-serif';
    ctx.fillText('All five missions complete. Keep cruising — the city is yours.', w / 2, h / 2 + 12);
    ctx.fillStyle = '#ffe600'; ctx.font = 'bold 20px sans-serif';
    ctx.fillText('[ ENTER ] Keep playing', w / 2, h / 2 + 56);
  }

  // ---------- screenshot staging ----------
  function stageShot(name) {
    resetWorld(true);
    state.screen = 'play';
    if (name === 'start') {
      state.screen = 'title';
      state.camX = 1600; state.camY = 1200;
      player.x = 1600; player.y = 1200;
    } else if (name === 'play') {
      state.missionFlash = 0;
      const car = cars.find((c) => c.type === 'sports');
      if (car) enterCar(car);
      player.car.x = 1150; player.car.y = 700; player.car.angle = 0; player.car.speed = 300;
      state.camX = player.car.x; state.camY = player.car.y;
      state.cash = 1250; state.ammo = 48; state.health = 100;
    } else if (name === 'action') {
      state.missionFlash = 0;
      const car = cars.find((c) => c.type === 'sports');
      if (car) enterCar(car);
      player.car.x = 1600; player.car.y = 1150; player.car.angle = 0.4; player.car.speed = 380;
      state.camX = player.car.x; state.camY = player.car.y;
      state.wanted = 4; state.heat = 20;
      spawnCopCar(); spawnCopCar();
      const copCars = cars.filter((c) => c.driver === 'cop');
      if (copCars[0]) { copCars[0].x = player.car.x - 240; copCars[0].y = player.car.y + 130; copCars[0].angle = 0.4; }
      if (copCars[1]) { copCars[1].x = player.car.x + 300; copCars[1].y = player.car.y - 170; copCars[1].angle = 0.4 + Math.PI; }
      spawnEnemy(player.car.x + 170, player.car.y - 110);
      spawnEnemy(player.car.x + 210, player.car.y + 80);
      addParticles(player.car.x + 40, player.car.y, '#ffd76a', 10, 200);
      bullets.push({ x: player.car.x + 30, y: player.car.y, vx: 700, vy: -100, life: 0.5, from: 'player' });
      state.cash = 2340; state.health = 72;
    } else if (name === 'mission') {
      state.missionIndex = 4; state.missionStep = 2;
      state.missionMsg = MISSIONS[4].title + ': ' + MISSIONS[4].intro;
      state.missionFlash = 10;
      const car = cars.find((c) => c.type === 'sports');
      if (car) enterCar(car);
      player.car.x = 1600; player.car.y = 2050; player.car.angle = -Math.PI / 2; player.car.speed = 200;
      state.camX = player.car.x; state.camY = player.car.y;
      state.cash = 3120; state.wanted = 2;
    }
    resize();
    render();
    render();
  }

  // ---------- input ----------
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
  }

  window.addEventListener('keydown', (e) => {
    keys[e.code] = true;
    if (e.code === 'KeyM') { state.muted = audio.toggleMute(); showToast(state.muted ? 'Muted' : 'Sound on'); }
    if (state.screen === 'title' && (e.code === 'Enter' || e.code === 'Space')) startGame(false);
    else if (state.screen === 'title' && e.code === 'KeyC') startGame(true);
    else if (state.screen === 'over' && e.code === 'Enter') startGame(false);
    else if (state.screen === 'done' && e.code === 'Enter') { state.screen = 'play'; }
    else if (state.screen === 'play' && e.code === 'Escape') state.screen = 'paused';
    else if (state.screen === 'paused' && e.code === 'Escape') state.screen = 'play';
    else if (state.screen === 'paused' && e.code === 'KeyR') startGame(false);
    else if (state.screen === 'play' && e.code === 'KeyE') { if (player.car) exitCar(); else trySteal(); }
    else if (state.screen === 'play' && e.code === 'KeyF') exitCar();
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  canvas.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  canvas.addEventListener('mousedown', (e) => { mouse.down = true; mouse.clicked = true; audio.unlock(); if (state.screen === 'title') startGame(false); });
  window.addEventListener('mouseup', () => { mouse.down = false; });
  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden && state.screen === 'play') state.screen = 'paused'; });

  resize();
  state.camX = player.x; state.camY = player.y;
  resetWorld(true);

  return {
    state, player, city, audio,
    get cars() { return cars; }, get peds() { return peds; }, get enemies() { return enemies; },
    update, render, resize, startGame, stageShot, loadSave,
    step(dt) { if (state.screen === 'play') update(dt); else if (state.screen === 'title') { state.time += dt; state.camX = 1600 + Math.sin(state.time * 0.05) * 120; state.camY = 1200 + Math.cos(state.time * 0.04) * 80; } render(); },
  };
}
