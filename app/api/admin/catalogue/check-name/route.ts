import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/serverPermissions";

export async function POST(req: Request) {
  const auth = await requirePermission("build_system");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const body = (await req.json()) as { name?: string; excludeId?: string };
  const name = body.name?.trim() ?? "";

  if (!name) return NextResponse.json({ exists: false });

  let query = adminClient.from("item_catalogue").select("id, name").ilike("name", name).limit(1);
  if (body.excludeId) query = query.neq("id", body.excludeId);

  const { data } = await query;
  const exists = Boolean(data && data.length > 0 && data[0].name.toLowerCase() === name.toLowerCase());
  return NextResponse.json({ exists });
}
