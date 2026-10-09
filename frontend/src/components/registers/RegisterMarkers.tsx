import { REGISTER_LABELS } from '../../constants/performanceLabels';
import type { RegisterDotColor } from '../../types/register.types';

/**
 * Marker colours for register checks. ONE meaning per colour, shared by the
 * Register Calendar, the Calendar popup and the Performance panel:
 *   green  = On Time Checked          yellow = Checked After Due Date
 *   red    = Rejected                 hollow red ring = Not Checked (period ended unchecked)
 *   gray   = Open / Future
 */
export const MARKER_CLASS: Record<RegisterDotColor, string> = {
  green: 'bg-[#22C55E]',
  yellow: 'bg-[#EAB308]',
  red: 'bg-[#EF4444]',
  gray: 'bg-[#CBD5E1]',
  missed: 'border-2 border-[#EF4444] bg-white box-border',
};

export const MARKER_LEGEND: { color: RegisterDotColor; label: string }[] = [
  { color: 'green', label: REGISTER_LABELS.onTimeChecked },
  { color: 'yellow', label: REGISTER_LABELS.checkedAfterDueDate },
  { color: 'missed', label: REGISTER_LABELS.notChecked },
  { color: 'red', label: 'Rejected' },
  { color: 'gray', label: 'Open / Future' },
];

export function RegisterLegend({ className = '' }: { className?: string }) {
  return (
    <div
      data-testid="register-legend"
      className={`flex flex-wrap justify-center gap-3 text-xs text-[#5B6E8C] ${className}`}
    >
      {MARKER_LEGEND.map((item) => (
        <span key={item.color} className="flex items-center gap-1.5">
          <span className={['h-2.5 w-2.5 rounded-full', MARKER_CLASS[item.color]].join(' ')} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
