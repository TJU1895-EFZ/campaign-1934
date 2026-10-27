import type { Screen } from '../Screen';
import type { BattleSummary } from '../AppState';
import type { Settings } from '../../utils/storage';

interface BattleScreenOptions {
  settings: Settings;
  onVictory: (summary: BattleSummary) => void;
  onExit: () => void;
  onRestart: () => void;
  onError: (message: string) => void;
  onSettingsChange: (settings: Settings) => void;
}

interface UnityMessage {
  type: 'campaign1934';
  event: 'started' | 'victory' | 'error';
  message?: string;
}

export class BattleScreen implements Screen {
  private root: HTMLElement | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private startedAt = 0;
  private failed = false;

  constructor(private readonly options: BattleScreenOptions) {}

  mount(root: HTMLElement): void {
    this.root = root;
    this.startedAt = performance.now();
    const unityUrl = `${import.meta.env.BASE_URL}unity/index.html`;
    root.innerHTML = `
      <main class="battle-screen unity-battle" data-testid="battle-screen">
        <iframe
          class="unity-frame"
          data-testid="unity-frame"
          src="${unityUrl}"
          title="飞夺泸定桥第一人称战役模拟"
          allow="autoplay; fullscreen; gamepad"
          allowfullscreen
        ></iframe>
        <nav class="unity-controls" aria-label="体验控制">
          <button type="button" class="btn btn-ghost" data-testid="unity-exit">返回总览</button>
          <button type="button" class="btn btn-ghost" data-testid="unity-restart">重新开始</button>
        </nav>
        <p class="unity-help">点击画面开始 · WASD 移动 · 鼠标观察与射击 · Esc 释放鼠标</p>
      </main>
    `;
    this.iframe = root.querySelector<HTMLIFrameElement>('[data-testid="unity-frame"]');
    this.iframe?.addEventListener('load', this.handleLoad);
    this.iframe?.addEventListener('error', this.handleFrameError);
    root.querySelector('[data-testid="unity-exit"]')?.addEventListener('click', this.handleExit);
    root.querySelector('[data-testid="unity-restart"]')?.addEventListener('click', this.handleRestart);
    window.addEventListener('message', this.handleMessage);
  }

  destroy(): void {
    window.removeEventListener('message', this.handleMessage);
    this.iframe?.removeEventListener('load', this.handleLoad);
    this.iframe?.removeEventListener('error', this.handleFrameError);
    this.root?.querySelector('[data-testid="unity-exit"]')?.removeEventListener('click', this.handleExit);
    this.root?.querySelector('[data-testid="unity-restart"]')?.removeEventListener('click', this.handleRestart);
    this.iframe = null;
    this.root = null;
  }

  private handleLoad = (): void => {
    this.root?.querySelector('.battle-screen')?.setAttribute('data-battle-started', 'true');
  };

  private handleFrameError = (): void => this.fail('Unity WebGL 战役场景加载失败。');
  private handleExit = (): void => this.options.onExit();
  private handleRestart = (): void => this.options.onRestart();

  private handleMessage = (event: MessageEvent<unknown>): void => {
    if (event.source !== this.iframe?.contentWindow || !this.isUnityMessage(event.data)) return;
    if (event.data.event === 'started') {
      this.root?.querySelector('.battle-screen')?.setAttribute('data-unity-running', 'true');
      return;
    }
    if (event.data.event === 'error') {
      this.fail(event.data.message ?? 'Unity WebGL 战役场景发生错误。');
      return;
    }
    const durationSec = Math.max(1, Math.round((performance.now() - this.startedAt) / 1000));
    this.options.onVictory({ kills: 0, deaths: 0, accuracy: 0, durationSec, shots: 0, hits: 0 });
  };

  private isUnityMessage(value: unknown): value is UnityMessage {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<UnityMessage>;
    return candidate.type === 'campaign1934' &&
      (candidate.event === 'started' || candidate.event === 'victory' || candidate.event === 'error');
  }

  private fail(message: string): void {
    if (this.failed) return;
    this.failed = true;
    this.options.onError(message);
  }
}
