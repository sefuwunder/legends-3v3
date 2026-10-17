// Synthesized Dreamcast-era audio: no assets, all WebAudio.
let ctx = null, crowdGain = null, crowdLevel = 0.25;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    // looping crowd bed: filtered noise
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 0.6;
    crowdGain = ctx.createGain(); crowdGain.gain.value = crowdLevel * 0.12;
    src.connect(f).connect(crowdGain).connect(ctx.destination);
    src.start();
  } catch (e) { /* audio unavailable */ }
}
export function resumeAudio() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
export function crowdSwell(x) {
  crowdLevel = Math.max(0.15, Math.min(1, x));
  if (crowdGain) crowdGain.gain.setTargetAtTime(crowdLevel * 0.22, ctx.currentTime, 0.4);
}
function env(g, t0, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(peak, t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dec);
}
export function bounce(hard = 1) {
  if (!ctx) return; const t0 = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(160 * hard, t0);
  o.frequency.exponentialRampToValueAtTime(55, t0 + 0.09);
  env(g, t0, 0.005, 0.5 * hard, 0.1);
  o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + 0.15);
}
export function swish() {
  if (!ctx) return; const t0 = ctx.currentTime;
  const len = ctx.sampleRate * 0.25, buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ctx.createBufferSource(); s.buffer = buf;
  const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500;
  const g = ctx.createGain(); env(g, t0, 0.01, 0.5, 0.22);
  s.connect(f).connect(g).connect(ctx.destination); s.start(t0);
}
export function clang() {
  if (!ctx) return; const t0 = ctx.currentTime;
  for (const fr of [620, 930, 1470]) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = fr * (0.98 + Math.random() * 0.04);
    env(g, t0, 0.004, 0.12, 0.28);
    o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + 0.35);
  }
}
export function buzzer() {
  if (!ctx) return; const t0 = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sawtooth'; o.frequency.value = 392;
  env(g, t0, 0.02, 0.4, 1.1);
  o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + 1.3);
}
export function whistle() {
  if (!ctx) return; const t0 = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'square'; o.frequency.setValueAtTime(2300, t0);
  o.frequency.setValueAtTime(2600, t0 + 0.12);
  env(g, t0, 0.01, 0.25, 0.3);
  o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + 0.4);
}
export function squeak() {
  if (!ctx || Math.random() > 0.5) return; const t0 = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(1400 + Math.random() * 900, t0);
  o.frequency.exponentialRampToValueAtTime(900, t0 + 0.07);
  env(g, t0, 0.005, 0.06, 0.07);
  o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + 0.1);
}
export function blip() {
  if (!ctx) return; const t0 = ctx.currentTime;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'square'; o.frequency.value = 880;
  env(g, t0, 0.005, 0.15, 0.06);
  o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + 0.1);
}
export function cheer() {
  if (!ctx) return;
  crowdSwell(1);
  setTimeout(() => crowdSwell(0.3), 2500);
}
