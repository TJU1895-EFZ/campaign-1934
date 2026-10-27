import { CRITICAL_HP } from '../core/constants';
import type { BattleSnapshot } from '../core/types';
import type { Settings } from '../../utils/storage';

export interface HUDOptions {
  settings: Settings;
  onResume: () => void;
  onRestart: () => void;
  onExit: () => void;
  onSettingsChange: (settings: Settings) => void;
  onDebugSkip: () => void;
  onDebugVictory: () => void;
}

export class HUD {
  private readonly root: HTMLElement;
  private readonly options: HUDOptions;
  private settings: Settings;
  private readonly pauseOverlay: HTMLElement;
  private readonly debugPanel: HTMLElement;
  private readonly phaseName: HTMLElement;
  private readonly objective: HTMLElement;
  private readonly healthFill: HTMLElement;
  private readonly healthValue: HTMLElement;
  private readonly ammoMag: HTMLElement;
  private readonly ammoReserve: HTMLElement;
  private readonly reloadHint: HTMLElement;
  private readonly subtitle: HTMLElement;
  private readonly damageVignette: HTMLElement;
  private readonly hitMarker: HTMLElement;
  private readonly lockHint: HTMLElement;
  private readonly stagingOverlay: HTMLElement;
  private readonly stagingCount: HTMLElement;
  private readonly downOverlay: HTMLElement;
  private readonly downTitle: HTMLElement;
  private readonly downCount: HTMLElement;
  private downReason: 'shot' | 'fall' = 'shot';
  private readonly debugFields: Record<string, HTMLElement> = {};
  private damageTimer: number | null = null;
  private hitTimer: number | null = null;
  private paused = false;
  private critical = false;
  private debugEnabled = false;

