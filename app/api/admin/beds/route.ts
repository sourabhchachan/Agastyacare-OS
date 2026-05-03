import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/serverPermissions";

export async function GET() {
  const auth = await requirePermission("manage_users");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [{ data: beds }, { data: occupiedRows }] = await Promise.all([
    adminClient.from("beds").select("id, name, ward, is_active, created_at").order("name", { ascending: true }),
    adminClient.from("patients").select("bed_id").eq("is_active", true).not("bed_id", "is", null),
  ]);

  const occupied = new Set(
    (occupiedRows ?? []).map((r) => r.bed_id).filter((id): id is string => typeof id === "string" && id.length > 0)
  );

  const list = (beds ?? []).map((b) => ({
    ...b,
    status: !b.is_active ? "Inactive" : occupied.has(b.id) ? "Occupied" : "Available",
  }));

  return NextResponse.json({ beds: list });
}

export async function POST(req: Request) {
  const auth = await requirePermission("manage_users");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json()) as { name?: string; ward?: string | null };
  const name = body.name?.trim() ?? "";
  if (!name) {
    return NextResponse.json({ error: "Bed name is required" }, { status: 400 });
  }

  const ward = body.ward?.trim() || null;
  const { data, error } = await adminClient
    .from("beds")
    .insert({ name, ward, is_active: true })
    .select("id, name, ward, is_active, created_at")
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A bed with this name already exists." }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, bed: { ...data, status: "Available" } });
}

export async function PATCH(req: Request) {
  const auth = await requirePermission("manage_users");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json()) as { id?: string; is_active?: boolean };
  if (!body.id || typeof body.is_active !== "boolean") {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  if (body.is_active === false) {
    const { data: occ } = await adminClient
      .from("patients")
      .select("id")
      .eq("bed_id", body.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (occ) {
      return NextResponse.json({ error: "Cannot deactivate a bed that is currently occupied." }, { status: 400 });
    }
  }

  const { error } = await adminClient.from("beds").update({ is_active: body.is_active }).eq("id", body.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
