# Phase 1A Changelog

Mirrors `docs/CHANGELOG.md` in the `pulse.v1` code repo
(`C:\Users\chinn\Projects\nestora-pulse\pulse.v1`) — kept here too since this
folder is the planning/reference home. If the two ever disagree, the one in
the code repo is authoritative (it's version-controlled; this one isn't).

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
- **MS 365/Teams integration and a real admin panel UI are deliberately
  deferred to a future, not-yet-scoped phase** (owner's call, 2026-09-14).
  Priority is core business logic (inventory + channel sync), kept simple.

## Phase 2 (2026-09-14)

- ✅ Products CRUD (`products.tsx`), Warehouses CRUD (`warehouses.tsx`),
  and product Variants (inline on the Products page — links a product to
  another as a bundle/kit component). All filtered by `tenant_id`. First
  cut of `products.tsx` used soft-delete via `products.deleted_at`;
  superseded by the deactivate-only model in the Third owner feedback pass
  below. Real Supabase schema for `products` confirmed directly against
  the live `pulse-v1` project via the Supabase MCP tool — the previously-
  committed `supabase/migrations/001_initial_schema.sql` in the planning
  folder does not match it (different table/column names, RLS-on-by-
  default) and has been moved to `obsolete docs/`.
- ✅ `dashboard.tsx`'s SKU count also excludes soft-deleted products
  (`.is('deleted_at', null)`) — a gap this page's soft-delete pattern
  exposed; without it the dashboard stat would over-count.
- ✅ Low-stock alerting — added `products.reorder_threshold` and wired the
  dashboard's Low Stock tile to real data.
- ✅ Admin UI for creating users (`/admin/users` + a server-side API
  route) — **blocked on adding `SUPABASE_SERVICE_ROLE_KEY`** to the
  environment before account creation actually works; the user list
  itself works today. See `decisions/002-...md`'s "Blocked — needs owner
  input" section.
- ✅ Channel sync connection layer for Wayfair + Walmart (Amazon out of
  scope for this round, owner's call). Owner provided sandbox API
  credentials for both; stored only in `.env.local` (gitignored, never
  committed). `/channels` page with a "Test Connection" button per
  channel, verified live end-to-end for both (direct HTTP against the
  running app, bypassing the browser). Wayfair confirmed sandbox-scoped;
  its real data API is GraphQL, introspection confirms 4 reachable
  queries including `getDropshipPurchaseOrders`. Walmart OAuth confirmed
  working, not yet exercised beyond token issuance. Actual product/order
  sync is not built yet — this is connection verification only.
- ✅ Wayfair order pull, done and verified live twice (idempotent — a
  second run against the same data correctly created 0 duplicates).
  Discovered `getDropshipPurchaseOrders`'s real shape via GraphQL
  introspection, pulls into `orders`/`order_items`, matches line items to
  local products by exact SKU (skips and counts unmatched ones rather
  than failing, since `order_items.product_id` is required). 25 sandbox
  purchase orders pulled in; sandbox SKUs don't match Nestora's real
  catalog so 0 line items matched yet — expected with sandbox data.
- ✅ Walmart order pull + cancelled-order handling for both channels —
  a PO/order where every line is cancelled is now stored as `CANCELLED`
  with its cancelled value excluded from the total, and re-syncing
  reconciles existing orders instead of just skipping them. Caught and
  fixed two real bugs along the way: a Wayfair PO that had already been
  pulled in as a normal order despite being fully cancelled, and a
  Walmart-side bug where `chargeAmount.amount` being a string for some
  orders made JS's `+` do string concatenation instead of addition
  (`0 + '10'` → `'010'`), silently producing wrong totals.
- ✅ Inventory push for both channels. Walmart: straightforward, verified
  live. Wayfair: originally built around one supplier ID per account,
  corrected (owner, 2026-09-14) to one supplier ID **per warehouse** —
  Wayfair uses it to compute shipping cost and decide sourcing per
  warehouse. Added `warehouses.wayfair_supplier_id`, set for NJ/WH100
  (81454) and MS/WH800 (81852); manageable right on the Warehouses page.
  Also caught a real bug: Wayfair's inventory mutation is async, so its
  immediate response's item/error counts are always ~0 regardless of
  outcome — was silently reporting every successful push as "0 items,"
  fixed by counting from the one field that *is* populated immediately.
- ✅ Channel SKU mapping — verified against Wayfair's and Walmart's own
  docs first: both APIs are designed around the seller's own SKU
  (Wayfair's "Supplier Part Number", Walmart's "sku" field are both
  seller-assigned, not channel-assigned), so both order-pull and
  inventory-push for both channels now default to a product's own SKU,
  with `product_mappings` as an optional override only — previously push
  required an explicit mapping row to push anything at all, which was
  backwards. New "Channel Listings" UI on the Products page manages the
  overrides. Verified live: pushed all 15 products to Wayfair with zero
  mapping rows in existence, 0 errors. Also found Walmart's sandbox
  enforces a real rate limit (mitigated with a 1s delay between calls,
  not eliminated) and that this sandbox account's inventory GET doesn't
  reflect PUT writes (a "static" sandbox quirk, not a bug in this app).
- A chunk of this session's browser-based UI testing was unreliable
  because the browser pane was backgrounded (throttling the page's own
  JS timers, not a real app defect — confirmed via direct DOM
  inspection and by checking the dev server log/direct HTTP requests,
  which stayed fast and error-free throughout). See the decisions doc for
  exactly what did and didn't get full click-through UI verification.

## Owner UI/UX feedback pass (2026-09-14)

Owner did a hands-on pass over the live app and gave a large batch of
feedback across every page. All addressed in one round, verified live
(TypeScript compiles clean project-wide, every changed page hit and
screenshotted, several behaviors exercised end-to-end — see the
decisions doc for exact test detail):

- ✅ Consistent app-wide header/nav (`AppHeader` component) on every
  page — was previously a different, incomplete link set per page.
  Login and header tagline unified to "Inventory & Sales Management."
  Tenant name now shown top-right on every page.
- ✅ Dashboard: "Active SKUs" (was counting all statuses) + new "Out of
  Stock" tile alongside Low Stock; status banner rewritten to reflect
  what's actually live instead of stale "coming next" copy.
- ✅ Products: sortable columns, search (SKU/title/brand/description),
  configurable pagination (25/50/100/200); brand is now a dropdown of
  existing values + "add new"; Status gained a Future option; a
  Duplicate action pre-fills the Add form from an existing product;
  guardrails added against negative cost/MSRP and oversized
  SKU/title/brand (client-side + DB `CHECK` constraints, both — found
  live during this session that unguarded input could blow out the
  table layout entirely).
- ✅ Warehouses: address + contact name/phone/email fields added.
- ✅ Users: now editable (name/role) with last-admin protection (can't
  demote/move the last admin or super admin of a tenant — verified live,
  correctly refused); role model expanded to
  `super_admin`/`admin`/`user`; a super admin can create/edit users
  across tenants with a tenant filter, a plain admin is scoped to their
  own tenant only. 8 orphaned seed profile rows with no real login (no
  matching `auth.users` row) deleted from the database.
- ✅ Channels: Amazon's badge no longer claims "Active" when nothing's
  connected; sync log rows no longer render success text in red;
  Walmart and Amazon's internal channel codes renamed to `WM3P` /
  `AMAZON3P` (across `channels`, `orders`, `sync_logs`,
  `product_mappings`) to leave room for the not-yet-integrated
  `WM1P`/`WMDS`/`AmazonDS` accounts; each channel now has an editable
  auto-sync interval (persisted, defaulted to 5 min); sync log rows are
  clickable and open a drilldown of the exact orders/items touched by
  that run (added `sync_logs.synced_order_ids` /
  `.pushed_items`) — verified live by forcing a resync mismatch and
  confirming the drilldown correctly showed the one order it fixed.
- ✅ New `/orders` page — all orders across channels, filterable by
  channel, sortable, paginated.
- ✅ New `/api/cron/sync-channels` — a secret-header-gated route that
  auto-pulls orders for every tenant/channel whose configured interval
  has elapsed, sharing the exact same sync logic as the manual "Pull
  Orders" button (extracted into `src/lib/syncOrders.ts`). Wired into
  `vercel.json` as a daily cron. **Caveat, not silently glossed over:**
  Vercel's Hobby (free) plan only allows daily-granularity cron
  triggers, not hourly — true hourly automation needs either a paid
  Vercel plan upgrade or an external free pinger hitting this route with
  the `x-cron-secret` header. Owner hasn't decided which; route works
  either way once triggered.
- **Explicitly not done, by design:** a tenant-code login field to allow
  duplicate usernames across tenants (Supabase Auth requires
  project-wide-unique emails; reworking that is a bigger, riskier change
  than the ask needed — tenant name is now shown in the header instead)
  and full `editor`/`viewer` permission enforcement (would require
  gating every write endpoint individually; shipping unenforced role
  labels was judged worse than not having them yet).

## Second owner UI/UX feedback pass (2026-09-15)

Another large batch, addressed in one round (TypeScript compiles clean
project-wide; every changed page hit and click-tested live, including a
schema bug the live test itself caught and fixed - see below):

- ✅ Login: show/hide password toggle (eye icon), verified live -
  toggling switches the field's type and the button's accessible label.
- ✅ Warehouses: hard delete replaced with Activate/Deactivate
  (`warehouses.is_active`); "Show deactivated" filter; dashboard's
  Warehouses tile and the Wayfair inventory push both now only count
  active warehouses.
  ⚠️ **Known gap, not silently worked around:** "only active warehouses"
  couldn't be extended to Total Units/Low Stock/Out of Stock, because
  `batch_locations` (the table that actually links inventory to a
  specific warehouse) is empty for all real product data today - nothing
  has ever assigned real inventory to a warehouse via that table. Those
  three dashboard numbers still come from `inventory_batches` directly
  (warehouse-agnostic). Needs an owner decision: add `warehouse_id`
  straight onto `inventory_batches`, or start populating
  `batch_locations` for real batches. **Resolved in the Third owner
  feedback pass below.**
- ✅ Warehouses + Orders + Products: clicking the ID/SKU/title now opens
  a read-only detail popup (shared `DetailModal` component) with an Edit
  button, instead of jumping straight to edit mode.
- ✅ Orders: line items shown per order (SKU + title), both as a compact
  column and in full in the detail popup; date-range filtering with 8
  presets (Today default, Yesterday, Last 7/30 Days, Month to Date, Year
  to Date, All Time, Custom Range) - verified live, "Today" correctly
  shows 0 of 57 since all sandbox orders predate today.
- ✅ Channels: sync-log drilldown extended to show line items per order
  (expandable rows), not just PO/total.
- ✅ Products: rows-per-page now persists for the browser session
  (`sessionStorage`); defaults to Active-only with a status filter for
  All/Inactive/Future; "Channels" button renamed "Listings" (it covers
  variants + channel listings, not just channels); added Product Type
  (sortable + searchable), Finish, Finish Group, Dimensions, Country of
  Origin fields; exposed the previously-unused `customer_exclusivity`
  column; new read-only detail popup (description, dimensions, country
  of origin, per-warehouse inventory - correctly shows "no breakdown
  recorded yet" given the `batch_locations` gap above).
- ✅ **Multiple listings per channel** - a product can now be sold under
  several different names/SKUs on the same channel (e.g. "Farmhouse
  Dresser" and "Modern Dresser" both mapping to the same product on
  Amazon). **Caught and fixed a real bug during live verification:** a
  pre-existing `UNIQUE (tenant_id, product_id, channel)` constraint on
  `product_mappings` blocked a second listing on the same channel
  outright - replaced with `UNIQUE (tenant_id, product_id, channel,
  channel_sku)`. Also had to fix both inventory-push routes
  (Wayfair/Walmart), which previously kept only the last override per
  product in a `Map` - now every listing for a product gets pushed
  separately under its own SKU. Verified live: added two listings to one
  product on Amazon3P, confirmed both persisted correctly in the
  database, cleaned up test data after.
- ✅ Dashboard: Low Stock and Out of Stock tiles are now clickable,
  opening a popup listing the exact SKUs behind the count - verified
  live against real data (11 SKUs each, correct threshold values shown).
- ✅ DB schema audit done. Found and exposed `products
  .customer_exclusivity` (previously an unused column, superseded by the
  real customer-exclusivity model built in the Third owner feedback pass
  below). Found several entirely unused tables not wired into any code -
  `returns`/`return_items`/`refunds`, `order_fulfillment`,
  `batch_movements`, `audit_logs`, `user_permissions`, plus a stray
  unused `inventory`/`catalog_mappings` pair that predates the actual
  `inventory_batches`/`batch_locations`/`product_mappings` model built
  in this app - each is its own real feature, folded into the Phase C
  discussion below rather than bolted on here.

**Explicitly deferred to a dedicated follow-up (not started this
round):** the full analytics/graphs suite (inventory trends, sales
trends by SKU/collection/channel, channel performance comparisons by
time period), a new Inventory page (per-warehouse + total-per-SKU view),
and Retail Customers / Customer Groups management. Each is substantial
enough to deserve its own design pass. Also waiting on owner input:
WMDS (Walmart dropship/vendor) integration - needs whatever developer
credentials Walmart's vendor portal issues, likely a different
integration path than the Marketplace API already built; and the full
list of sales channels, to work out which ones can auto-connect vs.
need manual/FTP/email inventory publishing.

## Third owner feedback pass (2026-09-15, later same day)

- ✅ Dashboard: Total Units/Low Stock/Out of Stock now sum from
  `batch_locations` joined to active warehouses only, closing the gap
  flagged in the prior round (owner confirmed every inventory batch
  upload will assign a warehouse going forward). Verified live with a
  temporary `batch_locations` row: counted while its warehouse was
  active, correctly dropped to zero the moment the warehouse was
  deactivated, cleaned up after.
- ✅ Products - finish group is now a master table (`finish_groups`,
  tenant-scoped, unique per name) instead of free text, with the same
  select-or-"+ Add new..." inline pattern already used for Brand.
- ✅ Products - the single free-text `dimensions` field was replaced
  with structured columns: product length/width/height + unit (in/cm),
  product weight + unit (lbs/kg), carton length/width/height, carton
  weight, and a free-text dimension notes field (e.g. seat cushion
  depth). All shown as separate rows in the read-only detail popup.
- ✅ Products - country of origin is now a dropdown (USA, China,
  Vietnam, Thailand, Indonesia, India, Mexico, Malaysia, Cambodia) with
  an "Other" free-text fallback.
- ✅ Products - customer exclusivity reworked from a free-text field
  into a real model: new `customer_groups` and `customers` tables (per
  the shape already documented in `06_DATABASE_SCHEMA.md`, built now
  only because this feature had a hard dependency on them - full
  Customers management stays deferred, see below) plus a
  `product_customer_exclusivity` join table allowing any mix of
  customer groups and/or individual customers per product. Checkboxes
  in the product row's expand panel, with inline "add new group" / "add
  new customer" inputs; both persist immediately on check/uncheck, no
  separate save step.
- ✅ Products can now only be deactivated, never deleted (`toggleActive`
  replaces the old delete action, flips `products.status` between
  `ACTIVE`/`INACTIVE`) - protects sales history from ever pointing at a
  missing product. Verified live both directions (deactivate removes it
  from the Active-only default view; reactivate brings it back).
- **Caught and fixed a real bug during live verification, the same
  class of bug as item 4 in the very first bug list above:** the 4 new
  tables (`finish_groups`, `customer_groups`, `customers`,
  `product_customer_exclusivity`) came out of `apply_migration` with RLS
  silently enabled and zero policies - every insert failed with a 403,
  which showed up as the "+ Add" buttons appearing to do nothing (no
  error surfaced in the UI, because the calling code's error handling
  was itself never exercised by a successful path until this was found).
  Disabled RLS on all 4 to match the project's permanent app-level
  `tenant_id`-filtering decision. **Worth remembering for every future
  new table:** Supabase's migration tool appears to default new tables
  to RLS-on; explicitly disable it as part of the same migration next
  time, not as an after-the-fact fix.
- Migration applied directly via Supabase MCP (no local migration file,
  matching this project's established pattern):
  `product_taxonomy_dimensions_customer_exclusivity` followed by
  `disable_rls_new_taxonomy_tables`.

## Customers / Customer Groups management (2026-09-16)

First round of the roadmap the owner sequenced 2026-09-15 (Customers/
Customer Groups → Inventory page → warehouse/inventory counts → Analytics
→ mobile app → hardening/backups). Scoped in an explicit discussion round
before building - owner wanted real B2B account management, not just the
minimal exclusivity-only tables from the Product page taxonomy round.

- New `/customers` page — full CRUD for Customer Groups (name +
  description) and Customers (name, group, email, phone, inventory-update
  email, support email, address/city/state/zip/country, active status).
  Customers deactivate-only, never deleted, same reasoning as Products -
  orders and exclusivity rules can reference them.
- Schema: `customer_groups` gained `description`; `customers` gained
  `email`, `phone`, `inventory_update_email`, `support_email`, `address`,
  `city`, `state`, `zip`, `country`, `is_active`, `updated_at`; new
  `customer_contacts` table (a customer can have multiple named contact
  people - name, title, email, phone); `orders` gained nullable
  `customer_id` + `customer_group_id` for attribution (null = generic/
  unattributed).
- Customer detail view shows: contact info, an inline contacts manager,
  the products exclusive to this customer or their group (reading the
  existing `product_customer_exclusivity` table from the customer's side
  - the reverse of the Product page's checkboxes), and an analytics
  summary (revenue, profit, order count, top 5 products) computed
  directly from `orders`/`order_items` - no charting library, that stays
  with the dedicated Analytics round. Same analytics block reused at the
  Customer Group level (rolls up member customers' orders plus any
  ordered directly at the group level) and at a company-wide level
  (summary strip at the top of the page).
- Orders page: new "Customer / Group" column and filter, plus an
  attribution picker in the order detail popup (choosing a customer
  auto-fills their group; clearing the customer allows group-only
  attribution for generic orders). New orders synced in from Wayfair or
  Walmart now default to a customer group matching the channel name if
  one exists (e.g. a "Wayfair" group), otherwise stay unattributed for
  manual assignment - existing orders were not retroactively attributed.
- Verified live end-to-end: created a group and a customer, added a
  contact, set an exclusivity checkbox from the Product page and
  confirmed it appeared on the customer's detail view, attributed a real
  order and confirmed both the customer-level and group-level analytics
  updated correctly, deactivated the customer. Test data cleaned up
  after.
- Migration applied directly via Supabase MCP (no local migration file,
  matching this project's established pattern):
  `customer_management_and_order_attribution` - included disabling RLS
  on the new `customer_contacts` table as part of the same migration,
  per the lesson from the RLS bug caught in the prior round.

## Dedicated Inventory page (2026-09-16)

Second round of the owner's sequenced roadmap. Scoped in discussion
first: read-only this round (receiving stock / adjustments / counts
stay with item 3, "warehouse/inventory management").

- New `/inventory` page — every active-status SKU as a row, one column
  per active warehouse (togglable via checkboxes - "Select all"/"Select
  none"), an "Unassigned" column, and a "Total" column that always sums
  every active warehouse regardless of which are currently shown, so
  filtering down to a subset of warehouses never loses the full-company
  context.
- "Show $ value" toggle adds a dollar figure next to every quantity
  (qty × the owning batch's `cost_per_unit`, FIFO-aware since it's priced
  batch by batch, not off `products.cost`). Off by default, units only.
- Each SKU with batches can expand to a batch-level breakdown: batch
  number, landed date, cost/unit, quantity available, and exactly which
  warehouse(s) it's split across (or "not assigned to a warehouse yet").
- Company-wide summary strip: total units, total value (when the $
  toggle is on), low-stock SKU count, out-of-stock SKU count, and total
  unassigned units - using the same reorder-threshold logic as the
  dashboard's tiles, so the numbers agree.
- **Real gap this page surfaced immediately, not synthetic:** all 5
  existing `inventory_batches` rows (460 units total, real costs like
  $250/unit) have **zero** `batch_locations` rows - none of the current
  inventory has ever been assigned to a warehouse. This predates the
  active-warehouse dashboard fix from two rounds ago, which was written
  assuming batch uploads would start carrying a warehouse "going
  forward" - that assumption hasn't been exercised yet by any real data.
  Every SKU with stock currently shows correctly as "Out of Stock" on
  both the dashboard and this new page as a direct, accurate consequence
  - not a bug, but flagged because it's a real usability gap until
  resolved. Also noticed while checking this: `warehouses` has two rows
  sharing the same `code` for each of the three real locations (e.g. two
  different rows both coded `MS/WH800` - one named plainly, one prefixed
  "QA") - flagged to the owner, not resolved in this round.
- No schema migration needed - `inventory_batches.cost_per_unit` and
  `batch_locations.quantity` already existed from the original schema,
  just unused by any UI until now.
- Verified live: company summary, warehouse checkboxes (including
  deselecting all warehouses and confirming Unassigned/Total still
  showed full context), $ value toggle math, batch-level expand, status
  filter, search - all against the real (unassigned) data, no test data
  created or needing cleanup.

## Inventory data cleanup, same day (2026-09-16)

Follow-up to the two items the Inventory page surfaced, resolved same
day per owner direction:

- **Warehouse duplicates removed.** Confirmed via `wayfair_supplier_id`
  (set on the plain-named rows: NJ/WH100 -> 81454, MS/WH800 -> 81852;
  null on all three "QA"-prefixed rows) and a check for any references
  (`batch_locations`, the unused legacy `inventory` table) before
  deleting - the three "QA" rows had zero references anywhere. Deleted
  them; exactly 3 warehouses remain (Mississippi, New Jersey, Wayfair
  3PL), matching the owner's explicit "keep it to 3" direction.
- **All 5 existing batches assigned to a warehouse.** Owner's direction:
  assign each at random across the 3 real warehouses. Landed:
  BATCH-001-SEP (95) and BATCH-004-SEP (195) -> New Jersey;
  BATCH-002-AUG (42) and BATCH-005-SEP (58) -> Wayfair 3PL;
  BATCH-003-SEP (70) -> Mississippi.
- Verified live on both the dashboard and the new Inventory page: Total
  Units now correctly reads 460 (was 0), Warehouses reads 3 (was 6),
  Unassigned Units reads 0 (was 460), and each SKU's per-warehouse
  breakdown matches the assignment above exactly.

## Warehouse/inventory management, phase 1: schema + receive/assign/transfer/on-water (2026-09-16)

Item 3 on the owner's roadmap. Scoped in a detailed discussion first -
this became a genuine financial-controls module (counts, adjustments,
an approval workflow, FIFO loss costing), not just a form, so it's being
built in five phases: (1) schema, (2) receive/assign/transfer/on-water
[this entry], (3) counts + worklist generator + Excel upload, (4)
adjustments + approval + FIFO/QC, (5) loss/gain reporting.

**Schema (phase 1):**
- `inventory_batches` gained `po_number`, `vendor_name`, `status`
  (`ON_WATER`/`RECEIVED`, existing rows default `RECEIVED`),
  `expected_warehouse_id`, `expected_arrival_date`. Also dropped the
  `NOT NULL` constraint on `original_landed_date` (caught live while
  testing phase 2 - an on-the-water batch legitimately has no landed
  date yet; fixed same round).
- New tables: `inventory_transfers` (warehouse-to-warehouse moves, an
  in-transit state that belongs to neither warehouse until completed),
  `inventory_qc_holds` (inventory pulled for inspection/repair -
  resolves to released-back or written-off, not a financial event on
  its own), `inventory_counts` (physical count entries, per-line or
  Excel-batch-tagged), `inventory_adjustments` +
  `inventory_adjustment_lines` (the approval-gated gain/loss ledger with
  FIFO cost breakdown for losses), `inventory_audit_log` (one queryable
  trail for every write this whole module makes).
- Approval model: any authenticated user can submit (count, adjustment,
  receipt); only `admin`/`super_admin` role can approve - same account
  can hold both rights, no second-person requirement. Reuses the
  existing role field, no new permission table.
- Five mutually-exclusive inventory buckets going forward: On-Hand (in a
  warehouse, sellable - unchanged from before), Unassigned (received,
  not yet placed), In Transit (moving between our warehouses), On the
  Water (inbound from a vendor, not yet received anywhere), QC Hold
  (temporarily unavailable pending inspection/repair). On-Hand stays the
  default/primary total everywhere; a "Total in System" figure summing
  all five is planned for the Inventory page in a later phase.

**Receive / assign / transfer / on-water (phase 2):**
- New `/inventory-management` page (added to nav as "Inventory Mgmt") -
  deliberately separate from the read-only `/inventory` page, since
  different staff view vs. operate.
- Receive New Inventory: create a batch (product, quantity, cost/unit -
  defaults to the product's own cost, batch number - auto-generated if
  blank, PO#, vendor), either placed directly in a warehouse, left
  unassigned (warehouse field is optional), or marked On the Water
  (expected warehouse + expected arrival date, no location until
  received).
- Unassigned Inventory panel: assign any unassigned batch quantity to a
  warehouse (creates or tops up a `batch_locations` row).
- On the Water panel: admin/super_admin-gated "Receive" action - full or
  partial receipt splits the batch into a received, warehouse-located
  portion (carrying forward PO#/vendor/cost) and a remaining on-water
  portion still awaiting the rest of the shipment.
- Transfers: pick a product + source warehouse, choose from that
  warehouse's on-hand batches, quantity, destination, optional expected
  arrival date. Initiating immediately removes the quantity from the
  source warehouse (shows in neither warehouse while in transit); "Mark
  Received" lands it in the destination's `batch_locations`.
- Every action logs to `inventory_audit_log` (event type, product,
  warehouse, quantity/value delta, who, when).
- Verified live end-to-end: received an unassigned batch then assigned
  it to a warehouse; created an on-the-water batch with PO#/vendor/
  expected-arrival, partially received it (confirmed the split - 20
  units stayed on the water, 30 landed with full PO/vendor lineage
  intact); initiated a transfer, confirmed the 10 units appeared in
  neither warehouse while in transit, then completed it and confirmed
  it landed at the destination. All test data cleaned up after; the 5
  real batches/locations from the earlier backfill are untouched.

## Landed cost worksheet (2026-09-16)

Elaboration of phase 2's receiving flow, scoped in a detailed discussion
before building. The batch cost captured at receiving time is just
purchase cost; this round adds computing the real landed cost (what
actually goes into inventory valuation and FIFO loss costing later) -
purchase cost + customs duty + allocated ocean freight + allocated
drayage + allocated unloading + a procurement/QC overhead percentage.

- New tables: `vendors_factories` (replaces the old free-text vendor
  field with a real entity - name, country, and standard/default ocean
  freight, drayage, and unloading amounts that prefill a worksheet, all
  editable there), `country_tariff_rates` (duty % by country, matched
  against `products.country_of_origin`, editable per worksheet too),
  `inventory_settings` (tenant-wide default procurement overhead %, one
  row per tenant), `inventory_shipments` (groups the batches a landed
  cost worksheet was run against - either an import, factory -> on
  water -> warehouse, or a local purchase, po -> warehouse directly),
  `inventory_landed_cost_worksheets` + `_lines` (the calculation itself,
  kept permanently as the audit record of how each batch's landed cost
  was derived). `inventory_batches` gained `shipment_id` and
  `landed_cost_status` (`PENDING`/`FINALIZED`).
- New `/inventory-landed-cost` page (nav: "Landed Cost"): manage
  vendors/factories and their standard rates, manage country tariff
  rates, set the default overhead %, and build a worksheet - select any
  number of pending batches (regardless of how they were received),
  pick a vendor (prefills freight/drayage/unloading), pick an allocation
  method (by value or by volume - volume uses each SKU's carton cubic
  size, falling back to value-weighting if carton dimensions aren't
  recorded), enter/adjust the shipment-level freight/drayage/unloading
  totals and per-line duty rate, and see every line's computed landed
  cost update live before finalizing.
- Finalizing writes each batch's computed landed cost into its real
  `cost_per_unit` (purchase cost is preserved on the worksheet line for
  audit purposes), marks it `FINALIZED`, and logs the value change to
  `inventory_audit_log`.
- **Real gap this surfaced, not synthetic:** all 5 real inventory
  batches from the original backfill show up as landed-cost `PENDING` -
  they were seeded with a flat cost and never had a proper landed-cost
  calculation run. Not resolved in this round (would need real
  freight/duty/vendor numbers from the owner); flagged rather than
  silently left invisible.
- Verified live end-to-end: added a vendor with standard rates, added a
  China tariff rate, temporarily set a product's country of origin to
  China to prove the auto-pull, selected two SKUs into one worksheet,
  confirmed vendor defaults pre-filled the freight/drayage/unloading
  fields, hand-verified the value-based allocation math for both lines
  against the app's own numbers (matched exactly), finalized, and
  confirmed both batches' `cost_per_unit` updated to the computed landed
  cost with the audit log recording the correct dollar delta. All test
  data (vendor, tariff rate, shipment, worksheet, worksheet lines, audit
  entries, the temporary country-of-origin edit, and the two batches'
  cost/status) cleaned up and reverted after.

## Physical counts, worklist generator, CSV batch upload (2026-09-16)

Phase 3 of item 3 on the roadmap. `inventory_counts` schema was already
in place from phase 1; this round built the UI.

- New `/inventory-counts` page (nav: "Counts").
- **Count Worklist Generator** — pick a warehouse and one of four
  criteria (quantity below a threshold, top N by dollar value, oldest
  landed batches, random sample of N), get a filtered/sorted SKU list
  with system quantity, value, and oldest landed date. A "Print This
  List" button produces a clean write-in sheet (SKU/Title/System Qty/
  blank Counted Qty column) using `print:` Tailwind variants to hide
  everything else on the page - no new dependency, just CSS.
- **Manual per-line count entry** — pick product + warehouse, see the
  live system quantity, enter what was actually counted, see the
  variance calculate live before submitting. Recorded counts that don't
  match the system don't create an adjustment yet (that's phase 4) -
  they're logged with a message saying so, not silently dropped.
- **CSV batch upload** — parse a CSV (SKU, Warehouse code, Counted
  Quantity, optional Notes), preview every row with its resolved system
  quantity and computed variance, flag unmatched SKUs/warehouse codes
  per-row before anything is written, then confirm to insert all valid
  rows tagged with a shared `upload_batch_id`.
- **A security call worth recording:** tried `xlsx` (SheetJS) for real
  `.xlsx` parsing first, since that's what "Excel file" literally means.
  `npm audit` flagged it with two vulnerabilities (prototype pollution,
  ReDoS) with **no fix available** - and this feature's entire purpose
  is parsing user-uploaded files, the exact scenario those bugs get
  triggered in. Removed it immediately rather than ship it, and used
  CSV instead (hand-written parser, no dependency, no untrusted-input
  attack surface) - Excel exports to CSV natively, so this doesn't lose
  real functionality, just requires a save-as step.
- Every count logs to `inventory_audit_log` (`COUNT_SUBMITTED` for
  manual entries, `COUNT_BATCH_UPLOADED` for CSV batches).
- Verified live end-to-end: worklist by top-value math hand-checked
  against real data (matched exactly), manual count entry with a real
  variance (-3) recorded and displayed correctly, CSV upload with one
  intentionally-bad row (unmatched SKU) correctly excluded while the two
  valid rows uploaded and matched their real system quantities. Test
  data (3 count rows, 2 audit entries) cleaned up after.

## Adjustments, approval workflow, FIFO loss costing, QC holds (2026-09-16)

Phase 4 of item 3 - the schema from phase 1 (`inventory_adjustments`,
`inventory_adjustment_lines`, `inventory_qc_holds`) finally gets a UI.
This is the phase that actually changes real inventory quantities based
on a human decision, so it got the most careful live verification of
the whole round.

- New `/inventory-adjustments` page (nav: "Adjustments").
- **Submit Adjustment** (any user): Loss or Gain, product, warehouse,
  reason code (different lists per type - Damaged/Missing/Rendered for
  Parts/Count Correction/Other for losses, Found/Count Correction/Other
  for gains), quantity, notes.
  - A **Loss** shows a live FIFO breakdown before submission - which
    specific batches (oldest landed date first) the loss will be taken
    from and at what cost, blocking submission if the warehouse doesn't
    have enough on hand to cover it.
  - A **Gain** asks for a unit value, defaulting to the SKU's most
    recent landed cost (falling back to the product's own cost if it
    has no batch history yet) - editable at submission.
- **Pending Approval queue**: visible to everyone, but Approve/Reject
  only render for admin/super_admin - matching the owner's clarified
  model (a designated person enters, an authorized person approves; the
  same account can hold both rights, no second-person requirement).
  Nothing touches real inventory until approved:
  - Approving a **Loss** re-verifies each FIFO line still has enough
    stock (guards against changes since submission - if not, the
    approver is told to ask for a resubmit rather than partially
    applying), then decrements those exact batches' `batch_locations`
    and `quantity_available`.
  - Approving a **Gain** creates a brand new batch (landed-cost status
    already `FINALIZED` at the entered/standard value) and places it in
    the target warehouse.
  - Rejecting makes no inventory change at all.
- **QC Hold**: any user can place a hold (pulls quantity out of
  `batch_locations` and the batch's `quantity_available` immediately -
  it's no longer sellable, but nothing financial has happened yet).
  Resolution is admin/super_admin-gated: **Release** puts the quantity
  back with zero financial impact; **Write Off** records it as an
  approved Loss adjustment (linked back to the hold) at that batch's
  own cost - no separate approval step, since only an authorized person
  could reach that button in the first place.
- Counts with an unresolved variance (from phase 3) now show at the top
  of the page with a "Prefill Adjustment" shortcut that carries the
  product/warehouse/quantity/direction into the adjustment form and
  links the count to the resulting adjustment once submitted, closing
  the loop between counting and adjusting.
- Every action logs to `inventory_audit_log`.
- Verified live end-to-end, including the full money trail: a 10-unit
  loss (FIFO-priced, hand-checked exact), a 15-unit gain at the
  standard-cost fallback, a QC hold placed then written off (correctly
  became an approved Loss adjustment linked to the hold), and a second
  QC hold placed then released (confirmed quantity landed back exactly
  where arithmetic predicted - 70 to start, -5, -3, +3 = 65). All test
  data reverted/cleaned up after - batches, locations, adjustments, QC
  holds, and audit entries all confirmed back to baseline.

## Loss / gain reporting - item 3 complete (2026-09-16)

Phase 5, the last phase of the warehouse/inventory management round.
Reads `inventory_adjustments` (status APPROVED only - realized financial
events, matching the accounting framing this whole round was built
around) with no schema changes needed.

- New `/inventory-loss-gain-report` page (nav: "Loss/Gain Report").
- Filters: date range (Today, This Week, This Month, This Year, All
  Time, Custom Range - same preset pattern as the Orders page),
  warehouse, reason code, and Loss/Gain/both.
- Company-wide summary: total loss value + units, total gain value +
  units, net.
- By-warehouse breakdown: loss/gain value and units per warehouse, so
  "historic loss/gains from each warehouse" is answerable directly.
- By-reason breakdown: exactly what was asked for - search a period and
  see total damage costs, total QC write-off costs, etc., by reason
  code, not just a lump sum.
- Full detail list underneath: every adjustment in the filtered range
  with date, type, SKU, title, warehouse, reason, quantity, value,
  source, and notes.
- Verified live: inserted four adjustments spanning different
  warehouses, reasons, and dates (2/10/1/60 days old) directly against
  the database, confirmed This Month correctly excluded the 60-day-old
  one from every total (3 adjustments, loss 1360/6u, gain 135/3u, net
  -1225) while All Time correctly included it (4 adjustments, loss
  1480/7u), and confirmed the by-warehouse and by-reason breakdowns
  matched hand-calculated numbers exactly in both views. Test data
  deleted after, table confirmed back to empty.

**Item 3 (warehouse/inventory management) is now fully shipped** across
all 5 phases: schema; receive/assign/transfer/on-water plus the landed
cost worksheet; counts, worklist generator, and CSV upload; adjustments
with FIFO loss costing, the approval workflow, and QC holds; and this
reporting layer. Next up on the roadmap: item 4, the analytics/graphs
suite.

## Analytics suite, page 1 of 5: Sales/Revenue Trends (2026-09-16)

Item 4 on the roadmap. Scoped in detailed discussion first, same pattern
as every item since Customers - full reasoning (chart library choice,
page structure, interactivity requirements) recorded in
`decisions/002-phase1-hardening-and-phase2-plan.md` under "Analytics/
graphs suite scope - decided" and mirrored to Drive
(`ANALYTICS_SUITE_SCOPE_DECIDED_2026-09-16`).

- **New dependency: Recharts.** Checked via `npm audit` before adopting
  (same discipline as the CSV-vs-xlsx call in item 3) - zero new
  vulnerabilities; the only audit findings remain the pre-existing
  Next.js/PostCSS ones from before this round.
- New `/analytics-sales` page (nav: "Sales Analytics") - first of 5
  planned Analytics pages (Sales/Revenue, Channel Performance, Product
  Performance, Inventory Trends, Loss/Gain Trends - each its own page,
  per the owner's preference).
- Granularity toggle (Daily/Weekly/Monthly) and date-range presets
  (Today/This Week/This Month/This Year/All Time/Custom), defaulting to
  This Month - applies to every chart in the suite going forward, not
  just this page.
- Break down by: Overall, Channel, Customer Group, Brand, or Product
  (top 5 by revenue) - a stacked bar chart with one series per category.
- Every bar has a hover tooltip (exact values per series) and is
  clickable - clicking opens a detail table of the actual orders/line
  items behind that specific bar, both required per the owner's spec,
  not just one or the other.
- **Real bug caught during live verification:** the daily/weekly bucket
  keys were built with `Date.toISOString()`, which is UTC-based. The
  database stores timezone-naive timestamps, so two orders on
  genuinely different local calendar days (verified via direct SQL:
  Sep 13 and Sep 14) were merging into a single mislabeled bucket in
  the browser's local timezone (EDT). Fixed by building bucket keys
  from local date components (`getFullYear`/`getMonth`/`getDate`)
  throughout, matching the local-time convention the rest of this
  codebase already uses elsewhere (e.g. the Orders page's own date
  presets) - verified live after the fix: two correctly separated bars
  appeared, each matching a direct SQL sum exactly ($7569.78 and
  $6215.96).
- Verified live: default view totals ($13,785.74) match the same
  company-wide figure already proven correct on the Customers page;
  click-to-drill-down on a bar returned exactly the 20 real orders for
  that day, summing to the bar's own value; Channel breakdown's stacked
  tooltip (Amazon/Shopify/Walmart/Wayfair) summed to the same day total.
  Read-only page - no test data to clean up.

## Analytics suite, page 2 of 5: Channel Performance (2026-09-16)

- New `/analytics-channels` page (nav: "Channel Analytics") - Wayfair
  vs. Walmart vs. Amazon vs. Shopify (any channel with real order data),
  same Daily/Weekly/Monthly + date-range controls as page 1.
- **Channel Summary table**: orders, revenue, current active/inactive
  status, last sync time, and sync run/failure counts for the selected
  range, side by side per channel - the "sync health" half of the ask
  that isn't naturally a time-series chart.
- **Revenue/Orders by Channel Over Time**: a stacked bar chart, one
  series per channel, with a Revenue $ / Order Count metric toggle.
- **Sync Health Over Time**: a second stacked chart (from `sync_logs`)
  showing success vs. failed sync runs per period.
- **A real Recharts API gap found and fixed during live verification:**
  the chart-level `onClick` handler on `<BarChart>` does not carry
  `activePayload` in this Recharts version - confirmed by temporarily
  logging the actual click-event state, which came back with only
  `activeIndex`/`activeLabel`/`activeTooltipIndex`/`isTooltipActive`,
  no payload at all. That meant clicking a stacked segment couldn't
  identify *which* channel's segment was clicked. Fixed by moving the
  click handler onto each individual `<Bar>` instead (one per channel),
  reading the clicked segment's own `payload.key` - simpler and more
  precise than trying to extract it from the chart-level event, and now
  the correct pattern for every stacked-series drill-down still to come
  in this suite (Product, Inventory, Loss/Gain Trends pages).
- Verified live end-to-end: Channel Summary orders/revenue match the
  same real totals already proven on page 1 and the Customers page;
  clicking a Wayfair segment returned exactly its 5 real orders,
  summing to the segment's own tooltip value ($2069.94) exactly; the
  Order Count metric toggle showed 5/5/5/5 orders per channel for
  Sep 13, matching the known 20-order day total. Read-only page, no
  test data to clean up.

## Analytics suite, page 3 of 5: Product Performance (2026-09-16)

- **Data gap found before building anything:** `order_items` (the line
  items a product-level report has to be built on) only covered 4 of
  the 57 real seeded orders - 53 orders had a `total_amount` but no
  per-SKU breakdown at all, which would have made a Product Performance
  page nearly empty and not representative. Flagged this to the owner
  instead of shipping a misleading page. Owner's call: generate dummy
  order + order_item test data spread across several months for the
  real SKUs, and keep it in place (not a one-round throwaway like the
  `xlsx` test files) so every analytics page - this one and the ones
  still to come - has enough volume and date spread to actually
  exercise the Daily/Weekly/Monthly toggles and the top/bottom-seller
  math.
- **Test data added, retained on owner's instruction:** 180 orders
  (`order_number` prefixed `TEST-ORD-`) and 364 order-item lines across
  all 15 real product SKUs (the leftover `TEST-SKU-001` test product
  excluded), dated across ~6 months (2026-03-20 through 2026-09-15).
  Generated with Postgres `hashtext()`-derived values keyed off each
  order's id so channel/status/date/product/qty/price are all
  deterministic per row - caught and fixed a real bug here too: a first
  attempt used a `random()` call inside an uncorrelated `LATERAL`
  subquery for the order date, which Postgres evaluated once and reused
  for all 180 rows (every order got the identical timestamp instead of
  a spread). Deleted that batch and regenerated with per-row-correlated
  hashing instead. Each order's `total_amount` is kept in sync with the
  sum of its own line items.
- New `/analytics-products` page (nav: "Product Analytics") - Daily/
  Weekly/Monthly + date-range controls as pages 1-2, plus a Revenue $ /
  Units / Margin $ metric toggle and a Brand filter.
- **Totals strip**: units sold, revenue, COGS, margin $, and blended
  margin % for the selected range/brand.
- **Top Sellers / Bottom Sellers leaderboards**, side by side, ranked
  by whichever metric is selected - built from the full real product
  catalog (not just SKUs with sales), so a true zero-seller shows up in
  Bottom Sellers with $0/em-dash margin rather than being silently
  excluded. Clicking any row drills into that SKU's full order-line
  history for the current range.
- **{Metric} by Brand Over Time**: a stacked bar chart, one series per
  brand (the same per-`<Bar>` `onClick` pattern fixed on page 2, reused
  here without needing to rediscover it), drilling into that brand's
  order lines for the clicked period.
- Verified live against direct SQL, all exact: This Month totals (53
  units / $11,813.47 revenue / $6,618.47 margin); an All Time total
  (624 units / $152,346.96 revenue / $84,486.96 margin, 55.5% blended);
  a chart-segment click (Kingsley, Jul 2026, 8 lines summing to exactly
  $2,909.85); a leaderboard-row click (BC-CRIB-001, 22 lines, 46 units,
  $29,987.54, matching the leaderboard row exactly).

## Analytics suite, pages 4 and 5 of 5: Inventory Trends and Loss/Gain Trends - suite complete (2026-09-16)

- **A bigger version of the same data gap, found before building
  anything:** every inventory event-history table - `inventory_audit_log`,
  `inventory_adjustments`, `inventory_counts`, `inventory_qc_holds`,
  `inventory_transfers`, `batch_movements` - had zero rows. Only the 5
  real static batches existed (today's snapshot, no history at all), so
  there was nothing to plot a trend from. Flagged to the owner before
  building rather than shipping empty charts. This one was a bigger call
  than page 3's gap because the backfill would also show up on the
  already-shipped Inventory Mgmt/Adjustments/Loss-Gain Report pages, not
  just a new analytics page. Owner's call: generate and keep dummy
  inventory event history, same as the page-3 order backfill.
- **Historical inventory events added, retained on owner's instruction:**
  70 adjustments (LOSS/GAIN, real reason codes from the Adjustments
  page's own dropdown), 20 QC holds, 11 completed transfers, and 45
  physical counts, spread across the 3 real warehouses and the 15 real
  SKUs over the same ~6-month window as the order backfill. All marked
  with a `Historical backfill - analytics trend data (2026-09-16)` note
  and generated with the same `hashtext()`-per-row-id determinism used
  for the order backfill. Deliberately does **not** touch the real
  batches' or batch_locations' current-state columns - this is
  reporting/trend history layered on top, not a replay that mutates
  today's real on-hand quantities. One data-quality fix made along the
  way: a first pass left a few backfilled transfers sitting in
  `IN_TRANSIT` status from months ago, which would have shown up as
  currently-in-progress on the live In Transit bucket - updated those to
  `COMPLETED` since they're historical events, not active ones.
- New `/analytics-inventory` page (nav: "Inventory Trends") - Daily/
  Weekly/Monthly + date-range + warehouse filter controls.
  - **Current Inventory Snapshot**: a live (not date-filtered) read of
    all 5 inventory buckets from the Warehouse/Inventory Management
    module - On-Hand, Unassigned, In Transit, On the Water, QC Hold -
    plus a Total in System figure. This also happens to be the first
    place in the app showing that combined total; the owner's original
    ask for it on the `/inventory` page specifically is still open.
  - **Warehouse Activity Summary**: adjustments/net $/transfers/QC
    holds/counts per warehouse for the selected range.
  - **Inventory Activity Over Time**: a stacked bar chart, one series
    per event category (Adjustments, Transfers, QC Holds, Counts),
    reusing the per-`<Bar>`-onClick drill-down pattern from pages 2-3 -
    clicking a segment shows that category's events for the period.
- New `/analytics-loss-gain` page (nav: "Loss/Gain Trends") - takes the
  existing `/inventory-loss-gain-report` snapshot view (company/
  warehouse/reason breakdowns, which it reuses almost verbatim) and adds
  the Daily/Weekly/Monthly time-series treatment every other page in
  this suite has: a Loss $ vs Gain $ (or Units) stacked-over-time chart
  with the same click-to-drill pattern, plus a Value $ / Units metric
  toggle and the by-warehouse and by-reason tables underneath.
- Verified live against direct SQL, all exact matches: the Current
  Snapshot (460 on-hand + 4 QC hold = 464 total, matching
  `batch_locations` and `inventory_qc_holds` directly); a chart-segment
  click on page 4 (QC Holds, May 2026, 4 events, same dates/quantities/
  reasons/statuses as the database); the All Time company totals on
  page 5 ($22,700.00 loss / 234 units, $9,330.00 gain / 88 units); the
  By Warehouse breakdown (three warehouses' loss/gain sums add up to
  the same company totals exactly); and a chart-segment click on page 5
  (Loss, Aug 16: BC-CRIB-001, NJ/WH100, Damaged/Broken, qty 2, $550.00,
  matching the database row exactly).

**This completes the Analytics/graphs suite (roadmap item 4 of 6).**
All 5 pages shipped: Sales/Revenue Trends, Channel Performance, Product
Performance, Inventory Trends, Loss/Gain Trends. Remaining roadmap
items: 5 (mobile app, read-only) and 6 (hardening/backups).

## Read-only mobile app (PWA) - roadmap item 5, first pass (2026-09-16)

- **Tech-stack decision: a Progressive Web App on the existing Next.js/
  Supabase app, not a native React Native app.** No app store, no Apple/
  Google developer account (neither exists in this environment), no
  separate codebase - installed via the phone browser's own "Add to Home
  Screen." Full reasoning and the native-app alternative laid out for the
  owner in `decisions/002-phase1-hardening-and-phase2-plan.md` under
  "Mobile app: PWA approach and build."
- New `public/manifest.json` (name, icons, `start_url: /m/dashboard`,
  `scope: /m/` so only the mobile pages are installable, not the whole
  desktop app) plus hand-generated PNG icons (a simple blue-and-white "P"
  square, generated via .NET System.Drawing from PowerShell - no design
  tool available).
- New `src/components/MobileLayout.tsx` shared shell (compact header,
  manifest/theme-color meta tags scoped to `/m/*` only, a fixed bottom
  tab bar with inline SVG icons - no new icon library dependency) and
  four new pages under `src/pages/m/`: Dashboard (stats, recent orders,
  sync status), Inventory (read-only stock by warehouse, tap to expand),
  Orders (recent list + detail modal), Sync Status (channel health,
  recent sync runs). All reuse the same Supabase queries and tenant_id
  filtering as their desktop equivalents, laid out as tappable cards
  instead of tables for a 375px screen. A discovery link was added to
  the bottom of the desktop `/dashboard` page pointing at `/m/dashboard`.
- **A real bug found and reverted before shipping:** a first attempt also
  added a minimal no-op service worker and registered it globally in
  `_app.tsx` (Android's automatic "installable" PWA criteria generally
  want one). Registering it broke every page in the app, not just the
  new mobile ones - every page hung indefinitely at the auth-check
  spinner, confirmed by removing the registration (fixed instantly) and
  re-adding it (broke again, reproducibly). Given the blast radius of
  getting this wrong - a hung service worker breaking the entire live
  app for every user - versus the marginal benefit (Add to Home Screen
  already works without one on iOS entirely, and on Android via the
  browser's manual menu), the service worker was deleted rather than
  shipped. The app is a plain manifest-only PWA with no service worker.
- Verified live at a 375px mobile viewport: all four pages render real
  data; Dashboard stats match the desktop dashboard exactly; Inventory's
  CN-MATTRESS-001 expand showed exactly 195 units at NJ/WH100, matching
  a direct database check; bottom-tab navigation, the order detail
  modal, and inventory expand/collapse all confirmed working.
- Analytics suite pages were deliberately left off this first mobile
  pass (dense click-to-drill charts designed for desktop width; adapting
  them to phone width is its own scoping question). Full read/write
  mobile access remains Phase 3+, unchanged, not started.

## Documentation housekeeping: decisions log moved into git (2026-09-16)

Owner asked why the local `decisions/` folder and the Drive milestone
docs use different naming conventions - honest answer was they grew
independently (a numbered-kebab-case ADR style locally vs. matching the
ALL_CAPS style of the original pre-existing Drive planning docs), never
reconciled. That surfaced a bigger issue while answering: `decisions/
002-phase1-hardening-and-phase2-plan.md`, the single richest "why"
document for this project, existed ONLY in the local planning folder -
not git-tracked, not on Drive, a single point of failure on one machine.

Fixed: moved it to `docs/decisions/002-...md` in this code repo (git-
tracked, same durability as this file), leaving a short pointer stub at
the old planning-folder location so a future search there finds it
instead of two diverging copies. Deliberately a move, not a synced-copy
pair like this CHANGELOG's own two-copy setup - that pattern already
caused a real drift bug once (see below), not worth repeating for a
second file.

Also published one evergreen `NESTORA_PULSE_PROJECT_STATUS` doc on
Drive - updated in place going forward rather than superseded by a new
dated snapshot each time, so there's a single current-state page to
read first instead of reconstructing status from a dozen individual
milestone docs.

**A real gap found while documenting where things live, not yet
fixed:** only 1 of the 17 migrations actually applied to the live
Supabase database is captured as a git-tracked `.sql` file
(`supabase/migrations/001_initial_schema.sql`); the other 16 were
applied directly to the live database this session via tooling and
never written out locally. If the Supabase project were ever lost, the
schema could not be fully rebuilt from git alone. Flagged in the new
status doc as a known item for the hardening/backups phase (roadmap
item 6) - not fixed in this round, scope wasn't asked for.

## Full three-way backup: code, schema, and docs on local + GitHub + Drive (2026-09-17)

Owner's explicit ask: everything - code, database schema, and
documentation - should be recoverable from any of three places (local
machine, GitHub, Google Drive), not just one.

**Schema backup gap (flagged 2026-09-16) fixed, not just documented
this time.** Pulled the exact SQL text of all 17 migrations actually
applied to the live Supabase project directly from Supabase's own
`supabase_migrations.schema_migrations` table (which stores the raw
statements of every migration it has ever run) and wrote each out as a
properly named, git-tracked file under `supabase/migrations/` -
`<timestamp>_<name>.sql`, matching the Supabase CLI's own naming
convention. **Found something worse than "missing" while doing this:**
the one local migration file that did exist
(`supabase/migrations/001_initial_schema.sql`) was not a partial
version of the current schema - it was a *different, obsolete* schema
from the original Sept 9 plan that was explicitly superseded by the
Sept 13 "clean restart" (see `docs/decisions/002-...md`'s "Doc
conflicts" section). Anyone trying to rebuild the database from that
file alone would have gotten the wrong schema entirely, not just an
incomplete one. Replaced it with the real 17-file history.

**Code and schema backed up to Google Drive.** Zipped the working tree
(excluding `node_modules`/`.next`/`.git` - GitHub already holds full
version history, so this is a snapshot copy, not a second history) and
uploaded to the same Drive folder as the planning docs. The zip
includes the now-complete `supabase/migrations/` folder, so the schema
backup lives in both places (git-tracked file history, and inside this
Drive snapshot) as asked.

**Documents also copied to Drive as readable files, not just inside
the zip** (the "why" document specifically requested, plus the
changelog for the same reason - a zip isn't something you can open and
read without extracting it first): `docs/decisions/002-phase1-
hardening-and-phase2-plan.md` and `docs/CHANGELOG.md` both uploaded as
their own Drive files, alongside the existing `NESTORA_PULSE_PROJECT_
STATUS` evergreen page and the dated milestone snapshots.

**What's still NOT backed up anywhere but the live database, worth
knowing:** the actual row data (real orders, real inventory batches,
the test-data backfills from the Analytics suite work, etc.). This
round covers code and schema *structure* only, matching what was
asked; a full data export (`pg_dump`-style) is a related but separate,
larger task if ever wanted.

## A note on this file's own history

`docs/CHANGELOG.md` in this code repo and the mirror copy at
`C:\Users\chinn\Desktop\Claude\Nestora\Pulse\docs\CHANGELOG.md` drifted
apart for several rounds (2026-09-14 through the first half of
2026-09-15) — only the planning-folder copy got updated in practice,
despite this file's own header claiming to be authoritative. Reconciled
on 2026-09-15 by merging both: the early Phase 1A sections above kept
this file's more detailed wording (it had specifics the other copy had
condensed away — the GitHub Desktop "Undo" behavior, the exact
`nestora-pulse` credential-rotation steps, the MS 365/admin-panel
deferral decision); everything from "Phase 2 (2026-09-14)" onward came
from the planning-folder copy, which was the only one kept current
through the two owner UI/UX feedback rounds and the dashboard/Products
taxonomy round. Both files now match exactly except for this section and
each file's own opening framing line. Going forward, update both copies
in the same turn rather than letting them diverge again.
