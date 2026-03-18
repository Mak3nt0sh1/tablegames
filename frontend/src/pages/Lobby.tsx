import { useState } from 'react';
import { Users, Plus, LogIn } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { rooms, join } from '../api/client';

export default function Lobby() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [showJoin, setShowJoin] = useState(false);

  // Создать комнату
  const handleCreateRoom = async () => {
    setError('');
    setLoading(true);
    try {
      const room = await rooms.create({ name: 'Моя комната', max_players: 4 });
      navigate(`/${room.uuid}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка создания комнаты');
    } finally {
      setLoading(false);
    }
  };

  // Войти по коду
  const handleJoinByCode = async () => {
    if (!joinCode.trim()) return;
    setError('');
    setLoading(true);
    try {
      const room = await join.byCode(joinCode.trim().toUpperCase());
      navigate(`/${room.uuid}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Неверный код комнаты');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* Создать комнату */}
        <button
          onClick={handleCreateRoom}
          disabled={loading}
          className="bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-indigo-500/50 hover:bg-gray-800/50 transition-all cursor-pointer flex flex-col items-center justify-center min-h-[200px] gap-4 w-full disabled:opacity-50"
        >
          <div className="w-12 h-12 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
            <Plus size={24} />
          </div>
          <h3 className="font-semibold text-lg text-white">
            {loading ? 'Создаём...' : 'Создать комнату'}
          </h3>
        </button>

        {/* Войти по коду */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col justify-between min-h-[200px]">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <LogIn size={20} className="text-indigo-400" />
              <h3 className="font-bold text-white text-lg">Войти по коду</h3>
            </div>
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleJoinByCode()}
              maxLength={8}
              placeholder="XXXXXXXX"
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white text-center tracking-widest font-mono text-lg focus:outline-none focus:border-indigo-500"
            />
          </div>
          <button
            onClick={handleJoinByCode}
            disabled={loading || !joinCode.trim()}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-medium rounded-xl px-4 py-3 mt-4 transition-colors flex items-center justify-center gap-2"
          >
            <Users size={16} />
            Войти в комнату
          </button>
        </div>

      </div>
    </div>
  );
}
