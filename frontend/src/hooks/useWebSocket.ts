// src/hooks/useWebSocket.ts
// Хук для работы с WebSocket — подключение к комнате и обработка событий

import { useEffect, useRef, useCallback } from 'react';
import { wsUrl } from '../api/client';
import type {
  WsMessage,
  RoomStatePayload,
  PlayerJoinedPayload,
  PlayerLeftPayload,
  ChatPayload,
  GameStartedPayload,
  GameStateUpdatePayload,
  YourHandPayload,
  YourDrawnCardsPayload,
  GameOverPayload,
  GameSelectedPayload,
  PlayerKickedPayload,
  UnoCalledPayload,
  UnoChallengePayload,
} from '../types';

// Все возможные обработчики событий — передавай только те что нужны
export interface WsHandlers {
  onRoomState?: (payload: RoomStatePayload) => void;
  onPlayerJoined?: (payload: PlayerJoinedPayload) => void;
  onPlayerLeft?: (payload: PlayerLeftPayload) => void;
  onChatBroadcast?: (payload: ChatPayload) => void;
  onGameStarted?: (payload: GameStartedPayload) => void;
  onGameStateUpdate?: (payload: GameStateUpdatePayload) => void;
  onYourHand?: (payload: YourHandPayload) => void;
  onYourDrawnCards?: (payload: YourDrawnCardsPayload) => void;
  onGameOver?: (payload: GameOverPayload) => void;
  onGameSelected?: (payload: GameSelectedPayload) => void;
  onPlayerKicked?: (payload: PlayerKickedPayload) => void;
  onRoomDeleted?: () => void;
  onUnoCalled?: (payload: UnoCalledPayload) => void;
  onUnoChallenge?: (payload: UnoChallengePayload) => void;
  onVoiceUserJoined?: (payload: { user_id: number; username: string }) => void;
  onVoiceUserLeft?: (payload: { user_id: number; username: string }) => void;
  onVoiceOffer?: (payload: { from_user_id: number; target_user_id: number; sdp: string }) => void;
  onVoiceAnswer?: (payload: { from_user_id: number; target_user_id: number; sdp: string }) => void;
  onVoiceIceCandidate?: (payload: { from_user_id: number; target_user_id: number; candidate: string; sdp_mid: string; sdp_mline_index: number }) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (e: Event) => void;
}

export function useWebSocket(roomUUID: string | null, handlers: WsHandlers) {
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef(handlers);

  // Обновляем handlers без пересоздания соединения
  useEffect(() => {
    handlersRef.current = handlers;
  });

  // Подключаемся когда есть roomUUID
  useEffect(() => {
    if (!roomUUID) return;

    const url = wsUrl(roomUUID);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WS] connected to room', roomUUID);
      handlersRef.current.onOpen?.();
    };

    ws.onclose = () => {
      console.log('[WS] disconnected');
      handlersRef.current.onClose?.();
    };

    ws.onerror = (e) => {
      console.error('[WS] error', e);
      handlersRef.current.onError?.(e);
    };

    ws.onmessage = (e) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(e.data);
      } catch {
        console.warn('[WS] invalid JSON', e.data);
        return;
      }

      const h = handlersRef.current;
      switch (msg.type) {
        case 'room_state':        h.onRoomState?.(msg.payload as RoomStatePayload); break;
        case 'player_joined':     h.onPlayerJoined?.(msg.payload as PlayerJoinedPayload); break;
        case 'player_left':       h.onPlayerLeft?.(msg.payload as PlayerLeftPayload); break;
        case 'chat_broadcast':    h.onChatBroadcast?.(msg.payload as ChatPayload); break;
        case 'game_started':      h.onGameStarted?.(msg.payload as GameStartedPayload); break;
        case 'game_state_update': h.onGameStateUpdate?.(msg.payload as GameStateUpdatePayload); break;
        case 'your_hand':         h.onYourHand?.(msg.payload as YourHandPayload); break;
        case 'your_drawn_cards':  h.onYourDrawnCards?.(msg.payload as YourDrawnCardsPayload); break;
        case 'game_over':         h.onGameOver?.(msg.payload as GameOverPayload); break;
        case 'game_selected':     h.onGameSelected?.(msg.payload as GameSelectedPayload); break;
        case 'player_kicked':     h.onPlayerKicked?.(msg.payload as PlayerKickedPayload); break;
        case 'room_deleted':      h.onRoomDeleted?.(); break;
        case 'uno_called':        h.onUnoCalled?.(msg.payload as UnoCalledPayload); break;
        case 'uno_challenge':     h.onUnoChallenge?.(msg.payload as UnoChallengePayload); break;
        case 'voice_user_joined': h.onVoiceUserJoined?.(msg.payload as any); break;
        case 'voice_user_left':   h.onVoiceUserLeft?.(msg.payload as any); break;
        case 'voice_offer':       h.onVoiceOffer?.(msg.payload as any); break;
        case 'voice_answer':      h.onVoiceAnswer?.(msg.payload as any); break;
        case 'voice_ice_candidate': h.onVoiceIceCandidate?.(msg.payload as any); break;
        default:
          console.log('[WS] unknown event:', msg.type, msg.payload);
      }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [roomUUID]);

  // Отправка сообщений
  const send = useCallback((type: string, payload?: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload: payload ?? {} }));
    } else {
      console.warn('[WS] not connected, cannot send:', type);
    }
  }, []);

  // Готовые методы для отправки
  const sendChat = useCallback((text: string) => send('chat_message', { text }), [send]);
  const sendPing = useCallback(() => send('ping'), [send]);
  const sendVoiceJoin = useCallback(() => send('voice_join'), [send]);
  const sendVoiceLeave = useCallback(() => send('voice_leave'), [send]);
  const sendVoiceOffer = useCallback((targetUserId: number, sdp: string) =>
    send('voice_offer', { target_user_id: targetUserId, sdp }), [send]);
  const sendVoiceAnswer = useCallback((targetUserId: number, sdp: string) =>
    send('voice_answer', { target_user_id: targetUserId, sdp }), [send]);
  const sendVoiceIce = useCallback((targetUserId: number, candidate: string, sdpMid: string, sdpMlineIndex: number) =>
    send('voice_ice_candidate', { target_user_id: targetUserId, candidate, sdp_mid: sdpMid, sdp_mline_index: sdpMlineIndex }), [send]);

  return {
    send,
    sendChat,
    sendPing,
    sendVoiceJoin,
    sendVoiceLeave,
    sendVoiceOffer,
    sendVoiceAnswer,
    sendVoiceIce,
    isConnected: () => wsRef.current?.readyState === WebSocket.OPEN,
  };
}