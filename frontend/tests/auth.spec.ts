// tests/auth.spec.ts
import { test, expect } from '@playwright/test';
import { TEST_USERS, loginAs } from './helpers';

const { vasya } = TEST_USERS;

test.describe('Auth', () => {

  test('регистрация нового пользователя', async ({ page }) => {
    const unique = Date.now();
    await page.goto('/register');
    await page.getByPlaceholder('SuperPlayer').fill(`user_${unique}`);
    await page.getByPlaceholder('player@mail.com').fill(`user_${unique}@test.com`);
    await page.getByPlaceholder('Создайте надёжный пароль').fill('password123');
    await page.getByRole('button', { name: 'Создать аккаунт' }).click();
    await expect(page).toHaveURL('/');
    // Проверяем что имя отображается в хедере
    await expect(page.locator('header')).toContainText(`user_${unique}`);
  });

  test('логин существующего пользователя', async ({ page }) => {
    await loginAs(page, vasya.email, vasya.password);
    await expect(page).toHaveURL('/');
    await expect(page.locator('header')).toContainText(vasya.username);
  });

  test('неверный пароль показывает ошибку', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('player@mail.com').fill(vasya.email);
    await page.getByPlaceholder('••••••••').fill('wrongpassword');
    await page.getByRole('button', { name: 'Войти' }).click();
    await expect(page.locator('text=/ошибка|неверн|invalid/i')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('регистрация с занятым email показывает ошибку', async ({ page }) => {
    await page.goto('/register');
    await page.getByPlaceholder('SuperPlayer').fill('other_user');
    await page.getByPlaceholder('player@mail.com').fill(vasya.email);
    await page.getByPlaceholder('Создайте надёжный пароль').fill('password123');
    await page.getByRole('button', { name: 'Создать аккаунт' }).click();
    await expect(page.locator('text=/ошибка|уже|exist/i')).toBeVisible();
  });

  test('выход из аккаунта', async ({ page }) => {
    await loginAs(page, vasya.email, vasya.password);
    await page.getByRole('button', { name: 'Выйти' }).click();
    await expect(page).toHaveURL('/login');
    // После выхода защищённые роуты недоступны
    await page.goto('/');
    await expect(page).toHaveURL('/login');
  });

  test('незалогиненный редиректится на /login', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL('/login');
  });

  test('Enter в поле пароля отправляет форму', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('player@mail.com').fill(vasya.email);
    await page.getByPlaceholder('••••••••').fill(vasya.password);
    await page.getByPlaceholder('••••••••').press('Enter');
    await expect(page).toHaveURL('/');
  });

});