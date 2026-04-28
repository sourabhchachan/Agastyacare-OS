import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/serverPermissions";

export async function GET() {
  const auth = await requirePermission("build_system");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { data, error } = await adminClient.from("vendors").select("id, name, category, contact").order("name");
  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({ vendors: data ?? [] });
}

export async function POST(req: Request) {
  const auth = await requirePermission("build_system");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json()) as { name?: string; category?: string; contact?: string };
  if (!body.name) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const { error } = await adminClient.from("vendors").insert({
    name: body.name,
    category: body.category ?? null,
    contact: body.contact ?? null,
  });

  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const auth = await requirePermission("build_system");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json()) as { id?: string; name?: string; category?: string; contact?: string };
  if (!body.id || !body.name) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const { error } = await adminClient
    .from("vendors")
    .update({ name: body.name, category: body.category ?? null, contact: body.contact ?? null })
    .eq("id", body.id);

  return error
    ? NextResponse.json({ error: error.message }, { status: 400 })
    : NextResponse.json({ ok: true });
}
