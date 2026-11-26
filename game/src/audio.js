// Sound, synthesized live with WebAudio — engine drone, wind rush, ring
// chimes, landing thuds and stall warnings. No audio files, no network.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineOsc2 = null;
    this.engineGain = null;
    this.windGain = null;
    this.windFilter = null;
    this.started = false;
  }

  ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    // Engine: two detuned saws through a low-pass, pitch follows throttle.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc2.type = 'square';
    this.engineOsc2.frequency.value = 28;
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(engineFilter);
    this.engineOsc2.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.ctx.destination);
    this.engineOsc.start();
    this.engineOsc2.start();
    // Wind: looped noise through a band-pass, gain follows airspeed.
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 700;
    this.windFilter.Q.value = 0.6;
    this.windGain = this.ctx.createGain();
    this.windGain.gain.value = 0;
    noise.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.ctx.destination);
    noise.start();
    this.started = true;
  }

  resume() {
    this.ensure();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  update(throttle, speed, stalled, airborne) {
    if (!this.ctx || this.muted) {
      if (this.engineGain) this.engineGain.gain.value = 0;
      if (this.windGain) this.windGain.gain.value = 0;
      return;
    }
    const t = this.ctx.currentTime;
    const rpm = 50 + throttle * 90 + speed * 0.35;
    this.engineOsc.frequency.setTargetAtTime(rpm, t, 0.08);
    this.engineOsc2.frequency.setTargetAtTime(rpm * 0.5 + 2, t, 0.08);
    const target = airborne || throttle > 0.05 ? 0.05 + throttle * 0.075 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.1);
    const windTarget = Math.min(0.22, (speed * speed) / 9000) * (stalled ? 0.4 : 1);
    this.windGain.gain.setTargetAtTime(windTarget, t, 0.15);
    this.windFilter.frequency.setTargetAtTime(500 + speed * 9, t, 0.1);
  }

  blip(freq = 880, dur = 0.12, type = 'sine', vol = 0.16) {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start();
    o.stop(this.ctx.currentTime + dur);
  }

  chime() {
    this.blip(1046, 0.25, 'sine', 0.2);
    setTimeout(() => this.blip(1318, 0.35, 'sine', 0.2), 90);
    setTimeout(() => this.blip(1568, 0.5, 'sine', 0.18), 180);
  }

  thud() {
    if (!this.ctx || this.muted) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, this.ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(38, this.ctx.currentTime + 0.18);
    g.gain.setValueAtTime(0.35, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.22);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start();
    o.stop(this.ctx.currentTime + 0.25);
  }

  warn() {
    this.blip(620, 0.14, 'square', 0.1);
    setTimeout(() => this.blip(620, 0.14, 'square', 0.1), 180);
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }
}
