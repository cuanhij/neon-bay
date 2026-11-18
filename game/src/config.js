// Neon Bay — tuning, colours, car types and mission definitions.
// Everything here is original to this game: the city, names and numbers below
// were picked for this build and nothing is copied from any other game.
export const WORLD = { width: 3200, height: 2400 };
export const ROAD_SPACING = 400;
export const ROAD_WIDTH = 96;
export const HARBOR_Y = 2180;
export const STEP = 1 / 60;
export const SAVE_KEY = 'neon-bay-save-v1';

export const CAR_TYPES = {
  sedan:   { name: 'Sedan',    accel: 270, top: 430, reverse: 170, steer: 2.7, grip: 3.2, color: '#d94f3d', len: 52, wid: 26 },
  taxi:    { name: 'Taxi',     accel: 250, top: 410, reverse: 160, steer: 2.8, grip: 3.2, color: '#f2c230', len: 52, wid: 26 },
  truck:   { name: 'Truck',    accel: 165, top: 310, reverse: 130, steer: 1.9, grip: 2.6, color: '#3f8fd2', len: 68, wid: 30 },
  sports:  { name: 'Sports',   accel: 390, top: 580, reverse: 190, steer: 3.2, grip: 3.8, color: '#ff2e88', len: 54, wid: 26 },
  police:  { name: 'Interceptor', accel: 350, top: 540, reverse: 180, steer: 3.1, grip: 3.6, color: '#1d2733', len: 54, wid: 26 },
};

export const LANDMARKS = {
  garage:   { x: 600,  y: 600,  label: 'SUNSET GARAGE',  color: '#ffb020' },
  hospital: { x: 2600, y: 500,  label: 'BAY GENERAL',    color: '#7ee0a3' },
  spray:    { x: 500,  y: 1900, label: 'SPRAY & GO',     color: '#ff7ad9' },
  pier:     { x: 1600, y: 2260, label: 'HARBOUR PIER',   color: '#57c8ff' },
  club:     { x: 2400, y: 1800, label: 'CLUB NEON',      color: '#b678ff' },
};

export const MISSIONS = [
  {
    id: 'first-wheels', title: 'First Wheels', reward: 150, timeLimit: 0,
    brief: 'RICO: "New in Neon Bay? Prove you can drive. Get to Sunset Garage — a pink sports car is waiting with your name on it. Get in and it\'s yours."',
    hint: 'Follow the yellow waypoint to Sunset Garage, then press E by the pink sports car.',
    target: LANDMARKS.garage,
  },
  {
    id: 'getaway', title: 'The Getaway', reward: 300, timeLimit: 120,
    brief: 'RICO: "The crew hit a courier van. Cops are all over us. Lose them and get to the Club Neon car park — don\'t stop for anything."',
    hint: 'Reach Club Neon while the heat is on. Outrun the interceptors.',
    target: LANDMARKS.club,
  },
  {
    id: 'hot-delivery', title: 'Hot Delivery', reward: 350, timeLimit: 90,
    brief: 'MARA: "A package has to be on the Harbour Pier in 90 seconds. No excuses, no detours. Drive like the bay is on fire."',
    hint: 'Reach the Harbour Pier before the timer hits zero.',
    target: LANDMARKS.pier,
  },
  {
    id: 'turf-war', title: 'Turf War', reward: 500, timeLimit: 0,
    brief: 'RICO: "The Vipers moved into Club Neon turf. Five of them, armed. Clear them out and the block is ours again."',
    hint: 'Defeat all 5 Viper gang members outside Club Neon.',
    target: LANDMARKS.club,
  },
  {
    id: 'harbor-heist', title: 'The Harbour Heist', reward: 1000, timeLimit: 180,
    brief: 'MARA: "One last job. A cash boat docks at the pier at dusk. Grab the bag, then lose the whole Bay PD and bring it home to the garage."',
    hint: 'Grab the cash at the pier, then escape to Sunset Garage.',
    target: LANDMARKS.pier,
  },
];

export const PALETTE = {
  grass: '#17251d', road: '#23262e', roadLine: '#c8b45a', sidewalk: '#3a3f4a',
  building: '#2b2f3d', buildingTop: '#39405a', water: '#0a2e4a', waterDeep: '#06203a',
  sand: '#8a7a52', neonPink: '#ff2e88', neonCyan: '#29e6ff', neonYellow: '#ffd23f',
  hudBg: 'rgba(8,10,18,0.72)', hudText: '#f2f4f8', hudDim: '#9aa3b5',
};

export const PLAYER_START = { x: 620, y: 760 };
export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
