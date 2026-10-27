import type { Screen } from '../Screen';
import type { BattleSummary } from '../AppState';
import type { Settings } from '../../utils/storage';
import { BattleRuntime } from '../../battle/runtime/BattleRuntime';

interface BattleScreenOptions {
  settings: Settings;
  onVictory: (summary: BattleSummary) => void;
  onExit: () => void;
  onRestart: () => void;
  onError: (message: string) => void;
  onSettingsChange: (settings: Settings) => void;
}

export class BattleScreen implements Screen {
  private root: HTMLElement | null = null;
  private runtime: BattleRuntime | null = null;

  constructor(private readonly options: BattleScreenOptions) {}

  mount(root: HTMLElement): void {
    this.root = root;
    root.innerHTML = `
      <main class="battle-screen" data-testid="battle-screen">
        <div class="battle-root" data-testid="battle-root"></div>
      </main>
    `;

    const battleRoot = root.querySelector<HTMLElement>('[data-testid="battle-root"]');
    if (!battleRoot) {
      this.options.onError('战场初始化失败。');
      return;
    }

    this.runtime = new BattleRuntime(battleRoot, {
      settings: this.options.settings,
      onVictory: this.options.onVictory,
      onExit: this.options.onExit,
      onRestart: this.options.onRestart,
      onError: this.options.onError,
      onSettingsChange: this.options.onSettingsChange,
    });

    this.runtime.start();
  }

  destroy(): void {
    this.runtime?.dispose();
    this.runtime = null;
    this.root = null;
  }
}
