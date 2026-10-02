/* Procedural audio: wooden clacks, hoof clops, elephant footsteps + trumpet, camel pads, chimes, ambient music. */
import { Save } from './storage.js';
export const Sfx = {
  ctx: null, master: null, noiseBuf: null, voices: 0, mt: null, step: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const C = window.AudioContext || window.webkitAudioContext; this.ctx = new C();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.7;
      const comp = this.ctx.createDynamicsCompressor(); this.master.connect(comp); comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate; this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) {}
  },
  ok() { return Save.d.sound && this.ctx && this.voices < 24; },
  env(g, t, a, peak, dur) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); },
  tone(freq, dur, type, vol, slide, when = 0, dest) {
    if (!this.ok()) return; const c = this.ctx, t = c.currentTime + when, o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    this.env(g, t, 0.01, vol || 0.2, dur); o.connect(g); g.connect(dest || this.master); o.start(t); o.stop(t + dur + 0.05);
    this.voices++; o.onended = () => this.voices--;
  },
  noise(dur, freq, q, vol, when = 0, type = 'bandpass') {
    if (!this.ok()) return; const c = this.ctx, t = c.currentTime + when, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true; f.type = type; f.frequency.value = freq; f.Q.value = q;
    this.env(g, t, 0.004, vol, dur); s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
    this.voices++; s.onended = () => this.voices--;
  },
  place() { this.noise(0.07, 1500, 7, 0.55); this.tone(190, 0.09, 'sine', 0.35, 0.6); this.noise(0.03, 3600, 4, 0.18, 0.005); },
  capture() { this.noise(0.14, 900, 2.5, 0.7); this.tone(110, 0.2, 'sine', 0.5, 0.5); this.noise(0.05, 2800, 3, 0.4, 0.01); },
  clop(n = 1, gap = 0.1) { for (let i = 0; i < n; i++) { this.noise(0.05, 650 + Math.random() * 200, 5, 0.5, i * gap); this.tone(125, 0.06, 'sine', 0.3, 0.7, i * gap); } },
  thud() { this.noise(0.22, 140, 1.2, 0.9, 0, 'lowpass'); this.tone(52, 0.25, 'sine', 0.6, 0.6); },
  pad() { this.noise(0.08, 420, 1.5, 0.28, 0, 'lowpass'); },
  rustle() { this.noise(0.12, 2400, 1, 0.08); },
  trumpet() {
    if (!this.ok()) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter(), lfo = c.createOscillator(), lg = c.createGain();
    o.type = 'sawtooth'; o2.type = 'square'; o.frequency.setValueAtTime(240, t); o.frequency.linearRampToValueAtTime(560, t + 0.25); o.frequency.linearRampToValueAtTime(470, t + 0.6); o.frequency.exponentialRampToValueAtTime(260, t + 0.95);
    o2.frequency.setValueAtTime(121, t); o2.frequency.linearRampToValueAtTime(282, t + 0.25); o2.frequency.linearRampToValueAtTime(236, t + 0.6); o2.frequency.exponentialRampToValueAtTime(131, t + 0.95);
    lfo.frequency.value = 22; lg.gain.value = 12; lfo.connect(lg); lg.connect(o.frequency);
    f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.6;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + 0.08); g.gain.setValueAtTime(0.28, t + 0.55); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(this.master); o.start(t); o2.start(t); lfo.start(t); o.stop(t + 1.05); o2.stop(t + 1.05); lfo.stop(t + 1.05);
    this.noise(0.9, 1800, 0.8, 0.07);
  },
  click() { this.tone(540, 0.05, 'triangle', 0.12); },
  select() { this.tone(660, 0.07, 'sine', 0.14); this.tone(880, 0.07, 'sine', 0.1, 1, 0.05); },
  bad() { this.tone(150, 0.16, 'square', 0.08, 0.6); },
  check() { this.tone(880, 0.35, 'sine', 0.22); this.tone(1175, 0.4, 'sine', 0.18, 1, 0.12); },
  promote() { [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.16, 1, i * 0.08)); },
  coin() { this.tone(988, 0.08, 'square', 0.06); this.tone(1319, 0.14, 'square', 0.06, 1, 0.07); },
  win() { [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.45, 'triangle', 0.2, 1, i * 0.14)); this.tone(1568, 0.8, 'sine', 0.15, 1, 0.6); },
  lose() { [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.5, 'sawtooth', 0.07, 0.95, i * 0.2)); },
  draw() { [440, 440, 392].forEach((f, i) => this.tone(f, 0.4, 'sine', 0.15, 1, i * 0.18)); },
  buzz(ms) {
    if (!Save.d.vib) return;
    try { const H = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Haptics; if (H) H.impact({ style: ms > 25 ? 'MEDIUM' : 'LIGHT' }); else if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
  },
  /* calm generative background: slow pad chords + sparse plucks */
  music(on) {
    if (on === undefined) on = Save.d.music;
    if (!on || !Save.d.music || !Save.d.sound) { clearInterval(this.mt); this.mt = null; return; }
    if (!this.ctx || this.mt) return;
    if (!this.mg) { this.mg = this.ctx.createGain(); this.mg.gain.value = 0.22; this.mg.connect(this.master); }
    const chords = [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]], sc = [0, 3, 5, 7, 10, 12, 15];
    const play = (semi, dur, vol, type) => { this.tone(220 * Math.pow(2, semi / 12), dur, type, vol, 1, 0, this.mg); };
    this.mt = setInterval(() => {
      if (document.hidden) return;
      const ch = chords[Math.floor(this.step / 8) % 4];
      if (this.step % 8 === 0) ch.forEach(n => play(n, 5, 0.1, 'sine'));
      if (this.step % 2 === 0 && Math.random() < 0.6) play(ch[0] + 12 + sc[Math.floor(Math.random() * sc.length)], 1.8, 0.07, 'triangle');
      this.step++;
    }, 650);
  }
};
