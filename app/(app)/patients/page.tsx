"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
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
};

const priorityDot: Record<string, string> = {
  critical: "🔴 Critical",
  moderate: "🟡 Moderate",
  stable: "🟢 Stable",
};

export default function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [search, setSearch] = useState("");
  const [filterPriority, setFilterPriority] = useState("all");

  const [showForm, setShowForm] = useState(false);
  const [patientNumber, setPatientNumber] = useState("");
  const [name, setName] = useState("");
  const [bedNumber, setBedNumber] = useState("");
  const [priority, setPriority] = useState<"critical" | "moderate" | "stable">("stable");
  const [admissionDate, setAdmissionDate] = useState(new Date().toISOString().slice(0, 10));
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [admittingDeptId, setAdmittingDeptId] = useState("");

  const loadPatients = async () => {
    const response = await fetch("/api/patients");
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

  const filteredPatients = useMemo(() => {
    return patients.filter((patient) => {
      const q = search.toLowerCase();
      const matchQuery = patient.name.toLowerCase().includes(q) || patient.patient_number.toLowerCase().includes(q);
      const matchPriority = filterPriority === "all" || patient.priority === filterPriority;
      return matchQuery && matchPriority;
    });
  }, [patients, search, filterPriority]);

  const admitPatient = async () => {
    await fetch("/api/patients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patient_number: patientNumber,
        name,
        bed_number: bedNumber,
        priority,
        admission_date: admissionDate,
        admitting_dept_id: admittingDeptId || undefined,
      }),
    });
    setShowForm(false);
    setPatientNumber("");
    setName("");
    setBedNumber("");
    setPriority("stable");
    setAdmissionDate(new Date().toISOString().slice(0, 10));
    setAdmittingDeptId("");
    await loadPatients();
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
            <input value={bedNumber} onChange={(e) => setBedNumber(e.target.value)} placeholder="Bed Number" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
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
            <button type="button" onClick={() => void admitPatient()} className="w-full rounded-lg bg-[#1B4F8A] px-3 py-2 text-sm font-semibold text-white">Save Admission</button>
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
