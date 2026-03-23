// src/hooks/useSettings.ts
// Хук для работы с настройками приложения

import { useState } from 'react';

export interface AppSettings {
  soundEnabled: boolean;
  notificationsEnabled: boolean;
  chatVisible: boolean;
  voiceAutoJoin: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  soundEnabled: true,
  notificationsEnabled: true,
  chatVisible: true,
  voiceAutoJoin: false,
};

const STORAGE_KEY = 'tg_settings';

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const save = (patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return { settings, save };
}

// Получить настройки без хука (для использования вне компонентов)
export function getSettings(): AppSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}