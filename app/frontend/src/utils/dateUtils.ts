/**
 * Format an ISO date string to a human-readable date.
 * e.g. "2026-04-24T10:00:00.000Z" → "24 Apr 2026"
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

/**
 * Format an ISO date string to date + time.
 * e.g. "24 Apr 2026, 10:30 AM"
 */
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

/**
 * Return a relative time label: "2 days ago", "in 3 days", "Today", etc.
 */
export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays === -1) return 'Tomorrow';
  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return `In ${Math.abs(diffDays)} day${Math.abs(diffDays) > 1 ? 's' : ''}`;
}

/**
 * Check whether a due date is in the past (task is overdue).
 */
export function isOverdue(dueDateStr: string | null | undefined): boolean {
  if (!dueDateStr) return false;
  const due = new Date(dueDateStr);
  if (isNaN(due.getTime())) return false;
  return due < new Date();
}

/**
 * Return today's date formatted as YYYY-MM-DD (for <input type="date"> default values).
 */
export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Return a date N days from today formatted as YYYY-MM-DD.
 */
export function futureDateISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/**
 * Return the number of days remaining until a due date.
 * Negative means overdue.
 */
export function daysUntil(dueDateStr: string | null | undefined): number | null {
  if (!dueDateStr) return null;
  const due = new Date(dueDateStr);
  if (isNaN(due.getTime())) return null;
  const now = new Date();
  const diffMs = due.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
