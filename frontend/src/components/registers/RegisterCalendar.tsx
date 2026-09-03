import React, { useEffect, useMemo, useState } from 'react';
import type { RegisterCalendarEvent, RegisterDotColor } from '../../types/register.types';

interface RegisterCalendarProps {
  events: RegisterCalendarEvent[];
  onEventClick?: (event: RegisterCalendarEvent) => void;
  /** Called whenever the visible grid range changes (initial render + every Prev/Next/Today/view switch). */
  onRangeChange?: (range: { start: string; end: string }) => void;
}

type ViewMode = 'week' | 'month';

// Colored dots only (Section 5 of the spec) — Completed / Pending / Missed / Future.
// No status text is ever rendered inside a calendar cell; a native title attribute
// still gives an accessible/hover-only label.
const COLOR_DOT: Record<RegisterDotColor, string> = {
  gray: 'bg-[#94A3B8]',
  green: 'bg-[#22C55E]',
  yellow: 'bg-[#EAB308]',
  red: 'bg-[#EF4444]',
};

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonthGrid(d: Date): Date {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  return startOfWeek(first);
}

function toKey(d: Date): string {
  return d.toISOString().split('T')[0];
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
}

function RegisterCalendar({ events, onEventClick, onRangeChange }: RegisterCalendarProps) {
  const [view, setView] = useState<ViewMode>('month');
  const [anchor, setAnchor] = useState(() => new Date());

  const eventsByDate = useMemo(() => {
    const map = new Map<string, RegisterCalendarEvent[]>();
    for (const event of events) {
      const key = event.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(event);
    }
    return map;
  }, [events]);

  const days = useMemo(() => {
    if (view === 'week') {
      const start = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    const start = startOfMonthGrid(anchor);
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [view, anchor]);

  // Tell the parent which dates are currently on screen so it can fetch
  // events (including future/past cyclic occurrences) for this exact range —
  // otherwise paging the calendar never requests data beyond the initial load.
  useEffect(() => {
    if (!onRangeChange || days.length === 0) return;
    onRangeChange({ start: toKey(days[0]), end: toKey(days[days.length - 1]) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const headerLabel =
    view === 'week'
      ? `Week of ${days[0].toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`
      : anchor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  const goPrev = () => setAnchor((prev) => addDays(prev, view === 'week' ? -7 : -30));
  const goNext = () => setAnchor((prev) => addDays(prev, view === 'week' ? 7 : 30));
  const goToday = () => setAnchor(new Date());

  const currentMonth = anchor.getMonth();
  const todayKey = toKey(new Date());

  return (
    <div className="rounded-xl border border-[#EFF2F6] bg-white p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={goPrev}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E4EAF2] text-[#5B6E8C] hover:bg-[#F8F9FC]"
            type="button"
            aria-label="Previous"
          >
            ‹
          </button>
          <span className="min-w-[160px] text-center text-sm font-semibold text-[#1E293B]">{headerLabel}</span>
          <button
            onClick={goNext}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#E4EAF2] text-[#5B6E8C] hover:bg-[#F8F9FC]"
            type="button"
            aria-label="Next"
          >
            ›
          </button>
          <button
            onClick={goToday}
            className="ml-1 rounded-lg border border-[#E4EAF2] px-2.5 py-1 text-xs font-medium text-[#5B6E8C] hover:bg-[#F8F9FC]"
            type="button"
          >
            Today
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 text-xs text-[#5B6E8C]">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#22C55E]" /> Completed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#EAB308]" /> Pending
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#EF4444]" /> Missed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#94A3B8]" /> Future
            </span>
          </div>
          <div className="flex overflow-hidden rounded-lg border border-[#E4EAF2]">
            {(['week', 'month'] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setView(mode)}
                type="button"
                className={[
                  'px-3 py-1.5 text-xs font-medium capitalize transition',
                  view === mode ? 'bg-[#185FA5] text-white' : 'bg-white text-[#5B6E8C] hover:bg-[#F8F9FC]',
                ].join(' ')}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-[#EFF2F6] bg-[#EFF2F6] text-xs">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="bg-[#F8F9FC] px-2 py-2 text-center font-semibold text-[#8A99B0]">
            {d}
          </div>
        ))}

        {days.map((day) => {
          const key = toKey(day);
          const dayEvents = eventsByDate.get(key) ?? [];
          const isCurrentMonth = view === 'week' || day.getMonth() === currentMonth;
          const isToday = key === todayKey;

          return (
            <div
              key={key}
              className={[
                'min-h-[92px] bg-white p-1.5 align-top',
                isCurrentMonth ? '' : 'bg-[#FAFBFD] text-[#C3CCDA]',
              ].join(' ')}
            >
              <div
                className={[
                  'mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-medium',
                  isToday ? 'bg-[#185FA5] text-white' : 'text-[#5B6E8C]',
                ].join(' ')}
              >
                {day.getDate()}
              </div>
              <div className="flex flex-wrap justify-center gap-1 px-1">
                {dayEvents.map((event) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => onEventClick?.(event)}
                    className="flex h-3 w-3 items-center justify-center rounded-full transition hover:scale-125"
                    title={event.title}
                    aria-label={event.title}
                  >
                    <span className={['h-2.5 w-2.5 rounded-full', COLOR_DOT[event.dot_color]].join(' ')} />
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default RegisterCalendar;
