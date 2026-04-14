// src/hooks/useNotifications.ts
import { useCallback } from 'react';
import { getSettings } from './useSettings';

export function useNotifications() {
  const notify = useCallback((title: string, body?: string) => {
    // 1. Проверяем настройки внутри игры
    if (!getSettings().notificationsEnabled) {
      console.log('[Notify] Заблокировано: Уведомления выключены в настройках игры');
      return;
    }
    
    // 2. Проверяем поддержку браузером
    if (!('Notification' in window)) {
      console.log('[Notify] Заблокировано: Браузер не поддерживает уведомления');
      return;
    }

    // 3. Проверяем права в самом браузере
    if (Notification.permission !== 'granted') {
      console.log(`[Notify] Заблокировано: Нет прав в браузере. Текущий статус: ${Notification.permission}`);
      return;
    }
    
    // 4. Проверяем фокус (чтобы не спамить, когда игрок и так смотрит в игру)
    if (document.hasFocus()) {
      console.log('[Notify] Пропущено: Окно игры сейчас активно (в фокусе)');
      return;
    }

    try {
      const n = new Notification(title, {
        body,
        icon: '/favicon.ico',
      });

      console.log(`[Notify] УСПЕШНО ОТПРАВЛЕНО: ${title}`);

      // Автозакрытие через 4 секунды
      setTimeout(() => n.close(), 4000);

      // Фокус на вкладку при клике на уведомление
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch (e) {
      console.error('[Notify] Ошибка при создании уведомления:', e);
    }
  }, []);

  return { notify };
}