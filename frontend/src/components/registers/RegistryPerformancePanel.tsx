import { PERFORMANCE_LABELS as L } from '../../constants/performanceLabels';
import { latestEntries } from '../../utils/performanceUtils';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { getRegisterCalendarEvents, getRegisters } from '../../services/registerService';
import { getStaffPerformance } from '../../services/dashboardService';
import { exportPerformanceReportFiltered } from '../../services/reportService';
import { schoolTodayISO } from '../../utils/registerUtils';
import { summarizeRegisterEvents, totalsFromSummaries } from '../../utils/registerPerformance';
import type { Register, RegisterCycle, RegisterDotColor } from '../../types/register.types';

const CYCLE_LABEL: Record<RegisterCycle, string> = {
  DAILY: 'Daily',
  WEEKLY: 'Weekly',
  '15_DAYS': '15 Days',
  MONTHLY: 'Monthly',
  QUARTERLY: 'Quarterly',
  HALF_YEARLY: 'Half-Yearly',
  YEARLY: 'Yearly',
};

const CYCLE_ORDER: RegisterCycle[] = ['DAILY', 'WEEKLY', '15_DAYS', 'MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY'];

const DOT_CLASS: Record<RegisterDotColor, string> = {
  green: 'bg-[#22C55E]',
  yellow: 'bg-[#EAB308]',
  red: 'bg-[#EF4444]',
  gray: 'bg-[#E2E8F0]',
  // Not Checked: hollow red ring, so it can never be mistaken for yellow.
  missed: 'border-2 border-[#EF4444] bg-transparent box-border',
};

/** Light, professional color variants for the Task/Register/Final
 * Performance KPI boxes below. Each variant is a subtle tinted
 * background + matching border + a readable, higher-contrast value
 * color — kept separate from DOT_CLASS (which colors the daily
 * activity dots, not these summary boxes). Centralizing the classes
 * here keeps the 11 KPI boxes visually consistent and avoids
 * repeating the same Tailwind class strings at every call site. */
type KpiColor = 'blue' | 'green' | 'yellow' | 'red' | 'purple' | 'cyan' | 'orange' | 'indigo' | 'teal';

const KPI_COLOR_CLASS: Record<KpiColor, { box: string; value: string }> = {
  blue: { box: 'border-blue-100 bg-blue-50', value: 'text-blue-700' },
  green: { box: 'border-emerald-100 bg-emerald-50', value: 'text-emerald-700' },
  yellow: { box: 'border-amber-100 bg-amber-50', value: 'text-amber-700' },
  red: { box: 'border-red-100 bg-red-50', value: 'text-red-700' },
  purple: { box: 'border-purple-100 bg-purple-50', value: 'text-purple-700' },
  cyan: { box: 'border-cyan-100 bg-cyan-50', value: 'text-cyan-700' },
  orange: { box: 'border-orange-100 bg-orange-50', value: 'text-orange-700' },
  indigo: { box: 'border-indigo-100 bg-indigo-50', value: 'text-indigo-700' },
  teal: { box: 'border-teal-100 bg-teal-50', value: 'text-teal-700' },
};

/** A single KPI summary box (label + value) with a light, color-coded
 * background. Used for the Task Performance / Register Performance /
 * Final Performance rows so every box shares the same markup and
 * only the color variant differs. */
