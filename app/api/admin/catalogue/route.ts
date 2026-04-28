import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/serverPermissions";

export async function GET() {
  const auth = await requirePermission("build_system");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [{ data: items }, { data: departments }, { data: vendors }, { data: sops }, { data: checkpoints }] = await Promise.all([
    adminClient
      .from("item_catalogue")
      .select("id, name, type, frequency, frequency_time, frequency_day, ordering_dept_id, dispatching_dept_id, vendor_id, billing_flag, unit_cost, category, sop_id")
      .order("name"),
    adminClient.from("departments").select("id, name").order("name"),
    adminClient.from("vendors").select("id, name").order("name"),
    adminClient
      .from("sop")
      .select("id, title, kpi:kpi_id(title, kra:kra_id(title))")
      .order("title"),
    adminClient
      .from("item_checkpoint_definitions")
      .select("id, catalogue_item_id, step_number, dept_id, description")
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
  const checkpoints = (body.checkpoints as Array<{ dept_id: string; description: string }>) ?? [];

  if (!body.name || checkpoints.length < 1) {
    return NextResponse.json({ error: "Name and at least one checkpoint are required" }, { status: 400 });
  }

  const { data: item, error: itemError } = await adminClient
    .from("item_catalogue")
    .insert({
      name: body.name,
      type: body.type,
      frequency: body.frequency,
      frequency_time: body.frequency_time ?? null,
      frequency_day: body.frequency_day ?? null,
      ordering_dept_id: body.ordering_dept_id ?? null,
      dispatching_dept_id: body.dispatching_dept_id ?? null,
      vendor_id: body.vendor_id ?? null,
      billing_flag: body.billing_flag ?? false,
      unit_cost: body.unit_cost ?? 0,
      category: body.category ?? null,
      sop_id: body.sop_id ?? null,
    })
    .select("id")
    .single();

  if (itemError || !item) return NextResponse.json({ error: itemError?.message ?? "Failed to create item" }, { status: 400 });

  const checkpointRows = checkpoints.map((checkpoint, index) => ({
    catalogue_item_id: item.id,
    step_number: index + 1,
    dept_id: checkpoint.dept_id,
    description: checkpoint.description,
  }));

  const { error: checkpointError } = await adminClient.from("item_checkpoint_definitions").insert(checkpointRows);
  if (checkpointError) return NextResponse.json({ error: checkpointError.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const auth = await requirePermission("build_system");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json()) as Record<string, unknown>;
  const itemId = body.id as string;
  const checkpoints = (body.checkpoints as Array<{ dept_id: string; description: string }>) ?? [];

  if (!itemId || checkpoints.length < 1) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { error: itemError } = await adminClient
    .from("item_catalogue")
    .update({
      name: body.name,
      type: body.type,
      frequency: body.frequency,
      frequency_time: body.frequency_time ?? null,
      frequency_day: body.frequency_day ?? null,
      ordering_dept_id: body.ordering_dept_id ?? null,
      dispatching_dept_id: body.dispatching_dept_id ?? null,
      vendor_id: body.vendor_id ?? null,
      billing_flag: body.billing_flag ?? false,
      unit_cost: body.unit_cost ?? 0,
      category: body.category ?? null,
      sop_id: body.sop_id ?? null,
    })
    .eq("id", itemId);

  if (itemError) return NextResponse.json({ error: itemError.message }, { status: 400 });

  const { error: deleteError } = await adminClient
    .from("item_checkpoint_definitions")
    .delete()
    .eq("catalogue_item_id", itemId);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });

  const checkpointRows = checkpoints.map((checkpoint, index) => ({
    catalogue_item_id: itemId,
    step_number: index + 1,
    dept_id: checkpoint.dept_id,
    description: checkpoint.description,
  }));
  const { error: checkpointError } = await adminClient.from("item_checkpoint_definitions").insert(checkpointRows);
  if (checkpointError) return NextResponse.json({ error: checkpointError.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
