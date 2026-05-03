# OS

Mobile-first Hospital Operating System built with Next.js + Supabase.

## Phase 1 Foundation Includes

- Supabase SQL migration for users, departments, permissions, user-department mappings, and audit logs
- Staff login screen with 10-digit ID + 6-digit PIN keypad
- First-login PIN reset flow
- Mobile app shell with bottom navigation
- Admin users management: create, activate/deactivate, and Excel bulk import
- Admin departments management: create departments and assign permissions
- Permission system utilities: `permissions` helper, `usePermissions` hook, and `CanDo` component
- Audit triggers for all user/department/permission relation changes

## Setup

1. Install dependencies:

```bash
npm install
```

2. Configure environment:

```bash
cp .env.example .env.local
```

Fill in `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`.

3. Run SQL migration in Supabase SQL editor:

- `supabase/migrations/202604271130_phase1_foundation.sql`

4. Start development server:

```bash
npm run dev
```

## Excel Bulk Import Format

The first worksheet should include columns:

- `staffId` (10 digits)
- `fullName`
- `pin` (6 digits)
- `departmentIds` (comma-separated UUIDs)

