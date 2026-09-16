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
