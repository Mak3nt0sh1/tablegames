import { createContext, useContext, useState, useRef, useEffect, useCallback } from 'react';

interface VoiceUser {
  user_id: number;
  username: string;
}

interface VoiceContextValue {
  isInVoice: boolean;
  isMuted: boolean;
  voiceUsers: VoiceUser[];
  error: string;
  join: () => Promise<void>;
  leave: () => void;
  toggleMute: () => void;
  setVoiceUsers: React.Dispatch<React.SetStateAction<VoiceUser[]>>;
  handleOffer: (fromUserId: number, sdp: string, onAnswer: (targetId: number, sdp: string) => void, onIce: (targetId: number, candidate: string, sdpMid: string, sdpMlineIndex: number) => void) => void;
  handleAnswer: (fromUserId: number, sdp: string) => void;
  handleIce: (fromUserId: number, candidate: string, sdpMid: string, sdpMlineIndex: number) => void;
  initPeer: (targetUserId: number, onOffer: (targetId: number, sdp: string) => void, onIce: (targetId: number, candidate: string, sdpMid: string, sdpMlineIndex: number) => void) => Promise<void>;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

const ICE_SERVERS = {
  iceServers: [
    // Оставляем бесплатный STUN от Google (он быстрый и надежный)
    { urls: 'stun:stun.l.google.com:19302' },
    // STUN от Metered
    { urls: 'stun:stun.relay.metered.ca:80' },
    // TURN-сервера (для обхода NAT и файрволов)
    {
      urls: 'turn:global.relay.metered.ca:80',
      username: '284f71e9162a1b2df3023c67',
      credential: 'pBVMYCMAYMxEwsAs',
    },
    {
      urls: 'turn:global.relay.metered.ca:80?transport=tcp',
      username: '284f71e9162a1b2df3023c67',
      credential: 'pBVMYCMAYMxEwsAs',
    },
    {
      urls: 'turn:global.relay.metered.ca:443',
      username: '284f71e9162a1b2df3023c67',
      credential: 'pBVMYCMAYMxEwsAs',
    },
    {
      urls: 'turns:global.relay.metered.ca:443?transport=tcp',
      username: '284f71e9162a1b2df3023c67',
      credential: 'pBVMYCMAYMxEwsAs',
    },
  ],
};

export function VoiceProvider({ children }: { children: React.ReactNode }) {
  const [isInVoice, setIsInVoice] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [voiceUsers, setVoiceUsers] = useState<VoiceUser[]>([]);
  const [error, setError] = useState('');

  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<number, RTCPeerConnection>>(new Map());
  const audioRefs = useRef<Map<number, HTMLAudioElement>>(new Map());
  const isInVoiceRef = useRef(false);

  const createPeer = useCallback((
    targetUserId: number,
    onIce: (targetId: number, candidate: string, sdpMid: string, sdpMlineIndex: number) => void
  ): RTCPeerConnection => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    localStreamRef.current?.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current!);
    });

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        onIce(targetUserId, e.candidate.candidate, e.candidate.sdpMid ?? '', e.candidate.sdpMLineIndex ?? 0);
      }
    };

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
  }, []);

  const join = useCallback(async () => {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      setIsInVoice(true);
      isInVoiceRef.current = true;
      setIsMuted(false);
    } catch {
      setError('Нет доступа к микрофону');
    }
  }, []);

  const leave = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
    audioRefs.current.forEach((a) => { a.srcObject = null; });
    audioRefs.current.clear();
    setIsInVoice(false);
    isInVoiceRef.current = false;
    setIsMuted(false);
    // ИСПРАВЛЕНИЕ: Мы БОЛЬШЕ НЕ ОЧИЩАЕМ setVoiceUsers([]). 
    // Потому что если мы вышли, остальные всё ещё сидят там, и мы должны их видеть!
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      localStreamRef.current?.getAudioTracks().forEach((t) => {
        t.enabled = prev;
      });
      return !prev;
    });
  }, []);

  const initPeer = useCallback(async (
    targetUserId: number,
    onOffer: (targetId: number, sdp: string) => void,
    onIce: (targetId: number, candidate: string, sdpMid: string, sdpMlineIndex: number) => void
  ) => {
    const pc = createPeer(targetUserId, onIce);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    onOffer(targetUserId, offer.sdp!);
  }, [createPeer]);

  const handleOffer = useCallback((
    fromUserId: number,
    sdp: string,
    onAnswer: (targetId: number, sdp: string) => void,
    onIce: (targetId: number, candidate: string, sdpMid: string, sdpMlineIndex: number) => void
  ) => {
    if (!isInVoiceRef.current) return;
    const pc = createPeer(fromUserId, onIce);
    pc.setRemoteDescription({ type: 'offer', sdp })
      .then(() => pc.createAnswer())
      .then((answer) => {
        pc.setLocalDescription(answer);
        onAnswer(fromUserId, answer.sdp!);
      })
      .catch(console.error);
  }, [createPeer]);

  const handleAnswer = useCallback((fromUserId: number, sdp: string) => {
    const pc = peersRef.current.get(fromUserId);
    pc?.setRemoteDescription({ type: 'answer', sdp }).catch(console.error);
  }, []);

  const handleIce = useCallback((fromUserId: number, candidate: string, sdpMid: string, sdpMlineIndex: number) => {
    const pc = peersRef.current.get(fromUserId);
    pc?.addIceCandidate({ candidate, sdpMid, sdpMLineIndex: sdpMlineIndex }).catch(console.error);
  }, []);

  useEffect(() => {
    return () => {
      if (isInVoiceRef.current) leave();
    };
  }, [leave]);

  return (
    <VoiceContext.Provider value={{
      isInVoice, isMuted, voiceUsers, error,
      join, leave, toggleMute, setVoiceUsers,
      handleOffer, handleAnswer, handleIce, initPeer,
    }}>
      {children}
    </VoiceContext.Provider>
  );
}

export function useVoice() {
  const ctx = useContext(VoiceContext);
  if (!ctx) throw new Error('useVoice must be used within VoiceProvider');
  return ctx;
}