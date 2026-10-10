import { PERFORMANCE_LABELS as L } from '../../constants/performanceLabels';
import {
  aggregateRegistersByRole,
  defaultRegisterRange,
  latestEntries,
  summarizeRegisterTotals,
  toHeadLabel,
} from '../../utils/performanceUtils';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { getRegisters } from '../../services/registerService';
import { DOT_CLASS } from '../../constants/registerDots';
import { markerTooltip } from '../../utils/registerCheckUtils';
import { exportPerformanceReportFiltered, getRegisterPerformance } from '../../services/reportService';
import { todayISO } from '../../utils/dateUtils';
import type { RegisterCycle, RegisterDotColor } from '../../types/register.types';

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

/** Light, professional color variants for the register KPI cards below. Each
 * variant is a subtle tinted background + matching border + a readable value
 * color. */
type KpiColor = 'green' | 'yellow' | 'red' | 'cyan' | 'orange';

const KPI_COLOR_CLASS: Record<KpiColor, { box: string; value: string }> = {
  green: { box: 'border-emerald-100 bg-emerald-50', value: 'text-emerald-700' },
  yellow: { box: 'border-amber-100 bg-amber-50', value: 'text-amber-700' },
  red: { box: 'border-red-100 bg-red-50', value: 'text-red-700' },
  cyan: { box: 'border-cyan-100 bg-cyan-50', value: 'text-cyan-700' },
  orange: { box: 'border-orange-100 bg-orange-50', value: 'text-orange-700' },
};

/** A single KPI summary box (label + value) with a light, color-coded
 * background. Every register card shares the same markup; only the color
 * variant differs. */
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

/** One register's row, exactly as classified by the backend. */
interface RegisterSummary {
  register: {
    id: number;
    name: string;
    register_no: string;
    head_id: number | null;
    head_name: string;
    role: string;
    role_name: string;
    checking_cycle: RegisterCycle;
    status: string;
  };
  /** onTime + late + notChecked === total (Total Required Due). */
  onTime: number;
  late: number;
  notChecked: number;
  total: number;
  completionRate: number;
  /** Periods in the range, newest first (only the latest 5 are rendered). */
  strip: { date: string; color: RegisterDotColor; tooltip: string }[];
}

/** `roleFilter` is the page-level "Filter Tasks and Registers by Role" (a role KEY, or 'ALL').
 * It narrows only the per-role Register Performance table, exactly as before. */
