// Neon Bay simulation: the player on foot and in cars, traffic, pedestrians,
// police, gang enemies, bullets, pickups, particles and the wanted system.
// No drawing here — render.js reads this state. Missions live in missions.js
// and read/write the same state object.
import { CAR_TYPES, LANDMARKS, MISSIONS, PLAYER_START, STEP, WORLD } from './config.js';
import { buildCity, clampToWorld, inWater, nearestRoadPoint, onRoad, resolveBuildingCollisions } from './city.js';
import { createRandom } from './random.js';

let nextCarId = 1;

export function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

export function newGame(seed) {
  const rng = createRandom(seed);
  const city = buildCity(rng);
  const G = {
    seed, rng, city,
    clock: 17.6 * 3600, elapsed: 0,
    player: {
      x: PLAYER_START.x, y: PLAYER_START.y, angle: -Math.PI / 2,
      health: 100, cash: 80, ammo: 24, speed: 0, inCar: null,
      invuln: 0, walkSpeed: 230,
    },
    cars: [], peds: [], footCops: [], enemies: [], bullets: [],
    pickups: [], particles: [], skids: [],
    camera: { x: PLAYER_START.x, y: PLAYER_START.y },
    shake: 0, wanted: 0, crimeTimer: 0, decayTimer: 0, sprayTimer: 0,
    missionIndex: 0, mission: null, dialogue: null, dialogueTimer: 0,
    banner: null, bannerTimer: 0, message: '', messageTimer: 0,
    storyDone: false, gameOver: false, overReason: '', shootCooldown: 0,
    policeTimer: 0, trafficTimer: 0, pedTimer: 0, pickupTimer: 0,
    stats: { stolen: 0, kills: 0, shots: 0 },
    muted: false,
  };
  // Parked cars around the city, plus the mission sports car at the garage.
  const parkedSpots = [
    { x: 700, y: 660, type: 'sports' }, { x: 1060, y: 460, type: 'sedan' },
    { x: 1460, y: 860, type: 'taxi' }, { x: 2260, y: 1060, type: 'sedan' },
    { x: 1860, y: 1460, type: 'truck' }, { x: 660, y: 1460, type: 'sedan' },
    { x: 2660, y: 1460, type: 'taxi' }, { x: 1060, y: 1860, type: 'sedan' },
    { x: 2260, y: 660, type: 'truck' }, { x: 1460, y: 1860, type: 'sports' },
  ];
  for (const s of parkedSpots) {
    G.cars.push(makeCar(G, s.type, s.x, s.y, rng.range(0, Math.PI * 2), { parked: true }));
  }
  for (let i = 0; i < 10; i += 1) spawnTrafficCar(G, true);
  for (let i = 0; i < 14; i += 1) spawnPed(G, true);
  spawnPickup(G, 'health', 900, 900);
  spawnPickup(G, 'ammo', 1300, 500);
  spawnPickup(G, 'cash', 1700, 1300);
  return G;
}

export function makeCar(G, type, x, y, angle, opts = {}) {
  const t = CAR_TYPES[type];
  const car = {
    id: nextCarId += 1, type, name: t.name, x, y, angle, speed: 0,
    color: type === 'sports' && opts.pink ? '#ff2e88' : t.color,
    parked: !!opts.parked, traffic: !!opts.traffic, police: type === 'police',
    driver: opts.traffic ? true : false, hp: 100, steerVis: 0, brakeLight: false,
    aiDir: 1, aiTurnAt: 0, aiSpeed: t.top * (0.45 + G.rng() * 0.2),
  };
  return car;
}

function randomRoadSpot(G) {
  const gx = 1 + Math.floor(G.rng() * 7);
  const gy = 1 + Math.floor(G.rng() * 5);
  const horizontal = G.rng() < 0.5;
  if (horizontal) return { x: gx * 400 + G.rng() * 300, y: gy * 400 + 48, angle: 0 };
  return { x: gx * 400 + 48, y: gy * 400 + G.rng() * 300, angle: Math.PI / 2 };
}

