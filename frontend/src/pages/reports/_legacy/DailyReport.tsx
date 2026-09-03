import { useQuery } from '@tanstack/react-query';
import { getDailyReport } from '../../services/reportService';

function DailyReport() {
  const { data: reportData, isLoading, error } = useQuery({
    queryKey: ['dailyReport'],
    queryFn: () => getDailyReport({ dateFrom: '2024-01-01', dateTo: '2024-01-01' }) // Default dates, should be passed as params
  });

  if (isLoading) {
    return <div className="p-6">Loading report...</div>;
  }

  if (error) {
    return <div className="p-6 text-red-600">Error loading report</div>;
  }

  if (!reportData) {
    return <div className="p-6">No data available</div>;
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Daily Report</h1>

      {/* Summary Section */}
      <div className="bg-white rounded-lg border p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Summary</h2>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{reportData.summary.total}</div>
            <div className="text-sm text-gray-600">Total Tasks</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{reportData.summary.completed}</div>
            <div className="text-sm text-gray-600">Completed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-red-600">{reportData.summary.delayed}</div>
            <div className="text-sm text-gray-600">Delayed</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-yellow-600">{reportData.summary.pending}</div>
            <div className="text-sm text-gray-600">Pending</div>
          </div>
        </div>
      </div>

      {/* Tasks Table */}
      <div className="bg-white rounded-lg border p-6">
        <h2 className="text-lg font-semibold mb-4">Task Details</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-4">Task</th>
                <th className="text-left py-2 px-4">Assigned To</th>
                <th className="text-left py-2 px-4">Priority</th>
                <th className="text-left py-2 px-4">Status</th>
                <th className="text-left py-2 px-4">Due Date</th>
                <th className="text-left py-2 px-4">Department</th>
              </tr>
            </thead>
            <tbody>
              {reportData.tasks.map((task: any) => (
                <tr key={task.id} className="border-b">
                  <td className="py-2 px-4">{task.task}</td>
                  <td className="py-2 px-4">{task.assignedTo}</td>
                  <td className="py-2 px-4">{task.priority}</td>
                  <td className="py-2 px-4">{task.status}</td>
                  <td className="py-2 px-4">{new Date(task.dueDate).toLocaleDateString()}</td>
                  <td className="py-2 px-4">{task.department}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default DailyReport;