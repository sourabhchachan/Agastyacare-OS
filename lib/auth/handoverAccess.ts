import { requirePermission } from "@/lib/auth/serverPermissions";

/** Handover UI: operational admin (manage_users) or patient ops (manage_patients). */
export async function requireHandoverAccess() {
  const patients = await requirePermission("manage_patients");
  if (patients.ok) return patients;
  return requirePermission("manage_users");
}
