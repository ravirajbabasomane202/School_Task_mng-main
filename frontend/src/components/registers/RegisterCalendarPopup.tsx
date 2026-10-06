import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Badge from '../common/Badge';
import { getRegisterCalendarFor, updateOccurrenceStatus } from '../../services/registerService';
import type { Register, RegisterComputedStatus, RegisterDotColor, RegisterStatus } from '../../types/register.types';
import { REGISTER_STATUSES } from '../../types/register.types';
import { formatPeriod, isInCurrentPeriod, isRegisterUpdatable } from '../../utils/registerUtils';
import { formatDate } from '../../utils/dateUtils';

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

// One dot per checking period, shown on the period's first day.
const LEGEND: { color: RegisterDotColor; label: string }[] = [
  { color: 'green', label: 'Checked' },
  { color: 'yellow', label: 'Missed' },
  { color: 'red', label: 'Rejected' },
  { color: 'gray', label: 'Open / Future' },
];

const COMPUTED_LABEL: Record<RegisterComputedStatus, string> = {
  COMPLETED: 'Checked',
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
 * Small popup calendar for a single Register. A register is checked ONCE PER
 * CHECKING PERIOD (a day / Monday–Sunday week / calendar month / ... depending
 * on its Checking Cycle), so the calendar shows one dot per period (on the
 * period's first day) and highlights every day of the CURRENT period.
 * Clicking ANY day of the current period opens the check panel — not just one
 * scheduled date — until that period has been checked, after which it shows
 * "Already checked". Other periods are read-only history.
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

  // `data.register` is re-fetched after every check; the `register` prop is
  // just the snapshot the popup was opened with, so it goes stale.
  const liveRegister: Register | null = data?.register ?? register;

  const entriesByDate = useMemo(() => {
    const map = new Map<
      string,
      { dot_color: RegisterDotColor; status: RegisterComputedStatus; period_end?: string; is_open?: boolean }
    >();
    for (const entry of data?.entries ?? []) {
      map.set(entry.date, {
        dot_color: entry.dot_color,
        status: entry.status as RegisterComputedStatus,
        period_end: entry.period_end,
        is_open: entry.is_open,
      });
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
      toast.success('Register checked successfully');
      setSelectedDate(null);
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(message ?? 'Failed to check register');
      qc.invalidateQueries({ queryKey: ['registers'] });
      qc.invalidateQueries({ queryKey: ['register-calendar'] });
    },
  });

  const days = useMemo(() => {
    const start = startOfMonthGrid(anchor);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [anchor]);

  const handleAnchorChange = () => setSelectedDate(null);

  const selectedEntry = selectedDate ? entriesByDate.get(selectedDate) : undefined;
  const registerUpdatability = liveRegister ? isRegisterUpdatable(liveRegister) : { updatable: false };
  // Any day inside the CURRENT checking period opens the check panel.
  const isSelectedInCurrentPeriod = liveRegister && selectedDate ? isInCurrentPeriod(liveRegister, selectedDate) : false;
  const currentPeriodLabel = liveRegister ? formatPeriod(liveRegister) : null;

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
              const inCurrentPeriod = liveRegister ? isInCurrentPeriod(liveRegister, key) : false;
              const clickable = !!dot || inCurrentPeriod;
              return (
                <button
                  key={key}
                  type="button"
                  disabled={!clickable}
                  onClick={() => {
                    if (!clickable) return;
                    setSelectedDate(key);
                    setPendingStatus('OK');
                  }}
                  className={[
                    'flex h-11 flex-col items-center py-1 transition',
                    inCurrentPeriod ? 'bg-[#EEF5FC]' : isCurrentMonth ? 'bg-white' : 'bg-[#FAFBFD]',
                    isCurrentMonth ? '' : 'text-[#C3CCDA]',
                    clickable ? 'cursor-pointer hover:bg-[#F5F9FD]' : 'cursor-default',
                    isSelected ? 'ring-2 ring-inset ring-[#185FA5]' : '',
                  ].join(' ')}
                  title={
                    inCurrentPeriod
                      ? registerUpdatability.updatable
                        ? 'Current checking period — click to check this register'
                        : 'Current checking period — already checked'
                      : dot
                        ? 'Click to view (read-only)'
                        : undefined
                  }
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

          {currentPeriodLabel ? (
            <p className="text-center text-xs text-[#5B6E8C]">
              <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm bg-[#EEF5FC] align-middle ring-1 ring-inset ring-[#CFE0F2]" />
              Current checking period: <span className="font-semibold text-[#1E293B]">{currentPeriodLabel}</span>
              {' — '}
              {registerUpdatability.updatable ? 'not checked yet' : 'already checked'}
            </p>
          ) : null}

          {/* Clicking ANY day of the current checking period opens the check
              panel (one check per period). Clicking another period's dot opens
              a read-only view of how that period ended. */}
          {selectedDate && liveRegister && (isSelectedInCurrentPeriod || selectedEntry) ? (
            <div className="rounded-[12px] border border-[#EFF2F6] bg-[#FAFCFE] p-3">
              {isSelectedInCurrentPeriod ? (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#1E293B]">{currentPeriodLabel}</span>
                    <Badge variant={registerUpdatability.updatable ? 'amber' : COMPUTED_BADGE[liveRegister.computed_status]}>
                      {registerUpdatability.updatable ? 'Not checked yet' : COMPUTED_LABEL[liveRegister.computed_status]}
                    </Badge>
                  </div>
                  {registerUpdatability.updatable ? (
                    <div className="space-y-2">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-[11px] font-medium text-[#36506C]">Result of this check</span>
                        <select
                          value={pendingStatus}
                          onChange={(e) => setPendingStatus(e.target.value as RegisterStatus)}
                          className="min-h-[34px] rounded-[8px] border-[0.5px] border-solid border-[#DCE2EA] bg-white px-2 text-xs"
                        >
                          {REGISTER_STATUSES.filter((s) => s.value !== 'IDLE').map((s) => (
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
                            occurrenceMutation.mutate({
                              id: liveRegister.id,
                              occurrenceDate: liveRegister.current_period_start ?? selectedDate,
                              status: pendingStatus,
                            })
                          }
                        >
                          Check Register
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[#8A99B0]">
                      {registerUpdatability.reason ?? 'Already checked for the current period.'}
                    </p>
                  )}
                </>
              ) : selectedEntry ? (
                <>
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#1E293B]">
                      {selectedEntry.period_end && selectedEntry.period_end !== selectedDate
                        ? `${formatDate(selectedDate)} – ${formatDate(selectedEntry.period_end)}`
                        : formatDate(selectedDate)}
                    </span>
                    <Badge variant={COMPUTED_BADGE[selectedEntry.status]}>
                      {selectedEntry.is_open && selectedEntry.status === 'UPCOMING'
                        ? 'Open'
                        : COMPUTED_LABEL[selectedEntry.status]}
                    </Badge>
                  </div>
                  <p className="text-xs text-[#8A99B0]">
                    This period is read-only — only the current checking period can be checked.
                  </p>
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Modal>
  );
}

export default RegisterCalendarPopup;