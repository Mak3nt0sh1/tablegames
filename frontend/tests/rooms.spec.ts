// tests/rooms.spec.ts
import { test, expect, chromium } from '@playwright/test';
import { TEST_USERS, loginAs, createRoom, joinByCode, getInviteCode } from './helpers';

const { vasya, petya } = TEST_USERS;

test.describe('Rooms', () => {

  test('создание комнаты и переход в неё', async ({ page }) => {
    await loginAs(page, vasya.email, vasya.password);
    await page.getByRole('button', { name: 'Создать комнату' }).click();
    await expect(page).toHaveURL(/\/[0-9a-f-]{36}/);
    await expect(page.locator('text=Игроки')).toBeVisible();
  });

  test('хост отображается в комнате', async ({ page }) => {
    await loginAs(page, vasya.email, vasya.password);
    await createRoom(page);
    await expect(page.locator(`text=${vasya.username}`)).toBeVisible();
    await expect(page.locator('text=Хост')).toBeVisible();
  });

  test('вход по коду — второй игрок видит комнату', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await loginAs(page1, vasya.email, vasya.password);
    await createRoom(page1);
    const code = await getInviteCode(page1);

    await loginAs(page2, petya.email, petya.password);
    await joinByCode(page2, code);

    // Оба видят друг друга
    await expect(page1.locator(`text=${petya.username}`)).toBeVisible({ timeout: 5000 });
    await expect(page2.locator(`text=${vasya.username}`)).toBeVisible({ timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test('изменение максимума игроков', async ({ page }) => {
    await loginAs(page, vasya.email, vasya.password);
    await createRoom(page);
    await page.selectOption('select', '6');
    await expect(page.locator('text=6')).toBeVisible();
  });

  test('выбор игры хостом', async ({ page }) => {
    await loginAs(page, vasya.email, vasya.password);
    await createRoom(page);
    await page.selectOption('select[value=""]', 'uno');
    await expect(page.locator('text=UNO')).toBeVisible();
  });

  test('кик игрока хостом', async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const page1 = await ctx1.newPage();
    const page2 = await ctx2.newPage();

    await loginAs(page1, vasya.email, vasya.password);
    await createRoom(page1);
    const code = await getInviteCode(page1);

    await loginAs(page2, petya.email, petya.password);
    await joinByCode(page2, code);

    await page1.locator(`text=${petya.username}`).waitFor();
    await page1.getByRole('button', { name: 'Кик' }).click();

    // Петя выкинут в лобби
    await expect(page2).toHaveURL('/', { timeout: 5000 });

    await ctx1.close();
    await ctx2.close();
  });

  test('выход из комнаты', async ({ page }) => {
    await loginAs(page, vasya.email, vasya.password);
    const roomUrl = await (async () => {
      await page.getByRole('button', { name: 'Создать комнату' }).click();
      await page.waitForURL(/\/[0-9a-f-]{36}/);
      return page.url();
    })();

    await page.getByRole('button', { name: 'Закрыть комнату' }).click();
    await expect(page).toHaveURL('/');
    // Комната больше недоступна
    await page.goto(roomUrl);
    await expect(page).toHaveURL('/');
  });

  test('копирование инвайт ссылки', async ({ page }) => {
    await loginAs(page, vasya.email, vasya.password);
    await createRoom(page);
    await page.getByRole('button', { name: 'Копировать' }).click();
    await expect(page.locator('text=Скопировано')).toBeVisible();
  });

  test('навигация в профиль и обратно не выкидывает из комнаты', async ({ page }) => {
    await loginAs(page, vasya.email, vasya.password);
    await createRoom(page);
    const roomUrl = page.url();

    // Идём в профиль
    await page.getByRole('link', { name: 'Мой Профиль' }).click();
    await expect(page).toHaveURL('/profile');

    // Возвращаемся в комнату
    await page.goto(roomUrl);
    await expect(page.locator(`text=${vasya.username}`)).toBeVisible();
    await expect(page.locator('text=Хост')).toBeVisible();
  });

});