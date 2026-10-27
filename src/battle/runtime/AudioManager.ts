import type { Settings } from '../../utils/storage';

export class AudioManager {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private weaponBus: GainNode | null = null;
  private ambienceBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private ambienceSources: AudioBufferSourceNode[] = [];
  private ambienceOscillators: OscillatorNode[] = [];
  private gunshotBuffer: AudioBuffer | null = null;
  private battleBgBuffer: AudioBuffer | null = null;
  private battleBgSource: AudioBufferSourceNode | null = null;
  private distantTimer: number | null = null;
  private settings: Settings;

  constructor(settings: Settings) {
    this.settings = { ...settings };
  }

  unlock(): void {
    if (!this.context) {
      this.createContext();
    }
    if (this.context && this.context.state === 'suspended') {
      void this.context.resume();
    }
    this.startAmbience();
  }

  setSettings(settings: Settings): void {
    this.settings = { ...settings };
    this.applyVolumes();
  }

  playRifle(): void {
    if (!this.context || !this.weaponBus) return;
    // Primary crack: broadband noise through a lowpass, slightly louder.
    this.noiseBurstOn(0.14, 2200, 0.6, 0, 'lowpass', 0, this.weaponBus);
    // Sharp transient at the muzzle: high-frequency burst.
    this.noiseBurstOn(0.035, 5500, 0.18, 0, 'highpass', 0, this.weaponBus);
    // Body thump: low oscillator punch.
    this.thumpOn(120, 50, 0.06, 0.22, 0, 0, this.weaponBus);
    // Sub-bass slam for close-range impact.
    this.thumpOn(65, 30, 0.1, 0.12, 0, 0.005, this.weaponBus);
  }

  playDistantShot(pan = 0): void {
    if (this.playGunshotSample(pan, 0.17)) return;
    this.noiseBurst(0.1, 820, 0.16, pan, 'lowpass');
    if (Math.random() < 0.35) {
      this.noiseBurst(0.08, 1600, 0.08, pan * 0.8, 'bandpass', 0.06);
    }
  }

  playRicochet(): void {
    const ctx = this.context;
    if (!ctx || !this.sfxBus) return;
    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(1600 + Math.random() * 600, now);
    oscillator.frequency.exponentialRampToValueAtTime(3200, now + 0.08);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    panner.pan.value = (Math.random() - 0.5) * 0.7;
    oscillator.connect(gain).connect(panner).connect(this.sfxBus);
    oscillator.start(now);
    oscillator.stop(now + 0.1);
  }

  playExplosion(): void {
    this.noiseBurst(0.75, 280, 0.7, (Math.random() - 0.5) * 0.4, 'lowpass');
    this.thump(72, 26, 0.7, 0.3);
  }

  playDamage(): void {
    this.thump(96, 44, 0.3, 0.22);
    this.noiseBurst(0.16, 360, 0.16, (Math.random() - 0.5) * 0.2, 'lowpass');
    this.tone(170, 0.12, 0.035, 0.02);
  }

  playFall(): void {
    this.noiseBurst(0.8, 1100, 0.22, 0, 'highpass');
    this.thump(82, 28, 0.5, 0.2, 0, 0.18);
  }

  playFootstep(): void {
    this.noiseBurst(0.07, 620, 0.08, (Math.random() - 0.5) * 0.2, 'lowpass');
  }

  playUi(): void {
    this.tone(520, 0.05, 0.035);
  }

  playHorn(): void {
    this.tone(196, 0.55, 0.07);
    this.tone(294, 0.6, 0.06, 0.12);
    this.tone(392, 0.8, 0.055, 0.26);
  }

  playVictory(): void {
    const notes = [261.63, 329.63, 392, 523.25];
    notes.forEach((frequency, index) => {
      this.tone(frequency, 1.2, 0.055, index * 0.13);
    });
  }

