// Neon Bay boot: one fixed-step loop, deterministic screenshot staging,
// and the status line for screen readers. ?shot=start|play|action|mission
// with &seed=N stages that scene, paints it twice and sets window.__shotReady.
import { createGame } from './game.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const game = createGame(canvas, seed);
window.__game = game;

function announce(message) { status.textContent = message; }

if (shot) {
  game.stageShot(shot);
  requestAnimationFrame(() => {
    game.render();
    window.__shotReady = true;
    announce('Neon Bay screenshot scene: ' + shot);
  });
} else {
  let accumulator = 0;
  let last = performance.now();
  announce('Neon Bay. Press Enter or click to start. Steal cars, run missions, outrun the police.');
  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    while (accumulator >= STEP) {
      game.step(STEP);
      accumulator -= STEP;
    }
    if (game.state.screen === 'title') game.render();
  }
  requestAnimationFrame(frame);
}
