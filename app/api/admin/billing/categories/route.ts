import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/serverPermissions";
import { PERMISSIONS } from "@/lib/auth/permissions";

export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requirePermission(PERMISSIONS.ACCESS_FINANCIAL_DATA);
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  return NextResponse.json({ categories: [] as string[] });
}
