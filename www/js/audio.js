/* Procedural audio (no asset files). Pop pitch climbs a pentatonic scale with chain length. */
const Sfx = {
  ctx: null, voices: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.master = this.ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(this.ctx.destination); } catch (e) {}
  },
  tone(freq, dur, type, vol, slide) {
    if (!Save.d.sound || !this.ctx || this.voices > 14) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
    this.voices++; o.onended = () => { this.voices--; };
  },
  pop(chain) {
    const sc = [0, 2, 4, 7, 9], i = Math.min(chain, 24), f = 392 * Math.pow(2, (sc[i % 5] + 12 * Math.floor(i / 5)) / 12);
    this.tone(f, 0.22, 'sine', 0.2, 1.02); this.tone(f * 2, 0.12, 'triangle', 0.06);
  },
  tap() { this.tone(220, 0.18, 'sine', 0.25, 0.5); },
  bad() { this.tone(140, 0.2, 'square', 0.1, 0.6); },
  crack() { this.tone(300, 0.08, 'square', 0.08, 0.6); },
  click() { this.tone(520, 0.06, 'triangle', 0.12); },
  coin() { this.tone(988, 0.08, 'square', 0.07); setTimeout(() => this.tone(1319, 0.14, 'square', 0.07), 70); },
  win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.28, 'triangle', 0.18), i * 110)); },
  lose() { [392, 330, 262].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'sawtooth', 0.09, 0.9), i * 150)); },
  buzz(ms) {
    if (!Save.d.vib) return;
    try {
      const H = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Haptics;
      if (H) H.impact({ style: ms > 25 ? 'MEDIUM' : 'LIGHT' }); else if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) {}
  },
  /* soft generative ambient music: slow pentatonic pad + sparse plucks */
  musicOn: false, mt: null, step: 0,
  music(on) {
    if (on === undefined) on = Save.d.music;
    if (!on || !Save.d.music) { clearInterval(this.mt); this.mt = null; return; }
    if (!this.ctx || this.mt) return;
    const chords = [[0, 4, 7], [-3, 0, 4], [-5, -1, 2], [-7, -3, 0]], sc = [0, 2, 4, 7, 9, 12, 14];
    const play = (semi, dur, vol, type) => {
      const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain(), f = 220 * Math.pow(2, semi / 12);
      o.type = type; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + dur * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.musicGain || this.master); o.start(t); o.stop(t + dur + 0.05);
    };
    if (!this.musicGain) { this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0.35; this.musicGain.connect(this.master); }
    this.mt = setInterval(() => {
      if (document.hidden || !Save.d.music) return;
      const bar = Math.floor(this.step / 8) % 4, ch = chords[bar];
      if (this.step % 8 === 0) ch.forEach(n => play(n, 4.2, 0.05, 'sine'));
      if (this.step % 2 === 0 && Math.random() < 0.7) play(ch[0] + 12 + sc[Math.floor(Math.random() * sc.length)], 1.4, 0.035, 'triangle');
      this.step++;
    }, 520);
  }
};
