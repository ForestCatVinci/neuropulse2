interface Props {
  stress: number;
  bpm: number;
  rmssd: number;
}

function stressColor(stress: number): string {
  if (stress >= 90) return '#ef4444';
  if (stress >= 70) return '#f97316';
  if (stress >= 40) return '#eab308';
  return '#22c55e';
}

export function StressMeter({ stress, bpm, rmssd }: Props) {
  const radius = 80;
  const strokeWidth = 12;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (stress / 100) * circumference;
  const color = stressColor(stress);

  return (
    <div className="flex flex-col items-center gap-6">
      <div className="relative w-[200px] h-[200px]">
        <svg
          width={200}
          height={200}
          className="-rotate-90"
          aria-label={`Stress level ${Math.round(stress)}%`}
        >
          <circle
            cx={100}
            cy={100}
            r={radius}
            fill="none"
            stroke="#1f2937"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={100}
            cy={100}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s ease, stroke 0.6s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="text-5xl font-bold tabular-nums"
            style={{ color, transition: 'color 0.6s ease' }}
          >
            {Math.round(stress)}%
          </span>
          <span className="text-xs text-gray-500 mt-1 uppercase tracking-widest">Stress</span>
        </div>
      </div>

      <div className="flex gap-4 w-full justify-center">
        <div className="bg-[#111827] rounded-xl px-8 py-4 text-center flex-1 max-w-[140px]">
          <div className="text-3xl font-bold text-white tabular-nums">{Math.round(bpm)}</div>
          <div className="text-xs text-gray-500 mt-1 uppercase tracking-widest">BPM</div>
        </div>
        <div className="bg-[#111827] rounded-xl px-8 py-4 text-center flex-1 max-w-[140px]">
          <div className="text-3xl font-bold text-white tabular-nums">{Math.round(rmssd)}</div>
          <div className="text-xs text-gray-500 mt-1 uppercase tracking-widest">RMSSD ms</div>
        </div>
      </div>
    </div>
  );
}
