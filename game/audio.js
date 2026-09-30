// Probe Card Lab — sound. Everything is synthesized with Web Audio: an adaptive score rendered into
// loopable stems when the game starts, and every effect built from oscillators and filtered noise.
// No audio files except the voice-over clips.
//
// Mix design: effects share one short room plus a longer hall send, the effect bus is gently
// low-passed so nothing pierces, and the score ducks under the events that matter.

const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
const BPM = 96, BEAT = 60 / BPM, S16 = BEAT / 4, BAR = BEAT * 4, LOOP_BARS = 8, LOOP = BAR * LOOP_BARS;   // 20 s
// two bars each: Dm9 · B♭maj7 · Fmaj9 · C6/9
const CHORDS = [
  { root: 38, pad: [57, 60, 64, 65, 69], arp: [62, 65, 69, 72, 76] },
  { root: 34, pad: [58, 62, 65, 69, 72], arp: [58, 62, 65, 69, 74] },
  { root: 41, pad: [57, 60, 64, 67, 72], arp: [60, 64, 65, 69, 72] },
  { root: 36, pad: [55, 57, 62, 64, 67], arp: [60, 62, 64, 67, 69] },
];
// the melody: [bar, beat, midi, beats]
const LEAD = [[0, 0, 69, 1.5], [0, 1.5, 74, 0.5], [0, 2, 77, 2], [1, 2, 76, 1], [1, 3, 74, 1], [2, 0, 74, 1.5], [2, 1.5, 77, 0.5], [2, 2, 81, 2], [3, 2, 79, 1], [3, 3, 77, 1],
  [4, 0, 72, 1.5], [4, 1.5, 76, 0.5], [4, 2, 79, 2], [5, 2, 77, 1], [5, 3, 76, 1], [6, 0, 76, 1.5], [6, 1.5, 79, 0.5], [6, 2, 74, 2], [7, 1, 76, 1], [7, 2, 74, 2]];
const SCALE = [50, 53, 55, 57, 60, 62, 65, 67, 69, 72];      // D minor pentatonic, the notes touchdowns play