  startAmbience(): void {
    const ctx = this.context;
    if (!ctx || !this.noiseBuffer || !this.ambienceBus || this.ambienceSources.length > 0) {
      return;
    }

    this.startNoiseLoop('lowpass', 95, 0.55);
    this.startNoiseLoop('bandpass', 430, 0.24);
    this.startNoiseLoop('highpass', 1150, 0.055);

    // Slow swell in the low rumble, like distant battle pressure.
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const rumbleGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 0.18;
    rumbleGain.gain.value = 0.45;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 70;
    source.connect(filter).connect(rumbleGain).connect(this.ambienceBus);
    lfo.connect(lfoGain).connect(rumbleGain.gain);
    source.start();
    lfo.start();
    this.ambienceSources.push(source);
    this.ambienceOscillators.push(lfo);

    this.scheduleDistantBattle();
  }

  dispose(): void {
    if (this.distantTimer !== null) {
      window.clearTimeout(this.distantTimer);
      this.distantTimer = null;
    }
    for (const source of this.ambienceSources) {
      try {
        source.stop();
      } catch {
        // Already stopped.
      }
      source.disconnect();
    }
    this.ambienceSources = [];
    if (this.battleBgSource) {
      try {
        this.battleBgSource.stop();
      } catch {
        // Already stopped.
      }
      this.battleBgSource.disconnect();
      this.battleBgSource = null;
    }
    for (const oscillator of this.ambienceOscillators) {
      try {
        oscillator.stop();
      } catch {
        // Already stopped.
      }
      oscillator.disconnect();
    }
    this.ambienceOscillators = [];
    if (this.context) {
      void this.context.close();
      this.context = null;
    }
    this.master = null;
    this.sfxBus = null;
    this.weaponBus = null;
    this.ambienceBus = null;
    this.noiseBuffer = null;
    this.gunshotBuffer = null;
    this.battleBgBuffer = null;
  }

  private createContext(): void {
    const AudioCtor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;

    try {
      const context = new AudioCtor();
      const master = context.createGain();
      master.connect(context.destination);
      const sfx = context.createGain();
      sfx.connect(master);
      const weapon = context.createGain();
      weapon.connect(sfx);
      const ambience = context.createGain();
      ambience.connect(master);

      this.context = context;
      this.master = master;
      this.sfxBus = sfx;
      this.weaponBus = weapon;
      this.ambienceBus = ambience;
      this.noiseBuffer = this.createNoiseBuffer(context);
      this.applyVolumes();
      void this.loadGunshotSample(context);
      void this.loadBattleBgSample(context);
      this.startAmbience();
    } catch {
      this.context = null;
    }
  }

  private applyVolumes(): void {
    if (!this.context) return;
    const now = this.context.currentTime;
    const masterValue = Math.max(0, Math.min(1, this.settings.masterVolume));
    const sfxValue = Math.max(0, Math.min(1, this.settings.sfxVolume));

    this.master?.gain.setTargetAtTime(masterValue, now, 0.05);
    this.sfxBus?.gain.setTargetAtTime(sfxValue, now, 0.08);
    this.ambienceBus?.gain.setTargetAtTime(sfxValue * 0.5, now, 0.1);
  }

