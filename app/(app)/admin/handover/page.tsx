"use client";

import { useCallback, useEffect, useState } from "react";
import { CanDo } from "@/components/CanDo";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { useToast } from "@/components/feedback/ToastProvider";
import { humanizeError, humanizeResponseError } from "@/lib/feedback/humanizeError";
import { useAsyncAction } from "@/lib/feedback/useAsyncAction";
import { UserFacingError } from "@/lib/feedback/userFacingError";

type Staff = { id: string; full_name: string };
type Task = { id: string; due_at: string; status: string; patient_id: string | null; item_name: string };
type HandoverLogRow = {
  id: string;
  from_user_id: string;
  to_user_id: string;
  from_name: string;
  to_name: string;
  item_count: number;
  notes: string | null;
  created_at: string;
};

export default function HandoverPage() {
  const { showToast } = useToast();
  const { run, isPending } = useAsyncAction();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [recent, setRecent] = useState<HandoverLogRow[]>([]);
  const [fromUserId, setFromUserId] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState("");
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const loadMeta = useCallback(async () => {
    setLoadingMeta(true);
    const res = await fetch("/api/admin/handover");
    if (!res.ok) throw new UserFacingError(await humanizeResponseError(res));
    const result = (await res.json()) as { staff: Staff[]; recent: HandoverLogRow[] };
    setStaff(result.staff ?? []);
    setRecent(result.recent ?? []);
    setLoadingMeta(false);
  }, []);

  const loadTasks = useCallback(async (userId: string) => {
    if (!userId) {
      setTasks([]);
      setSelected(new Set());
      return;
    }
    setLoadingTasks(true);
    const res = await fetch(`/api/admin/handover/queue?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) {
      setLoadingTasks(false);
      throw new UserFacingError(await humanizeResponseError(res));
    }
    const result = (await res.json()) as { tasks: Task[] };
    setTasks(result.tasks ?? []);
    setSelected(new Set());
    setLoadingTasks(false);
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        await loadMeta();
      } catch (e) {
        showToast("error", humanizeError(e));
        setLoadingMeta(false);
      }
    })();
  }, [loadMeta, showToast]);

  useEffect(() => {
    if (!fromUserId) {
      setTasks([]);
      setSelected(new Set());
      return;
    }
    void (async () => {
      try {
        await loadTasks(fromUserId);
      } catch (e) {
        showToast("error", humanizeError(e));
      }
    })();
  }, [fromUserId, loadTasks, showToast]);

  const toggleTask = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const transfer = () => {
    const ids = Array.from(selected);
    void run(
      "handover-transfer",
      async () => {
        const res = await fetch("/api/admin/handover/transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromUserId,
            toUserId,
            instanceIds: ids,
            notes: notes.trim() || null,
          }),
        });
        if (!res.ok) throw new UserFacingError(await humanizeResponseError(res));
        const result = (await res.json()) as { transferred: number; toName: string };
        showToast("success", `${result.transferred} tasks transferred to ${result.toName}`);
        setNotes("");
        setSelected(new Set());
        setToUserId("");
        await loadMeta();
        await loadTasks(fromUserId);
      },
      { successMessage: null }
    );
  };

  const toStaffOptions = staff.filter((s) => s.id !== fromUserId);

  return (
    <CanDo
      anyOf={[PERMISSIONS.MANAGE_PATIENTS, PERMISSIONS.MANAGE_USERS]}
      fallback={<p className="text-sm text-slate-600">No access.</p>}
    >
      <section className="space-y-4">
        <h1 className="text-xl font-semibold text-[#1B4F8A]">Task handover</h1>
        <p className="text-sm text-slate-600">
          Move pending or in-progress tasks from one staff member to another. Item history is unchanged; only the
          assignee is updated.
        </p>

        {loadingMeta ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="space-y-4 rounded-xl border border-slate-200 p-3">
            <div>
              <label className="block text-xs font-medium text-slate-700">From</label>
              <select
                value={fromUserId}
                onChange={(e) => {
                  setFromUserId(e.target.value);
                  setToUserId("");
                }}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select staff member</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </div>

            {fromUserId ? (
              <div>
                <h2 className="text-sm font-semibold text-slate-800">Their queue</h2>
                {loadingTasks ? (
                  <p className="mt-2 text-xs text-slate-500">Loading tasks…</p>
                ) : tasks.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">No pending or in-progress tasks assigned to this user.</p>
                ) : (
                  <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto rounded border border-slate-100 p-2">
                    {tasks.map((t) => (
                      <li key={t.id} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selected.has(t.id)}
                          onChange={() => toggleTask(t.id)}
                          className="mt-1"
                        />
                        <span>
                          <span className="font-medium text-slate-900">{t.item_name}</span>
                          <span className="block text-xs text-slate-500">
                            Due {new Date(t.due_at).toLocaleString()} · {t.status}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}

            <div>
              <label className="block text-xs font-medium text-slate-700">To</label>
              <select
                value={toUserId}
                onChange={(e) => setToUserId(e.target.value)}
                disabled={!fromUserId}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50"
              >
                <option value="">Select recipient</option>
                {toStaffOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700">Handover notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Context for the receiving staff…"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>

            <button
              type="button"
              onClick={transfer}
              disabled={
                isPending("handover-transfer") ||
                !fromUserId ||
                !toUserId ||
                selected.size < 1
              }
              className="w-full rounded-lg bg-[#1B4F8A] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isPending("handover-transfer") ? "Transferring…" : "Transfer"}
            </button>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 p-3">
          <h2 className="text-sm font-semibold text-slate-800">Recent handovers</h2>
          <p className="text-xs text-slate-500">Last 20 transfers (read-only)</p>
          {recent.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">No handovers logged yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {recent.map((row) => (
                <li key={row.id} className="rounded border border-slate-100 bg-slate-50/80 px-2 py-2 text-xs text-slate-800">
                  <p>
                    <span className="font-medium">{row.from_name}</span> →{" "}
                    <span className="font-medium">{row.to_name}</span>
                    <span className="text-slate-600"> · {row.item_count} task{row.item_count === 1 ? "" : "s"}</span>
                  </p>
                  {row.notes ? <p className="mt-1 text-slate-600">Notes: {row.notes}</p> : null}
                  <p className="mt-1 text-slate-500">{new Date(row.created_at).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </CanDo>
  );
}
