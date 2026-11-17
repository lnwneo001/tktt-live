'use strict';
/* Audio analysis engine.
   Routing (exactly ONE audible path, so no doubled/echoed audio):
     MediaStream -> MediaStreamAudioSourceNode -+-> AnalyserNode (analysis only, no output)
                                                 +-> GainNode (volume) -> destination
   The captured tab is silenced by Chrome while captured (tabCapture / suppressLocalAudioPlayback),
   so this single path replaces the tab's own output instead of adding to it.
   A tiny AudioWorklet acts as a clock on the audio thread so analysis keeps running when the
   page is hidden (timers in background pages are throttled by Chrome). */
class TKTTAudioEngine {
  constructor({ onFrame, onState, playThrough = true }) {
    this.onFrame = onFrame || (() => {});
    this.onState = onState || (() => {});
    this.playThrough = playThrough;
    this.ctx = null; this.stream = null; this.src = null; this.analyser = null; this.gain = null;
    this.ticker = null; this.timer = null; this.freq = null; this.time = null;
    this.lastFrameAt = 0; this.silentSince = 0; this.volume = 1;
    this.bandRanges = null;
  }

  get running() { return !!this.ctx; }

  async start(stream, { volume = 1 } = {}) {
    await this.stop(true);
    if (!stream || !stream.getAudioTracks().length) throw new Error('ไม่มีแทร็กเสียงในสตรีมที่ได้รับ');
    this.stream = stream;
    this.volume = volume;
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    this.ctx = ctx;
    if (ctx.state !== 'running') { try { await ctx.resume(); } catch (_) {} }
    this.src = ctx.createMediaStreamSource(stream);
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 4096;
    this.analyser.smoothingTimeConstant = 0.5;
    this.analyser.minDecibels = -92;
    this.analyser.maxDecibels = -18;
    this.src.connect(this.analyser);
    if (this.playThrough) {
      this.gain = ctx.createGain();
      this.gain.gain.value = volume;
      this.src.connect(this.gain).connect(ctx.destination);
    }
    this.freq = new Uint8Array(this.analyser.frequencyBinCount);
    this.time = new Float32Array(this.analyser.fftSize);
    this.bandRanges = this.makeBands(ctx.sampleRate, this.analyser.frequencyBinCount);
    for (const t of stream.getTracks()) t.addEventListener('ended', () => this.stop(false, 'แหล่งเสียงหยุดส่งข้อมูล (แท็บถูกปิดหรือหยุดแชร์)'), { once: true });
    await this.startClock();
    this.onState({ status: 'capturing', sampleRate: ctx.sampleRate, baseLatency: ctx.baseLatency || 0, outputLatency: ctx.outputLatency || 0 });
  }

  async startClock() {
    const ctx = this.ctx;
    try {
      const url = (typeof chrome !== 'undefined' && chrome.runtime?.getURL) ? chrome.runtime.getURL('shared/tick-worklet.js') : 'shared/tick-worklet.js';
      await ctx.audioWorklet.addModule(url);
      const node = new AudioWorkletNode(ctx, 'tktt-tick', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      const mute = ctx.createGain(); mute.gain.value = 0;   // keeps node pulled, outputs silence
      this.src.connect(node); node.connect(mute).connect(ctx.destination);
      node.port.onmessage = () => this.sample();
      this.ticker = { node, mute };
    } catch (e) {
      // Fallback: timer clock (may be throttled when hidden)
      this.timer = setInterval(() => this.sample(), 33);
    }
  }

  makeBands(sampleRate, bins) {
    const N = TKTT.EQ_BANDS, lo = 35, hi = 16000, binHz = sampleRate / 2 / bins, out = [];
    for (let i = 0; i < N; i++) {
      const f0 = lo * Math.pow(hi / lo, i / N), f1 = lo * Math.pow(hi / lo, (i + 1) / N);
      const a = Math.max(1, Math.floor(f0 / binHz)), b = Math.min(bins - 1, Math.max(a, Math.ceil(f1 / binHz)));
      out.push([a, b, (f0 + f1) / 2]);
    }
    return out;
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1.5, Number(v) || 0));
    if (this.gain && this.ctx) this.gain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.03);
  }

  sample() {
    if (!this.analyser) return;
    const now = performance.now();
    if (now - this.lastFrameAt < 28) return; // ~35 fps max
    this.lastFrameAt = now;
    this.analyser.getByteFrequencyData(this.freq);
    this.analyser.getFloatTimeDomainData(this.time);
    let sum = 0, peak = 0;
    for (let i = 0; i < this.time.length; i++) { const v = this.time[i]; sum += v * v; const a = Math.abs(v); if (a > peak) peak = a; }
    const rms = Math.sqrt(sum / this.time.length);
    const db = rms > 0 ? 20 * Math.log10(rms) : -120;
    const bands = new Array(TKTT.EQ_BANDS);
    for (let i = 0; i < this.bandRanges.length; i++) {
      const [a, b, fc] = this.bandRanges[i];
      let mx = 0, s = 0, n = 0;
      for (let j = a; j <= b; j++) { const v = this.freq[j] / 255; if (v > mx) mx = v; s += v; n++; }
      // gentle tilt so highs are visible (music energy falls with frequency)
      const tilt = 0.86 + 0.32 * Math.min(1, Math.log10(fc / 35) / Math.log10(16000 / 35));
      const v = (mx * 0.6 + (s / n) * 0.4) * tilt;
      bands[i] = Math.round(Math.max(0, Math.min(1, (v - 0.04) / 0.92)) * 1000) / 1000;
    }
    const avg = (from, to) => { let s = 0; for (let i = from; i < to; i++) s += bands[i]; return s / (to - from); };
    const silent = db < -62;
    if (silent) { if (!this.silentSince) this.silentSince = Date.now(); } else this.silentSince = 0;
    this.onFrame({
      type: 'eq', at: Date.now(), bands,
      bass: avg(0, 10), mid: avg(10, 24), high: avg(24, 36),
      rmsDb: Math.round(db * 10) / 10, peak: Math.round(peak * 1000) / 1000,
      silentMs: this.silentSince ? Date.now() - this.silentSince : 0
    });
  }

  async stop(silent = false, reason = '') {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.ticker) { try { this.ticker.node.port.onmessage = null; this.ticker.node.disconnect(); } catch (_) {} this.ticker = null; }
    if (this.stream) { for (const t of this.stream.getTracks()) { try { t.stop(); } catch (_) {} } this.stream = null; }
    if (this.ctx) { try { await this.ctx.close(); } catch (_) {} }
    this.ctx = null; this.src = null; this.analyser = null; this.gain = null;
    if (!silent) this.onState({ status: reason ? 'ended' : 'idle', error: reason });
  }
}
if (typeof self !== 'undefined') self.TKTTAudioEngine = TKTTAudioEngine;
