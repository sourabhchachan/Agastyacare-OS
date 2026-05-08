import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: staffUsers }, { data: patients }, { data: solutions }] = await Promise.all([
    adminClient.from("staff_users").select("id, full_name, is_active").eq("is_active", true).order("full_name"),
    adminClient
      .from("patients")
      .select("id, name, patient_number, bed_number")
      .eq("is_active", true)
      .order("name"),
    adminClient
      .from("sop")
      .select("id, title, kpi:kpi_id(title, kra:kra_id(title))")
      .eq("is_active", true)
      .order("title"),
  ]);

  return NextResponse.json({
    staffUsers: staffUsers ?? [],
    patients: patients ?? [],
    solutions: solutions ?? [],
  });
}