export function spawnTrafficCar(G, anywhere) {
  const types = ['sedan', 'sedan', 'taxi', 'taxi', 'truck'];
  const spot = randomRoadSpot(G);
  const car = makeCar(G, G.rng.pick(types), spot.x, spot.y, spot.angle, { traffic: true });
  car.speed = car.aiSpeed * 0.6;
  if (!anywhere) {
    const p = playerPos(G);
    car.x = p.x + (G.rng() < 0.5 ? -1 : 1) * (700 + G.rng() * 300);
    car.y = p.y + (G.rng() < 0.5 ? -1 : 1) * (500 + G.rng() * 300);
    const near = nearestRoadPoint(car.x, car.y);
    car.x = near.x; car.y = near.y;
  }
  G.cars.push(car);
  return car;
}

export function spawnPed(G, anywhere) {
  const spot = randomRoadSpot(G);
  const p = {
    x: spot.x + G.rng.range(-60, 60), y: spot.y + G.rng.range(-60, 60),
    angle: G.rng() * Math.PI * 2, speed: 45 + G.rng() * 35,
    color: G.rng.pick(['#e8b04b', '#7ec8e3', '#c98ad9', '#e3e3e3', '#8fd694']),
    walkPhase: G.rng() * 6, panic: 0, dead: false,
  };
  if (!anywhere) {
    const pl = playerPos(G);
    p.x = pl.x + (G.rng() < 0.5 ? -1 : 1) * (500 + G.rng() * 400);
    p.y = pl.y + (G.rng() < 0.5 ? -1 : 1) * (400 + G.rng() * 300);
  }
  clampToWorld(p, 40);
  G.peds.push(p);
  return p;
}

export function spawnPickup(G, kind, x, y) {
  G.pickups.push({ x, y, kind, bob: G.rng() * 6 });
}

export function playerPos(G) {
  const car = G.player.inCar;
  return car ? { x: car.x, y: car.y } : { x: G.player.x, y: G.player.y };
}

export function addWanted(G, stars) {
  G.wanted = Math.min(5, G.wanted + stars);
  G.crimeTimer = 0;
  G.decayTimer = 0;
}

export function addParticles(G, x, y, color, n, speed) {
  for (let i = 0; i < n; i += 1) {
    const a = G.rng() * Math.PI * 2;
    const s = (speed || 160) * (0.4 + G.rng() * 0.8);
    G.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + G.rng() * 0.4, max: 0.9, color, size: 2 + G.rng() * 3 });
  }
}

export function fireBullet(G, x, y, angle, from, audio) {
  G.bullets.push({ x, y, vx: Math.cos(angle) * 780, vy: Math.sin(angle) * 780, from, life: 1.1 });
  G.shake = Math.max(G.shake, from === 'player' ? 3 : 1.5);
  addParticles(G, x + Math.cos(angle) * 22, y + Math.sin(angle) * 22, '#ffd23f', 4, 120);
  if (audio) { if (from === 'player') audio.shoot(); else audio.enemyShoot(); }
}

