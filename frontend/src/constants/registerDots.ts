import type { RegisterDotColor } from '../types/register.types';
import { PERFORMANCE_LABELS as L } from './performanceLabels';

/** One class per dot colour. Each colour has exactly ONE meaning (see LEGEND). */
export const DOT_CLASS: Record<RegisterDotColor, string> = {
  green: 'bg-[#22C55E]',
  yellow: 'bg-[#EAB308]',
  red: 'bg-[#EF4444]',
  gray: 'bg-[#CBD5E1]',
  outline: 'border-2 border-[#64748B] bg-transparent',
};

export const DOT_LEGEND: { color: RegisterDotColor; label: string }[] = [
  { color: 'green', label: L.onTimeChecked },
  { color: 'yellow', label: L.checkedAfterDueDate },
  { color: 'outline', label: L.notChecked },
  { color: 'red', label: 'Rejected' },
  { color: 'gray', label: 'Open / Future' },
];
