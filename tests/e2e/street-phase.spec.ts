import { expect, test, type Page } from '@playwright/test';

// Includes the 3 s staging countdown, the 8 s charge cutscene and debug skips.
test.describe.configure({ timeout: 60_000 });

interface BattleDebug {
  player: { position: { z: number }; enabled: boolean };
  bots: { zone: string };
}

declare global {
  interface Window {
    __battleDebug?: BattleDebug;
  }
}

async function enterBattle(page: Page): Promise<void> {
  await page.goto('/?debug=1');
  await page.getByTestId('intro-next').click();
  await page.getByTestId('battle-card-luding').click();
  await expect(page.getByTestId('battle-screen')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-battle-started="true"]')).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('debug-panel')).toBeVisible();
}

test('street phase resumes control after the charge cutscene', async ({ page }) => {
  await enterBattle(page);

  const skip = page.locator('[data-debug-action="skip"]');
  const phase = page.locator('[data-debug="phase"]');

  await skip.click();
  await expect(phase).toContainText('2/4');
  await skip.click();
  await expect(phase).toContainText('3/4');

  // Entering phase 4 starts the D2 charge cutscene and disables the player.
  await skip.click();
  await expect(phase).toContainText('4/4');
  await expect
    .poll(() => page.evaluate(() => window.__battleDebug?.player.enabled))
    .toBe(false);

  // The cutscene lasts 8 seconds; afterwards the street phase must be applied
  // and control handed back, otherwise the experience freezes on the bridge.
  await expect
    .poll(() => page.evaluate(() => window.__battleDebug?.player.enabled), {
      timeout: 15_000,
    })
    .toBe(true);

  const state = await page.evaluate(() => ({
    zone: window.__battleDebug?.bots.zone,
    playerZ: window.__battleDebug?.player.position.z ?? 0,
  }));
  expect(state.zone).toBe('street');
  expect(state.playerZ).toBeLessThan(-30);
});
