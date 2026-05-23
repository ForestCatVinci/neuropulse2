import { useEffect, useRef } from 'react';
import { API_URL, WS_URL } from '../config';
import { useStressStore } from '../store/stressStore';
import { WsMessage } from '../types/stress';

const DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];
const MAX_RETRIES = 10;
// If no device frame received in this window, mark device as disconnected
const DEVICE_TIMEOUT_MS = 5000;

export function useStressData(): void {
  const { setReading, setConnected, setEpisodes, setDeviceConnected } = useStressStore();
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const deviceCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // timestamp of last frame received from the physical device
  const lastDeviceFrameRef = useRef<number>(0);

  const fetchEpisodes = async () => {
    try {
      const res = await fetch(`${API_URL}/episodes`);
      const data = await res.json();
      setEpisodes(data);
    } catch {
      // server not ready yet — silent
    }
  };

  const connect = () => {
    if (retryRef.current >= MAX_RETRIES) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      retryRef.current = 0;
      void fetchEpisodes();
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data as string) as WsMessage;

        // Track device frame arrival regardless of current mode
        if (data.source === 'device') {
          lastDeviceFrameRef.current = Date.now();
        }

        // Read current dataMode directly from store (no subscription needed)
        const { dataMode } = useStressStore.getState();

        // In device mode: drop simulator/demo frames
        if (dataMode === 'device' && data.source !== 'device') return;

        setReading({ ...data, timestamp: Date.now() });
      } catch {
        // malformed frame
      }
    };

    ws.onclose = () => {
      setConnected(false);
      const delay = DELAYS[Math.min(retryRef.current, DELAYS.length - 1)];
      retryRef.current++;
      timerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => ws.close();
  };

  useEffect(() => {
    connect();

    // Poll episodes every 10 s so dashboard refreshes after an episode is logged
    pollRef.current = setInterval(() => { void fetchEpisodes(); }, 10000);

    // Check every 2 s whether a device frame arrived recently
    deviceCheckRef.current = setInterval(() => {
      const active = Date.now() - lastDeviceFrameRef.current < DEVICE_TIMEOUT_MS;
      setDeviceConnected(active);
    }, 2000);

    return () => {
      wsRef.current?.close();
      if (timerRef.current) clearTimeout(timerRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      if (deviceCheckRef.current) clearInterval(deviceCheckRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
