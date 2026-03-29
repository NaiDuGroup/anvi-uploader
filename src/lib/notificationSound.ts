let audioCtx: AudioContext | null = null;

export function playNotificationSound() {
  try {
    if (!audioCtx) {
      audioCtx = new AudioContext();
    }

    const ctx = audioCtx;

    // Two-tone "ding" — pleasant, short, not annoying
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

    const osc1 = ctx.createOscillator();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now); // A5
    osc1.frequency.setValueAtTime(1108, now + 0.08); // C#6
    osc1.connect(gain);
    osc1.start(now);
    osc1.stop(now + 0.6);

    const gain2 = ctx.createGain();
    gain2.connect(ctx.destination);
    gain2.gain.setValueAtTime(0, now);
    gain2.gain.setValueAtTime(0.1, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.5);

    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1318, now + 0.08); // E6
    osc2.connect(gain2);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.5);
  } catch {
    // Audio API not available — silently ignore
  }
}
