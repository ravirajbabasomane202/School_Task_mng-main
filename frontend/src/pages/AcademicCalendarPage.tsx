import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import AcademicEventDetailsModal from '../components/academicCalendar/AcademicEventDetailsModal';
import AcademicEventFormModal from '../components/academicCalendar/AcademicEventFormModal';
import Button from '../components/common/Button';
import PageContainer from '../components/common/PageContainer';
import { isChairmanLevel } from '../constants/roles';
import {
  createAcademicEvent,
  deleteAcademicEvent,
  getAcademicEvents,
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

  const days = useMemo(() => getVisibleDays(anchor, view), [anchor, view]);
  const start = toDateKey(days[0]);
  const end = toDateKey(days[days.length - 1]);
  const eventsQuery = useQuery({
    queryKey: ['academic-events', 'range', start, end],
    queryFn: () => getAcademicEvents({ start, end })
  });

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
        {canManage && (
          <Button onClick={openNewEvent}>
            <Plus aria-hidden="true" size={16} />
            Add Event
          </Button>
        )}
      </div>

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
            <Button onClick={goToday} size="sm" variant="ghost">Today</Button>
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
                const dayEvents = (eventsQuery.data ?? []).filter(
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
                          aria-label={`${event.title}, ${event.category}, ${event.start_time}`}
                          className={`block w-full truncate rounded-md border px-1.5 py-1 text-left text-[10px] font-medium transition hover:brightness-95 sm:text-xs ${CATEGORY_STYLE[event.category]}`}
                          key={event.id}
                          onClick={() => setDetailsEvent(event)}
                          title={`${event.start_time} ${event.title}`}
                          type="button"
                        >
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

      <AcademicEventDetailsModal
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
