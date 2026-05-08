import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

type Priority = "low" | "medium" | "high" | "critical";
type Status = "pending" | "in_progress" | "completed" | "cancelled";

const priorities = new Set(["low", "medium", "high", "critical"]);
const statuses = new Set(["pending", "in_progress", "completed", "cancelled"]);

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .map((tag) => String(tag).trim())
        .filter(Boolean)
        .slice(0, 30)
    )
  );
}

async function getUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function enrichTasks(tasks: Array<Record<string, unknown>>) {
  const staffIds = Array.from(
    new Set(
      tasks
        .flatMap((task) => [task.assignee_user_id, task.created_by_user_id])
        .filter(Boolean)
    )
  ) as string[];
  const solutionIds = Array.from(new Set(tasks.map((task) => task.framework_sop_id).filter(Boolean))) as string[];

  const [{ data: staff }, { data: solutions }] = await Promise.all([
    staffIds.length > 0
      ? adminClient.from("staff_users").select("id, full_name").in("id", staffIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string }> }),
    solutionIds.length > 0
      ? adminClient
          .from("sop")
          .select("id, title, kpi:kpi_id(title, kra:kra_id(title))")
          .in("id", solutionIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
  ]);

  const staffById = new Map((staff ?? []).map((row) => [row.id, row.full_name]));
  const solutionById = new Map((solutions ?? []).map((row) => [row.id, row]));

  return tasks.map((task) => ({
    ...task,
    assignee_name: task.assignee_user_id ? staffById.get(task.assignee_user_id as string) ?? null : null,
    creator_name: task.created_by_user_id ? staffById.get(task.created_by_user_id as string) ?? null : null,
    framework_solution: task.framework_sop_id ? solutionById.get(task.framework_sop_id as string) ?? null : null,
  }));
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await adminClient
    .from("tasks")
    .select("*")
    .or(`assignee_user_id.eq.${userId},created_by_user_id.eq.${userId}`)
    .order("due_at", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const tasks = await enrichTasks((data ?? []) as Array<Record<string, unknown>>);
  return NextResponse.json({ tasks });
}

export async function POST(req: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const assigneeUserId = typeof body.assigneeUserId === "string" ? body.assigneeUserId : "";
  const priority = priorities.has(String(body.priority)) ? (body.priority as Priority) : "medium";
  const status = statuses.has(String(body.status)) ? (body.status as Status) : "pending";
  const frameworkSopId = typeof body.frameworkSopId === "string" && body.frameworkSopId ? body.frameworkSopId : null;
  const patientId = typeof body.patientId === "string" && body.patientId ? body.patientId : null;

  if (!name) return NextResponse.json({ error: "Task name is required" }, { status: 400 });
  if (!assigneeUserId) return NextResponse.json({ error: "Assignee is required" }, { status: 400 });

  const { data: assignee } = await adminClient
    .from("staff_users")
    .select("id, is_active")
    .eq("id", assigneeUserId)
    .maybeSingle();
  if (!assignee?.is_active) return NextResponse.json({ error: "Assignee must be an active staff user" }, { status: 400 });

  let patientSnapshot: { patient_ipd_number: string | null; patient_bed_number: string | null; patient_id: string | null } = {
    patient_id: null,
    patient_ipd_number: null,
    patient_bed_number: null,
  };
  if (patientId) {
    const { data: patient } = await adminClient
      .from("patients")
      .select("id, patient_number, bed_number, is_active")
      .eq("id", patientId)
      .maybeSingle();
    if (!patient?.is_active) return NextResponse.json({ error: "Patient must be active" }, { status: 400 });
    patientSnapshot = {
      patient_id: patient.id,
      patient_ipd_number: patient.patient_number ?? null,
      patient_bed_number: patient.bed_number ?? null,
    };
  }

  const dueAt = typeof body.dueAt === "string" && body.dueAt ? new Date(body.dueAt) : null;
  if (dueAt && Number.isNaN(dueAt.getTime())) return NextResponse.json({ error: "Invalid due date" }, { status: 400 });

  const { data, error } = await adminClient
    .from("tasks")
    .insert({
      name,
      description: typeof body.description === "string" && body.description.trim() ? body.description.trim() : null,
      tags: normalizeTags(body.tags),
      framework_sop_id: frameworkSopId,
      ...patientSnapshot,
      assignee_user_id: assigneeUserId,
      created_by_user_id: userId,
      updated_by_user_id: userId,
      status,
      due_at: dueAt ? dueAt.toISOString() : null,
      priority,
    })
    .select("*")
    .single();

  if (error || !data) return NextResponse.json({ error: error?.message ?? "Failed to create task" }, { status: 400 });
  const [task] = await enrichTasks([data as Record<string, unknown>]);
  return NextResponse.json({ task });
}
