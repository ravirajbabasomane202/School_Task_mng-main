import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getApiErrorMessage } from '../../utils/apiError';
import { getAcademicEvents } from '../../services/academicEventService';
import type { AcademicEvent } from '../../types/academicEvent.types';
import AcademicEventDetailsModal from './AcademicEventDetailsModal';

const CATEGORY_STYLE: Record<AcademicEvent['category'], string> = {
  ACADEMIC: 'bg-blue-100 text-blue-700',
  CELEBRATION: 'bg-purple-100 text-purple-700',
  EXAMINATION: 'bg-red-100 text-red-700',
  HOLIDAY: 'bg-green-100 text-green-700',
  MEETING: 'bg-amber-100 text-amber-700',
  SPORTS: 'bg-cyan-100 text-cyan-700',
  OTHER: 'bg-gray-100 text-gray-700'
};

function formatEventDate(event: AcademicEvent): string {
  const start = new Date(`${event.start_date}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
  if (event.end_date === event.start_date) return start;
  return `${start} – ${new Date(`${event.end_date}T00:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  })}`;
}

function UpcomingAcademicEvents() {
  const navigate = useNavigate();
  const [selectedEvent, setSelectedEvent] = useState<AcademicEvent | null>(null);
  const eventsQuery = useQuery({
    queryKey: ['academic-events', 'upcoming'],
    queryFn: () => getAcademicEvents({ upcoming: true }),
    refetchInterval: 60_000
  });

  return (
    <>
      <section className="rounded-xl border border-[#EFF2F6] bg-white p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#185FA5]">School Schedule</p>
            <h2 className="mt-1 text-lg font-semibold text-[#1E293B]">Upcoming Academic Events</h2>
          </div>
          <button
            className="text-sm font-medium text-[#185FA5] hover:underline"
            onClick={() => navigate('/academic-calendar')}
            type="button"
          >
            Open calendar
          </button>
        </div>
        {eventsQuery.isLoading ? (
          <p className="py-4 text-sm text-[#8A99B0]">Loading upcoming events…</p>
        ) : eventsQuery.isError ? (
          <p className="py-4 text-sm text-red-600">
            {getApiErrorMessage(eventsQuery.error, 'Unable to load upcoming events')}
          </p>
        ) : eventsQuery.data.length === 0 ? (
          <p className="py-4 text-sm text-[#8A99B0]">No upcoming events for your audience.</p>
        ) : (
          <div className="divide-y divide-[#F1F4F9]">
            {eventsQuery.data.slice(0, 5).map((event) => (
              <button
                className="flex w-full flex-col gap-2 py-3 text-left transition hover:bg-[#F8F9FC] sm:flex-row sm:items-center sm:justify-between sm:px-2"
                key={event.id}
                onClick={() => setSelectedEvent(event)}
                type="button"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-[#1E293B]">{event.title}</span>
                  <span className="mt-1 block text-xs text-[#5B6E8C]">
                    {formatEventDate(event)} · {event.start_time}–{event.end_time}
                  </span>
                </span>
                <span className={`w-fit shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${CATEGORY_STYLE[event.category]}`}>
                  {event.category}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
      <AcademicEventDetailsModal event={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </>
  );
}

export default UpcomingAcademicEvents;
