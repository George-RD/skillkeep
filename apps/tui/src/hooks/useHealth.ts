import { useEffect, useState } from "react";
import type { Client } from "../client";

export type HealthState = { status: "checking" } | { status: "ok" } | { status: "unreachable" };

const POLL_INTERVAL_MS = 5000;

/**
 * Polls GET /healthz on an interval; reports "unreachable" on any failure — a network
 * throw (e.g. ECONNREFUSED) or a non-ok health body — and keeps retrying, never throwing.
 */
export function useHealth(client: Client): HealthState {
  const [state, setState] = useState<HealthState>({ status: "checking" });

  useEffect(() => {
    let cancelled = false;

    const poll = async (): Promise<void> => {
      try {
        const health = await client.getHealth();
        if (!cancelled) setState(health.ok ? { status: "ok" } : { status: "unreachable" });
      } catch {
        if (!cancelled) setState({ status: "unreachable" });
      }
    };

    void poll();
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [client]);

  return state;
}
