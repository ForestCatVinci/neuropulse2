import { useState, useEffect } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { API_URL } from '../config';
import { useStressStore } from '../store/stressStore';
import {
  AnalyticsSummary,
  Datapoint,
  EpisodeAnalysis,
  HeatmapCell,
  MedicalReport,
} from '../types/stress';

type DoctorTab = 'overview' | 'patterns' | 'episodes' | 'report';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const RISK_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#eab308',
  high: '#ef4444',
};
const TREND_ICON: Record<string, string> = {
  improving: '↓',
  worsening: '↑',
  stable: '→',
};
const TREND_COLOR: Record<string, string> = {
  improving: '#22c55e',
  worsening: '#ef4444',
  stable: '#6b7280',
};

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-[#0d1117] rounded-xl p-5 flex flex-col gap-1 border border-white/5">
      <span className="text-gray-500 text-xs uppercase tracking-widest">{label}</span>
      <span className="text-white text-3xl font-bold">{value}</span>
      {sub && <span className="text-gray-500 text-xs">{sub}</span>}
    </div>
  );
}

function Heatmap({ cells }: { cells: HeatmapCell[] }) {
  const maxCount = Math.max(1, ...cells.map((c) => c.count));
  const lookup = new Map(cells.map((c) => [`${c.day}-${c.hour}`, c.count]));

  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1 mb-1 ml-10">
        {Array.from({ length: 24 }, (_, h) => (
          <div key={h} className="w-5 text-center text-gray-600 text-[9px]">
            {h % 6 === 0 ? `${h}h` : ''}
          </div>
        ))}
      </div>
      {DAYS.map((day, d) => (
        <div key={d} className="flex items-center gap-1 mb-1">
          <span className="w-9 text-gray-500 text-xs text-right mr-1">{day}</span>
          {Array.from({ length: 24 }, (_, h) => {
            const count = lookup.get(`${d}-${h}`) ?? 0;
            const intensity = count === 0 ? 0 : Math.max(0.2, count / maxCount);
            return (
              <div
                key={h}
                title={
                  count > 0
                    ? `${day} ${h}:00 — ${count} episode${count > 1 ? 's' : ''}`
                    : undefined
                }
                className="w-5 h-5 rounded-sm cursor-default"
                style={{
                  backgroundColor:
                    count === 0 ? '#1f2937' : `rgba(124, 58, 237, ${intensity})`,
                }}
              />
            );
          })}
        </div>
      ))}
      <div className="flex items-center gap-2 mt-3 ml-10">
        <span className="text-gray-600 text-xs">0</span>
        {[0.2, 0.4, 0.6, 0.8, 1].map((v) => (
          <div
            key={v}
            className="w-4 h-4 rounded-sm"
            style={{ backgroundColor: `rgba(124, 58, 237, ${v})` }}
          />
        ))}
        <span className="text-gray-600 text-xs">more</span>
      </div>
    </div>
  );
}

