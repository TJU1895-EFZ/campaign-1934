import { expect, test, type Page } from '@playwright/test';

async function openBattle(
  page: Page,
  options: { debug?: boolean } = {},
): Promise<void> {
  await page.goto(options.debug ? '/?debug=1' : '/');
  await page.getByTestId('intro-next').click();
  await page.getByTestId('battle-card-luding').click();
  await expect(page.getByTestId('battle-loading')).toBeVisible();
  await expect(page.getByTestId('battle-screen')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-battle-started="true"]')).toBeVisible({
    timeout: 30_000,
  });
}

async function pauseBattle(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pause-overlay')).toBeVisible();
}

async function completeQuiz(page: Page): Promise<void> {
  await expect(page.getByTestId('quiz-screen')).toBeVisible({ timeout: 15_000 });
  for (let question = 0; question < 5; question += 1) {
    await page.locator('[data-correct="true"]').click();
    await page.getByTestId('quiz-next').click();
  }
  await page.getByTestId('quiz-finish').click();
}

test('walks from the introduction into the Three.js battle', async ({ page }) => {
  await openBattle(page);

  await expect(page.getByTestId('battle-root').locator('canvas')).toBeVisible();
  await expect(page.locator('[data-hud="phase"]')).toHaveText('丛林接敌');
  await expect(page.getByTestId('staging-overlay')).toBeHidden();
});

test('locked battle cards stay on the overview', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('intro-next').click();
  await expect(page.locator('[data-battle-id]')).toHaveCount(6);
  await page.getByTestId('battle-card-xiangjiang').click({ force: true });
  await expect(page.getByTestId('coming-soon')).toContainText('即将开放');
});

test('pause menu exits back to the overview', async ({ page }) => {
  await openBattle(page);
  await pauseBattle(page);

  await expect(page.getByTestId('pause-resume')).toBeVisible();
  await expect(page.getByTestId('pause-restart')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('pause-exit').click();
  await expect(page.locator('[data-battle-id]')).toHaveCount(6);
});

test('pause menu can resume and restart through the loading screen', async ({ page }) => {
  await openBattle(page);
  await pauseBattle(page);

  await page.getByTestId('pause-resume').click();
  await expect(page.getByTestId('pause-overlay')).toBeHidden();

  await pauseBattle(page);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByTestId('pause-restart').click();
  await expect(page.getByTestId('battle-loading')).toBeVisible();
  await expect(page.getByTestId('battle-screen')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[data-battle-started="true"]')).toBeVisible({
    timeout: 30_000,
  });
});

test('victory enters the quiz and result flow', async ({ page }) => {
  await openBattle(page, { debug: true });
  await expect(page.getByTestId('debug-panel')).toBeVisible();

  await page.locator('[data-debug-action="victory"]').click();
  await completeQuiz(page);

  await expect(page.locator('.result-shell h1')).toHaveText('夺桥成功');
  await expect(page.getByTestId('result-quiz')).toContainText('5');
  await page.getByTestId('result-back').click();
  await expect(page.locator('[data-battle-id]')).toHaveCount(6);
});

test('refresh returns to the introduction', async ({ page }) => {
  await openBattle(page);
  await page.reload();
  await expect(page.getByTestId('intro-next')).toBeVisible();
});
