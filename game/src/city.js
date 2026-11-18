// Neon Bay's city: a fixed grid of streets and blocks, a harbor along the south
// edge, a spray shop, a hospital and mission landmarks. Everything is generated
// from a seed so a given seed always builds the same city.
import { clamp, pick, randRange } from './util.js';

export const WORLD = { w: 3200, h: 2400 };
export const BLOCK = 320;
export const STREET = 90;

const BUILDING_COLORS = ['#2b2f4a', '#3a2b4a', '#26343f', '#40304a', '#2e3a2e', '#4a2b33'];
const NEON = ['#ff2d78', '#00e5ff', '#ffe600', '#7c4dff', '#00ff9d', '#ff6a00'];

export function createCity(rng) {
  const buildings = [];
  const signs = [];
  const cols = Math.floor(WORLD.w / (BLOCK + STREET));
  const rows = Math.floor(WORLD.h / (BLOCK + STREET));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const bx = c * (BLOCK + STREET) + STREET;
      const by = r * (BLOCK + STREET) + STREET;
      // Two or three buildings per block, with a plaza gap between them.
      const n = 2 + Math.floor(rng() * 2);
      for (let i = 0; i < n; i++) {
        const w = randRange(rng, 90, 150);
        const h = randRange(rng, 90, 150);
        const x = bx + (i % 2) * (BLOCK - w - 8) + randRange(rng, 0, 14);
        const y = by + Math.floor(i / 2) * (BLOCK - h - 8) + randRange(rng, 0, 14);
        const color = pick(rng, BUILDING_COLORS);
        const neon = pick(rng, NEON);
        const floors = 3 + Math.floor(rng() * 9);
        buildings.push({ x, y, w, h, color, neon, floors, roof: pick(rng, ['#1a1a2e', '#232338', '#1e2a24']) });
        if (rng() < 0.55) signs.push({ x: x + w / 2, y: y - 6, text: pick(rng, ['NEON', 'BAR', '24H', 'HOTEL', 'PIER', 'CLUB', 'CAFE', 'MART', 'GYM', 'INK']), color: neon });
      }
    }
  }
  // Landmarks: hospital (heals), spray shop (clears wanted), harbor pier, garage.
  const landmarks = {
    hospital: { x: 480, y: 480, w: 170, h: 130, label: 'ST. MARIA HOSPITAL', color: '#e8f4ff' },
    spray: { x: 2620, y: 480, w: 170, h: 130, label: 'SPRAY SHOP', color: '#ffe600' },
    pier: { x: 1450, y: 2180, w: 300, h: 90, label: 'HARBOR PIER', color: '#00e5ff' },
    garage: { x: 480, y: 1900, w: 170, h: 130, label: 'RAY’S GARAGE', color: '#ff6a00' },
    club: { x: 1450, y: 480, w: 170, h: 130, label: 'CLUB VOLT', color: '#ff2d78' },
  };
  // Keep landmark footprints clear of generated buildings.
  for (const lm of Object.values(landmarks)) {
    for (let i = buildings.length - 1; i >= 0; i--) {
      const b = buildings[i];
      if (b.x < lm.x + lm.w + 20 && b.x + b.w > lm.x - 20 && b.y < lm.y + lm.h + 20 && b.y + b.h > lm.y - 20) buildings.splice(i, 1);
    }
  }
  return { buildings, signs, landmarks, cols, rows };
}

export function isStreet(x, y) {
  if (x < 0 || y < 0 || x > WORLD.w || y > WORLD.h) return false;
  const mx = x % (BLOCK + STREET);
  const my = y % (BLOCK + STREET);
  return mx < STREET || my < STREET;
}

export function onRoad(x, y) { return isStreet(x, y); }

// Circle-vs-building collision: pushes the circle out and reports the hit.
export function collideBuildings(city, ent, r) {
  let hit = false;
  for (const b of city.buildings) {
    const cx = clamp(ent.x, b.x, b.x + b.w);
    const cy = clamp(ent.y, b.y, b.y + b.h);
    const dx = ent.x - cx; const dy = ent.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      const d = Math.sqrt(d2) || 0.001;
      ent.x = cx + (dx / d) * r;
      ent.y = cy + (dy / d) * r;
    }
  }
  for (const lm of Object.values(city.landmarks)) {
    if (lm === city.landmarks.pier) continue;
    const cx = clamp(ent.x, lm.x, lm.x + lm.w);
    const cy = clamp(ent.y, lm.y, lm.y + lm.h);
    const dx = ent.x - cx; const dy = ent.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      hit = true;
      const d = Math.sqrt(d2) || 0.001;
      ent.x = cx + (dx / d) * r;
      ent.y = cy + (dy / d) * r;
    }
  }
  return hit;
}

export function pointInRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

// Nearest point on the road grid to (x,y): used to keep traffic on streets.
export function nearestRoadPoint(x, y) {
  const cell = BLOCK + STREET;
  const cx = Math.floor(x / cell) * cell;
  const cy = Math.floor(y / cell) * cell;
  const rx = clamp(x, cx, cx + STREET);
  const ry = clamp(y, cy, cy + STREET);
  // Snap to the nearer street axis.
  if (Math.abs(x - rx) < Math.abs(y - ry)) return { x: rx, y };
  return { x, y: ry };
}
