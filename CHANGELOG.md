# Roadmap OS — Changelog

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
