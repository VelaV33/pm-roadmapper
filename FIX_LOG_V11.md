# Roadmap OS Fix Log v11 — 2026-04-25

v1.41.0 → **v1.42.0** (target).

## Pre-flight findings

- **Onboarding** already exists: `_onboardingSteps[]` (~33129) with
  `showOnboarding()` / `_nextOnboardStep()` / `_completeOnboarding()`.
  Adding a team step means inserting into the array.
- **Loading overlay** already exists: `#loadingOverlay` div + `showLoading(msg)`
  / `hideLoading()` helpers (~11503). I'll keep the API and add the logo +
  call sites.
- **Free-trial copy** lives in:
  - `openCapTeamEdit` invite block (~28313)
  - "How does the 30-day free trial work?" billing FAQ (~16934/16945)
  - `_capTeamSendInvite` toast (~28403)
  - `_redeemInviteFromUrl` welcome (~28468)
  Public feedback CTA (in `web/static/feedback.html`) stays per spec.
- **Browser-back** already has the `_PMR_OVERLAY_MAP` + `_pmrPushView` /
  `_pmrPushCount` / `_pmrWireHistory` system at ~34022. There's a clear
  double-decrement bug (close handler decrements then triggers popstate
  which decrements again). I'll patch the system surgically rather than
  replace it — every openX/closeX is already wrapped, so a wholesale
  swap-in of `NavManager` would risk breaking the overlay teardown logic
  with no time to retest 15+ overlays. Patch + login-success replaceState +
  refresh-on-page hash handling is the safest minimum fix.
- **Row schema**: rows are created in several places (`saveRow`,
  `_appendChangeLog` paths, sample-import paths). I'll add the new fields
  on the central save path so they apply to both create and edit.
- **Comments**: there's an existing `postComment(rowId, content, parentId)`
  helper (~8443) used by the threaded comments system on initiatives —
  I'll keep that thread API and just surface the per-row comments under
  the edit modal.
- **Archive/Watch/Duplicate** are new structures — `currentData.archive`,
  `row.watchers`, plus the existing `_appendChangeLog` for change tracking.
- **Plan share** already has the `share-plan` flow scaffolded via the
  share-roadmap edge function and `_sharedToMe`. I'll add a Plan-specific
  share UI on the plans toolbar plus a follow-eye button.

## Decisions

- **Fix 8 strategy**: surgical patch, not rewrite. Specific bugs fixed:
  1. Close-handler decrements `_pmrPushCount`, then `history.back()` fires
     popstate which decrements again — double-count. Fix: only decrement
     in popstate handler.
  2. Login flow doesn't replaceState after auth completes, so the first
     back press after login takes user to wherever the browser was
     pointing. Add a `_pmrSeedAfterLogin()` call.
  3. Hash-based deep links (`#integrations?connected=jira`) work today;
     keep that path.
- **Sample data**: I'll seed when both `rows` and `projectPlans` are empty
  AND the user hasn't already declined. Banner survives navigations until
  dismissed or cleared.
- **Plan sharing** uses the existing `send-invite` edge function with a
  new payload `{kind:'plan_share', planId}` — no new edge function.
  External users land on `#plans?planId=...` after sign-in via a
  `pmr_post_signin_target` sessionStorage key.

## Phase tracking

- [x] Fix 8 — Browser back surgical patch
- [x] Fix 2 — Branded loading overlay
- [x] Fix 3 — Remove free-trial UI text
- [x] Fix 5 — Initiative data model extensions
- [x] Fix 6 — Edit initiative: revenue/labels/owner/comments
- [x] Fix 7 — Duplicate / Archive / Watch
- [x] Fix 1 — Onboarding team setup step
- [x] Fix 4 — Sample data for first-time users
- [x] Fix 9 — Plan share + follow
- [x] Bump v1.42.0 + commit + push + rebuild
