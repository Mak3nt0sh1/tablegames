export interface User {
  id: string;
  username: string;
  avatarUrl?: string;
}

export interface RoomData {
  id: string;
  host: User;
  gameId: string | null;
  isPrivate: boolean;
  players: User[];
  maxPlayers: number;
  status: 'waiting' | 'playing';
}
