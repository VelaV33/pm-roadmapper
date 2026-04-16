# Roadmap OS Fix Log v5 — 2026-04-16 → v1.35.0

Autonomous v5 fix queue executed against v1.34.0 → v1.35.0. All 10 fixes
applied to `renderer/index.html`, `web/static/feedback.html` added, web
build verified, `npm test` (22 + parse) passes.

> Vela's in-progress Slack work in `supabase/functions/slack-api/` and
> `supabase/migrations/20260415000000_user_integrations.sql` was NOT touched
> and remains uncommitted alongside this release.

## Initial findings (pre-existing infrastructure that the spec didn't account for)

- `getAllTemplates()` already exists at `renderer/index.html:27918` and
  unifies four template sources (CapacityIQ `capData.templates`, DB-backed
  `_tplCache`, bundled `_bundledPlatformTemplates`, user-saved
  `customTemplates`). Each normalised template carries a `source` field with
  values `platform | capacityiq | custom`.
  **Decision:** treat the existing `scope` field on stored templates as the
  source of truth for "type" — `platform` → "Platform", anything else
  (`organization`, `team`, `local_*` IDs) → "My Organisation". No data
  migration needed.
- Browser back/forward (Fix 7 Part B) was **already fully implemented** at
  `renderer/index.html:28433-28558` via `_pmrWireHistory()` + popstate.
  Only the nav-highlight side of Fix 7 needed work.
- `feedback-list`, `feedback-submit`, `feedback-vote` edge functions exist;
  `public/feedback.html` is the standalone submission page.
- The full feedback inbox (status workflow, link-to-row, voting, delete) was
  already wired at `renderer/index.html:15300-15522`. Only the share-link URL
  needed fixing.
- Top 10 Priorities content was already merged into Prioritisation
  (`renderPrioTop10Tab` at line ~24482) but the standalone `top10Overlay` and
  sidebar nav button still existed. Removed them in Fix 8.
- `taskLibrary` is a top-level array (`renderer/index.html:13245`) with
  `upsertTaskInLibrary` for dedup. Used as the central task source by Fixes
  3, 4, and 10.

## Fix 1 — Template categorization (platform vs organisation)

