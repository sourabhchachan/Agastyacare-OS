import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

type LoginAttemptsRow = {
  staff_id: string;
  failed_count: number;
  locked_until: string | null;
};

function isLocked(row: LoginAttemptsRow | null): boolean {
  if (!row?.locked_until) return false;
  return new Date(row.locked_until).getTime() > Date.now();
}

export async function POST(req: Request) {
  const body = (await req.json()) as { staffId?: string; pin?: string };
  const staffId = body.staffId?.trim() ?? "";
  const pin = body.pin?.trim() ?? "";
  if (!/^\d{10}$/.test(staffId) || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 400 });
  }

  const { data: attemptRow } = await adminClient
    .from("login_attempts")
    .select("staff_id, failed_count, locked_until")
    .eq("staff_id", staffId)
    .maybeSingle();

  const attempts = (attemptRow as LoginAttemptsRow | null) ?? null;
  if (isLocked(attempts)) {
    return NextResponse.json(
      { error: "Too many failed attempts. Try again in 15 minutes." },
      { status: 429 }
    );
  }

  const { data: staffUser } = await adminClient
    .from("staff_users")
    .select("id, is_active")
    .eq("staff_id", staffId)
    .maybeSingle();
  if (!staffUser || !staffUser.is_active) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const conventionalEmail = `${staffId}@agastya-hos.local`;
  const { data: usersData } = await adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const matchedUser = usersData.users.find((user) => {
    const metaStaffId = String(user.user_metadata?.staffId ?? "");
    const emailPrefix = user.email?.split("@")[0] ?? "";
    return user.email === conventionalEmail || metaStaffId === staffId || emailPrefix === staffId;
  });
  const email = matchedUser?.email ?? conventionalEmail;

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: pin });

  if (signInError) {
    const failed = (attempts?.failed_count ?? 0) + 1;
    const lock =
      failed >= MAX_ATTEMPTS ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString() : null;
    await adminClient.from("login_attempts").upsert({
      staff_id: staffId,
      failed_count: failed,
      last_failed_at: new Date().toISOString(),
      locked_until: lock,
    });
    await adminClient.from("audit_logs").insert({
      actor_user_id: staffUser.id,
      event: "login_failed",
      table_name: "staff_users",
      record_id: staffUser.id,
      new_data: { failed_count: failed, locked_until: lock },
    });
    const msg =
      failed >= MAX_ATTEMPTS
        ? "Too many failed attempts. Try again in 15 minutes."
        : "Invalid credentials.";
    return NextResponse.json({ error: msg }, { status: failed >= MAX_ATTEMPTS ? 429 : 401 });
  }

  await adminClient
    .from("login_attempts")
    .upsert({ staff_id: staffId, failed_count: 0, locked_until: null, last_failed_at: null });
  await adminClient.from("audit_logs").insert({
    actor_user_id: staffUser.id,
    event: "login_success",
    table_name: "staff_users",
    record_id: staffUser.id,
    new_data: { at: new Date().toISOString() },
  });

  const { data: profile } = await adminClient
    .from("staff_users")
    .select("must_change_pin")
    .eq("id", staffUser.id)
    .maybeSingle();

  return NextResponse.json({ ok: true, mustChangePin: profile?.must_change_pin ?? false });
}
