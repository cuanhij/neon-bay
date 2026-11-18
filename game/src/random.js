// Seeded randomness for Neon Bay: mulberry32, plus the small helpers the
// city generator and the spawners use so one seed always builds one city.
export function createRandom(seed) {
  let a = seed | 0;
  function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  random.range = (min, max) => min + random() * (max - min);
  random.pick = (list) => list[Math.floor(random() * list.length)];
  random.int = (min, max) => Math.floor(random() * (max - min + 1)) + min;
  return random;
}
