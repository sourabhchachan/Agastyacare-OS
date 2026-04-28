import Link from "next/link";
import { requirePermission } from "@/lib/auth/serverPermissions";
import { PERMISSIONS } from "@/lib/auth/permissions";

export default async function BillingLayout({ children }: { children: React.ReactNode }) {
  const g = await requirePermission(PERMISSIONS.ACCESS_FINANCIAL_DATA);
  if (!g.ok) {
    return (
      <div className="p-4 text-center text-slate-700">
        <p className="font-semibold">Access denied</p>
        <p className="mt-2 text-sm">You do not have permission to view billing data.</p>
        <Link href="/admin/users" className="mt-4 inline-block text-sm text-[#1B4F8A]">
          Back to admin
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
