// Audio-thread clock: posts a tick roughly every 1024 frames (~21 ms at 48 kHz).
// Produces silence; used only so analysis does not depend on throttled page timers.
class TKTTTick extends AudioWorkletProcessor {
  constructor() { super(); this.n = 0; }
  process(inputs, outputs) {
    this.n += 128;
    if (this.n >= 1024) { this.n = 0; this.port.postMessage(0); }
    const out = outputs[0];
    if (out) for (const ch of out) ch.fill(0);
    return true;
  }
}
registerProcessor('tktt-tick', TKTTTick);
