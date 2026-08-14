import React from 'react';

interface Department {
  name: string;
  completionPct: number;
  healthColor: string;
}

interface DepartmentHealthBarProps {
  departments: Department[];
}

const DepartmentHealthBar: React.FC<DepartmentHealthBarProps> = ({ departments }) => {
  return (
    <div className="space-y-4">
      {departments.map((dept, index) => (
        <div key={index} className="flex items-center space-x-3">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: dept.healthColor }}
          ></div>
          <span className="text-xs font-medium text-gray-700 flex-1">{dept.name}</span>
          <div className="flex items-center space-x-2">
            <div className="w-20 h-1 bg-gray-100 rounded" style={{ backgroundColor: '#F8F9FC' }}>
              <div
                className="h-full rounded"
                style={{
                  width: `${dept.completionPct}%`,
                  backgroundColor: dept.healthColor,
                }}
              ></div>
            </div>
            <span className="text-xs text-gray-600">{dept.completionPct}%</span>
          </div>
        </div>
      ))}
    </div>
  );
};

export default DepartmentHealthBar;
