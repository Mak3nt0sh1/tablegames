// src/api/client.ts
// HTTP клиент для работы с бэкендом

import type {
  LoginRequest, RegisterRequest, AuthResponse, User,
  Room, CreateRoomRequest, UpdateRoomRequest, JoinByCodeRequest,
  GameState, ApiError,
} from '../types';

const BASE_URL = 'http://localhost:8080';

// ── Token storage ─────────────────────────────────────────────────────────────

export const token = {
  get: (): string | null => localStorage.getItem('token'),
  set: (t: string) => localStorage.setItem('token', t),
  clear: () => localStorage.removeItem('token'),
};

// ── Base fetch ────────────────────────────────────────────────────────────────

async function request<T>(
  path: string,
  options: RequestInit = {},
  auth = true,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (auth) {
    const t = token.get();
    if (t) headers['Authorization'] = `Bearer ${t}`;
  }

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error((data as ApiError).error || 'Unknown error');
  }

  return data as T;
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export const auth = {
  register: (body: RegisterRequest): Promise<User> =>
    request('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }, false),

  login: async (body: LoginRequest): Promise<void> => {
    const data = await request<AuthResponse>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify(body) },
      false,
    );
    token.set(data.token);
  },

  logout: () => token.clear(),

  // Декодируем JWT на клиенте чтобы получить userID и username
  me: (): { id: number; username: string } | null => {
    const t = token.get();
    if (!t) return null;
    try {
      const payload = JSON.parse(atob(t.split('.')[1]));
      return { id: payload.sub, username: payload.username };
    } catch {
      return null;
    }
  },
};

// ── Rooms ─────────────────────────────────────────────────────────────────────

export const rooms = {
  my: (): Promise<{ room: Room | null }> =>
    request('/api/rooms/my'),

  create: (body: CreateRoomRequest): Promise<Room> =>
    request('/api/rooms', { method: 'POST', body: JSON.stringify(body) }),

  get: (uuid: string): Promise<Room> =>
    request(`/api/rooms/${uuid}`),

  update: (uuid: string, body: UpdateRoomRequest): Promise<Room> =>
    request(`/api/rooms/${uuid}`, { method: 'PATCH', body: JSON.stringify(body) }),

  delete: (uuid: string): Promise<void> =>
    request(`/api/rooms/${uuid}`, { method: 'DELETE' }),

  createInviteLink: (uuid: string): Promise<{ invite_link: string }> =>
    request(`/api/rooms/${uuid}/invite`, { method: 'POST' }),

  kick: (uuid: string, userId: number): Promise<void> =>
    request(`/api/rooms/${uuid}/kick`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    }),

  leave: (uuid: string): Promise<void> =>
    request(`/api/rooms/${uuid}/leave`, { method: 'DELETE' }),
};

// ── Join ──────────────────────────────────────────────────────────────────────

export const join = {
  byCode: (code: string, body: JoinByCodeRequest = {}): Promise<Room> =>
    request(`/api/join/code/${code}`, { method: 'POST', body: JSON.stringify(body) }),

  byToken: (inviteToken: string): Promise<Room> =>
    request(`/api/join/token/${inviteToken}`, { method: 'POST' }),
};

// ── Game ──────────────────────────────────────────────────────────────────────

export const game = {
  start: (uuid: string, gameType = 'uno'): Promise<void> =>
    request(`/api/rooms/${uuid}/game/start`, {
      method: 'POST',
      body: JSON.stringify({ game_type: gameType }),
    }),

  getState: (uuid: string): Promise<GameState> =>
    request(`/api/rooms/${uuid}/game/state`),

  playCard: (uuid: string, cardId: number): Promise<void> =>
    request(`/api/rooms/${uuid}/game/play`, {
      method: 'POST',
      body: JSON.stringify({ card_id: cardId }),
    }),

  drawCard: (uuid: string): Promise<void> =>
    request(`/api/rooms/${uuid}/game/draw`, { method: 'POST' }),

  sayUno: (uuid: string): Promise<void> =>
    request(`/api/rooms/${uuid}/game/uno`, { method: 'POST' }),

  status: (uuid: string): Promise<{ status: string }> =>
    request(`/api/rooms/${uuid}/game/status`),

  activeGame: (): Promise<{ active: boolean; room_uuid?: string }> =>
    request('/api/game/active'),

  forceEnd: (uuid: string): Promise<void> =>
    request(`/api/rooms/${uuid}/game/end`, { method: 'POST' }),

  reset: (uuid: string): Promise<void> =>
    request(`/api/rooms/${uuid}/game/reset`, { method: 'POST' }),

  challengeUno: (uuid: string, targetUserId: number): Promise<void> =>
    request(`/api/rooms/${uuid}/game/challenge`, {
      method: 'POST',
      body: JSON.stringify({ target_user_id: targetUserId }),
    }),
};

// ── WebSocket URL ─────────────────────────────────────────────────────────────

export const wsUrl = (roomUUID: string): string => {
  const t = token.get();
  return `ws://localhost:8080/api/rooms/${roomUUID}/ws?token=${t}`;
};

// ── Profile ───────────────────────────────────────────────────────────────────

export interface ProfileData {
  id: number;
  username: string;
  email: string;
  avatar_url: string | null;
  games_played: number;
  wins: number;
  win_rate: number;
  history: Array<{
    game_type: string;
    result: 'win' | 'lose';
    score: number;
    played_at: string;
  }>;
  new_token?: string;
}

export const profile = {
  get: (): Promise<ProfileData> =>
    request('/api/profile'),

  updateUsername: (username: string): Promise<ProfileData> =>
    request('/api/profile', { method: 'PATCH', body: JSON.stringify({ username }) }),

  uploadAvatar: async (file: File): Promise<ProfileData> => {
    const formData = new FormData();
    formData.append('avatar', file);
    const t = token.get();
    const res = await fetch(`${BASE_URL}/api/profile/avatar`, {
      method: 'POST',
      headers: t ? { Authorization: `Bearer ${t}` } : {},
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data;
  },
};