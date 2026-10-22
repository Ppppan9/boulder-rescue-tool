// WebAudio 合成音效（无版权素材）：拧螺丝、入槽、三消、木板坠落、落石、滴答、通关、失败。
export const SFX_NAMES = {
  pick: ['sfxPick', '拧螺丝'],
  land: ['sfxPick', '入槽'],
  match: ['sfxMatch', '三消'],
  plank: ['sfxPlank', '木板坠落'],
  rumble: ['sfxRumble', '落石'],
  tick: ['sfxTick', '滴答'],
  win: ['sfxWin', '通关'],
  fail: ['sfxFail', '失败'],
};
export const SFX_DUR = { pick: 0.16, land: 0.16, match: 0.85, plank: 0.4, rumble: 0.75, tick: 0.08, win: 1.6, fail: 1.1 };

export class Sfx {
  constructor() { this.ctx = null; this._t = null; }
  ensure() {
    if (this.ctx) return this.ctx;
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
    this.ctx = new C();
    this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
    this.recDest = this.ctx.createMediaStreamDestination(); this.master.connect(this.recDest);
    this.makeNoise(); return this.ctx;
  }
  makeNoise() {
    const len = Math.round(this.ctx.sampleRate * 0.8), b = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = b.getChannelData(0);
    let s = 2463534242;
    for (let i = 0; i < len; i++) { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; d[i] = ((s >>> 0) / 4294967295) * 2 - 1; }
    this.noise = b;
  }
  now() { return this._t != null ? this._t : this.ctx.currentTime; }
  resume() { const c = this.ensure(); if (c && c.state === 'suspended') c.resume(); }
  play(name, S, o = {}) {
    const [k] = SFX_NAMES[name] || [];
    if (!k || S.sfxMute || !S[k]) return;
    if (this.hook && this._t == null) { try { this.hook(name, o); } catch (e) { /* ignore */ } }
    if (!this.ensure()) return;
    const v = S.sfxVolume; if (v <= 0) return;
    const fn = this['_' + name]; if (fn) fn.call(this, this.now(), v, o);
  }
  env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }
  osc(t, type, f0, f1, dur, vol, a = 0.004) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(Math.max(20, f0), t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    this.env(g, t, a, vol, dur); o.connect(g); g.connect(this.master); o.start(t); o.stop(t + a + dur + 0.02);
  }
  nz(t, type, f0, f1, q, dur, vol, a = 0.005) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(Math.max(40, f0), t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur); f.Q.value = q;
    const g = c.createGain(); this.env(g, t, a, vol, dur); s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t); s.stop(t + a + dur + 0.02);
  }
  _pick(t, v) {
    this.nz(t, 'bandpass', 3200, 1200, 3.5, 0.055, v * 0.24);
    this.osc(t, 'square', 920, 460, 0.06, v * 0.055);
    this.osc(t + 0.045, 'triangle', 360, 220, 0.06, v * 0.2);
  }
  _land(t, v) {
    this.osc(t, 'sine', 720, 320, 0.07, v * 0.24);
    this.nz(t, 'highpass', 2800, 1600, 1, 0.04, v * 0.1);
  }
  _match(t, v) {
    [659, 880, 1175].forEach((f, i) => {
      this.osc(t + i * 0.075, 'sine', f, f, 0.5, v * 0.22, 0.006);
      this.osc(t + i * 0.075, 'sine', f * 2, f * 2, 0.24, v * 0.055, 0.006);
    });
    this.nz(t + 0.04, 'highpass', 5000, 3000, 1, 0.18, v * 0.08);
  }
  _plank(t, v) {
    this.nz(t, 'lowpass', 1400, 260, 1.2, 0.18, v * 0.5);
    this.osc(t + 0.02, 'sine', 190, 80, 0.16, v * 0.4);
    this.nz(t + 0.16, 'lowpass', 900, 180, 1, 0.16, v * 0.34);
  }
  _rumble(t, v) {
    this.nz(t, 'lowpass', 320, 80, 1, 0.7, v * 0.55, 0.02);
    this.osc(t, 'sine', 62, 32, 0.7, v * 0.5, 0.02);
    this.nz(t + 0.24, 'lowpass', 800, 160, 0.8, 0.3, v * 0.3);
  }
  _tick(t, v) {
    this.osc(t, 'square', 1250, 900, 0.035, v * 0.06);
    this.nz(t, 'highpass', 4500, 3500, 1, 0.025, v * 0.05);
  }
  _win(t, v) {
    [523, 659, 784, 1047, 1319].forEach((f, i) => {
      this.osc(t + i * 0.11, 'triangle', f, f, 0.6, v * 0.2, 0.008);
      this.osc(t + i * 0.11, 'sine', f * 2, f * 2, 0.3, v * 0.06, 0.008);
    });
    this.nz(t + 0.1, 'highpass', 3000, 5000, 1, 0.7, v * 0.06);
  }
  _fail(t, v) {
    this.osc(t, 'sawtooth', 160, 48, 0.9, v * 0.22, 0.01);
    this.osc(t + 0.04, 'square', 82, 34, 0.85, v * 0.16, 0.02);
    this.nz(t, 'lowpass', 700, 100, 1, 0.9, v * 0.35, 0.01);
  }
}

// ---------- 离线渲染（AE / 3D 导出用）events: [{t, name, dur}] ----------
export async function renderSfxOffline(events, dur, S) {
  const C = window.OfflineAudioContext || window.webkitOfflineAudioContext; if (!C) return null;
  const sr = 44100, oc = new C(1, Math.max(1, Math.ceil(sr * Math.max(0.2, dur))), sr);
  const x = new Sfx(); x.ctx = oc; x.master = oc.createGain(); x.master.connect(oc.destination); x.makeNoise();
  const S2 = { ...S, sfxMute: false };
  for (const k in SFX_NAMES) S2[SFX_NAMES[k][0]] = true;
  for (const e of events) { x._t = e.t; x.play(e.name, S2, { dur: e.dur }); }
  return await oc.startRendering();
}

export function encodeWav(buf) {
  const ch = buf.getChannelData(0), n = ch.length, dv = new DataView(new ArrayBuffer(44 + n * 2));
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, buf.sampleRate, true); dv.setUint32(28, buf.sampleRate * 2, true);
  dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); ws(36, 'data'); dv.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, ch[i])); dv.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true); }
  return new Uint8Array(dv.buffer);
}
