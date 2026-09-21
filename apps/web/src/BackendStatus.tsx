import { useEffect, useState } from 'react';
import { serverHttpUrl } from './lobbyConnection';
import { t } from './i18n';

type Status = 'checking' | 'waking' | 'online' | 'offline';

/** No answer by now means the server is booting rather than just being slow. */
const SLOW_MS = 2500;
/** Render holds the first request open while a sleeping instance boots. */
const REQUEST_TIMEOUT_MS = 70_000;
/** How long a cold start is given before the server is reported offline. */
const COLD_START_MS = 90_000;
const RECHECK_ONLINE_MS = 60_000;
const RETRY_WAKING_MS = 3000;
const RETRY_OFFLINE_MS = 15_000;

/**
 * Whether the game server answers. The free hosting tier sleeps when idle and boots on
 * the first request, so failures inside the cold-start window read as "waking up", not
 * "offline". The check doubles as the wake-up call: loading the menu starts the boot,
 * so the server is usually warm by the time a lobby is opened.
 */
function useBackendStatus() {
  const [status, setStatus] = useState<Status>('checking');
  useEffect(() => {
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    // Measured from the last time the server answered, so a server that drops out
    // after being up gets a fresh cold-start window rather than going straight offline.
    let since = Date.now();

    async function check() {
      const slow = setTimeout(() => {
        if (!cancelled) setStatus((now) => (now === 'online' ? now : 'waking'));
      }, SLOW_MS);
      try {
        const response = await fetch(serverHttpUrl, {
          cache: 'no-store',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        if (!response.ok) throw new Error(String(response.status));
        if (cancelled) return;
        setStatus('online');
        since = Date.now();
        retry = setTimeout(check, RECHECK_ONLINE_MS);
      } catch {
        if (cancelled) return;
        const booting = Date.now() - since < COLD_START_MS;
        setStatus(booting ? 'waking' : 'offline');
        retry = setTimeout(check, booting ? RETRY_WAKING_MS : RETRY_OFFLINE_MS);
      } finally {
        clearTimeout(slow);
      }
    }

    void check();
    return () => {
      cancelled = true;
      clearTimeout(retry);
    };
  }, []);
  return status;
}

export function BackendStatus() {
  const status = useBackendStatus();
  const label = t.backend[status];
  return (
    <span
      className={`backend-status is-${status}`}
      role="status"
      aria-live="polite"
      title={status === 'waking' ? t.backend.wakingHint : label}
    >
      <span className="backend-status-dot" aria-hidden="true" />
      <span className="backend-status-label">{label}</span>
    </span>
  );
}
