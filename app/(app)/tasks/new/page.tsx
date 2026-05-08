"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { TaskPriority } from "@/components/TaskCard";
import { humanizeResponseError } from "@/lib/feedback/humanizeError";
import { UserFacingError } from "@/lib/feedback/userFacingError";
import { useAsyncAction } from "@/lib/feedback/useAsyncAction";

export const dynamic = "force-dynamic";

type StaffOption = { id: string; full_name: string; is_active: boolean };
type PatientOption = { id: string; name: string; patient_number: string; bed_number: string };
type SolutionOption = { id: string; title: string; kpi?: { title?: string; kra?: { title?: string } } };

const priorityOptions: TaskPriority[] = ["low", "medium", "high", "critical"];
const statusOptions = ["pending", "in_progress", "completed", "cancelled"] as const;

export default function NewTaskPage() {
  const router = useRouter();
  const { run, isPending } = useAsyncAction();
  const [staffUsers, setStaffUsers] = useState<StaffOption[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [solutions, setSolutions] = useState<SolutionOption[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [frameworkSopId, setFrameworkSopId] = useState("");
  const [patientSearch, setPatientSearch] = useState("");
  const [patientId, setPatientId] = useState("");
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [status, setStatus] = useState<(typeof statusOptions)[number]>("pending");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/tasks/options");
      if (!response.ok) return;
      const data = (await response.json()) as {
        staffUsers: StaffOption[];
        patients: PatientOption[];
        solutions: SolutionOption[];
      };
      setStaffUsers(data.staffUsers ?? []);
      setPatients(data.patients ?? []);
      setSolutions(data.solutions ?? []);
      if (data.staffUsers?.[0]) setAssigneeUserId(data.staffUsers[0].id);
    })();
  }, []);

  const tags = useMemo(
    () =>
      Array.from(
        new Set(
          tagInput
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean)
        )
      ),
    [tagInput]
  );

  const filteredPatients = useMemo(() => {
    const query = patientSearch.trim().toLowerCase();
    if (!query) return patients;
    return patients.filter(
      (patient) =>
        patient.name.toLowerCase().includes(query) ||
        patient.patient_number.toLowerCase().includes(query) ||
        patient.bed_number.toLowerCase().includes(query)
    );
  }, [patientSearch, patients]);

  const createTask = () => {
    setError(null);
    if (!name.trim()) {
      setError("Task name is required.");
      return;
    }
    if (!assigneeUserId) {
      setError("Choose an assignee.");
      return;
    }

    void run(
      "task-create",
      async () => {
        const response = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description,
            tags,
            frameworkSopId: frameworkSopId || undefined,
            patientId: patientId || undefined,
            assigneeUserId,
            dueAt: dueAt || undefined,
            priority,
            status,
          }),
        });
        const data = (await response.json()) as { task?: { id: string } };
        if (!response.ok) throw new UserFacingError(await humanizeResponseError(response));
        router.push(`/tasks/${data.task?.id}`);
      },
      { successMessage: "Task created" }
    );
  };

  return (
    <section className="space-y-4">
      <Link href="/tasks" className="text-xs text-[#1B4F8A]">Back to tasks</Link>
      <div>
        <h1 className="text-xl font-semibold text-[#1B4F8A]">New Task</h1>
        <p className="text-sm text-slate-600">Create any clinical, operational, or administrative task.</p>
      </div>

      <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <label className="block space-y-1 text-sm font-medium">
          <span>Name</span>
          <input value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal" />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>Description</span>
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal" />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>Tags</span>
          <input value={tagInput} onChange={(event) => setTagInput(event.target.value)} placeholder="urgent, nursing, discharge" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal" />
          <span className="text-xs font-normal text-slate-500">Separate tags with commas.</span>
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>Framework link (optional)</span>
          <select value={frameworkSopId} onChange={(event) => setFrameworkSopId(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal">
            <option value="">No framework link</option>
            {solutions.map((solution) => (
              <option key={solution.id} value={solution.id}>
                {solution.kpi?.kra?.title ? `${solution.kpi.kra.title} > ` : ""}
                {solution.kpi?.title ? `${solution.kpi.title} > ` : ""}
                {solution.title}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>Patient link (optional)</span>
          <input value={patientSearch} onChange={(event) => setPatientSearch(event.target.value)} placeholder="Search IPD, name, or bed" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal" />
          <select value={patientId} onChange={(event) => setPatientId(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal">
            <option value="">No patient link</option>
            {filteredPatients.map((patient) => (
              <option key={patient.id} value={patient.id}>
                {patient.patient_number} - {patient.name} (bed {patient.bed_number})
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>Assignee</span>
          <select value={assigneeUserId} onChange={(event) => setAssigneeUserId(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal">
            <option value="">Select staff user</option>
            {staffUsers.map((staff) => (
              <option key={staff.id} value={staff.id}>
                {staff.full_name}
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-sm font-medium">
            <span>Due date/time</span>
            <input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal" />
          </label>
          <label className="block space-y-1 text-sm font-medium">
            <span>Status</span>
            <select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal">
              {statusOptions.map((option) => (
                <option key={option} value={option}>{option.replace("_", " ")}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="space-y-2">
          <p className="text-sm font-medium">Priority</p>
          <div className="grid grid-cols-2 gap-2">
            {priorityOptions.map((option) => (
              <button key={option} type="button" onClick={() => setPriority(option)} className={`rounded-xl border px-3 py-2 text-sm font-semibold capitalize ${priority === option ? "border-[#1B4F8A] ring-2 ring-[#1B4F8A]" : "border-slate-300"}`}>
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      <button type="button" onClick={createTask} disabled={isPending("task-create")} className="w-full rounded-2xl bg-[#1B4F8A] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
        {isPending("task-create") ? "Creating..." : "Create task"}
      </button>
    </section>
  );
}
