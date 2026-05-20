export const WS_URL: string =
  (import.meta.env.VITE_WS_URL as string | undefined) ?? 'wss://neuropulse-backend.fly.dev/ws';

export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://neuropulse-backend.fly.dev';
