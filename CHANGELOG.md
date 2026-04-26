# Roadmap OS — Changelog

## v1.45.0 — Matrix plotting, drag-drop, kanban initiatives, merge roadmaps, tooltips refresh (V14 fix queue)

A 13-fix sweep across the roadmap, matrix, kanban, checklist, and edit-product surfaces.

**Roadmap timeline & rows**
- **Drag-and-drop now actually moves rows between sections.** Drop indicators show the exact landing position. Drop on a section header to drop into that section. No displacement of other rows.
- **Sort keeps section titles visible.** Sorting by name / start / end / priority now reorders rows _within_ each section instead of flattening the list.
- **Range filter narrows the timeline columns AND filters rows.** This Quarter / This FY / YTD / etc. now shrink the visible quarters/months instead of leaving empty columns around the filtered initiatives.
- **Today line stays in Timeline view only.** Switching to Kanban removes the line; switching back redraws it.

**Prioritisation Matrix**
- **Items now plot.** Rows with no priority scores get a sensible default position (X = midpoint, Y = derived from priority) so they appear as draggable dots immediately. Drag to pin a custom score.
- **Select All checkbox** at the top of the items list toggles every row on/off the chart.
- **Display panel + items sidebar fit on screen.** Tightened the chart/items grid (`min-width:0` on both columns, items column trimmed from 320px → 280px) so the chart can breathe.

**Kanban view**
- **Cards are initiatives now**, not products. Each card carries the parent product name + section + priority. Cards drag between status columns to update the underlying initiative's status.
- **Today line is hidden** in Kanban view.

**Edit Product modal**
- **Initiative pill click → full editor.** Clicking a timeline pill now opens the complete row editor (revenue, labels, owner, comments, expected outcomes, attachments) with the clicked initiative scrolled into view + briefly highlighted. The trimmed bar modal still exists for legacy code paths.
- **Currency selector on Revenue/ROI** — 14 currencies. Preference persists in `appSettings.currency`.
- **Recording boxes removed** + the description / product-label fields stack vertically again (label-above-input).
- **Attachments now download.** Falls back from Electron to data/blob/HTTP URL to Supabase Storage download. Each attachment row has a dedicated download icon.

**Checklist**
- **Confetti + jingle when every item is Yes / N/A** — Web Audio API arpeggio (C5 / E5 / G5 / C6) wrapped in try/catch for autoplay-block browsers; auto-dismiss after 6s; fires once per transition to complete.
- **GTM Templates button → unified template library** (browse, select, import, save) instead of the saved-templates manager.

**CapacityIQ + Templates**
- **Every template card has a relevant SVG icon** — the unified library now respects each template's `icon` field instead of a single hard-coded glyph.

**Multi-roadmap**
- **Merge Roadmaps** option appears next to "+ New Tab" when 2+ roadmaps exist. Stack mode appends every section; Merge mode combines sections by name. Source/target re-id everything to avoid clashes.

**Follow / notifications**
- **Row kebab now reads "Follow product" / "Unfollow product"** with an accompanying **Follow section** entry. Section follow-state rides on `section.followers[]`. Section header has its own Follow icon-button.

**Tooltips**
- **Sidebar nav, dashboard cards, view toggles, dropdowns, modal Save/Cancel buttons** all have descriptive `title=` tooltips now (sweep across ~70 buttons). Tooltip count rose from 144 → 215.

## v1.44.0 — Products page (V13 fix queue, Phases 1-3)

A dedicated **Products** page in the top nav (between Roadmap and Checklist) — single source of truth for every product. Products *are* roadmap rows; new fields are populated lazily by `ensureProductFields(row)` so existing data is preserved.

**List view** (Phase 1):
- Two views — sortable table (11 columns) and responsive card grid
- Filters: type / lifecycle stage / status / free-text search across name+code+family+owner+tagline
- Summary bar: total / In Development / Live (GA) / Beta / total revenue / open bugs
- Status & lifecycle stage are derived from the existing `bars[]` colours; manual override wins

