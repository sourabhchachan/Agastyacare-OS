import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/serverPermissions";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { adminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function hhmm(createdAt: string) {
  const d = new Date(createdAt);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}${m}`;
}

export async function GET(req: Request) {
  const gate = await requirePermission(PERMISSIONS.BUILD_SYSTEM);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") || "1"));
  const pageSize = 50;
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const entity = url.searchParams.get("entity");
  const actor = url.searchParams.get("actor");

  let q = adminClient
    .from("audit_logs")
    .select("id, created_at, event, table_name, record_id, actor_user_id, old_data, new_data", {
      count: "exact",
    })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (from) q = q.gte("created_at", `${from}T00:00:00`);
  if (to) q = q.lte("created_at", `${to}T23:59:59`);
  if (entity) q = q.eq("table_name", entity);
  if (actor) q = q.eq("actor_user_id", actor);

  const { data, error, count } = await q;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const actorIds = Array.from(new Set((data ?? []).map((r) => r.actor_user_id).filter(Boolean)));
  const { data: users } =
    actorIds.length > 0
      ? await adminClient.from("staff_users").select("id, full_name").in("id", actorIds)
      : { data: [] };
  const userBy = new Map((users ?? []).map((u) => [u.id, u.full_name]));

  const rows = (data ?? []).map((r) => ({
    id: r.id,
    date: r.created_at.slice(0, 10),
    time: hhmm(r.created_at),
    action: r.event,
    entity_type: r.table_name,
    entity_id: r.record_id ?? "",
    actor: r.actor_user_id ? userBy.get(r.actor_user_id) ?? "Unknown" : "System",
    old_value: r.old_data,
    new_value: r.new_data,
  }));

  return NextResponse.json({
    rows,
    page,
    pageSize,
    total: count ?? 0,
  });
}
