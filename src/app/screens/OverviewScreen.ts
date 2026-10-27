import type { Screen } from '../Screen';
import { BATTLES, type BattleCardData } from '../../content/battles';

interface OverviewScreenOptions {
  onSelect: (battleId: string) => void;
  onBack: () => void;
}

export class OverviewScreen implements Screen {
  private root: HTMLElement | null = null;
  private toastTimer: number | null = null;

  constructor(private readonly options: OverviewScreenOptions) {}

  mount(root: HTMLElement): void {
    this.root = root;
    root.innerHTML = `
      <main class="screen overview-screen">
        <div class="overview-atmosphere" aria-hidden="true"></div>
        <div class="overview-shell">
          <header class="overview-header">
            <button type="button" class="btn btn-ghost btn-back" data-testid="overview-back">
              <span aria-hidden="true">←</span> 返回导读
            </button>
            <p class="eyebrow">1934 — 1936 · 长征重大战役</p>
            <h1>选择一场战役</h1>
            <p class="lede">从湘江到腊子口，每一场战斗都改变了长征的走向。第一版可进入飞夺泸定桥，其余战役将陆续开放。</p>
          </header>
          <section class="battle-grid" aria-label="长征重大战役列表">
            ${BATTLES.map((battle) => this.renderCard(battle)).join('')}
          </section>
          <p class="overview-note">第一版开放：飞夺泸定桥。其余战役仅作入口展示。</p>
        </div>
        <div class="toast" data-testid="coming-soon" role="status" aria-live="polite" hidden>
          该战役即将开放
        </div>
      </main>
    `;

    const backButton = root.querySelector<HTMLButtonElement>('[data-testid="overview-back"]');
    backButton?.addEventListener('click', this.handleBack);

    root.querySelectorAll<HTMLButtonElement>('[data-battle-id]').forEach((card) => {
      card.addEventListener('click', this.handleCardClick);
    });
  }

  destroy(): void {
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    const backButton = this.root?.querySelector<HTMLButtonElement>('[data-testid="overview-back"]');
    backButton?.removeEventListener('click', this.handleBack);
    this.root?.querySelectorAll<HTMLButtonElement>('[data-battle-id]').forEach((card) => {
      card.removeEventListener('click', this.handleCardClick);
    });
    this.root = null;
  }

  private renderCard(battle: BattleCardData): string {
    const year = battle.time.match(/\d{4}/)?.[0] ?? '1934';
    const status = battle.playable ? '可体验' : '即将开放';
    return `
      <button
        type="button"
        class="battle-card ${battle.tone} ${battle.playable ? 'is-playable' : 'is-locked'}"
        data-battle-id="${battle.id}"
        data-testid="battle-card-${battle.id}"
        aria-disabled="${battle.playable ? 'false' : 'true'}"
        aria-label="${battle.name}，${status}"
      >
        <span class="card-visual" aria-hidden="true">
          <span class="card-year">${year}</span>
          <span class="card-mark">${battle.name.slice(0, 1)}</span>
          <span class="card-ridge card-ridge-a"></span>
          <span class="card-ridge card-ridge-b"></span>
          <span class="card-status ${battle.playable ? 'is-open' : ''}">${status}</span>
        </span>
        <span class="card-body">
          <span class="card-topline">
            <span class="card-time">${battle.time}</span>
            <span class="card-place">${battle.place}</span>
          </span>
          <span class="card-name">${battle.name}</span>
          <span class="card-desc">${battle.description}</span>
          <span class="card-action">${battle.playable ? '进入战斗 →' : '查看详情'}</span>
        </span>
      </button>
    `;
  }

  private handleBack = (): void => {
    this.options.onBack();
  };

  private handleCardClick = (event: Event): void => {
    const card = (event.currentTarget as HTMLButtonElement).dataset.battleId;
    const battle = BATTLES.find((item) => item.id === card);
    if (!battle) return;

    if (!battle.playable) {
      this.showToast();
      return;
    }
    this.options.onSelect(battle.id);
  };

  private showToast(): void {
    if (!this.root) return;
    const toast = this.root.querySelector<HTMLElement>('[data-testid="coming-soon"]');
    if (!toast) return;

    toast.hidden = false;
    toast.classList.remove('is-visible');
    // Force a style flush so the entry animation can replay on repeated clicks.
    void toast.offsetWidth;
    toast.classList.add('is-visible');

    if (this.toastTimer !== null) window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
      this.toastTimer = window.setTimeout(() => {
        toast.hidden = true;
        this.toastTimer = null;
      }, 220);
    }, 1600);
  }
}