**Detail view** (Phase 2): clicking a product opens a hero header (image/icon + name + tagline + meta badges + Edit / Watch buttons) and an 8-tab body —
- **Overview** — visual lifecycle bar, snapshot stats, profile fields, recent activity list
- **Commercial** — revenue/cost/margin stat cards, pricing model fields, price-points table
- **Releases & Bugs** — release-note cards (version tag, features/fixes/improvements/breaking changes/known issues), bug tracker rows with severity dots and status select
- **Plan & Tasks** — pulls the linked plan, status-grouped stat cards, progress bar, top-12 task table
- **Specs** — conditional Hardware section (BOM/firmware/units/failure rate/RMA) for hardware/firmware/hybrid; Digital section (tech stack/hosting/SLA/DAU/MAU/compliance) for digital/hybrid; Quality & Support always shown
- **History** — vertical timeline with type-specific marker icons, filter chips for 10 event types
- **Documents** — auto-aggregates `documentRepository[]` items where `initiativeId === row.id`
- **Discussion** — read-only view of `row.comments[]`, with a CTA to add via the existing edit-modal flow

**Forms & state changes** (Phase 3):
- New / edit Release form (version, type, date, title, multi-line features / bug fixes / improvements / breaking changes / known issues, notes; delete from the same modal)
- New Bug form (title, description, severity, status, affected version, reporter, repro steps)
- New History entry form (type, date, title, description) — the bug-status select on the Releases tab also auto-logs to history
- Every save calls `pushCloudData()` and re-renders the active tab inline; helpers `_productPersistAndRefresh()` and `logProductHistory()` handle the round-trip

## v1.43.3 — Integrations placement + OAuth landing fix

A dedicated **Products** page in the top nav (between Roadmap and Checklist) — single source of truth for every product. Phase 1 ships the list view and data model:

- **Products = rows.** Each row in `rows[]` is treated as a product. New product fields (`productCode`, `version`, `productType`, `productFamily`, `tagline`, `pricingModel`, `pricePoints`, `revenueProjected/Actual`, `lifecycleStage`, `launchDatePlanned/Actual`, `releaseNotes[]`, `bugs[]`, `productHistory[]`, `hardwareInfo`, `digitalInfo`, `qualityMetrics`) are populated lazily by `ensureProductFields(row)` so existing data is preserved.
- **Two views.** Table (sortable columns: name, code, type, status, stage, priority, owner, revenue, open bugs, version) and card grid (responsive auto-fill).
- **Filters & search.** Type / lifecycle stage / status dropdowns plus free-text search across name, code, family, owner, tagline.
- **Summary bar.** Total products, In Development, Live (GA), Beta, total revenue, open bugs.
- **Status & stage inferred from existing data.** `_productInferStatus(row)` derives Released/In Progress/Delayed/At Risk/Strategy from the last bar's colour; `_productInferLifecycle(row)` maps that to a default lifecycle stage. Override-friendly — manually setting `lifecycleStage` wins.
- **History helper shipped.** `logProductHistory(rowId, {type, title, description, ...})` is callable now; auto-log hooks at row-edit / status-change sites land in Phase 3.
- **Clicking a product** routes to the existing edit modal for now. Phase 2 replaces this with a dedicated 8-tab detail page (overview, commercial, releases & bugs, plan, specs, history, docs, discussion).

## v1.43.3 — Integrations placement + OAuth landing fix

- **Integrations moved from top nav to the burger sidebar.** Top nav now ends at Insights; sidebar gets a chain-link icon entry below Insights.
- **OAuth callback now lands on the Integrations page**, not the dashboard. Provider callbacks redirect to `#integrations?connected=<provider>`, but the init-time hash router was matching the literal string `'integrations?connected=jira'` against `_PMR_OVERLAY_MAP` and falling through to the default roadmap view. Init now strips the `?…` query before the lookup and preserves it in the URL so `_handleIntegrationCallback()` can still read the `connected=` / `error=` params.
- **Single contact address.** All user-facing mailtos (refund, cancellation, support button, legacy static pages) now route to `hello@pmroadmapper.com`. Previously `billing@`, `support@`, and the legacy gmail address were sprinkled across the renderer and `web/static/*.html`. Admin/super-admin identity allowlists in the renderer and Supabase Edge functions are unchanged — those are auth checks, not contact addresses.

