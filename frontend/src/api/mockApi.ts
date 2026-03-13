import { User, RoomData } from "../types";

// Имитация данных текущего пользователя (кто сейчас залогинен)
export const currentUser: User = {
  id: "user_1",
  username: "Mak3nt0sh1",
};

// Имитация функции создания комнаты
export const createRoomApi = async (): Promise<RoomData> => {
  // Искусственная задержка, как при реальном запросе
  await new Promise(resolve => setTimeout(resolve, 500)); 
  
  return {
    id: "room-" + Math.random().toString(36).substring(2, 9),
    host: currentUser,
    gameId: null,
    isPrivate: false,
    players: [currentUser],
    maxPlayers: 4,
    status: 'waiting'
  };
};
