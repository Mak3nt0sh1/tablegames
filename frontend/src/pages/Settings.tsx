import { useState } from 'react';
import { Volume2, Bell, Monitor, Check, Mic } from 'lucide-react';
import { useSettings } from '../hooks/useSettings';

export default function Settings() {
  const { settings, save } = useSettings();
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    // Запрашиваем разрешение на уведомления если включили
    if (settings.notificationsEnabled && 'Notification' in window) {
      Notification.requestPermission();
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
    <button
      onClick={onChange}
      className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${
        value ? 'bg-indigo-600' : 'bg-gray-700'
      }`}
    >
      <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-all ${
        value ? 'left-6' : 'left-0.5'
      }`} />
    </button>
  );

  const Row = ({
    title,
    desc,
    value,
    onChange,
  }: {
    title: string;
    desc: string;
    value: boolean;
    onChange: () => void;
  }) => (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-white font-medium">{title}</p>
        <p className="text-gray-400 text-sm">{desc}</p>
      </div>
      <Toggle value={value} onChange={onChange} />
    </div>
  );

  return (
    <div className="max-w-xl space-y-4">

      {/* Звук */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Volume2 size={20} className="text-indigo-400" />
          Звук
        </h3>
        <Row
          title="Звуковые эффекты"
          desc="Звуки карт, ходов, UNO и событий"
          value={settings.soundEnabled}
          onChange={() => save({ soundEnabled: !settings.soundEnabled })}
        />
      </div>

      {/* Уведомления */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Bell size={20} className="text-indigo-400" />
          Уведомления
        </h3>
        <Row
          title="Браузерные уведомления"
          desc="Когда ваш ход или кто-то зашёл в комнату"
          value={settings.notificationsEnabled}
          onChange={() => save({ notificationsEnabled: !settings.notificationsEnabled })}
        />
        {'Notification' in window && Notification.permission === 'denied' && (
          <p className="text-yellow-400 text-sm bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3">
            Уведомления заблокированы в браузере. Разрешите их в настройках браузера.
          </p>
        )}
      </div>

      {/* Голос */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Mic size={20} className="text-indigo-400" />
          Голосовой чат
        </h3>
        <Row
          title="Авто-вход в голосовой"
          desc="Автоматически подключаться к войсу при входе в комнату"
          value={settings.voiceAutoJoin}
          onChange={() => save({ voiceAutoJoin: !settings.voiceAutoJoin })}
        />
      </div>

      {/* Интерфейс */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 space-y-5">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Monitor size={20} className="text-indigo-400" />
          Интерфейс
        </h3>
        <Row
          title="Показывать чат"
          desc="Отображать панель чата в комнате"
          value={settings.chatVisible}
          onChange={() => save({ chatVisible: !settings.chatVisible })}
        />
      </div>

      {/* Сохранить */}
      <button
        onClick={handleSave}
        className={`w-full py-3 rounded-xl font-semibold transition-colors flex items-center justify-center gap-2 ${
          saved
            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
            : 'bg-indigo-600 hover:bg-indigo-500 text-white'
        }`}
      >
        {saved ? <><Check size={18} /> Сохранено!</> : 'Сохранить'}
      </button>
    </div>
  );
}