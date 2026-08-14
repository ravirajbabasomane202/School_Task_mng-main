import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import RegistryCycleChart from '../charts/RegistryCycleChart';
import Badge from '../common/Badge';
import Button from '../common/Button';
import { getRegisterCalendarEvents, getRegisters } from '../../services/registerService';
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
  const rangeStart = daysAgoISO(90);

  const [cycleFilter, setCycleFilter] = useState<RegisterCycle | 'ALL'>('ALL');
  const [headFilter, setHeadFilter] = useState<string>('ALL');

  const { data: registers = [], isLoading: registersLoading } = useQuery({
    queryKey: ['registers', 'performance-panel'],
    queryFn: () => getRegisters(),
  });

  const { data: events = [], isLoading: eventsLoading } = useQuery({
    queryKey: ['register-calendar', 'performance-panel', rangeStart, today],
    queryFn: () => getRegisterCalendarEvents({ start: rangeStart, end: today }),
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

  // Apply the Cycle / Head filters — everything below (cards, charts, table,
  // export) reacts to this filtered set so what you see is what you export.
  const filteredSummaries = useMemo(() => {
    return summaries.filter((s) => {
      if (cycleFilter !== 'ALL' && s.register.checking_cycle !== cycleFilter) return false;
      if (headFilter !== 'ALL' && s.register.head_name !== headFilter) return false;
      return true;
    });
  }, [summaries, cycleFilter, headFilter]);

  const cycleChartData = useMemo(() => {
    return CYCLE_ORDER.map((cycle) => {
      const rows = filteredSummaries.filter((s) => s.register.checking_cycle === cycle);
      const totalCompleted = rows.reduce((sum, r) => sum + r.completed, 0);
      const totalDue = rows.reduce((sum, r) => sum + r.total, 0);
      return {
        cycle: CYCLE_LABEL[cycle],
        completionRate: totalDue ? Math.round((totalCompleted / totalDue) * 100) : 0,
        registerCount: rows.length,
      };
    }).filter((row) => row.registerCount > 0);
  }, [filteredSummaries]);

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

  const handleExport = () => {
    const rows: (string | number)[][] = [
      ['Register', 'Register No', 'Head', 'Cycle', 'Completed (Changed)', 'Missed (Not Changed)', 'Rejected', 'Total Due', 'Completion %'],
      ...filteredSummaries.map((s) => [
        s.register.name,
        s.register.register_no,
        s.register.head_name,
        CYCLE_LABEL[s.register.checking_cycle],
        s.completed,
        s.missed,
        s.rejected,
        s.total,
        s.completionRate,
      ]),
    ];
    downloadCsv(`register_performance_${today}.csv`, rows);
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
        <div className="flex flex-wrap items-center gap-3">
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
        </div>
        <Button variant="primary" size="sm" onClick={handleExport} disabled={filteredSummaries.length === 0}>
          <Download size={14} />
          Export CSV
        </Button>
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
      </div>

      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
        <h2 className="mb-1 text-xl font-semibold text-[#1E293B]">Register completion by checking cycle</h2>
        <p className="mb-4 text-sm text-[#8A99B0]">
          How reliably each cycle (Daily / Weekly / Monthly / …) is being kept up to date, over the last 90 days.
        </p>
        {cycleChartData.length > 0 ? (
          <RegistryCycleChart data={cycleChartData} />
        ) : (
          <p className="text-sm text-[#8A99B0]">No data for the selected filters.</p>
        )}
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
