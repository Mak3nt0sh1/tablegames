import type { Card } from '../types';

interface Props {
  card: Card;
  onClick?: () => void;
  small?: boolean;
  disabled?: boolean;
}

const colorMap: Record<string, string> = {
  red:    'bg-red-500    border-red-300',
  green:  'bg-green-500  border-green-300',
  blue:   'bg-blue-500   border-blue-300',
  yellow: 'bg-yellow-400 border-yellow-200',
};

const valueLabel: Record<string, string> = {
  skip:     '⊘',
  reverse:  '↺',
  draw_two: '+2',
};

export default function UnoCard({ card, onClick, small = false, disabled = false }: Props) {
  const label  = valueLabel[card.value] ?? card.value.toUpperCase();
  const colors = colorMap[card.color]   ?? 'bg-gray-700 border-gray-500';

  return (
    <div
      onClick={!disabled ? onClick : undefined}
      className={`
        ${small ? 'w-10 h-14 text-xs' : 'w-16 h-24 text-lg'}
        ${colors}
        border-2 rounded-xl flex flex-col items-center justify-center
        font-black text-white shadow-lg select-none transition-all duration-200
        ${!disabled && onClick ? 'cursor-pointer hover:-translate-y-3 hover:shadow-xl' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
      `}
    >
      <span>{label}</span>
      <span className="text-[10px] opacity-60 mt-1">{card.color}</span>
    </div>
  );
}