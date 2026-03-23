// tests/game.spec.ts
import { test, expect } from '@playwright/test';
import { TEST_USERS, loginAs, createRoom, joinByCode, getInviteCode } from './helpers';

const { vasya, petya } = TEST_USERS;

test.describe('UNO Game', () => {

  test('запуск игры — оба игрока попадают в UnoGame', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await loginAs(page1, vasya.email, vasya.password);
    await createRoom(page1);
    const code = await getInviteCode(page1);

    await loginAs(page2, petya.email, petya.password);
    await joinByCode(page2, code);
    await page1.locator(`text=${petya.username}`).waitFor({ timeout: 5000 });

    // Выбираем UNO и запускаем
    await page1.selectOption('select', 'uno');
    await page1.getByRole('button', { name: 'Начать игру' }).click();

    // Оба переходят в игру
    await expect(page1).toHaveURL(/\/game$/, { timeout: 5000 });
    await expect(page2).toHaveURL(/\/game$/, { timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test('игроки видят свои карты', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await loginAs(page1, vasya.email, vasya.password);
    await createRoom(page1);
    const code = await getInviteCode(page1);

    await loginAs(page2, petya.email, petya.password);
    await joinByCode(page2, code);
    await page1.locator(`text=${petya.username}`).waitFor({ timeout: 5000 });
    await page1.selectOption('select', 'uno');
    await page1.getByRole('button', { name: 'Начать игру' }).click();
    await page1.waitForURL(/\/game$/);
    await page2.waitForURL(/\/game$/);

    // У каждого 7 карт
    const cards1 = page1.locator('.your-cards > div, [data-testid="card"]');
    // Проверяем что карта сброса видна
    await expect(page1.locator('text=Карта сброса')).toBeVisible();
    await expect(page2.locator('text=Карта сброса')).toBeVisible();

    // Проверяем индикатор хода
    await expect(page1.locator('text=/Ваш ход|Ожидайте/')).toBeVisible();
    await expect(page2.locator('text=/Ваш ход|Ожидайте/')).toBeVisible();

    await ctx1.close();
    await ctx2.close();
  });

  test('возврат в комнату из игры', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await loginAs(page1, vasya.email, vasya.password);
    await createRoom(page1);
    const code = await getInviteCode(page1);

    await loginAs(page2, petya.email, petya.password);
    await joinByCode(page2, code);
    await page1.locator(`text=${petya.username}`).waitFor({ timeout: 5000 });
    await page1.selectOption('select', 'uno');
    await page1.getByRole('button', { name: 'Начать игру' }).click();
    await page1.waitForURL(/\/game$/);

    // Нажимаем "В комнату"
    await page1.getByRole('button', { name: '← В комнату' }).click();
    await expect(page1).toHaveURL(/\/[0-9a-f-]{36}$/);
    await expect(page1.locator('text=Вернуться в игру')).toBeVisible();

    // Возвращаемся в игру
    await page1.getByRole('button', { name: 'Вернуться в игру' }).click();
    await expect(page1).toHaveURL(/\/game$/);

    await ctx1.close();
    await ctx2.close();
  });

  test('принудительное завершение игры хостом', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await loginAs(page1, vasya.email, vasya.password);
    await createRoom(page1);
    const code = await getInviteCode(page1);

    await loginAs(page2, petya.email, petya.password);
    await joinByCode(page2, code);
    await page1.locator(`text=${petya.username}`).waitFor({ timeout: 5000 });
    await page1.selectOption('select', 'uno');
    await page1.getByRole('button', { name: 'Начать игру' }).click();
    await page1.waitForURL(/\/game$/);
    await page2.waitForURL(/\/game$/);

    // Хост выходит в комнату и завершает игру
    await page1.getByRole('button', { name: '← В комнату' }).click();
    await page1.waitForURL(/\/[0-9a-f-]{36}$/);
    await page1.getByRole('button', { name: '✕ Завершить игру' }).click();

    // Второй игрок получает событие и попадает в комнату
    await expect(page2).toHaveURL(/\/[0-9a-f-]{36}$/, { timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test('виджет активной игры в лобби', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await loginAs(page1, vasya.email, vasya.password);
    await createRoom(page1);
    const code = await getInviteCode(page1);

    await loginAs(page2, petya.email, petya.password);
    await joinByCode(page2, code);
    await page1.locator(`text=${petya.username}`).waitFor({ timeout: 5000 });
    await page1.selectOption('select', 'uno');
    await page1.getByRole('button', { name: 'Начать игру' }).click();
    await page1.waitForURL(/\/game$/);

    // Первый игрок уходит в лобби
    await page1.goto('/');
    await expect(page1.locator('text=У вас есть активная игра')).toBeVisible({ timeout: 3000 });

    // Нажимает вернуться
    await page1.getByRole('button', { name: 'Вернуться' }).click();
    await expect(page1).toHaveURL(/\/game$/);

    await ctx1.close();
    await ctx2.close();
  });

});