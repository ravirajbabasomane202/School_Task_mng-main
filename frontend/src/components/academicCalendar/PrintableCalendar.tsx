import { createPortal } from 'react-dom';
import type { AcademicEvent } from '../../types/academicEvent.types';
import { APPROVAL_LABEL, formatDisplayDate, responsibleLabel } from './eventWorkflow';

export type PrintMode = 'month' | 'range' | 'date';

export interface PrintJob {
  mode: PrintMode;
  /** Inclusive YYYY-MM-DD bounds of what is printed. */
  start: string;
  end: string;
  events: AcademicEvent[];
  printedBy?: string;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const SCHOOL_NAME = 'Adhira International School';

function parseKey(key: string): Date {
  return new Date(`${key}T00:00:00`);
}

function toKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function weekday(key: string): string {
  return WEEKDAYS[parseKey(key).getDay()];
}

function overlaps(event: AcademicEvent, start: string, end: string): boolean {
  return event.start_date <= end && event.end_date >= start;
}

function sortEvents(events: AcademicEvent[]): AcademicEvent[] {
  return [...events].sort(
    (a, b) => a.start_date.localeCompare(b.start_date) || a.start_time.localeCompare(b.start_time) || a.id - b.id
  );
}

function eventStatus(event: AcademicEvent): string {
  return event.workflow_label;
}

function completionText(event: AcademicEvent): string {
  if (event.completion_status !== 'COMPLETED') return event.is_overdue ? 'Not completed (overdue)' : 'Not completed';
  const parts = [`Completed${event.actual_completion_date ? ` on ${formatDisplayDate(event.actual_completion_date)}` : ''}`];
  if (event.completed_by_name) parts.push(`by ${event.completed_by_name}`);
  return parts.join(' ');
}

function approvalText(event: AcademicEvent): string {
  if (event.completion_status !== 'COMPLETED') return '—';
  return APPROVAL_LABEL[event.approval_status];
}

function periodTitle(job: PrintJob): string {
  if (job.mode === 'month') {
    return parseKey(job.start).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }
  if (job.mode === 'date' || job.start === job.end) {
    return `${weekday(job.start)}, ${formatDisplayDate(job.start)}`;
  }
  return `${formatDisplayDate(job.start)} – ${formatDisplayDate(job.end)}`;
}

/** Month grid: every event of the month in its date cell, nothing truncated. */
function MonthGrid({ job }: { job: PrintJob }) {
  const first = parseKey(job.start);
  const gridStart = addDays(first, -first.getDay());
  const last = parseKey(job.end);
  const weeks: Date[][] = [];
  for (let cursor = gridStart; cursor <= last || weeks.length === 0; cursor = addDays(cursor, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, index) => addDays(cursor, index)));
  }

  return (
    <table className="print-grid">
      <thead>
        <tr>
          {WEEKDAYS.map((day) => <th key={day}>{day}</th>)}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={toKey(week[0])}>
            {week.map((day) => {
              const key = toKey(day);
              const inMonth = key >= job.start && key <= job.end;
              const dayEvents = inMonth ? sortEvents(job.events.filter((event) => overlaps(event, key, key))) : [];
              return (
                <td className={inMonth ? '' : 'print-outside'} key={key}>
                  <div className="print-daynum">{day.getDate()}</div>
                  {dayEvents.map((event) => (
                    <div className="print-chip" key={event.id}>
                      <strong>{event.start_time}–{event.end_time}</strong> {event.title}
                      <div className="print-chip-meta">
                        {event.responsible_name ? `Resp: ${event.responsible_name} · ` : ''}
                        {eventStatus(event)}
                        {event.completion_status === 'COMPLETED' ? ` · Approval: ${approvalText(event)}` : ''}
                      </div>
                    </div>
                  ))}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Print-only calendar. It is rendered into <body> and hidden on screen; the
 * @media print rules in index.css hide the rest of the app, so the printout
 * contains this document only. It always lists the FULL details of every event
 * (not a trimmed view), after the month grid when printing a month.
 */
function PrintableCalendar({ job }: { job: PrintJob }) {
  const events = sortEvents(job.events.filter((event) => overlaps(event, job.start, job.end)));
  const emptyMessage =
    job.mode === 'date' ? 'No events are scheduled on this date.' : 'No events are scheduled in this period.';

  return createPortal(
    <div className="calendar-print-root" data-testid="calendar-print-root">
      <header className="print-header">
        <h1>{SCHOOL_NAME}</h1>
        <h2>Academic Calendar — {periodTitle(job)}</h2>
        <p>
          {job.mode === 'month' ? 'Monthly calendar' : job.mode === 'date' ? 'Event details for the selected date' : 'Selected date range'}
          {' · '}{events.length} event{events.length === 1 ? '' : 's'}
        </p>
      </header>

      {job.mode === 'month' && <MonthGrid job={job} />}

      <section className={job.mode === 'month' ? 'print-details print-break' : 'print-details'}>
        <h3>Event Details</h3>
        {events.length === 0 ? (
          <p className="print-empty">{emptyMessage}</p>
        ) : (
          <table className="print-table">
            <thead>
              <tr>
                <th style={{ width: '9%' }}>Date</th>
                <th style={{ width: '8%' }}>Time</th>
                <th style={{ width: '14%' }}>Event</th>
                <th style={{ width: '8%' }}>Category / Location</th>
                <th style={{ width: '10%' }}>Responsible Person</th>
                <th style={{ width: '9%' }}>Status</th>
                <th style={{ width: '14%' }}>Completion</th>
                <th style={{ width: '12%' }}>Reason (if not on time)</th>
                <th style={{ width: '10%' }}>Management Approval</th>
                <th style={{ width: '6%' }}>Audience</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>
                    {weekday(event.start_date)}<br />{formatDisplayDate(event.start_date)}
                    {event.end_date !== event.start_date && <><br />to {weekday(event.end_date)}<br />{formatDisplayDate(event.end_date)}</>}
                  </td>
                  <td>{event.start_time} – {event.end_time}</td>
                  <td>
                    <strong>{event.title}</strong>
                    {event.description && <div className="print-small">{event.description}</div>}
                  </td>
                  <td>{event.category}{event.location ? <><br />{event.location}</> : null}</td>
                  <td>{responsibleLabel(event)}</td>
                  <td>{eventStatus(event)}</td>
                  <td>
                    {completionText(event)}
                    {event.completion_remarks && <div className="print-small">Remarks: {event.completion_remarks}</div>}
                  </td>
                  <td>{event.non_completion_reason ?? '—'}</td>
                  <td>
                    {approvalText(event)}
                    {event.completion_status === 'COMPLETED' && event.approval_remarks && (
                      <div className="print-small">{event.approval_remarks}</div>
                    )}
                  </td>
                  <td>{event.target_audience.includes('ALL') ? 'All users' : event.target_audience.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <footer className="print-footer">
        Printed on {new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
        {job.printedBy ? ` by ${job.printedBy}` : ''}
      </footer>
    </div>,
    document.body
  );
}

export default PrintableCalendar;
