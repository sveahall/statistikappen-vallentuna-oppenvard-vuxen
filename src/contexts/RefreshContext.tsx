import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

interface RefreshContextValue {
  refreshKey: number;
  triggerRefresh: () => void;
  intervalMs: number;
}

interface RefreshProviderProps {
  children: ReactNode;
  /** Optional override, defaults to VITE_REFRESH_INTERVAL_MS or 60000 */
  intervalMs?: number;
}

const DEFAULT_INTERVAL = (() => {
  const raw = Number(import.meta.env.VITE_REFRESH_INTERVAL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : 60_000;
})();

const MIN_INTERVAL = 10_000; // throttle overly aggressive polling

const RefreshContext = createContext<RefreshContextValue | undefined>(undefined);

export const RefreshProvider = ({ children, intervalMs }: RefreshProviderProps) => {
  const resolvedInterval = useMemo(() => {
    const value = typeof intervalMs === 'number' ? intervalMs : DEFAULT_INTERVAL;
    return Math.max(MIN_INTERVAL, value);
  }, [intervalMs]);

  const [refreshKey, setRefreshKey] = useState(0);
  const intervalRef = useRef<number | null>(null);

  const triggerRefresh = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  useEffect(() => {
    const tick = () => triggerRefresh();

    if (intervalRef.current) {
      window.clearInterval(intervalRef.current);
    }
    intervalRef.current = window.setInterval(tick, resolvedInterval);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [resolvedInterval, triggerRefresh]);

  useEffect(() => {
    const handleFocus = () => triggerRefresh();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        triggerRefresh();
      }
    };
    const handleOnline = () => triggerRefresh();

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [triggerRefresh]);

  const value = useMemo<RefreshContextValue>(() => ({
    refreshKey,
    triggerRefresh,
    intervalMs: resolvedInterval,
  }), [refreshKey, triggerRefresh, resolvedInterval]);

  return (
    <RefreshContext.Provider value={value}>
      {children}
    </RefreshContext.Provider>
  );
};

export const useRefresh = (): RefreshContextValue => {
  const ctx = useContext(RefreshContext);
  if (!ctx) {
    throw new Error('useRefresh måste användas inom en RefreshProvider');
  }
  return ctx;
};
