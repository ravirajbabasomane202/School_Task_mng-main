import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { getRegisterCalendarFor, updateOccurrenceStatus } from '../../services/registerService';
import type { Register, RegisterComputedStatus, RegisterDotColor, RegisterStatus } from '../../types/register.types';
import { REGISTER_STATUSES } from '../../types/register.types';

interface RegisterCalendarPopupProps {
  register: Register | null;
  onClose: () => void;
}

const DOT_CLASS: Record<RegisterDotColor, string> = {
  green: 'bg-[#22C55E]',
  yellow: 'bg-[#EAB308]',
  red: 'bg-[#EF4444]',
  gray: 'bg-[#CBD5E1]',
};

const LEGEND: { color: RegisterDotColor; label: string }[] = [
  { color: 'green', label: 'Completed' },
  { color: 'yellow', label: 'Pending / Missed' },
  { color: 'red', label: 'Rejected' },
  { color: 'gray', label: 'Future' },
];

const COMPUTED_LABEL: Record<RegisterComputedStatus, string> = {
  COMPLETED: 'Completed',
  PENDING: 'Missed',
  FAILED: 'Rejected',
  UPCOMING: 'Upcoming',
};

const COMPUTED_BADGE: Record<RegisterComputedStatus, 'green' | 'amber' | 'red' | 'gray'> = {
  COMPLETED: 'green',
  PENDING: 'amber',
  FAILED: 'red',
  UPCOMING: 'gray',
};

function startOfMonthGrid(anchor: Date): Date {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const start = new Date(first);
  start.setDate(start.getDate() - first.getDay());
  start.setHours(0, 0, 0, 0);
  return start;
}

function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

function todayKeyStr(): string {
  return toKey(new Date());
}

/**
 * Small popup calendar for a single Register. This is now the ONLY calendar
 * in Register Monitoring (the full page-level calendar was removed), so it
 * carries all the same click-to-update behaviour that used to live there —
 * scoped to exactly one occurrence at a time, and only ever TODAY's:
 * clicking today's dot opens an editable status update; clicking any other
 * date (including an already-missed daily entry) opens a read-only view.
 */
