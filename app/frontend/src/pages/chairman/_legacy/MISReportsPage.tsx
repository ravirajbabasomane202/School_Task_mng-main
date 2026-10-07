import React, { useEffect, useState } from "react";
import { FileText, Download, RefreshCw } from "lucide-react";
import api from "../../services/api";

type ReportType = "daily" | "weekly" | "monthly";

interface ReportSummary {
  totalTasks: number;
  completed: number;
  pending: number;
  delayed: number;
  inProgress: number;
  generatedAt: string;
  period: string;
}

const MISReportsPage: React.FC = () => {
  const [reportType, setReportType] = useState<ReportType>("daily");
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType]);

  const fetchReport = async () => {
    try {
      setLoading(true);
      setError("");
      const res = await api.get(`/api/reports/mis?type=${reportType}`);
      setSummary(res.data.summary);
    } catch {
      setError("Failed to load report.");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format: "pdf" | "excel") => {
    try {
      setExporting(format);
      const res = await api.get(`/api/reports/mis/export?type=${reportType}&format=${format}`, {
        responseType: "blob",
      });
      const ext = format === "pdf" ? "pdf" : "xlsx";
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `MIS_Report_${reportType}_${new Date().toISOString().slice(0, 10)}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(`Failed to export ${format.toUpperCase()}.`);
    } finally {
      setExporting(null);
    }
  };

  const statCards = summary
    ? [
        { label: "Total Tasks", value: summary.totalTasks, color: "blue" },
        { label: "Completed", value: summary.completed, color: "green" },
        { label: "In Progress", value: summary.inProgress, color: "orange" },
        { label: "Pending", value: summary.pending, color: "yellow" },
        { label: "Delayed", value: summary.delayed, color: "red" },
      ]
    : [];

  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    green: "bg-green-50 text-green-700 border-green-200",
    orange: "bg-orange-50 text-orange-700 border-orange-200",
    yellow: "bg-yellow-50 text-yellow-700 border-yellow-200",
    red: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
        <FileText size={24} className="text-blue-600" />
        MIS Reports
      </h2>

      {/* Controls */}
      <div className="bg-white rounded-xl border shadow-sm p-4 flex flex-wrap items-center gap-4">
        <div className="flex gap-2">
          {(["daily", "weekly", "monthly"] as ReportType[]).map((t) => (
            <button
              key={t}
              onClick={() => setReportType(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize border transition-colors ${
                reportType === t
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-300 hover:border-blue-400"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        <div className="flex gap-2 ml-auto">
          <button
            onClick={fetchReport}
            disabled={loading}
            className="flex items-center gap-1 text-sm border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            onClick={() => handleExport("pdf")}
            disabled={exporting !== null || !summary}
            className="flex items-center gap-1 text-sm bg-red-600 text-white rounded-lg px-3 py-2 hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            <Download size={14} />
            {exporting === "pdf" ? "Exporting..." : "PDF"}
          </button>
          <button
            onClick={() => handleExport("excel")}
            disabled={exporting !== null || !summary}
            className="flex items-center gap-1 text-sm bg-green-600 text-white rounded-lg px-3 py-2 hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            <Download size={14} />
            {exporting === "excel" ? "Exporting..." : "Excel"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
        </div>
      ) : summary ? (
        <>
          <div className="text-xs text-gray-400">
            Period: <strong>{summary.period}</strong> &nbsp;|&nbsp; Generated at:{" "}
            {new Date(summary.generatedAt).toLocaleString()}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {statCards.map(({ label, value, color }) => (
              <div
                key={label}
                className={`flex flex-col items-center p-5 rounded-xl border-2 text-center ${colorMap[color]}`}
              >
                <span className="text-3xl font-bold">{value}</span>
                <span className="text-xs font-medium mt-1">{label}</span>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border shadow-sm p-5">
            <h3 className="font-semibold text-gray-800 mb-3">Summary</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-gray-500">Completion Rate</p>
                <p className="text-xl font-bold text-green-600">
                  {summary.totalTasks > 0
                    ? ((summary.completed / summary.totalTasks) * 100).toFixed(1)
                    : 0}
                  %
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-gray-500">Delay Rate</p>
                <p className="text-xl font-bold text-red-500">
                  {summary.totalTasks > 0
                    ? ((summary.delayed / summary.totalTasks) * 100).toFixed(1)
                    : 0}
                  %
                </p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="bg-white rounded-xl border p-10 text-center text-gray-400">
          No report data available.
        </div>
      )}
    </div>
  );
};

export default MISReportsPage;
