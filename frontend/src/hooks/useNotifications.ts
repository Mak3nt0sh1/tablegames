// src/hooks/useNotifications.ts
import { useCallback } from 'react';
import { getSettings } from './useSettings';

export function useNotifications() {
  const notify = useCallback((title: string, body?: string) => {
    console.log('--- ПОПЫТКА ОТПРАВИТЬ УВЕДОМЛЕНИЕ ---');
    
    if (!getSettings().notificationsEnabled) {
      console.warn('[Notify] Выключено в настройках игры');
      return;
    }
    
    if (!('Notification' in window)) {
      console.error('[Notify] Браузер не поддерживает Notification API');
      return;
    }

    if (Notification.permission !== 'granted') {
      console.error('[Notify] Нет прав! Статус:', Notification.permission);
      return;
    }
    
    // Если окно в фокусе — Chrome часто блокирует уведомления, чтобы не дублировать инфу
    if (document.hasFocus()) {
      console.log('[Notify] Окно в фокусе, уведомление пропущено');
      return;
    }

    try {
      // Chrome требует иконку по полному пути, либо правильному относительному
      const icon = window.location.origin + '/favicon.ico';
      
      const n = new Notification(title, {
        body: body || '',
        icon: icon,
        tag: 'tablegames-alert', // Группирует уведомления, чтобы не спамить 100 штук
      });

      console.log('[Notify] Создан объект Notification:', n);

      n.onclick = () => {
        window.focus();
        n.close();
      };
      
      setTimeout(() => n.close(), 5000);
    } catch (e) {
      console.error('[Notify] Критическая ошибка при создании:', e);
    }
  }, []);

  return { notify };
}