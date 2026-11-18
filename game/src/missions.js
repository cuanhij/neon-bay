// Neon Bay missions: five story jobs with waypoints, intro dialogue,
// timers, rewards and fail states, plus the story-complete screen.
// The mission state lives on G.mission; this module advances it each step.
import { LANDMARKS, MISSIONS } from './config.js';
import { addWanted, dist, setBanner, setMessage, spawnPickup } from './entities.js';

function startMission(G, audio) {
  const def = MISSIONS[G.missionIndex];
  if (!def) return;
  G.mission = {
    def, stage: 'active', timer: def.timeLimit, started: true,
    enemiesSpawned: false, bagTaken: false, completeShown: false,
  };
  G.dialogue = { title: def.title, text: def.brief, hint: def.hint };
  G.dialogueTimer = 7;
  setBanner(G, `MISSION: ${def.title.toUpperCase()}`);
  if (def.id === 'getaway') addWanted(G, 2);
  if (def.id === 'turf-war') {
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      G.enemies.push({
        x: LANDMARKS.club.x + Math.cos(a) * 150, y: LANDMARKS.club.y + Math.sin(a) * 150,
        angle: 0, health: 100, shootTimer: 1 + i * 0.4, deathTimer: 0,
      });
    }
    G.mission.enemiesSpawned = true;
    addWanted(G, 1);
  }
  if (def.id === 'harbor-heist') {
    spawnPickup(G, 'cash', LANDMARKS.pier.x, LANDMARKS.pier.y - 40);
    addWanted(G, 1);
  }
  if (audio) audio.mission();
}

function completeMission(G, audio) {
  const def = G.mission.def;
  G.player.cash += def.reward;
  G.mission.stage = 'complete';
  G.mission.completeShown = true;
  G.banner = `MISSION COMPLETE — ${def.title.toUpperCase()}  +$${def.reward}`;
  G.bannerTimer = 4;
  G.missionIndex += 1;
  G.mission = null;
  if (audio) audio.mission();
  if (G.missionIndex >= MISSIONS.length) {
    G.storyDone = true;
    setMessage(G, 'Story complete! Neon Bay is yours.');
  } else {
    const next = MISSIONS[G.missionIndex];
    setMessage(G, `Next job: ${next.title} — head to the yellow waypoint.`);
  }
}

function failMission(G, reason, audio) {
  G.mission.stage = 'failed';
  G.banner = `MISSION FAILED — ${reason}`;
  G.bannerTimer = 4;
  G.mission = null;
  if (audio) audio.fail();
  setMessage(G, 'Job failed. Drive back to the waypoint to try again.');
}

export function missionWaypoint(G) {
  if (G.missionIndex >= MISSIONS.length) return null;
  const def = MISSIONS[G.missionIndex];
  // During the heist escape the waypoint moves home to the garage.
  if (def.id === 'harbor-heist' && G.mission && G.mission.bagTaken) return LANDMARKS.garage;
  return def.target;
}

export function updateMissions(G, dt, audio) {
  if (G.missionIndex >= MISSIONS.length || G.storyDone) return;
  const def = MISSIONS[G.missionIndex];
  const px = G.player.x;
  const py = G.player.y;
  const wp = missionWaypoint(G);

  // Not started yet: arrive at the waypoint to get the briefing.
  if (!G.mission) {
    if (wp && dist(px, py, wp.x, wp.y) < 150) {
      startMission(G, audio);
    }
    return;
  }
  const m = G.mission;
  if (m.stage !== 'active') return;

  if (m.timer > 0) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(G, 'Out of time', audio);
      return;
    }
  }

  if (def.id === 'first-wheels') {
    // Complete when the player is sitting in the pink sports car.
    const car = G.player.inCar;
    if (car && car.type === 'sports' && dist(car.x, car.y, LANDMARKS.garage.x, LANDMARKS.garage.y) < 320) {
      completeMission(G, audio);
    }
    return;
  }
  if (def.id === 'turf-war') {
    const alive = G.enemies.filter((e) => e.health > 0).length;
    if (m.enemiesSpawned && alive === 0) completeMission(G, audio);
    return;
  }
  if (def.id === 'harbor-heist') {
    if (!m.bagTaken) {
      // The cash pickup at the pier is the bag; taking it flips the stage.
      if (dist(px, py, LANDMARKS.pier.x, LANDMARKS.pier.y - 40) < 60) {
        m.bagTaken = true;
        G.player.cash += 0;
        addWanted(G, 3);
        setBanner(G, 'BAG GRABBED — LOSE THE COPS, GET TO THE GARAGE');
        setMessage(G, 'Bag grabbed! Wanted level 4 — escape to Sunset Garage.');
        if (audio) audio.cash();
      }
      return;
    }
    if (dist(px, py, LANDMARKS.garage.x, LANDMARKS.garage.y) < 170) completeMission(G, audio);
    return;
  }
  // Getaway and hot delivery: reach the waypoint in time.
  if (wp && dist(px, py, wp.x, wp.y) < 150) completeMission(G, audio);
}

export function currentObjective(G) {
  if (G.storyDone) return 'Story complete — Neon Bay is yours.';
  if (G.missionIndex >= MISSIONS.length) return 'Story complete.';
  const def = MISSIONS[G.missionIndex];
  if (!G.mission) return `Go to ${def.title}: ${def.target.label}`;
  if (def.id === 'harbor-heist' && G.mission.bagTaken) return 'Escape to Sunset Garage!';
  if (def.id === 'turf-war') {
    const alive = G.enemies.filter((e) => e.health > 0).length;
    return `Turf War: ${alive} Vipers left at Club Neon`;
  }
  return `${def.title}: ${def.hint}`;
}
