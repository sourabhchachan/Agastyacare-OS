import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const body = (await req.json()) as { staffId?: string };
  const staffId = body.staffId?.trim() ?? "";

  if (!/^\d{10}$/.test(staffId)) {
    return NextResponse.json({ error: "Invalid staff ID." }, { status: 400 });
  }

  const { data: staffUser, error: staffError } = await adminClient
    .from("staff_users")
    .select("id, is_active")
    .eq("staff_id", staffId)
    .maybeSingle();

  if (staffError) {
    console.error("staff-lookup: failed to read staff_users", staffError);
  }

  if (staffUser && !staffUser.is_active) {
    return NextResponse.json({ error: "User is inactive." }, { status: 403 });
  }

  const conventionalEmail = `${staffId}@agastya-hos.local`;
  let email: string | null = conventionalEmail;

  // Validate that this staff ID maps to an auth user, but do not hard-fail on linkage mismatches.
  const { data: usersData, error: usersError } = await adminClient.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });

  if (!usersError) {
    const matchedUser = usersData.users.find((user) => {
      const metaStaffId = String(user.user_metadata?.staffId ?? "");
      const emailPrefix = user.email?.split("@")[0] ?? "";
      return user.email === conventionalEmail || metaStaffId === staffId || emailPrefix === staffId;
    });

    if (matchedUser?.email) {
      email = matchedUser.email;
    }
  } else {
    console.error("staff-lookup: failed to list auth users", usersError);
  }

  if (!email) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  return NextResponse.json({ email });
}
