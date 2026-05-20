import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useStressStore } from '../store/stressStore';
import { Episode, EpisodeAnalysis } from '../types/stress';

const RISK_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#eab308',
  high: '#ef4444',
};

function EpisodeCard({ episode }: { episode: Episode }) {
  const analysis: EpisodeAnalysis | null = episode.analysis_json
    ? JSON.parse(episode.analysis_json)
    : null;

  const start = new Date(episode.start_time);
  const riskLevel = analysis?.risk_level ?? 'medium';
  const color = RISK_COLORS[riskLevel] ?? RISK_COLORS.medium;

  return (
    <div className="bg-[#111827] rounded-xl p-5 flex flex-col gap-3 border border-white/5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-white font-medium text-sm">
          {start.toLocaleDateString()} · {start.toLocaleTimeString()}
        </span>
        <span
          className="text-xs font-bold px-3 py-1 rounded-full capitalize"
          style={{ backgroundColor: color + '22', color }}
        >
          {riskLevel}
        </span>
      </div>

      <div className="flex gap-4 text-sm text-gray-400">
        <span>
          Peak <span className="text-red-400 font-semibold">{Math.round(episode.peak_stress)}%</span>
        </span>
        <span>·</span>
        <span>
          {Math.round(episode.duration_seconds)}s
        </span>
        <span>·</span>
        <span>
          Avg <span className="text-white">{Math.round(episode.avg_bpm)} BPM</span>
        </span>
      </div>

      {analysis && (
        <div className="flex flex-col gap-1 pt-1 border-t border-white/5">
          <p className="text-sm text-gray-300">
            <span className="text-purple-400 font-medium">Trigger: </span>
            {analysis.trigger}
          </p>
          <p className="text-sm text-gray-300">
            <span className="text-purple-400 font-medium">Recommendation: </span>
            {analysis.recommendation}
          </p>
        </div>
      )}
    </div>
  );
}

export function ParentDashboard() {
  const { history, episodes } = useStressStore();

  const chartData = history.map((r, i) => ({ i, stress: r.stress }));

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-[#111827] rounded-2xl p-6">
        <h3 className="text-white font-semibold mb-5 text-sm uppercase tracking-widest">
          Stress History — last 5 min
        </h3>
        <ResponsiveContainer width="100%" height={230}>
          <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id="stressGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ef4444" stopOpacity={0.75} />
                <stop offset="55%" stopColor="#eab308" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0.15} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="i" hide />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#111827',
                border: '1px solid #1f2937',
                borderRadius: 8,
                color: '#fff',
              }}
              formatter={(v) =>
                v == null ? ['', ''] : [`${Number(v).toFixed(0)}%`, 'Stress']
              }
              labelFormatter={() => ''}
            />
            <ReferenceLine
              y={70}
              stroke="#f97316"
              strokeDasharray="5 3"
              label={{ value: '70%', fill: '#f97316', fontSize: 10, position: 'insideTopLeft' }}
            />
            <ReferenceLine
              y={90}
              stroke="#ef4444"
              strokeDasharray="5 3"
              label={{ value: '90%', fill: '#ef4444', fontSize: 10, position: 'insideTopLeft' }}
            />
            <Area
              type="monotone"
              dataKey="stress"
              stroke="#7c3aed"
              strokeWidth={2}
              fill="url(#stressGrad)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="flex flex-col gap-3">
        <h3 className="text-white font-semibold text-sm uppercase tracking-widest">
          Past Episodes
        </h3>
        {episodes.length === 0 ? (
          <div className="bg-[#111827] rounded-2xl p-10 text-center">
            <p className="text-gray-500 text-sm">
              No episodes yet — hit <span className="text-purple-400">Rising Stress</span> in the
              Monitor tab to trigger one.
            </p>
          </div>
        ) : (
          episodes.map((ep) => <EpisodeCard key={ep.id} episode={ep} />)
        )}
      </div>
    </div>
  );
}
