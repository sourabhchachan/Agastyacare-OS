"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CanDo } from "@/components/CanDo";
import { PERMISSIONS } from "@/lib/auth/permissions";

type User = { id: string; full_name: string; is_active: boolean };
type Assignment = { id: string; dept_id: string; assigned_user_id: string; bed_range_start: string; bed_range_end: string };

export default function HandoverPage() {
  const router = useRouter();
  const [outgoing, setOutgoing] = useState<User[]>([]);
  const [incoming, setIncoming] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [outgoingIds, setOutgoingIds] = useState<string[]>([]);
  const [incomingIds, setIncomingIds] = useState<string[]>([]);
  const [started, setStarted] = useState(false);

  const load = async () => {
    const response = await fetch("/api/admin/handover");
    const result = (await response.json()) as { outgoing: User[]; incoming: User[]; assignments: Assignment[] };
    setOutgoing(result.outgoing ?? []);
    setIncoming(result.incoming ?? []);
    setAssignments(result.assignments ?? []);
  };

  useEffect(() => {
    void load();
  }, []);

  const outgoingAssignmentPreview = useMemo(() => {
    return assignments.filter((a) => outgoingIds.includes(a.assigned_user_id));
  }, [assignments, outgoingIds]);

  const confirm = async () => {
    if (outgoingIds.length < 1 || incomingIds.length < 1) {
      alert("Cannot deactivate without replacement");
      return;
    }

    const response = await fetch("/api/admin/handover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outgoingUserIds: outgoingIds, incomingUserIds: incomingIds }),
    });

    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      alert(result.error ?? "Handover failed");
      return;
    }

    router.push("/admin/bed-assignments");
  };

  return (
    <CanDo permission={PERMISSIONS.MANAGE_USERS} fallback={<p className="text-sm text-slate-600">No access.</p>}>
      <section className="space-y-4">
        <h1 className="text-xl font-semibold text-[#1B4F8A]">Admin - Shift Handover</h1>

        {!started ? (
          <button type="button" onClick={() => setStarted(true)} className="w-full rounded-lg bg-[#1B4F8A] px-3 py-2 text-sm font-semibold text-white">Start Handover</button>
        ) : null}

        {started ? (
          <>
            <div className="rounded-xl border border-slate-200 p-3">
              <h2 className="text-sm font-semibold">Step 1: Outgoing users</h2>
              <div className="mt-2 space-y-1">
                {outgoing.map((user) => {
                  const checked = outgoingIds.includes(user.id);
                  return (
                    <label key={user.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setOutgoingIds((prev) => checked ? prev.filter((id) => id !== user.id) : [...prev, user.id])}
                      />
                      {user.full_name}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <h2 className="text-sm font-semibold">Step 2: Incoming users</h2>
              <div className="mt-2 space-y-1">
                {incoming.map((user) => {
                  const checked = incomingIds.includes(user.id);
                  return (
                    <label key={user.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => setIncomingIds((prev) => checked ? prev.filter((id) => id !== user.id) : [...prev, user.id])}
                      />
                      {user.full_name}
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3">
              <h2 className="text-sm font-semibold">Step 3: Review</h2>
              <p className="mt-1 text-xs text-slate-600">Outgoing bed assignments</p>
              <div className="mt-1 space-y-1">
                {outgoingAssignmentPreview.map((a) => (
                  <p key={a.id} className="text-xs text-slate-700">{a.assigned_user_id}: Bed {a.bed_range_start} to {a.bed_range_end}</p>
                ))}
                {outgoingAssignmentPreview.length === 0 ? <p className="text-xs text-slate-500">No assignments selected yet.</p> : null}
              </div>
            </div>

            <button type="button" onClick={() => void confirm()} className="w-full rounded-lg bg-[#1B4F8A] px-3 py-2 text-sm font-semibold text-white">Step 4: Confirm Handover</button>
          </>
        ) : null}
      </section>
    </CanDo>
  );
}
