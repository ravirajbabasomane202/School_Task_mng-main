import React, { useEffect, useState } from "react";
import { BarChart2, TrendingDown, Users, Star } from "lucide-react";
import api from "../../services/api";

interface DeptStat {
  department: string;
  total: number;
  completed: number;
  delayed: number;
  efficiency: number; // completed / total * 100
  delayRate: number;  // delayed / total * 100
}

interface MonthComparison {
  month: string;
  completed: number;
  delayed: number;
}

const PerformancePage: React.FC = () => {
  const [deptStats, setDeptStats] = useState<DeptStat[]>([]);
  const [monthData, setMonthData] = useState<MonthComparison[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get("/api/reports/performance");
        setDeptStats(res.data.departmentStats || []);
        setMonthData(res.data.monthlyComparison || []);
      } catch {
        setError("Failed to load performance data.");
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const efficiencyColor = (pct: number) =>
    pct >= 80 ? "text-green-600" : pct >= 50 ? "text-yellow-600" : "text-red-600";

  const barWidth = (val: number, max: number) =>
    max > 0 ? `${Math.round((val / max) * 100)}%` : "0%";

  const maxCompleted = Math.max(...monthData.map((m) => m.completed), 1);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
        <BarChart2 size={24} className="text-blue-600" />
        Performance Analytics
      </h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      ) : (
        <>
          {/* Department Efficiency Table */}
          <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b">
              <Users size={18} className="text-blue-600" />
              <h3 className="font-semibold text-gray-800">Department Efficiency</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-5 py-3 font-medium text-gray-600">Department</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Total</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Completed</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Delayed</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Efficiency</th>
                    <th className="text-center px-4 py-3 font-medium text-gray-600">Delay Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {deptStats.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-gray-400">
                        No data available.
                      </td>
                    </tr>
                  ) : (
                    deptStats.map((d) => (
                      <tr key={d.department} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-800">{d.department}</td>
                        <td className="text-center px-4 py-3 text-gray-600">{d.total}</td>
                        <td className="text-center px-4 py-3 text-green-600 font-medium">{d.completed}</td>
                        <td className="text-center px-4 py-3 text-red-500 font-medium">{d.delayed}</td>
                        <td className={`text-center px-4 py-3 font-bold ${efficiencyColor(d.efficiency)}`}>
                          {d.efficiency.toFixed(1)}%
                        </td>
                        <td className="text-center px-4 py-3">
                          <span className={`text-xs font-medium ${d.delayRate > 30 ? "text-red-600" : "text-gray-500"}`}>
                            {d.delayRate.toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Staff Performance Score (top performers) */}
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <Star size={18} className="text-yellow-500" />
              <h3 className="font-semibold text-gray-800">Staff Performance Score</h3>
              <span className="text-xs text-gray-400 ml-1">(by task completion efficiency)</span>
            </div>
            <div className="space-y-3">
              {deptStats
                .slice()
                .sort((a, b) => b.efficiency - a.efficiency)
                .map((d, i) => (
                  <div key={d.department} className="flex items-center gap-3">
                    <span className="w-6 text-sm font-bold text-gray-400 text-right">{i + 1}</span>
                    <span className="w-36 text-sm font-medium text-gray-700 truncate">{d.department}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-3 rounded-full ${
                          d.efficiency >= 80
                            ? "bg-green-500"
                            : d.efficiency >= 50
                            ? "bg-yellow-400"
                            : "bg-red-400"
                        }`}
                        style={{ width: `${d.efficiency}%` }}
                      />
                    </div>
                    <span className={`text-sm font-bold w-14 text-right ${efficiencyColor(d.efficiency)}`}>
                      {d.efficiency.toFixed(0)}%
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {/* Monthly Comparison Chart */}
          <div className="bg-white rounded-xl border shadow-sm p-5">
            <div className="flex items-center gap-2 mb-4">
              <TrendingDown size={18} className="text-blue-600" />
              <h3 className="font-semibold text-gray-800">Monthly Comparison</h3>
              <span className="text-xs text-gray-400 ml-1">(last 6 months)</span>
            </div>
            {monthData.length === 0 ? (
              <p className="text-gray-400 text-sm text-center py-8">No monthly data yet.</p>
            ) : (
              <div className="space-y-4">
                {monthData.map((m) => (
                  <div key={m.month}>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span className="font-medium">{m.month}</span>
                      <span>{m.completed} completed / {m.delayed} delayed</span>
                    </div>
                    <div className="flex gap-1 h-5">
                      <div
                        className="bg-green-400 rounded-sm"
                        style={{ width: barWidth(m.completed, maxCompleted) }}
                        title={`Completed: ${m.completed}`}
                      />
                      <div
                        className="bg-red-300 rounded-sm"
                        style={{ width: barWidth(m.delayed, maxCompleted) }}
                        title={`Delayed: ${m.delayed}`}
                      />
                    </div>
                  </div>
                ))}
                <div className="flex gap-4 text-xs text-gray-400 mt-2">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-400 rounded-sm inline-block" /> Completed</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-300 rounded-sm inline-block" /> Delayed</span>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default PerformancePage;
