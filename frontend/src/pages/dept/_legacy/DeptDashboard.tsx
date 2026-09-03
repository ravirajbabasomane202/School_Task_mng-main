import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import DeptOverview from "../../components/DeptOverview";
import TaskStatusBadge from "../../components/TaskStatusBadge";
import { getMyTasks } from "../../services/taskService";

interface Task {
  id: number;
  title: string;
  status: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  due_date: string;
}

interface DeptDashboardProps {
  deptLabel: string;
  /** e.g. "/hr", "/finance" — used for DeptOverview click-through */
  basePath: string;
}

const DeptDashboard: React.FC<DeptDashboardProps> = ({ deptLabel, basePath }) => {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyTasks()
      .then((data) => setTasks(data || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const recentTasks = tasks
    .filter((t) => t.status !== "COMPLETED")
    .slice(0, 5);

  const priorityColor: Record<string, string> = {
    HIGH: "bg-red-100 text-red-700",
    MEDIUM: "bg-yellow-100 text-yellow-700",
    LOW: "bg-green-100 text-green-700",
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">{deptLabel} Dashboard</h2>

      {/* Stat cards — clickable */}
      <DeptOverview tasks={tasks} loading={loading} basePath={basePath} />

      {/* Real-time assigned tasks */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h3 className="font-semibold text-gray-800">Assigned Tasks (Active)</h3>
          <button
            onClick={() => navigate(`${basePath}/tasks`)}
            className="text-sm text-blue-600 hover:underline"
          >
            View all
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-36">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : recentTasks.length === 0 ? (
          <p className="text-center text-gray-400 text-sm py-10">No active tasks assigned.</p>
        ) : (
          <ul className="divide-y">
            {recentTasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => navigate(`${basePath}/tasks?status=${task.status}`)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${priorityColor[task.priority]}`}
                  >
                    {task.priority}
                  </span>
                  <span className="text-sm font-medium text-gray-800 truncate">{task.title}</span>
                </div>
                <div className="flex items-center gap-4 shrink-0 ml-3">
                  <span className="text-xs text-gray-400 hidden sm:block">
                    Due {new Date(task.due_date).toLocaleDateString()}
                  </span>
                  <TaskStatusBadge status={task.status as any} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default DeptDashboard;
