"use client";

import { useEffect, useState } from "react";
import { CanDo } from "@/components/CanDo";
import { PERMISSIONS } from "@/lib/auth/permissions";

type Cat = { id: string; name: string };
type Staff = { id: string; full_name: string };

export default function FacilityItemPage() {
  const [items, setItems] = useState<Cat[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [catId, setCatId] = useState("");
  const [userId, setUserId] = useState("");
  const [dueAt, setDueAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/items/facility/options");
      if (!res.ok) return;
      const d = (await res.json()) as { items: Cat[]; staff: Staff[] };
      setItems(d.items ?? []);
      setStaff(d.staff ?? []);
    })();
  }, []);

  const submit = async () => {
    setErr(null);
    setMsg(null);
    const res = await fetch("/api/items/facility", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        catalogueItemId: catId,
        assignedUserId: userId,
        dueAt: new Date(dueAt).toISOString(),
        notes: notes || undefined,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) {
      setErr(data.error ?? "Failed");
      return;
    }
    setMsg("Facility item created.");
  };

  return (
    <CanDo permission={PERMISSIONS.BUILD_SYSTEM} fallback={<p className="text-sm text-slate-600">No access.</p>}>
      <section className="space-y-4">
        <h1 className="text-xl font-semibold text-[#1B4F8A]">Create facility item</h1>
        <select value={catId} onChange={(e) => setCatId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">Facility catalogue item</option>
          {items.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={userId} onChange={(e) => setUserId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">Assign to user</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>
        <input
          type="datetime-local"
          value={dueAt}
          onChange={(e) => setDueAt(e.target.value)}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={2} />
        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}
        <button type="button" onClick={() => void submit()} className="w-full rounded-lg bg-[#1B4F8A] px-3 py-2 text-sm font-semibold text-white">
          Create
        </button>
      </section>
    </CanDo>
  );
}
