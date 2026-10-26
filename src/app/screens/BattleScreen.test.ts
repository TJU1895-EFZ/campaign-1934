import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BattleScreen } from './BattleScreen';
import { DEFAULT_SETTINGS } from '../../utils/storage';

describe('BattleScreen Unity shell', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>';
  });

  it('mounts the Unity frame and exposes safe navigation controls', () => {
    const root = document.querySelector<HTMLElement>('#app')!;
    const onExit = vi.fn();
    const onRestart = vi.fn();
    const screen = new BattleScreen({
      settings: DEFAULT_SETTINGS,
      onVictory: vi.fn(),
      onExit,
      onRestart,
      onError: vi.fn(),
      onSettingsChange: vi.fn(),
    });
    screen.mount(root);

    expect(root.querySelector<HTMLIFrameElement>('[data-testid="unity-frame"]')?.src).toContain('/unity/index.html');
    root.querySelector<HTMLButtonElement>('[data-testid="unity-exit"]')!.click();
    root.querySelector<HTMLButtonElement>('[data-testid="unity-restart"]')!.click();
    expect(onExit).toHaveBeenCalledOnce();
    expect(onRestart).toHaveBeenCalledOnce();
    screen.destroy();
  });

  it('accepts victory only from its own Unity frame', () => {
    const root = document.querySelector<HTMLElement>('#app')!;
    const onVictory = vi.fn();
    const screen = new BattleScreen({
      settings: DEFAULT_SETTINGS,
      onVictory,
      onExit: vi.fn(),
      onRestart: vi.fn(),
      onError: vi.fn(),
      onSettingsChange: vi.fn(),
    });
    screen.mount(root);
    const frame = root.querySelector<HTMLIFrameElement>('[data-testid="unity-frame"]')!;

    window.dispatchEvent(new MessageEvent('message', { data: { type: 'campaign1934', event: 'victory' } }));
    expect(onVictory).not.toHaveBeenCalled();
    window.dispatchEvent(new MessageEvent('message', {
      source: frame.contentWindow,
      data: { type: 'campaign1934', event: 'victory' },
    }));
    expect(onVictory).toHaveBeenCalledOnce();
    expect(onVictory.mock.calls[0][0].durationSec).toBeGreaterThanOrEqual(1);
    screen.destroy();
  });
});