function RegisterCalendarPopup({ register, onClose }: RegisterCalendarPopupProps) {
  const qc = useQueryClient();
  const [anchor, setAnchor] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<RegisterStatus>('OK');

  const monthKey = `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}`;

  const { data, isLoading } = useQuery({
    // 'single' scopes this cache entry to just this one register, so that
    // updating another register's status never invalidates/refetches this popup.
    queryKey: ['register-calendar', 'single', register?.id, monthKey],
    queryFn: () => getRegisterCalendarFor(register!.id, monthKey),
    enabled: !!register,
  });

  const entriesByDate = useMemo(() => {
    const map = new Map<string, { dot_color: RegisterDotColor; status: RegisterComputedStatus }>();
    for (const entry of data?.entries ?? []) {
      map.set(entry.date, { dot_color: entry.dot_color, status: entry.status as RegisterComputedStatus });
    }
    return map;
  }, [data]);

  const dotsByDate = useMemo(() => {
    const map = new Map<string, RegisterDotColor>();
    entriesByDate.forEach((entry, date) => map.set(date, entry.dot_color));
    return map;
  }, [entriesByDate]);

  const occurrenceMutation = useMutation({
    mutationFn: ({ id, occurrenceDate, status }: { id: number; occurrenceDate: string; status: RegisterStatus }) =>
      updateOccurrenceStatus(id, occurrenceDate, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['registers'] });
      qc.invalidateQueries({ queryKey: ['register-calendar'] });
      toast.success('Today’s status updated');
      setSelectedDate(null);
    },
    onError: () => toast.error('Failed to update status'),
  });

  const days = useMemo(() => {
    const start = startOfMonthGrid(anchor);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [anchor]);

  const handleAnchorChange = () => setSelectedDate(null);

  const selectedEntry = selectedDate ? entriesByDate.get(selectedDate) : undefined;
  const isSelectedToday = selectedDate === todayKeyStr();

  const currentMonth = anchor.getMonth();

  return (
    <Modal
      isOpen={!!register}
      onClose={() => {
        setSelectedDate(null);
        onClose();
      }}
      title={register ? `${register.name} — Calendar` : 'Calendar'}
    >
      {register ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => {
                setAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
                handleAnchorChange();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E4EAF2] text-[#5B6E8C] hover:bg-[#F8F9FC]"
              aria-label="Previous month"
            >
              ‹
            </button>
            <span className="text-sm font-semibold text-[#1E293B]">
              {anchor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </span>
            <button
              type="button"
              onClick={() => {
                setAnchor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
                handleAnchorChange();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#E4EAF2] text-[#5B6E8C] hover:bg-[#F8F9FC]"
              aria-label="Next month"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-[#EFF2F6] bg-[#EFF2F6] text-xs">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="bg-[#F8F9FC] py-1.5 text-center font-semibold text-[#8A99B0]">
                {d}
              </div>
            ))}
            {days.map((day) => {
              const key = toKey(day);
              const dot = dotsByDate.get(key);
              const isCurrentMonth = day.getMonth() === currentMonth;
              const isToday = key === todayKeyStr();
              const isSelected = key === selectedDate;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!dot}
                  onClick={() => {
                    if (!dot) return;
                    setSelectedDate(key);
                    setPendingStatus('OK');
                  }}
                  className={[
                    'flex h-11 flex-col items-center bg-white py-1 transition',
                    isCurrentMonth ? '' : 'bg-[#FAFBFD] text-[#C3CCDA]',
                    dot ? 'cursor-pointer hover:bg-[#F5F9FD]' : 'cursor-default',
                    isSelected ? 'ring-2 ring-inset ring-[#185FA5]' : '',
                  ].join(' ')}
                  title={dot ? (isToday ? 'Click to update today’s status' : 'Click to view (read-only)') : undefined}
                >
                  <span
                    className={[
                      'flex h-5 w-5 items-center justify-center rounded-full text-[11px]',
                      isToday ? 'bg-[#185FA5] text-white' : 'text-[#5B6E8C]',
                    ].join(' ')}
                  >
                    {day.getDate()}
                  </span>
                  {dot ? <span className={['mt-1 h-2 w-2 rounded-full', DOT_CLASS[dot]].join(' ')} /> : null}
                </button>
              );
            })}
          </div>

          {isLoading ? <p className="text-center text-xs text-[#8A99B0]">Loading…</p> : null}

          <div className="flex flex-wrap justify-center gap-3 border-t border-[#EFF2F6] pt-3 text-xs text-[#5B6E8C]">
            {LEGEND.map((item) => (
              <span key={item.color} className="flex items-center gap-1.5">
                <span className={['h-2.5 w-2.5 rounded-full', DOT_CLASS[item.color]].join(' ')} />
                {item.label}
              </span>
            ))}
          </div>

          {/* Clicking today's dot opens this editable panel — the same
              "update status" action that used to live in the full page
              calendar, now folded into this popup. Any other date (including
              an already-missed daily entry) opens a read-only panel instead:
              only today can ever be changed here. */}
          {selectedDate && selectedEntry ? (
            <div className="rounded-[12px] border border-[#EFF2F6] bg-[#FAFCFE] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-[#1E293B]">{selectedDate}</span>
                <Badge variant={COMPUTED_BADGE[selectedEntry.status]}>{COMPUTED_LABEL[selectedEntry.status]}</Badge>
              </div>

              {isSelectedToday ? (
                <div className="space-y-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-medium text-[#36506C]">Update today's status</span>
                    <select
                      value={pendingStatus}
                      onChange={(e) => setPendingStatus(e.target.value as RegisterStatus)}
                      className="min-h-[34px] rounded-[8px] border-[0.5px] border-solid border-[#DCE2EA] bg-white px-2 text-xs"
                    >
                      {REGISTER_STATUSES.map((s) => (
                        <option key={s.value} value={s.value}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" type="button" onClick={() => setSelectedDate(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      type="button"
                      loading={occurrenceMutation.isPending}
                      onClick={() =>
                        occurrenceMutation.mutate({ id: register.id, occurrenceDate: selectedDate, status: pendingStatus })
                      }
                    >
                      Update
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[#8A99B0]">
                  This date is read-only — only today's entry can be updated for a cyclic register.
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

export default RegisterCalendarPopup;
