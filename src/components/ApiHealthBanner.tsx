import { useEffect, useMemo, useRef, useState } from "react";
import { API_URL } from "@/lib/api";

const POLL_INTERVAL = 60_000; // 60s

type HealthState = {
  status: "idle" | "checking" | "ok" | "error";
  message?: string;
};

export const ApiHealthBanner = (): JSX.Element | null => {
  const [state, setState] = useState<HealthState>({ status: "idle" });
  const timerRef = useRef<number | null>(null);

  const healthUrl = useMemo(() => {
    const base = API_URL.replace(/\/$/, "");
    return `${base}/healthz`;
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkHealth = async () => {
      if (!cancelled) {
        setState(prev => (prev.status === "error" ? prev : { status: "checking" }));
      }
      try {
        const res = await fetch(healthUrl, {
          method: "GET",
          // No credentials needed; Authorization uses headers, so avoid triggering CORS errors
        });
        if (!cancelled) {
          if (res.ok) {
            setState({ status: "ok" });
          } else {
            setState({ status: "error", message: `API svarade ${res.status}` });
          }
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : "Okänt fel";
          setState({ status: "error", message });
        }
      }
    };

    // Kör direkt och sen på intervall
    checkHealth();
    timerRef.current = window.setInterval(checkHealth, POLL_INTERVAL);

    return () => {
      cancelled = true;
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [healthUrl]);

  if (state.status !== "error") return null;

  return (
    <div className="w-full bg-red-600/90 text-white text-sm py-2 px-4 text-center flex flex-col gap-1">
      <span className="font-semibold">Kan inte nå API:t just nu.</span>
      {state.message && <span className="text-xs opacity-90">{state.message}</span>}
      <span className="text-xs opacity-75">Kontrollera att backend-adressen (VITE_API_URL) pekar rätt och att brandvägg/CORS tillåter domänen.</span>
    </div>
  );
};