const noiseCache = new WeakMap();
function noise(ac) {
  let b = noiseCache.get(ac);
  if (!b) {
    b = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = b.getChannelData(0); let s = 22222;
    for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = s / 1073741823.5 - 1; }
    noiseCache.set(ac, b);
  }
  return b;
}
function impulse(ac, seconds, decay, dark = 0.4) {             // synthetic room: decaying noise whose highs die first
  const n = Math.floor(ac.sampleRate * seconds), b = ac.createBuffer(2, n, ac.sampleRate), pre = ac.sampleRate * 0.008;
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let lp = 0, s = 1234 + ch * 777;
    for (let i = 0; i < n; i++) {
      s = (s * 16807) % 2147483647; const w = s / 1073741823.5 - 1, t = i / n;
      lp += (w - lp) * (0.6 - dark * t - dark * 0.3);
      d[i] = lp * Math.pow(1 - t, decay) * (i < pre ? i / pre : 1);
    }
  }
  return b;
}
// small building blocks -------------------------------------------------------
const rnd = (a, b) => a + Math.random() * (b - a);
function G(ac, v = 1) { const g = ac.createGain(); g.gain.value = v; return g; }
function osc(ac, type, f, t0, t1, detune = 0) { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune; o.start(t0); o.stop(t1); return o; }
function nz(ac, t0, t1) { const s = ac.createBufferSource(); s.buffer = noise(ac); s.loop = true; s.start(t0, Math.random() * 1.5); s.stop(t1); return s; }
function filt(ac, type, f, q = 0.7, gain = 0) { const b = ac.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; b.gain.value = gain; return b; }
function pan(ac, p) { if (ac.createStereoPanner) { const n = ac.createStereoPanner(); n.pan.value = Math.max(-1, Math.min(1, p)); return n; } return G(ac, 1); }
function perc(g, t, peak, attack, decay) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(Math.max(peak, 0.0002), t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay); }
function swell(g, t, peak, attack, hold, release) { g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + attack); g.gain.setValueAtTime(peak, t + attack + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release); }
function chain(...n) { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); return n[n.length - 1]; }
function send(node, o, wet = 1) { node.connect(o.dry); if (wet > 0) node.connect(wet === 1 ? o.wet : chain(G(node.context, wet), o.wet)); }
/** Soft mallet tone: a few sine partials under a closing low-pass, so it never gets piercing. */
function mallet(ac, o, t, f, peak, decay, { p = 0, bright = 1, wet = 0.6, attack = 0.006 } = {}) {
  const lp = filt(ac, 'lowpass', 1100 + 2000 * bright, 0.5), out = pan(ac, p);
  lp.frequency.setValueAtTime(1300 + 3000 * bright, t); lp.frequency.exponentialRampToValueAtTime(700 + 500 * bright, t + decay);
  for (const [r, a, d] of [[1, 1, 1], [2, 0.3, 0.55], [3.01, 0.1, 0.3], [4.1, 0.04, 0.2]]) { const g = G(ac, 0); perc(g, t, peak * a, attack, decay * d); chain(osc(ac, 'sine', f * r, t, t + decay + 0.1), g, lp); }
  lp.connect(out); send(out, o, wet);
}
/** FM electric-piano voice for melodies and chimes. */
function epiano(ac, o, t, f, peak, decay, { p = 0, wet = 0.7, index = 1.0, tone = 3200 } = {}) {
  const car = ac.createOscillator(), mod = ac.createOscillator(), mg = G(ac, 0), g = G(ac, 0), out = pan(ac, p);
  car.frequency.value = f; mod.frequency.value = f * 2.003;
  mg.gain.setValueAtTime(f * index, t); mg.gain.exponentialRampToValueAtTime(f * 0.05, t + decay * 0.6);
  mod.connect(mg).connect(car.frequency); perc(g, t, peak, 0.008, decay);
  car.start(t); mod.start(t); car.stop(t + decay + 0.1); mod.stop(t + decay + 0.1);
  chain(car, filt(ac, 'lowpass', tone, 0.5), g, out); send(out, o, wet);
}
function twang(ac, o, t, f, peak, decay, p = 0) {
  const d = ac.createDelay(0.05), fb = G(ac, Math.min(0.97, Math.pow(0.001, 1 / (f * decay)))), lp = filt(ac, 'lowpass', 5200, -6), g = G(ac, peak), burst = G(ac, 0);   // Q is in dB here: below 0 keeps the loop gain under 1
  d.delayTime.value = 1 / f; perc(burst, t, 1, 0.001, 0.012);
  chain(nz(ac, t, t + 0.03), burst, d); chain(d, lp, fb, d);
  g.gain.setValueAtTime(peak, t + decay); g.gain.linearRampToValueAtTime(0, t + decay + 0.1);
  send(chain(lp, g, pan(ac, p)), o, 0.8);
}
/** A tiny bright transient that gives an event definition without a pitched "ping". */
function snap(ac, o, t, peak, f = 5200, p = 0) { const g = G(ac, 0); perc(g, t, peak, 0.0008, 0.009); chain(nz(ac, t, t + 0.03), filt(ac, 'bandpass', f, 0.7), g, pan(ac, p)).connect(o.dry); }
function thump(ac, o, t, f, peak, decay) { const s = ac.createOscillator(), g = G(ac, 0); s.frequency.setValueAtTime(f * 1.7, t); s.frequency.exponentialRampToValueAtTime(f, t + 0.04); s.start(t); s.stop(t + decay + 0.1); perc(g, t, peak, 0.004, decay); chain(s, g).connect(o.dry); }