function RegistryPerformancePanel({ roleFilter = 'ALL' }: { roleFilter?: string } = {}) {
  const today = todayISO();
  const defaultRangeStart = defaultRegisterRange().dateFrom;

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

  // Classified by the backend (same function the exports use): a period belongs
  // to the range by its due date, and a late check stays in its original period.
  const { data: registerPerformance, isLoading: eventsLoading } = useQuery({
    queryKey: ['register-performance', dateFrom, dateTo],
    queryFn: () => getRegisterPerformance({ dateFrom, dateTo }),
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

  const summaries = useMemo<RegisterSummary[]>(() => {
    const items = (registerPerformance?.summaries ?? []).map<RegisterSummary>((item) => ({
      register: {
        id: item.register_id,
        name: item.name,
        register_no: item.register_no,
        head_id: item.head_id,
        head_name: item.head_name,
        role: item.role,
        role_name: item.roleName,
        checking_cycle: item.cycle as RegisterCycle,
        status: item.status,
      },
      onTime: item.onTimeChecked,
      late: item.checkedAfterDueDate,
      notChecked: item.notChecked,
      total: item.totalPeriodsDue,
      completionRate: item.completionRate,
      strip: [...item.periods]
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((period) => ({
          date: period.date,
          color: period.dot_color,
          tooltip: markerTooltip(period, period.date),
        })),
    }));
    return items.sort((a, b) => a.completionRate - b.completionRate);
  }, [registerPerformance]);

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

  // Plain sums of the backend numbers above, so every card equals its table
  // column: On Time Checked + Checked After Due Date + Not Checked + Delayed
  // = Total Required Due. The browser never re-classifies a period. The same
  // helper feeds the Dashboard's Register cards, so both screens match.
  const registerTotals = useMemo(
    () =>
      summarizeRegisterTotals(
        filteredSummaries.map((s) => ({
          onTimeChecked: s.onTime,
          checkedAfterDueDate: s.late,
          notChecked: s.notChecked,
        }))
      ),
    [filteredSummaries]
  );

  // Per-role table: summed from the same filtered summaries as the cards and the
  // Activity table, so its Total row equals the cards and the export.
  const roleRows = useMemo(
    () =>
      aggregateRegistersByRole(
        filteredSummaries
          .filter((s) => roleFilter === 'ALL' || s.register.role === roleFilter)
          .map((s) => ({
            role: s.register.role,
            roleName: s.register.role_name,
            cycle: s.register.checking_cycle,
            onTimeChecked: s.onTime,
            checkedAfterDueDate: s.late,
            notChecked: s.notChecked,
          })),
        CYCLE_ORDER
      ),
    [filteredSummaries, roleFilter]
  );
  const roleTotals = useMemo(() => {
    const sum = (pick: (r: (typeof roleRows)[number]) => number) => roleRows.reduce((acc, r) => acc + pick(r), 0);
    const onTimeChecked = sum((r) => r.onTimeChecked);
    const checkedAfterDueDate = sum((r) => r.checkedAfterDueDate);
    const totalPeriodsDue = sum((r) => r.totalPeriodsDue);
    return {
      totalRegisters: sum((r) => r.totalRegisters),
      onTimeChecked,
      checkedAfterDueDate,
      notChecked: sum((r) => r.notChecked),
      totalPeriodsDue,
      registerPerformance: totalPeriodsDue
        ? Math.round(((onTimeChecked + checkedAfterDueDate) / totalPeriodsDue) * 100)
        : 0,
    };
  }, [roleRows]);

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
        <div className="w-full">
          <h2 className="text-base font-semibold text-[#1E293B]">Filter Registers</h2>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="register-date-from" className="text-xs font-medium text-[#5B6E8C]">From</label>
            <input
              id="register-date-from"
              type="date"
              value={dateFrom}
              max={dateTo}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-lg border border-[#E4EAF2] bg-white px-3 py-1.5 text-sm text-[#1E293B]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="register-date-to" className="text-xs font-medium text-[#5B6E8C]">To</label>
            <input
              id="register-date-to"
              type="date"
              value={dateTo}
              min={dateFrom}
              max={today}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-lg border border-[#E4EAF2] bg-white px-3 py-1.5 text-sm text-[#1E293B]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="register-cycle-filter" className="text-xs font-medium text-[#5B6E8C]">Cycle</label>
            <select
              id="register-cycle-filter"
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
            <label htmlFor="register-head-filter" className="text-xs font-medium text-[#5B6E8C]">Head</label>
            <select
              id="register-head-filter"
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
            <label htmlFor="register-status-filter" className="text-xs font-medium text-[#5B6E8C]">Status</label>
            <select
              id="register-status-filter"
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

      {/* Register cards, directly below the filters. Names come from the shared
          label constants and the numbers are the backend's per-period counts,
          the same ones the table columns and the export show. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiBox color="green" label={L.onTimeChecked} value={registerTotals.onTimeChecked} />
        <KpiBox color="yellow" label={L.checkedAfterDueDate} value={registerTotals.checkedAfterDueDate} />
        <KpiBox color="orange" label={L.notChecked} value={registerTotals.notChecked} />
        <KpiBox color="cyan" label={L.totalRegisters} value={registerTotals.totalRegisters} />
      </div>

      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
        <h2 className="mb-4 text-xl font-semibold text-[#1E293B]">Register Performance</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#EFF2F6] bg-[#2E75B6] text-white">
                <th className="pl-6 pr-4 py-3 text-left font-semibold">{L.role}</th>
                <th className="px-4 py-3 text-center font-semibold">{L.totalRegisters}</th>
                <th className="px-4 py-3 text-center font-semibold">{L.checkingCycle}</th>
                <th className="px-4 py-3 text-center font-semibold">{L.onTimeChecked}</th>
                <th className="px-4 py-3 text-center font-semibold">{L.checkedAfterDueDate}</th>
                <th className="px-4 py-3 text-center font-semibold">{L.notChecked}</th>
                <th className="px-4 py-3 text-center font-semibold">{L.totalPeriodsDue}</th>
                <th className="px-4 py-3 text-center font-semibold">{L.registerPerformance}</th>
              </tr>
            </thead>
            <tbody>
              {roleRows.map((row) => (
                <tr key={row.role} className="border-b border-[#EFF2F6]">
                  <td className="pl-6 pr-4 py-3 text-left text-[#5B6E8C]">{toHeadLabel(row.roleName)}</td>
                  <td className="px-4 py-3 text-center text-cyan-700">{row.totalRegisters}</td>
                  <td className="px-4 py-3 text-center text-blue-700">
                    {row.checkingCycles.map((c) => CYCLE_LABEL[c as RegisterCycle] ?? c).join(', ') || 'N/A'}
                  </td>
                  <td className="px-4 py-3 text-center bg-[#E3F6E8] text-[#14532D]">{row.onTimeChecked}</td>
                  <td className="px-4 py-3 text-center bg-[#FEF3C7] text-[#78350F]">{row.checkedAfterDueDate}</td>
                  <td className="px-4 py-3 text-center bg-[#FDE2E2] text-[#7F1D1D]">{row.notChecked}</td>
                  <td className="px-4 py-3 text-center text-cyan-700">{row.totalPeriodsDue}</td>
                  <td className="px-4 py-3 text-center text-indigo-700">{row.registerPerformance}%</td>
                </tr>
              ))}
              {roleRows.length > 0 && (
                <tr className="bg-[#F1F5F9] font-semibold text-[#1E293B]" data-testid="register-performance-total">
                  <td className="pl-6 pr-4 py-3 text-left">Total</td>
                  <td className="px-4 py-3 text-center">{roleTotals.totalRegisters}</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-center">{roleTotals.onTimeChecked}</td>
                  <td className="px-4 py-3 text-center">{roleTotals.checkedAfterDueDate}</td>
                  <td className="px-4 py-3 text-center">{roleTotals.notChecked}</td>
                  <td className="px-4 py-3 text-center">{roleTotals.totalPeriodsDue}</td>
                  <td className="px-4 py-3 text-center">{roleTotals.registerPerformance}%</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
                <th className="px-4 py-3 text-center font-semibold">{L.totalPeriodsDue}</th>
                <th className="px-4 py-3 text-center font-semibold">Completion %</th>
              </tr>
            </thead>
            <tbody>
              {filteredSummaries.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-sm text-[#8A99B0]">
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
                              title={entry.tooltip}
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
