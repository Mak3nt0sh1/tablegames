// src/pages/JoinRoom.tsx
// Страница автоматического вступления по инвайт-ссылке
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { join } from '../api/client';

export default function JoinRoom() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!code) {
      navigate('/');
      return;
    }
    join.byCode(code.toUpperCase())
      .then((room) => navigate(`/${room.uuid}`))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Неверная или устаревшая ссылка');
        setTimeout(() => navigate('/'), 2000);
      });
  }, [code]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-950">
      <div className="text-center">
        {error ? (
          <>
            <p className="text-red-400 text-lg mb-2">{error}</p>
            <p className="text-gray-500">Перенаправляем в лобби...</p>
          </>
        ) : (
          <>
            <p className="text-white text-lg mb-2">Подключаемся к комнате...</p>
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mt-4"></div>
          </>
        )}
      </div>
    </div>
  );
}