/* ---------------- the score ---------------- */
const STEMS = {
  bass(ac, out) {
    for (let bar = 0; bar < LOOP_BARS * 2; bar++) {
      const c = CHORDS[(bar >> 1) % 4], t = bar * BAR;
      for (const [off, m, len, peak] of [[0, c.root, BEAT * 3, 0.24], [BEAT * 3.5, c.root + 12, BEAT * 0.45, 0.13]]) {
        const g = G(ac, 0), lp = filt(ac, 'lowpass', 240, 0.8), t0 = t + off;
        g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + 0.02); g.gain.setValueAtTime(peak * 0.8, t0 + len * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t0 + len + 0.3);
        osc(ac, 'sine', midi(m), t0, t0 + len + 0.35).connect(lp); osc(ac, 'triangle', midi(m), t0, t0 + len + 0.35).connect(G(ac, 0.45)).connect(lp);
        chain(lp, g).connect(out.dry);
      }
    }
  },
  arp(ac, out) {
    // ping-pong delay: left and right feed each other
    const dl = ac.createDelay(1), dr = ac.createDelay(1), fl = G(ac, 0.34), fr = G(ac, 0.34), mrg = ac.createChannelMerger(2), dOut = G(ac, 0.5), tone = filt(ac, 'lowpass', 3200);
    dl.delayTime.value = BEAT * 0.75; dr.delayTime.value = BEAT * 0.75; tone.frequency.value = 5200;
    dl.connect(fl).connect(dr); dr.connect(fr).connect(dl); dl.connect(mrg, 0, 0); dr.connect(mrg, 0, 1);
    chain(mrg, tone, dOut); send(dOut, out, 0.6);
    const shelf = filt(ac, 'highshelf', 3500, 0.7, 6); send(shelf, out, 0.4);
    const order = [0, 2, 1, 3, 2, 4, 3, 1, 0, 3, 2, 4, 1, 3, 2, 4];
    for (let s = 0; s < LOOP_BARS * 16 * 2; s++) {
      const bar = Math.floor(s / 16), c = CHORDS[(bar >> 1) % 4], st = s % 16;
      if (st === 3 || st === 11 || (st === 7 && bar % 2)) continue;
      const t = s * S16 + (st % 2 ? S16 * 0.08 : 0), vel = (st % 4 === 0 ? 1 : st % 2 === 0 ? 0.62 : 0.4) * rnd(0.85, 1.1);   // a little swing and touch
      const m = c.arp[order[st] % c.arp.length] + (st > 11 && bar % 4 === 3 ? 12 : 0);
      const lp = filt(ac, 'lowpass', 2600, 2.0), g = G(ac, 0), p = pan(ac, st % 2 ? 0.4 : -0.4);
      lp.frequency.setValueAtTime(1200 + 4200 * vel, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.19);
      perc(g, t, 0.19 * vel, 0.004, 0.2);
      osc(ac, 'triangle', midi(m), t, t + 0.3, rnd(-4, 4)).connect(lp); osc(ac, 'square', midi(m), t, t + 0.3).connect(G(ac, 0.18)).connect(lp);
      chain(lp, g, p); p.connect(shelf); p.connect(st % 2 ? dl : dr);
    }
  },
  lead(ac, out) {
    for (let rep = 0; rep < 2; rep++) for (const [bar, beat, m, len] of LEAD) {
      const t = rep * LOOP + bar * BAR + beat * BEAT;
      epiano(ac, out, t, midi(m), 0.12 * rnd(0.88, 1.06), 0.5 + len * BEAT * 0.9, { p: (m - 75) * 0.05, wet: 0.9, index: 1.5, tone: 4200 });
    }
  },
  drums(ac, out) {
    for (let bar = 0; bar < LOOP_BARS * 2; bar++) for (let st = 0; st < 16; st++) {
      const t = bar * BAR + st * S16 + (st % 2 ? S16 * 0.08 : 0), hum = rnd(0.85, 1.08);
      if (st === 0 || st === 8 || st === 6 || (st === 14 && bar % 2)) {               // kick
        const o = ac.createOscillator(), g = G(ac, 0); o.frequency.setValueAtTime(116, t); o.frequency.exponentialRampToValueAtTime(43, t + 0.11);
        o.start(t); o.stop(t + 0.4); perc(g, t, (st === 0 || st === 8 ? 0.6 : 0.38) * hum, 0.004, 0.24); chain(o, g).connect(out.dry); snap(ac, out, t, 0.05, 3200);
      }
      if (st % 2 === 0) {                                                              // hats
        const open = st === 14 && bar % 4 === 3, g = G(ac, 0); perc(g, t, (st % 4 === 2 ? 0.15 : 0.085) * hum, 0.002, open ? 0.22 : 0.04);
        chain(nz(ac, t, t + 0.3), filt(ac, 'highpass', 6500), filt(ac, 'lowpass', 11000), g, pan(ac, 0.25)).connect(out.dry);
      } else { const g = G(ac, 0); perc(g, t, 0.045 * hum, 0.002, 0.025); chain(nz(ac, t, t + 0.1), filt(ac, 'highpass', 8000), g, pan(ac, -0.25)).connect(out.dry); }
      if (st === 4 || st === 12) {                                                     // soft clap
        for (const d of [0, 0.011, 0.023]) { const g = G(ac, 0); perc(g, t + d, 0.15 * hum, 0.002, d ? 0.03 : 0.14); send(chain(nz(ac, t + d, t + d + 0.3), filt(ac, 'bandpass', 2300, 0.8), g), out, 0.8); }
      }
      if (st === 10 && bar % 2 === 0) { const g = G(ac, 0); perc(g, t, 0.09, 0.001, 0.035); chain(osc(ac, 'triangle', 1500, t, t + 0.1), g, pan(ac, -0.4)).connect(out.dry); }
    }
  },
};
// the pad: every voice goes through one tone filter that keeps the low mids clean
STEMS.pad = function (ac, out) {
  const tone = filt(ac, 'highpass', 210, 0.6), dip = filt(ac, 'peaking', 340, 0.9, -4); tone.connect(dip); send(dip, out, 0.9);
  for (let rep = 0; rep < 2; rep++) CHORDS.forEach((c, ci) => {
    const t0 = rep * LOOP + ci * BAR * 2, dur = BAR * 2;
    c.pad.forEach((m, i) => {
      const lp = filt(ac, 'lowpass', 700, 0.7), g = G(ac, 0), p = pan(ac, -0.75 + 1.5 * i / (c.pad.length - 1));
      const lfo = osc(ac, 'sine', 0.11 + 0.035 * i, t0, t0 + dur + 1.6), lg = G(ac, 260); lfo.connect(lg).connect(lp.frequency);
      lp.frequency.setValueAtTime(900, t0); lp.frequency.linearRampToValueAtTime(2600 + 200 * i, t0 + dur * 0.6); lp.frequency.linearRampToValueAtTime(1000, t0 + dur + 1.2);
      g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(0.046, t0 + 1.6); g.gain.setValueAtTime(0.046, t0 + dur - 0.4); g.gain.linearRampToValueAtTime(0.0001, t0 + dur + 1.5);
      for (const det of [-9, 9]) osc(ac, 'sawtooth', midi(m), t0, t0 + dur + 1.6, det).connect(lp);
      osc(ac, 'triangle', midi(m + 12), t0, t0 + dur + 1.6, 4).connect(G(ac, 0.3)).connect(lp);
      chain(lp, g, p).connect(tone);
    });
    const air = G(ac, 0); swell(air, t0, 0.02, 2.0, dur - 3.0, 1.8); send(chain(nz(ac, t0, t0 + dur + 1), filt(ac, 'bandpass', 7000, 0.6), air, pan(ac, ci % 2 ? -0.5 : 0.5)), out, 1);   // breath above the chord
    const top = c.pad[c.pad.length - 1] + 12, tg = G(ac, 0), trem = osc(ac, 'sine', 0.35, t0, t0 + dur + 1), tl = G(ac, 0.012);
    swell(tg, t0 + 0.4, 0.022, 2.2, dur - 3.2, 1.6); trem.connect(tl).connect(tg.gain);
    send(chain(osc(ac, 'sine', midi(top), t0, t0 + dur + 1.2), tg, pan(ac, ci % 2 ? 0.4 : -0.4)), out, 1);
  });
};
const STEM_NAMES = ['pad', 'bass', 'arp', 'lead', 'drums'];
const MOODS = {                        // stem gains per game state: pad, bass, arp, lead, drums
  off: [0, 0, 0, 0, 0], menu: [0.9, 0.35, 0.62, 0.95, 0.0], tune: [0.85, 0.75, 0.55, 0.0, 0.0], run: [0.8, 0.85, 0.7, 0.0, 0.6], result: [0.95, 0.55, 0.5, 0.9, 0.0],
};
async function renderStem(name, sr) {
  const ac = new OfflineAudioContext(2, Math.ceil(LOOP * 2 * sr), sr);
  const dry = G(ac, 1), wet = G(ac, name === 'pad' ? 0.5 : 0.32), conv = ac.createConvolver(); conv.buffer = impulse(ac, 2.6, 2.4, 0.35);
  dry.connect(ac.destination); chain(wet, conv, G(ac, 0.9)).connect(ac.destination);
  STEMS[name](ac, { dry, wet });
  const full = await ac.startRendering(), n = Math.floor(LOOP * sr), out = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate: sr });
  for (let ch = 0; ch < 2; ch++) out.copyToChannel(full.getChannelData(ch).subarray(n, 2 * n), ch);     // second pass: tails already wrapped
  return out;
}

