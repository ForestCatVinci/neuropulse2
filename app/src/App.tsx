import { useState } from 'react';
import { AlertScreen } from './components/AlertScreen';
import { DemoControls } from './components/DemoControls';
import { DoctorDashboard } from './components/DoctorDashboard';
import { ParentDashboard } from './components/ParentDashboard';
import { StressMeter } from './components/StressMeter';
import { useStressData } from './hooks/useStressData';
import { useStressStore, DataMode } from './store/stressStore';

type Tab = 'monitor' | 'dashboard' | 'doctor';

function WaitingForDevice() {
  return (
    <div className="flex flex-col items-center justify-center gap-5 py-20 text-center">
      {/* Pulsing ring */}
      <div className="relative flex items-center justify-center">
        <span className="absolute inline-flex h-16 w-16 rounded-full bg-green-400/20 animate-ping" />
        <span className="relative inline-flex h-10 w-10 rounded-full bg-green-400/30 items-center justify-center">
          <span className="h-4 w-4 rounded-full bg-green-400" />
        </span>
      </div>
      <div>
        <p className="text-lg font-semibold text-white">Waiting for device...</p>
        <p className="mt-1 text-sm text-gray-500">
          Make sure your ESP32 wristband is powered on and connected to WiFi.
        </p>
        <p className="mt-3 text-xs text-gray-600 font-mono">
          wss://neuropulse-backend.fly.dev/ws/device
        </p>
      </div>
    </div>
  );
}

export default function App() {
  useStressData();

  const [tab, setTab] = useState<Tab>('monitor');
  const { current, connected, alertDismissed, dataMode, deviceConnected, setDataMode } =
    useStressStore();

  const showAlert = (current?.alert ?? false) && !alertDismissed;
  const isDeviceMode = dataMode === 'device';

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

            {/* Live Device badge — only shown in device mode when ESP32 is active */}
            {isDeviceMode && deviceConnected && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-400/10 border border-green-400/30 text-green-400 text-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
                </span>
                <span>Live Device</span>
              </div>
            )}

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
          {(['monitor', 'dashboard', 'doctor'] as Tab[]).map((t) => (
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

            {/* Data Mode Toggle */}
            <div className="flex items-center gap-2 p-1 rounded-xl bg-[#0d1117] border border-[#1f2937] w-fit">
              {(['simulator', 'device'] as DataMode[]).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setDataMode(mode)}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all capitalize ${
                    dataMode === mode
                      ? mode === 'device'
                        ? 'bg-green-500/20 text-green-400 border border-green-500/40'
                        : 'bg-purple-500/20 text-purple-400 border border-purple-500/40'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {mode === 'device' ? '📡 Device' : '🖥️ Simulator'}
                </button>
              ))}
            </div>

            {/* Content: waiting state or live meter */}
            {isDeviceMode && !deviceConnected ? (
              <WaitingForDevice />
            ) : (
              <>
                <StressMeter
                  stress={current?.stress ?? 0}
                  bpm={current?.bpm ?? 68}
                  rmssd={current?.rmssd ?? 45}
                />
                {/* Hide demo controls in device mode — no fake data */}
                {!isDeviceMode && <DemoControls />}
              </>
            )}

          </div>
        ) : tab === 'dashboard' ? (
          <ParentDashboard />
        ) : (
          <DoctorDashboard />
        )}
      </main>
    </div>
  );
}