function KpiBox({
  label,
  value,
  color,
  className = ''
}: {
  label: string;
  value: string | number;
  color: KpiColor;
  className?: string;
}) {
  const classes = KPI_COLOR_CLASS[color];
  return (
    <div className={`rounded-[20px] border p-5 ${classes.box} ${className}`}>
      <p className="text-xs font-medium text-[#5B6E8C]">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${classes.value}`}>{value}</p>
    </div>
  );
}

function daysAgoISO(days: number): string {
  // School-local calendar day, `days` before today.
  const [y, m, d] = schoolTodayISO().split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - days)).toISOString().split('T')[0];
}

function RegistryPerformancePanel() {
  const today = schoolTodayISO();
  const defaultRangeStart = daysAgoISO(90);

  const [cycleFilter, setCycleFilter] = useState<RegisterCycle | 'ALL'>('ALL');
  const [headFilter, setHeadFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'IDLE' | 'OK' | 'REJECTED'>('ALL');
  // Date range filter (Registration Performance requirement) — defaults to
  // the same 90-day rolling window the panel always used, but is now
  // adjustable and drives BOTH the on-screen numbers and the export, since
  // they must always use the exact same filtering logic.
  const [dateFrom, setDateFrom] = useState<string>(defaultRangeStart);
  const [dateTo, setDateTo] = useState<string>(today);

  const { data: registers = [], isLoading: registersLoading } = useQuery({
    queryKey: ['registers', 'performance-panel'],
    queryFn: () => getRegisters(),
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['register-calendar', 'performance-panel', dateFrom, dateTo],
    queryFn: () => getRegisterCalendarEvents({ start: dateFrom, end: dateTo }),
  });

  // Task Performance data (same source the Staff Performance table above
  // uses) — pulled in here too so the Performance screen's KPI summary and
  // its export can report Task Performance alongside Register Performance
  // without a second, disconnected fetch/filter path. Scoped to the same
  // Date Range filter as the Register Performance half above, so both
  // halves of the panel respect the same date range consistently.
  const { data: staffPerformance = [] } = useQuery({
    queryKey: ['staffPerformance', 'performance-panel', dateFrom, dateTo],
    queryFn: () => getStaffPerformance({ dateFrom, dateTo }),
  });

  // Heads are identified by user id (the register's head_id), never by name
  // text: names are free text and can differ between a register and the user,
  // which is what made the filter drop tasks. Registers without a linked head
  // fall back to their stored name so they can still be filtered.
  const headOptions = useMemo(() => {
    const options = new Map<string, string>();
    for (const register of registers) {
      if (register.head_id) options.set(String(register.head_id), register.head_name);
      else if (register.head_name) options.set(`name:${register.head_name}`, register.head_name);
    }
    return Array.from(options, ([value, label]) => ({ value, label })).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [registers]);

  // Counts come from the backend's `check_outcome` (see utils/registerPerformance):
  // this component never decides on-time / late / not-checked itself.
  const summaries = useMemo(
    () => summarizeRegisterEvents(registers, events, { from: dateFrom, to: dateTo }, today),
    [registers, events, dateFrom, dateTo, today]
  );

  // Apply the Cycle / Head / Status filters — everything below (cards,
  // table, and export) reacts to this SAME filtered set, so the screen and
  // the export can never disagree.
  const filteredSummaries = useMemo(() => {
    return summaries.filter((s) => {
      if (cycleFilter !== 'ALL' && s.register.checking_cycle !== cycleFilter) return false;
      if (headFilter !== 'ALL') {
        const matches = headFilter.startsWith('name:')
          ? s.register.head_name === headFilter.slice(5)
          : s.register.head_id === Number(headFilter);
        if (!matches) return false;
      }
      if (statusFilter !== 'ALL' && s.register.status !== statusFilter) return false;
      return true;
    });
  }, [summaries, cycleFilter, headFilter, statusFilter]);

  // Task Performance rows, scoped to the same Head filter as the register
  // data above. Matched by user id only, never by name text. A register whose
  // head is only a free-text name has no user, so it has no task rows.
  const filteredStaffPerformance = useMemo(() => {
    if (headFilter === 'ALL') return staffPerformance;
    if (headFilter.startsWith('name:')) return [];
    return staffPerformance.filter((row) => row.userId === Number(headFilter));
  }, [staffPerformance, headFilter]);

  // Register totals: one unit everywhere -- register checks (periods) due in
  // the selected range. On Time Checked + Checked After Due Date + Not Checked
  // + Rejected === Total Estimated Check, in the cards, the table and the export.
  const registerTotals = useMemo(() => totalsFromSummaries(filteredSummaries), [filteredSummaries]);
  const overall = { completionRate: registerTotals.completionRate };

  // Task Performance KPI (requirement: Total Task / Completed / Not
  // Completed / Delayed / Performance) — aggregated from the same Task
  // Performance rows shown (and filterable by Head) above. "Not Completed"
  // covers every task that isn't COMPLETED yet (missed/pending/in
  // progress/escalated/delayed); "Delayed" is the subset of those that are
  // specifically overdue (status DELAYED).
  const taskTotals = useMemo(() => {
    const totalTasks = filteredStaffPerformance.reduce((sum, row) => sum + row.totalTasks, 0);
    const completedTasks = filteredStaffPerformance.reduce((sum, row) => sum + row.completedTasks, 0);
    const delayedTasks = filteredStaffPerformance.reduce((sum, row) => sum + row.delayedTasks, 0);
    const notCompletedTasks = totalTasks - completedTasks;
    const taskPerformance = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
    return { totalTasks, completedTasks, delayedTasks, notCompletedTasks, taskPerformance };
  }, [filteredStaffPerformance]);

  // Final Performance: same 50/50 Task + Register blend the backend uses
  // for each staff member's Overall Performance, applied here at the
  // aggregate (currently filtered) level.
  const finalPerformance = useMemo(() => {
    const hasTasks = taskTotals.totalTasks > 0;
    const hasRegisters = registerTotals.totalChecks > 0;
    if (hasTasks && hasRegisters) {
      return Math.round(taskTotals.taskPerformance * 0.5 + overall.completionRate * 0.5);
    }
    if (hasTasks) return taskTotals.taskPerformance;
    if (hasRegisters) return overall.completionRate;
    return 0;
  }, [taskTotals, overall, registerTotals]);

  const [isExporting, setIsExporting] = useState(false);

  // Ask the backend to build the styled Excel file from the same shared
  // filtering/aggregation functions the on-screen numbers use (see
  // `backend/app/routes/reports.py`), with the same filters as the screen.
  const handleExport = async () => {
    setIsExporting(true);
    try {
      await exportPerformanceReportFiltered({
        dateFrom,
        dateTo,
        head: headFilter,
        cycle: cycleFilter,
        status: statusFilter
      });
    } catch (err) {
      console.error('Performance Excel export failed', err);
      toast.error('Unable to export the Excel file right now.');
    } finally {
      setIsExporting(false);
    }
  };

  const isLoading = registersLoading || eventsLoading;

  if (isLoading) {
    return (
      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
        <p className="text-sm text-[#8A99B0]">Loading register performance…</p>
      </div>
    );
  }

  if (registers.length === 0) {
    return (
      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
        <h2 className="mb-1 text-xl font-semibold text-[#1E293B]">Register Performance</h2>
        <p className="text-sm text-[#8A99B0]">No registers have been created yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters + export */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-[#EFF2F6] bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#5B6E8C]">From</label>
            <input
              type="date"
              value={dateFrom}
              max={dateTo}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-[#E4EAF2] bg-white px-3 py-1.5 text-sm text-[#1E293B]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#5B6E8C]">To</label>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              max={today}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-[#E4EAF2] bg-white px-3 py-1.5 text-sm text-[#1E293B]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#5B6E8C]">Cycle</label>
            <select
              value={cycleFilter}
              onChange={(e) => setCycleFilter(e.target.value as RegisterCycle | 'ALL')}
              className="rounded-lg border border-[#E4EAF2] bg-white px-3 py-1.5 text-sm text-[#1E293B]"
            >
              <option value="ALL">All cycles</option>
              {CYCLE_ORDER.map((cycle) => (
                <option key={cycle} value={cycle}>
                  {CYCLE_LABEL[cycle]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#5B6E8C]">Head</label>
            <select
              value={headFilter}
              onChange={(e) => setHeadFilter(e.target.value)}
              className="rounded-lg border border-[#E4EAF2] bg-white px-3 py-1.5 text-sm text-[#1E293B]"
            >
              <option value="ALL">All heads</option>
              {headOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[#5B6E8C]">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'IDLE' | 'OK' | 'REJECTED')}
              className="rounded-lg border border-[#E4EAF2] bg-white px-3 py-1.5 text-sm text-[#1E293B]"
            >
              <option value="ALL">All statuses</option>
              <option value="IDLE">Idle</option>
              <option value="OK">OK</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={handleExport}
          disabled={filteredSummaries.length === 0 || isExporting}
        >
          <Download size={14} />
          {isExporting ? 'Exporting…' : 'Export Excel'}
        </Button>
      </div>

      {/* Task Performance row: Total Task / Completed / Not Completed /
          Delayed / Performance — all respecting the filters above. Each
          box uses a distinct light color so the five figures are easy
          to tell apart at a glance (see KPI_COLOR_CLASS above). */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <KpiBox color="blue" label="Total Task" value={taskTotals.totalTasks} />
        <KpiBox color="green" label="Completed" value={taskTotals.completedTasks} />
        <KpiBox color="yellow" label="Not Completed" value={taskTotals.notCompletedTasks} />
        <KpiBox color="red" label={L.delayed} value={taskTotals.delayedTasks} />
        <KpiBox color="purple" label="Performance" value={`${taskTotals.taskPerformance}%`} />
      </div>

      {/* Register Performance row: every card counts register checks due in the
          range and uses the shared labels, so the four buckets add up to the
          Total Estimated Check and match the table columns below. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <KpiBox color="cyan" label={L.totalEstimatedCheck} value={registerTotals.totalChecks} />
        <KpiBox color="green" label={L.onTimeChecked} value={registerTotals.onTime} />
        <KpiBox color="yellow" label={L.checkedAfterDueDate} value={registerTotals.late} />
        <KpiBox color="red" label={L.notChecked} value={registerTotals.notChecked} />
        <KpiBox color="orange" label={L.rejected} value={registerTotals.rejected} />
        <KpiBox color="indigo" label="Performance" value={`${overall.completionRate}%`} />
      </div>

      {/* Final Performance: the combined (50/50) Task + Register score. */}
      <div className="flex justify-center">
        <KpiBox
          className="w-full max-w-xs text-center"
          color="teal"
          label="Final Performance"
          value={`${finalPerformance}%`}
        />
      </div>

      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
        <h2 className="mb-1 text-xl font-semibold text-[#1E293B]">Register Activity Report</h2>
        <p className="mb-4 text-sm text-[#8A99B0]">
          Every register, however it's assigned (daily, weekly, monthly…), with its own recent activity.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#EFF2F6] bg-[#2E75B6] text-white">
                <th className="pl-6 pr-4 py-3 text-left font-semibold">Register Name</th>
                <th className="px-4 py-3 text-left font-semibold">Register No</th>
                <th className="px-4 py-3 text-left font-semibold">Head Name</th>
                <th className="px-4 py-3 text-left font-semibold">Checking Cycle</th>
                <th className="px-4 py-3 text-left font-semibold">Recent Activity</th>
                <th className="px-4 py-3 text-center font-semibold">{L.onTimeChecked}</th>
                <th className="px-4 py-3 text-center font-semibold">{L.checkedAfterDueDate}</th>
                <th className="px-4 py-3 text-center font-semibold">{L.notChecked}</th>
                <th className="px-4 py-3 text-center font-semibold">{L.rejected}</th>
                <th className="px-4 py-3 text-center font-semibold">{L.totalEstimatedCheck}</th>
                <th className="px-4 py-3 text-center font-semibold">Completion%</th>
              </tr>
            </thead>
            <tbody>
              {filteredSummaries.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-6 text-center text-sm text-[#8A99B0]">
                    No registers match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredSummaries.map((s) => (
                  <tr key={s.register.id} className="border-b border-[#EFF2F6]">
                    <td className="pl-6 pr-4 py-3 font-medium text-[#1E293B]">{s.register.name}</td>
                    <td className="px-4 py-3 text-[#5B6E8C]">{s.register.register_no}</td>
                    <td className="px-4 py-3 text-[#5B6E8C]">{s.register.head_name}</td>
                    <td className="px-4 py-3">
                      <Badge variant="blue">{CYCLE_LABEL[s.register.checking_cycle]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {s.strip.length ? (
                        <div className="flex items-center gap-[3px]" title="Latest 5, Newest First">
                          {latestEntries(s.strip, 5).shown.map((entry) => (
                            <span
                              key={entry.date}
                              className={['h-2.5 w-2.5 rounded-sm', DOT_CLASS[entry.color]].join(' ')}
                              title={entry.date}
                            />
                          ))}
                          {latestEntries(s.strip, 5).more > 0 && (
                            <span className="ml-1 text-xs text-[#8A99B0]">
                              +{latestEntries(s.strip, 5).more} more
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-[#C3CCDA]">No activity yet</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center bg-[#E3F6E8] text-[#14532D]">{s.onTime}</td>
                    <td className="px-4 py-3 text-center bg-[#FEF3C7] text-[#78350F]">{s.late}</td>
                    <td className="px-4 py-3 text-center bg-[#FDE2E2] text-[#7F1D1D]">{s.notChecked}</td>
                    <td className="px-4 py-3 text-center bg-[#FDE2E2] text-[#7F1D1D]">{s.rejected}</td>
                    <td className="px-4 py-3 text-center text-[#1E293B]">{s.total}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <div className="h-2 w-16 rounded-full bg-gray-200">
                          <div
                            className={[
                              'h-2 rounded-full',
                              s.completionRate >= 75 ? 'bg-emerald-500' : s.completionRate < 50 ? 'bg-red-500' : 'bg-amber-500',
                            ].join(' ')}
                            style={{ width: `${s.completionRate}%` }}
                          />
                        </div>
                        <span className="text-xs text-[#1E293B]">{s.completionRate}%</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default RegistryPerformancePanel;
