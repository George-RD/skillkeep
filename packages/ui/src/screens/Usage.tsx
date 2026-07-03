import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ApiRequestError, errorMessage } from "../api/client";
import type { UsageGroup, UsageRow } from "../api/types";
import { ErrorCard } from "../components/ErrorCard";
import { useUsage } from "../hooks/api";

const GROUPS: UsageGroup[] = ["model", "repo", "client", "skill"];

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function UsageScreen() {
  const [from, setFrom] = useState(isoDaysAgo(7));
  const [to, setTo] = useState(isoDaysAgo(0));
  const [group, setGroup] = useState<UsageGroup>("model");

  const query = useUsage(group, from, to);
  const rows = query.data?.rows ?? [];
  const notImplemented = query.error instanceof ApiRequestError && query.error.status === 501;
  const showEmpty = notImplemented || (query.isSuccess && rows.length === 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-1 text-sm">
          From
          <input
            type="date"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-1 text-sm">
          To
          <input
            type="date"
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <div className="flex gap-1">
          {GROUPS.map((g) => (
            <button
              type="button"
              key={g}
              className={`rounded px-3 py-1 text-sm ${
                group === g ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"
              }`}
              onClick={() => setGroup(g)}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {query.isLoading && <p className="text-sm text-slate-500">Loading usage…</p>}
      {query.isError && !notImplemented && (
        <ErrorCard message={`Could not load usage: ${errorMessage(query.error)}`} />
      )}
      {showEmpty && (
        <div className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-slate-500">
          No usage data yet
        </div>
      )}
      {query.isSuccess && rows.length > 0 && <UsageChart rows={rows} />}
    </div>
  );
}

function UsageChart({ rows }: { rows: UsageRow[] }) {
  return (
    <div className="h-80 w-full rounded-lg border border-slate-200 p-3">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="key" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="input" fill="#6366f1" />
          <Bar dataKey="output" fill="#10b981" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
