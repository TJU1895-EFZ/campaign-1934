const MUTE_KEY = 'campaign1934.audio.muted';

export class ShellAudio {
  private readonly music = new Audio(`${import.meta.env.BASE_URL}assets/audio/bgm_battle.mp3`);
  private context: AudioContext | null = null;
  private fadeTimer: number | null = null;
  private lastHoverAt = -Infinity;
  private shellActive = false;
  private unlocked = false;
  private muted = localStorage.getItem(MUTE_KEY) === '1';

  constructor() {
    this.music.loop = true;
    this.music.preload = 'auto';
    this.music.volume = 0;
    document.addEventListener('pointerdown', this.unlock, { once: true });
    document.addEventListener('keydown', this.unlock, { once: true });
  }

  enterShell(): void {
    this.shellActive = true;
    if (this.unlocked) this.fadeTo(this.muted ? 0 : 0.28, 2000);
  }

  leaveShell(): void {
    this.shellActive = false;
    this.fadeTo(0, 2000, true);
  }

  isMuted(): boolean {
    return this.muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0');
    this.fadeTo(this.muted ? 0 : 0.28, 120);
    return this.muted;
  }

  playCardHover(available: boolean): void {
    const now = performance.now();
    if (!this.unlocked || this.muted || now - this.lastHoverAt < 200) return;
    this.lastHoverAt = now;
    const context = this.getContext();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = available ? 'sine' : 'triangle';
    oscillator.frequency.setValueAtTime(available ? 760 : 165, context.currentTime);
    gain.gain.setValueAtTime(0.045, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.2);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
  }

  private unlock = (): void => {
    this.unlocked = true;
    const context = this.getContext();
    if (context?.state === 'suspended') void context.resume();
    if (this.shellActive && !this.muted && import.meta.env.MODE !== 'test') {
      const started = this.music.play();
      if (started) void started.catch(() => undefined);
      this.fadeTo(0.28, 2000);
    }
  };

  private getContext(): AudioContext | null {
    const AudioContextType = window.AudioContext;
    if (!AudioContextType) return null;
    this.context ??= new AudioContextType();
    return this.context;
  }

  private fadeTo(target: number, durationMs: number, release = false): void {
    if (this.fadeTimer !== null) window.clearInterval(this.fadeTimer);
    if (target > 0 && this.music.paused && import.meta.env.MODE !== 'test') {
      const started = this.music.play();
      if (started) void started.catch(() => undefined);
    }
    const from = this.music.volume;
    const startedAt = performance.now();
    this.fadeTimer = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / Math.max(1, durationMs));
      this.music.volume = from + (target - from) * progress;
      if (progress < 1) return;
      if (this.fadeTimer !== null) window.clearInterval(this.fadeTimer);
      this.fadeTimer = null;
      if (release && target === 0) {
        this.music.pause();
        this.music.currentTime = 0;
      }
    }, 40);
  }
}

export const shellAudio = new ShellAudio();
