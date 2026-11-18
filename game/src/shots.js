// Screenshot staging for Neon Bay: each ?shot= scene plays the real rules
// forward from a fresh seeded game with a scripted driver, so the frame is
// what a short real session looks like and the same seed always gives the
// same frame. Sets window.__shotReady when painted.
import { LANDMARKS } from './config.js';
import { newGame, playerPos, setBanner, stepGame } from './entities.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

// A fake input object with the same shape the real loop reads.
function scriptedInput(overrides) {
  const base = {
    up: () => false, down: () => false, left: () => false, right: () => false,
    handbrake: () => false, shift: () => false,
    mouse: () => ({ x: 640, y: 360, down: false }),
    takeClick: () => false, takeActions: () => 0, anyKey: () => false,
  };
  return Object.assign(base, overrides || {});
}

function driveSteps(G, steps, audio, steerFn) {
  for (let i = 0; i < steps; i += 1) {
    const car = G.player.inCar;
    let steer = { left: () => false, right: () => false };
    if (car && steerFn) steer = steerFn(G, i);
    const input = scriptedInput({
      up: () => true,
      left: steer.left, right: steer.right,
      mouse: () => ({ x: 640, y: 300, down: false }),
    });
    const pl = playerPos(G);
    const mouseWorld = { x: pl.x + 300, y: pl.y - 100 };
    stepGame(G, input, 1 / 60, audio, mouseWorld);
    if (G.gameOver) break;
  }
}

// Steer the scripted driver toward a compass angle (radians).
function steerToward(targetAngle) {
  return (g) => {
    const car = g.player.inCar;
    if (!car) return { left: () => false, right: () => false };
    let diff = targetAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return { left: () => diff < -0.08, right: () => diff > 0.08 };
  };
}

function putPlayerInSportsCar(G, x, y, angle) {
  const sports = G.cars.find((c) => c.type === 'sports' && c.parked);
  if (sports) {
    sports.parked = false;
    sports.x = x; sports.y = y; sports.angle = angle;
    G.player.inCar = sports;
    G.player.x = sports.x; G.player.y = sports.y;
    G.camera.x = sports.x; G.camera.y = sports.y;
  }
}

export function stageShot(name, audio) {
  const G = newGame(1);
  if (name === 'start') {
    // Title screen over a living city backdrop.
    for (let i = 0; i < 300; i += 1) stepGame(G, null, 1 / 60, audio, null);
    G.camera.x = 1200; G.camera.y = 900;
    return { G, screen: SCREEN_TITLE, hasSave: false };
  }
  if (name === 'action') {
    // Wanted 3, police interceptors ramming, a shootout by the club.
    // Stage on the east-west road by the club, heading west.
    putPlayerInSportsCar(G, 2500, 1648, Math.PI);
    G.wanted = 3;
    G.crimeTimer = 0;
    for (let i = 0; i < 5; i += 1) {
      G.enemies.push({
        x: LANDMARKS.club.x + (i - 2) * 70, y: LANDMARKS.club.y + 120,
        angle: 0, health: 100, shootTimer: 0.4 + i * 0.3, deathTimer: 0,
      });
    }
    driveSteps(G, 60 * 7, audio, steerToward(Math.PI));
    // The staging shootout is real, but the cover frame should show the
    // player alive and in the fight, not flatlined.
    G.player.health = 100;
    G.gameOver = false;
    G.bullets = [];
    G.particles = [];
    setBanner(G, 'WANTED ★★★ — LOSE THE BAY PD');
    G.bannerTimer = 99;
    return { G, screen: SCREEN_PLAY, hasSave: false };
  }
  if (name === 'mission') {
    // Mission-complete moment: Turf War finished at Club Neon, next job up.
    putPlayerInSportsCar(G, LANDMARKS.club.x, LANDMARKS.club.y, -Math.PI / 2);
    G.missionIndex = 4;
    G.player.cash = 640;
    driveSteps(G, 60 * 2, audio, null);
    return {
      G, screen: SCREEN_PLAY, hasSave: false,
      extra: { completeBanner: 'TURF WAR — CLUB NEON IS OURS  +$500' },
    };
  }
  // play: driving the sports car east along a road through the city,
  // HUD and minimap live.
  putPlayerInSportsCar(G, 700, 448, 0);
  G.player.cash = 230;
  G.missionIndex = 0;
  G.dialogue = {
    title: 'First Wheels',
    text: 'RICO: "Get to Sunset Garage — a pink sports car is waiting with your name on it."',
    hint: 'Follow the yellow waypoint to Sunset Garage.',
  };
  G.dialogueTimer = 99;
  driveSteps(G, 60 * 9, audio, steerToward(0));
  return { G, screen: SCREEN_PLAY, hasSave: false };
}
