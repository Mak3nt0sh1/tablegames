// src/types/api.ts
// Типы точно соответствующие нашему бэкенду

// ── Auth ──────────────────────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
}

export interface User {
  id: number;
  username: string;
  email: string;
  avatar_url?: string;
  created_at: string;
}

// ── Room ──────────────────────────────────────────────────────────────────────

export type RoomStatus = 'waiting' | 'playing' | 'finished';
export type GameType = 'uno';

export interface Room {
  id: number;
  uuid: string;
  name: string;
  host_id: number;
  invite_code: string;
  game_type: GameType | null;
  max_players: number;
  status: RoomStatus;
  has_password: boolean;
  created_at: string;
  expires_at: string;
}

export interface CreateRoomRequest {
  name: string;
  max_players?: number;
  password?: string;
}

export interface UpdateRoomRequest {
  name?: string;
  max_players?: number;
  password?: string | null; // null = убрать пароль
  game_type?: GameType;
}

export interface JoinByCodeRequest {
  password?: string;
}

// ── Game ──────────────────────────────────────────────────────────────────────

export type CardColor = 'red' | 'green' | 'blue' | 'yellow';
export type CardValue =
  | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9'
  | 'skip' | 'reverse' | 'draw_two';

export interface Card {
  id: number;
  color: CardColor;
  value: CardValue;
}

export interface GamePlayer {
  user_id: number;
  username: string;
  card_count: number;
  said_uno: boolean;
}

export interface GameState {
  phase: 'playing' | 'finished';
  winner?: number;
  top_card: Card;
  current_color: CardColor;
  current_turn: number;
  direction: 1 | -1;
  draw_pending: number;
  players: GamePlayer[];
  player_order: number[];
  draw_pile_size: number;
  your_hand: Card[];
}

// ── WebSocket Events ──────────────────────────────────────────────────────────

export interface WsMessage<T = unknown> {
  type: string;
  payload: T;
}

export interface RoomStatePayload {
  room_uuid: string;
  room_name: string;
  host_id: number;
  max_players: number;
  status: RoomStatus;
  players: Array<{ user_id: number; username: string; role: 'host' | 'player' }>;
}

export interface PlayerJoinedPayload {
  player: { user_id: number; username: string; role: string };
  total: number;
}

export interface PlayerLeftPayload {
  user_id: number;
  username: string;
  total: number;
}

export interface ChatPayload {
  user_id: number;
  username: string;
  text: string;
}

export interface GameStartedPayload {
  game_type: GameType;
  player_order: number[];
  players: GamePlayer[];
  top_card: Card;
  current_color: CardColor;
  current_turn: number;
  direction: number;
}

export interface GameStateUpdatePayload extends Omit<GameState, 'your_hand'> {
  event: string;
}

export interface YourHandPayload {
  user_id: number;
  hand: Card[];
}

export interface YourDrawnCardsPayload {
  user_id: number;
  cards: Card[];
}

export interface GameOverPayload {
  winner: number;
  scores: Record<number, number>;
  players: GamePlayer[];
}

export interface GameSelectedPayload {
  room_uuid: string;
  game_type: GameType;
}

export interface PlayerKickedPayload {
  room_uuid: string;
  by_user_id: number;
}

export interface UnoCalledPayload {
  user_id: number;
}

export interface UnoChallengePayload {
  challenger_id: number;
  target_id: number;
  cards_drawn: number;
  players: GamePlayer[];
}

// ── API Error ─────────────────────────────────────────────────────────────────

export interface ApiError {
  error: string;
}