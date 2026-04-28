import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdministrationUser } from "@/lib/auth/isAdministrationUser";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ isAdmin: false }, { status: 401 });
  }

  const { isAdmin, error } = await isAdministrationUser(user.id);
  if (error) {
    return NextResponse.json({ isAdmin: false, error: "Failed to verify admin access." }, { status: 500 });
  }

  return NextResponse.json({ isAdmin });
}
