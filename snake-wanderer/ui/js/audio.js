// Звук целиком синтезируется: спокойная генеративная музыка, ветер, дождь и эффекты. Файлов нет.
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const DAY = [[48, 55, 64, 71], [45, 52, 60, 67], [41, 48, 57, 64], [43, 50, 59, 62]];
const NIGHT = [[45, 52, 60, 64], [41, 48, 57, 60], [38, 50, 57, 65], [40, 52, 59, 67]];

export class Sound {
  constructor() { this.ctx = null; this.on = true; this.chordT = 0; this.noteT = 2; this.pulseT = 0; this.ci = 0; this.chord = DAY[0]; this.beat = 0; }

  /** Вызывается по первому касанию: браузер не даёт звучать раньше. */
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain(); this.master.gain.value = this.on ? 0.9 : 0;
    const comp = c.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(c.destination);
    this.music = c.createGain(); this.music.gain.value = 0.5; this.music.connect(this.master);
    this.fxBus = c.createGain(); this.fxBus.gain.value = 0.8; this.fxBus.connect(this.master);
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const loop = (type, freq, q) => {
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(f); f.connect(g); g.connect(this.master); src.start();
      return { f, g };
    };
    this.wind = loop('bandpass', 420, 0.6);
    this.rain = loop('highpass', 2400, 0.3);
  }

  setOn(v) { this.on = v; if (this.ctx) this.master.gain.setTargetAtTime(v ? 0.9 : 0, this.ctx.currentTime, 0.05); }

  tone(freq, type, t0, a, hold, rel, gain, dest) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + a);
    g.gain.setValueAtTime(gain, t0 + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + hold + rel);
    o.connect(g); g.connect(dest || this.fxBus);
    o.start(t0); o.stop(t0 + a + hold + rel + 0.05);
    return o;
  }

  noise(t0, dur, gain, type, freq, q = 1, sweep = 0) {
    const c = this.ctx, src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t0); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t0 + dur);
    const g = c.createGain(); g.gain.setValueAtTime(gain, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(this.fxBus);
    src.start(t0, Math.random()); src.stop(t0 + dur + 0.02);
  }

  /** env: { day 0..1, rain 0..1, fog 0..1, tension 0..1, speed 0..1 } */
  update(dt, env) {
    const c = this.ctx;
    if (!c || c.state !== 'running') return;
    const t = c.currentTime, night = env.day < 0.35;
    this.wind.g.gain.setTargetAtTime(0.035 + env.speed * 0.03 + env.fog * 0.02, t, 0.5);
    this.wind.f.frequency.setTargetAtTime(380 + Math.sin(t * 0.21) * 140 + env.speed * 120, t, 0.8);
    this.rain.g.gain.setTargetAtTime(env.rain * 0.085, t, 0.6);
    this.music.gain.setTargetAtTime(night ? 0.36 : 0.5, t, 1);

    this.chordT -= dt;
    if (this.chordT <= 0) {
      this.chordT = 6.4;
      const set = night ? NIGHT : DAY;
      this.ci = (this.ci + 1) % set.length;
      this.chord = set[this.ci];
      for (const m of this.chord) {
        this.tone(hz(m), 'triangle', t, 2.2, 2.2, 3.4, 0.045, this.music);
        this.tone(hz(m) * 1.004, 'sine', t, 2.6, 2, 3.2, 0.04, this.music);
      }
    }
    this.noteT -= dt;
    if (this.noteT <= 0) {
      this.noteT = night ? 1.2 + Math.random() * 2.6 : 0.5 + Math.random() * 1.9;
      if (Math.random() < (env.rain > 0.5 ? 0.45 : 0.75)) {
        const m = this.chord[Math.floor(Math.random() * this.chord.length)] + (night ? 24 : 12) + (Math.random() < 0.25 ? 12 : 0);
        this.tone(hz(m), 'sine', t, 0.01, 0.02, night ? 2.2 : 1.3, 0.06, this.music);
        if (night) this.tone(hz(m) * 2.01, 'sine', t, 0.01, 0, 1.2, 0.018, this.music);
      }
    }
    // Напряжение: глухой пульс, когда идёт бой.
    if (env.tension > 0.05) {
      this.pulseT -= dt;
      if (this.pulseT <= 0) {
        this.pulseT = 0.5 - env.tension * 0.14;
        this.beat = (this.beat + 1) % 8;
        const root = hz(this.chord[0] - 12);
        this.tone(root, 'sine', t, 0.008, 0.03, 0.2, 0.2 * env.tension, this.music);
        if (this.beat % 2) this.noise(t, 0.05, 0.03 * env.tension, 'highpass', 5000);
        if (this.beat === 3 || this.beat === 7) this.tone(root * 1.5, 'triangle', t, 0.01, 0.05, 0.25, 0.05 * env.tension, this.music);
      }
    }
  }

  sfx(name) {
    const c = this.ctx;
    if (!c || !this.on || c.state !== 'running') return;
    const t = c.currentTime, T = (f, ty, dt, a, h, r, g) => this.tone(f, ty, t + dt, a, h, r, g);
    const glide = (o, to, dur) => o.frequency.exponentialRampToValueAtTime(to, t + dur);
    switch (name) {
      case 'berry': glide(T(520 + Math.random() * 120, 'sine', 0, 0.005, 0.02, 0.09, 0.12), 980, 0.08); break;
      case 'shard': T(1320, 'sine', 0, 0.004, 0.02, 0.3, 0.1); T(1980, 'sine', 0.05, 0.004, 0.02, 0.3, 0.07); break;
      case 'chest': [523, 659, 784, 1046].forEach((f, i) => T(f, 'triangle', i * 0.07, 0.01, 0.04, 0.25, 0.11)); break;
      case 'bite': this.noise(t, 0.06, 0.16, 'bandpass', 1800, 2); glide(T(210, 'square', 0, 0.003, 0.01, 0.06, 0.05), 90, 0.07); break;
      case 'hit': this.noise(t, 0.04, 0.09, 'bandpass', 2600, 3); break;
      case 'spit': glide(T(760 + Math.random() * 80, 'sine', 0, 0.003, 0.008, 0.05, 0.03), 380, 0.05); break;
      case 'kill': glide(T(420, 'triangle', 0, 0.004, 0.02, 0.14, 0.1), 110, 0.16); this.noise(t, 0.1, 0.08, 'lowpass', 1200); break;
      case 'whip': this.noise(t, 0.28, 0.24, 'bandpass', 500, 1.2, 3200); break;
      case 'dash': this.noise(t, 0.22, 0.16, 'bandpass', 2600, 0.8, 500); break;
      case 'hurt': glide(T(170, 'sawtooth', 0, 0.004, 0.03, 0.2, 0.14), 60, 0.22); this.noise(t, 0.12, 0.14, 'lowpass', 700); break;
      case 'loop': this.noise(t, 0.5, 0.3, 'lowpass', 2600, 1, 120); glide(T(96, 'sine', 0, 0.004, 0.08, 0.5, 0.3), 40, 0.5); T(784, 'triangle', 0.02, 0.005, 0.03, 0.3, 0.07); break;
      case 'zap': this.noise(t, 0.09, 0.12, 'highpass', 3200); glide(T(1400, 'square', 0, 0.002, 0.01, 0.07, 0.03), 300, 0.08); break;
      case 'level': [523, 659, 784, 1046, 1318].forEach((f, i) => T(f, 'triangle', i * 0.08, 0.01, 0.06, 0.35, 0.12)); break;
      case 'relic': [784, 988, 1175, 1568].forEach((f, i) => { T(f, 'sine', i * 0.09, 0.01, 0.08, 0.6, 0.1); T(f * 1.5, 'sine', i * 0.09, 0.01, 0.04, 0.5, 0.035); }); break;
      case 'start': T(196, 'sawtooth', 0, 0.02, 0.18, 0.3, 0.09); T(294, 'sawtooth', 0.22, 0.02, 0.25, 0.5, 0.09); this.noise(t, 0.5, 0.1, 'lowpass', 500); break;
      case 'win': [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => T(f, 'triangle', i * 0.11, 0.01, 0.08, 0.4, 0.12)); break;
      case 'fail': [392, 330, 262].forEach((f, i) => T(f, 'triangle', i * 0.16, 0.01, 0.1, 0.35, 0.11)); break;
      case 'death': [330, 294, 247, 196, 147].forEach((f, i) => T(f, 'sawtooth', i * 0.2, 0.02, 0.14, 0.5, 0.08)); break;
      case 'buy': T(880, 'square', 0, 0.004, 0.03, 0.1, 0.05); T(1320, 'square', 0.07, 0.004, 0.03, 0.16, 0.05); break;
      case 'warn': T(110, 'sawtooth', 0, 0.3, 0.4, 0.3, 0.1); break;
      case 'slam': this.noise(t, 0.6, 0.4, 'lowpass', 900, 1, 60); glide(T(80, 'sine', 0, 0.004, 0.1, 0.6, 0.4), 30, 0.6); break;
      case 'curse': [220, 233, 208].forEach((f, i) => T(f, 'sawtooth', i * 0.18, 0.05, 0.2, 0.5, 0.07)); break;
      case 'tick': T(1100, 'sine', 0, 0.003, 0.01, 0.06, 0.06); break;
      case 'ui': T(660, 'sine', 0, 0.003, 0.01, 0.06, 0.05); break;
    }
  }
}
