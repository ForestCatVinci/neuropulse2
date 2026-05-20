import { useState } from 'react';
import { AlertScreen } from './components/AlertScreen';
import { DemoControls } from './components/DemoControls';
import { ParentDashboard } from './components/ParentDashboard';
import { StressMeter } from './components/StressMeter';
import { useStressData } from './hooks/useStressData';
import { useStressStore } from './store/stressStore';

type Tab = 'monitor' | 'dashboard';

export default function App() {
  useStressData();

  const [tab, setTab] = useState<Tab>('monitor');
  const { current, connected, alertDismissed } = useStressStore();

  const showAlert = (current?.alert ?? false) && !alertDismissed;

  return (
    <div className="min-h-screen bg-[#030712] text-white">
      {/* Alert renders outside tabs — always on top */}
      <AlertScreen visible={showAlert} />

      {/* Header */}
      <header className="border-b border-[#111827] px-4 py-4">
        <div className="max-w-2xl mx-auto w-full flex items-center justify-between">
          <span className="text-lg font-bold tracking-tight">
            <span className="text-purple-400">Neuro</span>Pulse
          </span>
          <div className="flex items-center gap-3">
            <a
              href="https://t.me/Mufasa101_bot"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#229ED9]/10 border border-[#229ED9]/30 text-[#229ED9] text-sm hover:bg-[#229ED9]/20 transition-colors"
            >
              <span>✈️</span>
              <span>Alerts Bot</span>
            </a>
            <div className="flex items-center gap-2 text-sm">
              <span
                className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-500'}`}
                style={{ boxShadow: connected ? '0 0 6px #4ade80' : '0 0 6px #f87171' }}
              />
              <span className="text-gray-400">{connected ? 'Connected' : 'Disconnected'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <nav className="border-b border-[#111827] px-4">
        <div className="max-w-2xl mx-auto w-full flex">
          {(['monitor', 'dashboard'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-6 py-3 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
                tab === t
                  ? 'border-purple-500 text-purple-400'
                  : 'border-transparent text-gray-500 hover:text-white'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </nav>

      {/* Main */}
      <main className="max-w-2xl mx-auto w-full px-4 py-8">
        {tab === 'monitor' ? (
          <div className="flex flex-col gap-6">
            <StressMeter
              stress={current?.stress ?? 0}
              bpm={current?.bpm ?? 68}
              rmssd={current?.rmssd ?? 45}
            />
            <DemoControls />
          </div>
        ) : (
          <ParentDashboard />
        )}
      </main>
    </div>
  );
}
