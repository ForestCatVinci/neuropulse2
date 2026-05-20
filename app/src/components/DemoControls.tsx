import { useState } from 'react';
import { API_URL } from '../config';

export function DemoControls() {
  const [stress, setStress] = useState(0);
  const [rising, setRising] = useState(false);

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
    // auto-clear loading state after 31s (scenario duration)
    setTimeout(() => setRising(false), 31000);
  };

  const handleReset = async () => {
    setStress(0);
    setRising(false);
    try {
      await fetch(`${API_URL}/demo/scenario/reset`, { method: 'POST' });
    } catch { /* ignore */ }
  };

  return (
    <div className="bg-[#111827] rounded-2xl p-6">
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
  );
}
