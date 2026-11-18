// Neon Bay rendering: the camera, the city, cars, people, effects, HUD,
// minimap and every menu screen. Drawing only — it never changes state.
import { CAR_TYPES, FONT, HARBOR_Y, LANDMARKS, PALETTE, ROAD_SPACING, ROAD_WIDTH, WORLD } from './config.js';
import { currentObjective, missionWaypoint } from './missions.js';
import { dist } from './entities.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_STORY = 'story';

const VIEW_W = 1280;
const VIEW_H = 720;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const fonts = new Map();
  function font(size, bold) {
    const key = `${size}:${bold ? 1 : 0}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    return fonts.get(key);
  }
  function text(value, x, y, size, color, align, bold) {
    ctx.font = font(size, bold);
    ctx.fillStyle = color;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }
  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
  }
  resize();
  window.addEventListener('resize', resize);

  function drawGround(G) {
    const cam = G.camera;
    const vx = cam.x - VIEW_W / 2;
    const vy = cam.y - VIEW_H / 2;
    // Grass base.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(vx, vy, VIEW_W, VIEW_H);
    // Harbour water along the south edge.
    ctx.fillStyle = PALETTE.waterDeep;
    ctx.fillRect(vx, HARBOR_Y, VIEW_W, WORLD.height - HARBOR_Y);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(vx, HARBOR_Y + 30, VIEW_W, WORLD.height - HARBOR_Y - 30);
    ctx.strokeStyle = 'rgba(120,200,255,0.25)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i += 1) {
      const wy = HARBOR_Y + 60 + i * 22;
      const off = (G.elapsed * 12 + i * 137) % 200;
      ctx.beginPath();
      ctx.moveTo(vx + off, wy);
      ctx.lineTo(vx + off + 60, wy);
      ctx.stroke();
    }
    // Sand strip at the waterline and the pier walkway.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(vx, HARBOR_Y - 6, VIEW_W, 14);
    ctx.fillStyle = '#6b5a3e';
    ctx.fillRect(1440, HARBOR_Y - 10, 320, 170);
    // Roads.
    ctx.fillStyle = PALETTE.road;
    for (let gx = 0; gx <= WORLD.width; gx += ROAD_SPACING) ctx.fillRect(gx, 0, ROAD_WIDTH, HARBOR_Y);
    for (let gy = 0; gy <= HARBOR_Y; gy += ROAD_SPACING) ctx.fillRect(0, gy, WORLD.width, ROAD_WIDTH);
    // Sidewalks.
    ctx.fillStyle = PALETTE.sidewalk;
    for (let gx = 0; gx <= WORLD.width; gx += ROAD_SPACING) {
      ctx.fillRect(gx - 8, 0, 8, HARBOR_Y);
      ctx.fillRect(gx + ROAD_WIDTH, 0, 8, HARBOR_Y);
    }
    for (let gy = 0; gy <= HARBOR_Y; gy += ROAD_SPACING) {
      ctx.fillRect(0, gy - 8, WORLD.width, 8);
      ctx.fillRect(0, gy + ROAD_WIDTH, WORLD.width, 8);
    }
    // Centre dashes.
    ctx.fillStyle = PALETTE.roadLine;
    for (let gx = 0; gx <= WORLD.width; gx += ROAD_SPACING) {
      for (let y = 0; y < HARBOR_Y; y += 56) ctx.fillRect(gx + ROAD_WIDTH / 2 - 2, y + 8, 4, 28);
    }
    for (let gy = 0; gy <= HARBOR_Y; gy += ROAD_SPACING) {
      for (let x = 0; x < WORLD.width; x += 56) ctx.fillRect(x + 8, gy + ROAD_WIDTH / 2 - 2, 28, 4);
    }
    // Buildings with lit windows.
    for (const b of G.city.buildings) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      ctx.fillStyle = b.hue;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = PALETTE.buildingTop;
      ctx.fillRect(b.x, b.y, b.w, 10);
      for (const w of b.windows) {
        ctx.fillStyle = w.lit ? (w.warm ? '#ffd98a' : '#9fd8ff') : 'rgba(0,0,0,0.4)';
        ctx.fillRect(w.x, w.y, 12, 14);
      }
    }
    // Neon signs, gently pulsing.
    const pulse = 0.75 + Math.sin(G.elapsed * 3) * 0.25;
    for (const s of G.city.signs) {
      ctx.globalAlpha = pulse;
      ctx.font = font(15, true);
      ctx.fillStyle = s.color;
      ctx.textAlign = 'center';
      ctx.fillText(s.text, s.x, s.y);
      ctx.globalAlpha = 1;
    }
    // Landmark pads and labels.
    for (const pad of G.city.landmarkPads) {
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(pad.x - pad.w / 2, pad.y - pad.h / 2, pad.w, pad.h);
      ctx.strokeStyle = pad.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(pad.x - pad.w / 2, pad.y - pad.h / 2, pad.w, pad.h);
      ctx.font = font(15, true);
      ctx.fillStyle = pad.color;
      ctx.textAlign = 'center';
      ctx.fillText(pad.label, pad.x, pad.y - pad.h / 2 - 10);
    }
  }

  function drawCar(car) {
    const t = CAR_TYPES[car.type];
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(-t.len / 2 + 3, -t.wid / 2 + 4, t.len, t.wid);
    ctx.fillStyle = car.color;
    ctx.beginPath();
    ctx.roundRect(-t.len / 2, -t.wid / 2, t.len, t.wid, 7);
    ctx.fill();
    // Cabin and windscreen.
    ctx.fillStyle = 'rgba(10,16,28,0.85)';
    ctx.beginPath();
    ctx.roundRect(-t.len / 6, -t.wid / 2 + 4, t.len / 3, t.wid - 8, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(160,210,255,0.5)';
    ctx.fillRect(t.len / 6, -t.wid / 2 + 5, 4, t.wid - 10);
    // Headlights and taillights.
    ctx.fillStyle = '#fff8c8';
    ctx.fillRect(t.len / 2 - 3, -t.wid / 2 + 2, 3, 6);
    ctx.fillRect(t.len / 2 - 3, t.wid / 2 - 8, 3, 6);
    ctx.fillStyle = '#ff3b30';
    ctx.fillRect(-t.len / 2, -t.wid / 2 + 2, 3, 6);
    ctx.fillRect(-t.len / 2, t.wid / 2 - 8, 3, 6);
    if (car.type === 'taxi') {
      ctx.fillStyle = '#111';
      ctx.font = font(10, true);
      ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 4);
    }
    if (car.police) {
      const flash = Math.floor(G.elapsed * 6) % 2 === 0;
      ctx.fillStyle = flash ? '#ff2e2e' : '#2e7bff';
      ctx.fillRect(-6, -t.wid / 2 - 2, 6, 5);
      ctx.fillStyle = flash ? '#2e7bff' : '#ff2e2e';
      ctx.fillRect(0, -t.wid / 2 - 2, 6, 5);
      ctx.fillStyle = '#fff';
      ctx.font = font(9, true);
      ctx.textAlign = 'center';
      ctx.fillText('BAY PD', 0, 4);
    }
    ctx.restore();
    if (car.brakeLight) {
      ctx.fillStyle = 'rgba(255,60,40,0.25)';
      ctx.beginPath();
      ctx.arc(car.x - Math.cos(car.angle) * 30, car.y - Math.sin(car.angle) * 30, 16, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawPerson(x, y, angle, color, isPlayer, walkPhase) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(2, 3, 11, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f2c9a0';
    ctx.beginPath(); ctx.arc(5, 0, 5, 0, Math.PI * 2); ctx.fill();
    if (isPlayer) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawWorld(G) {
    const cam = G.camera;
    const shakeX = G.shake > 0 ? (Math.random() - 0.5) * G.shake : 0;
    const shakeY = G.shake > 0 ? (Math.random() - 0.5) * G.shake : 0;
    const scale = Math.min(canvas.width / VIEW_W, canvas.height / VIEW_H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const ox = (canvas.width - VIEW_W * scale) / 2;
    const oy = (canvas.height - VIEW_H * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, ox - (cam.x - VIEW_W / 2 + shakeX) * scale, oy - (cam.y - VIEW_H / 2 + shakeY) * scale);
    drawGround(G);
    // Skid marks.
    ctx.strokeStyle = 'rgba(10,10,12,0.55)';
    ctx.lineWidth = 4;
    for (const s of G.skids) {
      ctx.globalAlpha = Math.min(1, s.life / 3);
      ctx.beginPath();
      ctx.moveTo(s.x - Math.cos(s.angle) * 10, s.y - Math.sin(s.angle) * 10);
      ctx.lineTo(s.x + Math.cos(s.angle) * 10, s.y + Math.sin(s.angle) * 10);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // Pickups.
    for (const pk of G.pickups) {
      const bob = Math.sin(pk.bob * 3) * 3;
      ctx.save();
      ctx.translate(pk.x, pk.y + bob);
      if (pk.kind === 'health') { ctx.fillStyle = '#fff'; ctx.fillRect(-9, -9, 18, 18); ctx.fillStyle = '#e5534b'; ctx.fillRect(-2, -7, 4, 14); ctx.fillRect(-7, -2, 14, 4); }
      else if (pk.kind === 'ammo') { ctx.fillStyle = '#ffd23f'; ctx.fillRect(-8, -5, 16, 10); ctx.fillStyle = '#111'; ctx.fillRect(-4, -5, 3, 10); ctx.fillRect(2, -5, 3, 10); }
      else { ctx.fillStyle = '#7ee0a3'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#123'; ctx.font = font(12, true); ctx.textAlign = 'center'; ctx.fillText('$', 0, 4); }
      ctx.restore();
    }
    // Waypoint beacon.
    const wp = missionWaypoint(G);
    if (wp && !G.storyDone) {
      const pulse = 1 + Math.sin(G.elapsed * 4) * 0.15;
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(wp.x, wp.y, 34 * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath();
      ctx.moveTo(wp.x, wp.y - 52 - Math.sin(G.elapsed * 4) * 6);
      ctx.lineTo(wp.x - 10, wp.y - 30);
      ctx.lineTo(wp.x + 10, wp.y - 30);
      ctx.closePath(); ctx.fill();
    }
    for (const car of G.cars) drawCar(car);
    for (const ped of G.peds) {
      if (ped.dead) continue;
      drawPerson(ped.x, ped.y, ped.angle, ped.color, false, ped.walkPhase);
    }
    for (const cop of G.footCops) drawPerson(cop.x, cop.y, cop.angle, '#2e5fa3', false, 0);
    for (const e of G.enemies) {
      if (e.health <= 0) continue;
      drawPerson(e.x, e.y, e.angle, '#8a2f3d', false, 0);
      ctx.fillStyle = '#e5534b';
      ctx.fillRect(e.x - 14, e.y - 24, 28, 5);
      ctx.fillStyle = '#7ee0a3';
      ctx.fillRect(e.x - 14, e.y - 24, 28 * (e.health / 100), 5);
    }
    // Player.
    const p = G.player;
    if (!p.inCar) {
      if (p.invuln <= 0 || Math.floor(p.invuln * 12) % 2 === 0) drawPerson(p.x, p.y, p.angle, '#29e6ff', true, 0);
      // Aim line.
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x + Math.cos(p.angle) * 16, p.y + Math.sin(p.angle) * 16);
      ctx.lineTo(p.x + Math.cos(p.angle) * 46, p.y + Math.sin(p.angle) * 46);
      ctx.stroke();
    }
    // Bullets.
    ctx.fillStyle = '#ffe27a';
    for (const b of G.bullets) {
      ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2); ctx.fill();
    }
    // Particles.
    for (const pt of G.particles) {
      ctx.globalAlpha = Math.max(0, pt.life / pt.max);
      ctx.fillStyle = pt.color;
      ctx.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
    // Dusk tint: the later the clock, the deeper the violet.
    const dusk = Math.max(0, Math.min(1, (G.clock / 3600 - 18.2) / 2.2));
    if (dusk > 0) {
      ctx.fillStyle = `rgba(64,32,120,${(dusk * 0.22).toFixed(3)})`;
      ctx.fillRect(cam.x - VIEW_W / 2, cam.y - VIEW_H / 2, VIEW_W, VIEW_H);
    }
    // Screen-space HUD and minimap.
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    drawHud(G, scale);
    drawMinimap(G);
  }

  function drawHud(G, scale) {
    const p = G.player;
    ctx.fillStyle = PALETTE.hudBg;
    ctx.fillRect(14, 12, 300, 96);
    ctx.fillStyle = '#e5534b';
    ctx.fillRect(26, 24, 180, 12);
    ctx.fillStyle = '#7ee0a3';
    ctx.fillRect(26, 24, 180 * Math.max(0, p.health / 100), 12);
    text(`HEALTH ${Math.round(p.health)}`, 212, 35, 15, PALETTE.hudText, 'left', true);
    text(`$${p.cash}`, 26, 62, 20, '#7ee0a3', 'left', true);
    text(`AMMO ${p.ammo}`, 130, 62, 16, PALETTE.hudText, 'left', true);
    // Wanted stars.
    for (let i = 0; i < 5; i += 1) {
      text(i < G.wanted ? '★' : '☆', 26 + i * 26, 92, 22, i < G.wanted ? '#ffd23f' : '#5a6274', 'left', true);
    }
    text(`WANTED ${G.wanted}`, 162, 92, 14, PALETTE.hudDim, 'left', true);
    // Speedometer.
    const speedKmh = p.inCar ? Math.round(Math.abs(p.inCar.speed) * 0.36) : Math.round(p.speed * 0.36);
    ctx.fillStyle = PALETTE.hudBg;
    ctx.fillRect(VIEW_W - 190, VIEW_H - 66, 176, 52);
    text(p.inCar ? p.inCar.name.toUpperCase() : 'ON FOOT', VIEW_W - 178, VIEW_H - 44, 13, PALETTE.hudDim, 'left', true);
    text(`${speedKmh} km/h`, VIEW_W - 178, VIEW_H - 22, 22, PALETTE.hudText, 'left', true);
    // Clock + objective.
    const hrs = Math.floor(G.clock / 3600);
    const mins = Math.floor((G.clock % 3600) / 60);
    text(`${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`, VIEW_W / 2, 34, 20, PALETTE.hudText, 'center', true);
    ctx.fillStyle = PALETTE.hudBg;
    const obj = currentObjective(G);
    ctx.fillRect(14, VIEW_H - 52, Math.min(620, 24 + obj.length * 8.4), 38);
    text(`▸ ${obj}`, 26, VIEW_H - 26, 16, '#ffd23f', 'left', true);
    // Mission timer.
    if (G.mission && G.mission.timer > 0) {
      const t = Math.ceil(G.mission.timer);
      ctx.fillStyle = t < 20 ? '#e5534b' : PALETTE.hudText;
      ctx.font = font(26, true);
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, VIEW_W / 2, 66);
    }
    if (G.messageTimer > 0) {
      ctx.fillStyle = PALETTE.hudBg;
      ctx.fillRect(VIEW_W / 2 - 300, VIEW_H - 104, 600, 30);
      text(G.message, VIEW_W / 2, VIEW_H - 82, 15, PALETTE.hudText, 'center');
    }
    if (G.bannerTimer > 0 && G.banner) {
      ctx.font = font(30, true);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      const w = ctx.measureText(G.banner).width + 40;
      ctx.fillRect(VIEW_W / 2 - w / 2, 84, w, 48);
      ctx.fillStyle = '#ffd23f';
      ctx.fillText(G.banner, VIEW_W / 2, 118);
    }
    if (G.dialogue && G.dialogueTimer > 0) {
      const d = G.dialogue;
      ctx.fillStyle = 'rgba(8,10,18,0.85)';
      ctx.fillRect(140, VIEW_H - 210, VIEW_W - 280, 92);
      ctx.strokeStyle = '#ff2e88';
      ctx.lineWidth = 2;
      ctx.strokeRect(140, VIEW_H - 210, VIEW_W - 280, 92);
      text(d.title.toUpperCase(), 160, VIEW_H - 178, 17, '#ff2e88', 'left', true);
      wrapText(d.text, 160, VIEW_H - 152, VIEW_W - 320, 16, PALETTE.hudText);
      text(d.hint, 160, VIEW_H - 130, 13, PALETTE.hudDim, 'left');
    }
    // Controls hint.
    text('WASD move/drive · Mouse aim · Click shoot · E enter car · Shift run · Space handbrake · Esc pause · M mute', VIEW_W / 2, VIEW_H - 8, 12, 'rgba(230,235,245,0.55)', 'center');
  }

  function wrapText(value, x, y, maxWidth, size, color) {
    ctx.font = font(size);
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    const words = value.split(' ');
    let line = '';
    let ly = y;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, ly);
        line = w;
        ly += size + 4;
      } else line = test;
    }
    if (line) ctx.fillText(line, x, ly);
  }

  function drawMinimap(G) {
    const mw = 196;
    const mh = 148;
    const mx = VIEW_W - mw - 14;
    const my = 12;
    const sx = mw / WORLD.width;
    const sy = mh / WORLD.height;
    ctx.fillStyle = 'rgba(8,10,18,0.8)';
    ctx.fillRect(mx, my, mw, mh);
    ctx.strokeStyle = '#ff2e88';
    ctx.lineWidth = 2;
    ctx.strokeRect(mx, my, mw, mh);
    ctx.fillStyle = '#2c3140';
    for (let gx = 0; gx <= WORLD.width; gx += ROAD_SPACING) ctx.fillRect(mx + gx * sx, my, 2, mh);
    for (let gy = 0; gy <= HARBOR_Y; gy += ROAD_SPACING) ctx.fillRect(mx, my + gy * sy, mw, 2);
    ctx.fillStyle = '#0a2e4a';
    ctx.fillRect(mx, my + HARBOR_Y * sy, mw, mh - HARBOR_Y * sy);
    ctx.fillStyle = '#ffd23f';
    for (const pad of G.city.landmarkPads) ctx.fillRect(mx + pad.x * sx - 2, my + pad.y * sy - 2, 4, 4);
    const wp = missionWaypoint(G);
    if (wp && !G.storyDone) {
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(mx + wp.x * sx, my + wp.y * sy, 5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ff2e88';
    for (const car of G.cars) {
      if (car.police) { ctx.fillStyle = '#2e7bff'; ctx.fillRect(mx + car.x * sx - 2, my + car.y * sy - 2, 4, 4); ctx.fillStyle = '#ff2e88'; }
      else if (car.traffic) ctx.fillRect(mx + car.x * sx - 1, my + car.y * sy - 1, 2, 2);
    }
    for (const e of G.enemies) {
      if (e.health <= 0) continue;
      ctx.fillStyle = '#e5534b';
      ctx.fillRect(mx + e.x * sx - 2, my + e.y * sy - 2, 4, 4);
    }
    const pl = G.player;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(mx + pl.x * sx, my + pl.y * sy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#29e6ff';
    ctx.beginPath(); ctx.arc(mx + pl.x * sx, my + pl.y * sy, 2.5, 0, Math.PI * 2); ctx.fill();
    text('N', mx + mw / 2, my + 16, 13, '#fff', 'center', true);
    text('NEON BAY', mx + 8, my + mh - 8, 11, PALETTE.hudDim, 'left', true);
  }

  function drawPanel(title, lines, prompt, accent) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const scale = Math.min(canvas.width / VIEW_W, canvas.height / VIEW_H);
    const ox = (canvas.width - VIEW_W * scale) / 2;
    const oy = (canvas.height - VIEW_H * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    const w = 760;
    const h = 150 + lines.length * 30;
    const x = (VIEW_W - w) / 2;
    const y = (VIEW_H - h) / 2;
    ctx.fillStyle = 'rgba(8,10,18,0.88)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = accent || '#ff2e88';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    text(title, VIEW_W / 2, y + 72, 46, accent || '#ff2e88', 'center', true);
    lines.forEach((line, i) => text(line, VIEW_W / 2, y + 118 + i * 30, 19, PALETTE.hudText, 'center'));
    if (prompt) text(prompt, VIEW_W / 2, y + h - 28, 18, '#ffd23f', 'center', true);
  }

  function drawTitle(G, hasSave) {
    drawWorld(G);
    // Dim the world behind the title.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const scale = Math.min(canvas.width / VIEW_W, canvas.height / VIEW_H);
    const ox = (canvas.width - VIEW_W * scale) / 2;
    const oy = (canvas.height - VIEW_H * scale) / 2;
    ctx.setTransform(scale, 0, 0, scale, ox, oy);
    ctx.fillStyle = 'rgba(6,8,16,0.62)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    text('NEON BAY', VIEW_W / 2, 190, 92, '#ff2e88', 'center', true);
    text('N E O N   B A Y', VIEW_W / 2, 192, 92, 'rgba(41,230,255,0.5)', 'center', true);
    text('An open-world crime story — drive, steal, run the city.', VIEW_W / 2, 240, 22, PALETTE.hudText, 'center');
    text('Five missions. Five wanted stars. One harbour heist.', VIEW_W / 2, 272, 18, PALETTE.hudDim, 'center');
    const lines = hasSave
      ? ['Press ENTER — New Game', 'Press C — Continue your saved run', 'WASD drive · E steal a car · Mouse aim, click to shoot']
      : ['Press ENTER or click — New Game', 'WASD drive · E steal a car · Mouse aim, click to shoot', 'Missions pay cash. The spray shop clears wanted for $200.'];
    drawPanel(' ', lines, hasSave ? 'ENTER new game · C continue' : 'ENTER to start', '#29e6ff');
  }

  function draw(G, screen, hasSave, extra) {
    if (screen === SCREEN_TITLE) { drawTitle(G, hasSave); return; }
    drawWorld(G);
    if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The city waits for no one — except right now.', `Cash $${G.player.cash} · Health ${Math.round(G.player.health)} · Mission ${Math.min(G.missionIndex + 1, 5)} of 5`], 'Esc / P to resume · M mute');
    } else if (screen === SCREEN_OVER) {
      drawPanel('BUSTED / FLATLINED', [G.overReason || 'Your run in Neon Bay is over.', `You banked $${G.player.cash} and finished ${G.missionIndex} of 5 missions.`], 'Press ENTER to start over');
    } else if (screen === SCREEN_STORY) {
      drawPanel('STORY COMPLETE', ['The harbour heist is done. The bag is yours.', `Final cash: $${G.player.cash} · Cars stolen: ${G.stats.stolen} · Vipers down: ${G.stats.kills}`, 'Neon Bay is yours. Press ENTER to play again.'], '#7ee0a3');
    } else if (extra && extra.completeBanner) {
      drawPanel('MISSION COMPLETE', [extra.completeBanner, `Reward banked. Cash now $${G.player.cash}.`], 'Press ENTER to keep playing', '#7ee0a3');
    }
  }

  return { draw, drawWorld };
}
