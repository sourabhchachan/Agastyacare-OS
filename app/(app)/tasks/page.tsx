"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { TaskCard, type TaskPriority } from "@/components/TaskCard";

export const dynamic = "force-dynamic";

type Status = "all" | "pending" | "in_progress" | "completed" | "cancelled";
type SortMode = "priority" | "due";
type Task = {
  id: string;
  name: string;
  tags: string[];
  assignee_name: string | null;
  assignee_user_id: string;
  status: Exclude<Status, "all">;
  priority: TaskPriority;
  due_at: string | null;
  patient_ipd_number: string | null;
  patient_bed_number: string | null;
  framework_sop_id: string | null;
  framework_solution?: { title?: string } | null;
};

const priorityRank: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortMode>("priority");
  const [statusFilter, setStatusFilter] = useState<Status>("all");
  const [tagFilter, setTagFilter] = useState("");

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const response = await fetch("/api/tasks");
      const data = (await response.json()) as { tasks?: Task[]; error?: string };
      if (!response.ok) {
        setError(data.error ?? "Failed to load tasks");
        setLoading(false);
        return;
      }
      setTasks(data.tasks ?? []);
      setLoading(false);
    })();
  }, []);

  const visibleTasks = useMemo(() => {
    const tag = tagFilter.trim().toLowerCase();
    return [...tasks]
      .filter((task) => statusFilter === "all" || task.status === statusFilter)
      .filter((task) => !tag || task.tags.some((item) => item.toLowerCase().includes(tag)))
      .sort((a, b) => {
        if (sortBy === "priority") {
          const byPriority = priorityRank[a.priority] - priorityRank[b.priority];
          if (byPriority !== 0) return byPriority;
        }
        const aDue = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY;
        const bDue = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY;
        return aDue - bDue;
      });
  }, [tasks, statusFilter, tagFilter, sortBy]);

  return (
    <section className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#1B4F8A]">Tasks</h1>
          <p className="text-sm text-slate-600">Universal work list for clinical, operational, and admin tasks.</p>
        </div>
        <Link href="/tasks/new" className="rounded-xl bg-[#1B4F8A] px-3 py-2 text-xs font-semibold text-white">
          New
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortMode)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
          <option value="priority">Sort by priority</option>
          <option value="due">Sort by due date</option>
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as Status)} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">
          <option value="all">All statuses</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <input
        value={tagFilter}
        onChange={(event) => setTagFilter(event.target.value)}
        placeholder="Filter by tag"
        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
      />

      {error ? <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}

      <div className="space-y-3">
        {loading ? (
          [1, 2, 3].map((index) => <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-100" />)
        ) : visibleTasks.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">No tasks found.</p>
        ) : (
          visibleTasks.map((task) => (
            <TaskCard
              key={task.id}
              id={task.id}
              title={task.name}
              assigneeName={task.assignee_name}
              priority={task.priority}
              dueAt={task.due_at}
              status={task.status}
              tags={task.tags}
              patientLabel={
                task.patient_ipd_number || task.patient_bed_number
                  ? `${task.patient_ipd_number ?? "IPD"}${task.patient_bed_number ? `, bed ${task.patient_bed_number}` : ""}`
                  : null
              }
            />
          ))
        )}
      </div>
    </section>
  );
}
