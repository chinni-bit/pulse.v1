# Decision 002: Phase 1A closeout, hardening priorities, Phase 2 scope

Date: 2026-09-14 (corrected 2026-09-14 — see "Doc conflicts" below)
Status: Phase 1A auth+dashboard shipped. This records what's next and why.

**Moved here 2026-09-16** from a planning-folder-only copy (previously
`decisions/002-...md`, outside git, on one machine only) so this survives
independently of any one machine — same reasoning as why `CHANGELOG.md`
lives here rather than only in the planning folder. This is now the single
copy; nothing else should be treated as authoritative.

## Doc conflicts found on review — read this first

Three planning documents disagree with each other and with what's actually
built. In order, oldest to newest:

1. `decisions/001-phase1-requirements.md` + `skills/phase-1-auth.md`
   (Sept 9) — the original plan. Channels: Amazon, Wayfair, **Target**,
   Walmart. Phase 1 scope: MS 365 SSO for staff, bi-directional Teams
   calendar/task sync, an admin panel UI, RLS-enforced isolation.
2. Google Drive "Clean Restart" docs (`START_HERE.md`,
   `01_REQUIREMENTS_BUSINESS.md`, Sept 12–13) — explicitly supersedes #1.
   Channels: **Shopify** + Amazon + Direct (no Wayfair/Walmart/Target).
   Drops MS 365/Teams/OAuth to "Phase 2+," drops RLS for app-level
   filtering.
3. **What's actually live** (`dashboard.tsx`'s hardcoded channel list,
   confirmed against the owner directly) — Amazon, Wayfair, Walmart.
   Auth-only scope, no MS 365/Teams, no RLS, no admin panel UI. Matches
   #2's simplified auth scope, not its Shopify channel choice, and doesn't
   match #1 at all.

**This doc now uses #3 (Amazon, Wayfair, Walmart) as the correct channel
list** — that superseded an earlier draft of this file that had copied
Target from doc #1 without cross-checking.

**Owner's call (2026-09-14): MS 365/Teams integration and a real admin
panel are deliberately deferred to a future, not-yet-scoped phase.**
Priority for now is core business logic (inventory + channel sync), kept
simple. Doc #1 (Sept 9) and its schemas/runbook/stale code copy have been
moved to `obsolete docs/` (both here and on Google Drive) so they stop
being a source of confusion — do not build from anything in that folder.
Doc #2 (Sept 12 "Clean Restart") remains the valid reference for what was
intentionally simplified out of Phase 1 (MS 365, Teams, RLS, admin panel);
its channel list (Shopify + Amazon + Direct) does not apply — #3 is
correct there too.

## Phase 1A: done

Auth (login only, admin-created accounts) + dashboard shell, live at
https://nestora-pulse-v1-phase1a.vercel.app. Full detail in
`docs/CHANGELOG.md`.

## Hardening — postponed to the last phase, revisit then

Owner's call (2026-09-14): these are real but not urgent enough to gate
Phase 2. Revisiting as a group before launch/production users, not now.

1. Password reset flow — UI/store hooks exist, nothing's wired to them.

## RLS — permanently off (owner's call, 2026-09-14)

**Decided, not deferred:** no RLS. App-level `tenant_id` filtering on every
query stays the permanent isolation model — not a temporary state pending
a "before launch" revisit. Not to be re-raised as an open item.

## Mobile app scope — resolved (owner's call, 2026-09-15)

Every prior doc (`01_REQUIREMENTS_BUSINESS.md`, `04_DESIGN_APPROACH.md`)
placed "Mobile app" in Phase 3 / out of scope. Owner's 2026-09-15 message
said it was now needed in "first phase," which contradicted those docs —
flagged rather than silently acted on (see `PHASE2_PROGRESS_STATUS_2026-09-15`
on Drive). Owner has now confirmed and clarified:

- **Phase 1: a read-only mobile app.** View-only access to the same data
  (inventory, orders, products, etc.) — no create/edit/delete from mobile.
  This was the original intent all along, not a new scope addition; the
  earlier docs' Phase 3 placement was for the *full* (read/write) mobile
  app specifically, not mobile access in general.
