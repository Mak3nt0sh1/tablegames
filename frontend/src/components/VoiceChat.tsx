// src/components/VoiceChat.tsx
import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';

interface VoiceUser {
  user_id: number;
  username: string;
}

interface VoiceChatProps {
  currentUserId: number;
  voiceUsers: VoiceUser[];
  onJoin: () => void;
  onLeave: () => void;
  onOffer: (targetUserId: number, sdp: string) => void;
  onAnswer: (targetUserId: number, sdp: string) => void;
  onIce: (targetUserId: number, candidate: string, sdpMid: string, sdpMlineIndex: number) => void;
  // Входящие сигналы от useWebSocket
  incomingOffer?: { from_user_id: number; sdp: string } | null;
  incomingAnswer?: { from_user_id: number; sdp: string } | null;
  incomingIce?: { from_user_id: number; candidate: string; sdp_mid: string; sdp_mline_index: number } | null;
}

export default forwardRef(function VoiceChat({
  currentUserId,
  voiceUsers,
  onJoin,
  onLeave,
  onOffer,
  onAnswer,
  onIce,
  incomingOffer,
  incomingAnswer,
  incomingIce,
}: VoiceChatProps, ref: React.Ref<{ handleJoin: () => void }>) {
  const [isInVoice, setIsInVoice] = useState(false);
  const isInVoiceRef = useRef(false);

  // Exposing handleJoin для авто-войса из Room
  useImperativeHandle(ref, () => ({ handleJoin }));

  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState('');

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<number, RTCPeerConnection>>(new Map());
  const audioRefs = useRef<Map<number, HTMLAudioElement>>(new Map());

  const ICE_SERVERS = {
    iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
  };

  // Создать RTCPeerConnection для пира
  const createPeer = (targetUserId: number): RTCPeerConnection => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Добавляем локальные треки
    localStreamRef.current?.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current!);
    });

    // ICE candidates
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        onIce(
          targetUserId,
          e.candidate.candidate,
          e.candidate.sdpMid ?? '',
          e.candidate.sdpMLineIndex ?? 0
        );
      }
    };

    // Получаем аудио от пира
    pc.ontrack = (e) => {
      let audio = audioRefs.current.get(targetUserId);
      if (!audio) {
        audio = new Audio();
        audio.autoplay = true;
        audioRefs.current.set(targetUserId, audio);
      }
      audio.srcObject = e.streams[0];
    };

    peersRef.current.set(targetUserId, pc);
    return pc;
  };

  // Войти в голосовой чат
  const handleJoin = async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setIsInVoice(true);
      onJoin();

      // Инициируем соединение со всеми кто уже в войсе
      for (const user of voiceUsers) {
        if (user.user_id === currentUserId) continue;
        const pc = createPeer(user.user_id);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        onOffer(user.user_id, offer.sdp!);
      }
    } catch {
      setError('Нет доступа к микрофону');
    }
  };

  // Выйти из голосового чата
  const handleLeave = () => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    audioRefs.current.forEach((a) => { a.srcObject = null; });
    audioRefs.current.clear();
    setIsInVoice(false);
    isInVoiceRef.current = false;
    onLeave();
  };

  // Мут/анмут
  const toggleMute = () => {
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = isMuted;
    });
    setIsMuted(!isMuted);
  };

  // Обработка входящего offer
  useEffect(() => {
    if (!incomingOffer || !isInVoice) return;
    const { from_user_id, sdp } = incomingOffer;
    const handle = async () => {
      const pc = createPeer(from_user_id);
      await pc.setRemoteDescription({ type: 'offer', sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      onAnswer(from_user_id, answer.sdp!);
    };
    handle().catch(console.error);
  }, [incomingOffer]);

  // Обработка входящего answer
  useEffect(() => {
    if (!incomingAnswer) return;
    const { from_user_id, sdp } = incomingAnswer;
    const pc = peersRef.current.get(from_user_id);
    pc?.setRemoteDescription({ type: 'answer', sdp }).catch(console.error);
  }, [incomingAnswer]);

  // Обработка ICE candidate
  useEffect(() => {
    if (!incomingIce) return;
    const { from_user_id, candidate, sdp_mid, sdp_mline_index } = incomingIce;
    const pc = peersRef.current.get(from_user_id);
    pc?.addIceCandidate({ candidate, sdpMid: sdp_mid, sdpMLineIndex: sdp_mline_index })
      .catch(console.error);
  }, [incomingIce]);

  // Чистим при размонтировании
  useEffect(() => {
    return () => { if (isInVoiceRef.current) handleLeave(); };
  }, []);

  const othersInVoice = voiceUsers.filter((u) => u.user_id !== currentUserId);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Volume2 size={18} className="text-indigo-400" />
          <span className="font-semibold text-white text-sm">Голосовой чат</span>
          {voiceUsers.length > 0 && (
            <span className="text-xs text-gray-500">({voiceUsers.length})</span>
          )}
        </div>

        <div className="flex gap-2">
          {isInVoice && (
            <button
              onClick={toggleMute}
              className={`p-2 rounded-lg transition-colors ${
                isMuted
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
              title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
            >
              {isMuted ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
          )}

          <button
            onClick={isInVoice ? handleLeave : handleJoin}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              isInVoice
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
            }`}
          >
            {isInVoice ? 'Выйти' : 'Войти'}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-red-400 text-xs mb-2">{error}</p>
      )}

      {/* Список участников в войсе */}
      {voiceUsers.length > 0 ? (
        <div className="space-y-1">
          {voiceUsers.map((user) => (
            <div key={user.user_id} className="flex items-center gap-2 py-1">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              <span className="text-sm text-gray-300">
                {user.username}
                {user.user_id === currentUserId && (
                  <span className="text-gray-500 ml-1">(вы{isMuted ? ' 🔇' : ''})</span>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-gray-600 text-xs">Никого нет в голосовом</p>
      )}
    </div>
  );
});