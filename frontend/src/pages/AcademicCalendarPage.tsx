import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ChevronLeft, ChevronRight, Plus, Printer, X } from 'lucide-react';
import toast from 'react-hot-toast';
import AcademicEventDetailsModal from '../components/academicCalendar/AcademicEventDetailsModal';
import AcademicEventFormModal from '../components/academicCalendar/AcademicEventFormModal';
import PrintableCalendar, { type PrintJob, type PrintMode } from '../components/academicCalendar/PrintableCalendar';
import { WORKFLOW_BADGE, formatDisplayDate, responsibleLabel } from '../components/academicCalendar/eventWorkflow';
import Modal from '../components/common/Modal';
import Button from '../components/common/Button';
import PageContainer from '../components/common/PageContainer';
import { isChairmanLevel } from '../constants/roles';
import {
  createAcademicEvent,
  deleteAcademicEvent,
  getAcademicEvents,
  getPendingEventUpdates,
  updateAcademicEvent
} from '../services/academicEventService';
import type { AcademicEvent, AcademicEventForm } from '../types/academicEvent.types';
import { getApiErrorMessage } from '../utils/apiError';
import { useAppSelector } from '../store/hooks';

type CalendarView = 'month' | 'week' | 'day';

const CATEGORY_STYLE: Record<AcademicEvent['category'], string> = {
  ACADEMIC: 'bg-blue-100 text-blue-700 border-blue-200',
  CELEBRATION: 'bg-purple-100 text-purple-700 border-purple-200',
  EXAMINATION: 'bg-red-100 text-red-700 border-red-200',
  HOLIDAY: 'bg-green-100 text-green-700 border-green-200',
  MEETING: 'bg-amber-100 text-amber-700 border-amber-200',
  SPORTS: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  OTHER: 'bg-gray-100 text-gray-700 border-gray-200'
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(date: Date): Date {
  const start = new Date(date);
  start.setDate(start.getDate() - start.getDay());
  start.setHours(0, 0, 0, 0);
  return start;
}

function getVisibleDays(anchor: Date, view: CalendarView): Date[] {
  if (view === 'day') return [new Date(anchor)];
  if (view === 'week') {
    const first = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, index) => addDays(first, index));
  }
  const firstOfMonth = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const first = startOfWeek(firstOfMonth);
  return Array.from({ length: 42 }, (_, index) => addDays(first, index));
}