  private createNoiseBuffer(context: AudioContext): AudioBuffer {
    const length = Math.floor(context.sampleRate * 3);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.985 + white * 0.015;
      data[i] = last * 3.2;
    }
    return buffer;
  }

  private startNoiseLoop(
    filterType: BiquadFilterType,
    frequency: number,
    volume: number,
  ): void {
    const ctx = this.context;
    if (!ctx || !this.noiseBuffer || !this.ambienceBus) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = filterType === 'bandpass' ? 0.55 : 0.8;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    source.connect(filter).connect(gain).connect(this.ambienceBus);
    source.start();
    this.ambienceSources.push(source);
  }

  private scheduleDistantBattle(): void {
    if (this.distantTimer !== null) {
      window.clearTimeout(this.distantTimer);
    }
    const delay = 1800 + Math.random() * 4200;
    this.distantTimer = window.setTimeout(() => {
      if (!this.context) return;
      this.playDistantArtillery();
      if (Math.random() < 0.7) {
        this.playDistantGunfire();
      }
      this.scheduleDistantBattle();
    }, delay);
  }

  private playDistantArtillery(): void {
    const pan = (Math.random() - 0.5) * 1.4;
    this.noiseBurst(1.2, 115, 0.34, pan, 'lowpass');
    this.thump(46, 24, 0.85, 0.14, pan);
  }

  private playDistantGunfire(): void {
    const pan = (Math.random() - 0.5) * 1.4;
    const bursts = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < bursts; i += 1) {
      if (!this.playGunshotSample(pan, 0.12, i * 0.13)) {
        this.noiseBurst(0.075, 950, 0.075, pan, 'bandpass', i * 0.13);
      }
    }
  }

  private async loadGunshotSample(context: AudioContext): Promise<void> {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}assets/audio/guns.mp3`);
      if (!response.ok) return;
      const data = await response.arrayBuffer();
      const buffer = await context.decodeAudioData(data);
      if (this.context === context) {
        this.gunshotBuffer = buffer;
      }
    } catch {
      // The layered procedural gunfire remains available as a fallback.
    }
  }

  private async loadBattleBgSample(context: AudioContext): Promise<void> {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}assets/audio/battle background noise.mp3`);
      if (!response.ok) return;
      const data = await response.arrayBuffer();
      const buffer = await context.decodeAudioData(data);
      if (this.context === context) {
        this.battleBgBuffer = buffer;
        this.startBattleBg(buffer);
      }
    } catch {
      // No battle background audio available; rely on procedural ambience.
    }
  }

  private startBattleBg(buffer: AudioBuffer): void {
    const ctx = this.context;
    if (!ctx || !this.ambienceBus || this.battleBgSource) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = 0.35;
    source.connect(gain).connect(this.ambienceBus);
    source.start();
    this.battleBgSource = source;
  }

  private playGunshotSample(pan: number, volume: number, delay = 0): boolean {
    const ctx = this.context;
    if (!ctx || !this.gunshotBuffer || !this.sfxBus) return false;

    const now = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = this.gunshotBuffer;
    source.playbackRate.value = 0.9 + Math.random() * 0.2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(gain).connect(panner).connect(this.sfxBus);

    const maxOffset = Math.max(0, this.gunshotBuffer.duration - 0.65);
    source.start(now, Math.random() * maxOffset);
    source.stop(now + 0.6);
    return true;
  }

  private noiseBurst(
    duration: number,
    cutoff: number,
    volume: number,
    pan = 0,
    filterType: BiquadFilterType = 'lowpass',
    delay = 0,
  ): void {
    if (!this.sfxBus) return;
    this.noiseBurstOn(duration, cutoff, volume, pan, filterType, delay, this.sfxBus);
  }

  private noiseBurstOn(
    duration: number,
    cutoff: number,
    volume: number,
    pan: number,
    filterType: BiquadFilterType,
    delay: number,
    target: GainNode,
  ): void {
    const ctx = this.context;
    if (!ctx || !this.noiseBuffer) return;
    const now = ctx.currentTime + delay;
    const source = ctx.createBufferSource();
    source.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = cutoff;
    filter.Q.value = filterType === 'bandpass' ? 1.2 : 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    source.connect(filter).connect(gain).connect(panner).connect(target);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  private thump(
    startFrequency: number,
    endFrequency: number,
    duration: number,
    volume: number,
    pan = 0,
    delay = 0,
  ): void {
    if (!this.sfxBus) return;
    this.thumpOn(startFrequency, endFrequency, duration, volume, pan, delay, this.sfxBus);
  }

  private thumpOn(
    startFrequency: number,
    endFrequency: number,
    duration: number,
    volume: number,
    pan: number,
    delay: number,
    target: GainNode,
  ): void {
    const ctx = this.context;
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(startFrequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    oscillator.connect(gain).connect(panner).connect(target);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  private tone(frequency: number, duration: number, volume: number, delay = 0): void {
    const ctx = this.context;
    if (!ctx || !this.sfxBus) return;
    const now = ctx.currentTime + delay;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.sfxBus);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }
}
