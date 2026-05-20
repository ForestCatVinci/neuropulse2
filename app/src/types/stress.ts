export interface StressReading {
  bpm: number;
  stress: number;
  rmssd: number;
  rr_intervals: number[];
  source: string;
  alert: boolean;
  timestamp: number;
}

export type WsMessage = Omit<StressReading, 'timestamp'>;

export interface EpisodeAnalysis {
  trigger: string;
  recommendation: string;
  risk_level: 'low' | 'medium' | 'high';
}

export interface Episode {
  id: number;
  start_time: string;
  end_time: string;
  peak_stress: number;
  avg_bpm: number;
  duration_seconds: number;
  analysis_json: string | null;
}

export interface Datapoint {
  id: number;
  episode_id: number;
  timestamp: string;
  bpm: number;
  stress: number;
  rmssd: number;
}

export interface AnalyticsSummary {
  total_episodes: number;
  episodes_this_week: number;
  episodes_this_month: number;
  avg_peak_stress: number;
  avg_duration_seconds: number;
  risk_distribution: { low: number; medium: number; high: number };
  trend: string;
  top_triggers: { trigger: string; count: number }[];
}

export interface HeatmapCell {
  day: number;
  hour: number;
  count: number;
}

export interface MedicalReport {
  period: string;
  generated_at: string;
  summary: string;
  findings: string[];
  recommendations: string[];
  risk_assessment: string;
}
