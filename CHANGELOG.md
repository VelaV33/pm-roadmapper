# Roadmap OS — Changelog

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