## v1.43.2 — verification pass

- Audited the historical 16-fix queue (`ROADMAP_OS_FIXES.md`) against the live build. All 16 items were already live (15 implemented, 1 — public Change Request nav entry — intentionally retired in v1.38.0). Findings logged in `FIX_LOG.md`.
- `APP_VERSION` constant in the renderer now matches `package.json` so `_appVersion` in fresh backup exports reflects the actual build.
- No functional or UI changes shipped.

## v1.43.1 — v12 polish batch

- **Add Task → Select All** on the Library, To-Do, and G2M source tabs (with per-source category checkboxes on G2M).
- **Hours field** loses the long inline help text; the explanation is now a hover-only `?` tooltip on the field label. The same `.pmr-tip` utility now powers any data-tip popover.
- **Plans Timeline view** — Filter button now opens a real status / priority / owner picker. The Unplanned counter toggles a filter that surfaces only tasks missing dates. The view has a visible bottom horizontal scrollbar.
- **Edit Team modal**: pulls the org-user pool from cap members + roadmap row owners + plan task owners, allows multi-team membership, supports a team logo (base64, ≤200KB) and rounds the corners cleanly. The team card on the Teams page now reflects the logo + member avatars.
- **Send-invite edge function** stops swallowing Resend errors. The actual API error (and a hint — "verify domain" / "RESEND_API_KEY rejected") flows back to the toast on the Edit Team invite form. Email template rewritten with Roadmap OS branding and the live `app.pmroadmapper.com` CTA.
- **CapacityIQ templates** — fixed a regression where having even one user-saved template ate the entire 35-template bundled platform set. Lists now merge cloud + bundled with id/name dedup.
- **CapacityIQ dashboard** adds a per-team capacity strip (capacity / allocated / available + utilisation bar) above the existing member breakdown. Members on multiple teams contribute to each.
- **Reports Dashboard**: Portfolio Overview tab removed.

## v1.43.0 — Closing the Loop: Expected Outcomes, Release Notes & Launch Feedback

A full closing-the-loop workflow tying *predicted* impact to *actual* impact, plus app-level release notes you can read inside the app and on the marketing site.

**Per-initiative**

- **Expected Outcomes** — new section in the row edit modal. Capture metric, target, units, timeframe, and a hypothesis up-front for every initiative. These are the success criteria the loop closes against.
- **Launch Outcomes & Release Notes** — also on the row edit modal. Stamp a release date and capture release notes for three audiences:
  - **Dev / technical** — what shipped and how
  - **Customer-facing** — what users will notice and gain
  - **Internal summary** — stakeholders, takeaways, next steps
- **Launch Outcomes report rewritten** (Reports → Launch Outcomes). Now an interactive view per shipped initiative with:
  - **Closing-the-loop table** — expected outcomes paired with actuals; capture the actual value, source (PM / Data / Customer / Sales / Support), and a status pill (Met / Partial / Missed / Pending).
  - **Release notes editor** — three audience tabs, save on blur.
  - **Feedback thread** — typed by source with optional sentiment (positive / neutral / negative). Sales call notes, customer replies, data signals all live alongside the launch they're about.
  - **Audience filter** — pivot the page between All / Dev / Customer / Internal.
  - **Include unreleased** — capture expected outcomes early.
  - **Export to Markdown** — concatenated release notes + outcomes table per shipped row, ready to send out.

**App-level release notes**

- **What's New** — new entry in the help FAB (bottom-right ? icon) opens an in-app modal that renders this CHANGELOG. A red dot on the FAB highlights when there's an unseen release; reading clears it.
- **Single APP_VERSION constant** — replaces stale `v1.36.1` (login footer) and `v1.29.0` (backup metadata) literals. Bump alongside `package.json` per release.
- **Marketing site /changelog** — same content, served at app.pmroadmapper.com/changelog.

