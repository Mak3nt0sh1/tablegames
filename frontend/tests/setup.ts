// tests/setup.ts — глобальный setup: создаём тестовых пользователей
import { TEST_USERS, apiRegister } from './helpers';

async function globalSetup() {
  for (const user of Object.values(TEST_USERS)) {
    try {
      await apiRegister(user.username, user.email, user.password);
      console.log(`Created user: ${user.username}`);
    } catch {
      console.log(`User already exists: ${user.username}`);
    }
  }
}

export default globalSetup;