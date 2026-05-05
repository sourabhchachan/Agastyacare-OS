"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/feedback/ToastProvider";
import { humanizeResponseError } from "@/lib/feedback/humanizeError";
import { useAsyncAction } from "@/lib/feedback/useAsyncAction";
import { UserFacingError } from "@/lib/feedback/userFacingError";

type Def = {
  step_number: number;
  description: string;
  dept_id: string | null;
  department_id?: string | null;
  assignment_type?: string | null;
  assigned_user_id?: string | null;
  is_recurring?: boolean | null;
  recurrence_frequency?: string | null;
  recurrence_end_date?: string | null;
  due_offset_minutes?: number | null;
};
type Cp = {
  id: string;
  step_number: number;
  status: string;
  department_id?: string | null;
  assigned_user_id?: string | null;
  actor_name: string | null;
  actioned_time: string | null;
  proof_note: string | null;
};

export default function ItemDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const { run, isPending } = useAsyncAction();
  const [loading, setLoading] = useState(true);
  const [itemName, setItemName] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [patient, setPatient] = useState<{ name: string; bed_number: string; priority: string } | null>(null);
  const [facility, setFacility] = useState(false);
  const [defs, setDefs] = useState<Def[]>([]);
  const [cps, setCps] = useState<Cp[]>([]);
  const [status, setStatus] = useState("");

  const [proof, setProof] = useState("");
  const [remarkCancel, setRemarkCancel] = useState("");
  const [remarkNot, setRemarkNot] = useState("");
  const [showCancel, setShowCancel] = useState(false);
  const [showNot, setShowNot] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/items/${params.id}`);
    if (!res.ok) {
      setLoading(false);
      showToast("error", await humanizeResponseError(res));
      return;
    }
    const data = (await res.json()) as {
      instance: { item_name: string; due_at: string; status: string; patient_id: string | null; catalogue_type: string | null };
      patient: { name: string; bed_number: string; priority: string } | null;
      definitions: Def[];
      checkpoints: Cp[];
    };
    setItemName(data.instance.item_name);
    setDueAt(data.instance.due_at);
    setStatus(data.instance.status);
    setPatient(data.patient);
    setFacility(!data.instance.patient_id);
    setDefs(data.definitions);
    setCps(data.checkpoints);
    setLoading(false);
  }, [params.id, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentStep =
    (cps ?? []).find((c) => c.status === "pending")?.step_number ??
    null;
  const isActive = status === "pending" || status === "in_progress";

  const completeStep = () => {
    void run(
      "complete-step",
      async () => {
        const res = await fetch(`/api/items/${params.id}/complete-step`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proofNote: proof || undefined }),
        });
        if (!res.ok) throw new UserFacingError(await humanizeResponseError(res));
        setProof("");
        router.push("/");
      },
      { successMessage: "Step completed" }
    );
  };

  const cancel = () => {
    if (!remarkCancel.trim()) return;
    void run(
      "cancel-item",
      async () => {
        const res = await fetch(`/api/items/${params.id}/cancel`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ remarks: remarkCancel }),
        });
        if (!res.ok) throw new UserFacingError(await humanizeResponseError(res));
        router.push("/");
      },
      { successMessage: "Item cancelled" }
    );
  };

  const notDone = () => {
    if (!remarkNot.trim()) return;
    void run(
      "not-done",
      async () => {
        const res = await fetch(`/api/items/${params.id}/not-done`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ remarks: remarkNot }),
        });
        if (!res.ok) throw new UserFacingError(await humanizeResponseError(res));
        router.push("/");
      },
      { successMessage: "Marked as not done" }
    );
  };

  if (loading) return <p className="text-sm text-slate-600">Loading…</p>;

  return (
    <section className="space-y-4">
      <Link href="/" className="text-xs text-[#1B4F8A]">← Queue</Link>
      <h1 className="text-xl font-semibold text-[#1B4F8A]">{itemName}</h1>
      <p className="text-sm text-slate-600">
        Due {new Date(dueAt).toLocaleString()}
      </p>
      {patient ? (
        <p className="text-sm">
          {patient.name} · Bed {patient.bed_number} · {patient.priority}
        </p>
      ) : facility ? (
        <p className="text-sm font-medium text-[#1B4F8A]">Facility</p>
      ) : null}

      <div className="space-y-2">
        {defs.map((d) => {
          const cp = cps.find((c) => c.step_number === d.step_number);
          const done = cp?.status === "completed";
          const lockedRow = cp?.status === "locked";
          const isCurrent = cp?.status === "pending" && d.step_number === currentStep;
          const upcomingLocked = !cp && !done;
          return (
            <div
              key={d.step_number}
              className={`rounded-lg border p-2 text-sm ${
                done
                  ? "border-emerald-200 bg-emerald-50"
                  : isCurrent
                    ? "border-[#1B4F8A] bg-slate-50"
                    : upcomingLocked
                      ? "border-slate-200 border-dashed bg-slate-50/60"
                      : lockedRow
                        ? "border-amber-200 bg-amber-50/40"
                        : "border-slate-200"
              }`}
            >
              <p className="font-medium">
                {done ? "✓" : isCurrent ? "→" : upcomingLocked ? "○" : lockedRow ? "◆" : "·"} Step {d.step_number}:{" "}
                {d.description}
              </p>
              {lockedRow ? (
                <p className="text-xs text-amber-800">Locked until earlier steps are completed.</p>
              ) : null}
              {upcomingLocked ? (
                <p className="text-xs text-slate-500">Waiting on earlier steps (not yet available in your view).</p>
              ) : null}
              {done && cp ? (
                <p className="text-xs text-slate-600">
                  {cp.actor_name ?? "—"} · {cp.actioned_time}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {isActive && currentStep !== null ? (
        <>
          <textarea
            value={proof}
            onChange={(e) => setProof(e.target.value)}
            placeholder="Proof note (optional)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            rows={2}
          />
          <button
            type="button"
            onClick={completeStep}
            disabled={isPending("complete-step")}
            className="w-full rounded-xl bg-[#1B4F8A] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {isPending("complete-step") ? "Submitting…" : "Complete This Step"}
          </button>
        </>
      ) : null}

      {isActive ? (
        <div className="flex flex-col gap-2">
          {!showCancel ? (
            <button type="button" onClick={() => setShowCancel(true)} className="text-sm text-rose-600">
              Cancel Item
            </button>
          ) : (
            <div className="space-y-1">
              <textarea
                value={remarkCancel}
                onChange={(e) => setRemarkCancel(e.target.value)}
                placeholder="Remarks (required)"
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                rows={2}
              />
              <button
                type="button"
                onClick={cancel}
                disabled={isPending("cancel-item")}
                className="w-full rounded bg-rose-600 px-3 py-2 text-sm text-white disabled:opacity-60"
              >
                {isPending("cancel-item") ? "Cancelling…" : "Confirm cancel"}
              </button>
            </div>
          )}
          {!showNot ? (
            <button type="button" onClick={() => setShowNot(true)} className="text-sm text-slate-600">
              Not Done
            </button>
          ) : (
            <div className="space-y-1">
              <textarea
                value={remarkNot}
                onChange={(e) => setRemarkNot(e.target.value)}
                placeholder="Remarks (required)"
                className="w-full rounded border border-slate-300 px-2 py-1 text-sm"
                rows={2}
              />
              <button
                type="button"
                onClick={notDone}
                disabled={isPending("not-done")}
                className="w-full rounded bg-slate-500 px-3 py-2 text-sm text-white disabled:opacity-60"
              >
                {isPending("not-done") ? "Saving…" : "Confirm not done"}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
