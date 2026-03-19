import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Copy, Check, UserPlus, Play, Settings, LogOut, Crown } from 'lucide-react';
import { rooms, game, auth } from '../api/client';
import Chat from '../components/Chat';
import { useSound } from '../hooks/useSound';
import { useNotifications } from '../hooks/useNotifications';
import { getSettings } from '../hooks/useSettings';
import VoiceChat from '../components/VoiceChat';
import { useWebSocket } from '../hooks/useWebSocket';
import type { Room as RoomType } from '../types';
import type { RoomStatePayload, ChatPayload} from '../types';

interface Player {
  user_id: number;
  username: string;
  role: 'host' | 'player';
}

export default function Room() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const me = auth.me();
  const [room, setRoom] = useState<RoomType | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [isCopied, setIsCopied] = useState(false);
  const [selectedGame, setSelectedGame] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  // Чат
  const [messages, setMessages] = useState<Array<ChatPayload & { id: number }>>([]);
  const msgIdRef = useRef(0);

  // Голосовой чат
  const [voiceUsers, setVoiceUsers] = useState<Array<{ user_id: number; username: string }>>([]);
  const [incomingOffer, setIncomingOffer] = useState<{ from_user_id: number; sdp: string } | null>(null);
  const [incomingAnswer, setIncomingAnswer] = useState<{ from_user_id: number; sdp: string } | null>(null);
  const [incomingIce, setIncomingIce] = useState<{ from_user_id: number; candidate: string; sdp_mid: string; sdp_mline_index: number } | null>(null);

  const isHost = room?.host_id === me?.id;
  const { play } = useSound();
  const { notify } = useNotifications();

  // Загружаем данные комнаты — если не в комнате, автоматически вступаем
  useEffect(() => {
    if (!roomId) return;
    const init = async () => {
      try {
        // Сначала пробуем получить комнату
        let r = await rooms.get(roomId);
        // Если не являемся членом — вступаем по UUID как коду (через invite ссылку)
        // WS подключение само проверит членство и вернёт 403 если нет
        setRoom(r);
        setSelectedGame(r.game_type || '');
      } catch {
        navigate('/');
      } finally {
        setLoading(false);
      }
    };
    init();
  }, [roomId]);

  // Авто-вход в войс если включено в настройках
  const voiceChatRef = useRef<{ handleJoin: () => void } | null>(null);
  useEffect(() => {
    if (!loading && getSettings().voiceAutoJoin) {
      // Небольшая задержка чтобы WS успел подключиться
      setTimeout(() => voiceChatRef.current?.handleJoin(), 1500);
    }
  }, [loading]);

  // WebSocket — реалтайм обновления
  const { sendChat, sendVoiceJoin, sendVoiceLeave, sendVoiceOffer, sendVoiceAnswer, sendVoiceIce } = useWebSocket(roomId ?? null, {
    onRoomState: (payload: RoomStatePayload) => {
      setPlayers(payload.players);
    },
    onPlayerJoined: (payload) => {
      setPlayers((prev) => {
        if (prev.find((p) => p.user_id === payload.player.user_id)) return prev;
        return [...prev, payload.player as Player];
      });
      play('player_joined');
      notify('Игрок зашёл', `${payload.player.username} подключился к комнате`);
    },
    onPlayerLeft: (payload) => {
      setPlayers((prev) => prev.filter((p) => p.user_id !== payload.user_id));
      play('player_left');
    },
    onGameSelected: (payload) => {
      setSelectedGame(payload.game_type);
    },
    onGameStarted: () => {
      navigate(`/${roomId}/game`);
    },
    onPlayerKicked: () => {
      // Это событие приходит только кикнутому игроку — просто редиректим
      navigate('/');
    },
    onRoomDeleted: () => {
      navigate('/');
    },
    onChatBroadcast: (payload) => {
      setMessages((prev) => [...prev, { ...payload, id: ++msgIdRef.current }]);
      if (payload.user_id !== me?.id) {
        play('chat_message');
        notify(payload.username, payload.text);
      }
    },
    onVoiceUserJoined: (payload) => {
      setVoiceUsers((prev) => {
        if (prev.find((u) => u.user_id === payload.user_id)) return prev;
        return [...prev, payload];
      });
    },
    onVoiceUserLeft: (payload) => {
      setVoiceUsers((prev) => prev.filter((u) => u.user_id !== payload.user_id));
    },
    onVoiceOffer: (payload) => setIncomingOffer(payload as any),
    onVoiceAnswer: (payload) => setIncomingAnswer(payload as any),
    onVoiceIceCandidate: (payload) => setIncomingIce(payload as any),
  });

  const inviteLink = `${window.location.origin}/join/${room?.invite_code ?? ''}`;

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Хост выбирает игру
  const handleSelectGame = async (gameType: string) => {
    if (!roomId || !isHost) return;
    setSelectedGame(gameType);
    try {
      await rooms.update(roomId, { game_type: gameType as 'uno' });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  // Старт игры
  const handleStartGame = async () => {
    if (!roomId || !selectedGame) return;
    setStarting(true);
    setError('');
    try {
      await game.start(roomId, selectedGame);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка запуска');
      setStarting(false);
    }
  };

  // Выйти из комнаты
  const handleLeave = async () => {
    if (!roomId) return;
    try {
      if (isHost) {
        await rooms.delete(roomId);
        navigate('/');
      } else {
        await rooms.leave(roomId);
        navigate('/');
      }
    } catch (e: unknown) {
      // Если уже вышли или комната удалена — всё равно редиректим
      console.error('Leave error:', e);
      navigate('/');
    }
  };

  // Кикнуть игрока
  const handleKick = async (userId: number) => {
    if (!roomId) return;
    try {
      await rooms.kick(roomId, userId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-gray-400">Загрузка комнаты...</div>
      </div>
    );
  }

  if (!room) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

      {/* Левая колонка */}
      <div className="lg:col-span-2 space-y-6">

        {error && (
          <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            {error}
          </p>
        )}

        {/* Инвайт блок */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6">
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <UserPlus size={20} className="text-indigo-400" />
            Пригласить друзей
          </h3>
          <div className="flex items-center gap-2 mb-3">
            <input
              type="text"
              readOnly
              value={inviteLink}
              className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-gray-300 focus:outline-none"
            />
            <button
              onClick={copyLink}
              className={`px-6 py-3 rounded-xl font-medium transition-colors flex items-center gap-2 ${
                isCopied ? 'bg-green-500/20 text-green-400' : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
            >
              {isCopied ? <><Check size={18} /> Скопировано</> : <><Copy size={18} /> Копировать</>}
            </button>
          </div>
          <p className="text-gray-500 text-sm">
            Код комнаты: <span className="font-mono text-indigo-400 font-bold tracking-widest">{room.invite_code}</span>
          </p>
        </div>

        {/* Список игроков */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 min-h-[300px]">
          <h3 className="text-lg font-bold text-white mb-4">
            Игроки ({players.length}/{room.max_players})
          </h3>
          <div className="space-y-3">
            {players.map((player) => (
              <div
                key={player.user_id}
                className={`flex items-center justify-between p-4 rounded-xl ${
                  player.role === 'host'
                    ? 'bg-gray-950 border border-indigo-500/30'
                    : 'bg-gray-950 border border-gray-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                    {player.username[0].toUpperCase()}
                  </div>
                  <span className="font-medium text-white">
                    {player.username}
                    {player.role === 'host' && (
                      <span className="ml-2 text-indigo-400 text-xs inline-flex items-center gap-1">
                        <Crown size={12} /> Хост
                      </span>
                    )}
                    {player.user_id === me?.id && (
                      <span className="ml-2 text-gray-500 text-xs">(вы)</span>
                    )}
                  </span>
                </div>
                {isHost && player.role !== 'host' && (
                  <button
                    onClick={() => handleKick(player.user_id)}
                    className="text-red-400 hover:text-red-300 text-xs px-3 py-1 rounded-lg hover:bg-red-500/10 transition-colors"
                  >
                    Кик
                  </button>
                )}
              </div>
            ))}

            {/* Пустые слоты */}
            {Array.from({ length: room.max_players - players.length }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-gray-950 border border-dashed border-gray-800 p-4 rounded-xl text-gray-500"
              >
                <div className="w-10 h-10 rounded-full border border-dashed border-gray-700 flex items-center justify-center">+</div>
                <span>Ожидание подключения...</span>
              </div>
            ))}
          </div>
        </div>
      {/* Чат — показываем только если включено в настройках */}
        {getSettings().chatVisible && <Chat
          messages={messages}
          currentUserId={me?.id ?? 0}
          onSend={sendChat}
        />}
      </div>

      {/* Правая колонка */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex flex-col">
        <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
          <Settings size={20} className="text-gray-400" />
          Настройки стола
        </h3>

        <div className="space-y-5 flex-1">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Во что играем?</label>
            {isHost ? (
              <select
                value={selectedGame}
                onChange={(e) => handleSelectGame(e.target.value)}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="">Не выбрана</option>
                <option value="uno">UNO</option>
              </select>
            ) : (
              <div className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-gray-400">
                {selectedGame ? selectedGame.toUpperCase() : 'Хост выбирает игру...'}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Максимум игроков</label>
            {isHost ? (
              <select
                value={room.max_players}
                onChange={async (e) => {
                  const val = parseInt(e.target.value);
                  try {
                    const updated = await rooms.update(roomId!, { max_players: val });
                    setRoom(updated);
                  } catch (err: unknown) {
                    setError(err instanceof Error ? err.message : 'Ошибка');
                  }
                }}
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-indigo-500"
              >
                {Array.from({ length: 9 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n} disabled={n < players.length}>
                    {n} {n < players.length ? '(меньше текущих)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-gray-300">
                {players.length} / {room.max_players}
              </div>
            )}
          </div>
        </div>

        {/* Голосовой чат */}
        <VoiceChat
          ref={voiceChatRef}
          currentUserId={me?.id ?? 0}
          voiceUsers={voiceUsers}
          onJoin={sendVoiceJoin}
          onLeave={sendVoiceLeave}
          onOffer={sendVoiceOffer}
          onAnswer={sendVoiceAnswer}
          onIce={sendVoiceIce}
          incomingOffer={incomingOffer}
          incomingAnswer={incomingAnswer}
          incomingIce={incomingIce}
        />

        <div className="space-y-3 mt-6">
          {isHost && (
            <button
              onClick={handleStartGame}
              disabled={!selectedGame || starting || players.length < 2}
              className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold rounded-xl px-4 py-4 transition-colors flex items-center justify-center gap-2"
            >
              <Play size={20} />
              {starting ? 'Запускаем...' : players.length < 2 ? 'Нужно 2+ игроков' : 'Начать игру'}
            </button>
          )}

          <button
            onClick={handleLeave}
            className="w-full bg-gray-800 hover:bg-red-500/20 hover:text-red-400 text-gray-400 font-medium rounded-xl px-4 py-3 transition-colors flex items-center justify-center gap-2"
          >
            <LogOut size={18} />
            {isHost ? 'Закрыть комнату' : 'Покинуть комнату'}
          </button>
        </div>
      </div>

    </div>
  );
}