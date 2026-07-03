import { errorMessage } from "../api/client";
import { ErrorCard } from "../components/ErrorCard";
import { useDevices } from "../hooks/api";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Formats an epoch-ms timestamp as a coarse human-relative label, e.g. "3m ago", "2h ago", "5d ago". */
export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  return `${Math.floor(diff / DAY)}d ago`;
}

export function DevicesScreen() {
  const devices = useDevices();
  const list = devices.data ?? [];

  return (
    <div className="flex flex-col gap-4">
      {devices.isLoading && <p className="text-sm text-slate-500">Loading devices…</p>}
      {devices.isError && (
        <ErrorCard message={`Could not load devices: ${errorMessage(devices.error)}`} />
      )}
      {devices.isSuccess && list.length === 0 && (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
          No devices have pushed yet.
        </div>
      )}
      {devices.isSuccess && list.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
              <tr>
                <th className="px-3 py-2 text-left">Device</th>
                <th className="px-3 py-2 text-left">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.name} className="border-t border-slate-100">
                  <td className="px-3 py-2">{d.name}</td>
                  <td className="px-3 py-2 text-slate-500">{relativeTime(d.lastSeen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