**Templates parity (under-the-hood)**

- Unified template-task sync — every task in every template (CapacityIQ, platform DB, bundled JSON, custom) now lands in both the Task Library and CapacityIQ task types. Manual "↻ Re-sync template tasks" button on the CapacityIQ Task Reference page.
- Fixed bundled-template path for Electron — `data/platform-templates.json` is now reachable in the Electron renderer (was 404'ing relative to `renderer/index.html`).
- CapacityIQ Templates page now waits for the template library to hydrate before rendering, so all 35 bundled templates appear instead of just the two cached locally.
- Added `data/**/*` and `CHANGELOG.md` to electron-builder so packaged builds ship the JSON catalogue and release notes.

**Plan view polish**

- Sprint bar relabelled to **Plan progress** and centered.
- Gantt view fully dark-mode aware — alternating row stripes, grid lines, month labels, task names, and dependency arrows now switch with the theme instead of staying light-mode.

## v1.34.0 — v4 fix batch: import, Template Builder, docs, invites, back nav

See `FIX_LOG_V4.md` for full per-fix detail. Highlights:

- **Fix 1:** `restoreJsonBackup` rewritten with inline file input; confirm happens after parse; `pushCloudData` after apply. Fixes silent no-op on web.
- **Fix 2:** CapacityIQ templates page now renders a unified view pulling from `capData.templates`, the main template library (`_tplCache`), bundled platform templates, and user customs via a new `getAllTemplates()` helper.
- **Fix 3:** New reusable **Template Builder** modal (~480 lines). Two-column layout with Templates / Task Library tabs, cross-template task selection accumulator, context-aware import handlers for plans / todo / checklist / capacityiq, and Save as custom template. Used by Plans, To-Do, Checklist, and Capacity IQ.
- **Fix 4:** Document Repository now uploads real files to Supabase Storage (`attachments` bucket) via direct REST — drag+drop, 50 MB ceiling, download button per item. See `FIX_LOG_V4.md` for the one-time bucket SQL.
- **Fix 5:** New "Invite Your Teammates" onboarding step — email rows, Send Invites wires the existing `send-invite` edge function, Google Calendar harvester pulls last-30-days meeting attendees when the v1.33.0 Google Calendar connection is present.
- **Fix 6:** Global toolbar centering fix — every page toolbar now vertically centres its children.
- **Fix 7:** Plans → Templates button opens the Template Builder in `plans` context instead of the old Template Library overlay.
- **Fix 8:** Browser back navigation wired. `history.pushState` on every `openX` overlay, `popstate` handler closes modals first then navigates, `replaceState` on boot so the first Back press doesn't drop to the pre-login screen. Hash routing supported.

### Required backend actions (Vela)
- Create Supabase Storage `attachments` bucket + path-scoped RLS (SQL in `FIX_LOG_V4.md`).
- For Google Contacts integration: add `contacts.readonly` scope to the Supabase Google provider.

## v1.33.0 — Capacity Settings + Live Calendar Integration

**Highlights**
- ToDo-driven capacity view is now fully configurable — set your available
  hours per week once and every downstream view (weekly, monthly, yearly,
  timesheet target) follows.
- Real Google Calendar and Microsoft Outlook integration via OAuth scopes,
  replacing the screenshot-only workaround. Meetings land directly in your
  ToDo list with the right duration and date.
- Capacity + integration preferences now sync across Electron + web via the
  shared Supabase JSONB blob.

### Added
- `appSettings.capacity` — `{ hoursPerWeek, hoursPerDay, workDays }` with a
  new `getCapHours()` helper as the single source of truth.
- Inline hours-per-week editor at the top of the capacity view; updates
  propagate immediately to weekly/monthly/yearly breakdowns and the
  timesheet target.
- `appSettings.integrations.google` + `appSettings.integrations.microsoft` —
  persisted connection state, access token, and expiry.
- `connectGoogleCalendar()` / `connectOutlookCalendar()` — OAuth via
  Supabase with read-only calendar scopes
  (`https://www.googleapis.com/auth/calendar.readonly` for Google,
  `Calendars.Read` for Microsoft Graph).
- `fetchGoogleCalendarEvents(startISO, endISO)` — Google Calendar API v3,
  `calendars/primary/events?singleEvents=true&orderBy=startTime`.
- `fetchOutlookCalendarEvents(startISO, endISO)` — Microsoft Graph
  `/me/calendarview` (expands recurring series within the range).
- `_normalizeGoogleEvent` / `_normalizeGraphEvent` — unified event shape
  with quarter-hour rounded `duration`, source-tagged so imports can be
  de-duplicated.
- `syncConnectedCalendarsNow()` — fans out across both providers, degrades
  gracefully when one token is expired, and shows a preview modal before
  any ToDo is created.
- `openCalendarIntegrationModal()` — connection status page with Connect /
  Disconnect for each provider.
- Post-OAuth auto-navigation back to Capacity view (breadcrumbs via
  `sessionStorage.pmr_post_auth_goto`).
- `buildDataPayload().settings` — cross-device sync of capacity +
  integrations through the existing `roadmap_data` blob.
- `tests/capacity.test.js` — 22 pure-function assertions for the new
  helpers.
- `tests/renderer.parse.test.js` — V8 parse check of the full 1.3 MB
  inline renderer JS (catches hand-editing mistakes before they ship).
- `npm test`, `npm run test:capacity`, `npm run test:parse`,
  `npm run build:web` scripts.

### Changed
- `renderTimesheet` weekly target is derived from `getCapHours().hpw`
  instead of the old hardcoded 35 h.
- `renderCapacityMonthly` / `renderCapacityYearly` use `hoursPerDay` from
  settings instead of a hardcoded `* 8`.
- `_capacityHoursPerWeek` is now a live getter over
  `getCapHours().hpw` — kept as a legacy alias so any older call site
  reading it still works.
- `signInWithOAuth` in the custom Supabase shim now forwards
  `opts.options.scopes` so calendar scopes reach the provider.
- `_processOAuthFragment` captures `provider_token` /
  `provider_refresh_token` from the URL fragment when the round-trip was
  launched by a calendar connect flow.
- `loadProfileSettings` deep-merges the persisted `capacity` and
  `integrations` sub-objects so older per-device settings blobs still
  load cleanly.
- `persistData` now serialises capacity + integrations into
  `payload.settings` for cloud sync.

### Security notes
- Calendar tokens are stored only in the user's own `roadmap_data` JSONB
  row (already protected by FORCE RLS with user-id scoping). No service
  account, no shared secret, no server-side handling.
- Access is read-only for both providers.
- Tokens expire in ~1 hour; reconnect is a one-click flow rather than a
  refresh dance. The `refreshToken` field is present in the schema in
  case a future edge function wants to do server-side refresh later.

### Config prerequisites for live calendar sync
Before users can click *Connect Google Calendar* successfully you must
enable the calendar scope on the Supabase Google provider:

1. Supabase Dashboard → Authentication → Providers → Google → *Additional
   Scopes* → add `https://www.googleapis.com/auth/calendar.readonly`.
2. Google Cloud Console → OAuth consent screen → add the same scope to
   the OAuth client used by Supabase.
3. For Outlook: Azure Portal → App Registrations → *API permissions* →
   add `Calendars.Read` (Delegated). Grant admin consent.
4. Redirect URIs on both clients already include the Supabase auth
   callback — no change needed.

### Production RLS verification
Run this in Supabase SQL Editor to confirm the `teams` / `team_members`
SELECT policies are the tightened v20260409100000 versions:

```sql
SELECT schemaname, tablename, policyname, cmd, qual
  FROM pg_policies
 WHERE tablename IN ('teams','team_members')
   AND cmd = 'SELECT'
 ORDER BY tablename, policyname;
```

Expected for `teams`: policy name *Owners and members read teams* with
`qual` scoping to `created_by = auth.uid() OR id IN (…team_members…)`.

### Migration notes
No database migration is required. All changes are client-side and
layer onto the existing `roadmap_data` JSONB blob.