  constructor(container: HTMLElement, options: HUDOptions) {
    this.options = options;
    this.settings = { ...options.settings };
    this.root = document.createElement('div');
    this.root.className = 'hud';
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="hud-left">
          <div class="hud-phase">
            <span class="hud-phase-label">阶段</span>
            <span class="hud-phase-name" data-hud="phase">奔袭桥头</span>
          </div>
          <div class="hud-objective" data-hud="objective">观察对岸</div>
        </div>
      </div>
      <div class="crosshair"><span class="crosshair-dot"></span></div>
      <div class="hit-marker" data-hud="hit-marker"></div>
      <div class="damage-vignette" data-hud="damage"></div>
      <div class="subtitle" data-hud="subtitle" aria-live="polite"></div>
      <div class="lock-hint" data-hud="lock-hint">点击画面锁定鼠标 · Esc 暂停</div>
      <div class="hud-bottom">
        <div class="hud-health">
          <div class="health-label">
            <span>生命</span>
            <span class="health-value" data-hud="health-value">100</span>
          </div>
          <div class="health-bar"><span class="health-fill" data-hud="health-fill"></span></div>
        </div>
        <div class="hud-ammo">
          <span class="ammo-mag" data-hud="ammo-mag">10</span>
          <span class="ammo-reserve" data-hud="ammo-reserve">/ 120</span>
          <span class="reload-hint" data-hud="reload">R 换弹</span>
        </div>
      </div>
      <div class="staging-overlay" data-testid="staging-overlay" data-hud="staging">
        <div class="staging-card">
          <p class="eyebrow">部队集结</p>
          <h2>等待号角</h2>
          <div class="staging-count" data-hud="staging-count">3</div>
          <p class="staging-hint">红军队伍正在进入出发阵地</p>
        </div>
      </div>
      <div class="down-overlay" data-hud="down">
        <div class="down-card">
          <div class="down-title" data-hud="down-title">负伤撤离</div>
          <div class="down-count" data-hud="down-count">5</div>
          <div class="down-hint">即将在后方重新集结</div>
        </div>
      </div>
      <div class="pause-overlay" data-testid="pause-overlay">
        <div class="pause-card" role="dialog" aria-modal="true" aria-labelledby="pause-title">
          <p class="eyebrow">暂停</p>
          <h2 class="pause-title" id="pause-title">战斗暂停</h2>
          <p class="pause-sub">历史仍在继续，准备好后再前进。</p>
          <div class="pause-actions">
            <button type="button" class="btn btn-primary" data-testid="pause-resume">继续体验</button>
            <button type="button" class="btn btn-ghost" data-testid="pause-restart">重新开始</button>
            <button type="button" class="btn btn-ghost" data-testid="pause-exit">返回总览</button>
          </div>
          <div class="settings">
            <label class="setting-row">
              <span>主音量</span>
              <input type="range" min="0" max="1" step="0.05" data-setting="masterVolume" />
            </label>
            <label class="setting-row">
              <span>音效</span>
              <input type="range" min="0" max="1" step="0.05" data-setting="sfxVolume" />
            </label>
            <label class="setting-row">
              <span>字幕</span>
              <input type="checkbox" data-setting="subtitles" />
            </label>
          </div>
          <p class="pause-note">重新开始和返回总览会丢失当前战斗进度。</p>
        </div>
      </div>
      <div class="debug-panel" data-testid="debug-panel">
        <div class="debug-row"><span>阶段</span><strong data-debug="phase">-</strong></div>
        <div class="debug-row"><span>FPS / calls</span><strong data-debug="fps">-</strong></div>
        <div class="debug-row"><span>修正</span><strong data-debug="modifiers">-</strong></div>
        <div class="debug-actions">
          <button type="button" data-debug-action="skip">跳过阶段</button>
          <button type="button" data-debug-action="victory">直接胜利</button>
        </div>
      </div>
    `;
    container.appendChild(this.root);

    this.pauseOverlay = this.query('[data-testid="pause-overlay"]');
    this.debugPanel = this.query('[data-testid="debug-panel"]');
    this.phaseName = this.query('[data-hud="phase"]');
    this.objective = this.query('[data-hud="objective"]');
    this.healthFill = this.query('[data-hud="health-fill"]');
    this.healthValue = this.query('[data-hud="health-value"]');
    this.ammoMag = this.query('[data-hud="ammo-mag"]');
    this.ammoReserve = this.query('[data-hud="ammo-reserve"]');
    this.reloadHint = this.query('[data-hud="reload"]');
    this.subtitle = this.query('[data-hud="subtitle"]');
    this.damageVignette = this.query('[data-hud="damage"]');
    this.hitMarker = this.query('[data-hud="hit-marker"]');
    this.lockHint = this.query('[data-hud="lock-hint"]');
    this.stagingOverlay = this.query('[data-hud="staging"]');
    this.stagingCount = this.query('[data-hud="staging-count"]');
    this.downOverlay = this.query('[data-hud="down"]');
    this.downTitle = this.query('[data-hud="down-title"]');
    this.downCount = this.query('[data-hud="down-count"]');

    this.query('[data-testid="pause-resume"]').addEventListener('click', this.handleResume);
    this.query('[data-testid="pause-restart"]').addEventListener('click', this.handleRestart);
    this.query('[data-testid="pause-exit"]').addEventListener('click', this.handleExit);

    this.root.querySelectorAll<HTMLInputElement>('[data-setting]').forEach((input) => {
      input.addEventListener('input', this.handleSettingChange);
    });

    this.root.querySelectorAll<HTMLButtonElement>('[data-debug-action]').forEach((button) => {
      button.addEventListener('click', this.handleDebugAction);
    });

    this.syncSettings();
  }

  update(snapshot: BattleSnapshot): void {
    this.phaseName.textContent = snapshot.phaseName;
    this.objective.textContent = snapshot.objective;

    const healthPercent = Math.max(0, Math.min(100, (snapshot.playerHp / snapshot.playerMaxHp) * 100));
    this.healthFill.style.width = `${healthPercent}%`;
    this.healthValue.textContent = String(Math.ceil(snapshot.playerHp));

    this.critical = snapshot.playerHp > 0 && snapshot.playerHp <= CRITICAL_HP;
    this.damageVignette.classList.toggle('is-critical', this.critical);
    if (this.damageVignette.style.opacity !== '1') {
      this.damageVignette.style.opacity = this.critical ? '0.42' : '0';
    }

    this.ammoMag.textContent = String(snapshot.ammoMag);
    this.ammoReserve.textContent = `/ ${snapshot.ammoReserve}`;
    this.reloadHint.textContent = snapshot.reloading
      ? '换弹中'
      : snapshot.ammoMag === 0
        ? 'R 换弹'
        : '';

    if (snapshot.downed) {
      this.showDown(snapshot.downSecondsLeft);
    } else {
      this.hideDown();
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.pauseOverlay.classList.toggle('is-open', paused);
    const screen = this.root.closest('.battle-screen');
    screen?.classList.toggle('is-paused', paused);
    if (paused) {
      this.syncSettings();
      this.lockHint.classList.add('is-hidden');
    }
  }

  setLocked(locked: boolean): void {
    this.lockHint.classList.toggle('is-hidden', locked || this.paused);
  }

  showStaging(seconds: number): void {
    this.stagingOverlay.classList.add('is-visible');
    this.stagingCount.textContent = String(Math.max(0, Math.ceil(seconds)));
  }

  updateStaging(seconds: number): void {
    this.stagingCount.textContent = String(Math.max(0, Math.ceil(seconds)));
  }

  hideStaging(): void {
    this.stagingOverlay.classList.remove('is-visible');
  }

  setSubtitle(text: string): void {
    if (!this.settings.subtitles || !text) {
      this.hideSubtitle();
      return;
    }
    this.subtitle.textContent = text;
    this.subtitle.classList.add('is-visible');
  }

  hideSubtitle(): void {
    this.subtitle.classList.remove('is-visible');
  }

  showHitMarker(): void {
    this.hitMarker.classList.remove('is-active');
    void this.hitMarker.offsetWidth;
    this.hitMarker.classList.add('is-active');
    if (this.hitTimer !== null) window.clearTimeout(this.hitTimer);
    this.hitTimer = window.setTimeout(() => {
      this.hitMarker.classList.remove('is-active');
      this.hitTimer = null;
    }, 220);
  }

  showDamage(): void {
    this.damageVignette.style.opacity = '1';
    if (this.damageTimer !== null) window.clearTimeout(this.damageTimer);
    this.damageTimer = window.setTimeout(() => {
      this.damageVignette.style.opacity = this.critical ? '0.42' : '0';
      this.damageTimer = null;
    }, 180);
  }

  showDown(seconds: number, reason?: 'shot' | 'fall'): void {
    if (reason) {
      this.downReason = reason;
      this.downTitle.textContent = reason === 'fall' ? '坠桥' : '负伤撤离';
    }
    this.downOverlay.classList.add('is-visible');
    this.downCount.textContent = String(Math.max(0, Math.ceil(seconds)));
  }

  hideDown(): void {
    this.downOverlay.classList.remove('is-visible');
  }

  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
    this.debugPanel.classList.toggle('is-visible', enabled);
  }

  updateDebug(data: {
    phase: string;
    fps: string;
    drawCalls: number;
    accuracy: number;
    fireRate: number;
  }): void {
    if (!this.debugEnabled) return;
    this.setDebugField('phase', data.phase);
    this.setDebugField('fps', `${data.fps} / ${data.drawCalls}`);
    this.setDebugField('modifiers', `${data.accuracy.toFixed(2)} / ${data.fireRate.toFixed(2)}`);
  }

  dispose(): void {
    if (this.damageTimer !== null) window.clearTimeout(this.damageTimer);
    if (this.hitTimer !== null) window.clearTimeout(this.hitTimer);
    this.query('[data-testid="pause-resume"]').removeEventListener('click', this.handleResume);
    this.query('[data-testid="pause-restart"]').removeEventListener('click', this.handleRestart);
    this.query('[data-testid="pause-exit"]').removeEventListener('click', this.handleExit);
    this.root
      .querySelectorAll<HTMLInputElement>('[data-setting]')
      .forEach((input) => input.removeEventListener('input', this.handleSettingChange));
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-debug-action]')
      .forEach((button) => button.removeEventListener('click', this.handleDebugAction));
    this.root.remove();
  }

  private query<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`HUD element not found: ${selector}`);
    return element;
  }

  private syncSettings(): void {
    this.root.querySelectorAll<HTMLInputElement>('[data-setting]').forEach((input) => {
      const key = input.dataset.setting as keyof Settings | undefined;
      if (!key) return;
      if (input.type === 'checkbox') {
        input.checked = Boolean(this.settings[key]);
      } else {
        input.value = String(this.settings[key]);
      }
    });
  }

  private handleSettingChange = (event: Event): void => {
    const input = event.currentTarget as HTMLInputElement;
    const key = input.dataset.setting as keyof Settings | undefined;
    if (!key) return;

    if (key === 'subtitles') {
      this.settings = { ...this.settings, subtitles: input.checked };
      if (!input.checked) this.hideSubtitle();
    } else {
      const value = Number(input.value);
      this.settings = { ...this.settings, [key]: value };
    }
    this.options.onSettingsChange({ ...this.settings });
  };

  private handleResume = (): void => {
    this.options.onResume();
  };

  private handleRestart = (): void => {
    if (window.confirm('重新开始将丢失当前进度，确定吗？')) {
      this.options.onRestart();
    }
  };

  private handleExit = (): void => {
    if (window.confirm('返回总览将结束当前战斗，确定吗？')) {
      this.options.onExit();
    }
  };

  private handleDebugAction = (event: Event): void => {
    const action = (event.currentTarget as HTMLButtonElement).dataset.debugAction;
    if (action === 'skip') this.options.onDebugSkip();
    if (action === 'victory') this.options.onDebugVictory();
  };

  private setDebugField(name: string, value: string): void {
    let field: HTMLElement | undefined = this.debugFields[name];
    if (!field) {
      const found = this.debugPanel.querySelector<HTMLElement>(`[data-debug="${name}"]`);
      if (!found) return;
      field = found;
      this.debugFields[name] = found;
    }
    field.textContent = value;
  }
}
