import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import Button from '../../components/common/Button';
import { getReportPreview, exportReportFile } from '../../services/reportService';
import type { ReportType } from '../../services/reportService';

const DirectorReportsPage: React.FC = () => {
  const [reportType, setReportType] = useState<ReportType>('WEEKLY');
  const [exporting, setExporting] = useState(false);

  const getDefaultFrom = () => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  };

  const [dateFrom, setDateFrom] = useState(getDefaultFrom);
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [enabled, setEnabled] = useState(false);

  const params = { dateFrom, dateTo };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['director-report', reportType, dateFrom, dateTo],
    queryFn: () => getReportPreview(reportType, params),
    enabled,
  });

  const handleGenerate = () => {
    setEnabled(true);
    void refetch();
  };

  const handleExport = async (format: 'pdf' | 'excel') => {
    setExporting(true);
    try {
      await exportReportFile({ reportType, format, params });
      toast.success(`${format.toUpperCase()} downloaded`);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting(false);
    }
  };

  const summary = data?.summary;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#1E293B]">Reports</h1>
        <p className="text-sm text-[#5B6E8C] mt-1">Generate and export school-wide reports</p>
      </div>

      {/* Controls */}
      <div className="rounded-xl border border-[#EFF2F6] bg-white p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">Report Period</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
            >
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="CUSTOM">Custom Report</option>
              <option value="HOUSEKEEPING">Housekeeping</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#5B6E8C] mb-1">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-lg border border-[#E4EAF2] px-3 py-2 text-sm focus:border-[#185FA5] focus:outline-none"
            />
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Button onClick={handleGenerate} loading={isLoading}>Generate Preview</Button>
          <Button variant="ghost" onClick={() => handleExport('excel')} disabled={exporting || !summary}>
            Export Excel
          </Button>
          <Button variant="ghost" onClick={() => handleExport('pdf')} disabled={exporting || !summary}>
            Export PDF
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      {summary ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Total Tasks',  value: summary.total,     color: 'text-[#1E293B]' },
            { label: 'Completed',    value: summary.completed, color: 'text-green-600' },
            { label: 'Pending',      value: summary.pending,   color: 'text-amber-600' },
            { label: 'Delayed',      value: summary.delayed,   color: 'text-red-600' },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl border border-[#EFF2F6] bg-white p-4">
              <p className="text-xs text-[#8A99B0]">{label}</p>
              <p className={`text-2xl font-bold mt-1 ${color}`}>{value ?? 0}</p>
            </div>
          ))}
        </div>
      ) : !isLoading ? (
        <div className="rounded-xl border border-dashed border-[#E4EAF2] bg-white py-16 text-center text-sm text-[#8A99B0]">
          Select a period and click Generate Preview to see a summary.
        </div>
      ) : null}

      {/* Department table */}
      {data?.departments && data.departments.length > 0 && (
        <div className="rounded-xl border border-[#EFF2F6] bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-[#EFF2F6]">
            <h3 className="text-sm font-semibold text-[#1E293B]">Department Breakdown</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="border-b border-[#EFF2F6] bg-[#F8F9FC]">
              <tr>
                {['Department', 'Total', 'Completed', 'Pending', 'Delayed', 'Score'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#8A99B0]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F4F9]">
              {data.departments.map((dept) => (
                <tr key={dept.department} className="hover:bg-[#F8F9FC] transition">
                  <td className="px-4 py-3 font-medium text-[#1E293B]">{dept.department}</td>
                  <td className="px-4 py-3 text-[#5B6E8C]">{dept.total}</td>
                  <td className="px-4 py-3 text-green-600">{dept.completed}</td>
                  <td className="px-4 py-3 text-amber-600">{dept.pending}</td>
                  <td className="px-4 py-3 text-red-600">{dept.delayed}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full bg-[#EFF2F6]">
                        <div
                          className="h-1.5 rounded-full bg-[#185FA5]"
                          style={{ width: `${dept.performanceScore}%` }}
                        />
                      </div>
                      <span className="text-xs text-[#5B6E8C]">{dept.performanceScore}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default DirectorReportsPage;
