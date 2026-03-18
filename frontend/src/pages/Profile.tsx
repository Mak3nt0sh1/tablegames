import { useState, useEffect, useRef } from 'react';
import { User, Gamepad2, Trophy, Camera, Check, X, Pencil } from 'lucide-react';
import { profile as profileApi } from '../api/client';
import type { ProfileData } from '../api/client';

export default function Profile() {
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Редактирование имени
  const [editingName, setEditingName] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState('');

  // Аватар
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    profileApi.get()
      .then(setData)
      .catch(() => setError('Не удалось загрузить профиль'))
      .finally(() => setLoading(false));
  }, []);

  const handleStartEdit = () => {
    setNewUsername(data?.username ?? '');
    setNameError('');
    setEditingName(true);
  };

  const handleSaveName = async () => {
    if (!newUsername.trim()) return;
    setSavingName(true);
    setNameError('');
    try {
      const updated = await profileApi.updateUsername(newUsername.trim());
      setData(updated);
      setEditingName(false);
    } catch (e: unknown) {
      setNameError(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSavingName(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const updated = await profileApi.uploadAvatar(file);
      setData(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-gray-400">Загрузка профиля...</div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-red-400">
        {error}
      </div>
    );
  }

  const avatarUrl = data?.avatar_url
    ? `http://localhost:8080${data.avatar_url}`
    : null;

  return (
    <div className="max-w-2xl space-y-6">

      {/* Карточка игрока */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex items-center gap-6">

        {/* Аватар */}
        <div className="relative flex-shrink-0">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-3xl font-bold text-white">
            {avatarUrl ? (
              <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              data?.username?.[0]?.toUpperCase() ?? '?'
            )}
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            className="absolute -bottom-1 -right-1 w-7 h-7 bg-indigo-600 hover:bg-indigo-500 rounded-full flex items-center justify-center transition-colors"
            title="Изменить аватар"
          >
            {uploadingAvatar
              ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
              : <Camera size={14} className="text-white" />
            }
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>

        {/* Имя и ID */}
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveName()}
                  maxLength={50}
                  className="bg-gray-950 border border-gray-700 rounded-xl px-3 py-1.5 text-white focus:outline-none focus:border-indigo-500 text-lg font-bold"
                  autoFocus
                />
                <button
                  onClick={handleSaveName}
                  disabled={savingName}
                  className="p-1.5 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30"
                >
                  <Check size={16} />
                </button>
                <button
                  onClick={() => setEditingName(false)}
                  className="p-1.5 bg-gray-800 text-gray-400 rounded-lg hover:bg-gray-700"
                >
                  <X size={16} />
                </button>
              </div>
              {nameError && <p className="text-red-400 text-sm">{nameError}</p>}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold text-white truncate">{data?.username}</h2>
              <button
                onClick={handleStartEdit}
                className="p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
                title="Изменить никнейм"
              >
                <Pencil size={14} />
              </button>
            </div>
          )}
          <p className="text-gray-400 mt-1 flex items-center gap-2 text-sm">
            <User size={13} />
            {data?.email}
          </p>
        </div>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col items-center gap-2">
          <Gamepad2 size={20} className="text-indigo-400" />
          <span className="text-2xl font-bold text-white">{data?.games_played ?? 0}</span>
          <span className="text-gray-400 text-sm text-center">Игр сыграно</span>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col items-center gap-2">
          <Trophy size={20} className="text-yellow-400" />
          <span className="text-2xl font-bold text-white">{data?.wins ?? 0}</span>
          <span className="text-gray-400 text-sm text-center">Побед</span>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col items-center gap-2">
          <span className="text-indigo-400 font-bold text-lg">%</span>
          <span className="text-2xl font-bold text-white">
            {data?.games_played ? Math.round(data.win_rate) : 0}
          </span>
          <span className="text-gray-400 text-sm text-center">Винрейт</span>
        </div>
      </div>

      {/* История игр */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
        <h3 className="text-lg font-bold text-white mb-4">История игр</h3>
        {data?.history && data.history.length > 0 ? (
          <div className="space-y-2">
            {data.history.map((game, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-gray-950 rounded-xl px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${
                    game.result === 'win' ? 'bg-green-400' : 'bg-red-400'
                  }`} />
                  <span className="text-white font-medium uppercase text-sm">{game.game_type}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-sm font-semibold ${
                    game.result === 'win' ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {game.result === 'win' ? 'Победа' : 'Поражение'}
                  </span>
                  <span className="text-gray-500 text-xs">
                    {new Date(game.played_at).toLocaleDateString('ru-RU')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-gray-600">
            <Gamepad2 size={40} className="mb-3 opacity-30" />
            <p>История игр появится здесь</p>
            <p className="text-sm mt-1">Сыграйте первую партию!</p>
          </div>
        )}
      </div>

    </div>
  );
}