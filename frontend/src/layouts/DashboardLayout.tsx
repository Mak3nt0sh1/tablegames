import { useState, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Gamepad2, User, Settings as SettingsIcon, LogOut, BookOpen} from "lucide-react";
import { auth, rooms, game } from "../api/client";
import type { Room } from "../types";
import { useVoice } from "../context/VoiceContext"; // Импортируем хук войса

export default function DashboardLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = auth.me();
  const { leave: leaveVoice } = useVoice(); // Получаем метод выхода из войса

  const [activeGame, setActiveGame] = useState<{ room_uuid: string } | null>(null);
  const [myRoom, setMyRoom] = useState<Room | null>(null);

  useEffect(() => {
    const fetchState = () => {
      game.activeGame().then((res) => {
        setActiveGame(res.active && res.room_uuid ? { room_uuid: res.room_uuid } : null);
      }).catch(() => setActiveGame(null));

      rooms.my().then((res) => {
        setMyRoom(res.room || null);
      }).catch(() => setMyRoom(null));
    };

    fetchState();
    
    const interval = setInterval(fetchState, 5000);
    return () => clearInterval(interval);
  }, [location.pathname]);

  const handleLogout = () => {
    leaveVoice(); // ПЕРВОЕ: Отключаем микрофон и закрываем соединения
    auth.logout(); // ВТОРОЕ: Удаляем токен
    navigate('/login'); // ТРЕТЬЕ: Переходим на вход
  };

  const navItems = [
    { path: "/", label: "Игровое Лобби", icon: <Gamepad2 size={20} /> },
    { path: "/profile", label: "Мой Профиль", icon: <User size={20} /> },
    { path: "/rules", label: "Правила игр", icon: <BookOpen size={20} /> },
    { path: "/settings", label: "Настройки", icon: <SettingsIcon size={20} /> }
  ];

  const isCurrentRoom = myRoom && location.pathname === `/${myRoom.uuid}`;
  const isCurrentGame = activeGame && location.pathname === `/${activeGame.room_uuid}/game`;

  return (
    <div className="flex h-screen bg-gray-950 text-gray-100 font-sans overflow-hidden">
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center font-bold text-white">T</div>
          <h1 className="text-xl font-bold tracking-tight">TableGames</h1>
        </div>
        
        <nav className="flex-1 px-4 space-y-1 mt-4">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link 
                key={item.path} 
                to={item.path} 
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                  isActive ? "bg-indigo-500/10 text-indigo-400" : "hover:bg-gray-800 text-gray-400 hover:text-gray-200"
                }`}
              >
                {item.icon}
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-xl text-gray-400 hover:bg-red-500/10 hover:text-red-400 transition-all"
          >
            <LogOut size={20} />
            <span className="font-medium">Выйти</span>
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-gray-900/50 backdrop-blur-sm border-b border-gray-800 flex items-center justify-between px-8 z-10">
          <h2 className="text-lg font-semibold text-gray-200">
            {navItems.find(i => i.path === location.pathname)?.label || "Настольные игры"}
          </h2>
          
          <div 
            onClick={() => navigate('/profile')}
            className="flex items-center gap-3 cursor-pointer hover:bg-gray-800 p-2 rounded-lg transition-colors"
          >
            <div className="w-8 h-8 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-full flex items-center justify-center font-bold text-white text-sm">
              {currentUser?.username?.[0]?.toUpperCase() ?? "Г"}
            </div>
            <span className="font-medium">{currentUser?.username ?? "Гость"}</span>
          </div>
        </header>

        <main className="flex-1 p-8 overflow-y-auto flex flex-col gap-6">
          {myRoom && !activeGame && !isCurrentRoom && (
            <div className="bg-gray-900 border border-indigo-500/30 rounded-2xl p-4 flex items-center justify-between shrink-0">
              <div>
                <p className="text-white font-bold">Хотите вернуться в: {myRoom.name}</p>
                <p className="text-gray-400 text-sm mt-1">
                  {myRoom.status === 'waiting' ? 'Ожидание игроков' : myRoom.status === 'playing' ? 'Игра идёт' : 'Игра завершена'} 
                  · Код: <span className="font-mono text-indigo-400">{myRoom.invite_code}</span>
                </p>
              </div>
              <button
                onClick={() => navigate(`/${myRoom.uuid}`)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl transition-colors shrink-0"
              >
                Вернуться
              </button>
            </div>
          )}

          {activeGame && !isCurrentGame && (
            <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-4 flex items-center justify-between shrink-0">
              <div>
                <p className="text-indigo-400 font-bold">У вас есть активная игра!</p>
                <p className="text-gray-400 text-sm mt-1">Игра ждёт вашего хода</p>
              </div>
              <button
                onClick={() => navigate(`/${activeGame.room_uuid}/game`)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl transition-colors shrink-0"
              >
                Вернуться
              </button>
            </div>
          )}

          <Outlet />
        </main>
      </div>
    </div>
  );
}