import type { TaskStatus, TaskPriority } from '../types/task.types';

/**
 * Convert a SNAKE_CASE status enum value to a readable label.
 * e.g. "IN_PROGRESS" → "In Progress"
 */
export function formatStatus(status: TaskStatus | string): string {
  const map: Record<string, string> = {
    PENDING: 'Pending',
    IN_PROGRESS: 'In Progress',
    COMPLETED: 'Completed',
    DELAYED: 'Delayed',
    ESCALATED: 'Escalated'
  };
  return map[status] ?? status;
}

/**
 * Return Tailwind classes for a task status badge.
 */
export function getStatusBadgeClass(status: TaskStatus | string): string {
  const map: Record<string, string> = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    IN_PROGRESS: 'bg-blue-100 text-blue-800',
    COMPLETED: 'bg-green-100 text-green-800',
    DELAYED: 'bg-red-100 text-red-800',
    ESCALATED: 'bg-orange-100 text-orange-800'
  };
  return map[status] ?? 'bg-gray-100 text-gray-800';
}

/**
 * Return a readable label for task priority.
 */
export function formatPriority(priority: TaskPriority | string): string {
  const map: Record<string, string> = {
    HIGH: 'High',
    MEDIUM: 'Medium',
    LOW: 'Low'
  };
  return map[priority] ?? priority;
}

/**
 * Return Tailwind classes for a priority badge.
 */
export function getPriorityBadgeClass(priority: TaskPriority | string): string {
  const map: Record<string, string> = {
    HIGH: 'bg-red-100 text-red-700',
    MEDIUM: 'bg-yellow-100 text-yellow-700',
    LOW: 'bg-green-100 text-green-700'
  };
  return map[priority] ?? 'bg-gray-100 text-gray-700';
}

/**
 * Truncate a string to a maximum length, appending "…" if truncated.
 */
export function truncate(str: string | null | undefined, maxLength: number = 60): string {
  if (!str) return '—';
  return str.length > maxLength ? str.slice(0, maxLength) + '…' : str;
}

/**
 * Format a number as an Indian-locale currency string.
 * e.g. 125000 → "₹1,25,000"
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Format a decimal as a percentage string with one decimal place.
 * e.g. 0.756 → "75.6%"
 */
export function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Return a department health colour label based on completion percentage.
 */
export function getHealthColor(completionPct: number): 'green' | 'yellow' | 'red' {
  if (completionPct >= 75) return 'green';
  if (completionPct >= 40) return 'yellow';
  return 'red';
}

/**
 * Return Tailwind text + background classes for a health colour.
 */
export function getHealthBadgeClass(color: 'green' | 'yellow' | 'red'): string {
  const map = {
    green: 'bg-green-100 text-green-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    red: 'bg-red-100 text-red-700'
  };
  return map[color];
}

/**
 * Capitalise the first letter of a string.
 */
export function capitalise(str: string | null | undefined): string {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}
