export const WS_URL: string =
  (import.meta.env.VITE_WS_URL as string | undefined) ?? 'ws://localhost:8000/ws';

export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8000';
