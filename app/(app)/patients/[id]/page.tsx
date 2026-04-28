"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CanDo } from "@/components/CanDo";
import { PERMISSIONS } from "@/lib/auth/permissions";

type Patient = {
  id: string;
  patient_number: string;
  name: string;
  bed_number: string;
  priority: "critical" | "moderate" | "stable";
  is_active: boolean;
  admission_date: string;
  discharge_date: string | null;
};

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [priority, setPriority] = useState<"critical" | "moderate" | "stable">("stable");

  const load = useCallback(async () => {
    const response = await fetch("/api/patients");
    const result = (await response.json()) as { patients?: Patient[] };
    const current = (result.patients ?? []).find((p) => p.id === params.id) ?? null;
    setPatient(current);
    if (current) setPriority(current.priority);
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const updatePriority = async () => {
    await fetch(`/api/patients/${params.id}/priority`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority }),
    });
    await load();
  };

  const discharge = async () => {
    if (!patient) return;
    const yes = window.confirm(`Discharge ${patient.name}? All recurring items will stop.`);
    if (!yes) return;
    await fetch(`/api/patients/${params.id}/discharge`, { method: "PATCH" });
    router.push("/patients");
  };

  if (!patient) return <p className="text-sm text-slate-600">Patient not found.</p>;

  return (
    <CanDo permission={PERMISSIONS.MANAGE_PATIENTS} fallback={<p className="text-sm text-slate-600">No access.</p>}>
      <section className="space-y-4">
        <h1 className="text-xl font-semibold text-[#1B4F8A]">Patient Detail</h1>
        <div className="rounded-xl border border-slate-200 p-3 text-sm">
          <p><span className="font-medium">Patient Number:</span> {patient.patient_number}</p>
          <p><span className="font-medium">Name:</span> {patient.name}</p>
          <p><span className="font-medium">Bed:</span> {patient.bed_number}</p>
          <p><span className="font-medium">Admission Date:</span> {patient.admission_date}</p>
          <p><span className="font-medium">Priority:</span> {patient.priority}</p>
        </div>

        <CanDo permission={PERMISSIONS.UPDATE_PATIENT_PRIORITY}>
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <h2 className="text-sm font-semibold">Update Priority</h2>
            <select value={priority} onChange={(e) => setPriority(e.target.value as "critical" | "moderate" | "stable")} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="critical">Critical</option>
              <option value="moderate">Moderate</option>
              <option value="stable">Stable</option>
            </select>
            <button type="button" onClick={() => void updatePriority()} className="w-full rounded-lg bg-[#1B4F8A] px-3 py-2 text-sm font-semibold text-white">Save Priority</button>
          </div>
        </CanDo>

        <button type="button" onClick={() => void discharge()} className="w-full rounded-lg bg-rose-600 px-3 py-2 text-sm font-semibold text-white">Discharge Patient</button>
      </section>
    </CanDo>
  );
}
