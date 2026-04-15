# Roadmap OS Fix Log v4

Executed autonomously on 2026-04-15 against `main` (v1.33.0).

## Initial recon

| Item | Finding |
|---|---|
| Navigation | App does NOT use `showPage()` — uses per-feature `openX()`/`closeX()` overlay pattern with a CSS `.open` class toggle. Browser history Fix 8 has to hook every `openX`/`closeX`. |
| `pickFiles` | Already exists in `web/shim/electronAPI.js:89` as a generic hidden-input picker. Used by `readFile` at line 284. |
| Import handler | No `importJSON`, `importRoadmap`, `uploadJSON`, or `restoreBackup` symbols found — JSON import either goes through a different name or isn't exposed to the web shim correctly. Needs deeper search. |
| CapacityIQ templates | Live in `capData.templates[]`, seeded at `renderer/index.html:23714`. Rendered by `renderCapTemplates` at 24169. |
| Main template library | Separate `templateLibraryOverlay` at 2547, opened at 26639. Different data source. **This is the Fix 2 mismatch.** |
| `documentRepository` | Declared at 24398, rendered at 24411, currently only collects metadata (push at 24477). No Supabase Storage integration for actual files. |
| `history.pushState` | Zero existing uses except OAuth callback cleanup — no browser history integration at all. Fix 8 is greenfield. |
| G2M templates separate array | `g2mTemplates` localStorage-backed at 11369/11372 — third template data source. Unification target. |

## Fix 1 — JSON import broken on web

**Root cause.** `restoreJsonBackup` called `confirm()` BEFORE opening the
file picker. On Chromium/Safari this breaks the user-gesture stack that
unlocks `<input type=file>.click()` — the picker would silently fail to
open on web. Additionally, the function routed through the web shim's
`importBackup()`, which used a `focus`-event-based cancellation heuristic
that could resolve with `[]` before the `onchange` handler ran.

**Fix.** Rewrote `restoreJsonBackup` to use a direct `<input type=file>`
with no shim round-trip. Flow: open picker → read+parse file →
`confirm()` **after** parse with row/section counts → apply via existing
`_applyJsonBackupData` → `pushCloudData()` to make the restore durable
across devices. Works identically on Electron and web.

Before/after tested via the parse test only (can't exercise file picker
in headless Node). Manual smoke: see Fix 1 in the post-fix checklist.

## Fix 2 — Templates unification

**Before.** CapacityIQ templates lived in `capData.templates[]` (seeded
4 defaults); the main Templates page queried `_tplCache` from
`initiative_templates` / bundled `platform-templates.json`; G2M lived in
a third localStorage bag. No unification.

