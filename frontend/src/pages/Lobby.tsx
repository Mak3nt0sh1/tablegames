import { Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createRoomApi } from "../api/mockApi";

export default function Lobby() {
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    // Вызываем фейковый API без блокировки потока, 
    // чтобы мгновенно перекинуть пользователя в комнату
    createRoomApi().then((newRoom) => {
      navigate(`/${newRoom.id}`);
    }).catch(err => {
      console.error("Ошибка при создании:", err);
      // Если API упал, всё равно создаем фейковую для теста фронта
      const fallbackId = "room-" + Math.random().toString(36).substring(2, 9);
      navigate(`/${fallbackId}`);
    });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      
      {/* Карточка "Создать стол" - теперь это кнопка! */}
      <button 
        onClick={handleCreateRoom}
        className="bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-indigo-500/50 hover:bg-gray-800/50 transition-all cursor-pointer flex flex-col items-center justify-center min-h-[200px] gap-4 w-full text-left"
      >
        <div className="w-12 h-12 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-2xl">+</div>
        <h3 className="font-semibold text-lg text-white">Создать пустую комнату</h3>
      </button>

      {/* Пример уже созданного стола */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col justify-between min-h-[200px]">
        <div>
          <div className="flex justify-between items-start mb-4">
            <h3 className="font-bold text-white text-lg">Монополия</h3>
            <span className="bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded-md font-medium">Ожидание</span>
          </div>
          <p className="text-gray-400 text-sm">Хост: Mak3nt0sh1</p>
        </div>
        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Users size={16} /> 2/4
          </div>
          <button className="bg-gray-800 hover:bg-gray-700 text-white text-sm px-4 py-2 rounded-lg transition-colors">
            Войти
          </button>
        </div>
      </div>

    </div>
  );
}
