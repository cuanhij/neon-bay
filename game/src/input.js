// Keyboard + mouse input for Neon Bay. Held keys are read every frame;
// one-shot presses (interact, pause, confirm, mute) are queued as flags
// and taken once, so a press between frames is never lost or double-counted.
export const ACT_CONFIRM = 1;
export const ACT_PAUSE = 2;
export const ACT_INTERACT = 4;
export const ACT_MUTE = 8;

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let mouseClicked = false;

  window.addEventListener('keydown', (event) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    if (event.repeat) { keys.add(event.code); return; }
    keys.add(event.code);
    if (event.code === 'Enter' || event.code === 'Space') actions |= ACT_CONFIRM;
    if (event.code === 'Escape' || event.code === 'KeyP') actions |= ACT_PAUSE;
    if (event.code === 'KeyE') actions |= ACT_INTERACT;
    if (event.code === 'KeyM') actions |= ACT_MUTE;
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => { keys.clear(); mouseDown = false; });
  canvas.addEventListener('mousemove', (event) => {
    const r = canvas.getBoundingClientRect();
    mouseX = event.clientX - r.left;
    mouseY = event.clientY - r.top;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) { mouseDown = true; mouseClicked = true; }
  });
  window.addEventListener('mouseup', () => { mouseDown = false; });

  const held = (...codes) => codes.some((c) => keys.has(c));
  return {
    up: () => held('KeyW', 'ArrowUp'),
    down: () => held('KeyS', 'ArrowDown'),
    left: () => held('KeyA', 'ArrowLeft'),
    right: () => held('KeyD', 'ArrowRight'),
    handbrake: () => held('Space'),
    shift: () => held('ShiftLeft', 'ShiftRight'),
    mouse: () => ({ x: mouseX, y: mouseY, down: mouseDown }),
    takeClick() { const c = mouseClicked; mouseClicked = false; return c; },
    takeActions() { const t = actions; actions = 0; return t; },
    anyKey() { return keys.size > 0; },
  };
}
