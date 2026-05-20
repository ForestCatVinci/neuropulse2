import { motion } from 'framer-motion';
import { API_URL } from '../config';

const BUTTONS = [
  { emoji: '🔇', label: 'Quiet', key: 'quiet' },
  { emoji: '🏠', label: 'Go Home', key: 'home' },
  { emoji: '🆘', label: 'Help', key: 'help' },
] as const;

export function NonverbalButtons() {
  const handlePress = async (key: string) => {
    try {
      await fetch(`${API_URL}/nonverbal/${key}`, { method: 'POST' });
    } catch {
      // fire-and-forget — never block the UI
    }
  };

  return (
    <div className="flex gap-5 justify-center flex-wrap">
      {BUTTONS.map(({ emoji, label, key }) => (
        <motion.button
          key={label}
          onClick={() => handlePress(key)}
          whileTap={{ scale: 0.88 }}
          whileHover={{ scale: 1.05 }}
          className="flex flex-col items-center justify-center w-32 h-32 bg-white/10 rounded-3xl border-2 border-white/25 hover:bg-white/20 transition-colors select-none"
        >
          <span className="text-5xl leading-none">{emoji}</span>
          <span className="text-white text-sm font-bold mt-2 tracking-wide">{label}</span>
        </motion.button>
      ))}
    </div>
  );
}
