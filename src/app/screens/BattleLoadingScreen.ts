import type { Screen } from '../Screen';

interface BattleLoadingScreenOptions {
  onReady: () => void;
  onBack: () => void;
}

export class BattleLoadingScreen implements Screen {
  private root: HTMLElement | null = null;
  private progressTimer: number | null = null;
  private readyTimer: number | null = null;

  constructor(private readonly options: BattleLoadingScreenOptions) {}

  mount(root: HTMLElement): void {
    this.root = root;
    root.innerHTML = `
      <main class="screen loading-screen" data-testid="battle-loading">
        <div class="loading-atmosphere" aria-hidden="true"></div>
        <div class="loading-shell">
          <p class="eyebrow">1935 年 5 月 29 日 · 四川泸定</p>
          <h1>飞夺泸定桥</h1>
          <p class="loading-lede">正在进入大渡河畔的战场</p>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <span class="progress-fill"></span>
          </div>
          <div class="loading-meta">
            <span class="loading-status">整备中</span>
            <span class="loading-percent">0%</span>
          </div>
          <div class="loading-tips">
            <p><strong>移动</strong> WASD</p>
            <p><strong>冲刺 / 跳跃</strong> Shift / Space</p>
            <p><strong>下蹲</strong> C</p>
            <p><strong>视角</strong> 鼠标</p>
            <p><strong>射击</strong> 鼠标左键</p>
            <p><strong>换弹</strong> R</p>
            <p><strong>暂停</strong> Esc</p>
            <p><strong>触屏</strong> 摇杆 / 瞄准 / 开火</p>
          </div>
          <button type="button" class="btn btn-ghost" data-testid="loading-back">返回总览</button>
        </div>
      </main>
    `;

    const backButton = root.querySelector<HTMLButtonElement>('[data-testid="loading-back"]');
    backButton?.addEventListener('click', this.handleBack);

    const progress = root.querySelector<HTMLElement>('.progress');
    const fill = root.querySelector<HTMLElement>('.progress-fill');
    const percent = root.querySelector<HTMLElement>('.loading-percent');
    const status = root.querySelector<HTMLElement>('.loading-status');
    let value = 0;

    this.progressTimer = window.setInterval(() => {
      value = Math.min(100, value + 8);
      if (fill) fill.style.width = `${value}%`;
      if (percent) percent.textContent = `${value}%`;
      if (progress) progress.setAttribute('aria-valuenow', String(value));
      if (value >= 100 && status) status.textContent = '准备就绪';
    }, 60);

    this.readyTimer = window.setTimeout(() => {
      this.options.onReady();
    }, 900);
  }

  destroy(): void {
    if (this.progressTimer !== null) window.clearInterval(this.progressTimer);
    if (this.readyTimer !== null) window.clearTimeout(this.readyTimer);
    this.progressTimer = null;
    this.readyTimer = null;
    const backButton = this.root?.querySelector<HTMLButtonElement>('[data-testid="loading-back"]');
    backButton?.removeEventListener('click', this.handleBack);
    this.root = null;
  }

  private handleBack = (): void => {
    this.options.onBack();
  };
}
