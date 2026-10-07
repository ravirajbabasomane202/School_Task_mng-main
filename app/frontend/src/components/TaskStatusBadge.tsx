import React from "react";

type TaskStatus = "Pending" | "In Progress" | "Completed" | "Delayed";

interface TaskStatusBadgeProps {
  status: TaskStatus | string;
}

const statusStyles: Record<string, string> = {
  Pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
  "In Progress": "bg-blue-100 text-blue-700 border-blue-200",
  Completed: "bg-green-100 text-green-700 border-green-200",
  Delayed: "bg-red-100 text-red-700 border-red-200",
};

const TaskStatusBadge: React.FC<TaskStatusBadgeProps> = ({ status }) => {
  const style = statusStyles[status] ?? "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${style}`}
    >
      {status}
    </span>
  );
};

export default TaskStatusBadge;