/* ---------------- effects ---------------- */
export const SFX = {
  tick(ac, o, t) { mallet(ac, o, t, 900, 0.08, 0.05, { bright: 0.6, wet: 0.2 }); snap(ac, o, t, 0.06, 6000); },
  click(ac, o, t) { mallet(ac, o, t, 523, 0.11, 0.12, { bright: 0.7, wet: 0.35 }); thump(ac, o, t, 160, 0.13, 0.05); snap(ac, o, t, 0.09, 5600); },
  confirm(ac, o, t) { epiano(ac, o, t, midi(62), 0.13, 0.45); epiano(ac, o, t + 0.09, midi(69), 0.14, 0.7); thump(ac, o, t, 140, 0.13, 0.07); snap(ac, o, t, 0.08, 5200); },
  back(ac, o, t) { epiano(ac, o, t, midi(64), 0.1, 0.3); epiano(ac, o, t + 0.08, midi(57), 0.1, 0.45); },
  slide(ac, o, t, { v = 0.5 } = {}) { mallet(ac, o, t, 420 + 520 * v, 0.07, 0.05, { bright: 0.5, wet: 0.15 }); },
  whoosh(ac, o, t, { up = true } = {}) {
    const f = filt(ac, 'bandpass', 400, 1.1), g = G(ac, 0); f.frequency.setValueAtTime(up ? 260 : 2200, t); f.frequency.exponentialRampToValueAtTime(up ? 2300 : 240, t + 0.4);
    swell(g, t, 0.5, 0.17, 0.02, 0.28); send(chain(nz(ac, t, t + 0.55), f, g, pan(ac, up ? -0.2 : 0.2)), o, 0.9);
  },
  servo(ac, o, t, { dur = 0.3, p = 0 } = {}) {                  // the chuck stepping to the next site
    const d = Math.max(0.05, dur), f = filt(ac, 'bandpass', 500, 2.4), g = G(ac, 0), og = G(ac, 0), out = pan(ac, p);
    f.frequency.setValueAtTime(340, t); f.frequency.linearRampToValueAtTime(860, t + d * 0.5); f.frequency.linearRampToValueAtTime(380, t + d);
    swell(g, t, 0.2, d * 0.25, d * 0.35, d * 0.4); chain(nz(ac, t, t + d + 0.05), f, g, out);
    const s = ac.createOscillator(); s.type = 'sawtooth'; s.frequency.setValueAtTime(66, t); s.frequency.linearRampToValueAtTime(122, t + d * 0.5); s.frequency.linearRampToValueAtTime(70, t + d); s.start(t); s.stop(t + d + 0.05);
    swell(og, t, 0.075, d * 0.3, d * 0.3, d * 0.4); chain(s, filt(ac, 'lowpass', 520), og, out); send(out, o, 0.5);
  },
  contact(ac, o, t, { q = 1, note = 0, fast = false, p = 0 } = {}) {   // q: contact quality 0…1 · note: step in the scale · p: pan
    const f = midi(SCALE[((note % SCALE.length) + SCALE.length) % SCALE.length]) * Math.pow(2, rnd(-6, 6) / 1200);
    const dec = fast ? 0.2 : 0.5, amp = (fast ? 0.12 : 0.2) * rnd(0.82, 1.08);
    mallet(ac, o, t, f, amp * (0.5 + 0.5 * q), dec, { p, bright: 0.35 + 0.65 * q, wet: fast ? 0.5 : 0.75 });
    if (q < 0.75) {                                              // a marginal contact buzzes and sags out of tune
      const g = G(ac, 0), lp = filt(ac, 'lowpass', 1100, 1.2); perc(g, t, amp * 0.55 * (1 - q), 0.006, dec * 0.7);
      send(chain(osc(ac, 'sawtooth', f * 1.055, t, t + dec), lp, g, pan(ac, p)), o, 0.5);
      const n = G(ac, 0); perc(n, t, 0.1 * (1 - q), 0.004, 0.09); send(chain(nz(ac, t, t + 0.2), filt(ac, 'bandpass', 1300, 1.6), n, pan(ac, p)), o, 0.4);
    }
    thump(ac, o, t, 105, fast ? 0.05 : 0.11, 0.06);             // the chuck meeting the card
    snap(ac, o, t, fast ? 0.035 : 0.075, 4200 + 1600 * q, p);              // the tips landing
  },
  fail(ac, o, t, { p = 0 } = {}) { const g = G(ac, 0), s = ac.createOscillator(); s.type = 'triangle'; s.frequency.setValueAtTime(168, t); s.frequency.exponentialRampToValueAtTime(92, t + 0.1); s.start(t); s.stop(t + 0.2); perc(g, t, 0.16, 0.006, 0.11); send(chain(s, g, pan(ac, p)), o, 0.4); },
  breach(ac, o, t) {                                              // a tip dragging off the pad
    const g = G(ac, 0), f = filt(ac, 'bandpass', 1200, 2.0), tr = G(ac, 0.55), l = osc(ac, 'triangle', 37, t, t + 0.45);
    f.frequency.setValueAtTime(1500, t); f.frequency.exponentialRampToValueAtTime(600, t + 0.32);
    l.connect(G(ac, 0.45)).connect(tr.gain); perc(g, t, 0.7, 0.02, 0.32);
    send(chain(nz(ac, t, t + 0.45), f, tr, filt(ac, 'lowpass', 2300), g), o, 0.9);
    const s = ac.createOscillator(), sg = G(ac, 0); s.type = 'sawtooth'; s.frequency.setValueAtTime(520, t); s.frequency.exponentialRampToValueAtTime(210, t + 0.26); s.start(t); s.stop(t + 0.35);
    perc(sg, t, 0.16, 0.012, 0.24); send(chain(s, filt(ac, 'lowpass', 1100, 1.2), sg), o, 0.6);
    thump(ac, o, t, 85, 0.34, 0.16); twang(ac, o, t + 0.02, 262, 0.13, 0.25, 0.2);
    const e = G(ac, 0), ef = filt(ac, 'bandpass', 3400, 1.2), et = G(ac, 0.5), el = osc(ac, 'square', 53, t, t + 0.35); el.connect(G(ac, 0.5)).connect(et.gain); perc(e, t, 0.22, 0.015, 0.26); send(chain(nz(ac, t, t + 0.35), ef, et, e), o, 0.6);
  },
  crack(ac, o, t) {                                               // brittle layers under the pad letting go
    const lp = filt(ac, 'lowpass', 2800, 0.6); send(lp, o, 0.9);
    for (let i = 0; i < 5; i++) { const tt = t + i * 0.021 + rnd(0, 0.012), g = G(ac, 0); perc(g, tt, 0.12, 0.003, 0.07); chain(osc(ac, 'triangle', rnd(1100, 2300), tt, tt + 0.12), g, pan(ac, rnd(-0.5, 0.5)), lp); }
    for (let i = 0; i < 4; i++) snap(ac, o, t + i * 0.019 + rnd(0, 0.01), 0.2 - i * 0.03, rnd(5000, 7500), rnd(-0.5, 0.5));
    const n = G(ac, 0); perc(n, t, 0.2, 0.002, 0.05); chain(nz(ac, t, t + 0.1), filt(ac, 'bandpass', 1400, 0.9), n, lp);
    thump(ac, o, t, 110, 0.55, 0.18);
  },
  bend(ac, o, t) {                                                // metal giving way
    const bp = filt(ac, 'bandpass', 320, 1.1), g = G(ac, 0), lp = filt(ac, 'lowpass', 1500, 0.6);
    bp.frequency.setValueAtTime(260, t); bp.frequency.exponentialRampToValueAtTime(900, t + 0.35); bp.frequency.exponentialRampToValueAtTime(300, t + 0.8);
    for (const [f, d] of [[110, 0], [116.5, 7], [55, -5]]) { const s = osc(ac, 'sawtooth', f, t, t + 1, d); s.frequency.setValueAtTime(f, t); s.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.8); s.connect(bp); }
    swell(g, t, 0.45, 0.03, 0.12, 0.7); send(chain(bp, lp, g), o, 1);
    const ng = G(ac, 0); perc(ng, t, 0.5, 0.004, 0.3); send(chain(nz(ac, t, t + 0.5), filt(ac, 'lowpass', 900), ng), o, 1);
    const sub = ac.createOscillator(), sg = G(ac, 0); sub.frequency.setValueAtTime(88, t); sub.frequency.exponentialRampToValueAtTime(30, t + 0.6); sub.start(t); sub.stop(t + 0.9); perc(sg, t, 0.42, 0.006, 0.7); chain(sub, sg).connect(o.dry);
    const sh = G(ac, 0), sf = filt(ac, 'bandpass', 3600, 1.4); sf.frequency.setValueAtTime(4200, t); sf.frequency.exponentialRampToValueAtTime(1500, t + 0.3); perc(sh, t, 0.3, 0.01, 0.3); send(chain(nz(ac, t, t + 0.4), sf, sh), o, 0.9);   // shear
    [[290, 0.02, -0.5], [233, 0.09, 0.4], [196, 0.17, -0.2], [311, 0.24, 0.6], [147, 0.33, 0]].forEach(([f, d, p]) => twang(ac, o, t + d, f, 0.15, 0.55, p));   // wires letting go
    snap(ac, o, t, 0.3, 4000);
  },
  alarm(ac, o, t) {
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.17, g = G(ac, 0), f = i % 2 ? 587 : 740; swell(g, tt, 0.17, 0.006, 0.09, 0.05);
      const lp = filt(ac, 'lowpass', 2000); osc(ac, 'triangle', f, tt, tt + 0.2).connect(lp); osc(ac, 'sine', f * 2, tt, tt + 0.2).connect(G(ac, 0.25)).connect(lp);
      send(chain(lp, g), o, 0.7); thump(ac, o, tt, 95, 0.16, 0.06);
    }
  },
  clean(ac, o, t) { const f = filt(ac, 'bandpass', 1800, 0.8), g = G(ac, 0), am = G(ac, 0.6), l = osc(ac, 'sawtooth', 58, t, t + 0.25); f.frequency.setValueAtTime(1200, t); f.frequency.linearRampToValueAtTime(3400, t + 0.13); l.connect(G(ac, 0.4)).connect(am.gain); swell(g, t, 0.6, 0.03, 0.03, 0.12); send(chain(nz(ac, t, t + 0.25), f, am, filt(ac, 'lowpass', 5200), g, pan(ac, rnd(-0.3, 0.3))), o, 0.8); thump(ac, o, t, 140, 0.1, 0.05); },
  soak(ac, o, t) { const s = ac.createOscillator(), g = G(ac, 0); s.type = 'sawtooth'; s.frequency.setValueAtTime(110, t); s.frequency.exponentialRampToValueAtTime(175, t + 1.2); s.start(t); s.stop(t + 1.5); swell(g, t, 0.2, 0.5, 0.2, 0.7); send(chain(s, filt(ac, 'lowpass', 700, 2), g), o, 1); for (let i = 0; i < 5; i++) epiano(ac, o, t + 0.2 + i * 0.2, midi(62 + [0, 3, 7, 10, 12][i]), 0.05, 0.6, { p: -0.4 + 0.2 * i }); },
  wafer(ac, o, t) { [62, 65, 69, 74].forEach((m, i) => epiano(ac, o, t + i * 0.08, midi(m + 12), 0.13, 1.0, { p: -0.3 + 0.2 * i })); },
  reveal(ac, o, t) {
    const f = filt(ac, 'bandpass', 300, 1.0), g = G(ac, 0); f.frequency.setValueAtTime(220, t); f.frequency.exponentialRampToValueAtTime(3400, t + 1.1);
    swell(g, t, 0.34, 0.95, 0.02, 0.28); send(chain(nz(ac, t, t + 1.35), f, g), o, 1);
    epiano(ac, o, t + 1.1, midi(86), 0.15, 1.4);
  },
  count(ac, o, t, { v = 0.5 } = {}) { mallet(ac, o, t, 500 + 500 * v, 0.06, 0.04, { bright: 0.5, wet: 0.1 }); },
  star(ac, o, t, { i = 0 } = {}) { const m = [69, 72, 76][i] || 76; epiano(ac, o, t, midi(m), 0.2, 1.5, { index: 1.2, wet: 1 }); epiano(ac, o, t + 0.03, midi(m + 12), 0.06, 1.0, { p: 0.3, wet: 1 }); const g = G(ac, 0); perc(g, t, 0.05, 0.006, 0.35); send(chain(nz(ac, t, t + 0.5), filt(ac, 'bandpass', 3600, 0.7), g), o, 1); thump(ac, o, t, 110, 0.18, 0.1); },
  win(ac, o, t) {
    [[65, 0], [69, 0.13], [72, 0.26], [77, 0.39], [81, 0.55], [84, 0.74]].forEach(([m, d], i) => epiano(ac, o, t + d, midi(m), 0.15, 2.0, { p: -0.5 + 0.2 * i, index: 1.1, wet: 1 }));
    const cy = G(ac, 0); swell(cy, t, 0.07, 0.6, 0.1, 1.6); send(chain(nz(ac, t, t + 2.6), filt(ac, 'bandpass', 3800, 0.5), cy), o, 1);
    for (const [m, p] of [[41, 0], [53, -0.5], [60, 0.5], [65, -0.2], [69, 0.2]]) { const g = G(ac, 0); swell(g, t, 0.075, 0.5, 0.6, 1.8); send(chain(osc(ac, 'sawtooth', midi(m), t, t + 3.1, 7), filt(ac, 'lowpass', 1300), g, pan(ac, p)), o, 1); }
    thump(ac, o, t, 60, 0.3, 0.3);
  },
  lose(ac, o, t) { [[69, 0], [65, 0.17], [62, 0.36]].forEach(([m, d]) => epiano(ac, o, t + d, midi(m), 0.16, 1.1, { index: 1 })); const g = G(ac, 0); perc(g, t + 0.36, 0.22, 0.01, 0.45); chain(osc(ac, 'sine', 62, t + 0.36, t + 1), g).connect(o.dry); },
  start(ac, o, t) { [74, 77, 81].forEach((m, i) => epiano(ac, o, t + i * 0.12, midi(m), 0.16, i === 2 ? 1.1 : 0.5, { p: -0.3 + 0.3 * i })); SFX.whoosh(ac, o, t + 0.05, { up: true }); thump(ac, o, t + 0.24, 70, 0.22, 0.2); },
};
const DUCK = { breach: [0.45, 0.5], crack: [0.5, 0.45], bend: [0.18, 1.4], alarm: [0.4, 0.8], win: [0.3, 2.6], lose: [0.35, 1.6], reveal: [0.55, 1.2], star: [0.6, 0.5], wafer: [0.6, 0.6] };   // score level, hold seconds

