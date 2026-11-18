// Neon Bay boot and loop: screens (title / play / paused / game over /
// story complete), fixed-step simulation, autosave, mute, and the
// ?shot= screenshot scenes. Keyboard + mouse, desktop Chrome.
import { SAVE_KEY, STEP } from './config.js';
import { createAudio } from './audio.js';
import { ACT_CONFIRM, ACT_INTERACT, ACT_MUTE, ACT_PAUSE, createInput } from './input.js';
import { createRandom } from './random.js';
import { newGame, playerPos, setMessage, stepGame, tryEnterCar, exitCar } from './entities.js';
import { updateMissions } from './missions.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_STORY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : (Math.floor(Math.random() * 4294967296) || 1);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const audio = createAudio();
const renderer = createRenderer(canvas);

function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.cash !== 'number' || typeof data.missionIndex !== 'number') return null;
    return data;
  } catch { return null; }
}

function saveGame(G) {
  try {
    const p = G.player;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: p.cash, health: p.health, ammo: p.ammo, missionIndex: G.missionIndex,
      x: p.x, y: p.y, wanted: G.wanted, savedAt: Date.now(),
    }));
  } catch { /* storage can be off; the run still plays */ }
}

function applySave(G, data) {
  G.player.cash = data.cash;
  G.player.health = data.health;
  G.player.ammo = data.ammo;
  G.missionIndex = data.missionIndex;
  G.wanted = data.wanted || 0;
  G.player.x = data.x; G.player.y = data.y;
  G.camera.x = data.x; G.camera.y = data.y;
}

function runShot(name) {
  const scene = stageShot(name, audio);
  const G = scene.G;
  let painted = 0;
  function paint() {
    renderer.draw(G, scene.screen, scene.hasSave, scene.extra);
    painted += 1;
    if (painted < 3) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let G = newGame(seed);
  let screen = SCREEN_TITLE;
  let saved = loadSave();
  let accumulator = 0;
  let last = performance.now();
  let saveTimer = 0;
  let titleAttract = 0;

  function announce(message) { status.textContent = message; }

  function startNew() {
    G = newGame(seed);
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Playing Neon Bay. Follow the yellow waypoint.');
    setMessage(G, 'Welcome to Neon Bay. Follow the yellow waypoint to Sunset Garage.');
  }

  function continueGame() {
    if (!saved) return startNew();
    G = newGame(seed);
    applySave(G, saved);
    screen = SCREEN_PLAY;
    audio.unlock();
    announce('Continuing your saved run.');
    setMessage(G, 'Welcome back to Neon Bay.');
  }

  function mouseWorld() {
    const m = input.mouse();
    const scale = Math.min(canvas.width / 1280, canvas.height / 720);
    const ox = (canvas.width - 1280 * scale) / 2;
    const oy = (canvas.height - 720 * scale) / 2;
    const sx = (m.x - ox) / scale;
    const sy = (m.y - oy) / scale;
    return {
      x: G.camera.x - 640 + sx,
      y: G.camera.y - 360 + sy,
    };
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACT_MUTE) {
      const muted = audio.toggleMute();
      G.muted = muted;
      setMessage(G, muted ? 'Sound muted (M to unmute).' : 'Sound on.');
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACT_CONFIRM) startNew();
      else if (input.takeClick()) startNew();
      return;
    }
    if (screen === SCREEN_OVER || screen === SCREEN_STORY) {
      if (actions & ACT_CONFIRM || input.takeClick()) startNew();
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACT_PAUSE | ACT_CONFIRM)) { screen = SCREEN_PLAY; announce('Playing.'); }
      return;
    }
    // SCREEN_PLAY
    if (actions & ACT_PAUSE) {
      screen = SCREEN_PAUSED;
      saveGame(G);
      announce('Paused.');
      return;
    }
    if (actions & ACT_INTERACT) {
      audio.unlock();
      if (G.player.inCar) exitCar(G);
      else if (!tryEnterCar(G, audio)) setMessage(G, 'No car close enough. Walk up to a car and press E.');
    }
    if (input.takeClick()) audio.unlock();
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      titleAttract += STEP;
      stepGame(G, null, STEP, null, null);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    stepGame(G, input, STEP, audio, mouseWorld());
    updateMissions(G, STEP, audio);
    saveTimer += STEP;
    if (saveTimer > 10) { saveTimer = 0; saveGame(G); }
    if (G.gameOver) {
      screen = SCREEN_OVER;
      try { window.localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
      announce('Game over.');
    } else if (G.storyDone && screen === SCREEN_PLAY) {
      screen = SCREEN_STORY;
      saveGame(G);
      announce('Story complete. Neon Bay is yours.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    // Title screen: Enter starts, C continues a save.
    if (screen === SCREEN_TITLE && saved) {
      // C is read via a direct key check in the loop below.
    }
    while (accumulator >= STEP) {
      step();
      accumulator -= STEP;
      if (screen !== SCREEN_TITLE && screen !== SCREEN_PLAY) break;
    }
    if (screen !== SCREEN_TITLE && screen !== SCREEN_PLAY) accumulator = 0;
    renderer.draw(G, screen, !!saved, null);
  }

  // Continue with C on the title screen.
  window.addEventListener('keydown', (event) => {
    if (screen === SCREEN_TITLE && event.code === 'KeyC' && saved) {
      event.preventDefault();
      continueGame();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      saveGame(G);
      announce('Paused.');
    }
  });

  announce('Neon Bay. Press Enter or click to start. C continues a saved run.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