- **Phase 3 or later: full mobile app** (create/edit/modify from mobile) —
  as already outlined in the original documentation. Unchanged, not started.

Not yet scoped or built — this section records the decision so the next
round's planning starts from the right premise. When mobile work actually
begins, needs its own design pass (likely a separate read-only API surface
and UI, not a cut-down version of the admin web app).

## Mobile app: PWA approach and build — decided and shipped (owner's call, 2026-09-16)

**Tech-stack decision.** The requirement docs describe the read-only mobile
app functionally but never named a tech stack. Two real options were laid
out for the owner, plain-language since they were new to the tradeoff:

- **A mobile-optimized PWA on the existing Next.js/Supabase app** — new
  phone-first read-only pages served from the same app, installed via the
  browser's own "Add to Home Screen," no app store, reuses all existing
  auth/session/data logic directly.
- **A native app (React Native/Expo)** — a separate codebase and build
  pipeline; getting it onto a real phone at all (even just for internal
  testing) requires an Apple Developer account (99 dollars/year) for iOS
  and a Google Play account (25 dollars one-time) for Android distribution,
  neither of which exists in this environment, plus Apple's app review
  process for a public listing.

**Decision: PWA.** No app store, no developer account, no new codebase to
maintain — the standard pattern for an internal single-tenant ops tool like
this one. Owner explicitly authorized building this without a further
scoping round: "make best possible decisions enroute and document the
options and decisions."

**Scope for this pass** (owner dismissed the explicit menu but the build
follows the original requirements doc's stated MVP scope, since nothing
suggested widening it): Dashboard (stats + recent orders + sync status),
Inventory (read-only stock by warehouse), Orders (recent list + detail),
Sync Status (channel health + recent sync runs). The 5-page Analytics suite
was left off this first pass — those are dense, click-to-drill charts that
were designed for a full-width desktop layout; adapting them to phone width
is its own follow-on scoping question, not assumed into this round.

**What got built:**
- `public/manifest.json` (name, icons, `start_url: /m/dashboard`, `display:
  standalone`, `scope: /m/` so only the mobile pages are "installable," not
  the whole desktop app) + hand-drawn PNG icons (192/512/apple-touch, a
  simple blue square with a white "P" — no design tool available, generated
  via .NET `System.Drawing` from PowerShell).
- `src/components/MobileLayout.tsx` — shared shell: compact header, the
  manifest/apple-touch-icon/theme-color meta tags (scoped to `/m/*` pages
  only via `next/head`, so the main desktop app doesn't suddenly become
  "installable" under the mobile identity), and a fixed bottom tab bar
  (Dashboard/Inventory/Orders/Sync) with inline SVG icons — no new icon
  library dependency.
- Four pages under `src/pages/m/`: `dashboard.tsx`, `inventory.tsx`,
  `orders.tsx`, `sync.tsx`. All reuse the same Supabase queries and
  `tenant_id` filtering pattern as their desktop equivalents (`dashboard.tsx`,
  `inventory.tsx`, `orders.tsx`), just laid out as tappable cards instead of
  tables, since a wide table doesn't work at 375px.
- A discovery link added to the bottom of the desktop `/dashboard` page
  pointing at `/m/dashboard`, since there's no other way for the owner to
  find the mobile URL to open on their phone.

