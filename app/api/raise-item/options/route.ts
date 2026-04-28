import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/auth/serverPermissions";

export async function GET() {
  const auth = await requirePermission("raise_items");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const [{ data: patients }, { data: catalogueItems }] = await Promise.all([
    adminClient
      .from("patients")
      .select("id, name, patient_number, bed_number")
      .eq("is_active", true)
      .order("name"),
    adminClient
      .from("item_catalogue")
      .select("id, name, frequency, type")
      .eq("type", "triggered")
      .order("name"),
  ]);

  return NextResponse.json({ patients: patients ?? [], catalogueItems: catalogueItems ?? [] });
}
