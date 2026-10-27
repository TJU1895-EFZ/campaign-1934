import type { AppState, BattleSummary } from './AppState';
import type { Screen } from './Screen';
import { IntroScreen } from './screens/IntroScreen';
import { OverviewScreen } from './screens/OverviewScreen';
import { BattleLoadingScreen } from './screens/BattleLoadingScreen';
import { BattleScreen } from './screens/BattleScreen';
import { QuizScreen } from './screens/QuizScreen';
import { ResultScreen } from './screens/ResultScreen';
import { ErrorScreen } from './screens/ErrorScreen';
import type { QuizResult } from '../content/quiz';
import { loadSettings, saveSettings, type Settings } from '../utils/storage';
import { shellAudio } from '../audio/ShellAudio';

/**
 * AppAudio — procedural BGM for intro/overview screens.
 * Creates a low ambient pad that plays while navigating menus,
 * and stops when entering battle (AudioManager takes over).
 */
class AppAudio {
  private context: AudioContext | null = null;
  private playing = false;
  private sources: AudioNode[] = [];
  private masterGain: GainNode | null = null;
  private sfxVolume = 0.8;

  setVolume(sfxVolume: number): void {
    this.sfxVolume = sfxVolume;
    this.masterGain?.gain.setTargetAtTime(sfxVolume * 0.12, this.context?.currentTime ?? 0, 0.1);
  }

  start(): void {
    if (this.playing || !this.context) return;
    this.playing = true;

    const ctx = this.context;
    if (!ctx) return;
    const now = ctx.currentTime;

    // Warm low pad: two detuned sawtooth oscillators through a lowpass filter
    const baseFreqs = [110, 110.8, 164.81]; // A2 + slight detune + E3
    for (const freq of baseFreqs) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 2);
      osc.connect(gain);
      this.sources.push(osc, gain);
      osc.start(now);
    }

    // Lowpass filter for warmth
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    filter.Q.value = 0.7;

    // LFO for slow volume swell
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.04;
    lfo.connect(lfoGain);
    this.sources.push(lfo, lfoGain);
    lfo.start(now);

    // Connect all oscillators to filter → master
    if (this.masterGain) {
      for (const node of this.sources) {
        if (node instanceof OscillatorNode) {
          node.connect(filter);
        }
      }
      filter.connect(this.masterGain);
    }
  }

  stop(): void {
    if (!this.playing || !this.context) return;
    const ctx = this.context;
    const now = ctx.currentTime;

    // Fade out
    this.masterGain?.gain.linearRampToValueAtTime(0, now + 1);

    for (const source of this.sources) {
      try {
        if (source instanceof OscillatorNode) {
          source.stop(now + 1.2);
        }
        source.disconnect();
      } catch {
        // Already stopped.
      }
    }
    this.sources = [];
    this.playing = false;
  }

  resume(): void {
    if (!this.playing) this.start();
  }

  dispose(): void {
    this.stop();
    if (this.context) {
      void this.context.close();
      this.context = null;
    }
    this.masterGain = null;
  }

  /** Create or resume the AudioContext (must be called from user gesture). */
  unlock(): void {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume();
      return;
    }
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.context = new Ctor();
    this.masterGain = this.context.createGain();
    this.masterGain.connect(this.context.destination);
    this.start();
  }
}

export class App {
  state: AppState = 'intro';

  private currentScreen: Screen | null = null;
  private summary: BattleSummary | null = null;
  private quizResult: QuizResult | null = null;
  private settings: Settings;
  private readonly appAudio: AppAudio;

  constructor(private readonly root: HTMLElement) {
    this.settings = loadSettings();
    this.appAudio = new AppAudio();
  }

  start(): void {
    this.showIntro();
  }

  /** Called when entering battle — stop menu BGM so AudioManager can take over cleanly. */
  stopMenuBgm(): void {
    this.appAudio.stop();
  }

  /** Resume menu BGM when returning from battle. */
  resumeMenuBgm(): void {
    this.appAudio.resume();
  }

  /** Unlock the menu audio context on first user gesture. */
  unlockMenuAudio(): void {
    this.appAudio.unlock();
  }

  getSummary(): BattleSummary | null {
    return this.summary;
  }

  showIntro(): void {
    shellAudio.enterShell();
    this.setScreen(
      'intro',
      new IntroScreen({
        onNext: () => this.showOverview(),
      }),
    );
    this.appAudio.setVolume(this.settings.sfxVolume);
    this.appAudio.resume();
  }

  showOverview(): void {
    shellAudio.enterShell();
    this.setScreen(
      'overview',
      new OverviewScreen({
        onSelect: (battleId) => {
          if (battleId === 'luding') this.startBattle();
        },
        onBack: () => this.showIntro(),
      }),
    );
    this.appAudio.setVolume(this.settings.sfxVolume);
    this.appAudio.resume();
  }

  startBattle(): void {
    shellAudio.leaveShell();
    this.quizResult = null;
    this.summary = null;
    this.stopMenuBgm();
    this.setScreen(
      'battle-loading',
      new BattleLoadingScreen({
        onReady: () => this.showBattle(),
        onBack: () => this.showOverview(),
      }),
    );
  }

  showBattle(): void {
    this.setScreen(
      'battle',
      new BattleScreen({
        settings: this.settings,
        onVictory: (summary) => {
          this.summary = summary;
          this.quizResult = null;
          this.showQuiz();
        },
        onExit: () => {
          this.resumeMenuBgm();
          this.showOverview();
        },
        onRestart: () => this.startBattle(),
        onError: (message) => {
          this.showError(message);
        },
        onSettingsChange: (settings) => {
          this.settings = settings;
          saveSettings(settings);
          this.appAudio.setVolume(settings.sfxVolume);
        },
      }),
    );
  }

  showQuiz(): void {
    this.setScreen(
      'quiz',
      new QuizScreen({
        onComplete: (result) => {
          this.quizResult = result;
          this.showResult();
        },
      }),
    );
  }

  showResult(): void {
    const summary = this.summary;
    if (!summary) {
      this.showOverview();
      return;
    }
    this.setScreen(
      'result',
      new ResultScreen({
        summary,
        quiz: this.quizResult ?? undefined,
        onReplay: () => this.startBattle(),
        onBack: () => this.showOverview(),
      }),
    );
  }

  showError(message: string): void {
    this.setScreen(
      'error',
      new ErrorScreen({
        message,
        onRetry: () => this.startBattle(),
        onBack: () => this.showOverview(),
      }),
    );
  }

  private setScreen(state: AppState, screen: Screen): void {
    this.currentScreen?.destroy();
    this.root.innerHTML = '';
    this.state = state;
    this.currentScreen = screen;
    screen.mount(this.root);
  }
}
