# Phase 1A Changelog

What actually shipped between the Day-1 cowork session handoff and a working,
admin-only login + dashboard, and why. Written after the fact from the real
git history — treat this as the source of truth over the original
`DAY_1_COMPLETION_SUMMARY.md`, which described the intended Day-1 scope
before several of these bugs were found.

## Getting the Day-1 code in

The Day-1 cowork session (login, signup, dashboard, authStore, Supabase
client, ProtectedRoute) had written its output to a cloud sandbox, not this
machine. Pulled all 6 files plus the completion summary out of that session
via browser automation and placed them into the real local repos
(`pulse.v1` for code, the now-retired `nestora-pulse` for docs) — the two
repos had been sitting undiscovered on disk the whole time under
`C:\Users\chinn\Projects\nestora-pulse\`.

## Bugs found and fixed, in the order they surfaced

1. **Tailwind wasn't compiling** — `postcss.config.js` was missing entirely,
   so `@tailwind` directives in `globals.css` were never processed. Every
   page rendered as unstyled HTML. Added the config; also hit Vercel serving
   a build from *before* the fix even after the file was pushed — first
   sighting of a recurring pattern (see "Vercel build cache" below).

2. **`index.tsx` was a static placeholder** — never redirected anywhere.
   Rewrote it to check auth state and route to `/dashboard` or `/login`.

3. **`NEXT_PUBLIC_SUPABASE_URL` had a one-character typo** in Vercel's
   environment variables (`...luz` **`p`** `psiblysg` instead of `...luz`
   **`n`** `psiblysg`) — a hostname that doesn't exist. Every Supabase call
   failed instantly with a generic "Failed to fetch," before anything hit
   the network, which made it hard to spot. Fixed the env var.

4. **Every table except 3 had RLS enabled with zero policies defined** —
   not a deliberate restriction, a total lockout for the anon/authenticated
   roles on every table Supabase client libraries use. This blocked
   `tenants` inserts (signup) and would have blocked the dashboard's own
   queries right after. **Disabled RLS on all 19 affected tables** to match
   the project's own documented Phase 1A decision (app-level `tenant_id`
   filtering on every query, no RLS — see Architecture Decisions below).

5. **Signup silently failed** — `authStore.ts` inserted an `is_active`
   column into `public.users` that doesn't exist on the table, so the
   profile-creation insert always failed. The failure handler then tried to
   call `supabase.auth.admin.deleteUser()` with the anon key (an admin-only
   API requiring the service-role key), which also failed and masked the
   real error behind a generic "Signup failed." Removed the bogus column
   and the broken cleanup call.

6. **Intermittent login bounce-back** — `ProtectedRoute` and `index.tsx`
   called `checkAuth()` in one effect and, in a second effect, redirected to
   `/login` whenever `!isLoading && !user`. Zustand's initial state
   (`isLoading:false, user:null`) is indistinguishable from "checked and
   logged out," so depending on render timing that redirect could fire
   before `checkAuth()`'s real result ever came back. Fixed by gating the
   redirect on a `checked` flag that only becomes true once `checkAuth()`
   has resolved once.
   Also found and removed a real (if minor) race while debugging this:
   `login.tsx`'s `handleSubmit` and its own `user`-watching effect both
   called `router.push('/dashboard')` independently.
   The login→dashboard redirect itself was switched from `router.push()` to
   `window.location.href` after extensive testing that pointed at Next's
   client router (this turned out to likely be a false lead — see
   "A debugging dead end" below — but the hard navigation works and was
   left in place rather than reverted without a reason to).

7. **Public self-signup removed** — Phase 1 policy is admin-created
   accounts only. `/signup` now shows a static "contact your administrator"
   notice instead of a working form; the link and the stale "Phase 1A Test
   Credentials" box were removed from `/login`.

## Housekeeping

- `tsconfig.tsbuildinfo` (TypeScript's incremental build cache, regenerates
  on every local build) had gotten committed by accident and kept
  reappearing as a spurious change — untracked it and added `*.tsbuildinfo`
  to `.gitignore`. Took two attempts: the first untracking commit got
  reverted via GitHub Desktop's "Undo," which restores a commit's changes as
  *uncommitted* edits rather than actually undoing them — if that happens
  again, the fix is just to re-commit what's already staged, not redo the
  work.
- Seeded one real admin account (`admin@nestora.local`, see `CREDENTIALS.md`)
  directly via SQL since self-service signup is off. Also cleaned up
  test-only tenants/auth users created while diagnosing the RLS lockout.
- `CREDENTIALS.md` at the repo root is gitignored and documents where the
  real values live; it does not duplicate the Supabase URL/anon key inline
  on purpose.

## Vercel build cache: a recurring problem

Multiple times this session, a normal `git push`-triggered deploy produced a
build that was stale or internally broken (old CSS, missing env var values,
even an HTML page referencing a JS chunk file that didn't exist in that
deployment's own output) — all traced back to Vercel reusing a cached build
from before the relevant fix existed. **The reliable fix every time**:
Vercel dashboard → Deployments → the deployment in question → "..." →
Redeploy → uncheck "Use existing Build Cache." A plain `git push` alone was
not sufficient more than once.

## A debugging dead end worth recording

A large fraction of the login-bounce-back investigation (the `checked`-flag
fix, the double-push removal, the switch to `window.location.href`) was
carried out by testing the deployed site through one browser-automation
tool, which showed the bug failing ~75% of the time. Switching to a
*different* browser-automation tool and re-running the exact same login
flow against the exact same deployment succeeded 12/12 times (5 against
production, 7 locally). That strongly suggests a meaningful fraction of
that debugging was chasing an artifact of the first tool, not a defect a
real user would hit. The fixes made along the way are reasonable on their
own merits and were left in place, but this is flagged here so a future
"it's still flaky" report isn't assumed to be the same already-fixed bug
without first checking whether it reproduces outside of automated testing.

## Known issues carried forward (not yet fixed)

- **No password reset flow** — `resetPassword()`/`updatePassword()` exist as
  unused exports in `lib/supabase.ts`; nothing calls them.
- **No admin UI for user management** — accounts are created via direct SQL.
  Fine for a handful of internal users, not sustainable past that.

## Fixed after this changelog was first written (2026-09-14)

- **`dashboard.tsx`'s stat queries were filtering by `user.id`** (the auth
  user's UUID) where they should have used the store's `tenantId` — every
  stat silently showed 0/empty for any real tenant. Also fixed two queries
  referencing database columns that don't exist (`quantity_on_hand` →
  `quantity_available`, `channel_id` → `channel`). Verified against real
  data post-fix: Total SKUs 15, Total Units 460, Warehouses 3.
- **No session persistence across a hard page reload** — documented as a
  known Day-1 limitation in the original completion summary. Verified
  resolved: 4/4 consecutive hard reloads on `/dashboard` after login stayed
  logged in with correct data, no bounce to `/login`. Same root cause as
  the login-bounce-back bug above (item 6) — the `checked`-flag fix made
  there fixed this too, as an unintended side effect. No new code was
  needed, just verification.

## Architecture decisions reaffirmed or made this session

- **App-level multi-tenant isolation, no RLS.** This was the project's
  original documented decision (avoid RLS circular-dependency issues,
  filter every query by `tenant_id` in application code). RLS being enabled
  with zero policies on 19 tables was a deployment/setup mistake, not a
  change of decision — disabling it restored the intended design. This
  needs revisiting before any external-facing or less-trusted users get
  accounts (see Phase 2 below).
- **No self-service signup for Phase 1.** Only admins create accounts.
  Revisit once there's an admin panel to do that through instead of SQL.
- **Retired the `nestora-pulse` GitHub repo, its two Vercel projects, and
  the local backup** at the user's direction — it was an earlier, abandoned
  restart ("dummy experiment"). Its `CREDENTIALS.md` had a live Supabase
  `service_role` key and an Azure AD client secret committed in plaintext;
  purged from that repo's git history via `git filter-branch` before
  retiring it. **Those two values should still be rotated** (Supabase →
  regenerate `service_role`; Azure Portal → revoke + reissue the client
  secret) since they were live for a period before the purge — history
  rewriting removes future exposure, not past exposure.
- A separate Supabase project ("Nestora", ref `rahogvavvqkdbecggehj`) and a
  Google Drive "Nestora Pulse Backups" folder feeding it were found during
  cleanup and are **unrelated real business data** (626 SKUs, ~11k
  inventory rows) — confirmed out of scope, left untouched.
