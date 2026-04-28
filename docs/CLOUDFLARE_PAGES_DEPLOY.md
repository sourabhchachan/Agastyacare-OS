# Cloudflare Pages Deployment (Phase 6)

## 1) Push to GitHub

```bash
git add .
git commit -m "phase6: pwa, audit, profile, shift summary, security hardening"
git push origin <your-branch>
```

## 2) Create Pages project

1. Open Cloudflare Dashboard -> Pages -> Create project.
2. Connect your GitHub repo and select the branch.
3. Framework preset: **Next.js**.

## 3) Build settings

- Build command: `npm run build`
- Build output directory: `.next`

## 4) Environment variables

Set these in Cloudflare Pages (Production + Preview):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## 5) Custom domain (optional)

1. Pages project -> Custom domains.
2. Add your domain/subdomain.
3. Follow DNS verification prompts.

## 6) Post-deploy verification

- Open deployed URL on Android Chrome:
  - Check "Add to Home Screen" and install.
- Open on iPhone Safari:
  - Share -> Add to Home Screen.
- Verify:
  - Queue loads online.
  - Turn on airplane mode and reopen app: cached queue view appears.
  - Perform an action offline, reconnect, and verify sync.
