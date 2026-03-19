// src/pages/UnoGame.tsx
import { useState, useEffect, useRef} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSound } from '../hooks/useSound';
import { useWebSocket } from '../hooks/useWebSocket';
import { useNotifications } from '../hooks/useNotifications';
import { game as gameApi, auth } from '../api/client';
import Chat from '../components/Chat';
import VoiceMini from '../components/VoiceMini';
import { useVoice } from '../context/VoiceContext';
import UnoCard from '../components/UnoCard';
import type { GameState, GamePlayer, GameStateUpdatePayload } from '../types';

const colorBg: Record<string, string> = {
  red: 'bg-red-500', green: 'bg-green-500',
  blue: 'bg-blue-500', yellow: 'bg-yellow-400',
};

const positions = [
  'top-4 left-1/2 -translate-x-1/2',
  'right-4 top-1/2 -translate-y-1/2',
  'left-4 top-1/2 -translate-y-1/2',
];

export default function UnoGame() {
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();
  const { play } = useSound();
  const { notify } = useNotifications();
  const me = auth.me();

  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [unoAlert, setUnoAlert] = useState('');
  const [unoIntended, setUnoIntended] = useState(false); // игрок нажал UNO до броска

  // Чат и войс
  const [messages, setMessages] = useState<Array<{ user_id: number; username: string; text: string; id: number }>>([]);
  const msgIdRef = useRef(0);
  const [showChat, setShowChat] = useState(false);
  const [gameOver, setGameOver] = useState<null | { winner: number; players: GamePlayer[] }>(null);

  // Загружаем начальное состояние
  useEffect(() => {
    if (!roomId) return;
    gameApi.getState(roomId)
      .then((state) => {
        setGameState(state);
        setLoading(false);
      })
      .catch(() => {
        setError('Не удалось загрузить состояние игры');
        setLoading(false);
      });
  }, [roomId]);

  // WebSocket — получаем обновления в реалтайм
  const { setVoiceUsers, handleOffer, handleAnswer, handleIce, initPeer, leave: leaveVoice } = useVoice();

  const { sendChat, sendVoiceJoin, sendVoiceLeave, sendVoiceOffer, sendVoiceAnswer, sendVoiceIce } = useWebSocket(roomId ?? null, {
    onGameStateUpdate: (payload: GameStateUpdatePayload) => {
      setGameState((prev) => prev ? {
        ...prev,
        top_card: payload.top_card,
        current_color: payload.current_color,
        current_turn: payload.current_turn,
        direction: payload.direction,
        draw_pending: payload.draw_pending,
        players: payload.players,
        draw_pile_size: payload.draw_pile_size,
      } : prev);

      // Звук и уведомление когда наш ход
      if (payload.current_turn === me?.id) {
        play('your_turn');
        notify('Ваш ход!', 'Сыграйте карту или возьмите из колоды');
      }
    },

    onYourHand: (payload) => {
      if (payload.user_id === me?.id) {
        setGameState((prev) => prev ? { ...prev, your_hand: payload.hand } : prev);
      }
    },

    onYourDrawnCards: (payload) => {
      if (payload.user_id === me?.id) {
        setGameState((prev) => prev ? {
          ...prev,
          your_hand: [...prev.your_hand, ...payload.cards],
        } : prev);
        play('card_draw');
      }
    },

    onUnoCalled: (payload) => {
      const player = gameState?.players.find(p => p.user_id === payload.user_id);
      const name = player?.username ?? `Игрок ${payload.user_id}`;
      setUnoAlert(payload.user_id === me?.id ? 'Вы крикнули UNO!' : `${name} кричит UNO!`);
      setTimeout(() => setUnoAlert(''), 2500);
      play('uno_called');
    },

    onDrawTwoApplied: (payload: any) => {
      const player = gameState?.players.find(p => p.user_id === payload.user_id);
      const name = payload.user_id === me?.id ? 'Вы берёте' : `${player?.username ?? 'Игрок'} берёт`;
      setUnoAlert(`${name} +${payload.count} карты!`);
      setTimeout(() => setUnoAlert(''), 2000);
    },
    onUnoChallenge: (payload) => {
      if (payload.target_id === me?.id) {
        setGameState((prev) => prev ? { ...prev, players: payload.players } : prev);
        setUnoAlert(`Вас поймали без UNO! +${payload.cards_drawn} карты`);
        setTimeout(() => setUnoAlert(''), 2500);
      }
    },

    onGameOver: (payload) => {
      setGameOver({ winner: payload.winner, players: payload.players });
      if (payload.winner === me?.id) {
        play('game_over_win');
      } else {
        play('game_over_lose');
      }
    },

    onRoomDeleted: () => { leaveVoice(); navigate('/'); },
    onChatBroadcast: (payload) => {
      setMessages((prev) => [...prev, { ...payload, id: ++msgIdRef.current }]);
    },
    onVoiceUserJoined: (payload) => {
      const user = { user_id: payload.user_id, username: payload.username };
      setVoiceUsers((prev) => prev.find((u) => u.user_id === user.user_id) ? prev : [...prev, user]);
      initPeer(payload.user_id, sendVoiceOffer, sendVoiceIce).catch(console.error);
    },
    onVoiceUserLeft: (payload) => {
      setVoiceUsers((prev) => prev.filter((u) => u.user_id !== payload.user_id));
    },
    onVoiceOffer: (payload: any) => handleOffer(payload.from_user_id, payload.sdp, sendVoiceAnswer, sendVoiceIce),
    onVoiceAnswer: (payload: any) => handleAnswer(payload.from_user_id, payload.sdp),
    onVoiceIceCandidate: (payload: any) => handleIce(payload.from_user_id, payload.candidate, payload.sdp_mid, payload.sdp_mline_index),
  });

  // Сыграть карту
  const handlePlayCard = async (cardId: number) => {
    if (!roomId || gameState?.current_turn !== me?.id) return;
    try {
      await gameApi.playCard(roomId, cardId);
      play('card_play');
      // Убираем карту из руки сразу после успешного ответа сервера
      setGameState((prev) => {
        if (!prev) return prev;
        const newHand = prev.your_hand.filter(c => c.id !== cardId);
        // Если было намерение UNO и теперь осталась 1 карта — вызываем sayUno
        if (unoIntended && newHand.length === 1) {
          setUnoIntended(false);
          gameApi.sayUno(roomId!).then(() => {
            setUnoAlert('Вы крикнули UNO!');
            setTimeout(() => setUnoAlert(''), 2500);
          }).catch(() => {});
        } else if (newHand.length > 1) {
          setUnoIntended(false); // сбрасываем если вдруг взяли карту
        }
        return { ...prev, your_hand: newHand };
      });
    } catch (e: unknown) {
      // Не анимируем ошибку на карте — просто показываем текст
      setError(e instanceof Error ? e.message : 'Нельзя сыграть эту карту');
      setTimeout(() => setError(''), 2000);
      play('error');
    }
  };

  // Взять карту
  const handleDrawCard = async () => {
    if (!roomId || gameState?.current_turn !== me?.id) return;
    try {
      await gameApi.drawCard(roomId);
      // Обновляем состояние — ход переходит после взятия
      const updated = await gameApi.getState(roomId);
      setGameState(updated);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка');
      setTimeout(() => setError(''), 2000);
    }
  };

  // Challenge — поймать соперника без UNO
  const handleChallenge = async (targetId: number) => {
    if (!roomId) return;
    try {
      await gameApi.challengeUno(roomId, targetId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Нельзя сделать вызов');
      setTimeout(() => setError(''), 2000);
    }
  };

  // Кнопка UNO
  const handleSayUno = async () => {
    if (!roomId) return;
    if (gameState && gameState.your_hand.length === 2) {
      // Запоминаем намерение — скажем UNO автоматически после броска
      setUnoIntended(true);
      play('uno_called');
      setUnoAlert('UNO готово! Бросайте карту');
      setTimeout(() => setUnoAlert(''), 2000);
      return;
    }
    // При 1 карте — вызываем API напрямую
    try {
      await gameApi.sayUno(roomId);
      play('uno_called');
      setUnoAlert('Вы крикнули UNO!');
      setTimeout(() => setUnoAlert(''), 2500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Ошибка');
      setTimeout(() => setError(''), 2000);
    }
  };

  if (loading) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gray-950">
        <p className="text-white text-xl">Загрузка игры...</p>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-gray-950">
        <div className="text-center">
          <p className="text-red-400 text-xl mb-4">{error || 'Игра не найдена'}</p>
          <button onClick={() => { leaveVoice(); navigate('/'); }} className="bg-indigo-600 text-white px-6 py-3 rounded-xl">
            В лобби
          </button>
        </div>
      </div>
    );
  }

  const isMyTurn = gameState.current_turn === me?.id;
  const opponents = gameState.players.filter(p => p.user_id !== me?.id);
  const winnerPlayer = gameOver
    ? [...gameState.players, ...(gameOver.players ?? [])].find(p => p.user_id === gameOver.winner)
    : undefined;

  return (
    <div
      className="relative w-screen h-screen overflow-hidden select-none"
      style={{ background: 'radial-gradient(ellipse at center, #1e3a6e 0%, #0f1f4a 50%, #060d24 100%)' }}
    >
      {/* Текстура сукна */}
      <div className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `repeating-linear-gradient(
            45deg, transparent, transparent 2px,
            rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px
          )`
        }}
      />

      {/* Овальный стол */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[820px] h-[520px] rounded-[50%] z-0"
        style={{
          background: 'radial-gradient(ellipse at center, #1a4a7a 0%, #0f2d5c 70%, #091f45 100%)',
          boxShadow: '0 0 0 14px #c8a96e, 0 0 0 20px #7a5c2a, 0 24px 80px rgba(0,0,0,0.9)',
        }}
      />

      {/* Блик на столе */}
      <div
        className="absolute top-1/2 left-1/2 w-[560px] h-[240px] rounded-[50%] z-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse, rgba(100,180,255,0.06) 0%, transparent 70%)',
          transform: 'translate(-50%, -80%)',
        }}
      />

      {/* Кнопка выхода */}
      <button
        onClick={async () => {
          if (roomId) {
            try { await gameApi.reset(roomId); } catch {}
          }
          navigate(`/${roomId}`, { replace: false, state: { from: 'game' } });
        }}
        className="absolute top-4 left-4 z-50 text-white/60 hover:text-white text-sm bg-black/30 hover:bg-black/50 px-3 py-2 rounded-lg transition-all"
      >
        ← В комнату
      </button>

      {/* Инфо панель */}
      <div className="absolute top-4 right-4 z-50 text-white/60 text-sm bg-black/30 px-3 py-2 rounded-lg flex items-center gap-3">
        <span>{gameState.direction === 1 ? '↻ По часовой' : '↺ Против часовой'}</span>
        <span className="text-white/40">|</span>
        <span>Колода: {gameState.draw_pile_size}</span>
        {gameState.draw_pending > 0 && (
          <span className="text-red-400 font-bold">+{gameState.draw_pending} штраф!</span>
        )}
      </div>

      {/* Ошибка */}
      {error && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-red-600/90 text-white font-bold text-sm px-5 py-2 rounded-xl shadow-xl">
          {error}
        </div>
      )}

      {/* UNO алерт */}
      {unoAlert && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white font-black text-lg px-6 py-3 rounded-2xl shadow-xl animate-bounce">
          {unoAlert}
        </div>
      )}

      {/* Соперники */}
      {opponents.map((player, idx) => {
        const isActive = gameState.current_turn === player.user_id;
        return (
          <div key={player.user_id} className={`absolute ${positions[idx]} flex flex-col items-center gap-2 z-10`}>
            <div className={`text-sm font-bold px-3 py-1 rounded-full transition-all shadow-lg ${
              isActive ? 'bg-yellow-400 text-black scale-110 shadow-yellow-400/40' : 'bg-black/50 text-white'
            }`}>
              {player.username}
              {player.said_uno && <span className="ml-1 text-red-500 font-black"> UNO!</span>}
            </div>
            <div className="flex gap-1 flex-wrap justify-center max-w-xs">
              {Array.from({ length: player.card_count }).map((_, i) => (
                <div
                  key={i}
                  className="w-10 h-14 rounded-xl shadow-lg flex items-center justify-center text-white/20 text-lg"
                  style={{ background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)', border: '2px solid #334155' }}
                >
                  🂠
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Центральный стол — колода и сброс */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-10 z-20">
        {/* Колода */}
        <div className="flex flex-col items-center gap-2">
          <div
            onClick={handleDrawCard}
            className={`w-16 h-24 rounded-xl flex flex-col items-center justify-center text-white shadow-2xl transition-all
              ${isMyTurn
                ? 'cursor-pointer hover:scale-110 hover:-translate-y-1 hover:shadow-white/20'
                : 'opacity-60 cursor-not-allowed'
              }`}
            style={{
              background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
              border: '2px solid #475569',
              boxShadow: isMyTurn ? '0 8px 24px rgba(0,0,0,0.5)' : undefined,
            }}
          >
            <span className="text-3xl">🂠</span>
            <span className="text-xs mt-1 text-white/50">Взять</span>
          </div>
        </div>

        {/* Разделитель */}
        <div className="w-px h-20 bg-white/10" />

        {/* Карта сброса */}
        <div className="flex flex-col items-center gap-2">
          <div className={`w-5 h-5 rounded-full ring-2 ring-white shadow-lg ${colorBg[gameState.current_color] ?? 'bg-gray-500'}`} />
          <UnoCard card={gameState.top_card} />
          <span className="text-white/30 text-xs">Карта сброса</span>
        </div>
      </div>

      {/* UNO кнопка — показываем когда осталась 1 карта */}
      {(gameState.your_hand.length === 2 || gameState.your_hand.length === 1) && isMyTurn && (
        <button
          onClick={handleSayUno}
          className="absolute bottom-36 right-8 z-50 bg-red-600 hover:bg-red-500 text-white font-black text-xl px-6 py-3 rounded-2xl shadow-xl animate-bounce"
          style={{ boxShadow: '0 0 20px rgba(239,68,68,0.5)' }}
        >
          UNO!
        </button>
      )}

      {/* Challenge кнопки — поймать соперника у которого 1 карта и не крикнул UNO */}
      {opponents
        .filter(p => p.card_count === 1 && !p.said_uno)
        .map((p, idx) => (
          <button
            key={p.user_id}
            onClick={() => handleChallenge(p.user_id)}
            className="absolute z-50 bg-orange-500 hover:bg-orange-400 text-white font-black text-sm px-4 py-2 rounded-xl shadow-xl animate-pulse"
            style={{ bottom: `${140 + idx * 50}px`, left: '8px' }}
          >
            🎯 Поймать {p.username}!
          </button>
        ))
      }



      {/* Мои карты */}
      <div className="absolute bottom-0 left-0 right-0 z-30">
        <div
          className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)' }}
        />
        <div className="relative flex justify-center mb-3">
          <div className={`text-sm font-bold px-4 py-2 rounded-full shadow-lg transition-all ${
            isMyTurn
              ? 'bg-yellow-400 text-black shadow-yellow-400/40'
              : 'bg-black/50 text-white'
          }`}>
            {isMyTurn ? '🎮 Ваш ход!' : '⏳ Ожидайте своего хода...'}
          </div>
        </div>
        <div className="relative flex justify-center items-end gap-1 pb-6 px-4 flex-wrap">
          {gameState.your_hand.map((card) => (
            <UnoCard
              key={card.id}
              card={card}
              onClick={() => handlePlayCard(card.id)}
              disabled={!isMyTurn}
            />
          ))}
        </div>
      </div>

      {/* Боковая панель: войс + чат */}
      <div className="absolute right-4 top-16 bottom-4 z-40 flex flex-col gap-2 w-64">
        {/* Войс чат */}
        <VoiceMini
          onJoinWs={sendVoiceJoin}
          onLeaveWs={sendVoiceLeave}
          onOffer={sendVoiceOffer}
          onAnswer={sendVoiceAnswer}
          onIce={sendVoiceIce}
        />

        {/* Кнопка показать/скрыть чат */}
        <button
          onClick={() => setShowChat((v) => !v)}
          className="bg-black/40 hover:bg-black/60 text-white/70 hover:text-white text-sm px-3 py-2 rounded-xl transition-colors flex items-center gap-2"
        >
          💬 {showChat ? 'Скрыть чат' : `Чат${messages.length > 0 ? ` (${messages.length})` : ''}`}
        </button>

        {/* Чат */}
        {showChat && (
          <div className="flex-1 min-h-0">
            <Chat
              messages={messages}
              currentUserId={me?.id ?? 0}
              onSend={sendChat}
            />
          </div>
        )}
      </div>

      {/* Экран победы/поражения */}
      {gameOver && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-gray-900 border border-gray-700 rounded-3xl p-10 text-center min-w-[320px] shadow-2xl">
            {gameOver.winner === me?.id
              ? <h2 className="text-4xl font-black text-yellow-400 mb-2">🎉 Победа!</h2>
              : <h2 className="text-4xl font-black text-gray-400 mb-2">😔 Поражение</h2>
            }
            <p className="text-gray-400 mb-6">
              Победитель: <span className="text-white font-bold">{winnerPlayer?.username ?? '—'}</span>
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={async () => {
                if (roomId) { try { await gameApi.reset(roomId); } catch {} }
                navigate(`/${roomId}`, { replace: false, state: { from: 'game' } });
              }}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-3 rounded-xl"
              >
                В комнату
              </button>
              <button
                onClick={() => { leaveVoice(); navigate('/'); }}
                className="bg-gray-700 hover:bg-gray-600 text-white font-bold px-6 py-3 rounded-xl"
              >
                В лобби
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}