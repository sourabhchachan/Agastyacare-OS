"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/feedback/ToastProvider";
import { humanizeError, humanizeResponseError } from "@/lib/feedback/humanizeError";
import { useAsyncAction } from "@/lib/feedback/useAsyncAction";
import { UserFacingError } from "@/lib/feedback/userFacingError";

type ShiftSummary = {
  completed: Array<{ instance_id: string; step_number: number; time: string; date: string }>;
  overdue: Array<{ id: string; due_at: string }>;
  cancelledNotDone: Array<{ id: string; status: string; remarks: string; completed_at: string }>;
  passedOn: Array<{ id: number; created_at: string; old_assigned: string | null; new_assigned: string | null }>;
};

export default function ShiftSummaryPage() {
  const { showToast } = useToast();
  const { run, isPending } = useAsyncAction();
  const [data, setData] = useState<ShiftSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/shift-summary", { cache: "no-store" });
    if (!res.ok) {
      const msg = await humanizeResponseError(res);
      setError(msg);
      throw new UserFacingError(msg);
    }
    setData(await res.json());
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await load();
      } catch (e) {
        showToast("error", humanizeError(e));
      }
    })();
  }, [load, showToast]);

  const refresh = () => {
    void run(
      "shift-summary-refresh",
      async () => {
        await load();
      },
      { successMessage: "Shift summary updated" }
    );
  };

  if (error && !data) {
    return (
      <section className="space-y-4">
        <Link href="/profile" className="text-xs text-[#1B4F8A]">← Profile</Link>
        <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>
        <button
          type="button"
          onClick={refresh}
          disabled={isPending("shift-summary-refresh")}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-60"
        >
          {isPending("shift-summary-refresh") ? "Retrying…" : "Try again"}
        </button>
      </section>
    );
  }

  if (!data) return <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-20 animate-pulse rounded-lg bg-slate-100" />)}</div>;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link href="/profile" className="text-xs text-[#1B4F8A]">← Profile</Link>
        <button
          type="button"
          onClick={refresh}
          disabled={isPending("shift-summary-refresh")}
          className="min-h-11 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
        >
          {isPending("shift-summary-refresh") ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <h1 className="text-xl font-semibold text-[#1B4F8A]">Shift Summary</h1>

      <div className="rounded-lg border border-slate-200 p-3">
        <h2 className="text-sm font-semibold">Items completed this shift</h2>
        <ul className="mt-2 space-y-1 text-sm text-slate-700">
          {data.completed.length === 0 ? <li>None completed this shift.</li> : null}
          {data.completed.map((r) => (
            <li key={`${r.instance_id}-${r.step_number}`}>#{r.instance_id.slice(0, 8)} · Step {r.step_number} · {r.time}</li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
        <h2 className="text-sm font-semibold text-red-800">Overdue items</h2>
        <ul className="mt-2 space-y-1 text-sm text-red-700">
          {data.overdue.length === 0 ? <li>No overdue items.</li> : null}
          {data.overdue.map((r) => (
            <li key={r.id}>#{r.id.slice(0, 8)} · due {new Date(r.due_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <h2 className="text-sm font-semibold">Cancelled / not done</h2>
        <ul className="mt-2 space-y-1 text-sm text-slate-700">
          {data.cancelledNotDone.length === 0 ? <li>None.</li> : null}
          {data.cancelledNotDone.map((r) => (
            <li key={r.id}>#{r.id.slice(0, 8)} · {r.status} · {r.remarks || "No remarks"}</li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg border border-slate-200 p-3">
        <h2 className="text-sm font-semibold">Passed on (reassigned)</h2>
        <ul className="mt-2 space-y-1 text-sm text-slate-700">
          {data.passedOn.length === 0 ? <li>No handovers recorded.</li> : null}
          {data.passedOn.map((r) => (
            <li key={r.id}>Audit #{r.id} · {new Date(r.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
