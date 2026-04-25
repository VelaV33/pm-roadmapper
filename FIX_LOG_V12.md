# Roadmap OS Fix Log v12 — 2026-04-25

v1.42.4 → **v1.43.1** (target — bumping over the v1.43.0 release-notes work that's already shipped).

## Pre-flight findings

- **APP_VERSION** lives at line 3572: `var APP_VERSION = 'v1.43.0';`. Bump
  alongside `package.json` per CLAUDE.md.
- **Add Task modal** (line ~19508) has 4 tabs: Custom, From Task Library,
  From To-Do, From G2M. Library uses `.lib-cb`, G2M+ToDo use `.src-cb`.
  No Select All bar on any.
- **send-invite edge function** at `supabase/functions/send-invite/index.ts`
  uses old `#1a1464` brand color, swallows real Resend errors into
  `{ ok:true, email_sent:false, message:"Share saved..." }`. CTA points
  to the GitHub releases page.
- **Capacity dashboard** (`renderCapDashboard` in renderer) shows a
  member-level table only — needs a Teams aggregate strip on top.
- **CIQ templates** rendered via `renderCapTemplates` (uses
  `getAllTemplates()`); the user reports only 2 visible on desktop.
- **Reports** has a `Portfolio Overview` entry in `RPT_REPORTS[]` —
  remove per Fix 9.
- **Plans timeline view** (`renderPlanTimelineView`, v1.40.2) — pill
  rendering uses inline absolute-positioned bars. Filter button shows a
  toast stub. No bottom horizontal scroller wrapper.

## Decisions

- **Hours tooltip**: drop a `.tooltip-trigger[data-tooltip]` reusable
  utility class. Apply on the Hours label in the task edit modal.
- **Email branding**: keep the existing send-invite function but
  surface real errors and replace the email template with a Roadmap-OS
  branded one matching the `#3b82f6` accent + actual app domain
  (`https://app.pmroadmapper.com`).
- **CIQ templates**: bug is likely that `getAllTemplates()` only returns
  2 because it dedupes by name and `capData.templates` overlaps with
  bundled platform templates. Investigate + restore the full set.
- **Team capacity dashboard**: aggregate `capData.members` by `teamId` →
  per-team total, allocated, available, util%. Insert above the existing
  member table.

## Phase tracking

- [x] Pre-flight investigation
- [x] Fix 1 — Select All on Library / G2M tabs + Planning page
- [x] Fix 2 — Hours description → tooltip pattern
- [x] Fix 3 — Timeline pill sync + filters wired + horizontal scroller
- [x] Fix 4 — Edit Team: org-user dropdown
- [x] Fix 5 — send-invite: real errors + branded email
- [x] Fix 6 — Team logo + card description + bottom rounding
- [x] Fix 7 — CIQ templates: restore full list on desktop
- [x] Fix 8 — CIQ dashboard: team-level capacity row
- [x] Fix 9 — Remove Portfolio Overview report
- [x] Bump v1.43.1 + commit + push + rebuild
