// src/components/Chat.tsx
import { useState, useEffect, useRef } from 'react';
import { Send, MessageCircle } from 'lucide-react';
import type { ChatPayload } from '../types';

interface Message extends ChatPayload {
  id: number;
}

interface ChatProps {
  onSend: (text: string) => void;
  messages: Message[];
  currentUserId: number;
}

export default function Chat({ onSend, messages, currentUserId }: ChatProps) {
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Автоскролл вниз при новых сообщениях
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl flex flex-col h-80">
      {/* Заголовок */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
        <MessageCircle size={18} className="text-indigo-400" />
        <span className="font-semibold text-white text-sm">Чат</span>
      </div>

      {/* Сообщения */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-gray-600 text-sm text-center mt-4">
            Начните общение...
          </p>
        )}
        {messages.map((msg) => {
          const isMe = msg.user_id === currentUserId;
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
            >
              {!isMe && (
                <span className="text-xs text-gray-500 mb-1 px-1">{msg.username}</span>
              )}
              <div
                className={`px-3 py-2 rounded-xl text-sm max-w-[80%] break-words ${
                  isMe
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-800 text-gray-200'
                }`}
              >
                {msg.text}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Инпут */}
      <div className="px-3 py-3 border-t border-gray-800 flex gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Написать сообщение..."
          maxLength={500}
          className="flex-1 bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
        />
        <button
          onClick={handleSend}
          disabled={!text.trim()}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-600 text-white p-2 rounded-xl transition-colors"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
