import React from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Clock, AlertCircle, ListTodo } from "lucide-react";

interface Task {
  id: number;
  title: string;
  status: string;
  priority: string;
  due_date: string;
}

interface DeptOverviewProps {
  tasks: Task[];
  loading: boolean;
  basePath: string;
}

const DeptOverview: React.FC<DeptOverviewProps> = ({ tasks, loading, basePath }) => {
  const navigate = useNavigate();

  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === "COMPLETED").length;
  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const pending = tasks.filter((t) => t.status === "PENDING").length;
  const delayed = tasks.filter((t) => t.status === "DELAYED").length;

  const cards = [
    {
      label: "Total Tasks",
      value: total,
      icon: <ListTodo size={20} className="text-blue-600" />,
      bg: "bg-blue-50",
      border: "border-blue-100",
      filter: "",
    },
    {
      label: "Completed",
      value: completed,
      icon: <CheckCircle size={20} className="text-green-600" />,
      bg: "bg-green-50",
      border: "border-green-100",
      filter: "COMPLETED",
    },
    {
      label: "In Progress",
      value: inProgress,
      icon: <Clock size={20} className="text-blue-500" />,
      bg: "bg-blue-50",
      border: "border-blue-100",
      filter: "IN_PROGRESS",
    },
    {
      label: "Pending",
      value: pending,
      icon: <Clock size={20} className="text-yellow-500" />,
      bg: "bg-yellow-50",
      border: "border-yellow-100",
      filter: "PENDING",
    },
    {
      label: "Delayed",
      value: delayed,
      icon: <AlertCircle size={20} className="text-red-500" />,
      bg: "bg-red-50",
      border: "border-red-100",
      filter: "DELAYED",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
      {cards.map((card) => (
        <button
          key={card.label}
          onClick={() =>
            navigate(
              card.filter
                ? `${basePath}/tasks?status=${card.filter}`
                : `${basePath}/tasks`
            )
          }
          className={`flex flex-col items-start p-4 rounded-xl border ${card.bg} ${card.border} shadow-sm hover:shadow-md transition-shadow text-left w-full`}
        >
          <div className="mb-2">{card.icon}</div>
          {loading ? (
            <div className="h-7 w-10 bg-gray-200 animate-pulse rounded mb-1" />
          ) : (
            <span className="text-2xl font-bold text-gray-800">{card.value}</span>
          )}
          <span className="text-xs text-gray-500 mt-0.5">{card.label}</span>
        </button>
      ))}
    </div>
  );
};

export default DeptOverview;