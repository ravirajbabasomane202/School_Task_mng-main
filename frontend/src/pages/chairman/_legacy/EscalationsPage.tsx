import React, { useEffect, useState } from "react";
import { AlertTriangle, ArrowUpCircle, User, Calendar } from "lucide-react";
import api from "../../services/api";

interface EscalatedTask {
  _id: string;
  title: string;
  description: string;
  deadline: string;
  escalationLevel: 0 | 1 | 2;
  priority: "High" | "Medium" | "Low";
  assignedTo: { name: string; role: string; department?: string };
  updatedAt: string;
}

const levelLabel: Record<number, string> = {
  1: "Level 1 — Director Notified",
  2: "Level 2 — Chairman Notified (Critical)",
};

const levelColor: Record<number, string> = {
  1: "bg-yellow-50 border-yellow-300 text-yellow-800",
  2: "bg-red-50 border-red-300 text-red-800",
};

const EscalationsPage: React.FC = () => {
  const [tasks, setTasks] = useState<EscalatedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await api.get("/api/tasks/escalated");
        setTasks(res.data.tasks || []);
      } catch {
        setError("Failed to load escalated tasks.");
      } finally {
        setLoading(false);
      }
    };
    fetch();
  }, []);

  const priorityColor: Record<string, string> = {
    High: "bg-red-100 text-red-700",
    Medium: "bg-yellow-100 text-yellow-700",
    Low: "bg-green-100 text-green-700",
  };

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
        <AlertTriangle size={24} className="text-red-500" />
        Escalation Alerts
      </h2>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-500" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center text-gray-400">
          No escalated tasks. All tasks are on track.
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map((task) => (
            <div
              key={task._id}
              className={`rounded-xl border-2 p-5 ${levelColor[task.escalationLevel] ?? "bg-gray-50 border-gray-200"}`}
            >
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <ArrowUpCircle size={16} />
                    <h3 className="font-semibold">{task.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColor[task.priority]}`}>
                      {task.priority}
                    </span>
                  </div>
                  <p className="text-sm opacity-80 line-clamp-2">{task.description}</p>

                  <div className="flex gap-4 mt-3 text-xs opacity-70 flex-wrap">
                    <span className="flex items-center gap-1">
                      <User size={12} />
                      {task.assignedTo?.name} ({task.assignedTo?.role})
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar size={12} />
                      Deadline: {new Date(task.deadline).toLocaleDateString()}
                    </span>
                    <span>Last updated: {new Date(task.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>

                <span className="text-xs font-bold px-3 py-1 rounded-full border border-current bg-white bg-opacity-60 shrink-0">
                  {levelLabel[task.escalationLevel] ?? `Level ${task.escalationLevel}`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EscalationsPage;
