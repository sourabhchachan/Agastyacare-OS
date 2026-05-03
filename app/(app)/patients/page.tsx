"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CanDo } from "@/components/CanDo";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { useToast } from "@/components/feedback/ToastProvider";
import { humanizeResponseError } from "@/lib/feedback/humanizeError";
import { useAsyncAction } from "@/lib/feedback/useAsyncAction";
import { UserFacingError } from "@/lib/feedback/userFacingError";

type Patient = {
  id: string;
  patient_number: string;
  name: string;
  bed_number: string;
  priority: "critical" | "moderate" | "stable";
  is_active: boolean;
  admission_date: string;
};

const priorityDot: Record<string, string> = {
  critical: "🔴 Critical",
  moderate: "🟡 Moderate",
  stable: "🟢 Stable",
};

export default function PatientsPage() {
  const { showToast } = useToast();
  const { run, isPending } = useAsyncAction();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState("all");

  const [showForm, setShowForm] = useState(false);
  const [patientNumber, setPatientNumber] = useState("");
  const [name, setName] = useState("");
  const [bedId, setBedId] = useState("");
  const [availableBeds, setAvailableBeds] = useState<Array<{ id: string; name: string; ward: string | null }>>([]);
  const [priority, setPriority] = useState<"critical" | "moderate" | "stable">("stable");
  const [admissionDate, setAdmissionDate] = useState(new Date().toISOString().slice(0, 10));
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [admittingDeptId, setAdmittingDeptId] = useState("");

  const loadPatients = async () => {
    const response = await fetch("/api/patients");
    if (!response.ok) {
      showToast("error", await humanizeResponseError(response));
      return;
    }
    const result = (await response.json()) as { patients?: Patient[] };
    setPatients((result.patients ?? []).filter((p) => p.is_active));
  };

  useEffect(() => {
    void loadPatients();
  }, []);

  useEffect(() => {
    const s = createClient();
    void s
      .from("departments")
      .select("id, name")
      .eq("is_active", true)
      .order("name")
      .then(({ data }) => setDepartments(data ?? []));
  }, []);

  useEffect(() => {
    if (!showForm) return;
    void (async () => {
      const res = await fetch("/api/patients/available-beds");
      if (!res.ok) {
        showToast("error", await humanizeResponseError(res));
        setAvailableBeds([]);
        return;
      }
      const result = (await res.json()) as { beds?: Array<{ id: string; name: string; ward: string | null }> };
      setAvailableBeds(result.beds ?? []);
      setBedId("");
    })();
  }, [showForm]);

  const filteredPatients = useMemo(() => {
    const priorityRank: Record<string, number> = {
      critical: 0,
      stable: 1,
      moderate: 2,
    };
    return patients
      .filter((patient) => {
        const q = search.toLowerCase();
        const matchQuery = patient.name.toLowerCase().includes(q) || patient.patient_number.toLowerCase().includes(q);
        const matchPriority = filterPriority === "all" || patient.priority === filterPriority;
        return matchQuery && matchPriority;
      })
      .sort((a, b) => {
        const pa = priorityRank[a.priority] ?? 99;
        const pb = priorityRank[b.priority] ?? 99;
        if (pa !== pb) return pa - pb;
        return new Date(b.admission_date).getTime() - new Date(a.admission_date).getTime();
      });
  }, [patients, search, filterPriority]);

  const admitPatient = () => {
    void run(
      "admit-patient",
      async () => {
        const response = await fetch("/api/patients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patient_number: patientNumber,
            name,
            bed_id: bedId,
            priority,
            admission_date: admissionDate,
            admitting_dept_id: admittingDeptId || undefined,
          }),
        });
        if (!response.ok) {
          throw new UserFacingError(await humanizeResponseError(response));
        }
        setShowForm(false);
        setPatientNumber("");
        setName("");
        setBedId("");
        setPriority("stable");
        setAdmissionDate(new Date().toISOString().slice(0, 10));
        setAdmittingDeptId("");
        await loadPatients();
      },
      { successMessage: "Patient admitted" }
    );
  };

  return (
    <CanDo permission={PERMISSIONS.MANAGE_PATIENTS} fallback={<p className="text-sm text-slate-600">No access.</p>}>
      <section className="space-y-4">
        <h1 className="text-xl font-semibold text-[#1B4F8A]">Patients</h1>

        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by patient number or name" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="all">All priorities</option>
            <option value="critical">Critical</option>
            <option value="moderate">Moderate</option>
            <option value="stable">Stable</option>
          </select>
          <button type="button" onClick={() => setShowForm((prev) => !prev)} className="w-full rounded-lg bg-[#1B4F8A] px-3 py-2 text-sm font-semibold text-white">
            {showForm ? "Close" : "Admit Patient"}
          </button>
        </div>

        {showForm ? (
          <div className="space-y-2 rounded-xl border border-slate-200 p-3">
            <h2 className="text-sm font-semibold">Admit Patient</h2>
            <input value={patientNumber} onChange={(e) => setPatientNumber(e.target.value)} placeholder="Patient Number (auto if blank)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <label className="block text-xs font-medium text-slate-700">
              Bed (available only)
              <select
                value={bedId}
                onChange={(e) => setBedId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">Select a bed</option>
                {availableBeds.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.ward ? ` — ${b.ward}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {showForm && availableBeds.length === 0 ? (
              <p className="text-xs text-amber-800">
                No available beds. Add beds in Admin → Bed Assignments, or discharge patients to free beds.
              </p>
            ) : null}
            <select
              value={admittingDeptId}
              onChange={(e) => setAdmittingDeptId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Admitting department (for recurring items)</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select value={priority} onChange={(e) => setPriority(e.target.value as "critical" | "moderate" | "stable")} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="stable">Stable</option>
              <option value="moderate">Moderate</option>
              <option value="critical">Critical</option>
            </select>
            <input type="date" value={admissionDate} onChange={(e) => setAdmissionDate(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <button
              type="button"
              onClick={admitPatient}
              disabled={isPending("admit-patient") || !bedId}
              className="w-full rounded-lg bg-[#1B4F8A] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {isPending("admit-patient") ? "Saving…" : "Save Admission"}
            </button>
          </div>
        ) : null}

        <div className="space-y-2">
          {filteredPatients.map((patient) => (
            <Link key={patient.id} href={`/patients/${patient.id}`} className="block rounded-xl border border-slate-200 p-3">
              <p className="text-sm font-semibold">{patient.patient_number}</p>
              <p className="text-sm">{patient.name}</p>
              <p className="text-xs text-slate-600">Bed: {patient.bed_number}</p>
              <p className="text-xs">{priorityDot[patient.priority]}</p>
            </Link>
          ))}
        </div>
      </section>
    </CanDo>
  );
}
