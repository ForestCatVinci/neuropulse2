import { useState } from 'react';
import { API_URL } from '../config';

type DataMode = 'empty' | 'filled' | null;
type LoadingAction = 'seed' | 'clear' | null;

export function DemoControls() {
  const [stress, setStress] = useState(0);
  const [rising, setRising] = useState(false);
  const [dataMode, setDataMode] = useState<DataMode>(null);
  const [loadingAction, setLoadingAction] = useState<LoadingAction>(null);
  const [seedResult, setSeedResult] = useState<string | null>(null);

  const postStress = async (level: number) => {
    try {
      await fetch(`${API_URL}/demo/stress/${(level / 100).toFixed(2)}`, { method: 'POST' });
    } catch { /* server not up yet */ }
  };

  const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setStress(val);
    void postStress(val);
  };

  const handleRising = async () => {
    setRising(true);
    try {
      await fetch(`${API_URL}/demo/scenario/rising`, { method: 'POST' });
    } catch { /* ignore */ }
    setTimeout(() => setRising(false), 31000);
  };

  const handleReset = async () => {
    setStress(0);
    setRising(false);
    try {
      await fetch(`${API_URL}/demo/scenario/reset`, { method: 'POST' });
    } catch { /* ignore */ }
  };

  const handleSeed = async () => {
    setLoadingAction('seed');
    setSeedResult(null);
    try {
      const res = await fetch(`${API_URL}/demo/seed`, { method: 'POST' });
      const data = await res.json() as { ok: boolean; episodes_created: number };
      setDataMode('filled');
      setSeedResult(`${data.episodes_created} episodes loaded`);
      setTimeout(() => window.location.reload(), 1200);
    } catch {
      setLoadingAction(null);
    }
  };

  const handleClear = async () => {
    setLoadingAction('clear');
    setSeedResult(null);
    try {
      await fetch(`${API_URL}/demo/clear`, { method: 'POST' });
      setDataMode('empty');
      setSeedResult('Data cleared');
      setTimeout(() => window.location.reload(), 900);
    } catch {
      setLoadingAction(null);
    }
  };

  return (
    <div className="bg-[#111827] rounded-2xl p-6 flex flex-col gap-6">
      {/* Stress simulator */}
      <div>
        <h3 className="text-white font-semibold mb-5 text-sm uppercase tracking-widest">
          Demo Controls
        </h3>

        <div className="mb-5">
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-400">Stress level</span>
            <span className="text-white font-medium">{stress}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={stress}
            onChange={handleSlider}
            className="w-full accent-purple-600 cursor-pointer"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => { void handleRising(); }}
            disabled={rising}
            className="flex-1 bg-[#7c3aed] hover:bg-[#6d28d9] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl py-3 font-medium text-sm transition-colors"
          >
            {rising ? 'Rising…' : '↑ Rising Stress'}
          </button>
          <button
            onClick={() => { void handleReset(); }}
            className="flex-1 bg-[#1f2937] hover:bg-[#374151] text-white rounded-xl py-3 font-medium text-sm transition-colors"
          >
            ↺ Reset
          </button>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-[#1f2937]" />

      {/* Data mode switcher */}
      <div>
        <h3 className="text-white font-semibold mb-1 text-sm uppercase tracking-widest">
          Data Mode
        </h3>
        <p className="text-gray-500 text-xs mb-4">
          Switch between an empty state (live testing) and a pre-filled month of realistic data.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { void handleSeed(); }}
            disabled={loadingAction !== null}
            className={`relative flex flex-col items-center gap-1.5 rounded-xl py-4 px-3 border text-sm font-medium transition-all
              ${dataMode === 'filled'
                ? 'bg-purple-900/40 border-purple-500 text-purple-300'
                : 'bg-[#1f2937] border-[#374151] text-gray-300 hover:border-purple-600 hover:text-white'}
              disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <span className="text-xl">📊</span>
            <span>
              {loadingAction === 'seed'
                ? seedResult
                  ? seedResult
                  : 'Loading…'
                : 'Load Demo Month'}
            </span>
            {dataMode === 'filled' && loadingAction === null && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-purple-400" />
            )}
          </button>

          <button
            onClick={() => { void handleClear(); }}
            disabled={loadingAction !== null}
            className={`relative flex flex-col items-center gap-1.5 rounded-xl py-4 px-3 border text-sm font-medium transition-all
              ${dataMode === 'empty'
                ? 'bg-green-900/30 border-green-600 text-green-300'
                : 'bg-[#1f2937] border-[#374151] text-gray-300 hover:border-green-700 hover:text-white'}
              disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <span className="text-xl">🧹</span>
            <span>
              {loadingAction === 'clear'
                ? seedResult
                  ? seedResult
                  : 'Clearing…'
                : 'Reset to Empty'}
            </span>
            {dataMode === 'empty' && loadingAction === null && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-green-400" />
            )}
          </button>
        </div>

        {seedResult && loadingAction !== null && (
          <p className="text-center text-xs text-gray-400 mt-3 animate-pulse">
            Refreshing…
          </p>
        )}
      </div>
    </div>
  );
}
