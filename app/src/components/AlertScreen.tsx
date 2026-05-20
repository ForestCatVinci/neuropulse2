import { AnimatePresence, motion } from 'framer-motion';
import { useStressStore } from '../store/stressStore';
import { NonverbalButtons } from './NonverbalButtons';

interface Props {
  visible: boolean;
}

export function AlertScreen({ visible }: Props) {
  const dismissAlert = useStressStore((s) => s.dismissAlert);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-red-950 px-6"
        >
          <button
            onClick={dismissAlert}
            className="absolute top-6 right-6 text-white/50 hover:text-white text-sm transition-colors px-3 py-1 rounded-lg border border-white/20"
          >
            Dismiss
          </button>

          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
            className="flex flex-col items-center text-center mb-12"
          >
            <span className="text-7xl mb-6">⚠️</span>
            <h1 className="text-white text-4xl font-bold mb-3">High Stress Alert</h1>
            <p className="text-red-300 text-lg">Child may need immediate support</p>
          </motion.div>

          <NonverbalButtons />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