function nearestCar(G, x, y, maxDist, filter) {
  let best = null;
  let bestD = maxDist;
  for (const c of G.cars) {
    if (filter && !filter(c)) continue;
    const d = dist(x, y, c.x, c.y);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

export function tryEnterCar(G, audio) {
  const p = G.player;
  const car = nearestCar(G, p.x, p.y, 70, (c) => !c.police || c.parked);
  if (!car) return false;
  if (car.traffic && car.driver) {
    // Carjacking: pull the driver out, they flee on foot, wanted goes up.
    car.traffic = false;
    car.driver = false;
    addWanted(G, 1);
    G.stats.stolen += 1;
    spawnPed(G, false);
    setMessage(G, 'Carjacked! Wanted level up — the Bay PD is on you.');
    if (audio) audio.pickup();
  } else if (car.parked) {
    car.parked = false;
    setMessage(G, `Took the ${car.name}.`);
  }
  p.inCar = car;
  p.x = car.x; p.y = car.y;
  return true;
}

export function exitCar(G) {
  const p = G.player;
  const car = p.inCar;
  if (!car) return;
  p.inCar = null;
  const a = car.angle + Math.PI / 2;
  p.x = car.x + Math.cos(a) * 34;
  p.y = car.y + Math.sin(a) * 34;
  clampToWorld(p, 30);
  resolveBuildingCollisions(G.city, p, 12);
  setMessage(G, 'On foot. Press E near a car to get in.');
}

export function setMessage(G, text) {
  G.message = text;
  G.messageTimer = 4;
}

export function setBanner(G, text) {
  G.banner = text;
  G.bannerTimer = 3.2;
}

function carCollidesBuildings(G, car) {
  const before = { x: car.x, y: car.y };
  if (resolveBuildingCollisions(G.city, car, 24)) {
    const hitSpeed = Math.abs(car.speed);
    if (hitSpeed > 180) {
      car.speed *= -0.25;
      addParticles(G, car.x, car.y, '#ffb020', 8, 200);
      G.shake = Math.max(G.shake, 5);
    } else {
      car.speed *= 0.4;
    }
    return before.x !== car.x || before.y !== car.y;
  }
  return false;
}

function updatePlayerCar(G, input, dt, audio) {
  const p = G.player;
  const car = p.inCar;
  const t = CAR_TYPES[car.type];
  const forward = input.up() ? 1 : input.down() ? -1 : 0;
  const steer = (input.left() ? -1 : 0) + (input.right() ? 1 : 0);
  const handbrake = input.handbrake();
  const accel = forward * t.accel * (handbrake ? 0.4 : 1);
  car.speed += accel * dt;
  if (!forward) car.speed *= Math.pow(0.4, dt);
  if (handbrake) car.speed *= Math.pow(0.12, dt);
  const max = forward < 0 ? t.reverse : t.top;
  car.speed = Math.max(-t.reverse, Math.min(max, car.speed));
  const grip = handbrake ? t.grip * 0.45 : t.grip;
  const turnRate = steer * t.steer * Math.min(1, Math.abs(car.speed) / 120) * (car.speed < 0 ? -1 : 1);
  car.angle += turnRate * dt * (handbrake ? 1.5 : 1);
  car.steerVis = steer;
  car.brakeLight = input.down() || handbrake;
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  car.x = nx; car.y = ny;
  // Skid marks while drifting or handbraking at speed.
  if ((handbrake && Math.abs(car.speed) > 150) || Math.abs(turnRate) > 2.4) {
    const bx = car.x - Math.cos(car.angle) * 20;
    const by = car.y - Math.sin(car.angle) * 20;
    G.skids.push({ x: bx, y: by, angle: car.angle, life: 6 });
    if (G.skids.length > 220) G.skids.splice(0, G.skids.length - 220);
  }
  if (inWater(car.x, car.y)) { car.x -= Math.cos(car.angle) * car.speed * dt; car.y -= Math.sin(car.angle) * car.speed * dt; car.speed *= 0.5; }
  clampToWorld(car, 30);
  const crashed = carCollidesBuildings(G, car);
  if (crashed && Math.abs(car.speed) > 200 && audio) audio.crash();
  // Bumping other cars.
  for (const other of G.cars) {
    if (other === car) continue;
    const d = dist(car.x, car.y, other.x, other.y);
    if (d < 46 && d > 0.01) {
      const push = (46 - d) / 2;
      const ux = (other.x - car.x) / d;
      const uy = (other.y - car.y) / d;
      other.x += ux * push; other.y += uy * push;
      car.x -= ux * push * 0.4; car.y -= uy * push * 0.4;
      if (Math.abs(car.speed) > 220) {
        car.speed *= 0.6;
        addParticles(G, (car.x + other.x) / 2, (car.y + other.y) / 2, '#ffd23f', 6, 160);
        if (audio) audio.crash();
      }
    }
  }
  // Running over pedestrians.
  for (const ped of G.peds) {
    if (ped.dead) continue;
    if (dist(car.x, car.y, ped.x, ped.y) < 34 && Math.abs(car.speed) > 60) {
      ped.dead = true;
      addWanted(G, 1);
      addParticles(G, ped.x, ped.y, '#e5534b', 14, 220);
      G.shake = Math.max(G.shake, 6);
      setMessage(G, 'You hit a pedestrian! Wanted level up.');
      if (audio) audio.crash();
    }
  }
  p.x = car.x; p.y = car.y; p.angle = car.angle; p.speed = car.speed;
}

function updatePlayerFoot(G, input, dt, audio, mouseWorld) {
  const p = G.player;
  let mx = (input.right() ? 1 : 0) - (input.left() ? 1 : 0);
  let my = (input.down() ? 1 : 0) - (input.up() ? 1 : 0);
  const len = Math.hypot(mx, my);
  if (len > 0) { mx /= len; my /= len; }
  const speed = input.shift() ? p.walkSpeed * 1.5 : p.walkSpeed;
  p.x += mx * speed * dt;
  p.y += my * speed * dt;
  p.speed = len > 0 ? speed : 0;
  if (mouseWorld) p.angle = Math.atan2(mouseWorld.y - p.y, mouseWorld.x - p.x);
  else if (len > 0) p.angle = Math.atan2(my, mx);
  if (inWater(p.x, p.y)) { p.x -= mx * speed * dt; p.y -= my * speed * dt; }
  clampToWorld(p, 24);
  resolveBuildingCollisions(G.city, p, 12);
  // Pickups.
  for (const pk of G.pickups) {
    if (pk.taken) continue;
    if (dist(p.x, p.y, pk.x, pk.y) < 30) {
      pk.taken = true;
      if (pk.kind === 'health') { p.health = Math.min(100, p.health + 40); setMessage(G, 'Picked up a medkit. +40 health.'); }
      if (pk.kind === 'ammo') { p.ammo += 24; setMessage(G, 'Picked up ammo. +24 rounds.'); }
      if (pk.kind === 'cash') { p.cash += 60; setMessage(G, 'Picked up $60.'); }
      if (audio) audio.pickup();
      addParticles(G, pk.x, pk.y, '#7ee0a3', 10, 140);
    }
  }
  // Shooting with the mouse.
  if (input.mouse().down && p.ammo > 0 && G.shootCooldown <= 0) {
    p.ammo -= 1;
    G.stats.shots += 1;
    G.shootCooldown = 0.22;
    fireBullet(G, p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20, p.angle, 'player', audio);
    if (G.wanted === 0) addWanted(G, 1);
    else G.crimeTimer = 0;
  }
}

function updateTraffic(G, dt) {
  const pl = playerPos(G);
  for (const car of G.cars) {
    if (!car.traffic) continue;
    const t = CAR_TYPES[car.type];
    // Steer toward the nearest road centre line.
    const near = nearestRoadPoint(car.x, car.y);
    const targetAngle = Math.abs(car.x - near.x) < Math.abs(car.y - near.y)
      ? (car.y < near.y ? Math.PI / 2 : -Math.PI / 2)
      : (car.x < near.x ? 0 : Math.PI);
    let diff = targetAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += Math.max(-1.6 * dt, Math.min(1.6 * dt, diff));
    car.speed += (car.aiSpeed - car.speed) * dt * 0.8;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    if (car.x < 60 || car.x > WORLD.width - 60 || car.y < 60 || car.y > WORLD.height - 60) {
      car.angle += Math.PI;
      car.x = Math.max(80, Math.min(WORLD.width - 80, car.x));
      car.y = Math.max(80, Math.min(WORLD.height - 80, car.y));
    }
    if (resolveBuildingCollisions(G.city, car, 24)) car.angle += Math.PI / 2;
    // Keep traffic away from the player so it never blocks a screenshot.
    if (dist(car.x, car.y, pl.x, pl.y) > 1600) {
      const spot = randomRoadSpot(G);
      car.x = spot.x; car.y = spot.y; car.angle = spot.angle;
    }
  }
  G.trafficTimer -= dt;
  if (G.trafficTimer <= 0) {
    G.trafficTimer = 3;
    const traffic = G.cars.filter((c) => c.traffic).length;
    if (traffic < 10) spawnTrafficCar(G, false);
  }
}

function updatePeds(G, dt) {
  const pl = playerPos(G);
  for (const ped of G.peds) {
    if (ped.dead) continue;
    ped.walkPhase += dt * 6;
    if (ped.panic > 0) {
      ped.panic -= dt;
      const away = Math.atan2(ped.y - pl.y, ped.x - pl.x);
      ped.x += Math.cos(away) * 150 * dt;
      ped.y += Math.sin(away) * 150 * dt;
    } else {
      ped.x += Math.cos(ped.angle) * ped.speed * dt;
      ped.y += Math.sin(ped.angle) * ped.speed * dt;
      if (G.rng() < dt * 0.12) ped.angle = G.rng() * Math.PI * 2;
      if (!onRoad(ped.x, ped.y) && G.rng() < dt * 0.5) {
        const near = nearestRoadPoint(ped.x, ped.y);
        ped.angle = Math.atan2(near.y - ped.y, near.x - ped.x);
      }
    }
    if (G.wanted >= 2 && dist(ped.x, ped.y, pl.x, pl.y) < 260) ped.panic = 2;
    clampToWorld(ped, 30);
    resolveBuildingCollisions(G.city, ped, 10);
  }
  G.peds = G.peds.filter((p) => !p.dead || G.rng() < 0.02);
  G.pedTimer -= dt;
  if (G.pedTimer <= 0) {
    G.pedTimer = 4;
    if (G.peds.length < 16) spawnPed(G, false);
  }
}

function spawnPoliceCar(G) {
  const pl = playerPos(G);
  const ang = G.rng() * Math.PI * 2;
  const spot = nearestRoadPoint(pl.x + Math.cos(ang) * 800, pl.y + Math.sin(ang) * 800);
  const car = makeCar(G, 'police', spot.x, spot.y, ang, {});
  car.speed = 300;
  G.cars.push(car);
  return car;
}

function spawnFootCop(G) {
  const pl = playerPos(G);
  const ang = G.rng() * Math.PI * 2;
  G.footCops.push({
    x: pl.x + Math.cos(ang) * 320, y: pl.y + Math.sin(ang) * 320,
    angle: 0, health: 50, shootTimer: 1 + G.rng(), speed: 190,
  });
}

function updatePolice(G, dt, audio) {
  const pl = playerPos(G);
  const want = G.wanted;
  const targetCars = Math.min(want, 4);
  const policeCars = G.cars.filter((c) => c.police);
  G.policeTimer -= dt;
  if (G.policeTimer <= 0) {
    G.policeTimer = 2.5;
    if (want > 0 && policeCars.length < targetCars) spawnPoliceCar(G);
    if (want >= 2 && G.footCops.length < want) spawnFootCop(G);
    if (want === 0) {
      // Heat off: police give up and drive away.
      for (const c of policeCars) { c.police = false; c.traffic = true; }
      G.footCops = [];
    }
  }
  for (const car of policeCars) {
    const t = CAR_TYPES.police;
    const targetAngle = Math.atan2(pl.y - car.y, pl.x - car.x);
    let diff = targetAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += Math.max(-2.6 * dt, Math.min(2.6 * dt, diff));
    const d = dist(car.x, car.y, pl.x, pl.y);
    const wantSpeed = d > 120 ? t.top : t.top * 0.55;
    car.speed += (wantSpeed - car.speed) * dt * 0.9;
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    clampToWorld(car, 30);
    if (resolveBuildingCollisions(G.city, car, 24)) { car.speed *= 0.5; car.angle += 0.6; }
    // Ram the player's car.
    const pCar = G.player.inCar;
    if (pCar && dist(car.x, car.y, pCar.x, pCar.y) < 48) {
      pCar.speed *= 0.7;
      G.shake = Math.max(G.shake, 4);
      addParticles(G, car.x, car.y, '#ffd23f', 5, 140);
      if (audio && G.rng() < 0.3) audio.crash();
    }
    if (d > 1800) { car.x = pl.x + 700; car.y = pl.y; }
  }
  // Foot police chase and shoot.
  for (const cop of G.footCops) {
    const d = dist(cop.x, cop.y, pl.x, pl.y);
    cop.angle = Math.atan2(pl.y - cop.y, pl.x - cop.x);
    if (d > 90) {
      cop.x += Math.cos(cop.angle) * cop.speed * dt;
      cop.y += Math.sin(cop.angle) * cop.speed * dt;
    } else if (d < 46 && !G.player.inCar) {
      // Arrested / beaten down on foot.
      G.player.health -= 26 * dt;
      G.shake = Math.max(G.shake, 2);
    }
    cop.shootTimer -= dt;
    if (cop.shootTimer <= 0 && d < 520 && d > 60) {
      cop.shootTimer = 1.1 + G.rng() * 0.7;
      const aim = cop.angle + G.rng.range(-0.12, 0.12);
      fireBullet(G, cop.x, cop.y, aim, 'cop', audio);
    }
    resolveBuildingCollisions(G.city, cop, 10);
  }
  // Wanted decay: stay out of trouble and out of sight and the heat fades.
  G.crimeTimer += dt;
  if (want > 0 && G.crimeTimer > 18) {
    G.decayTimer += dt;
    if (G.decayTimer > 9) {
      G.decayTimer = 0;
      G.wanted -= 1;
      if (G.wanted === 0) setMessage(G, 'You lost the heat. Wanted level clear.');
    }
  }
}

function updateEnemies(G, dt, audio) {
  const pl = playerPos(G);
  for (const e of G.enemies) {
    if (e.health <= 0) continue;
    const d = dist(e.x, e.y, pl.x, pl.y);
    e.angle = Math.atan2(pl.y - e.y, pl.x - e.x);
    if (d > 260) {
      e.x += Math.cos(e.angle) * 150 * dt;
      e.y += Math.sin(e.angle) * 150 * dt;
    } else if (d < 120) {
      e.x -= Math.cos(e.angle) * 60 * dt;
      e.y -= Math.sin(e.angle) * 60 * dt;
    }
    e.shootTimer -= dt;
    if (e.shootTimer <= 0 && d < 560) {
      e.shootTimer = 0.9 + G.rng() * 0.9;
      fireBullet(G, e.x, e.y, e.angle + G.rng.range(-0.14, 0.14), 'enemy', audio);
    }
    resolveBuildingCollisions(G.city, e, 10);
  }
  G.enemies = G.enemies.filter((e) => e.health > 0 || e.deathTimer > 0);
  for (const e of G.enemies) if (e.health <= 0) e.deathTimer = (e.deathTimer || 0.6) - dt;
}

function updateBullets(G, dt, audio) {
  const p = G.player;
  for (const b of G.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) continue;
    // Buildings stop bullets.
    let blocked = false;
    for (const bd of G.city.buildings) {
      if (b.x > bd.x && b.x < bd.x + bd.w && b.y > bd.y && b.y < bd.y + bd.h) { blocked = true; break; }
    }
    if (blocked) { b.life = 0; addParticles(G, b.x, b.y, '#c8c8c8', 3, 100); continue; }
    if (b.from === 'player') {
      for (const e of G.enemies) {
        if (e.health > 0 && dist(b.x, b.y, e.x, e.y) < 16) {
          e.health -= 34; b.life = 0;
          addParticles(G, e.x, e.y, '#e5534b', 8, 180);
          if (e.health <= 0) {
            G.stats.kills += 1;
            G.player.cash += 25;
            addParticles(G, e.x, e.y, '#ff2e88', 16, 240);
            setMessage(G, 'Viper down. +$25.');
          }
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const cop of G.footCops) {
        if (cop.health > 0 && dist(b.x, b.y, cop.x, cop.y) < 16) {
          cop.health -= 34; b.life = 0;
          addParticles(G, cop.x, cop.y, '#3f8fd2', 8, 180);
          if (cop.health <= 0) { addWanted(G, 1); setMessage(G, 'You took down an officer! Wanted level up.'); }
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const ped of G.peds) {
        if (!ped.dead && dist(b.x, b.y, ped.x, ped.y) < 14) {
          ped.dead = true; b.life = 0;
          addWanted(G, 1);
          addParticles(G, ped.x, ped.y, '#e5534b', 10, 200);
          break;
        }
      }
    } else {
      // Enemy / cop bullets hit the player.
      const target = p.inCar ? { x: p.inCar.x, y: p.inCar.y, r: 26 } : { x: p.x, y: p.y, r: 13 };
      if (dist(b.x, b.y, target.x, target.y) < target.r && p.invuln <= 0) {
        b.life = 0;
        p.health -= b.from === 'enemy' ? 9 : 7;
        p.invuln = 0.25;
        G.shake = Math.max(G.shake, 4);
        addParticles(G, p.x, p.y, '#e5534b', 6, 160);
        if (p.health <= 0) {
          p.health = 0;
          G.gameOver = true;
          G.overReason = 'You were taken down in Neon Bay.';
          if (audio) audio.fail();
        }
      }
    }
  }
  G.bullets = G.bullets.filter((b) => b.life > 0);
  G.footCops = G.footCops.filter((c) => c.health > 0);
}

function updateSpray(G, dt, audio) {
  G.sprayTimer -= dt;
  const pl = playerPos(G);
  const d = dist(pl.x, pl.y, LANDMARKS.spray.x, LANDMARKS.spray.y);
  if (d < 130 && G.wanted > 0 && G.player.inCar && G.sprayTimer <= 0) {
    if (G.player.cash >= 200) {
      G.player.cash -= 200;
      G.wanted = 0;
      G.sprayTimer = 5;
      const car = G.player.inCar;
      car.color = ['#29e6ff', '#7ee0a3', '#ffd23f', '#b678ff'][Math.floor(G.rng() * 4)];
      setMessage(G, 'Repaint done — $200. The cops lost your trail.');
      setBanner(G, 'CLEAN — WANTED CLEARED');
      if (audio) audio.cash();
    } else {
      setMessage(G, 'Spray & Go needs $200 to clear your wanted level.');
      G.sprayTimer = 5;
    }
  }
  // Hospital heals on foot nearby.
  const dh = dist(pl.x, pl.y, LANDMARKS.hospital.x, LANDMARKS.hospital.y);
  if (dh < 140 && !G.player.inCar && G.player.health < 100) {
    G.player.health = Math.min(100, G.player.health + 12 * dt);
  }
}

// One fixed simulation step. `input` may be null (title backdrop / shots).
export function stepGame(G, input, dt, audio, mouseWorld) {
  G.elapsed += dt;
  G.clock += dt * 24; // game clock runs fast: a full dusk in a few minutes
  if (G.clock > 21 * 3600) G.clock = 17.5 * 3600;
  if (G.shootCooldown > 0) G.shootCooldown -= dt;
  if (G.player.invuln > 0) G.player.invuln -= dt;
  if (G.messageTimer > 0) G.messageTimer -= dt;
  if (G.bannerTimer > 0) G.bannerTimer -= dt;
  if (G.dialogueTimer > 0) G.dialogueTimer -= dt;
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 14);

  if (input) {
    if (G.player.inCar) updatePlayerCar(G, input, dt, audio);
    else updatePlayerFoot(G, input, dt, audio, mouseWorld);
  }
  updateTraffic(G, dt);
  updatePeds(G, dt);
  updatePolice(G, dt, audio);
  updateEnemies(G, dt, audio);
  updateBullets(G, dt, audio);
  updateSpray(G, dt, audio);

  for (const pt of G.particles) {
    pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt;
  }
  G.particles = G.particles.filter((pt) => pt.life > 0);
  for (const s of G.skids) s.life -= dt;
  G.skids = G.skids.filter((s) => s.life > 0);
  for (const pk of G.pickups) pk.bob += dt;
  G.pickupTimer -= dt;
  if (G.pickupTimer <= 0) {
    G.pickupTimer = 14;
    const alive = G.pickups.filter((p) => !p.taken).length;
    if (alive < 5) {
      const spot = randomRoadSpot(G);
      spawnPickup(G, G.rng.pick(['health', 'ammo', 'cash']), spot.x, spot.y);
    }
  }
  G.pickups = G.pickups.filter((p) => !p.taken);

  // Camera follows the player, eased.
  const pl = playerPos(G);
  G.camera.x += (pl.x - G.camera.x) * Math.min(1, dt * 5);
  G.camera.y += (pl.y - G.camera.y) * Math.min(1, dt * 5);
  if (audio) {
    const speedRatio = G.player.inCar ? Math.abs(G.player.inCar.speed) / CAR_TYPES[G.player.inCar.type].top : 0;
    audio.update(dt, speedRatio, G.wanted, !!G.player.inCar);
  }
}

export function missionTarget(G) {
  if (G.missionIndex >= MISSIONS.length) return null;
  return MISSIONS[G.missionIndex].target;
}
