# Disaster Recovery Runbook

What to do if the live Supabase project, the Vercel deployment, or this
machine is lost, and how confident we can be that a restore actually
works. Written during the item-6 hardening pass (2026-09-17) as part of
the standing three-way-backup rule in `CLAUDE.md`.

## What's backed up, and where

| Asset | Where it lives | How current |
|---|---|---|
| Application code | Local disk + GitHub (`origin/main`) | Every round, pushed via GitHub Desktop |
| Database schema (structure) | `supabase/migrations/*.sql`, git-tracked, + `NESTORA_PULSE_SCHEMA_BACKUP` on Drive | Every migration, same round it's applied |
| Database row data | `backups/<timestamp>/*.json` (local only, gitignored) | Manual - run `node scripts/backup-data.mjs` |
| Decisions/CHANGELOG/CLAUDE.md | Git + Drive mirrors | Same round as any change |

**The gap:** row data backup is manual, not scheduled. Vercel's Hobby
plan cron is daily-only and the owner has chosen to stay on Hobby for
now (see `CLAUDE.md`), so there's no automatic daily data export today.
Run the script yourself periodically, or revisit automating it if/when
off Hobby.

## Scenario 1: Lost this machine, code and schema history intact on
## GitHub, live Supabase project still up

1. `git clone` the GitHub repo to a new machine.
2. `npm install`.
3. Recreate `.env.local` from `CREDENTIALS.md`'s notes on where each
   value lives (Vercel env vars, Supabase project settings) - the
   actual secret values are never stored in git, by design.
4. `npm run dev` / deploy - the live Supabase project is untouched, so
   the app reconnects to real data immediately. No data restore needed
   for this scenario.

## Scenario 2: Supabase project itself is lost or corrupted, code is
## fine

1. Create a new Supabase project.
2. Replay the schema: run every file in `supabase/migrations/` **in
   filename order** (they're timestamp-prefixed, so a plain sort is
   correct) against the new project. Each file is exactly what was
   really run against the original project - pulled directly from
   Supabase's own migration history, not reverse-engineered - so this
   reconstructs the schema exactly, including every ALTER TABLE
   DISABLE ROW LEVEL SECURITY (critical - a fresh Supabase project
   defaults new tables to RLS-on with zero policies, which blocks all
   access; skipping this step reproduces the exact bug this project
   hit repeatedly before the `ensure_rls` event trigger was found and
   removed - see `docs/decisions/002-...md`).
3. Restore row data from the most recent `backups/<timestamp>/` folder:
   for each `<table>.json` file, insert its rows into the corresponding
   table on the new project (in the same dependency order the backup
   script lists them - tenants first, then everything that references
   tenants, etc.). No ready-made restore script exists for this yet;
   writing one is a reasonable next step if this scenario ever needs to
   be exercised for real, rather than something to build speculatively
   now.
4. Update `.env.local` and Vercel's environment variables to point at
   the new project's URL/keys.
5. Any row data created *after* the last backup timestamp is
   unrecoverable - this is why the manual backup cadence matters more
   as real usage grows.

## Scenario 3: Both code and database are lost (worst case)

Combine scenario 1 and 2: clone from GitHub, then follow scenario 2's
schema replay and data restore against a fresh Supabase project.

## What has and hasn't actually been tested

- **Migration replay has NOT been tested against a genuinely fresh
  database in this pass** - the 17 migration files are known-accurate
  (pulled verbatim from what Supabase itself already ran), but nobody
  has actually run them in order against an empty Postgres instance to
  confirm they replay cleanly start-to-finish with no ordering issues.
  Supabase branching (`create_branch`) would be a safe way to test this
  without touching the live project - a good next step, not done in
  this round to keep this pass within a reasonable scope/budget.
- **Data restore has NOT been tested** - the backup script's export
  side is verified (ran it for real, 821 rows across 29 tables,
  2026-09-17), but there's no restore/import script yet, only the
  manual procedure described above.
- **Recommendation:** before trusting this runbook in a real incident,
  do a dry run - spin up a Supabase branch, replay the migrations, spot
  check a few tables' structure matches, and confirm at least one
  table's backup JSON re-inserts cleanly.
