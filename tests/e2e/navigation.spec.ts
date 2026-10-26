import { expect, test, type Page } from '@playwright/test';

async function openUnityBattle(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('intro-next').click();
  await page.getByTestId('battle-card-luding').click();
  await expect(page.getByTestId('battle-loading')).toBeVisible();
  await expect(page.getByTestId('battle-screen')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('unity-frame')).toBeVisible();
  await expect(page.locator('[data-battle-started="true"]')).toBeVisible({ timeout: 30_000 });
}

async function notifyUnityVictory(page: Page): Promise<void> {
  await page.evaluate(() => {
    const frame = document.querySelector<HTMLIFrameElement>('[data-testid="unity-frame"]');
    window.dispatchEvent(new MessageEvent('message', {
      source: frame?.contentWindow ?? null,
      data: { type: 'campaign1934', event: 'victory' },
    }));
  });
}

async function completeQuiz(page: Page): Promise<void> {
  await expect(page.getByTestId('quiz-screen')).toBeVisible();
  for (let question = 0; question < 5; question += 1) {
    await page.locator('[data-correct="true"]').click();
    await page.getByTestId('quiz-next').click();
  }
  await page.getByTestId('quiz-finish').click();
}

test('walks from the introduction to the Unity WebGL battle', async ({ page }) => {
  await openUnityBattle(page);
  const frame = page.frameLocator('[data-testid="unity-frame"]');
  await expect(frame.locator('#unity-container')).toBeVisible({ timeout: 30_000 });
  await expect(frame.locator('#unity-canvas')).toBeVisible();
});

test('locked battle cards stay on the overview', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('intro-next').click();
  await expect(page.locator('[data-battle-id]')).toHaveCount(6);
  await page.getByTestId('battle-card-xiangjiang').click({ force: true });
  await expect(page.getByTestId('coming-soon')).toContainText('即将开放');
});

test('battle shell exposes exit and restart controls', async ({ page }) => {
  await openUnityBattle(page);
  await expect(page.getByTestId('unity-exit')).toBeVisible();
  await expect(page.getByTestId('unity-restart')).toBeVisible();
  await page.getByTestId('unity-exit').click();
  await expect(page.locator('[data-battle-id]')).toHaveCount(6);
});

test('restart returns through the loading screen', async ({ page }) => {
  await openUnityBattle(page);
  await page.getByTestId('unity-restart').click();
  await expect(page.getByTestId('battle-loading')).toBeVisible();
  await expect(page.getByTestId('unity-frame')).toBeVisible({ timeout: 15_000 });
});

test('Unity victory enters the quiz and result flow', async ({ page }) => {
  await openUnityBattle(page);
  await notifyUnityVictory(page);
  await completeQuiz(page);
  await expect(page.locator('.result-shell h1')).toHaveText('夺桥成功');
  await expect(page.getByTestId('result-quiz')).toContainText('5');
});

test('unrelated window messages cannot finish the battle', async ({ page }) => {
  await openUnityBattle(page);
  await page.evaluate(() => window.postMessage({ type: 'campaign1934', event: 'victory' }, '*'));
  await expect(page.getByTestId('battle-screen')).toBeVisible();
});

test('refresh returns to the introduction', async ({ page }) => {
  await openUnityBattle(page);
  await page.reload();
  await expect(page.getByTestId('intro-next')).toBeVisible();
});
