import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { getRegisterCalendarEvents, getRegisters } from '../../services/registerService';
import { getStaffPerformance } from '../../services/dashboardService';
import { exportPerformanceReportFiltered } from '../../services/reportService';
import { getRoleLabel } from '../../utils/roleUtils';
import { todayISO } from '../../utils/dateUtils';
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
};

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

interface RegisterSummary {
  register: Register;
  completed: number;
  missed: number;
  rejected: number;
  total: number;
  completionRate: number;
  /** Chronological dot colors for the last ~30 days, oldest first — this IS
   * the per-register "activity graph": a daily register shows ~30 dots, a
   * weekly one shows ~4, a monthly one shows ~1, etc., because each register
   * only has an occurrence on the days its own Checking Cycle actually falls
   * due. */
  strip: { date: string; color: RegisterDotColor }[];
}

/** Escape a value for safe inclusion in a CSV cell. */
function csvCell(value: string | number): string {
  const str = String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function downloadCsv(filename: string, rows: (string | number)[][]) {
  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function RegistryPerformancePanel() {
  const today = todayISO();
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
  // without a second, disconnected fetch/filter path.
  const { data: staffPerformance = [] } = useQuery({
    queryKey: ['staffPerformance'],
    queryFn: getStaffPerformance,
  });

  const headOptions = useMemo(() => {
    const names = new Set<string>();
    for (const register of registers) {
      if (register.head_name) names.add(register.head_name);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [registers]);

  const summaries = useMemo<RegisterSummary[]>(() => {
    const byRegister = new Map<number, RegisterSummary>();
    for (const register of registers) {
      byRegister.set(register.id, {
        register,
        completed: 0,
        missed: 0,
        rejected: 0,
        total: 0,
        completionRate: 0,
        strip: [],
      });
    }

    for (const event of events) {
      // Only past + today occurrences count as "activity" — a future/UPCOMING
      // date hasn't happened yet, so it can't be counted as completed or missed.
      if (event.date > today) continue;
      const summary = byRegister.get(event.register_id);
      if (!summary) continue;

      summary.strip.push({ date: event.date, color: event.dot_color });
      if (event.computed_status === 'COMPLETED') summary.completed += 1;
      else if (event.computed_status === 'FAILED') summary.rejected += 1;
      else if (event.computed_status === 'PENDING') summary.missed += 1;
    }

    for (const summary of byRegister.values()) {
      summary.total = summary.completed + summary.missed + summary.rejected;
      summary.completionRate = summary.total ? Math.round((summary.completed / summary.total) * 100) : 0;
      summary.strip.sort((a, b) => a.date.localeCompare(b.date));
      summary.strip = summary.strip.slice(-30);
    }

    return Array.from(byRegister.values()).sort((a, b) => a.completionRate - b.completionRate);
  }, [registers, events, today]);

  // Apply the Cycle / Head / Status filters — everything below (cards,
  // table, and export) reacts to this SAME filtered set, so the screen and
  // the export can never disagree.
  const filteredSummaries = useMemo(() => {
    return summaries.filter((s) => {
      if (cycleFilter !== 'ALL' && s.register.checking_cycle !== cycleFilter) return false;
      if (headFilter !== 'ALL' && s.register.head_name !== headFilter) return false;
      if (statusFilter !== 'ALL' && s.register.status !== statusFilter) return false;
      return true;
    });
  }, [summaries, cycleFilter, headFilter, statusFilter]);

  // Task Performance rows, scoped to the same Head filter as the register
  // data above (matched on name, since the performance API returns each
  // user's name/role but registers store head_name as free text/derived
  // from the same user).
  const filteredStaffPerformance = useMemo(() => {
    if (headFilter === 'ALL') return staffPerformance;
    return staffPerformance.filter((row) => row.name === headFilter);
  }, [staffPerformance, headFilter]);

  // Overall performance: how much activity was "changed" (completed on time)
  // vs "not changed" (missed / never actioned) vs rejected, across every
  // register that matches the current filter.
  const overall = useMemo(() => {
    const totalCompleted = filteredSummaries.reduce((sum, s) => sum + s.completed, 0);
    const totalMissed = filteredSummaries.reduce((sum, s) => sum + s.missed, 0);
    const totalRejected = filteredSummaries.reduce((sum, s) => sum + s.rejected, 0);
    const totalDue = totalCompleted + totalMissed + totalRejected;
    const completionRate = totalDue ? Math.round((totalCompleted / totalDue) * 100) : 0;
    return { totalCompleted, totalMissed, totalRejected, totalDue, completionRate };
  }, [filteredSummaries]);

  // Total Registers KPI (requirement: Total Registers / Checked / Not
  // Checked, with Total = Checked + Not Checked). A register counts as
  // "Checked" here if it has at least one completed occurrence within the
  // selected date range/filters; otherwise it is "Not Checked" — this
  // covers registers that were only missed/rejected, or never actioned.
  const registerTotals = useMemo(() => {
    const totalRegisters = filteredSummaries.length;
    const checked = filteredSummaries.filter((s) => s.completed > 0).length;
    const notChecked = totalRegisters - checked;
    return { totalRegisters, checked, notChecked };
  }, [filteredSummaries]);

  // Task Performance KPI (requirement: Total/Completed/Delayed/Missed
  // tasks) — aggregated from the same Task Performance rows shown (and
  // filterable by Head) above.
  const taskTotals = useMemo(() => {
    const totalTasks = filteredStaffPerformance.reduce((sum, row) => sum + row.totalTasks, 0);
    const completedTasks = filteredStaffPerformance.reduce((sum, row) => sum + row.completedTasks, 0);
    const delayedTasks = filteredStaffPerformance.reduce((sum, row) => sum + row.delayedTasks, 0);
    const taskPerformance = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
    return { totalTasks, completedTasks, delayedTasks, taskPerformance };
  }, [filteredStaffPerformance]);

  // Final Performance: same 50/50 Task + Register blend the backend uses
  // for each staff member's Overall Performance, applied here at the
  // aggregate (currently filtered) level.
  const finalPerformance = useMemo(() => {
    const hasTasks = taskTotals.totalTasks > 0;
    const hasRegisters = registerTotals.totalRegisters > 0;
    if (hasTasks && hasRegisters) {
      return Math.round(taskTotals.taskPerformance * 0.5 + overall.completionRate * 0.5);
    }
    if (hasTasks) return taskTotals.taskPerformance;
    if (hasRegisters) return overall.completionRate;
    return 0;
  }, [taskTotals, overall, registerTotals]);

  const [isExporting, setIsExporting] = useState(false);

  /** Falls back to the previous client-side CSV (built from the exact same
   * filtered data already on screen) if the backend export is unavailable
   * for any reason, so exporting never breaks entirely. */
  const exportClientCsv = () => {
    const headLabel = headFilter === 'ALL' ? 'All heads' : headFilter;
    const cycleLabel = cycleFilter === 'ALL' ? 'All cycles' : CYCLE_LABEL[cycleFilter];
    const statusLabel = statusFilter === 'ALL' ? 'All statuses' : statusFilter;

    const rows: (string | number)[][] = [
      ['Performance Export'],
      ['Filters', `Date: ${dateFrom} to ${dateTo}`, `Head: ${headLabel}`, `Cycle: ${cycleLabel}`, `Status: ${statusLabel}`],
      [],
      ['Registration Performance'],
      ['Total Registers', 'Checked Registers', 'Not Checked Registers'],
      [registerTotals.totalRegisters, registerTotals.checked, registerTotals.notChecked],
      [],
      ['Registration Activity'],
      ['Completed (Changed)', 'Missed (Not Changed)', 'Rejected', 'Total Due'],
      [overall.totalCompleted, overall.totalMissed, overall.totalRejected, overall.totalDue],
      [],
      ['Task Performance'],
      ['Total Tasks', 'Completed Tasks', 'Delayed Tasks'],
      [taskTotals.totalTasks, taskTotals.completedTasks, taskTotals.delayedTasks],
      [],
      ['Performance Metrics'],
      ['Task Performance %', 'Register Performance %', 'Final Performance %'],
      [taskTotals.taskPerformance, overall.completionRate, finalPerformance],
      [],
      ['Detailed Register Records'],
      ['Register', 'Register No', 'Head', 'Cycle', 'Status', 'Completed (Changed)', 'Missed (Not Changed)', 'Rejected', 'Total Due', 'Completion %'],
      ...filteredSummaries.map((s) => [
        s.register.name,
        s.register.register_no,
        s.register.head_name,
        CYCLE_LABEL[s.register.checking_cycle],
        s.register.status,
        s.completed,
        s.missed,
        s.rejected,
        s.total,
        s.completionRate,
      ]),
      [],
      ['Detailed Task Performance Records'],
      ['Role', 'Total Tasks', 'Completed', 'Delayed', 'Delay Rate %', 'Task Performance %'],
      ...filteredStaffPerformance.map((row) => [
        getRoleLabel(row.role),
        row.totalTasks,
        row.completedTasks,
        row.delayedTasks,
        row.delayRate,
        row.performanceScore,
      ]),
    ];
    downloadCsv(`performance_export_${today}.csv`, rows);
  };

  // Primary export path: ask the backend to compute and stream the CSV
  // directly from the same shared filtering/aggregation functions the
  // on-screen numbers use (see `backend/app/routes/reports.py`), so large
  // datasets don't need to be pulled to the client first. Falls back to the
  // client-side CSV above if the request fails for any reason.
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
      console.error('Backend performance export failed, falling back to client CSV', err);
      exportClientCsv();
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
        <h2 className="mb-1 text-xl font-semibold text-[#1E293B]">Register performance</h2>
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
              {headOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
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
          {isExporting ? 'Exporting…' : 'Export CSV'}
        </Button>
      </div>

      {/* Total Registers KPI: Total = Checked + Not Checked, all respecting
          the filters above. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-5">
          <p className="text-xs font-medium text-[#8A99B0]">Total Registers</p>
          <p className="mt-1 text-2xl font-semibold text-[#1E293B]">{registerTotals.totalRegisters}</p>
        </div>
        <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-5">
          <p className="text-xs font-medium text-[#8A99B0]">Checked</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">{registerTotals.checked}</p>
        </div>
        <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-5">
          <p className="text-xs font-medium text-[#8A99B0]">Not Checked</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">{registerTotals.notChecked}</p>
        </div>
      </div>

      {/* Overall performance summary: changed vs not changed vs overall rate */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-5">
          <p className="text-xs font-medium text-[#8A99B0]">checked (Completed)</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600">{overall.totalCompleted}</p>
        </div>
        <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-5">
          <p className="text-xs font-medium text-[#8A99B0]">Not checked (Missed)</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">{overall.totalMissed}</p>
        </div>
        <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-5">
          <p className="text-xs font-medium text-[#8A99B0]">Rejected</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">{overall.totalRejected}</p>
        </div>
        <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-5">
          <p className="text-xs font-medium text-[#8A99B0]">Overall Performance</p>
          <p className="mt-1 text-2xl font-semibold text-[#185FA5]">{overall.completionRate}%</p>
        </div>
        <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-5">
          <p className="text-xs font-medium text-[#8A99B0]">Task Performance</p>
          <p className="mt-1 text-2xl font-semibold text-[#185FA5]">{taskTotals.taskPerformance}%</p>
        </div>
        <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-5">
          <p className="text-xs font-medium text-[#8A99B0]">Final Performance</p>
          <p className="mt-1 text-2xl font-semibold text-[#185FA5]">{finalPerformance}%</p>
        </div>
      </div>

      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
        <h2 className="mb-1 text-xl font-semibold text-[#1E293B]">Register activity report</h2>
        <p className="mb-4 text-sm text-[#8A99B0]">
          Every register, however it's assigned (daily, weekly, monthly…), with its own recent activity.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#EFF2F6]">
                <th className="px-4 py-3 text-left font-medium text-[#5B6E8C]">Register</th>
                <th className="px-4 py-3 text-left font-medium text-[#5B6E8C]">Head</th>
                <th className="px-4 py-3 text-left font-medium text-[#5B6E8C]">Cycle</th>
                <th className="px-4 py-3 text-left font-medium text-[#5B6E8C]">Recent activity</th>
                <th className="px-4 py-3 text-left font-medium text-[#5B6E8C]">Completed</th>
                <th className="px-4 py-3 text-left font-medium text-[#5B6E8C]">Missed</th>
                <th className="px-4 py-3 text-left font-medium text-[#5B6E8C]">Rejected</th>
                <th className="px-4 py-3 text-left font-medium text-[#5B6E8C]">Completion</th>
              </tr>
            </thead>
            <tbody>
              {filteredSummaries.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-[#8A99B0]">
                    No registers match the selected filters.
                  </td>
                </tr>
              ) : (
                filteredSummaries.map((s) => (
                  <tr key={s.register.id} className="border-b border-[#EFF2F6]">
                    <td className="px-4 py-3 font-medium text-[#1E293B]">{s.register.name}</td>
                    <td className="px-4 py-3 text-[#5B6E8C]">{s.register.head_name}</td>
                    <td className="px-4 py-3">
                      <Badge variant="blue">{CYCLE_LABEL[s.register.checking_cycle]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      {s.strip.length ? (
                        <div className="flex items-center gap-[3px]" title="Oldest → most recent">
                          {s.strip.map((entry) => (
                            <span
                              key={entry.date}
                              className={['h-2.5 w-2.5 rounded-sm', DOT_CLASS[entry.color]].join(' ')}
                              title={entry.date}
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-[#C3CCDA]">No activity yet</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#1E293B]">{s.completed}</td>
                    <td className="px-4 py-3 text-[#1E293B]">{s.missed}</td>
                    <td className="px-4 py-3 text-[#1E293B]">{s.rejected}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
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
