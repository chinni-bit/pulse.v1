# Nestora Pulse v1

Multi-tenant SaaS inventory management for Nestora Brands.

**Status: Phase 1A complete — auth + dashboard live, admin-only accounts.**
Live: https://nestora-pulse-v1-phase1a.vercel.app
Full history of what shipped and why: [`docs/CHANGELOG.md`](docs/CHANGELOG.md)

## What's here

- Next.js 14 (Pages Router) + React 18 + TypeScript, Tailwind CSS
- Supabase (Postgres + Auth) — same project as the retired `nestora-pulse` planning repo
- Zustand for auth state (`src/store/authStore.ts`)
- Email/password login only. **No self-service signup** — Phase 1 accounts are
  created directly in Supabase by an admin (see `CREDENTIALS.md`, gitignored)
- Multi-tenant isolation is enforced at the **application level** (every query
  filters by `tenant_id`), not via RLS — RLS is off on all tables by design;
  see the Architecture Decisions section of the changelog before changing that

## Running it locally

```bash
npm install        # first time only
npm run dev
```

Open http://localhost:3000. Needs a `.env.local` (gitignored, already present
on this machine) with:

```
NEXT_PUBLIC_SUPABASE_URL=https://phqdybhzluznpsiblysg.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<from Supabase dashboard or Vercel env vars>
```

It talks to the **real Supabase project** — there's no separate local
database. Sample admin login is in `CREDENTIALS.md`.

Local dev is the fast path for debugging: no Vercel build/deploy cycle, and
the dev server hot-reloads on save.

## Deploying

Push to `main` → Vercel auto-deploys (project `nestora-pulse-v1-phase1a`,
team `nestora3`). Vercel's build cache has repeatedly served stale/broken
builds after a push (wrong CSS, missing chunks, stale env values baked in) —
if something looks off right after a deploy, redeploy that same commit from
the Vercel dashboard with **"Use existing Build Cache" unchecked** before
assuming the code is wrong.

## Known limitations (Phase 1A)

- No password reset flow yet (UI hook exists in `lib/supabase.ts`, unused)
- No admin UI for creating users — done via SQL directly against Supabase
  until Phase 2 builds one
- `dashboard.tsx`'s stat queries filter by `user.id` where they should use
  the store's `tenantId` — currently returns empty stats for any real tenant
  with data (see changelog "Known issues carried forward")

## Repo layout

```
src/
  pages/          login, signup (disabled), dashboard, index (redirect router)
  components/     ProtectedRoute
  store/          authStore.ts (Zustand)
  lib/            supabase.ts (client + a few unused helper exports)
supabase/
  migrations/     001_initial_schema.sql
docs/
  CHANGELOG.md    full session-by-session history of fixes and decisions
```