/** The effect bus: a shared short room and a hall send, with the top end tamed. */
function sfxBus(ac, dest) {
  const inp = G(ac, 1), room = ac.createConvolver(), hall = ac.createConvolver(), wet = G(ac, 1), tame = filt(ac, 'highshelf', 9000, 0.7, -2);
  room.buffer = impulse(ac, 0.42, 2.0, 0.3); hall.buffer = impulse(ac, 2.1, 2.8, 0.4);
  inp.connect(tame); chain(inp, room, G(ac, 0.34), tame); chain(wet, hall, G(ac, 0.3), tame); tame.connect(dest);
  return { dry: inp, wet };
}

/** Render one effect, a sequence, or the score offline — used by the test scripts. */
export async function renderOffline(what, params = {}, seconds = 2, sr = 44100) {
  if (what === 'music') {
    const stems = {}; for (const k of STEM_NAMES) stems[k] = await renderStem(k, sr);
    const ac = new OfflineAudioContext(2, Math.ceil(LOOP * sr), sr), mix = MOODS[params.mood || 'run'];
    STEM_NAMES.forEach((k, i) => { const s = ac.createBufferSource(); s.buffer = stems[k]; s.connect(G(ac, mix[i] * 0.5)).connect(ac.destination); s.start(0); });
    return ac.startRendering();
  }
  const ac = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr), o = sfxBus(ac, ac.destination);
  if (what === 'seq') for (const [name, at, p] of params.events) SFX[name](ac, o, at, p || {});
  else SFX[what](ac, o, 0.02, params);
  return ac.startRendering();
}

