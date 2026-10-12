import React from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

interface TaskStatusData {
  name: string;
  value: number;
  color: string;
}

interface TaskStatusPieChartProps {
  data: TaskStatusData[];
  /** Caption under the centre number (default "Total Tasks"). */
  totalLabel?: string;
  /** Shown when every value is 0 (default "No task data available yet."). */
  emptyMessage?: string;
}

const EMPTY_STATE_DATA: TaskStatusData[] = [
  {
    name: 'No Tasks',
    value: 1,
    color: '#E2E8F0'
  }
];

/** Splits a caption into at most two lines so it fits inside the donut hole. */
const splitCaption = (text: string): string[] => {
  const words = text.split(' ');
  if (words.length < 3) return [text];
  const mid = Math.ceil(words.length / 2);
  return [words.slice(0, mid).join(' '), words.slice(mid).join(' ')];
};

const SliceTooltip = ({
  active,
  payload,
  total
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number; payload?: { color?: string } }>;
  total: number;
}) => {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0];
  if (item.name === 'No Tasks') return null;
  const value = Number(item.value ?? 0);
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow">
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: item.payload?.color ?? '#CBD5E1' }}
        />
        <span className="font-medium text-gray-800">{item.name}</span>
      </div>
      <p className="mt-0.5 text-gray-600">
        {value} ({pct}%)
      </p>
    </div>
  );
};

const TaskStatusPieChart: React.FC<TaskStatusPieChartProps> = ({
  data,
  totalLabel = 'Total Tasks',
  emptyMessage = 'No task data available yet.'
}) => {
  // Dashboard responses can temporarily omit chart data during an API rollout
  // or after a cached response. A chart should render its empty state, not
  // take down the entire dashboard in that case.
  // Non-numeric values (undefined/NaN) count as 0 so the chart never shows "NaN".
  const safeData = (Array.isArray(data) ? data : []).map((item) => ({
    ...item,
    value: Number.isFinite(Number(item.value)) ? Number(item.value) : 0
  }));
  const totalTasks = safeData.reduce((sum, item) => sum + item.value, 0);
  const chartData = totalTasks > 0 ? safeData : EMPTY_STATE_DATA;

  const captionLines = splitCaption(totalLabel);

  return (
    <div className="flex flex-col items-center">
      <div className="h-[380px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={95}
              outerRadius={150}
              paddingAngle={totalTasks > 0 ? 3 : 0}
              dataKey="value"
              nameKey="name"
              stroke="none"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<SliceTooltip total={totalTasks} />} />
            {/* Centre text sits inside the donut hole (radius 95) so it never overlaps a slice. */}
            <text
              x="50%"
              y="46%"
              textAnchor="middle"
              dominantBaseline="middle"
              fill="#1E293B"
              fontSize={28}
              fontWeight={600}
              pointerEvents="none"
            >
              {totalTasks}
            </text>
            {captionLines.map((line, i) => (
              <text
                key={line}
                x="50%"
                y={`${55 + i * 5}%`}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#475569"
                fontSize={13}
                pointerEvents="none"
              >
                {line}
              </text>
            ))}
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap justify-center gap-4">
        {(totalTasks > 0 ? chartData : []).map((entry) => (
          <li key={entry.name} className="flex items-center space-x-2">
            <div className="h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-sm text-gray-700">{entry.name}</span>
          </li>
        ))}
      </ul>
      {totalTasks === 0 ? (
        <p className="mt-2 text-sm text-gray-500">{emptyMessage}</p>
      ) : null}
    </div>
  );
};

export default TaskStatusPieChart;