function EpisodeTimeline({ episodeId }: { episodeId: number }) {
  const [pts, setPts] = useState<Datapoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/episodes/${episodeId}/datapoints`)
      .then((r) => r.json())
      .then(setPts)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [episodeId]);

  if (loading) return <p className="text-gray-500 text-xs py-2">Loading timeline…</p>;
  if (!pts.length)
    return <p className="text-gray-500 text-xs py-2">No datapoints recorded for this episode.</p>;

  const data = pts.map((p, i) => ({ i, stress: Math.round(p.stress), bpm: Math.round(p.bpm) }));

  return (
    <div className="mt-3">
      <p className="text-gray-500 text-xs mb-2">Stress during episode ({pts.length} ticks)</p>
      <ResponsiveContainer width="100%" height={100}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -30 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <YAxis domain={[0, 100]} tick={{ fill: '#6b7280', fontSize: 9 }} />
          <Tooltip
            contentStyle={{
              backgroundColor: '#111827',
              border: '1px solid #1f2937',
              borderRadius: 6,
              color: '#fff',
              fontSize: 11,
            }}
            formatter={(v) => (v == null ? ['', ''] : [`${Number(v).toFixed(0)}%`, 'Stress'])}
            labelFormatter={() => ''}
          />
          <Line
            type="monotone"
            dataKey="stress"
            stroke="#ef4444"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DoctorDashboard() {
  const [tab, setTab] = useState<DoctorTab>('overview');
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [heatmap, setHeatmap] = useState<HeatmapCell[]>([]);
  const [expandedEp, setExpandedEp] = useState<number | null>(null);
  const [report, setReport] = useState<MedicalReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [loading, setLoading] = useState(true);

  const episodes = useStressStore((s) => s.episodes);

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/analytics/summary`).then((r) => r.json()),
      fetch(`${API_URL}/analytics/heatmap`).then((r) => r.json()),
    ])
      .then(([s, h]) => {
        setSummary(s as AnalyticsSummary);
        setHeatmap(h as HeatmapCell[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const generateReport = async (period: 'weekly' | 'monthly') => {
    setReportLoading(true);
    setReport(null);
    try {
      const r = await fetch(`${API_URL}/report/${period}`);
      setReport((await r.json()) as MedicalReport);
    } catch {
      // silent
    } finally {
      setReportLoading(false);
    }
  };

  const episodesByDay = DAYS.map((day, d) => ({
    day,
    count: heatmap.filter((c) => c.day === d).reduce((sum, c) => sum + c.count, 0),
  }));

  const tabs: { key: DoctorTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'patterns', label: 'Patterns' },
    { key: 'episodes', label: 'Episodes' },
    { key: 'report', label: 'Report' },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Tab bar */}
      <div className="flex gap-1 bg-[#111827] rounded-xl p-1">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              tab === key ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-gray-500 text-sm text-center py-8">Loading analytics…</p>
      )}

      {!loading && tab === 'overview' && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Total Episodes" value={summary?.total_episodes ?? 0} />
            <StatCard label="This Week" value={summary?.episodes_this_week ?? 0} />
            <StatCard
              label="Avg Peak Stress"
              value={summary ? `${summary.avg_peak_stress}%` : '—'}
            />
            <StatCard
              label="Avg Duration"
              value={
                summary
                  ? `${Math.round(summary.avg_duration_seconds)}s`
                  : '—'
              }
            />
          </div>

          {summary && (
            <div className="flex items-center gap-2 bg-[#111827] rounded-xl px-5 py-3 border border-white/5">
              <span className="text-gray-400 text-sm">Trend vs last week:</span>
              <span
                className="font-bold text-lg"
                style={{ color: TREND_COLOR[summary.trend] ?? '#6b7280' }}
              >
                {TREND_ICON[summary.trend] ?? '→'} {summary.trend}
              </span>
            </div>
          )}

          <div className="bg-[#111827] rounded-2xl p-5 border border-white/5">
            <h3 className="text-white font-semibold text-sm uppercase tracking-widest mb-4">
              Episodes by Day of Week
            </h3>
            {episodesByDay.every((d) => d.count === 0) ? (
              <p className="text-gray-500 text-sm text-center py-6">No episodes recorded yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={episodesByDay} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 11 }} />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    domain={[0, Math.max(1, ...episodesByDay.map((d) => d.count)) + 1]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#111827',
                      border: '1px solid #1f2937',
                      borderRadius: 8,
                      color: '#fff',
                    }}
                    formatter={(v) =>
                      v == null ? ['', ''] : [`${Number(v).toFixed(0)}`, 'Episodes']
                    }
                  />
                  <Bar dataKey="count" fill="#7c3aed" radius={4} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {summary && (
            <div className="bg-[#111827] rounded-xl p-5 border border-white/5">
              <h3 className="text-white font-semibold text-sm uppercase tracking-widest mb-3">
                Risk Distribution
              </h3>
              <div className="flex gap-4">
                {(['low', 'medium', 'high'] as const).map((r) => (
                  <div key={r} className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: RISK_COLORS[r] }}
                    />
                    <span className="text-gray-400 text-sm capitalize">{r}</span>
                    <span className="text-white font-semibold text-sm">
                      {summary.risk_distribution[r]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && tab === 'patterns' && (
        <div className="flex flex-col gap-5">
          <div className="bg-[#111827] rounded-2xl p-5 border border-white/5">
            <h3 className="text-white font-semibold text-sm uppercase tracking-widest mb-4">
              Episode Heatmap
            </h3>
            {heatmap.length === 0 ? (
              <p className="text-gray-500 text-sm">No episode data yet.</p>
            ) : (
              <Heatmap cells={heatmap} />
            )}
          </div>

          {summary && summary.top_triggers.length > 0 && (
            <div className="bg-[#111827] rounded-2xl p-5 border border-white/5">
              <h3 className="text-white font-semibold text-sm uppercase tracking-widest mb-4">
                Common Triggers
              </h3>
              <div className="flex flex-col gap-2">
                {summary.top_triggers.map(({ trigger, count }, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <span className="text-gray-300 text-sm">{trigger}</span>
                    <span className="text-purple-400 font-semibold text-sm">
                      ×{count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {summary && summary.top_triggers.length === 0 && (
            <div className="bg-[#111827] rounded-2xl p-5 border border-white/5">
              <p className="text-gray-500 text-sm">
                No trigger data yet — triggers appear after AI analysis of completed episodes.
              </p>
            </div>
          )}
        </div>
      )}

      {!loading && tab === 'episodes' && (
        <div className="flex flex-col gap-3">
          {episodes.length === 0 ? (
            <div className="bg-[#111827] rounded-2xl p-10 text-center border border-white/5">
              <p className="text-gray-500 text-sm">
                No episodes yet — trigger one in the Monitor tab.
              </p>
            </div>
          ) : (
            episodes.map((ep) => {
              let analysis: EpisodeAnalysis | null = null;
              try {
                analysis = ep.analysis_json ? (JSON.parse(ep.analysis_json) as EpisodeAnalysis) : null;
              } catch {
                analysis = null;
              }
              const riskLevel = analysis?.risk_level ?? 'medium';
              const color = RISK_COLORS[riskLevel] ?? RISK_COLORS.medium;
              const start = new Date(ep.start_time);
              const isExpanded = expandedEp === ep.id;

              return (
                <div
                  key={ep.id}
                  className="bg-[#111827] rounded-xl p-5 flex flex-col gap-3 border border-white/5"
                >
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
                      Peak{' '}
                      <span className="text-red-400 font-semibold">
                        {Math.round(ep.peak_stress)}%
                      </span>
                    </span>
                    <span>·</span>
                    <span>{Math.round(ep.duration_seconds)}s</span>
                    <span>·</span>
                    <span>
                      Avg <span className="text-white">{Math.round(ep.avg_bpm)} BPM</span>
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

                  <button
                    onClick={() => setExpandedEp(isExpanded ? null : ep.id)}
                    className="text-xs text-purple-400 hover:text-purple-300 text-left transition-colors"
                  >
                    {isExpanded ? '▲ Hide timeline' : '▼ Show stress timeline'}
                  </button>

                  {isExpanded && <EpisodeTimeline episodeId={ep.id} />}
                </div>
              );
            })
          )}
        </div>
      )}

      {!loading && tab === 'report' && (
        <div className="flex flex-col gap-5">
          <div className="bg-[#111827] rounded-2xl p-5 border border-white/5">
            <h3 className="text-white font-semibold text-sm uppercase tracking-widest mb-4">
              Generate Medical Report
            </h3>
            <div className="flex gap-3">
              <button
                onClick={() => generateReport('weekly')}
                disabled={reportLoading}
                className="flex-1 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                Weekly Report
              </button>
              <button
                onClick={() => generateReport('monthly')}
                disabled={reportLoading}
                className="flex-1 py-2.5 rounded-lg bg-[#1f2937] hover:bg-[#374151] disabled:opacity-50 text-white text-sm font-medium transition-colors"
              >
                Monthly Report
              </button>
            </div>
            {reportLoading && (
              <p className="text-gray-500 text-sm text-center mt-4">
                Generating report with AI — this may take a few seconds…
              </p>
            )}
          </div>

          {report && (
            <div className="bg-[#111827] rounded-2xl p-5 border border-white/5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-white font-semibold capitalize">
                  {report.period} Report
                </h3>
                <div className="flex items-center gap-3">
                  <span className="text-gray-500 text-xs">
                    {new Date(report.generated_at).toLocaleString()}
                  </span>
                  <button
                    onClick={() => {
                      const text = [
                        `NEUROPULSE ${report.period.toUpperCase()} REPORT`,
                        `Generated: ${new Date(report.generated_at).toLocaleString()}`,
                        '',
                        'SUMMARY',
                        report.summary,
                        '',
                        'FINDINGS',
                        ...report.findings.map((f) => `• ${f}`),
                        '',
                        'RECOMMENDATIONS',
                        ...report.recommendations.map((r) => `• ${r}`),
                        '',
                        'RISK ASSESSMENT',
                        report.risk_assessment,
                      ].join('\n');
                      void navigator.clipboard.writeText(text);
                    }}
                    className="text-xs px-3 py-1.5 rounded-lg border border-white/10 text-gray-400 hover:text-white transition-colors"
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div>
                <p className="text-gray-500 text-xs uppercase tracking-widest mb-1">Summary</p>
                <p className="text-gray-200 text-sm leading-relaxed">{report.summary}</p>
              </div>

              {report.findings.length > 0 && (
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-widest mb-2">Findings</p>
                  <ul className="flex flex-col gap-1.5">
                    {report.findings.map((f, i) => (
                      <li key={i} className="flex gap-2 text-sm text-gray-300">
                        <span className="text-purple-400 mt-0.5">•</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {report.recommendations.length > 0 && (
                <div>
                  <p className="text-gray-500 text-xs uppercase tracking-widest mb-2">
                    Recommendations
                  </p>
                  <ul className="flex flex-col gap-1.5">
                    {report.recommendations.map((r, i) => (
                      <li key={i} className="flex gap-2 text-sm text-gray-300">
                        <span className="text-green-400 mt-0.5">•</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border-t border-white/5 pt-3">
                <p className="text-gray-500 text-xs uppercase tracking-widest mb-1">
                  Risk Assessment
                </p>
                <p className="text-gray-200 text-sm">{report.risk_assessment}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
