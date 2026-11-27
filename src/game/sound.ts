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

// Upbeat space-station synth arpeggio notes (Hz)
const NORMAL_MELODY_HZ = [
  523.25, 659.25, 783.99, 659.25,
  587.33, 783.99, 880.0,  783.99,
  493.88, 659.25, 783.99, 659.25,
  440.0,  587.33, 659.25, 523.25,
];

const NORMAL_BASS_HZ = [
  130.81, 130.81, 196.0, 130.81,
  146.83, 146.83, 220.0, 146.83,
  123.47, 123.47, 196.0, 123.47,
  110.0,  110.0,  164.81, 130.81,
];

// High-energy Fever track (transposed up + energetic octave jumps)
const FEVER_MELODY_HZ = [
  659.25, 783.99, 987.77, 1318.51,
  987.77, 1174.66, 1318.51, 1567.98,
  783.99, 987.77, 1174.66, 1567.98,
  1318.51, 1174.66, 987.77, 1046.5,
];

const FEVER_BASS_HZ = [
  164.81, 329.63, 196.0, 392.0,
  185.0,  369.99, 220.0, 440.0,
  196.0,  392.0,  246.94, 493.88,
  220.0,  440.0,  261.63, 392.0,
];

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private bgmGain: GainNode | null = null;
  private muted: boolean = false;

  private bgmRunning = false;
  private bgmMode: 'normal' | 'fever' = 'normal';
  private bgmWave: 1 | 2 | 3 = 1;
  private bgmStep = 0;
  private bgmTimer: number | null = null;

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

  public isBgmActive(): boolean {
    return this.bgmRunning && !this.muted;
  }

  public getAudioState(): string {
    if (this.muted) return 'muted';
    return this.ctx?.state ?? 'uninitialized';
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

    if (this.masterGain && this.ctx) {
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(next ? 0.0001 : 0.88, now, 0.02);
    }

    if (next) {
      this.clearBgmTimer();
    } else {
      this.unlock();
      if (this.bgmRunning) {
        this.scheduleNextBgmTick();
      }
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    if (!this.muted) {
      this.playPickup();
    }
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0.0001 : 0.88;
      this.masterGain.connect(this.ctx.destination);

      this.bgmGain = this.ctx.createGain();
      this.bgmGain.gain.value = 0.24;
      this.bgmGain.connect(this.masterGain);
    }
    return this.ctx;
  }

  public unlock(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0.0001 : 0.88;
    }

    if (ctx.state === 'suspended') {
      ctx
        .resume()
        .then(() => {
          if (this.bgmRunning && !this.muted && this.bgmTimer === null) {
            this.scheduleNextBgmTick();
          }
        })
        .catch(() => {});
    }
  }

  // --- Procedural Web Audio BGM Sequencer ---

  public startBgm(wave: 1 | 2 | 3 = 1, mode: 'normal' | 'fever' = 'normal'): void {
    this.bgmWave = wave;
    this.bgmMode = mode;
    this.bgmRunning = true;
    this.unlock();
    if (!this.muted && this.bgmTimer === null) {
      this.scheduleNextBgmTick();
    }
  }

  public stopBgm(): void {
    this.bgmRunning = false;
    this.clearBgmTimer();
  }

  public setBgmWave(wave: 1 | 2 | 3): void {
    this.bgmWave = wave;
  }

  public setBgmMode(mode: 'normal' | 'fever'): void {
    if (this.bgmMode === mode) return;
    this.bgmMode = mode;
    if (this.bgmGain && this.ctx) {
      this.bgmGain.gain.setTargetAtTime(mode === 'fever' ? 0.3 : 0.24, this.ctx.currentTime, 0.04);
    }
  }

  private clearBgmTimer(): void {
    if (this.bgmTimer !== null) {
      window.clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  private getBgmStepMs(): number {
    if (this.bgmMode === 'fever') return 102; // ~147 BPM energetic 16th-feel pulse
    if (this.bgmWave === 3) return 126;
    if (this.bgmWave === 2) return 138;
    return 152; // ~118 BPM breezy space groove
  }

  private scheduleNextBgmTick(): void {
    this.clearBgmTimer();
    if (!this.bgmRunning || this.muted || typeof window === 'undefined') return;

    this.playBgmStep();
    const stepMs = this.getBgmStepMs();
    this.bgmTimer = window.setTimeout(() => {
      this.bgmTimer = null;
      this.scheduleNextBgmTick();
    }, stepMs);
  }

  private playBgmStep(): void {
    if (this.muted || !this.bgmRunning) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.bgmGain) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
      return;
    }

    const idx = this.bgmStep % 16;
    const isFever = this.bgmMode === 'fever';
    const melody = isFever ? FEVER_MELODY_HZ : NORMAL_MELODY_HZ;
    const bass = isFever ? FEVER_BASS_HZ : NORMAL_BASS_HZ;
    const stepSec = this.getBgmStepMs() / 1000;
    const now = ctx.currentTime + 0.01;

    // Lead star-pluck note
    const leadFreq = melody[idx];
    this.scheduleNode(ctx, this.bgmGain, leadFreq, stepSec * (isFever ? 0.78 : 0.65), isFever ? 'sawtooth' : 'triangle', isFever ? 0.17 : 0.14, now);

    // Bass pulse every 2 steps (or every step in Fever!)
    if (isFever || idx % 2 === 0) {
      const bassFreq = bass[idx];
      this.scheduleNode(ctx, this.bgmGain, bassFreq, stepSec * 1.15, 'triangle', isFever ? 0.24 : 0.2, now);
    }

    // Crisp offbeat hi-hat tick for groove
    if (idx % 4 === 2 || (isFever && idx % 2 === 1)) {
      this.scheduleNode(ctx, this.bgmGain, isFever ? 4200 : 3200, 0.025, 'square', 0.032, now);
    }

    this.bgmStep = (this.bgmStep + 1) % 16;
  }

  private scheduleNode(
    ctx: AudioContext,
    dest: AudioNode,
    freq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    startTime: number,
    slideToFreq?: number
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    if (slideToFreq !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideToFreq), startTime + duration);
    }

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + Math.min(0.012, duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(dest);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
    slideToFreq?: number
  ): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    const fire = () => {
      if (this.muted || !this.ctx || !this.masterGain) return;
      const startTime = this.ctx.currentTime + delay;
      this.scheduleNode(this.ctx, this.masterGain, freq, duration, type, volume, startTime, slideToFreq);
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(fire).catch(() => {});
    } else {
      fire();
    }
  }

  // --- Gameplay SFX ---

  public playPickup(): void {
    const jitter = 0.96 + Math.random() * 0.08;
    this.tone(420 * jitter, 0.075, 'sine', 0.11, 0, 580 * jitter);
  }

  public playSlotIn(combo: number, isRainbow: boolean, isGolden5x = false): void {
    const idx = Math.min(Math.max(0, combo - 1), COMBO_SCALE_HZ.length - 1);
    const base = COMBO_SCALE_HZ[idx];
    this.tone(base, 0.14, 'triangle', 0.15);
    this.tone(base * 1.5, 0.11, 'sine', 0.08, 0.02);
    if (isRainbow) {
      this.tone(base * 2, 0.18, 'sine', 0.1, 0.045, base * 2.5);
    }
    if (isGolden5x) {
      this.tone(1046.5, 0.14, 'triangle', 0.13, 0.03);
      this.tone(1318.51, 0.18, 'sine', 0.12, 0.07);
      this.tone(1567.98, 0.24, 'sine', 0.12, 0.11);
    }
  }

  public playPackLaunch(combo: number, count: number): void {
    const idx = Math.min(Math.max(0, combo - 1), COMBO_SCALE_HZ.length - 4);
    const root = COMBO_SCALE_HZ[idx];
    const third = COMBO_SCALE_HZ[Math.min(idx + 2, COMBO_SCALE_HZ.length - 1)];
    const fifth = COMBO_SCALE_HZ[Math.min(idx + 4, COMBO_SCALE_HZ.length - 1)];
    const octave = root * 2;

    this.tone(root, 0.24, 'triangle', 0.16, 0);
    this.tone(third, 0.24, 'triangle', 0.15, 0.045);
    this.tone(fifth, 0.28, 'sine', 0.15, 0.09);
    this.tone(octave, 0.36, 'sine', 0.14, 0.13);

    if (count >= 4) {
      this.tone(fifth * 2, 0.35, 'sine', 0.11, 0.16, octave * 1.5);
    }
    if (count >= 5) {
      this.tone(octave * 1.5, 0.42, 'triangle', 0.12, 0.2);
    }
  }

  public playRainbowChain(): void {
    this.tone(659.25, 0.18, 'triangle', 0.16, 0);
    this.tone(880.0, 0.2, 'triangle', 0.15, 0.05);
    this.tone(1174.66, 0.24, 'sine', 0.15, 0.1);
    this.tone(1567.98, 0.36, 'sine', 0.16, 0.15);
  }

  public playFeverStart(): void {
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51];
    notes.forEach((f, i) => {
      this.tone(f, 0.24, i < 3 ? 'sawtooth' : 'triangle', 0.13, i * 0.055);
    });
  }

  public playVipComplete(): void {
    this.tone(783.99, 0.18, 'triangle', 0.16, 0);
    this.tone(987.77, 0.2, 'triangle', 0.16, 0.07);
    this.tone(1174.66, 0.22, 'triangle', 0.16, 0.14);
    this.tone(1567.98, 0.42, 'sine', 0.18, 0.21);
  }

  public playSlowmoActivate(): void {
    this.tone(920, 0.28, 'sine', 0.14, 0, 340);
    this.tone(680, 0.34, 'triangle', 0.11, 0.05, 260);
  }

  public playMissionComplete(): void {
    this.tone(587.33, 0.16, 'triangle', 0.14, 0);
    this.tone(880.0, 0.2, 'triangle', 0.14, 0.08);
    this.tone(1174.66, 0.34, 'sine', 0.16, 0.16);
  }

  public playBlackholeSpawn(): void {
    this.tone(155, 0.22, 'sawtooth', 0.06, 0, 92);
    this.tone(210, 0.18, 'sine', 0.055, 0.05, 130);
  }

  public playBlackholeZap(combo: number): void {
    const idx = Math.min(Math.max(0, combo), COMBO_SCALE_HZ.length - 1);
    const pitch = COMBO_SCALE_HZ[idx];
    this.tone(860, 0.09, 'square', 0.07, 0, 320);
    this.tone(pitch, 0.2, 'triangle', 0.14, 0.03, pitch * 1.25);
    this.tone(pitch * 2, 0.18, 'sine', 0.09, 0.06);
  }

  public playBlackholeSuck(): void {
    this.tone(240, 0.42, 'sawtooth', 0.13, 0, 56);
    this.tone(140, 0.46, 'triangle', 0.15, 0.04, 42);
  }

  public playReject(): void {
    this.tone(185, 0.14, 'sawtooth', 0.08, 0, 125);
  }

  public playMiss(): void {
    this.tone(230, 0.18, 'triangle', 0.09, 0, 140);
  }

  public playWaveUp(wave: 2 | 3): void {
    const shift = wave === 3 ? 1.18 : 1.0;
    this.tone(523.25 * shift, 0.18, 'triangle', 0.14, 0);
    this.tone(659.25 * shift, 0.18, 'triangle', 0.14, 0.08);
    this.tone(783.99 * shift, 0.22, 'triangle', 0.15, 0.16);
    this.tone(1046.5 * shift, 0.36, 'sine', 0.16, 0.24);
  }

  public playCountdownTick(urgent: boolean): void {
    this.tone(urgent ? 980 : 740, 0.07, 'sine', urgent ? 0.11 : 0.08);
  }

  public playRoundEnd(): void {
    this.tone(523.25, 0.24, 'triangle', 0.14, 0);
    this.tone(659.25, 0.24, 'triangle', 0.14, 0.09);
    this.tone(783.99, 0.28, 'triangle', 0.14, 0.18);
    this.tone(1046.5, 0.52, 'sine', 0.16, 0.27);
  }
}
