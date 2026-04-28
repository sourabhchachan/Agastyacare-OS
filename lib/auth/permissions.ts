export const PERMISSIONS = {
  ADMIN_USERS_VIEW: "admin.users.view",
  ADMIN_USERS_MANAGE: "admin.users.manage",
  ADMIN_USERS_BULK_IMPORT: "admin.users.bulk_import",
  ADMIN_DEPARTMENTS_VIEW: "admin.departments.view",
  ADMIN_DEPARTMENTS_MANAGE: "admin.departments.manage",
  BUILD_SYSTEM: "build_system",
  MANAGE_PATIENTS: "manage_patients",
  UPDATE_PATIENT_PRIORITY: "update_patient_priority",
  MANAGE_USERS: "manage_users",
  RAISE_ITEMS: "raise_items",
  ACCESS_FINANCIAL_DATA: "access_financial_data",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export const ADMIN_PERMISSIONS: PermissionCode[] = Object.values(PERMISSIONS);

export function hasPermission(
  userPermissions: string[] | null | undefined,
  permission: PermissionCode
) {
  return (userPermissions ?? []).includes(permission);
}
