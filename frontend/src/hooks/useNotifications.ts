// src/hooks/useNotifications.ts
// Браузерные уведомления когда вкладка не активна

import { useCallback, useEffect } from 'react';
import { getSettings } from './useSettings';

export function useNotifications() {

  // Запрашиваем разрешение при включении настройки
  useEffect(() => {
    if (getSettings().notificationsEnabled && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }
  }, []);

  const notify = useCallback((title: string, body?: string) => {
    if (!getSettings().notificationsEnabled) return;
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    // Показываем только когда вкладка не активна
    if (document.visibilityState === 'visible') return;

    const n = new Notification(title, {
      body,
      icon: '/favicon.ico',
      badge: '/favicon.ico',
    });

    // Автозакрытие через 4 секунды
    setTimeout(() => n.close(), 4000);

    // Фокус на вкладку при клике
    n.onclick = () => {
      window.focus();
      n.close();
    };
  }, []);

  return { notify };
}