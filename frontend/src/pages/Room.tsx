import { useState } from "react";
import { useParams } from "react-router-dom";
import { Copy, Check, UserPlus, Play, Settings } from "lucide-react";

export default function Room() {
  const { roomId } = useParams(); // Получаем ID комнаты из URL
  const [isCopied, setIsCopied] = useState(false);
  const [selectedGame, setSelectedGame] = useState("Не выбрана");

  const inviteLink = `http://localhost:5173/${roomId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      {/* Левая колонка: Игроки и Настройки (занимает 2 части) */}
      <div className="lg:col-span-2 space-y-6">
        
        {/* Блок со ссылкой-приглашением */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <UserPlus size={20} className="text-indigo-400" />
            Пригласить друзей
          </h3>
          <div className="flex items-center gap-2">
            <input 
              type="text" 
              readOnly 
              value={inviteLink}
              className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-gray-300 focus:outline-none"
            />
            <button 
              onClick={copyLink}
              className={`px-6 py-3 rounded-xl font-medium transition-colors flex items-center gap-2 ${
                isCopied ? "bg-green-500/20 text-green-400" : "bg-indigo-600 hover:bg-indigo-500 text-white"
              }`}
            >
              {isCopied ? <><Check size={18} /> Скопировано</> : <><Copy size={18} /> Копировать</>}
            </button>
          </div>
        </div>

        {/* Блок списка игроков в комнате */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 min-h-[300px]">
          <h3 className="text-lg font-bold text-white mb-4">Ожидание игроков (1/4)</h3>
          <div className="space-y-3">
            {/* Карточка хоста */}
            <div className="flex items-center justify-between bg-gray-950 border border-indigo-500/30 p-4 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-full"></div>
                <span className="font-medium text-white">Mak3nt0sh1 <span className="text-indigo-400 text-xs ml-2">(Хост)</span></span>
              </div>
            </div>
            
            {/* Пустые слоты */}
            <div className="flex items-center gap-3 bg-gray-950 border border-dashed border-gray-800 p-4 rounded-xl text-gray-500">
              <div className="w-10 h-10 rounded-full border border-dashed border-gray-700 flex items-center justify-center">+</div>
              <span>Ожидание подключения...</span>
            </div>
          </div>
        </div>
      </div>

      {/* Правая колонка: Выбор игры и старт */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col">
        <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
          <Settings size={20} className="text-gray-400" />
          Настройки стола
        </h3>

        <div className="space-y-5 flex-1">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Во что играем?</label>
            <select 
              value={selectedGame}
              onChange={(e) => setSelectedGame(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
            >
              <option disabled>Не выбрана</option>
              <option>Шахматы</option>
              <option>Монополия</option>
              <option>Дурак</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Видимость</label>
            <div className="flex bg-gray-950 border border-gray-800 rounded-xl p-1">
              <button className="flex-1 py-2 text-sm font-medium bg-gray-800 text-white rounded-lg">По ссылке</button>
              <button className="flex-1 py-2 text-sm font-medium text-gray-400 hover:text-white transition-colors">Публичная</button>
            </div>
          </div>
        </div>

        <button 
          disabled={selectedGame === "Не выбрана"}
          className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold rounded-xl px-4 py-4 mt-6 transition-colors flex items-center justify-center gap-2"
        >
          <Play size={20} />
          Начать игру
        </button>
      </div>

    </div>
  );
}
