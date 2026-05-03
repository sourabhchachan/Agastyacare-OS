import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const body = (await req.json()) as { pin?: string; confirmPin?: string };
  const pin = body.pin?.trim() ?? "";
  const confirmPin = body.confirmPin?.trim() ?? "";

  if (!/^\d{6}$/.test(pin) || !/^\d{6}$/.test(confirmPin)) {
    return NextResponse.json({ error: "PIN must be exactly 6 digits." }, { status: 400 });
  }
  if (pin !== confirmPin) {
    return NextResponse.json({ error: "PINs do not match." }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Session expired. Please log in again." }, { status: 401 });
  }

  const sessionUserId = user.id;
  const sessionEmail = user.email ?? "";
  const sessionMetaStaffId = String(user.user_metadata?.staffId ?? "");
  const sessionEmailPrefix = sessionEmail.split("@")[0] ?? "";

  let staffProfile: { id: string; staff_id: string } | null = null;

  const { data: byId, error: byIdError } = await adminClient
    .from("staff_users")
    .select("id, staff_id")
    .eq("id", sessionUserId)
    .maybeSingle();

  if (byIdError) {
    console.error("change-pin: staff_users lookup by id failed", {
      sessionUserId,
      error: byIdError,
    });
  }
  staffProfile = byId ?? null;

  if (!staffProfile) {
    const fallbackStaffId = sessionMetaStaffId || (/^\d{10}$/.test(sessionEmailPrefix) ? sessionEmailPrefix : "");
    if (fallbackStaffId) {
      const { data: byStaffId, error: byStaffIdError } = await adminClient
        .from("staff_users")
        .select("id, staff_id")
        .eq("staff_id", fallbackStaffId)
        .maybeSingle();
      if (byStaffIdError) {
        console.error("change-pin: staff_users lookup by staff_id failed", {
          sessionUserId,
          fallbackStaffId,
          error: byStaffIdError,
        });
      }
      staffProfile = byStaffId ?? null;
    }
  }

  if (!staffProfile) {
    console.error("change-pin: no matching staff_users row", {
      sessionUserId,
      sessionEmail,
      sessionMetaStaffId,
    });
    return NextResponse.json({ error: "No staff profile found for this session user." }, { status: 400 });
  }

  // Password hashing is handled by Supabase Auth (GoTrue); update and sign-in both use the same verifier.
  const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(sessionUserId, {
    password: pin,
  });
  if (updateAuthError) {
    console.error("change-pin: auth password update failed", {
      sessionUserId,
      staffUserId: staffProfile.id,
      staffId: staffProfile.staff_id,
      error: updateAuthError,
    });
    return NextResponse.json({ error: updateAuthError.message }, { status: 400 });
  }

  const { data: updatedRows, error: profileError } = await adminClient
    .from("staff_users")
    .update({ must_change_pin: false })
    .eq("id", staffProfile.id)
    .select("id, staff_id")
    .limit(1);

  if (profileError) {
    console.error("change-pin: staff_users update failed", {
      sessionUserId,
      staffUserId: staffProfile.id,
      staffId: staffProfile.staff_id,
      error: profileError,
    });
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }
  if (!updatedRows || updatedRows.length !== 1) {
    console.error("change-pin: staff_users update affected unexpected rows", {
      sessionUserId,
      staffUserId: staffProfile.id,
      staffId: staffProfile.staff_id,
      updatedRowCount: updatedRows?.length ?? 0,
    });
    return NextResponse.json({ error: "Failed to update profile row for this user." }, { status: 400 });
  }

  const staffId = updatedRows[0]?.staff_id;
  if (staffId) {
    await adminClient
      .from("login_attempts")
      .upsert({ staff_id: staffId, failed_count: 0, locked_until: null, last_failed_at: null });
  }

  return NextResponse.json({ ok: true });
}
