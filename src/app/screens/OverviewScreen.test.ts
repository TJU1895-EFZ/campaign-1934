import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OverviewScreen } from './OverviewScreen';

describe('OverviewScreen', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  function mountScreen() {
    const root = document.querySelector<HTMLElement>('#app');
    if (!root) throw new Error('missing root');
    const onSelect = vi.fn();
    const onBack = vi.fn();
    const screen = new OverviewScreen({ onSelect, onBack });
    screen.mount(root);
    return { root, onSelect, onBack, screen };
  }

  it('shows six battle cards', () => {
    const { root, screen } = mountScreen();
    expect(root.querySelectorAll('[data-battle-id]')).toHaveLength(6);
    expect(root.textContent).toContain('飞夺泸定桥');
    expect(root.textContent).toContain('血战湘江');
    screen.destroy();
  });

  it('opens the battle only for the playable Luding Bridge card', () => {
    const { root, onSelect, screen } = mountScreen();
    root.querySelector<HTMLButtonElement>('[data-testid="battle-card-luding"]')!.click();
    expect(onSelect).toHaveBeenCalledWith('luding');
    screen.destroy();
  });

  it('shows a coming-soon notice for locked battles without navigating', () => {
    const { root, onSelect, screen } = mountScreen();
    const locked = root.querySelector<HTMLButtonElement>('[data-testid="battle-card-xiangjiang"]')!;
    locked.click();

    const toast = root.querySelector<HTMLElement>('[data-testid="coming-soon"]')!;
    expect(toast.hidden).toBe(false);
    expect(toast.classList.contains('is-visible')).toBe(true);
    expect(toast.textContent).toContain('即将开放');
    expect(onSelect).not.toHaveBeenCalled();
    screen.destroy();
  });

  it('returns to the introduction through the back button', () => {
    const { root, onBack, screen } = mountScreen();
    root.querySelector<HTMLButtonElement>('[data-testid="overview-back"]')!.click();
    expect(onBack).toHaveBeenCalledTimes(1);
    screen.destroy();
  });
});
