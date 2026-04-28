"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CanDo } from "@/components/CanDo";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getTriggeredInstanceCount } from "@/lib/items/frequency";

type PatientOption = { id: string; name: string; patient_number: string; bed_number: string };
type CatOption = { id: string; name: string; frequency: string; type: string };

export default function RaiseItemPage() {
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [catalogue, setCatalogue] = useState<CatOption[]>([]);
  const [q, setQ] = useState("");
  const [catId, setCatId] = useState("");
  const [patientId, setPatientId] = useState("");
  const [notes, setNotes] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const selectedCat = useMemo(() => catalogue.find((c) => c.id === catId), [catalogue, catId]);
  const instanceCount = useMemo(
    () => (selectedCat ? getTriggeredInstanceCount(selectedCat.frequency) : 1),
    [selectedCat]
  );

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/raise-item/options");
      if (!res.ok) return;
      const d = (await res.json()) as { patients: PatientOption[]; catalogueItems: CatOption[] };
      setPatients(d.patients ?? []);
      setCatalogue(d.catalogueItems ?? []);
    })();
  }, []);

  const filteredPatients = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return patients;
    return patients.filter(
      (p) => p.name.toLowerCase().includes(s) || p.patient_number.toLowerCase().includes(s)
    );
  }, [patients, q]);

  const submit = async () => {
    setErr(null);
    setMsg(null);
    const res = await fetch("/api/items/raise", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ catalogueItemId: catId, patientId, notes: notes || undefined }),
    });
    const data = (await res.json()) as { error?: string; assigneeName?: string; ok?: boolean };
    if (!res.ok) {
      setErr(data.error ?? "Failed");
      return;
    }
    setMsg(`Item raised. Assigned to ${data.assigneeName ?? "staff"}.`);
    setCatId("");
    setPatientId("");
    setNotes("");
  };

  return (
    <CanDo permission={PERMISSIONS.RAISE_ITEMS} fallback={<p className="text-sm text-slate-600">No access.</p>}>
      <section className="space-y-4">
        <Link href="/" className="text-xs text-[#1B4F8A]">← Queue</Link>
        <h1 className="text-xl font-semibold text-[#1B4F8A]">Raise item</h1>

        <div className="space-y-2">
          <label className="text-sm font-medium">Item (triggered only)</label>
          <select
            value={catId}
            onChange={(e) => setCatId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select item</option>
            {catalogue.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.frequency})
              </option>
            ))}
          </select>
          {selectedCat && ["BD", "TDS", "QID", "OD"].includes(selectedCat.frequency) ? (
            <p className="text-xs text-slate-600">This will create {instanceCount} instance(s).</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Patient</label>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or patient number"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <select
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">Select active patient</option>
            {filteredPatients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.patient_number} — {p.name} (bed {p.bed_number})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium">Notes (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            rows={3}
          />
        </div>

        {err ? <p className="text-sm text-red-600">{err}</p> : null}
        {msg ? <p className="text-sm text-emerald-700">{msg}</p> : null}

        <button
          type="button"
          onClick={() => void submit()}
          className="w-full rounded-xl bg-[#1B4F8A] px-4 py-3 text-sm font-semibold text-white"
        >
          Submit
        </button>
      </section>
    </CanDo>
  );
}
