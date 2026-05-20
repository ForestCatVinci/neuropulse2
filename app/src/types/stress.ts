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
