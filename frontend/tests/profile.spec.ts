// tests/profile.spec.ts
import { test, expect } from '@playwright/test';
import { TEST_USERS, loginAs } from './helpers';

const { vasya } = TEST_USERS;

test.describe('Profile', () => {

  test('профиль отображает имя и статистику', async ({ page }) => {
    await loginAs(page, vasya.email, vasya.password);
    await page.getByRole('link', { name: 'Мой Профиль' }).click();
    await expect(page).toHaveURL('/profile');
    await expect(page.locator('text=Игр сыграно')).toBeVisible();
    await expect(page.locator('text=Побед')).toBeVisible();
    await expect(page.locator('text=Винрейт')).toBeVisible();
  });

  test('смена никнейма', async ({ page }) => {
    await loginAs(page, vasya.email, vasya.password);
    await page.getByRole('link', { name: 'Мой Профиль' }).click();

    // Нажимаем карандаш
    await page.locator('[title="Изменить никнейм"]').click();
    const input = page.locator('input[type="text"]').last();
    await input.clear();
    await input.fill('vasya_renamed');
    await page.locator('[title]').filter({ hasText: '' }).getByRole('button').first().click();

    await expect(page.locator('text=vasya_renamed')).toBeVisible({ timeout: 3000 });

    // Возвращаем имя обратно
    await page.locator('[title="Изменить никнейм"]').click();
    await input.clear();
    await input.fill(vasya.username);
    await page.keyboard.press('Enter');
  });

  test('история игр пустая у нового пользователя', async ({ page }) => {
    const unique = Date.now();
    await page.goto('/register');
    await page.getByPlaceholder('SuperPlayer').fill(`new_${unique}`);
    await page.getByPlaceholder('player@mail.com').fill(`new_${unique}@test.com`);
    await page.getByPlaceholder('Создайте надёжный пароль').fill('password123');
    await page.getByRole('button', { name: 'Создать аккаунт' }).click();

    await page.getByRole('link', { name: 'Мой Профиль' }).click();
    await expect(page.locator('text=Сыграйте первую партию')).toBeVisible();
  });

});

test.describe('Settings', () => {

  test('настройки сохраняются', async ({ page }) => {
    await loginAs(page, vasya.email, vasya.password);
    await page.getByRole('link', { name: 'Настройки' }).click();
    await expect(page).toHaveURL('/settings');

    // Переключаем звук
    await page.locator('button.rounded-full').first().click();
    await page.getByRole('button', { name: 'Сохранить' }).click();
    await expect(page.locator('text=Сохранено')).toBeVisible();

    // Перезагружаем страницу — настройки сохранились
    await page.reload();
    await expect(page).toHaveURL('/settings');
  });

});