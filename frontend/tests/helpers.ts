// tests/helpers.ts
import { Page, expect } from '@playwright/test';

const BASE_API = 'http://localhost:8080';

// ── API хелперы ───────────────────────────────────────────────────────────────

export async function apiRegister(username: string, email: string, password: string) {
  const res = await fetch(`${BASE_API}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
  return res.json();
}

export async function apiLogin(email: string, password: string): Promise<string> {
  const res = await fetch(`${BASE_API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  return data.token;
}

export async function apiCleanup(emails: string[]) {
  // Чистим тестовых пользователей через прямой SQL не доступен из JS
  // Используем регистрацию — если уже существует, просто логинимся
}

// ── Page хелперы ──────────────────────────────────────────────────────────────

export async function loginAs(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByPlaceholder('player@mail.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL('/');
}

export async function registerAndLogin(page: Page, username: string, email: string, password: string) {
  await page.goto('/register');
  await page.getByPlaceholder('SuperPlayer').fill(username);
  await page.getByPlaceholder('player@mail.com').fill(email);
  await page.getByPlaceholder('Создайте надёжный пароль').fill(password);
  await page.getByRole('button', { name: 'Создать аккаунт' }).click();
  await expect(page).toHaveURL('/');
}

export async function createRoom(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Создать комнату' }).click();
  await page.waitForURL(/\/[0-9a-f-]{36}/);
  return page.url().split('/').pop()!;
}

export async function getInviteCode(page: Page): Promise<string> {
  const codeEl = page.locator('text=/[A-Z0-9]{8}/').first();
  return await codeEl.textContent() ?? '';
}

export async function joinByCode(page: Page, code: string) {
  await page.getByPlaceholder('XXXXXXXX').fill(code);
  await page.getByRole('button', { name: 'Войти в комнату' }).click();
  await page.waitForURL(/\/[0-9a-f-]{36}/);
}

export const TEST_USERS = {
  vasya: { username: 'e2e_vasya', email: 'e2e_vasya@test.com', password: 'password123' },
  petya: { username: 'e2e_petya', email: 'e2e_petya@test.com', password: 'password123' },
};