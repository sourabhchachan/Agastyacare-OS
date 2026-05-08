import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

type Priority = "low" | "medium" | "high" | "critical";
type Status = "pending" | "in_progress" | "completed" | "cancelled";

const priorities = new Set(["low", "medium", "high", "critical"]);
const statuses = new Set(["pending", "in_progress", "completed", "cancelled"]);

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 30)));
}

async function getUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function loadTask(id: string) {
  const { data, error } = await adminClient.from("tasks").select("*").eq("id", id).single();
  if (error || !data) return null;
  return data as Record<string, unknown>;
}

function canView(task: Record<string, unknown>, userId: string) {
  return task.created_by_user_id === userId || task.assignee_user_id === userId;
}

async function enrichTask(task: Record<string, unknown>) {
  const staffIds = Array.from(new Set([task.assignee_user_id, task.created_by_user_id, task.updated_by_user_id].filter(Boolean))) as string[];
  const [{ data: staff }, { data: solution }] = await Promise.all([
    staffIds.length > 0
      ? adminClient.from("staff_users").select("id, full_name").in("id", staffIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string }> }),
    task.framework_sop_id
      ? adminClient
          .from("sop")
          .select("id, title, kpi:kpi_id(title, kra:kra_id(title))")
          .eq("id", task.framework_sop_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const staffById = new Map((staff ?? []).map((row) => [row.id, row.full_name]));
  return {
    ...task,
    assignee_name: task.assignee_user_id ? staffById.get(task.assignee_user_id as string) ?? null : null,
    creator_name: task.created_by_user_id ? staffById.get(task.created_by_user_id as string) ?? null : null,
    updated_by_name: task.updated_by_user_id ? staffById.get(task.updated_by_user_id as string) ?? null : null,
    framework_solution: solution ?? null,
  };
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const task = await loadTask(params.id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canView(task, userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json({
    task: {
      ...(await enrichTask(task)),
      can_edit: task.created_by_user_id === userId,
    },
  });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const task = await loadTask(params.id);
  if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canView(task, userId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as Record<string, unknown>;
  const isCreator = task.created_by_user_id === userId;
  const patch: Record<string, unknown> = {
    updated_by_user_id: userId,
    updated_at: new Date().toISOString(),
  };

  if (statuses.has(String(body.status))) patch.status = body.status as Status;

  if (isCreator) {
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) return NextResponse.json({ error: "Task name is required" }, { status: 400 });
      patch.name = name;
    }
    if ("description" in body) {
      patch.description = typeof body.description === "string" && body.description.trim() ? body.description.trim() : null;
    }
    if ("tags" in body) patch.tags = normalizeTags(body.tags);
    if ("frameworkSopId" in body) {
      patch.framework_sop_id = typeof body.frameworkSopId === "string" && body.frameworkSopId ? body.frameworkSopId : null;
    }
    if ("patientId" in body) {
      const patientId = typeof body.patientId === "string" && body.patientId ? body.patientId : null;
      if (patientId) {
        const { data: patient } = await adminClient
          .from("patients")
          .select("id, patient_number, bed_number, is_active")
          .eq("id", patientId)
          .maybeSingle();
        if (!patient?.is_active) return NextResponse.json({ error: "Patient must be active" }, { status: 400 });
        patch.patient_id = patient.id;
        patch.patient_ipd_number = patient.patient_number ?? null;
        patch.patient_bed_number = patient.bed_number ?? null;
      } else {
        patch.patient_id = null;
        patch.patient_ipd_number = null;
        patch.patient_bed_number = null;
      }
    }
    if ("assigneeUserId" in body) {
      const assigneeUserId = typeof body.assigneeUserId === "string" ? body.assigneeUserId : "";
      const { data: assignee } = await adminClient
        .from("staff_users")
        .select("id, is_active")
        .eq("id", assigneeUserId)
        .maybeSingle();
      if (!assignee?.is_active) return NextResponse.json({ error: "Assignee must be an active staff user" }, { status: 400 });
      patch.assignee_user_id = assigneeUserId;
    }
    if ("dueAt" in body) {
      const dueAt = typeof body.dueAt === "string" && body.dueAt ? new Date(body.dueAt) : null;
      if (dueAt && Number.isNaN(dueAt.getTime())) return NextResponse.json({ error: "Invalid due date" }, { status: 400 });
      patch.due_at = dueAt ? dueAt.toISOString() : null;
    }
    if (priorities.has(String(body.priority))) patch.priority = body.priority as Priority;
  } else {
    const allowedKeys = new Set(["status"]);
    const attemptedCreatorOnlyChange = Object.keys(body).some((key) => !allowedKeys.has(key));
    if (attemptedCreatorOnlyChange) {
      return NextResponse.json({ error: "Only the creator can edit or reassign this task" }, { status: 403 });
    }
  }

  const { data, error } = await adminClient.from("tasks").update(patch).eq("id", params.id).select("*").single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Failed to update task" }, { status: 400 });
  return NextResponse.json({
    task: {
      ...(await enrichTask(data as Record<string, unknown>)),
      can_edit: data.created_by_user_id === userId,
    },
  });
}
