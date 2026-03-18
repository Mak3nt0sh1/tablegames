// src/hooks/useSound.ts
// Хук для воспроизведения звуковых эффектов через Web Audio API
// Не требует никаких аудио файлов — генерирует звуки программно

import { useRef, useCallback } from 'react';
import { getSettings } from './useSettings';

function createAudioContext(): AudioContext | null {
  try {
    return new (window.AudioContext || (window as any).webkitAudioContext)();
  } catch {
    return null;
  }
}

// Воспроизвести короткий тон
function playTone(
  ctx: AudioContext,
  frequency: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume = 0.3,
) {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);

  gainNode.gain.setValueAtTime(volume, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + duration);
}

export function useSound() {
  const ctxRef = useRef<AudioContext | null>(null);

  const getCtx = useCallback((): AudioContext | null => {
    if (!ctxRef.current) {
      ctxRef.current = createAudioContext();
    }
    if (ctxRef.current?.state === 'suspended') {
      ctxRef.current.resume();
    }
    return ctxRef.current;
  }, []);

  const play = useCallback((soundName: SoundName) => {
    if (!getSettings().soundEnabled) return;
    const ctx = getCtx();
    if (!ctx) return;

    switch (soundName) {
      case 'card_play':
        // Короткий щелчок карты
        playTone(ctx, 800, 0.08, 'square', 0.15);
        break;

      case 'card_draw':
        // Мягкий шорох
        playTone(ctx, 300, 0.12, 'sine', 0.1);
        break;

      case 'player_joined':
        // Два восходящих тона
        playTone(ctx, 440, 0.1, 'sine', 0.2);
        setTimeout(() => playTone(ctx, 660, 0.15, 'sine', 0.2), 100);
        break;

      case 'player_left':
        // Нисходящий тон
        playTone(ctx, 440, 0.1, 'sine', 0.15);
        setTimeout(() => playTone(ctx, 330, 0.15, 'sine', 0.15), 100);
        break;

      case 'uno_called':
        // Резкий сигнал
        playTone(ctx, 1000, 0.05, 'square', 0.3);
        setTimeout(() => playTone(ctx, 1200, 0.1, 'square', 0.3), 60);
        break;

      case 'your_turn':
        // Приятный звон — твой ход
        playTone(ctx, 523, 0.1, 'sine', 0.25);
        setTimeout(() => playTone(ctx, 659, 0.1, 'sine', 0.25), 120);
        setTimeout(() => playTone(ctx, 784, 0.2, 'sine', 0.25), 240);
        break;

      case 'game_over_win':
        // Победная мелодия
        [523, 659, 784, 1047].forEach((freq, i) => {
          setTimeout(() => playTone(ctx, freq, 0.2, 'sine', 0.3), i * 150);
        });
        break;

      case 'game_over_lose':
        // Проигрышный звук
        [440, 392, 349, 330].forEach((freq, i) => {
          setTimeout(() => playTone(ctx, freq, 0.2, 'sine', 0.2), i * 150);
        });
        break;

      case 'chat_message':
        // Тихий пинг
        playTone(ctx, 880, 0.08, 'sine', 0.12);
        break;

      case 'error':
        // Ошибка
        playTone(ctx, 200, 0.15, 'sawtooth', 0.2);
        break;
    }
  }, [getCtx]);

  return { play };
}

export type SoundName =
  | 'card_play'
  | 'card_draw'
  | 'player_joined'
  | 'player_left'
  | 'uno_called'
  | 'your_turn'
  | 'game_over_win'
  | 'game_over_lose'
  | 'chat_message'
  | 'error';