import type { Screen } from '../Screen';
import { INTRO } from '../../content/intro';
import { shellAudio } from '../../audio/ShellAudio';

interface IntroScreenOptions {
  onNext: () => void;
}

export class IntroScreen implements Screen {
  private root: HTMLElement | null = null;

  constructor(private readonly options: IntroScreenOptions) {}

  mount(root: HTMLElement): void {
    this.root = root;
    root.innerHTML = `
      <main class="screen intro-screen">
        <div class="intro-atmosphere" aria-hidden="true">
          <div class="intro-glow"></div>
          <div class="intro-grid"></div>
          <svg class="intro-mountains" viewBox="0 0 1440 420" preserveAspectRatio="none">
            <path d="M0 360 L150 210 L250 300 L390 140 L525 315 L660 190 L800 320 L960 120 L1100 300 L1220 210 L1340 320 L1440 260 L1440 420 L0 420 Z" fill="#0c1419"></path>
            <path d="M0 390 L180 285 L320 350 L470 240 L610 360 L780 260 L940 355 L1100 270 L1260 360 L1440 300 L1440 420 L0 420 Z" fill="#0a1115"></path>
            <path d="M340 420 Q720 236 1100 420" fill="none" stroke="#6d5a3c" stroke-width="2" opacity="0.55"></path>
            <path d="M380 420 Q720 262 1060 420" fill="none" stroke="#6d5a3c" stroke-width="1" opacity="0.4"></path>
            <path d="M420 420 Q720 286 1020 420" fill="none" stroke="#6d5a3c" stroke-width="1" opacity="0.3"></path>
            <path d="M500 420 Q720 330 940 420" fill="none" stroke="#b23a2f" stroke-width="2" opacity="0.7"></path>
          </svg>
        </div>
        <div class="intro-shell">
          <header class="intro-hero">
            <p class="eyebrow">${INTRO.eyebrow}</p>
            <h1 class="intro-title">${INTRO.title}</h1>
            <p class="intro-subtitle">${INTRO.subtitle}</p>
            <div class="hero-rule"><span></span></div>
          </header>
          <section class="intro-copy" aria-label="长征介绍">
            ${INTRO.paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join('')}
          </section>
          <div class="intro-actions">
            <button type="button" class="btn btn-primary btn-large" data-testid="intro-next">
              <span>${INTRO.cta}</span>
              <span class="btn-arrow" aria-hidden="true">→</span>
            </button>
            <p class="intro-hint">建议使用电脑浏览器，配合键盘与鼠标体验。</p>
            <button type="button" class="btn btn-ghost audio-toggle" data-testid="audio-toggle" aria-pressed="${shellAudio.isMuted()}">${shellAudio.isMuted() ? '恢复声音' : '静音'}</button>
          </div>
          <footer class="intro-footer">
            <span>1934 — 1936</span>
            <span class="footer-sep"></span>
            <span>中国工农红军长征胜利九十周年</span>
          </footer>
        </div>
      </main>
    `;

    const nextButton = root.querySelector<HTMLButtonElement>('[data-testid="intro-next"]');
    nextButton?.addEventListener('click', this.handleNext);
    root.querySelector('[data-testid="audio-toggle"]')?.addEventListener('click', this.handleAudioToggle);
  }

  destroy(): void {
    const nextButton = this.root?.querySelector<HTMLButtonElement>('[data-testid="intro-next"]');
    nextButton?.removeEventListener('click', this.handleNext);
    this.root?.querySelector('[data-testid="audio-toggle"]')?.removeEventListener('click', this.handleAudioToggle);
    this.root = null;
  }

  private handleNext = (): void => {
    this.options.onNext();
  };

  private handleAudioToggle = (event: Event): void => {
    const button = event.currentTarget as HTMLButtonElement;
    const muted = shellAudio.toggleMute();
    button.textContent = muted ? '恢复声音' : '静音';
    button.setAttribute('aria-pressed', String(muted));
  };
}
