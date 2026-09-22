import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { MotionConfig, useReducedMotion } from 'motion/react';
import { loadSettings, type AppSettings } from './settings';
import { spring } from './spring';

const ReducedMotionContext = createContext(false);

/** One preference for Motion, CSS, scrolling, and imperative game renderers. */
export function MotionPreferences({ children }: { children: ReactNode }) {
  const devicePreference = useReducedMotion();
  const [settings, setSettings] = useState(loadSettings);
  const reduceMotion = settings.reduceMotion || Boolean(devicePreference);

  useEffect(() => {
    const update = (event: Event) =>
      setSettings((event as CustomEvent<AppSettings>).detail);
    window.addEventListener('but-settings-change', update);
    return () => window.removeEventListener('but-settings-change', update);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(reduceMotion);
    return () => {
      delete document.documentElement.dataset.reduceMotion;
    };
  }, [reduceMotion]);

  return (
    <ReducedMotionContext value={reduceMotion}>
      <MotionConfig
        reducedMotion={reduceMotion ? 'always' : 'never'}
        transition={spring}
      >
        {children}
      </MotionConfig>
    </ReducedMotionContext>
  );
}

export function useAppReducedMotion() {
  return useContext(ReducedMotionContext);
}
