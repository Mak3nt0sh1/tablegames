import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp } from 'lucide-react';

interface Section {
  title: string;
  content: React.ReactNode;
}

function Accordion({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-gray-800/50 transition-colors"
      >
        <span className="font-bold text-white text-base">{title}</span>
        {open ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
      </button>
      {open && (
        <div className="px-6 pb-5 text-gray-300 text-sm leading-relaxed space-y-3 border-t border-gray-800 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}

function Card({ color, value }: { color: string; value: string }) {
  const colors: Record<string, string> = {
    red: 'bg-red-500',
    green: 'bg-green-500',
    blue: 'bg-blue-500',
    yellow: 'bg-yellow-400',
  };
  const labels: Record<string, string> = {
    skip: '⊘', reverse: '↺', draw_two: '+2',
  };
  return (
    <span className={`inline-flex items-center justify-center ${colors[color] ?? 'bg-gray-700'} text-white font-black text-xs rounded-lg px-2 py-1 mx-1`}>
      {labels[value] ?? value.toUpperCase()}
    </span>
  );
}

export default function Rules() {
  return (
    <div className="max-w-2xl space-y-4">

      {/* Заголовок */}
      <div className="flex items-center gap-3 mb-6">
        <BookOpen size={28} className="text-indigo-400" />
        <div>
          <h1 className="text-2xl font-black text-white">Правила игр</h1>
          <p className="text-gray-400 text-sm mt-0.5">Как играть в игры на платформе TableGames</p>
        </div>
      </div>

      {/* UNO */}
      <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl px-6 py-4 flex items-center gap-3">
        <span className="text-3xl">🃏</span>
        <div>
          <h2 className="text-xl font-black text-white">UNO</h2>
          <p className="text-gray-400 text-sm">Классическая карточная игра от 2 до 4 игроков</p>
        </div>
      </div>

      <Accordion title="Цель игры">
        <p>Первым избавиться от всех карт на руке. Победитель получает очки равные сумме карт оставшихся у остальных игроков.</p>
      </Accordion>

      <Accordion title="Колода">
        <p>В игре используется <strong className="text-white">76 карт</strong> четырёх цветов: красные, зелёные, синие и жёлтые.</p>
        <p>Каждый цвет содержит:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-400">
          <li>Цифры от 0 до 9</li>
          <li>2 карты <span className="text-white">Пропуск хода</span> <Card color="red" value="skip" /></li>
          <li>2 карты <span className="text-white">Смена направления</span> <Card color="green" value="reverse" /></li>
          <li>2 карты <span className="text-white">Возьми две</span> <Card color="blue" value="draw_two" /></li>
        </ul>
        <p>В начале игры каждому игроку раздаётся <strong className="text-white">7 карт</strong>. Одна карта кладётся в сброс рубашкой вниз — это начальная карта.</p>
      </Accordion>

      <Accordion title="Ход игры">
        <p>Игроки ходят по очереди. В свой ход нужно положить одну карту на сброс или взять карту из колоды.</p>
        <p>Карту можно сыграть если она совпадает с верхней картой сброса по <strong className="text-white">цвету</strong> или по <strong className="text-white">значению</strong>.</p>
        <p>Например, на красную 5 можно положить любую красную карту или любую 5 другого цвета.</p>
        <p>Если карту сыграть нельзя — нужно взять одну карту из колоды. Если взятая карта подходит — можно сразу её сыграть, иначе ход переходит к следующему.</p>
      </Accordion>

      <Accordion title="Специальные карты">
        <div className="space-y-4">
          <div>
            <p className="text-white font-semibold mb-1">
              <Card color="red" value="skip" /> Пропуск хода
            </p>
            <p>Следующий игрок пропускает свой ход. При двух игроках это означает что ход снова переходит к вам.</p>
          </div>
          <div>
            <p className="text-white font-semibold mb-1">
              <Card color="green" value="reverse" /> Смена направления
            </p>
            <p>Меняет направление очерёдности ходов — с по часовой на против часовой и обратно. При двух игроках работает как пропуск хода.</p>
          </div>
          <div>
            <p className="text-white font-semibold mb-1">
              <Card color="blue" value="draw_two" /> Возьми две
            </p>
            <p>Следующий игрок берёт 2 карты. Однако — если у него тоже есть карта <Card color="blue" value="draw_two" />, он может её сыграть поверх и штраф накапливается. Итоговый штраф берёт тот, у кого нет такой карты для ответа.</p>
            <p>Если у следующего игрока нет <Card color="blue" value="draw_two" /> для ответа — карты начисляются автоматически и ход переходит дальше.</p>
          </div>
        </div>
      </Accordion>

      <Accordion title="Кнопка UNO">
        <p>Когда у вас остаётся <strong className="text-white">2 карты</strong> и вы собираетесь сыграть одну из них — нажмите кнопку <span className="bg-red-600 text-white text-xs font-black px-2 py-0.5 rounded-lg">UNO!</span> перед броском.</p>
        <p>Если вы сыграли карту и у вас осталась <strong className="text-white">1 карта</strong>, но вы не нажали UNO — соперник может вас поймать нажав кнопку <span className="text-orange-400 font-bold">Поймать [имя]!</span>. В этом случае вы получаете штраф <strong className="text-white">+2 карты</strong>.</p>
        <p>Также можно нажать UNO когда у вас уже осталась 1 карта — кнопка активна в обоих случаях.</p>
      </Accordion>

      <Accordion title="Конец игры">
        <p>Игрок победил когда сыграл последнюю карту. Если при этом последняя карта — <Card color="blue" value="draw_two" />, следующий игрок берёт карты, но победитель уже определён.</p>
        <p>После окончания игры хост может запустить новую партию в той же комнате — нажав кнопку <span className="text-green-400 font-bold">Новая игра</span>.</p>
      </Accordion>

      <Accordion title="Выход из игры">
        <p>Если игрок покидает комнату во время партии — он автоматически исключается из игры. Его карты убираются со стола и ход передаётся следующему игроку.</p>
        <p>Если игра идёт и один из игроков хочет её прервать — хост может нажать кнопку <span className="text-red-400 font-bold">✕ Завершить игру</span> в комнате.</p>
        <p>Если вы случайно вышли из игры — вернуться можно через виджет <span className="text-indigo-400 font-bold">🎮 У вас есть активная игра</span> на главной странице.</p>
      </Accordion>

      <Accordion title="Количество игроков">
        <p>Минимум <strong className="text-white">2 игрока</strong>, максимум <strong className="text-white">4 игрока</strong>. Хост может изменить лимит в настройках комнаты до старта игры.</p>
        <p>При двух игроках карты <Card color="green" value="reverse" /> и <Card color="red" value="skip" /> действуют одинаково — ход снова переходит к вам.</p>
      </Accordion>

    </div>
  );
}