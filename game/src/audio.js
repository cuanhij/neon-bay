// Synthesized sound for Neon Bay: every effect is built with Web Audio oscillators
// and noise buffers, so the game ships zero audio files and makes zero requests.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let musicTimer = null;
  let engineOsc = null;
  let engineGain = null;
  let musicStep = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch { return false; }
  }

  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function tone(freq, dur, type, vol, slideTo, delay = 0) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, filterFreq, delay = 0) {
    if (!ensure() || muted) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
  }

  // A moody two-bar synth loop: low bass pulse with a sparse neon lead.
  const bassLine = [55, 0, 55, 0, 65.4, 0, 49, 0, 55, 0, 55, 0, 82.4, 0, 73.4, 0];
  const leadLine = [220, 0, 261.6, 0, 0, 329.6, 0, 0, 293.7, 0, 0, 261.6, 0, 0, 246.9, 0];
  function startMusic() {
    if (!ensure() || musicTimer) return;
    musicTimer = setInterval(() => {
      if (muted || !ctx) return;
      const b = bassLine[musicStep % bassLine.length];
      const l = leadLine[musicStep % leadLine.length];
      if (b) tone(b, 0.22, 'triangle', 0.16);
      if (l) tone(l, 0.3, 'sawtooth', 0.05);
      if (musicStep % 4 === 0) noise(0.05, 0.05, 4000);
      musicStep++;
    }, 170);
  }

  function startEngine() {
    if (!ensure() || engineOsc) return;
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 320;
    engineOsc.connect(f); f.connect(engineGain); engineGain.connect(master);
    engineOsc.start();
  }

  function setEngine(speed01, on) {
    if (!engineOsc || !engineGain || !ctx) return;
    const target = on && !muted ? 0.02 + speed01 * 0.06 : 0;
    engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
    engineOsc.frequency.setTargetAtTime(50 + speed01 * 130, ctx.currentTime, 0.1);
  }

  return {
    unlock, startMusic, startEngine, setEngine,
    shoot() { noise(0.12, 0.35, 2600); tone(180, 0.1, 'square', 0.2, 60); },
    enemyShoot() { noise(0.1, 0.18, 1800); },
    hit() { tone(120, 0.15, 'sawtooth', 0.25, 50); },
    pickup() { tone(660, 0.09, 'sine', 0.25); tone(990, 0.14, 'sine', 0.25, null, 0.08); },
    cash() { tone(880, 0.08, 'sine', 0.22); tone(1174, 0.1, 'sine', 0.22, null, 0.07); tone(1568, 0.16, 'sine', 0.22, null, 0.14); },
    explosion() { noise(0.7, 0.5, 500); tone(70, 0.6, 'sine', 0.4, 30); },
    siren() { tone(700, 0.35, 'sine', 0.07, 950); tone(950, 0.35, 'sine', 0.07, 700, 0.35); },
    skid() { noise(0.18, 0.1, 900); },
    door() { tone(220, 0.08, 'square', 0.12, 140); },
    mission() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.2, null, i * 0.1)); },
    fail() { [392, 330, 262].forEach((f, i) => tone(f, 0.25, 'sawtooth', 0.15, null, i * 0.15)); },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    get muted() { return muted; },
  };
}
