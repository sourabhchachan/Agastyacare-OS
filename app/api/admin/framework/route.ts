import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/serverPermissions";

type EntityType = "kra" | "kpi" | "sop";

export async function GET() {
  const auth = await requirePermission("build_system");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [{ data: kras }, { data: kpis }, { data: sops }] = await Promise.all([
    adminClient.from("kra").select("id, title, description, is_active").order("created_at"),
    adminClient.from("kpi").select("id, title, measurement_unit, kra_id, is_active").order("created_at"),
    adminClient.from("sop").select("id, title, description, kpi_id, is_active").order("created_at"),
  ]);

  return NextResponse.json({ kras: kras ?? [], kpis: kpis ?? [], sops: sops ?? [] });
}

export async function POST(req: Request) {
  const auth = await requirePermission("build_system");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json()) as Record<string, unknown>;
  const type = body.type as EntityType;

  if (type === "kra") {
    const { error } = await adminClient
      .from("kra")
      .insert({ title: body.title, description: body.description ?? null, is_active: true });
    return error
      ? NextResponse.json({ error: error.message }, { status: 400 })
      : NextResponse.json({ ok: true });
  }

  if (type === "kpi") {
    const { error } = await adminClient.from("kpi").insert({
      title: body.title,
      measurement_unit: body.measurementUnit ?? null,
      kra_id: body.kraId,
      is_active: true,
    });
    return error
      ? NextResponse.json({ error: error.message }, { status: 400 })
      : NextResponse.json({ ok: true });
  }

  if (type === "sop") {
    const { error } = await adminClient.from("sop").insert({
      title: body.title,
      description: body.description ?? null,
      kpi_id: body.kpiId,
      is_active: true,
    });
    return error
      ? NextResponse.json({ error: error.message }, { status: 400 })
      : NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}

export async function PATCH(req: Request) {
  const auth = await requirePermission("build_system");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json()) as Record<string, unknown>;
  const type = body.type as EntityType;
  if (body.action === "set_active") {
    const id = body.id as string;
    const isActive = Boolean(body.is_active);
    if (type === "kra") {
      const { error } = await adminClient.from("kra").update({ is_active: isActive }).eq("id", id);
      return error
        ? NextResponse.json({ error: error.message }, { status: 400 })
        : NextResponse.json({ ok: true });
    }
    if (type === "kpi") {
      const { error } = await adminClient.from("kpi").update({ is_active: isActive }).eq("id", id);
      return error
        ? NextResponse.json({ error: error.message }, { status: 400 })
        : NextResponse.json({ ok: true });
    }
    if (type === "sop") {
      const { error } = await adminClient.from("sop").update({ is_active: isActive }).eq("id", id);
      return error
        ? NextResponse.json({ error: error.message }, { status: 400 })
        : NextResponse.json({ ok: true });
    }
  }

  if (type === "kra") {
    const { error } = await adminClient
      .from("kra")
      .update({ title: body.title, description: body.description ?? null })
      .eq("id", body.id as string);
    return error
      ? NextResponse.json({ error: error.message }, { status: 400 })
      : NextResponse.json({ ok: true });
  }

  if (type === "kpi") {
    const { error } = await adminClient
      .from("kpi")
      .update({ title: body.title, measurement_unit: body.measurementUnit ?? null })
      .eq("id", body.id as string);
    return error
      ? NextResponse.json({ error: error.message }, { status: 400 })
      : NextResponse.json({ ok: true });
  }

  if (type === "sop") {
    const { error } = await adminClient
      .from("sop")
      .update({ title: body.title, description: body.description ?? null })
      .eq("id", body.id as string);
    return error
      ? NextResponse.json({ error: error.message }, { status: 400 })
      : NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid type" }, { status: 400 });
}