/* ---------------- the live engine ---------------- */
export function createAudio() {
  let ctx = null, master, music, duckG, sfx, voice, out, stemGains = [], started = false, mood = 'off', ready = false, unlockEl = null, voiceSrc = null, lastSlide = 0;
  const saved = (() => { try { return JSON.parse(localStorage.getItem('pcl-audio') || '{}'); } catch { return {}; } })();
  const vol = Object.assign({ music: 0.6, sfx: 0.85, voice: 1, mute: false }, saved);
  const save = () => { try { localStorage.setItem('pcl-audio', JSON.stringify(vol)); } catch {} };
  function apply() {
    if (!ctx) return; const t = ctx.currentTime;
    master.gain.setTargetAtTime(vol.mute ? 0 : 0.95, t, 0.03); music.gain.setTargetAtTime(vol.music * 0.55, t, 0.05); sfx.gain.setTargetAtTime(vol.sfx, t, 0.03); voice.gain.setTargetAtTime(vol.voice * 1.1, t, 0.03);
  }
  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -17; comp.knee.value = 14; comp.ratio.value = 3; comp.attack.value = 0.008; comp.release.value = 0.24;
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -2.5; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.002; lim.release.value = 0.1;
    master = G(ctx, 0.95); chain(master, comp, lim).connect(ctx.destination);
    music = G(ctx, 0); duckG = G(ctx, 1); sfx = G(ctx, 1); voice = G(ctx, 1);
    chain(music, duckG).connect(master); sfx.connect(master); voice.connect(master);
    out = sfxBus(ctx, sfx);
    apply();
  }
  async function unlock() {                          // call from a user gesture
    if (!ctx) build();
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch {} }
    if (!unlockEl) {                                 // keeps iOS in "playback" mode so the ringer switch does not mute the game
      unlockEl = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
      unlockEl.loop = true; unlockEl.playsInline = true; unlockEl.play().catch(() => {});
    }
    if (!started) { started = true; prepareMusic(); }
  }
  async function prepareMusic() {
    const sr = Math.min(ctx.sampleRate, 44100), bufs = [];
    for (const n of STEM_NAMES) bufs.push(await renderStem(n, sr));
    const at = ctx.currentTime + 0.15;
    bufs.forEach((b, i) => { const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; const g = G(ctx, 0); s.connect(g).connect(music); s.start(at); stemGains[i] = g; });
    ready = true; setMood(mood === 'off' ? 'menu' : mood, 2.5);
  }
  function setMood(m, fade = 1.2) {
    mood = m; if (!ready) return;
    const mix = MOODS[m] || MOODS.menu, t = ctx.currentTime;
    stemGains.forEach((g, i) => g.gain.setTargetAtTime(mix[i], t, fade / 3));
  }
  function duck(level, hold) { if (!ctx) return; const t = ctx.currentTime; duckG.gain.cancelScheduledValues(t); duckG.gain.setTargetAtTime(level, t, 0.04); duckG.gain.setTargetAtTime(1, t + hold, 0.35); }
  function play(name, p) {
    if (!ctx || ctx.state !== 'running' || !SFX[name]) return;
    if (name === 'slide') { const now = ctx.currentTime; if (now - lastSlide < 0.05) return; lastSlide = now; }
    try { SFX[name](ctx, out, ctx.currentTime + 0.005, p); if (DUCK[name]) duck(DUCK[name][0], DUCK[name][1]); } catch (e) { /* a sound must never break the game */ }
  }
  const clips = new Map();
  async function say(url) {                          // voice-over with the score held down underneath
    if (!ctx || vol.voice <= 0) return;
    try {
      let buf = clips.get(url);
      if (!buf) { buf = await ctx.decodeAudioData(await (await fetch(url)).arrayBuffer()); clips.set(url, buf); }
      hush();
      const s = ctx.createBufferSource(); s.buffer = buf; s.connect(voice); voiceSrc = s;
      duckG.gain.cancelScheduledValues(ctx.currentTime); duckG.gain.setTargetAtTime(0.32, ctx.currentTime, 0.12);
      s.onended = () => { if (voiceSrc === s) { voiceSrc = null; duckG.gain.setTargetAtTime(1, ctx.currentTime, 0.4); } };
      s.start();
    } catch (e) { /* missing clip: the subtitles still show */ }
  }
  function hush() { if (voiceSrc) { try { voiceSrc.onended = null; voiceSrc.stop(); } catch {} voiceSrc = null; if (ctx) duckG.gain.setTargetAtTime(1, ctx.currentTime, 0.3); } }
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else ctx.resume(); });
  return {
    unlock, play, setMood, say, hush, vol,
    set(k, v) { vol[k] = v; save(); apply(); },
    get ready() { return ready; }, get running() { return !!ctx && ctx.state === 'running'; },
  };
}
