// audio.js — all sound is synthesized with WebAudio: no audio files, no
// network. Short noise/oscillator envelopes for shots, hits, the charge and
// the round stingers. The context is created lazily on the first user
// gesture (menu click), which is when browsers allow sound at all.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
  }

  // A burst of filtered noise: the body of every gunshot and explosion.
  noise(dur, freq, gain, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
  }

  tone(freq, dur, gain, type = 'square', when = 0, slideTo = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  shot(kind) {
    if (kind === 'sniper') {
      this.noise(0.28, 900, 0.9);
      this.tone(120, 0.2, 0.5, 'sawtooth', 0, 40);
    } else if (kind === 'shotgun') {
      this.noise(0.22, 700, 0.8);
    } else if (kind === 'smg') {
      this.noise(0.09, 1600, 0.5);
    } else {
      this.noise(0.13, 1200, 0.65);
      this.tone(220, 0.06, 0.2, 'square', 0, 90);
    }
  }

  dryFire() {
    this.tone(1200, 0.04, 0.15, 'square');
  }

  reload() {
    this.tone(500, 0.05, 0.2, 'square', 0);
    this.tone(340, 0.05, 0.2, 'square', 0.12);
    this.tone(640, 0.06, 0.25, 'square', 0.3);
  }

  hit(head) {
    this.tone(head ? 1560 : 1050, 0.07, 0.3, 'sine');
  }

  hurt() {
    this.tone(160, 0.15, 0.4, 'sawtooth', 0, 70);
  }

  kill() {
    this.tone(880, 0.09, 0.3, 'sine');
    this.tone(1320, 0.12, 0.3, 'sine', 0.07);
  }

  throwWhoosh() {
    this.noise(0.18, 2400, 0.2);
  }

  explosion() {
    this.noise(0.9, 300, 1.0);
    this.tone(70, 0.8, 0.8, 'sine', 0, 30);
  }

  beep(final) {
    this.tone(final ? 1760 : 1180, final ? 0.3 : 0.08, 0.3, 'sine');
  }

  plantTick() {
    this.tone(940, 0.05, 0.2, 'square');
  }

  buy() {
    this.tone(740, 0.07, 0.25, 'sine');
    this.tone(1108, 0.1, 0.25, 'sine', 0.06);
  }

  denied() {
    this.tone(220, 0.12, 0.25, 'square');
  }

  roundWin() {
    this.tone(523, 0.14, 0.3, 'triangle');
    this.tone(659, 0.14, 0.3, 'triangle', 0.12);
    this.tone(784, 0.22, 0.3, 'triangle', 0.24);
  }

  roundLose() {
    this.tone(392, 0.16, 0.3, 'triangle');
    this.tone(330, 0.16, 0.3, 'triangle', 0.14);
    this.tone(262, 0.26, 0.3, 'triangle', 0.28);
  }
}
