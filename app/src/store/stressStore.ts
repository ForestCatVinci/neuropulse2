import { create } from 'zustand';
import { Episode, StressReading } from '../types/stress';

export type DataMode = 'simulator' | 'device';

interface StressState {
  current: StressReading | null;
  history: StressReading[];
  episodes: Episode[];
  connected: boolean;
  alertDismissed: boolean;
  dataMode: DataMode;
  deviceConnected: boolean;
  setReading: (reading: StressReading) => void;
  setEpisodes: (episodes: Episode[]) => void;
  setConnected: (connected: boolean) => void;
  dismissAlert: () => void;
  setDataMode: (mode: DataMode) => void;
  setDeviceConnected: (connected: boolean) => void;
}

export const useStressStore = create<StressState>((set) => ({
  current: null,
  history: [],
  episodes: [],
  connected: false,
  alertDismissed: false,
  dataMode: 'simulator',
  deviceConnected: false,

  setReading: (reading) =>
    set((state) => ({
      current: reading,
      history: [...state.history.slice(-299), reading],
      // reset dismissed state when stress returns to normal so next episode shows alert
      alertDismissed: reading.alert ? state.alertDismissed : false,
    })),

  setEpisodes: (episodes) => set({ episodes }),
  setConnected: (connected) => set({ connected }),
  dismissAlert: () => set({ alertDismissed: true }),
  setDataMode: (dataMode) => set({ dataMode }),
  setDeviceConnected: (deviceConnected) => set({ deviceConnected }),
}));