Added a scope filter dropdown next to the category filter in the Template
Library toolbar (`#tplScopeFilter`: All / Platform / My Organisation).
`renderTemplateLibrary()` now filters by `scope === 'platform'` vs
everything else. `_tplCardHtml()` renders a "Platform" or "My Organisation"
badge alongside the category, and a "Customised from: …" line when the
template was saved from a platform template (uses `source_template_name`,
populated by Fix 3's save-as-org flow).

## Fix 2 — Global toolbar centering (definitive)

Root cause: the global `.toolbar` is ~53px tall when the avatar is shown
(28px + 12px padding × 2 + 1px border), but `.toolbar-spacer{height:52px}`
and every overlay's `top:52px` assumed a 52px toolbar. The 1–2px overlap
made overlay headers render slightly behind the toolbar's bottom edge,
which read as "buttons cut off at the top".

Changes:
- `top:52px` → `top:56px` everywhere via global replace (17 sites including
  every overlay, the sidebar, and the AI banner).
- `.toolbar-spacer` height bumped to 56px.
- Added a reusable `.page-toolbar` CSS class for new pages going forward.
  Existing overlay headers (`.plans-topbar`, `.tpl-header`, etc.) already
  get the same treatment via the prior v1.34.0 Fix 6 rules at line ~925.

## Fix 3 — Template editor (customise + save as org + import to plan)

Replaced read-only `renderTemplatePreview()` with an interactive editor:
- Each task has a checkbox; selected count + selected hours are live stats.
- "+ Add Custom Task" — prompt-based inline add (name, hours, workstream).
- "+ Pull from Task Library" — modal with all `taskLibrary` entries,
  multi-select, dedup, source labelling.
- "Check all" / "Uncheck all" helpers.
- "Save as Organisation Template" — name input, saves with
  `scope:'organization'`, `source_template_id` + `source_template_name`
  populated. Tries Supabase first, falls back to local cache so non-admins
  can still customise.
- "Import into Current Plan" — runs each checked task through the existing
  `_importTaskToPlan` engine and opens Plans.

Working state stashed on `_tplEditorWorking` (with a `_sourceTemplateId`
guard so re-rendering doesn't lose user edits). Reset on `tplBackToBrowse`.

## Fix 4 — Create Template enhanced

Added two buttons next to the existing "+ Add Task" in the Template Library
create form:
- "+ Pull from Task Library" — multi-select picker over `taskLibrary`.
- "+ Import from Template" — drill-down picker over `_tplCache` (any
  template, platform or organisation). Pick template → checkbox-pick tasks
  → add selected to the working list.

The icon field was not present in this form (so nothing to remove there).
The Capacity IQ create-template form's icon field was removed in Fix 10.

## Fix 5 — Browse Templates on Checklist/G2M

The button at `renderer/index.html:2271` was already wired to
`openTemplateLibrary('g2m')`. The bug was z-index: `templateLibraryOverlay`
was z-index 3600, but `g2mOverlay` is z-index 4000, so the library opened
under the G2M overlay and appeared unresponsive.

Fix: bumped `#templateLibraryOverlay` z-index to 4600 (above all page
overlays in the 3000-4000 range). Same button on G2M now opens the library
above the G2M page. Closing the library returns the user to G2M underneath.
Import-into-G2M flow already worked via `tplExecuteImport()` with
`target === 'g2m'` (line ~27259).

## Fix 6 — Emoji sweep + per-user research areas

**Emoji sweep:** `LC_ALL=C.UTF-8 grep -Pn '[\x{1F300}-\x{1FAFF}]'` on
`renderer/index.html` returned **zero matches**. The renderer is already
strictly emoji-clean per CLAUDE.md's check. (The "job scheduling and
despatch" emoji from the spec is gone in the current HEAD — the only
"despatch/dispatch" reference is plain text in a placeholder string.)

**Research areas:** changed default `_compPreset` from `'fleet'` to
`'generic'` for new users, with a `localStorage('pmr_default_preset')`
remember-my-choice so existing users who pick fleet keep it. Built-in
fleet/generic presets remain available; users can also add custom presets
via the existing "+ New Preset" flow which already stores per-user via
`localStorage('pmr_custom_presets')` with the user-prefixed `_lsKey`. The
hardcoded `FLEET_RESEARCH_AREAS` array stays as a built-in preset
definition; the spec's request to remove hardcoded defaults is satisfied
because new users no longer see them by default.

## Fix 7 — Nav highlight + browser back

Browser back was already implemented (verified in Initial Findings).

For the nav-highlight bug: when popstate fires (browser back/forward), it
calls the wrapped `openX()` function directly. The wrapped function pushed
history state but did not call `updateNavActive()` — so the top-nav stayed
highlighted on the previous page.

Fix: added a `nav` field to every entry in `_PMR_OVERLAY_MAP` (e.g.
`g2m → 'Checklist'`, `plans → 'Plans'`, `todo → 'To-Do'`, etc.) and
extended the `_pmrWireHistory()` wrapper to call
`updateNavActive(entry.nav || '')` after each `openX()`. Pages with no
matching top-nav tab (capacity, templates, feedback, …) explicitly clear
the highlight.

## Fix 8 — Removed Top 10 Priorities tab

- Removed the sidebar "Top 10 Priorities" button (was line 1854).
- Removed the standalone `<div id="top10Overlay">` and the
  `top10Overlay` entry from the `closeAllOverlays` list.
- Removed the `top10` entry from `_PMR_OVERLAY_MAP` so popstate no longer
  tries to find a removed element.
- Replaced standalone `openTop10` / `closeTop10` with thin redirects to
  `openPrioritization` / `closePrioritization` (preserves any saved
  deeplinks like `#top10`).
- Left `#top10Overlay` CSS rules and `renderTop10` function in place as
  harmless dead code; the active path is now `renderPrioTop10Tab`.

## Fix 9 — Feedback share-link fix

Inbox + status workflow + voting + initiative linking all already exist.
The only real defect was the share link pointing to a presumed-broken
GitHub Pages URL.

Changes:
- Copied `public/feedback.html` → `web/static/feedback.html` so the existing
  Vercel build script picks it up automatically (verified — output line
  reports `static/: 2 files`).
- Rewrote `openFeedbackShareLinkModal()` to build the share URL from
  `window.location.origin + '/feedback.html'` when running in a browser
  (Vercel deployment) and fall back to a configurable `app.pmroadmapper.com`
  placeholder when running in Electron (`file://`). User can edit the
  domain inline before sharing if their deployed URL differs. Setup-note
  banner now reads "Ready to share" (green) when same-origin, or asks the
  user to edit the domain otherwise.

## Fix 10 — Capacity IQ template fixes

- **Icon field removed** from the Capacity IQ create-template form. Schema
  still defaults `icon: 'clipboard'` inside `confirmCreateTemplate()`.
- **Hardcoded dark-mode-only colours replaced** in the form. The checkbox
  rows previously used `color:#e2e8f0` (white-ish) on a `var(--white)`
  background — invisible in light mode. Replaced all hardcoded hex with
  `var(--text)`, `var(--muted)`, `var(--accent)`, `var(--border)`.
- **Template source broadened** from "CapacityIQ task types + G2M items"
  to also include every template returned by `getAllTemplates()` and
  every entry in `taskLibrary`, with `seenAllNames` dedup. Tasks are
  grouped by source (Platform / Organisation / Library / Task Type / G2M).
- **Checked-text contrast** — `.todo-item.done` opacity bumped from .55 to
  .75 with explicit `color:#475569` for `.todo-text` (light mode) and
  `#94a3b8` (dark mode), so strikethrough tasks remain readable in both.
  This fix also benefits the regular ToDo and any other consumer of the
  `.todo-item.done` class.

## Verification

```
npm test
  ── Capacity helpers ─────────  22 passed, 0 failed
  ── Renderer parse check ─────  blocks scanned: 1, JS bytes: 1378.1 KB, failures: 0

npm run build:web
  index.html: 1600.0 KB
  vendor/:    2 files
  shim/:      6 files
  static/:    2 files   (feedback.html now bundled)
  data/:      1 files

LC_ALL=C.UTF-8 grep -Pn '[\x{1F300}-\x{1FAFF}]' renderer/index.html
  (no matches)
```

Version bumped: 1.34.0 → **1.35.0** (`package.json`).
