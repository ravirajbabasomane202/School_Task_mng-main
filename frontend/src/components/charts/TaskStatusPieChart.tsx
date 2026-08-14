import React from 'react';
import { Cell, Legend, Pie, PieChart } from 'recharts';

interface TaskStatusData {
  name: string;
  value: number;
  color: string;
}

interface TaskStatusPieChartProps {
  data: TaskStatusData[];
}

interface LegendEntry {
  color?: string;
  value?: string | number;
}

const EMPTY_STATE_DATA: TaskStatusData[] = [
  {
    name: 'No Tasks',
    value: 1,
    color: '#E2E8F0'
  }
];

const renderLegend = (props?: { payload?: LegendEntry[] }) => {
  const payload = props?.payload ?? [];

  if (payload.length === 0) {
    return null;
  }

  return (
    <ul className="mt-4 flex flex-wrap justify-center gap-4">
      {payload.map((entry, index) => (
        <li key={`item-${index}`} className="flex items-center space-x-2">
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color ?? '#CBD5E1' }}
          />
          <span className="text-sm text-gray-700">{String(entry.value ?? '')}</span>
        </li>
      ))}
    </ul>
  );
};

const TaskStatusPieChart: React.FC<TaskStatusPieChartProps> = ({ data }) => {
  const totalTasks = data.reduce((sum, item) => sum + item.value, 0);
  const chartData = totalTasks > 0 ? data : EMPTY_STATE_DATA;

  return (
    <div className="flex flex-col items-center">
      <PieChart width={300} height={300}>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={5}
          dataKey="value"
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-lg font-semibold text-gray-800"
        >
          {totalTasks}
        </text>
        <text
          x="50%"
          y="60%"
          textAnchor="middle"
          dominantBaseline="middle"
          className="text-sm text-gray-600"
        >
          Total Tasks
        </text>
      </PieChart>
      <Legend content={renderLegend} />
      {totalTasks === 0 ? (
        <p className="mt-2 text-sm text-gray-500">No task data available yet.</p>
      ) : null}
    </div>
  );
};

export default TaskStatusPieChart;
