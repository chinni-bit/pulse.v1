# Project instructions for Claude

## Three-way backup — always, not just when asked (owner rule, 2026-09-17)

Code, database schema, and documentation must stay available in all
three of: **local disk, GitHub, and Google Drive.** This is a standing
rule, not a one-time cleanup — check it at the end of every round that
touches any of the three, not just when the owner explicitly asks.

- **Code**: local working copy + `git push` to `origin/main` (GitHub
  Desktop, since this environment can't push directly). GitHub is the
  real, versioned backup.
- **Hard rule (owner instruction, 2026-09-17, after this cost a large
  chunk of a day's token budget): never upload or store a zipped,
  compressed, or very-large file to Google Drive through this session's
  tools — on this project or any other.** Base64-encoding a binary file
  for the Drive `create_file` tool tokenizes extremely inefficiently
  (~6 tokens per character) — even a small zip can cost millions of
  tokens. If a task seems to call for a zip/binary/large file on Drive,
  stop and ask the owner for alternate options instead of attempting it
  — e.g. build the file locally and hand it to them via `SendUserFile`
  so they upload it themselves in seconds at zero token cost. Plain
  text (schema SQL, markdown docs) is unaffected by this — that's fine
  and cheap, keep doing it.
- **Schema**: every Supabase migration applied via the MCP tool must
  also be written out as a git-tracked file under `supabase/migrations/`
  (`<timestamp>_<name>.sql`, matching the Supabase CLI's own naming —
  pull the exact statements back out of `supabase_migrations
  .schema_migrations` if a migration was applied without writing the
  file at the time, don't reverse-engineer it from introspection).
  Also keep `NESTORA_PULSE_SCHEMA_BACKUP` on Drive in sync — same
  content, one consolidated readable file, updated whenever a new
  migration lands.
- **Docs**: `docs/CHANGELOG.md` and `docs/decisions/002-....md` are
  git-tracked here — that's their primary home now (moved out of the
  local-only planning folder 2026-09-16). Keep the Drive mirrors
  (`NESTORA_PULSE_CHANGELOG`, `NESTORA_PULSE_DECISIONS_LOG`) and the
  evergreen `NESTORA_PULSE_PROJECT_STATUS` page in sync too, in the
  same round as the change — not as a separate later cleanup pass.
- **This file too.** `CLAUDE.md` itself has a Drive mirror
  (`NESTORA_PULSE_CLAUDE_MD`) — whenever this file changes, re-upload
  it to Drive in the same round, same as the other docs above.

**Verification habit, not assumption:** after a push, confirm it
actually landed with `git fetch` + `git log origin/main -1 --oneline`
compared to local — don't take "I pushed it" at face value (this bit
us twice earlier in the project). After a Drive upload, the create_file
result itself confirms success; no separate check needed there.

**Drive tooling limitation:** this connector cannot update an existing
file's content — `create_file` always creates a new file (silently
duplicating if you reuse a title), and `update_file` only changes
metadata (title/folder), never content. To "update" a Drive mirror:
`create_file` the new version, then `trash_file` the old one. The
file's URL/ID changes every time as a result — acceptable for these
private, owner-only mirrors.

## Other standing rules (see docs/decisions/002-...md for full reasoning)

- **No Row Level Security, ever.** App-level `tenant_id` filtering on
  every query is the permanent isolation model. **As of 2026-09-17 the
  event trigger that used to auto-enable RLS on every new table
  (`ensure_rls` / `rls_auto_enable()`) has been dropped** — it was the
  actual root cause of the "new table came out with RLS enabled" bug
  hit repeatedly across this project. New tables should now come out
  with RLS off by default. Adding `ALTER TABLE ... DISABLE ROW LEVEL
  SECURITY;` to a new-table migration anyway is still harmless and
  still recommended as a safety net, but is no longer the only thing
  standing between a new table and getting silently locked out.
- **Before assuming Supabase's own tooling is the cause of a weird
  default, check for project-level event triggers/functions first**
  (`SELECT * FROM pg_event_trigger;`). The RLS-auto-enable trigger
  above was mistaken for a platform default for months before someone
  actually looked.
- Run `mcp__...__get_advisors` (security and performance) periodically
  — it caught a real unauthenticated privilege-escalation function
  (`create_tenant_with_admin`, since dropped) that had been sitting
  live and callable via the anon key the whole project.
- Channels are Amazon, Wayfair, Walmart (not Shopify, not Target —
  those were in superseded earlier plans).
- Read `docs/decisions/002-phase1-hardening-and-phase2-plan.md` before
  assuming scope on anything — it has the full reasoning behind every
  major call made on this project, organized by topic.
