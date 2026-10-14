import React from 'react';
import { useIsMd } from '../../hooks/useMediaQuery';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface PerformanceData {
  month: string;
  completionRate: number;
}

interface PerformanceChartProps {
  data: PerformanceData[];
}

const PerformanceChart: React.FC<PerformanceChartProps> = ({ data }) => {
  const isMd = useIsMd();
  const tickStyle = { fontSize: isMd ? 12 : 10 };
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white border border-gray-300 rounded p-2 shadow">
          <p className="text-sm">{`${label}: ${payload[0].value}%`}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={isMd ? 300 : 220}>
      <BarChart
        layout="horizontal"
        data={data}
        margin={{
          top: 20,
          right: isMd ? 30 : 12,
          left: isMd ? 20 : 0,
          bottom: 5,
        }}
      >
        <XAxis type="number" domain={[0, 100]} tick={tickStyle} interval="preserveStartEnd" />
        <YAxis dataKey="month" type="category" tick={tickStyle} />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="completionRate" fill="#185FA5" />
      </BarChart>
    </ResponsiveContainer>
  );
};

export default PerformanceChart;