**A real bug found and reverted, not shipped:** first attempt also added a
minimal service worker (`public/service-worker.js`, deliberately
no-caching — a passthrough fetch handler only, since caching a live
inventory/orders dashboard risks silently showing stale numbers) and
registered it globally in `_app.tsx`, since Android's "installable" PWA
criteria generally want a registered service worker. Registering it broke
the entire app in testing — not just the new mobile pages, every page,
including ones that had been working seconds earlier — hanging indefinitely
at the auth-check spinner. Confirmed via testing: removing the registration
from `_app.tsx` fixed every page immediately; re-adding it reproduced the
hang. Root cause not fully isolated (plausibly specific to the sandboxed
automated-browser test environment's service worker support, but that
couldn't be verified against a real phone browser here), and the blast
radius of getting it wrong — a hung service worker breaking the *entire*
live app for every user, not just mobile visitors — was judged not worth
the marginal benefit, since "Add to Home Screen" already works without one
on iOS Safari entirely, and on Android Chrome via the browser's manual menu
option even without the automatic install-banner eligibility a service
worker would add. Service worker code was deleted; the app is a plain
static-manifest PWA with no service worker at all.

**Verified live:** all four mobile pages hit against real data at a 375px
viewport (iPhone-width), numbers cross-checked against the desktop
equivalents and, for inventory, against a direct query on a specific batch
(CN-MATTRESS-001: 195 on-hand at NJ/WH100, matching exactly). Bottom-tab
navigation, the order detail modal, and the inventory expand/collapse
interaction all confirmed working at mobile width.

## Analytics/graphs suite scope — decided (owner's call, 2026-09-16)

Item 4 on the roadmap the owner sequenced 2026-09-15/16 (Customers →
Inventory page → warehouse/inventory management → **Analytics** →
mobile app → hardening/backups), scoped in discussion before building,
same pattern as every prior item.

**Why now, not earlier:** every round since item 1 has deliberately held
real charts/graphs back — the Customers page (item 1) and the Loss/Gain
Report (item 3) both already show revenue/profit/loss numbers and
breakdowns, but as tables only. Building the visualization layer once,
consistently, instead of ad hoc per page, was the explicit reasoning
recorded at the time (see `pulse.v1/docs/CHANGELOG.md`'s "Customers /
Customer Groups management" and "Loss / gain reporting" entries). This
is that deferred work.

**Scope — 5 separate pages** (owner's explicit preference: separate
pages per topic, not one consolidated dashboard):
1. Sales/Revenue Trends — overall and by channel, customer/group,
   brand, product.
2. Channel Performance — Wayfair vs. Walmart vs. Amazon by period:
   orders, revenue, sync health.
3. Product Performance — top/bottom sellers, profit margins by SKU.
4. Inventory Trends — stock levels over time, turnover, slow-moving/
   aging inventory.
5. Loss/Gain Trends — the visual companion to item 3's tabular Loss/
   Gain Report: warehouse-level and company-level loss/gain over time,
   by reason. Added by the owner mid-discussion, not in the original
   four-area pitch.

**Every chart, every page:**
- A granularity toggle — daily / weekly / monthly (owner's explicit
  requirement, applies uniformly, not per-page-optional).
- Default view: current month.
- Hover shows data (tooltip); click drills into the underlying table
  rows for that point/range - both required, not just one.

**Chart library: Recharts.** Considered Recharts, Chart.js (via
react-chartjs-2), and Apache ECharts. Verified via actually installing
each realistic candidate and running `npm audit` before deciding — same
discipline as the CSV-vs-xlsx call in item 3 (that incident is exactly
why this got checked before picking, not after). Recharts came back
with zero new vulnerabilities (the only audit findings are the
pre-existing Next.js/PostCSS ones from before this round, unrelated).
Picked over the alternatives because: it's a true React component
library (charts are JSX, not a canvas wrapped in a ref, which fits how
the rest of this app is built) and it has first-class `Tooltip`
(hover) and `onClick` (click-to-drill-down) support on every chart
element - not bolted on, which is exactly what the interactivity
requirement above needs.

**Build order** (proposed, not separately re-confirmed after the owner
said "get going"): Sales/Revenue first (most foundational, reuses
patterns already proven in the Customers page's analytics), then
Channel Performance, Product Performance, Inventory Trends, Loss/Gain
Trends last.

## Hardening pass (2026-09-14) — done

- ✅ **Old exposed Supabase `service_role` key rotated** (owner) — the one
  leaked in the retired `nestora-pulse` repo's git history.
- ✅ **Old exposed Azure AD client secret** — owner deleted the app
  registration itself (`Nestora Pulse-OLD`, in Azure Portal → App
  registrations → Deleted applications), which invalidates its secret
  along with it. Nothing live depended on it (MS 365/Teams deferred), so
  no follow-up config change needed.
- ✅ **Current project's `SUPABASE_SERVICE_ROLE_KEY`** (unblocks
  `/admin/users` "Create User") — added to Vercel Production as a Secret
  variable and redeployed, and to local `.env.local`. Value not
  duplicated in any doc; `CREDENTIALS.md` records only status/location.

## Hardening — doing now (owner's call)

- ✅ **`dashboard.tsx`'s tenant filter bug** — fixed. Was filtering by
  `user.id` instead of the auth store's `tenantId` (plus two queries
  referencing database columns that don't exist), so every stat silently
  showed 0/empty. Verified against real data post-fix.
- ✅ **Session persistence across a hard reload** — resolved. Verified
  locally: 4/4 consecutive hard reloads on `/dashboard` after login stayed
  logged in with correct data, no bounce to `/login`. Turned out to be the
  same root cause as the earlier login-bounce-back bug (a redirect effect
  in `ProtectedRoute`/`index.tsx` firing before `checkAuth()`'s real result
  came back, since Zustand's default state is indistinguishable from
  "checked and logged out") — the `checked`-flag fix made while debugging
  that bug fixed this one too, as an unintended side effect. No new code
  was needed, just verification.

## Phase 2: Inventory CRUD + Channel Sync

- **Inventory CRUD** — products, variants, warehouses: list, add, edit,
  delete.
  - ✅ Products: done (`pulse.v1/src/pages/products.tsx`, list/add/edit/
    soft-delete, filtered by `tenant_id`, verified against live data).
  - ✅ Warehouses: done (`pulse.v1/src/pages/warehouses.tsx`, list/add/
    edit/delete — hard delete, since `warehouses` has no `deleted_at`
    column; a foreign-key violation from inventory still located there is
    caught and shown as a friendly message).
  - ✅ Variants: done, as inline bundle/component management on the
    Products page (expand a product row → add/remove
    `product_variants` rows linking it to another product with a type and
    quantity). Verified the insert and the FK-embedded select directly
    against the live DB via SQL (browser UI testing was limited this
    session — see note below).
- **Low-stock alerting** — ✅ done. Added `products.reorder_threshold`
  (migration, default 10, editable per product in the product form).
  Dashboard's Low Stock tile now computes real counts (available
  quantity per product vs. its threshold) instead of a hardcoded 0.
  Verified against live data: 11 of 15 seeded products currently have
  zero recorded inventory batches, so they correctly show as low stock —
  expected given how sparse the Phase 1 seed data is, not a bug.
- **A minimal admin UI for creating users** — ✅ built
  (`/admin/users` + `/api/admin/create-user`), but **blocked on a missing
  secret**: creating an auth user safely from a logged-in admin session
  requires the Supabase `service_role` key used server-side (the anon key
  can't do this without hijacking the admin's own session). See
  "Blocked — needs owner input" below.
- **Channel sync — Wayfair + Walmart first** (owner's call, 2026-09-14;
  Amazon deliberately not in this round). **Connection layer done,**
  product/order sync not started yet.
  - ✅ Owner provided sandbox API credentials for both (2026-09-14),
    stored only in `.env.local` (gitignored, never committed, never sent
    to the client).
  - ✅ `/channels` page — per-channel "Test Connection" button + a
    `sync_logs` activity feed. Both channels verified live end-to-end
    (direct HTTP against the running app with a real session, bypassing
    the flaky browser — see testing note below): OAuth token exchange
    succeeds for both, a `sync_logs` row lands in the database each time.
  - **Wayfair specifics:** confirmed **sandbox-scoped** — the production
    audience returns "Invalid environment for application" with this
    key; a real production key would be a separate request to Wayfair
    when ready to go live. Wayfair's actual data API is GraphQL
    (`{sandbox.}api.wayfair.com/v1/graphql`), not REST. Introspection
    against the sandbox confirms 4 queries are reachable:
    `getCastleGatePurchaseOrders`, `getCastleGateWarehouseShippingAdvice`,
    `getDropshipPurchaseOrders`, `labelGenerationEvents`. The token's full
    JWT scope list (decoded, not yet exercised) also grants inventory
    read/write and catalog read — full list in `CREDENTIALS.md`.
  - **Walmart specifics:** OAuth confirmed working
    (`sandbox.walmartapis.com/v3/token`, Basic-auth'd per Walmart's
    documented flow). Not yet exercised beyond token issuance — which
    real endpoints (items, inventory, orders) this sandbox key can reach
    isn't confirmed yet.
  - ✅ **Wayfair order pull — done.** `getDropshipPurchaseOrders` schema
    discovered via live introspection (GraphQL: `poNumber`, customer/
    `shipTo` fields, a `products[]` array with `sku`/`quantity`/`price`/
    `totalCost`/`isCancelled`). Route:
    `/api/channels/sync-wayfair-orders`, button: `/channels` page's "Pull
    Orders". Inserts into `orders` (idempotent — checks
    `channel_order_id` first, so re-running is safe and won't duplicate);
    each line item is matched to a local product by exact SKU (skipped
    and counted, not silently dropped, if unmatched — `order_items
    .product_id` is `NOT NULL`, so an unmatched item can't be inserted).
    **Verified live, twice:** first run pulled 25 sandbox POs (0 line
    items matched real products — expected, sandbox SKUs like
    `SWBE1162` don't correspond to Nestora's real catalog; 27 counted as
    unmatched). Second run against the same data correctly created 0 and
    skipped all 25 as already existing — idempotency confirmed, not just
    assumed. Data spot-checked directly in the database.
  - ✅ **Cancelled-order handling — done.** Added `order_items
    .is_cancelled` (migration). A PO where every line item is cancelled
    is now stored as `orders.status = 'CANCELLED'` (Wayfair has no
    order-level cancelled flag — inferred from all line items, same as
    Wayfair's own dashboards); cancelled line items are excluded from
    `total_amount`. Re-running the sync now reconciles existing orders'
    status/total against Wayfair's current data instead of unconditionally
    skipping them, so a cancellation that happens after the initial pull
    gets caught (deliberately scoped to status+total, not a full
    line-item diff, on resync). **Verified live against a real bug the
    first version of this sync had shipped:** PO `CS415879622` (both
    line items cancelled) had been stored as a normal `PENDING` $1,165
    order. Three sync runs in sequence: run 1 corrected the status to
    `CANCELLED` (total still stale at $1,165 — that fix landed a moment
    later); run 2 caught the stale total and corrected it to $0; run 3
    showed 0 changes across all 25 orders, confirming the fix converges
    to a stable state rather than re-flagging the same order every time.
  - ✅ **Walmart order pull — done.** Schema discovered live against the
    sandbox (REST, not GraphQL: `GET /v3/orders`, `WM_SEC.ACCESS_TOKEN` +
    `Bearer` auth both required, `list.elements.order[]` with
    `orderLines.orderLine[]`). Route: `/api/channels/sync-walmart-orders`,
    same "Pull Orders" button pattern, same cancellation logic as Wayfair
    (a line is cancelled if any `orderLineStatus` entry has
    `status: 'Cancelled'`; all lines cancelled → order `CANCELLED`,
    cancelled value excluded from `total_amount`; existing orders
    reconciled on resync, not just skipped).
    **Found and fixed a real bug during verification:** Walmart's sandbox
    returns `chargeAmount.amount` as a plain number for some orders and a
    numeric *string* for others. JS's `+` does string concatenation when
    either side is a string (`0 + '10'` → `'010'`, not `10`), so summing
    line totals with this mixed-type field produced wrong values —
    Postgres's `numeric` column happened to parse the corrupted string
    correctly on insert (no stored data was ever actually wrong), but the
    very next sync run compared a fresh string total against the stored
    numeric value, saw a false mismatch, and reported a spurious "update"
    every time. Fixed with explicit `Number(...)` coercion.
    **Verified live, four runs:** first diffed two raw API fetches
    before writing any code to confirm the sandbox data itself is static
    (it is — this wasn't sandbox flakiness). Run 1 created all 12 sandbox
    orders, correctly marking 7 `CANCELLED` (one had a real `Cancelled`
    line status in the raw data). Run 2 (before the type fix) falsely
    reported 4 "updated" due to the string-concat bug — confirmed via
    direct query that the underlying data was fine regardless. Runs 3
    and 4 (after the fix) both showed 0 created, 0 updated, 12
    unchanged — confirmed stable.
  - ✅ **Inventory push — done for both.** Reads `product_mappings` for
    the tenant/channel, pushes each mapped product's available quantity
    as an absolute on-hand quantity (Wayfair's `TRUE_UP` feed kind,
    Walmart's `PUT` — both replace the value outright, not a delta).
    `product_mappings` has no rows yet and no UI to add them — both
    routes correctly report "0 mapped products, nothing to push" rather
    than silently no-op'ing; there's no product-to-channel-SKU linkage
    feature built yet (see "Blocked" below).
    **Walmart:** `PUT /v3/inventory?sku=X` — verified live, no extra
    account config needed beyond the Client ID/Secret already required
    for auth.
    **Wayfair — reports inventory per warehouse, not per account.**
    Original design pushed one aggregate quantity per product using a
    single account-wide supplier ID; owner corrected this (2026-09-14):
    Wayfair assigns a **separate supplier ID per fulfillment warehouse**
    (they use it to compute shipping cost and decide sourcing/pricing
    per warehouse), and a single push normally carries multiple items
    for the same SKU tagged with different supplier IDs. Rebuilt around
    that: added `warehouses.wayfair_supplier_id` (migration), set from
    real values the owner provided — NJ/WH100 → 81454, MS/WH800 → 81852
    (WFS/WH200, Wayfair's own 3PL warehouse, deliberately left unset —
    Wayfair holds that inventory themselves via CastleGate). Manageable
    per warehouse right on the existing Warehouses page (add/edit form +
    table column) — no separate admin section needed for one field.
    The push now builds one item per (mapped product × configured
    warehouse) pair, using `batch_locations` (the per-warehouse
    breakdown of `inventory_batches` — a batch has no warehouse of its
    own, it's split across locations via that table) for each pair's
    quantity, defaulting missing combinations to 0 rather than omitting
    them so a warehouse that sold out gets reported accurately. All
    items go in a single combined mutation call, matching the owner's
    "one upload, different supplier IDs" description.
    **Found and fixed a real bug during this verification:** the
    mutation processes asynchronously, so `result.itemCount`/
    `errorCount` reflect completion state at the instant the call
    returns — always ~0 right after submitting regardless of outcome
    (confirmed live: an earlier run that got a real "Invalid supplier
    id" rejection still showed `errorCount: 0`). Only `errors[]` is
    populated immediately. Switched to counting from `errors[]` and the
    submitted item list instead, which had been silently under-reporting
    every successful push as 0 items.
    **Verified live end-to-end:** temporarily split one real product's
    two inventory batches across NJ (95 units) and MS (42 units) via
    `batch_locations`, mapped it to a Wayfair sandbox SKU, ran the push —
    correctly submitted 2 items (same SKU, supplier IDs 81454 and 81852),
    0 errors. Walmart verified separately the same way (1 mapped, 1
    pushed, the real API echoed the quantity back). Both channels'
    outcomes correctly recorded in `sync_logs`; all temporary test rows
    cleaned up after.

## Blocked — needs owner input

1. ✅ **`SUPABASE_SERVICE_ROLE_KEY`** — resolved 2026-09-14, see "Hardening
   pass" above. Added to both `.env.local` and Vercel (Secret type).
   **Verified live:** direct HTTP against the local dev server (real admin
   session token, bypassing the browser) hit `/api/admin/create-user` and
   it worked end-to-end — created the `auth.users` row and the matching
   `public.users` profile row with the correct `tenant_id` and role.
   Test account deleted from both tables afterward. `/admin/users`
   "Create User" is fully unblocked.
2. **Production Wayfair credentials** — current key is sandbox-only.
   Getting a production key is a separate request to Wayfair, needed
   before real Wayfair sync can go live (sandbox is fine for building
   and testing against in the meantime). Note: a production key would
   still need real production supplier IDs per warehouse — the sandbox
   ones (81454, 81852) the owner gave may or may not be the same values
   used in production; worth confirming with Wayfair when that key is
   requested.
## Channel SKU mapping — done (2026-09-14)

Owner's question: do Wayfair/Walmart even need a SKU mapping, given they
likely accept/return the seller's own SKU directly? **Verified against
both channels' own documentation before building anything:**
- **Wayfair** — "Supplier Part Number" is explicitly the field the
  supplier sets themselves (not Wayfair-assigned), and Wayfair's own
  integration guidance says it should equal your internal SKU for
  correct sync. There's a separate "Wayfair SKU" that Wayfair does
  assign, but that's not what the inventory/order APIs key off of.
- **Walmart** — the `sku` field used in both the Orders and Inventory
  APIs is explicitly seller-assigned ("an arbitrary alphanumeric unique
  ID specified by the seller"), not a Walmart-issued code.

So by design, **both channels need zero mapping when the product's own
SKU is what's registered on that channel** — which is standard practice,
but not something guaranteed by the API; if Nestora's real Wayfair/
Walmart listings were onboarded under different codes historically, an
override is still needed for those specific products. (Can't confirm
either way without checking a real listing — the sandbox data is
unrelated to Nestora's real catalog.)

Built accordingly:
- **Default everywhere is now the product's own SKU** — both order-pull
  routes (line-item matching) and both inventory-push routes (which SKU
  to submit) fall back to `products.sku` directly. `product_mappings`
  is now purely an *override*, not a requirement — previously inventory
  push only pushed products that had an explicit mapping row at all,
  which was backwards.
- **New "Channel Listings" UI** on the Products page (`/products`, each
  product's expand panel — the "Variants" toggle is now "Channels /
  Variants" and shows both). Lists every configured channel, shows
  "using product SKU" by default, lets you set/remove a per-channel
  override.
- **Verified live:** ran a full 15-product Wayfair push with zero
  `product_mappings` rows in existence — 30 items (15 products × 2
  warehouses) pushed successfully using real Nestora SKUs directly, 0
  errors. Confirms the zero-config default actually works end-to-end,
  not just in theory. Added one temporary Walmart override, re-pushed,
  confirmed the route reported `overrideCount: 1` and that product's
  push succeeded. Override removed after verification; both order-pull
  routes re-run afterward with no regressions.

**Two things found along the way, worth knowing about:**
- **Walmart's sandbox enforces a real rate limit** — pushing 15 products
  back-to-back with no delay failed 4 of them
  (`REQUEST_THRESHOLD_VIOLATED`, HTTP 429). Added a 1-second delay
  between sequential pushes (Walmart's inventory endpoint is one SKU per
  call), which cut it to 1 failure out of 15 in a clean window — better,
  not eliminated. A larger catalog would need real retry/backoff
  handling, which isn't built; each failure is counted and reported per
  SKU, not retried.
- **This Walmart sandbox account's inventory GET doesn't reflect PUT
  writes** — confirmed directly (PUT quantity 12345, an immediate GET on
  the same SKU returned a static, unrelated value). The push code's
  correctness was verified via the PUT response itself and the route's
  own `overrideCount`/success reporting, not by reading inventory back.
  This looks like Walmart's "static" sandbox tier (canned mock
  responses) rather than the stateful "dynamic" one — worth knowing if
  future verification work assumes GET reflects prior writes here.

## A testing note for this session

Live browser UI testing was unreliable for a chunk of this session — the
in-app browser pane was backgrounded (`document.hidden: true`), which
throttles the page's own JS timers and made `checkAuth()` take 30–70+
seconds to resolve on every full navigation (confirmed via direct DOM
inspection: React *had* mounted and rendered correctly, it was just stuck
waiting). Server-side compiles and responses were fast and error-free the
entire time (checked directly via the dev server log and direct HTTP
requests, bypassing the browser). Where UI testing wasn't practical,
correctness was instead verified by running the equivalent queries
directly against the live database and reviewing the code against
already-proven patterns elsewhere in the app. Flagged here so a future
"is this actually tested" question has an honest answer — Products CRUD
got full UI testing; Warehouses got partial (list + add via UI, delete
verified via SQL); Variants and the admin Users page were verified via
SQL/direct HTTP, not click-through.

## Sequencing

Session persistence fix — done. Docs reorganized (obsolete plan moved out
of the way) — done. Inventory CRUD (products, warehouses, variants) and
low-stock alerting — done. Admin user creation UI — built, blocked on the
service-role key. Channel sync connection layer (Wayfair + Walmart OAuth,
verified live) — done; actual product/order sync — next up, suggested
starting point is pulling Wayfair dropship purchase orders. Everything in
the postponed hardening list waits for an explicit last-phase discussion.
MS 365/Teams and a real admin panel wait for an explicit future-phase
scoping discussion — not started, not assumed.
