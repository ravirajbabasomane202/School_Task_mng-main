import { useMemo, useState, type ChangeEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import api from '../../services/api';
import {
  downloadReport,
  exportReportFile,
  getReportHistory,
  getReportPreview,
  type ReportHistoryItem,
  type ReportType
} from '../../services/reportService';

interface Department {
  id: number;
  name: string;
}

const today = new Date();
const defaultTo = today.toISOString().slice(0, 10);
const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);

const formatDate = (dateString?: string | null) => {
  if (!dateString) {
    return '--';
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
};

function MISReports() {
  const queryClient = useQueryClient();
  const [reportType, setReportType] = useState<ReportType>('DAILY');
  const [departmentId, setDepartmentId] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>(defaultTo);
  const [dateTo, setDateTo] = useState<string>(defaultTo);
  const [selectedMonth, setSelectedMonth] = useState<string>(
    `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  );
  const [isExporting, setIsExporting] = useState<'pdf' | 'excel' | null>(null);

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, index) => {
        const month = index + 1;
        const label = new Date(today.getFullYear(), index).toLocaleString('en-US', {
          month: 'short'
        });
        return {
          label,
          value: `${today.getFullYear()}-${String(month).padStart(2, '0')}`
        };
      }),
    []
  );

  const getMonthRange = (monthValue: string) => {
    const [year, month] = monthValue.split('-').map(Number);
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0);
    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10)
    };
  };


  const handleReportTypeChange = (value: ReportType) => {
    setReportType(value);
    setDepartmentId('all');

    if (value === 'DAILY') {
      setDateFrom(defaultTo);
      setDateTo(defaultTo);
    } else if (value === 'WEEKLY') {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - 6);
      setDateFrom(weekStart.toISOString().slice(0, 10));
      setDateTo(defaultTo);
    } else if (value === 'MONTHLY') {
      const newMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
      setSelectedMonth(newMonth);
      const range = getMonthRange(newMonth);
      setDateFrom(range.from);
      setDateTo(range.to);
    } else {
      setDateFrom(defaultFrom);
      setDateTo(defaultTo);
    }
  };

  const handleMonthChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    setSelectedMonth(value);
    const range = getMonthRange(value);
    setDateFrom(range.from);
    setDateTo(range.to);
  };

  const handleDailyDateChange = (value: string) => {
    setDateFrom(value);
    setDateTo(value);
  };

  const handleWeeklyFromChange = (value: string) => {
    const candidateTo = new Date(value);
    candidateTo.setDate(candidateTo.getDate() + 6);
    const nextTo = candidateTo.toISOString().slice(0, 10);
    setDateFrom(value);
    setDateTo(nextTo);
  };

  const handleWeeklyToChange = (value: string) => {
    const candidateFrom = new Date(value);
    candidateFrom.setDate(candidateFrom.getDate() - 6);
    const nextFrom = candidateFrom.toISOString().slice(0, 10);
    setDateFrom(nextFrom);
    setDateTo(value);
  };

  const weeklyRangeInvalid =
    reportType === 'WEEKLY' && Boolean(dateFrom && dateTo && new Date(dateTo).getTime() - new Date(dateFrom).getTime() !== 6 * 24 * 60 * 60 * 1000);

  const previewReady = Boolean(
    dateFrom && dateTo && dateFrom <= dateTo && (reportType !== 'WEEKLY' || !weeklyRangeInvalid)
  );

  const departmentsQuery = useQuery({
    queryKey: ['departments', 'mis-reports'],
    queryFn: async () => {
      const response = await api.get<Department[]>('/departments');
      return response.data;
    }
  });

  const reportHistoryQuery = useQuery({
    queryKey: ['reportHistory'],
    queryFn: getReportHistory
  });

  const previewQuery = useQuery({
    queryKey: ['mis-preview', reportType, departmentId, dateFrom, dateTo],
    queryFn: () =>
      getReportPreview(reportType, {
        dateFrom,
        dateTo,
        departmentId: departmentId === 'all' ? 'all' : Number(departmentId)
      }),
    enabled: previewReady
  });

  const handleExport = async (format: 'pdf' | 'excel') => {
    if (!previewReady) {
      toast.error('Choose a valid date range before exporting.');
      return;
    }

    try {
      setIsExporting(format);
      await exportReportFile({
        reportType,
        format,
        params: {
          dateFrom,
          dateTo,
          departmentId: departmentId === 'all' ? 'all' : Number(departmentId)
        }
      });
      await queryClient.invalidateQueries({ queryKey: ['reportHistory'] });
      toast.success(`${reportType} report exported successfully.`);
    } catch {
      toast.error('Failed to export report.');
    } finally {
      setIsExporting(null);
    }
  };

  const summaryCards = useMemo(() => {
    const summary = previewQuery.data?.summary;
    if (!summary) {
      return [];
    }

    return [
      { label: 'Total tasks', tone: 'text-blue-600', value: summary.total },
      { label: 'Completed', tone: 'text-green-600', value: summary.completed },
      { label: 'Delayed', tone: 'text-red-600', value: summary.delayed },
      { label: 'Pending', tone: 'text-amber-600', value: summary.pending },
      {
        label: reportType === 'MONTHLY' ? 'Performance score' : 'In progress',
        tone: reportType === 'MONTHLY' ? 'text-[#185FA5]' : 'text-[#5B6E8C]',
        value: reportType === 'MONTHLY'
          ? `${previewQuery.data?.summary.performanceScore ?? 0}%`
          : previewQuery.data?.summary.inProgress ?? 0
      }
    ];
  }, [previewQuery.data?.summary, reportType]);

  return (
    <div className="space-y-6 p-6">
      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
        <h2 className="mb-4 text-xl font-semibold text-[#1E293B]">Generate MIS report</h2>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-[#36506C]">Report type</label>
            <select
              value={reportType}
              onChange={(event) => handleReportTypeChange(event.target.value as ReportType)}
              className="w-full min-h-[38px] rounded-[10px] border border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm text-[#1E293B] outline-none focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
            >
              <option value="DAILY">Daily</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="CUSTOM">Custom Report</option>
              <option value="HOUSEKEEPING">Housekeeping</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-[#36506C]">Department</label>
            <select
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              className="w-full min-h-[38px] rounded-[10px] border border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm text-[#1E293B] outline-none focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
            >
              <option value="all">All departments</option>
              {(departmentsQuery.data ?? []).map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
              {!(departmentsQuery.data ?? []).some(
                (d) => d.name.toLowerCase().includes('housekeeping')
              ) && (
                <option value="housekeeping">HouseKeeping</option>
              )}
            </select>
          </div>

          {reportType === 'DAILY' ? (
            <Input
              type="date"
              label="Date"
              value={dateFrom}
              onChange={(event) => handleDailyDateChange(event.target.value)}
            />
          ) : reportType === 'WEEKLY' ? (
            <>
              <Input
                type="date"
                label="Start date"
                value={dateFrom}
                onChange={(event) => handleWeeklyFromChange(event.target.value)}
              />
              <Input
                type="date"
                label="End date"
                value={dateTo}
                onChange={(event) => handleWeeklyToChange(event.target.value)}
              />
            </>
          ) : reportType === 'MONTHLY' ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-[#36506C]">Month</label>
              <select
                value={selectedMonth}
                onChange={handleMonthChange}
                className="w-full min-h-[38px] rounded-[10px] border border-[#DCE2EA] bg-[#F8F9FC] px-3 text-sm text-[#1E293B] outline-none focus:border-[#185FA5] focus:ring-4 focus:ring-[#185FA5]/10"
              >
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <Input
                type="date"
                label="Date from"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
              />
              <Input
                type="date"
                label="Date to"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
              />
            </>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            className="!bg-red-500 !text-white hover:!bg-red-600"
            loading={isExporting === 'pdf'}
            onClick={() => void handleExport('pdf')}
          >
            Export PDF
          </Button>
          <Button
            className="!bg-green-500 !text-white hover:!bg-green-600"
            loading={isExporting === 'excel'}
            onClick={() => void handleExport('excel')}
          >
            Export Excel
          </Button>
        </div>

        {!previewReady ? (
          <p className="mt-4 text-sm text-[#C13F3A]">Date to must be the same as or after date from.</p>
        ) : null}
        {weeklyRangeInvalid ? (
          <p className="mt-4 text-sm text-[#C13F3A]">Weekly reports must cover exactly 7 days.</p>
        ) : null}
      </div>

      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-[#1E293B]">Report preview</h2>
          <span className="text-sm text-[#8A99B0]">
            {formatDate(dateFrom)} to {formatDate(dateTo)}
          </span>
        </div>

        {previewQuery.isLoading ? (
          <div className="py-8 text-center">Loading preview...</div>
        ) : previewQuery.data ? (
          <div className="mt-5 space-y-6">
            <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
              {summaryCards.map((card) => (
                <div className="rounded-[16px] bg-[#F8F9FC] p-4" key={card.label}>
                  <p className="text-sm text-[#5B6E8C]">{card.label}</p>
                  <p className={`mt-3 text-2xl font-semibold ${card.tone}`}>{card.value}</p>
                </div>
              ))}
            </div>

            <div className="grid gap-6 xl:grid-cols-[0.95fr,1.05fr]">
              <div>
                <h3 className="mb-3 text-lg font-semibold text-[#1E293B]">Department summary</h3>
                <div className="space-y-3">
                  {previewQuery.data.departments.length > 0 ? (
                    previewQuery.data.departments.map((department) => (
                      <div
                        key={department.department}
                        className="rounded-[16px] border border-[#EFF2F6] bg-[#FAFCFE] p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-[#1E293B]">
                            {department.department}
                          </p>
                          <p className="text-sm font-semibold text-[#185FA5]">
                            {department.performanceScore}%
                          </p>
                        </div>
                        <div className="mt-3 grid grid-cols-4 gap-2 text-sm text-[#5B6E8C]">
                          <div>Total: {department.total}</div>
                          <div>Done: {department.completed}</div>
                          <div>Delayed: {department.delayed}</div>
                          <div>Pending: {department.pending}</div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-[16px] border border-dashed border-[#DCE2EA] p-5 text-sm text-[#8A99B0]">
                      No department data found for this range.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h3 className="mb-3 text-lg font-semibold text-[#1E293B]">Task details</h3>
                <div className="overflow-x-auto rounded-[16px] border border-[#EFF2F6]">
                  <table className="min-w-full border-collapse">
                    <thead>
                      <tr className="bg-[#F8F9FC] text-left">
                        {['Task', 'Assigned To', 'Priority', 'Status', 'Due Date', 'Department'].map(
                          (heading) => (
                            <th
                              className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8A99B0]"
                              key={heading}
                            >
                              {heading}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {previewQuery.data.tasks.length > 0 ? (
                        previewQuery.data.tasks.map((task) => (
                          <tr className="border-t border-[#EFF2F6]" key={task.id}>
                            <td className="px-4 py-3 text-sm font-medium text-[#1E293B]">
                              {task.task}
                            </td>
                            <td className="px-4 py-3 text-sm text-[#36506C]">{task.assignedTo}</td>
                            <td className="px-4 py-3 text-sm text-[#36506C]">{task.priority}</td>
                            <td className="px-4 py-3 text-sm text-[#36506C]">{task.status}</td>
                            <td className="px-4 py-3 text-sm text-[#36506C]">
                              {formatDate(task.dueDate)}
                            </td>
                            <td className="px-4 py-3 text-sm text-[#36506C]">{task.department}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            className="px-4 py-8 text-center text-sm text-[#8A99B0]"
                            colSpan={6}
                          >
                            No tasks found for this report range.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-[#5B6E8C]">No preview available yet.</div>
        )}
      </div>

      <div className="rounded-[20px] border border-[#EFF2F6] bg-white p-6">
        <h2 className="mb-4 text-xl font-semibold text-[#1E293B]">Recent reports</h2>

        {reportHistoryQuery.isLoading ? (
          <div className="py-8 text-center">Loading...</div>
        ) : reportHistoryQuery.data && reportHistoryQuery.data.length > 0 ? (
          <div className="space-y-3">
            {(reportHistoryQuery.data as ReportHistoryItem[]).map((report) => (
              <div
                key={report.id}
                className="flex flex-col gap-4 rounded-lg border border-[#EFF2F6] p-4 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="flex-1">
                  <div className="font-medium text-[#1E293B]">{report.type} Report</div>
                  <div className="text-sm text-[#5B6E8C]">
                    {report.department?.name || 'All Departments'} | {formatDate(report.dateFrom)} -{' '}
                    {formatDate(report.dateTo)}
                  </div>
                  <div className="text-xs text-[#8A99B0]">
                    Generated: {formatDate(report.createdAt)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void downloadReport(report.id, 'pdf')}
                    disabled={!report.pdfPath}
                  >
                    PDF
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void downloadReport(report.id, 'excel')}
                    disabled={!report.excelPath}
                  >
                    Excel
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 text-center text-[#5B6E8C]">No reports generated yet.</div>
        )}
      </div>
    </div>
  );
}

export default MISReports;
