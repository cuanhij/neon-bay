// Neon Bay city generation: a seeded grid of streets, blocks and buildings
// with lit windows and neon signs, a harbour along the south edge, and five
// named landmarks. Pure data — no drawing here — plus the collision and
// road helpers the simulation uses every step.
import { HARBOR_Y, LANDMARKS, ROAD_SPACING, ROAD_WIDTH, WORLD } from './config.js';

export function onRoad(x, y) {
  if (y >= HARBOR_Y) return false;
  const rx = ((x % ROAD_SPACING) + ROAD_SPACING) % ROAD_SPACING;
  const ry = ((y % ROAD_SPACING) + ROAD_SPACING) % ROAD_SPACING;
  return rx < ROAD_WIDTH || ry < ROAD_WIDTH;
}

export function nearestRoadPoint(x, y) {
  const gx = Math.round(x / ROAD_SPACING) * ROAD_SPACING + ROAD_WIDTH / 2;
  const gy = Math.round(y / ROAD_SPACING) * ROAD_SPACING + ROAD_WIDTH / 2;
  return Math.abs(x - gx) < Math.abs(y - gy) ? { x: gx, y } : { x, y: gy };
}

export function buildCity(random) {
  const buildings = [];
  const signs = [];
  const neonColors = ['#ff2e88', '#29e6ff', '#ffd23f', '#b678ff', '#7ee0a3'];
  const signWords = ['NEON', 'BAY', '24H', 'TACOS', 'HOTEL', 'BAR', 'PIER', 'CLUB', 'CASINO', 'GYM', 'PIZZA', 'MOTEL'];
  // City blocks: each grid cell between streets holds one building with a
  // margin for sidewalks, except the cells kept clear for landmarks.
  const clearCells = [
    { cx: 1, cy: 1 }, { cx: 6, cy: 1 }, { cx: 1, cy: 4 }, { cx: 6, cy: 4 },
  ];
  for (let cx = 0; cx < 8; cx += 1) {
    for (let cy = 0; cy < 6; cy += 1) {
      const bx = cx * ROAD_SPACING + ROAD_WIDTH;
      const by = cy * ROAD_SPACING + ROAD_WIDTH;
      const bw = ROAD_SPACING - ROAD_WIDTH;
      const bh = ROAD_SPACING - ROAD_WIDTH;
      if (by + bh > HARBOR_Y - 40) continue;
      if (clearCells.some((c) => c.cx === cx && c.cy === cy)) continue;
      const pad = 26 + random() * 30;
      const w = bw - pad * 2;
      const h = bh - pad * 2;
      const b = {
        x: bx + pad, y: by + pad, w, h,
        hue: random.pick(['#2b2f3d', '#33364a', '#2e3348', '#3a2f4a']),
        height: 1 + Math.floor(random() * 3),
        windows: [],
      };
      const cols = Math.max(2, Math.floor(w / 34));
      const rows = Math.max(2, Math.floor(h / 34));
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          if (random() < 0.55) {
            b.windows.push({
              x: b.x + 8 + c * ((w - 16) / cols),
              y: b.y + 8 + r * ((h - 16) / rows),
              lit: random() < 0.6,
              warm: random() < 0.7,
            });
          }
        }
      }
      buildings.push(b);
      if (random() < 0.7) {
        signs.push({
          x: b.x + w / 2, y: b.y - 6,
          text: random.pick(signWords),
          color: random.pick(neonColors),
        });
      }
    }
  }
  // Landmark pads: flat lots with a small building so each place reads on
  // the map and in the world.
  const landmarkPads = Object.entries(LANDMARKS).map(([key, lm]) => ({
    key, x: lm.x, y: lm.y, label: lm.label, color: lm.color,
    w: key === 'pier' ? 320 : 150, h: key === 'pier' ? 60 : 110,
  }));
  return { buildings, signs, landmarkPads, width: WORLD.width, height: WORLD.height };
}

function circleHitsRect(x, y, r, b) {
  const nx = Math.max(b.x, Math.min(x, b.x + b.w));
  const ny = Math.max(b.y, Math.min(y, b.y + b.h));
  const dx = x - nx;
  const dy = y - ny;
  return dx * dx + dy * dy < r * r;
}

// Push a circle out of every building it overlaps; returns true on a hit.
export function resolveBuildingCollisions(city, ent, radius) {
  let hit = false;
  for (const b of city.buildings) {
    if (ent.x < b.x - radius || ent.x > b.x + b.w + radius || ent.y < b.y - radius || ent.y > b.y + b.h + radius) continue;
    if (!circleHitsRect(ent.x, ent.y, radius, b)) continue;
    hit = true;
    const nx = Math.max(b.x, Math.min(ent.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(ent.y, b.y + b.h));
    let dx = ent.x - nx;
    let dy = ent.y - ny;
    if (dx === 0 && dy === 0) {
      // Centre inside the building: push out along the shallowest side.
      const left = ent.x - b.x;
      const right = b.x + b.w - ent.x;
      const top = ent.y - b.y;
      const bot = b.y + b.h - ent.y;
      const m = Math.min(left, right, top, bot);
      if (m === left) { ent.x = b.x - radius; }
      else if (m === right) { ent.x = b.x + b.w + radius; }
      else if (m === top) { ent.y = b.y - radius; }
      else { ent.y = b.y + b.h + radius; }
    } else {
      const len = Math.hypot(dx, dy) || 1;
      ent.x = nx + (dx / len) * radius;
      ent.y = ny + (dy / len) * radius;
    }
  }
  return hit;
}

export function inWater(x, y) {
  return y >= HARBOR_Y + 40 && !(x > 1440 && x < 1760 && y < 2330);
}

export function clampToWorld(ent, margin) {
  ent.x = Math.max(margin, Math.min(WORLD.width - margin, ent.x));
  ent.y = Math.max(margin, Math.min(WORLD.height - margin, ent.y));
}
