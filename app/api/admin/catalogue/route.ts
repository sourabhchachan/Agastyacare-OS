import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/serverPermissions";

type CheckpointInput = {
  dept_id: string;
  department_id?: string | null;
  description: string;
  assignment_type?: string;
  assigned_user_id?: string | null;
  is_recurring?: boolean;
  recurrence_frequency?: string | null;
  recurrence_end_date?: string | null;
  due_offset_minutes?: number;
};

async function validateCheckpointAssignments(checkpoints: CheckpointInput[]) {
  for (let i = 0; i < checkpoints.length; i++) {
    const cp = checkpoints[i];
    const assignmentType = cp.assignment_type === "specific_user" ? "specific_user" : "department_pool";
    if (assignmentType === "specific_user") {
      const uid = cp.assigned_user_id?.trim();
      if (!uid) {
        return `Sub-task ${i + 1}: choose a staff member for specific-user assignment.`;
      }
      const { data: map } = await adminClient
        .from("user_departments")
        .select("user_id")
        .eq("user_id", uid)
        .eq("department_id", cp.dept_id)
        .maybeSingle();
      if (!map) {
        return `Sub-task ${i + 1}: the selected user must belong to the responsible department.`;
      }
    }
  }
  return null;
}

export async function GET() {
  const auth = await requirePermission("build_system");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [{ data: items }, { data: departments }, { data: vendors }, { data: sops }, { data: checkpoints }] = await Promise.all([
    adminClient
      .from("item_catalogue")
      .select(
        "id, name, is_active, requires_patient, ordering_dept_id, dispatching_dept_id, vendor_id, billing_flag, unit_cost, sop_id"
      )
      .order("name"),
    adminClient.from("departments").select("id, name").order("name"),
    adminClient.from("vendors").select("id, name").order("name"),
    adminClient
      .from("sop")
      .select("id, title, kpi:kpi_id(title, kra:kra_id(title))")
      .order("title"),
    adminClient
      .from("item_checkpoint_definitions")
      .select("id, catalogue_item_id, step_number, dept_id, description, assignment_type, assigned_user_id")
      .order("step_number"),
  ]);

  return NextResponse.json({
    items: items ?? [],
    departments: departments ?? [],
    vendors: vendors ?? [],
    sops: sops ?? [],
    checkpoints: checkpoints ?? [],
  });
}

export async function POST(req: Request) {
  const auth = await requirePermission("build_system");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json()) as Record<string, unknown>;
  const checkpoints = (body.checkpoints as CheckpointInput[]) ?? [];
  const requiresPatient = body.requires_patient === undefined ? true : Boolean(body.requires_patient);

  if (!body.name || checkpoints.length < 1) {
    return NextResponse.json({ error: "Name and at least one sub-task are required" }, { status: 400 });
  }
  const assignErr = await validateCheckpointAssignments(checkpoints);
  if (assignErr) return NextResponse.json({ error: assignErr }, { status: 400 });
  const { data: item, error: itemError } = await adminClient
    .from("item_catalogue")
    .insert({
      name: body.name,
      requires_patient: requiresPatient,
      is_active: true,
      ordering_dept_id: body.ordering_dept_id ?? null,
      dispatching_dept_id: body.dispatching_dept_id ?? null,
      vendor_id: body.vendor_id ?? null,
      billing_flag: body.billing_flag ?? false,
      unit_cost: body.unit_cost ?? 0,
      sop_id: body.sop_id ?? null,
    })
    .select("id")
    .single();

  if (itemError || !item) return NextResponse.json({ error: itemError?.message ?? "Failed to create item" }, { status: 400 });

  const checkpointRows = checkpoints.map((checkpoint, index) => {
    const assignmentType = checkpoint.assignment_type === "specific_user" ? "specific_user" : "department_pool";
    return {
      catalogue_item_id: item.id,
      step_number: index + 1,
      dept_id: checkpoint.dept_id,
      description: checkpoint.description,
      assignment_type: assignmentType,
      assigned_user_id: assignmentType === "specific_user" ? checkpoint.assigned_user_id!.trim() : null,
    };
  });

  const { error: checkpointError } = await adminClient.from("item_checkpoint_definitions").insert(checkpointRows);
  if (checkpointError) return NextResponse.json({ error: checkpointError.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const auth = await requirePermission("build_system");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json()) as Record<string, unknown>;
  const itemId = body.id as string;
  const checkpoints = (body.checkpoints as CheckpointInput[]) ?? [];
  const requiresPatient = body.requires_patient === undefined ? true : Boolean(body.requires_patient);
  if (body.action === "set_active") {
    const { error: activeError } = await adminClient
      .from("item_catalogue")
      .update({ is_active: Boolean(body.is_active) })
      .eq("id", itemId);
    if (activeError) return NextResponse.json({ error: activeError.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (!itemId || checkpoints.length < 1) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const assignErr = await validateCheckpointAssignments(checkpoints);
  if (assignErr) return NextResponse.json({ error: assignErr }, { status: 400 });

  const { error: itemError } = await adminClient
    .from("item_catalogue")
    .update({
      name: body.name,
      requires_patient: requiresPatient,
      ordering_dept_id: body.ordering_dept_id ?? null,
      dispatching_dept_id: body.dispatching_dept_id ?? null,
      vendor_id: body.vendor_id ?? null,
      billing_flag: body.billing_flag ?? false,
      unit_cost: body.unit_cost ?? 0,
      sop_id: body.sop_id ?? null,
    })
    .eq("id", itemId);

  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 400 });

  const { error: deleteError } = await adminClient
    .from("item_checkpoint_definitions")
    .delete()
    .eq("catalogue_item_id", itemId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });

  const checkpointRows = checkpoints.map((checkpoint, index) => {
    const assignmentType = checkpoint.assignment_type === "specific_user" ? "specific_user" : "department_pool";
    return {
      catalogue_item_id: itemId,
      step_number: index + 1,
      dept_id: checkpoint.dept_id,
      description: checkpoint.description,
      assignment_type: assignmentType,
      assigned_user_id: assignmentType === "specific_user" ? checkpoint.assigned_user_id!.trim() : null,
    };
  });
  const { error: checkpointError } = await adminClient.from("item_checkpoint_definitions").insert(checkpointRows);
  if (checkpointError) return NextResponse.json({ error: checkpointError.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