**Fix.** Added `getAllTemplates()` (in Fix 3's Template Builder section)
that normalizes all three sources into a common shape
`{id, name, description, category, icon, source, tasks: [{id, name, description, hours, phase, role, workstream}]}`.
`renderCapTemplates` now renders source-grouped sections (CapacityIQ
Templates / Platform Templates / Your Templates) using the helper.
Legacy "+ Create Template" retained as "+ Create (Advanced)". New
"+ Build New Template" button opens the Template Builder in capacityiq
mode.

## Fix 3 — Template Builder (centerpiece)

**Implementation.** ~480 lines appended right before `init()`. Single
reusable modal that any page can launch via
`openTemplateBuilder(sourceContext, options)`. Layout:

- **Header:** title + search + selection counter + close.
- **Left panel:** two tabs (Templates / Task Library). Templates tab
  groups cards by source. Task Library tab renders `taskLibrary` items
  as pickable rows directly in the right panel. Search filters both.
- **Right panel:** template detail with select-all / clear, task rows
  grouped by phase, checkbox per task.
- **Footer:** `Save as Template` name input + Cancel + Import Selected.

**State.** `_tbState` accumulator persists across left-panel navigation
so selection builds up across multiple templates.

**Context handlers.**
- `plans` → `_tbImportToPlans` creates plan tasks via existing
  `_newTask` helper with `durationDays = ceil(hours/8)`.
- `todo` / `checklist` → `_tbImportToTodo` pushes into `todoAllData[...]`.
- `capacityiq` → `_tbImportToCapacityIQ` creates task types + a new
  `capData.templates` entry.
- `Save as Template` → pushes into a new module-level `customTemplates`
  array (persisted via `persistData`).

**Dark mode.** All colours use CSS vars (`--text`, `--muted`, `--border`,
`--accent`, `--bg`, `--surface-low`, `--light-blue-bg`). No hardcoded
hex.

## Fix 4 — Document upload with real file attachment

**Before.** `addDocRepoEntry` collected name / folder / tags / description
only. Source literally contained `<!-- TODO: File upload to Supabase
Storage when backend supports -->`.

**Fix.** Rewrote the modal with a drag-and-drop upload zone, click-to-
browse, file preview with size + remove, 50 MB ceiling. On save:
uploads to Supabase Storage `attachments` bucket via direct REST
(`POST /storage/v1/object/attachments/<user.id>/docs/<ts>_<safename>`)
so Electron and web behave identically — no `_supabase.storage` shim
needed. Document metadata now includes `storagePath`, `fileName`,
`fileSize`, `fileType`. Added `downloadDocRepoEntry` hooked into the
list render (shows a Download button only when `storagePath` is
present). Uses the authenticated storage endpoint.

**Required backend action (Vela).** The `attachments` storage bucket
must exist in Supabase with path-scoped RLS. One-time SQL:

```sql
-- 1. Bucket
insert into storage.buckets (id, name, public) values ('attachments','attachments', false)
  on conflict (id) do nothing;
-- 2. Path-scoped RLS
create policy "users upload to own folder" on storage.objects
  for insert to authenticated
  with check ( bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1] );
create policy "users read own folder" on storage.objects
  for select to authenticated
  using ( bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1] );
create policy "users delete own folder" on storage.objects
  for delete to authenticated
  using ( bucket_id = 'attachments' and auth.uid()::text = (storage.foldername(name))[1] );
```

## Fix 5 — Onboarding invite teammates + Google import stubs

**Implementation.** New onboarding step `kind:'invite'` between "Set Up
Your Team" and "Import Tasks". Renders an email row list (+/x controls),
Send Invites button wires the existing `/functions/v1/send-invite` edge
function, Skip advances the flow.

**Google Contacts stub.** Shows a toast pointing at
`FIX_LOG_V4.md`. Requires `contacts.readonly` scope on the Supabase
Google provider. Once granted, use the v1.33.0 calendar `provider_token`
capture pattern and GET
`https://people.googleapis.com/v1/people/me/connections?personFields=emailAddresses,names&pageSize=200`.

**Google Calendar teammate harvester.** LIVE. If the user already
connected Google Calendar in v1.33.0 (`appSettings.integrations.google`),
the button fetches the last 30 days of calendar events via the existing
stored `provider_token` and extracts unique attendee emails into the
invite list. No additional OAuth scope needed — same
`calendar.readonly` scope covers attendee fields.

## Fix 6 — Toolbar vertical centering

**Fix.** Added a global CSS rule targeting every top-level toolbar
(`.plans-topbar`, `.cap-topbar`, `.kpi-header`, `.art-header`,
`.g2m-header`, `.todo-header`, `.prio-topbar`, `.ucr-header`,
`.rpt-header`, `.tpl-header`, `.prio-header`): `align-self:center` on
direct children, `vertical-align:middle` on buttons/inputs/selects,
neutralised stray `margin-top` / `margin-bottom`. Bumped plans-topbar
`min-height` from 52 → 64 px to accommodate the stacked plan name +
linked-rows block without pushing buttons out of centre.

## Fix 7 — Plans page template import

**Fix.** Changed the Plans-toolbar Templates button from
`openTemplateLibrary('plans')` to
`openTemplateBuilder('plans', {planId: _activePlanId})`. The Template
Builder's `_tbImportToPlans` handler pushes selected tasks onto the
active plan via the existing `_newTask()` helper with
`durationDays = ceil(hours/8)` and re-renders.

## Fix 8 — Browser back navigation

**Root cause.** The SPA never pushed history state. Every overlay opened
via `openX()`/`closeX()` kept the URL fixed, so Back dropped the user
out of the SPA entirely — on web, that meant the pre-login screen.

**Fix.** Added `_pmrWireHistory` that runs right after `init()` and
monkey-patches every `openX` function in `_PMR_OVERLAY_MAP` (17 entries
covering todo, kpi, capacity, g2m, plans, artifacts, reports, insights,
ucr, prioritization, templates, feedback, top10, admin,
platformAdmin, dashboard, roadmap). Each wrapped `openX` calls
`history.pushState({pmrView:key}, '', '#' + key)` after the original
runs. A `popstate` listener:

1. If any `.modal-overlay` is present, removes it and re-pushes the
   current view so subsequent Back still works (modals take priority
   over page navigation).
2. Else, closes any open overlay via its `closeX` function and invokes
   the target view from `ev.state.pmrView`, falling back to
   `showDashboard`.

Seeds `history.replaceState({pmrView:'dashboard'}, '', '#dashboard')`
on first wire so the first Back press doesn't drop to the pre-login
screen. Supports direct-link hash routing
(`app.pmroadmapper.com/#plans`) with a short delay to let init finish.

A re-entrancy guard (`_pmrHistoryPopping`) prevents the popstate
handler from double-pushing while it's restoring a previous state.

## Post-fix validation

- `npm test` — 22 capacity assertions + renderer parse check (1355 KB) all pass.
- `npm run build:web` — produces `web/public/index.html` (1575 KB, up from 1509 KB) with all new code.
- Zero syntax errors in the full inline JS.

## Files changed

- `renderer/index.html` — all 8 fixes
- `package.json` — version → 1.34.0
- `FIX_LOG_V4.md` — this file
- `CHANGELOG.md` — v1.34.0 section

## Manual smoke-test checklist (Vela)

1. **Web import:** sign in to web, go to Import → Restore JSON Backup → pick a known-good backup → confirm → verify data applied.
2. **Templates unification:** open Capacity → Templates. See Platform Templates section with `data/platform-templates.json` content.
3. **Template Builder:** Plans → Templates → left panel shows grouped templates, check a few tasks, Import Selected → verify tasks appear on active plan.
4. **Template Builder save:** select tasks → type name → Save as Template → reopen Template Builder → verify new custom template in left panel.
5. **Document upload:** Artifacts → Add Document → drag a PDF → save → verify it appears with Download button → click Download → file downloads intact. (Requires attachments bucket from Fix 4 SQL above.)
6. **Onboarding invite:** Settings → Re-run onboarding → hit the Invite step → enter 2 emails → Send Invites → verify `send-invite` edge fn logs.
7. **Google Calendar harvester:** If Google Calendar was connected in v1.33.0, click Google Calendar in the invite step → verify recent-meeting attendees populate.
8. **Toolbar alignment:** Plans toolbar buttons should be vertically centred with the plan name input. Same for Capacity, KPI, Artifacts, G2M, ToDo, UCR, Reports headers.
9. **Back navigation:** sign in → Dashboard → Plans → Roadmap → Back → Plans. Back → Dashboard. Back should NOT drop to login.
10. **Modal back priority:** open any modal → Back → modal closes, stays on current page.
11. **Hash routing:** open `app.pmroadmapper.com/#plans` directly → Plans opens.
12. **Dark mode:** toggle dark mode and verify every new element renders correctly.

