const MUTE_KEY = 'stardust_express_muted_v1';

// Ascending C-major / Lydian pentatonic frequencies spanning 2.5 octaves for addictive combo rise
const COMBO_SCALE_HZ = [
  329.63, // E4
  392.0,  // G4
  440.0,  // A4
  493.88, // B4
  523.25, // C5
  587.33, // D5
  659.25, // E5
  739.99, // F#5 (Lydian sparkle)
  783.99, // G5
  880.0,  // A5
  987.77, // B5
  1046.5, // C6
  1174.66,// D6
  1318.51,// E6
  1479.98,// F#6
  1567.98,// G6
];

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted: boolean = false;

  constructor() {
    try {
      this.muted = typeof window !== 'undefined' && window.localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(next: boolean): void {
    this.muted = next;
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(MUTE_KEY, next ? '1' : '0');
      }
    } catch {
      // ignore storage errors
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    if (!this.muted) {
      this.playPickup();
    }
    return this.muted;
  }

  public unlock(): void {
    if (this.muted || typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  private getCtx(): AudioContext | null {
    if (this.muted) return null;
    if (!this.ctx) this.unlock();
    if (!this.ctx || this.ctx.state === 'suspended') return null;
    return this.ctx;
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
    slideToFreq?: number
  ): void {
    const ctx = this.getCtx();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideToFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideToFreq), now + duration);
    }

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume, now + Math.min(0.014, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playPickup(): void {
    const jitter = 0.96 + Math.random() * 0.08;
    this.tone(420 * jitter, 0.075, 'sine', 0.09, 0, 580 * jitter);
  }

  public playSlotIn(combo: number, isRainbow: boolean): void {
    const idx = Math.min(Math.max(0, combo - 1), COMBO_SCALE_HZ.length - 1);
    const base = COMBO_SCALE_HZ[idx];
    this.tone(base, 0.14, 'triangle', 0.13);
    this.tone(base * 1.5, 0.11, 'sine', 0.06, 0.02);
    if (isRainbow) {
      this.tone(base * 2, 0.18, 'sine', 0.08, 0.045, base * 2.5);
    }
  }

  public playPackLaunch(combo: number, count: number): void {
    const idx = Math.min(Math.max(0, combo - 1), COMBO_SCALE_HZ.length - 4);
    const root = COMBO_SCALE_HZ[idx];
    const third = COMBO_SCALE_HZ[Math.min(idx + 2, COMBO_SCALE_HZ.length - 1)];
    const fifth = COMBO_SCALE_HZ[Math.min(idx + 4, COMBO_SCALE_HZ.length - 1)];
    const octave = root * 2;

    // Bright celestial chime arpeggio that rises with combo
    this.tone(root, 0.24, 'triangle', 0.15, 0);
    this.tone(third, 0.24, 'triangle', 0.14, 0.045);
    this.tone(fifth, 0.28, 'sine', 0.14, 0.09);
    this.tone(octave, 0.36, 'sine', 0.12, 0.13);

    // Extra shimmer for 4+ overcharge
    if (count >= 4) {
      this.tone(fifth * 2, 0.35, 'sine', 0.1, 0.16, octave * 1.5);
    }
    if (count >= 5) {
      this.tone(octave * 1.5, 0.42, 'triangle', 0.11, 0.2);
    }
  }

  public playBlackholeSpawn(): void {
    this.tone(155, 0.22, 'sawtooth', 0.055, 0, 92);
    this.tone(210, 0.18, 'sine', 0.05, 0.05, 130);
  }

  public playBlackholeZap(combo: number): void {
    const idx = Math.min(Math.max(0, combo), COMBO_SCALE_HZ.length - 1);
    const pitch = COMBO_SCALE_HZ[idx];
    this.tone(860, 0.09, 'square', 0.06, 0, 320);
    this.tone(pitch, 0.2, 'triangle', 0.13, 0.03, pitch * 1.25);
    this.tone(pitch * 2, 0.18, 'sine', 0.08, 0.06);
  }

  public playBlackholeSuck(): void {
    this.tone(240, 0.45, 'sawtooth', 0.12, 0, 48);
    this.tone(140, 0.5, 'triangle', 0.15, 0.04, 36);
  }

  public playReject(): void {
    this.tone(185, 0.14, 'sawtooth', 0.07, 0, 125);
  }

  public playMiss(): void {
    this.tone(230, 0.16, 'triangle', 0.07, 0, 150);
  }

  public playWaveUp(wave: 2 | 3): void {
    const shift = wave === 3 ? 1.18 : 1.0;
    this.tone(523.25 * shift, 0.18, 'triangle', 0.13, 0);
    this.tone(659.25 * shift, 0.18, 'triangle', 0.13, 0.08);
    this.tone(783.99 * shift, 0.22, 'triangle', 0.14, 0.16);
    this.tone(1046.5 * shift, 0.36, 'sine', 0.15, 0.24);
  }

  public playCountdownTick(urgent: boolean): void {
    this.tone(urgent ? 980 : 740, 0.07, 'sine', urgent ? 0.1 : 0.07);
  }

  public playRoundEnd(): void {
    this.tone(523.25, 0.24, 'triangle', 0.13, 0);
    this.tone(659.25, 0.24, 'triangle', 0.13, 0.09);
    this.tone(783.99, 0.28, 'triangle', 0.13, 0.18);
    this.tone(1046.5, 0.52, 'sine', 0.15, 0.27);
  }
}