function AcademicCalendarPage() {
  const user = useAppSelector((state) => state.auth.user);
  const canManage = isChairmanLevel(user?.role);
  const queryClient = useQueryClient();
  const [view, setView] = useState<CalendarView>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const [detailsEvent, setDetailsEvent] = useState<AcademicEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<AcademicEvent | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [filterDate, setFilterDate] = useState('');
  const [filterStart, setFilterStart] = useState('');
  const [filterEnd, setFilterEnd] = useState('');
  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [printMode, setPrintMode] = useState<PrintMode>('month');
  const [printStart, setPrintStart] = useState('');
  const [printEnd, setPrintEnd] = useState('');
  const [printDate, setPrintDate] = useState('');
  const [printJob, setPrintJob] = useState<PrintJob | null>(null);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);

  // Effective filter window (inclusive). A single date wins over a range.
  const filterFrom = filterDate || filterStart;
  const filterTo = filterDate || filterEnd;
  const rangeInvalid = Boolean(!filterDate && filterStart && filterEnd && filterStart > filterEnd);
  const isFiltering = Boolean((filterFrom || filterTo) && !rangeInvalid);

  const days = useMemo(() => getVisibleDays(anchor, view), [anchor, view]);
  const start = toDateKey(days[0]);
  const end = toDateKey(days[days.length - 1]);
  const eventsQuery = useQuery({
    queryKey: ['academic-events', 'range', start, end],
    queryFn: () => getAcademicEvents({ start, end })
  });

  const filteredQuery = useQuery({
    queryKey: ['academic-events', 'filtered', filterFrom, filterTo],
    queryFn: () => getAcademicEvents({ start: filterFrom || undefined, end: filterTo || undefined }),
    enabled: isFiltering
  });

  const pendingQuery = useQuery({
    queryKey: ['academic-events', 'pending-updates'],
    queryFn: getPendingEventUpdates
  });

  const eventMatchesFilter = (event: AcademicEvent) =>
    !isFiltering || ((!filterTo || event.start_date <= filterTo) && (!filterFrom || event.end_date >= filterFrom));
  const gridEvents = useMemo(
    () => (eventsQuery.data ?? []).filter(eventMatchesFilter),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eventsQuery.data, isFiltering, filterFrom, filterTo]
  );

  // Jump the calendar to the start of a newly chosen date / range.
  useEffect(() => {
    if (isFiltering && filterFrom) setAnchor(new Date(`${filterFrom}T00:00:00`));
  }, [isFiltering, filterFrom]);

  const clearFilters = () => {
    setFilterDate('');
    setFilterStart('');
    setFilterEnd('');
  };

  const runPrint = async () => {
    let start = '';
    let end = '';
    if (printMode === 'month') {
      const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
      start = toDateKey(first);
      end = toDateKey(last);
    } else if (printMode === 'date') {
      if (!printDate) return toast.error('Select the date to print');
      start = end = printDate;
    } else {
      if (!printStart || !printEnd) return toast.error('Select both a start and an end date');
      if (printStart > printEnd) return toast.error('Start date must be on or before the end date');
      start = printStart;
      end = printEnd;
    }
    setIsPreparingPrint(true);
    try {
      // Fetched fresh for exactly the printed period so nothing is missing.
      const events = await getAcademicEvents({ start, end });
      setIsPrintOpen(false);
      setPrintJob({ mode: printMode, start, end, events, printedBy: user?.name });
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'Unable to prepare the calendar for printing'));
    } finally {
      setIsPreparingPrint(false);
    }
  };

  // Open the browser print dialog once the print document is in the DOM.
  useEffect(() => {
    if (!printJob) return undefined;
    const clear = () => setPrintJob(null);
    window.addEventListener('afterprint', clear);
    const timer = window.setTimeout(() => window.print(), 150);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', clear);
    };
  }, [printJob]);

  const closeForm = () => {
    setIsFormOpen(false);
    setEditingEvent(null);
  };

  const saveMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number | null; payload: FormData }) =>
      id === null ? createAcademicEvent(payload) : updateAcademicEvent(id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['academic-events'] });
      closeForm();
      toast.success(editingEvent ? 'Academic event updated' : 'Academic event added');
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Unable to save the academic event'))
  });

  const deleteMutation = useMutation({
    mutationFn: deleteAcademicEvent,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['academic-events'] });
      setDetailsEvent(null);
      toast.success('Academic event deleted');
    },
    onError: (error) => toast.error(getApiErrorMessage(error, 'Unable to delete the academic event'))
  });

  const openNewEvent = () => {
    setEditingEvent(null);
    setIsFormOpen(true);
  };

  const openEditEvent = (event: AcademicEvent) => {
    setDetailsEvent(null);
    setEditingEvent(event);
    setIsFormOpen(true);
  };

  const handleSave = (form: AcademicEventForm) => {
    const payload = new FormData();
    payload.append('title', form.title.trim());
    payload.append('description', form.description.trim());
    payload.append('category', form.category);
    payload.append('start_date', form.start_date);
    payload.append('end_date', form.end_date);
    payload.append('start_time', form.start_time);
    payload.append('end_time', form.end_time);
    payload.append('location', form.location.trim());
    payload.append('target_audience', JSON.stringify(form.target_audience));
    payload.append('responsible_user_id', form.responsible_user_id);
    if (form.attachment) payload.append('attachment', form.attachment);
    saveMutation.mutate({ id: editingEvent?.id ?? null, payload });
  };

  const moveAnchor = (direction: -1 | 1) => {
    setAnchor((current) => {
      if (view === 'day') return addDays(current, direction);
      if (view === 'week') return addDays(current, direction * 7);
      const next = new Date(current);
      next.setDate(1);
      next.setMonth(next.getMonth() + direction);
      return next;
    });
  };

  const goToday = () => setAnchor(new Date());
  const heading = view === 'month'
    ? anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
    : view === 'week'
      ? `${days[0].toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${days[6].toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`
      : anchor.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <PageContainer className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#1E293B]">Academic Calendar</h1>
          <p className="mt-1 text-sm text-[#5B6E8C]">School events, important dates, and activities</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => {
            setPrintDate(filterDate || toDateKey(new Date()));
            setPrintStart(filterStart || filterDate);
            setPrintEnd(filterEnd || filterDate);
            setIsPrintOpen(true);
          }} variant="ghost">
            <Printer aria-hidden="true" size={16} />
            Print Calendar
          </Button>
          {canManage && (
            <Button onClick={openNewEvent}>
              <Plus aria-hidden="true" size={16} />
              Add Event
            </Button>
          )}
        </div>
      </div>

      {(pendingQuery.data?.length ?? 0) > 0 && (
        <section
          aria-label="Events needing your update"
          className="rounded-xl border border-red-200 bg-red-50 p-3 sm:p-4"
          data-testid="pending-event-updates"
        >
          <h2 className="flex items-center gap-2 text-sm font-semibold text-red-700">
            <AlertTriangle aria-hidden="true" size={16} />
            {pendingQuery.data!.length} event{pendingQuery.data!.length === 1 ? '' : 's'} need{pendingQuery.data!.length === 1 ? 's' : ''} your update
          </h2>
          <ul className="mt-2 space-y-1">
            {pendingQuery.data!.map((event) => (
              <li key={event.id}>
                <button
                  className="text-left text-sm text-red-800 underline-offset-2 hover:underline"
                  onClick={() => setDetailsEvent(event)}
                  type="button"
                >
                  {event.title} — scheduled {formatDisplayDate(event.end_date)} · {event.workflow_label}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Date filters" className="rounded-xl border border-[#EFF2F6] bg-white p-3 sm:p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="filter-date">Select Date</label>
            <input
              className="rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm"
              id="filter-date"
              onChange={(e) => { setFilterDate(e.target.value); setFilterStart(''); setFilterEnd(''); }}
              type="date"
              value={filterDate}
            />
          </div>
          <span className="pb-2 text-xs text-[#8A99B0]">or</span>
          <div>
            <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="filter-start">Start Date</label>
            <input
              className="rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm"
              id="filter-start"
              onChange={(e) => { setFilterStart(e.target.value); setFilterDate(''); }}
              type="date"
              value={filterStart}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="filter-end">End Date</label>
            <input
              className="rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm"
              id="filter-end"
              min={filterStart || undefined}
              onChange={(e) => { setFilterEnd(e.target.value); setFilterDate(''); }}
              type="date"
              value={filterEnd}
            />
          </div>
          {(filterDate || filterStart || filterEnd) && (
            <Button onClick={clearFilters} size="sm" variant="ghost">
              <X aria-hidden="true" size={14} />
              Clear Filters
            </Button>
          )}
        </div>
        {rangeInvalid && (
          <p className="mt-2 text-xs text-red-600" role="alert">Start date must be on or before the end date.</p>
        )}
        {isFiltering && (
          <p className="mt-2 text-xs text-[#5B6E8C]" data-testid="filter-summary">
            Showing only events {filterDate
              ? `on ${formatDisplayDate(filterDate)}`
              : `${filterFrom ? `from ${formatDisplayDate(filterFrom)} ` : ''}${filterTo ? `to ${formatDisplayDate(filterTo)}` : ''}`}.
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-[#EFF2F6] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#EFF2F6] p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <button
              aria-label="Previous period"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E4EAF2] text-[#5B6E8C] hover:bg-[#F8F9FC]"
              onClick={() => moveAnchor(-1)}
              type="button"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              aria-label="Next period"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#E4EAF2] text-[#5B6E8C] hover:bg-[#F8F9FC]"
              onClick={() => moveAnchor(1)}
              type="button"
            >
              <ChevronRight size={18} />
            </button>
            <Button onClick={goToday} size="sm" title="Go to the current month" variant="ghost">
              {view === 'month' ? 'Current Month' : 'Today'}
            </Button>
            {view === 'month' && (
              <input
                aria-label="Jump to month"
                className="rounded-lg border border-[#E4EAF2] px-2 py-1.5 text-xs text-[#5B6E8C]"
                onChange={(e) => {
                  if (e.target.value) setAnchor(new Date(`${e.target.value}-01T00:00:00`));
                }}
                type="month"
                value={`${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}`}
              />
            )}
            <h2 aria-live="polite" className="ml-1 text-sm font-semibold text-[#1E293B]">{heading}</h2>
          </div>
          <div className="flex overflow-hidden rounded-lg border border-[#E4EAF2]">
            {(['month', 'week', 'day'] as CalendarView[]).map((mode) => (
              <button
                aria-pressed={view === mode}
                className={[
                  'px-3 py-2 text-xs font-medium capitalize transition',
                  view === mode ? 'bg-[#185FA5] text-white' : 'bg-white text-[#5B6E8C] hover:bg-[#F8F9FC]'
                ].join(' ')}
                key={mode}
                onClick={() => setView(mode)}
                type="button"
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-[#EFF2F6] px-3 py-3 sm:px-4">
          {(Object.keys(CATEGORY_STYLE) as AcademicEvent['category'][]).map((category) => (
            <span className={`rounded-full border px-2 py-1 text-[10px] font-medium ${CATEGORY_STYLE[category]}`} key={category}>
              {category}
            </span>
          ))}
        </div>

        {eventsQuery.isLoading ? (
          <div className="py-16 text-center text-sm text-[#8A99B0]">Loading calendar…</div>
        ) : eventsQuery.isError ? (
          <div className="py-16 text-center text-sm text-red-600">
            {getApiErrorMessage(eventsQuery.error, 'Unable to load the academic calendar')}
          </div>
        ) : (
          <>
            {view !== 'day' && (
              <div className="grid grid-cols-7 border-b border-[#EFF2F6] bg-[#F8F9FC]">
                {WEEKDAYS.map((day) => (
                  <div className="px-1 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-[#8A99B0] sm:px-2 sm:text-xs" key={day}>
                    <span className="sm:hidden">{day.slice(0, 1)}</span>
                    <span className="hidden sm:inline">{day}</span>
                  </div>
                ))}
              </div>
            )}
            <div className={`grid ${view === 'day' ? 'grid-cols-1' : 'grid-cols-7'} gap-px bg-[#EFF2F6]`}>
              {days.map((day) => {
                const dayKey = toDateKey(day);
                const dayEvents = gridEvents.filter(
                  (event) => event.start_date <= dayKey && event.end_date >= dayKey
                );
                const isToday = dayKey === toDateKey(new Date());
                const isOtherMonth = view === 'month' && day.getMonth() !== anchor.getMonth();
                const visibleLimit = view === 'month' ? 3 : 20;
                return (
                  <div
                    className={[
                      'min-h-[112px] bg-white p-1.5 sm:min-h-[142px] sm:p-2',
                      view === 'day' ? 'min-h-[300px]' : '',
                      isOtherMonth ? 'bg-[#FAFBFD]' : ''
                    ].join(' ')}
                    key={dayKey}
                  >
                    <div className="mb-1.5 flex items-center justify-between">
                      {view === 'day' && <span className="text-xs font-medium text-[#5B6E8C]">{WEEKDAYS[day.getDay()]}</span>}
                      <span className={[
                        'inline-flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-medium',
                        isToday ? 'bg-[#185FA5] text-white' : isOtherMonth ? 'text-[#B4BECC]' : 'text-[#5B6E8C]'
                      ].join(' ')}>
                        {view === 'day' ? formatDayHeading(day) : day.getDate()}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {dayEvents.slice(0, visibleLimit).map((event) => (
                        <button
                          aria-label={`${event.title}, ${event.category}, ${event.start_time}${event.is_overdue ? ', update required' : ''}`}
                          className={`block w-full truncate rounded-md border px-1.5 py-1 text-left text-[10px] font-medium transition hover:brightness-95 sm:text-xs ${CATEGORY_STYLE[event.category]} ${event.is_overdue ? 'ring-1 ring-red-500' : ''}`}
                          key={event.id}
                          onClick={() => setDetailsEvent(event)}
                          title={`${event.start_time} ${event.title}`}
                          type="button"
                        >
                          {event.is_overdue && <span aria-hidden="true">⚠ </span>}
                          <span className="font-semibold">{event.start_time}</span>{' '}
                          <span>{event.title}</span>
                        </button>
                      ))}
                      {dayEvents.length > visibleLimit && (
                        <p className="px-1 text-[10px] text-[#5B6E8C]">+{dayEvents.length - visibleLimit} more</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {isFiltering && (
        <section aria-label="Filtered events" className="rounded-xl border border-[#EFF2F6] bg-white" data-testid="filtered-events">
          <h2 className="border-b border-[#EFF2F6] px-4 py-3 text-sm font-semibold text-[#1E293B]">
            Events in the selected {filterDate ? 'date' : 'range'}
            {filteredQuery.data ? ` (${filteredQuery.data.length})` : ''}
          </h2>
          {filteredQuery.isLoading ? (
            <p className="px-4 py-6 text-sm text-[#8A99B0]">Loading events…</p>
          ) : filteredQuery.isError ? (
            <p className="px-4 py-6 text-sm text-red-600">{getApiErrorMessage(filteredQuery.error, 'Unable to load events')}</p>
          ) : (filteredQuery.data ?? []).length === 0 ? (
            <p className="px-4 py-6 text-sm text-[#8A99B0]">No events match the selected date or range.</p>
          ) : (
            <ul className="divide-y divide-[#EFF2F6]">
              {filteredQuery.data!.map((event) => (
                <li key={event.id}>
                  <button
                    className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-[#F8F9FC]"
                    onClick={() => setDetailsEvent(event)}
                    type="button"
                  >
                    <span>
                      <span className="block text-sm font-medium text-[#1E293B]">{event.title}</span>
                      <span className="block text-xs text-[#5B6E8C]">
                        {formatDisplayDate(event.start_date)}
                        {event.end_date !== event.start_date ? ` – ${formatDisplayDate(event.end_date)}` : ''}
                        {' · '}{event.start_time}–{event.end_time} · Responsible: {responsibleLabel(event)}
                      </span>
                    </span>
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${WORKFLOW_BADGE[event.workflow_status]}`}>
                      {event.workflow_label}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Modal
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => setIsPrintOpen(false)} variant="ghost">Cancel</Button>
            <Button loading={isPreparingPrint} onClick={() => void runPrint()}>
              <Printer aria-hidden="true" size={16} />
              Print
            </Button>
          </div>
        }
        isOpen={isPrintOpen}
        onClose={() => setIsPrintOpen(false)}
        title="Print Calendar"
      >
        <fieldset className="space-y-3">
          <legend className="mb-1 text-xs font-medium text-[#5B6E8C]">What would you like to print?</legend>
          <label className="flex items-center gap-2 text-sm text-[#1E293B]">
            <input checked={printMode === 'month'} name="print-mode" onChange={() => setPrintMode('month')} type="radio" />
            Complete monthly calendar — {anchor.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
          </label>
          <label className="flex items-center gap-2 text-sm text-[#1E293B]">
            <input checked={printMode === 'range'} name="print-mode" onChange={() => setPrintMode('range')} type="radio" />
            Selected date range
          </label>
          {printMode === 'range' && (
            <div className="grid grid-cols-1 gap-3 pl-6 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="print-start">Start Date</label>
                <input className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm" id="print-start" onChange={(e) => setPrintStart(e.target.value)} type="date" value={printStart} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="print-end">End Date</label>
                <input className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm" id="print-end" min={printStart || undefined} onChange={(e) => setPrintEnd(e.target.value)} type="date" value={printEnd} />
              </div>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm text-[#1E293B]">
            <input checked={printMode === 'date'} name="print-mode" onChange={() => setPrintMode('date')} type="radio" />
            A particular date's event details
          </label>
          {printMode === 'date' && (
            <div className="pl-6">
              <label className="mb-1 block text-xs font-medium text-[#5B6E8C]" htmlFor="print-date">Date</label>
              <input className="rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm" id="print-date" onChange={(e) => setPrintDate(e.target.value)} type="date" value={printDate} />
            </div>
          )}
          <p className="text-xs text-[#8A99B0]">
            The printout is laid out for A4 and includes every event with its timing, responsible person, status, completion details and management approval.
          </p>
        </fieldset>
      </Modal>
      {printJob && <PrintableCalendar job={printJob} />}

      <AcademicEventDetailsModal
        currentUserId={user?.id ?? null}
        isManager={canManage}
        onEventChange={setDetailsEvent}
        event={detailsEvent}
        onClose={() => setDetailsEvent(null)}
        onDelete={canManage ? (event) => {
          if (globalThis.confirm(`Delete "${event.title}"?`)) deleteMutation.mutate(event.id);
        } : undefined}
        onEdit={canManage ? openEditEvent : undefined}
      />
      {canManage && (
        <AcademicEventFormModal
          event={editingEvent}
          isOpen={isFormOpen}
          isSaving={saveMutation.isPending}
          onClose={closeForm}
          onSubmit={handleSave}
        />
      )}
    </PageContainer>
  );
}

function formatDayHeading(day: Date): string {
  return day.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
}

export default AcademicCalendarPage;
