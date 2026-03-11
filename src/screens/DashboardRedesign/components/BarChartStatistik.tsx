import { useState } from "react";

interface BarChartStatistikProps {
  data: { label: string; besok: number; kunder: number }[];
  titel: string;
  maxY?: number;
}

export const BarChartStatistik = ({ data, titel, maxY: maxYProp }: BarChartStatistikProps) => {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; value: string } | null>(null);
  const maxBesok = Math.max(...data.map(d => d.besok), 1);
  const maxKunder = Math.max(...data.map(d => d.kunder), 1);
  const baseMax = maxYProp ?? Math.max(maxBesok, maxKunder, 1);
  const axisTop = Math.max(Math.ceil(baseMax), 2);
  const tickStep = axisTop <= 5 ? 1 : axisTop <= 20 ? 2 : Math.ceil(axisTop / 5);
  const tickCount = Math.ceil(axisTop / tickStep);

  return (
    <div className="bg-white rounded-xl p-4 mobile:p-6 lg:p-8 flex flex-col items-center shadow-sm">
      <div className="text-base font-medium text-gray-800 mb-4 mobile:mb-6">{titel}</div>
      
      {/* Chart container with Y-axis and legend outside scroll area */}
      <div className="w-full h-48 mobile:h-56 lg:h-64 flex">
        {/* Y-axis labels - outside scroll area */}
        <div className="flex flex-col justify-between items-end pr-3 mobile:pr-4 lg:pr-6 py-2 w-12 mobile:w-16 lg:w-20 text-xs text-gray-400 select-none flex-shrink-0">
          {Array.from({ length: tickCount + 1 }).map((_, i) => {
            const value = axisTop - i * tickStep;
            const display = Math.round(value);
            return (
              <span key={i}>{display}</span>
            );
          })}
        </div>

        {/* Scrollable chart area */}
        <div className="flex-1 h-full overflow-x-auto overflow-y-hidden scrollbar-hide relative">
          <div className="flex items-end justify-start gap-4 mobile:gap-6 lg:gap-8 h-full min-w-max px-2">
            {data.map((item, idx) => (
              <div key={idx} className="flex flex-col items-center">
                {/* Bars container */}
                <div className="flex gap-2 mobile:gap-3 lg:gap-4 items-end h-36 mobile:h-44 lg:h-52">
                  {/* Besök bar */}
                  <div
                    className="bg-[var(--tenant-brand)] rounded-t-sm mobile:rounded-md lg:rounded-lg transition-all duration-700 cursor-pointer relative"
                    style={{
                      width: '16px',
                      height: `${Math.max((item.besok / axisTop) * 100, 15)}%`,
                      minHeight: '20px',
                    }}
                    onMouseEnter={e => {
                      const rect = (e.target as HTMLElement).getBoundingClientRect();
                      setTooltip({
                        x: rect.left + rect.width / 2,
                        y: rect.top,
                        value: `Besök: ${item.besok}`
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                  {/* Kunder bar */}
                  <div
                    className="bg-[#1769dc] rounded-t-sm mobile:rounded-md lg:rounded-lg transition-all duration-700 cursor-pointer relative"
                    style={{
                      width: '16px',
                      height: `${Math.max((item.kunder / axisTop) * 100, 15)}%`,
                      minHeight: '20px',
                    }}
                    onMouseEnter={e => {
                      const rect = (e.target as HTMLElement).getBoundingClientRect();
                      setTooltip({
                        x: rect.left + rect.width / 2,
                        y: rect.top,
                        value: `Kunder: ${item.kunder}`
                      });
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                </div>
                
                {/* Label under bars */}
                <div className="text-gray-500 font-normal text-xs mobile:text-sm text-center mt-3 mobile:mt-4 lg:mt-6 w-20 mobile:w-24 lg:w-28 leading-tight overflow-hidden">
                  <span className="block truncate" title={item.label}>
                    {item.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend - below chart, outside scroll area */}
      <div className="flex items-center justify-center gap-4 mobile:gap-6 mt-4 mobile:mt-6 text-xs mobile:text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-[var(--tenant-brand)] rounded"></div>
          <span className="text-gray-600">Besök</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 bg-[#1769dc] rounded"></div>
          <span className="text-gray-600">Kunder</span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 px-3 py-1.5 rounded-lg bg-white shadow text-sm text-[var(--tenant-brand)] font-medium border border-gray-200"
          style={{
            left: tooltip.x,
            top: tooltip.y - 36,
            transform: 'translate(-50%, -100%)',
            whiteSpace: 'nowrap',
          }}
        >
          {tooltip.value}
        </div>
      )}
    </div>
  );
}; 
