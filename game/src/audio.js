// Neon Bay audio: everything synthesized with Web Audio, no audio files.
// Engine hum follows speed, sirens wail while wanted, gunshots are noise
// bursts, pickups blip, and a slow bass-and-hat loop keeps the dusk mood.
export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let muted = false;
  let musicTimer = 0;
  let musicStep = 0;
  const BASS = [55, 0, 65.41, 0, 49, 0, 58.27, 0, 55, 0, 65.41, 0, 73.42, 0, 58.27, 49];

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 50;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 420;
      engineOsc.connect(lp); lp.connect(engineGain); engineGain.connect(master);
      engineOsc.start();
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'sine';
      sirenOsc.frequency.value = 700;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain); sirenGain.connect(master);
      sirenOsc.start();
    } catch { return false; }
    return true;
  }

  function blip(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    try {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, ctx.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.2, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      o.connect(g); g.connect(master);
      o.start(); o.stop(ctx.currentTime + dur);
    } catch { /* audio is best-effort */ }
  }

  function noise(dur, vol, freq) {
    if (!ensure() || muted) return;
    try {
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = freq || 1800;
      const g = ctx.createGain();
      g.gain.value = vol || 0.35;
      src.connect(f); f.connect(g); g.connect(master);
      src.start();
    } catch { /* audio is best-effort */ }
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.5; return muted; },
    get muted() { return muted; },
    shoot() { noise(0.12, 0.4, 2400); blip(180, 0.08, 'square', 0.15, 60); },
    enemyShoot() { noise(0.1, 0.22, 1600); },
    pickup() { blip(660, 0.09, 'sine', 0.22); setTimeout(() => blip(990, 0.12, 'sine', 0.22), 80); },
    cash() { blip(880, 0.08, 'sine', 0.2); setTimeout(() => blip(1174, 0.14, 'sine', 0.2), 70); },
    crash() { noise(0.25, 0.4, 700); },
    mission() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'triangle', 0.22), i * 110)); },
    fail() { [330, 262, 196].forEach((f, i) => setTimeout(() => blip(f, 0.2, 'triangle', 0.2), i * 140)); },
    update(dt, speedRatio, wanted, driving) {
      if (!ctx) return;
      musicTimer -= dt;
      if (musicTimer <= 0) {
        musicTimer = 0.24;
        const bass = BASS[musicStep % BASS.length];
        if (bass) blip(bass, 0.22, 'triangle', 0.16);
        if (musicStep % 2 === 0) noise(0.03, 0.05, 6000);
        musicStep += 1;
      }
      if (engineGain) engineGain.gain.value = driving ? 0.03 + speedRatio * 0.06 : 0.012;
      if (engineOsc) engineOsc.frequency.value = 46 + speedRatio * 130;
      if (sirenGain && sirenOsc) {
        sirenGain.gain.value = wanted >= 1 ? 0.035 : 0;
        sirenOsc.frequency.value = 650 + Math.sin(performance.now() / 380) * 220;
      }
    },
  };
}
