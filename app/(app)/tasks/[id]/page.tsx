"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { TaskPriority } from "@/components/TaskCard";
import { humanizeResponseError } from "@/lib/feedback/humanizeError";
import { UserFacingError } from "@/lib/feedback/userFacingError";
import { useAsyncAction } from "@/lib/feedback/useAsyncAction";

export const dynamic = "force-dynamic";

type TaskStatus = "pending" | "in_progress" | "completed" | "cancelled";
type StaffOption = { id: string; full_name: string; is_active: boolean };
type PatientOption = { id: string; name: string; patient_number: string; bed_number: string };
type SolutionOption = { id: string; title: string; kpi?: { title?: string; kra?: { title?: string } } };
type Task = {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  patient_id: string | null;
  framework_sop_id: string | null;
  assignee_user_id: string;
  patient_ipd_number: string | null;
  patient_bed_number: string | null;
  assignee_name: string | null;
  creator_name: string | null;
  can_edit: boolean;
  framework_solution?: { title?: string; kpi?: { title?: string; kra?: { title?: string } } } | null;
};

const statusOptions: TaskStatus[] = ["pending", "in_progress", "completed", "cancelled"];
const priorityClass: Record<TaskPriority, string> = {
  low: "border-slate-200 bg-slate-50 text-slate-700",
  medium: "border-blue-200 bg-blue-50 text-blue-700",
  high: "border-amber-200 bg-amber-50 text-amber-800",
  critical: "border-red-200 bg-red-50 text-red-700",
};

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const { run, isPending } = useAsyncAction();
  const [task, setTask] = useState<Task | null>(null);
  const [staffUsers, setStaffUsers] = useState<StaffOption[]>([]);
  const [patients, setPatients] = useState<PatientOption[]>([]);
  const [solutions, setSolutions] = useState<SolutionOption[]>([]);
  const [status, setStatus] = useState<TaskStatus>("pending");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editTags, setEditTags] = useState("");
  const [editAssignee, setEditAssignee] = useState("");
  const [editPatient, setEditPatient] = useState("");
  const [editSolution, setEditSolution] = useState("");
  const [editDueAt, setEditDueAt] = useState("");
  const [editPriority, setEditPriority] = useState<TaskPriority>("medium");
  const [error, setError] = useState<string | null>(null);

  const loadTask = useCallback(async () => {
    const response = await fetch(`/api/tasks/${params.id}`);
    const data = (await response.json()) as { task?: Task; error?: string };
    if (!response.ok) {
      setError(data.error ?? "Failed to load task");
      return;
    }
    setTask(data.task ?? null);
    setStatus(data.task?.status ?? "pending");
    setEditName(data.task?.name ?? "");
    setEditDescription(data.task?.description ?? "");
    setEditTags((data.task?.tags ?? []).join(", "));
    setEditAssignee(data.task?.assignee_user_id ?? "");
    setEditPatient(data.task?.patient_id ?? "");
    setEditSolution(data.task?.framework_sop_id ?? "");
    setEditDueAt(data.task?.due_at ? new Date(data.task.due_at).toISOString().slice(0, 16) : "");
    setEditPriority(data.task?.priority ?? "medium");
  }, [params.id]);

  useEffect(() => {
    void loadTask();
  }, [loadTask]);

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
    })();
  }, []);

  const updateStatus = () => {
    void run(
      "task-status",
      async () => {
        const response = await fetch(`/api/tasks/${params.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (!response.ok) throw new UserFacingError(await humanizeResponseError(response));
        await loadTask();
      },
      { successMessage: "Status updated" }
    );
  };

  const saveEdits = () => {
    const tags = Array.from(new Set(editTags.split(",").map((tag) => tag.trim()).filter(Boolean)));
    void run(
      "task-edit",
      async () => {
        const response = await fetch(`/api/tasks/${params.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: editName,
            description: editDescription,
            tags,
            assigneeUserId: editAssignee,
            patientId: editPatient || null,
            frameworkSopId: editSolution || null,
            dueAt: editDueAt || null,
            priority: editPriority,
          }),
        });
        if (!response.ok) throw new UserFacingError(await humanizeResponseError(response));
        await loadTask();
      },
      { successMessage: "Task updated" }
    );
  };

  if (error) return <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>;
  if (!task) return <p className="text-sm text-slate-600">Loading...</p>;

  const frameworkLabel = task.framework_solution
    ? `${task.framework_solution.kpi?.kra?.title ? `${task.framework_solution.kpi.kra.title} > ` : ""}${
        task.framework_solution.kpi?.title ? `${task.framework_solution.kpi.title} > ` : ""
      }${task.framework_solution.title ?? "Solution"}`
    : null;

  return (
    <section className="space-y-4">
      <Link href="/tasks" className="text-xs text-[#1B4F8A]">Back to tasks</Link>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-950">{task.name}</h1>
            <p className="mt-1 text-sm text-slate-600">{task.description || "No description"}</p>
          </div>
          <span className={`rounded-full border px-2 py-1 text-xs font-semibold capitalize ${priorityClass[task.priority]}`}>
            {task.priority}
          </span>
        </div>

        <div className="mt-4 grid gap-2 text-sm text-slate-700">
          <p>Assignee: <span className="font-medium">{task.assignee_name ?? "Unknown"}</span></p>
          <p>Creator: <span className="font-medium">{task.creator_name ?? "Unknown"}</span></p>
          {task.due_at ? <p>Due: <span className="font-medium">{new Date(task.due_at).toLocaleString()}</span></p> : null}
          {task.patient_ipd_number || task.patient_bed_number ? (
            <p>Patient: <span className="font-medium">{task.patient_ipd_number ?? "IPD"}{task.patient_bed_number ? `, bed ${task.patient_bed_number}` : ""}</span></p>
          ) : null}
          {frameworkLabel ? <p>Framework: <span className="font-medium">{frameworkLabel}</span></p> : null}
        </div>

        {task.tags.length > 0 ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {task.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">#{tag}</span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <label className="block space-y-1 text-sm font-medium">
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-normal">
            {statusOptions.map((option) => (
              <option key={option} value={option}>{option.replace("_", " ")}</option>
            ))}
          </select>
        </label>
        <button type="button" onClick={updateStatus} disabled={isPending("task-status")} className="w-full rounded-xl bg-[#1B4F8A] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
          {isPending("task-status") ? "Saving..." : "Update status"}
        </button>
      </div>

      {task.can_edit ? (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-900">Edit task</h2>
          <input value={editName} onChange={(event) => setEditName(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} rows={3} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <input value={editTags} onChange={(event) => setEditTags(event.target.value)} placeholder="Tags separated by commas" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <select value={editAssignee} onChange={(event) => setEditAssignee(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
            <option value="">Select assignee</option>
            {staffUsers.map((staff) => (
              <option key={staff.id} value={staff.id}>{staff.full_name}</option>
            ))}
          </select>
          <select value={editPatient} onChange={(event) => setEditPatient(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
            <option value="">No patient link</option>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.id}>{patient.patient_number} - {patient.name} (bed {patient.bed_number})</option>
            ))}
          </select>
          <select value={editSolution} onChange={(event) => setEditSolution(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
            <option value="">No framework link</option>
            {solutions.map((solution) => (
              <option key={solution.id} value={solution.id}>
                {solution.kpi?.kra?.title ? `${solution.kpi.kra.title} > ` : ""}
                {solution.kpi?.title ? `${solution.kpi.title} > ` : ""}
                {solution.title}
              </option>
            ))}
          </select>
          <input type="datetime-local" value={editDueAt} onChange={(event) => setEditDueAt(event.target.value)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" />
          <select value={editPriority} onChange={(event) => setEditPriority(event.target.value as TaskPriority)} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <button type="button" onClick={saveEdits} disabled={isPending("task-edit")} className="w-full rounded-xl bg-[#1B4F8A] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">
            {isPending("task-edit") ? "Saving..." : "Save edits"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
