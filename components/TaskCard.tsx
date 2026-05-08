import Link from "next/link";

export type TaskPriority = "low" | "medium" | "high" | "critical";

type TaskCardProps = {
  id: string;
  title: string;
  assigneeName?: string | null;
  priority: TaskPriority;
  dueAt?: string | null;
  status: string;
  tags?: string[];
  patientLabel?: string | null;
  href?: string;
};

const priorityStyles: Record<TaskPriority, string> = {
  low: "bg-slate-100 text-slate-700 border-slate-200",
  medium: "bg-blue-50 text-blue-700 border-blue-200",
  high: "bg-amber-50 text-amber-800 border-amber-200",
  critical: "bg-red-50 text-red-700 border-red-200",
};

function initials(name?: string | null) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatStatus(status: string) {
  return status.replaceAll("_", " ");
}

export function TaskCard({ id, title, assigneeName, priority, dueAt, status, tags = [], patientLabel, href }: TaskCardProps) {
  const due = dueAt ? new Date(dueAt) : null;
  const isActive = status === "pending" || status === "in_progress";
  const overdue = Boolean(isActive && due && due.getTime() < Date.now());

  return (
    <Link
      href={href ?? `/tasks/${id}`}
      className={`block rounded-2xl border bg-white p-3 shadow-sm transition active:bg-slate-50 ${
        overdue ? "border-red-200 ring-1 ring-red-100" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-950">{title}</p>
          {patientLabel ? <p className="mt-0.5 truncate text-xs text-slate-600">Patient: {patientLabel}</p> : null}
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#1B4F8A] text-xs font-bold text-white">
          {initials(assigneeName)}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full border px-2 py-1 text-xs font-semibold capitalize ${priorityStyles[priority]}`}>
          {priority}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium capitalize text-slate-700">
          {formatStatus(status)}
        </span>
        {due ? (
          <span className={`text-xs font-medium ${overdue ? "text-red-700" : "text-slate-500"}`}>
            {overdue ? "Overdue: " : "Due: "}
            {due.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}
          </span>
        ) : null}
      </div>

      {tags.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {tags.slice(0, 5).map((tag) => (
            <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              #{tag}
            </span>
          ))}
        </div>
      ) : null}
    </Link>
  );
}
