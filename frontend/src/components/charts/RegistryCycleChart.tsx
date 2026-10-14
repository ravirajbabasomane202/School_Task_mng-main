import React from 'react';
import { useIsMd } from '../../hooks/useMediaQuery';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface RegistryCycleDatum {
  cycle: string;
  completionRate: number;
  registerCount: number;
}

interface RegistryCycleChartProps {
  data: RegistryCycleDatum[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const point: RegistryCycleDatum = payload[0].payload;
    return (
      <div className="rounded-lg border border-[#E4EAF2] bg-white p-2 text-xs shadow">
        <p className="font-semibold text-[#1E293B]">{label}</p>
        <p className="text-[#5B6E8C]">{point.completionRate}% completion</p>
        <p className="text-[#8A99B0]">{point.registerCount} register{point.registerCount === 1 ? '' : 's'}</p>
      </div>
    );
  }
  return null;
};

/** Completion rate of registries grouped by their assigned Checking Cycle
 * (Daily / Weekly / Monthly / ...) — lets the Chairman see, e.g., whether
 * daily-cycle registries are being kept up to date as reliably as
 * weekly/monthly ones. */
const RegistryCycleChart: React.FC<RegistryCycleChartProps> = ({ data }) => {
  const isMd = useIsMd();
  const fontSize = isMd ? 12 : 10;
  return (
  <ResponsiveContainer width="100%" height={isMd ? 300 : 220}>
    <BarChart data={data} margin={{ top: 10, right: isMd ? 20 : 8, left: 0, bottom: 5 }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EFF2F6" />
      <XAxis dataKey="cycle" tick={{ fontSize, fill: '#5B6E8C' }} interval="preserveStartEnd" />
      <YAxis domain={[0, 100]} tick={{ fontSize, fill: '#5B6E8C' }} width={isMd ? 40 : 34} unit="%" />
      <Tooltip content={<CustomTooltip />} />
      <Bar dataKey="completionRate" radius={[6, 6, 0, 0]} fill="#185FA5" />
    </BarChart>
  </ResponsiveContainer>
  );
};

export default RegistryCycleChart;
