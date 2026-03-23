// src/components/VoiceMini.tsx
// Компактный виджет войса — использует глобальный VoiceContext
import { Mic, MicOff, PhoneOff, Phone } from 'lucide-react';
import { useVoice } from '../context/VoiceContext';

interface VoiceMiniProps {
  onJoinWs: () => void;
  onLeaveWs: () => void;
}

export default function VoiceMini({ onJoinWs, onLeaveWs }: VoiceMiniProps) {
  const { isInVoice, isMuted, voiceUsers, error, join, leave, toggleMute } = useVoice();

  const handleJoin = async () => {
    await join();
    onJoinWs();
  };

  const handleLeave = () => {
    leave();
    onLeaveWs();
  };

  return (
    <div className="bg-black/40 border border-white/10 rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-white/60 text-xs font-medium flex items-center gap-1">
          🎙 Войс {voiceUsers.length > 0 && <span className="text-white/40">({voiceUsers.length})</span>}
        </span>
        <div className="flex gap-1">
          {isInVoice && (
            <button
              onClick={toggleMute}
              className={`p-1.5 rounded-lg transition-colors ${
                isMuted ? 'bg-red-500/30 text-red-400' : 'bg-white/10 text-white/60 hover:text-white'
              }`}
              title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
            >
              {isMuted ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
          )}
          <button
            onClick={isInVoice ? handleLeave : handleJoin}
            className={`p-1.5 rounded-lg transition-colors ${
              isInVoice ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
            }`}
            title={isInVoice ? 'Выйти из войса' : 'Войти в войс'}
          >
            {isInVoice ? <PhoneOff size={14} /> : <Phone size={14} />}
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      {voiceUsers.length > 0 && (
        <div className="space-y-1">
          {voiceUsers.map((u) => (
            <div key={u.user_id} className="flex items-center gap-1.5 text-xs text-white/50">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              {u.username}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}