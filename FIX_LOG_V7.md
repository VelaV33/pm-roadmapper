# Roadmap OS Fix Log v7 — 2026-04-22

v1.36.2 → **v1.36.3**. Same pattern as v6: skip the fictional function
names and CSS rewrites; fix what the actual codebase needs.

## Overlap with prior work (no re-do)

- **Fix 2 — edit row nav.** Already implemented earlier today as
  `_saveEditingRowThen(fn)` (commit `88f675b`). The four Status &
  Tracking cards (linked project plan, "Create Plan" empty state, G2M
  Readiness card, ToDo card) save the current row edits before
  navigating. Verified against current code — still in place.

- **Fix 6 — "desktop vs web look different".** Initially believed to be
  a sync-logic bug. Root-cause is actually twofold:
  1. **Vercel deploy gap**: prod was serving v1.34.0 while local ran
     v1.36.x. Fixed earlier today — prod now auto-deploys from main.
  2. **Profile picture / name NOT in sync payload**. Confirmed by the
     comment at `applyDataPayload` line 7019-7021 saying profile
     fields are intentionally localStorage-only. Fixed this pass
     (see below).

## Changes this pass

### Fix 4 — "Add Row" → "Add Product"
Renamed all user-facing strings. `addRow()` and other internal function
names preserved for compatibility. Updated:
- Legend "Roadmap" dropdown button ("+ Add Product")
- Sub-tab Add Row button (`addRowBtn2`)
- Empty-state CTA ("No products yet — click + Add Product")
- Tab-scoped modal title ("Add Product to <tab>")
- Onboarding tour narrative ("Create your first product…")
- Row-edit modal header ("Edit Product", "Add New Product")
- Field labels ("Product Label", "Product Description", "Parent product")
- Row kebab menu items ("Edit product", "Delete product")

### Fix 5B — "Settings Settings" double title
`openSettings` at line ~26455: `<h2>Settings Settings</h2>` → `<h2>Settings</h2>`.
Also a stray reference in a brand-guide warning string.

### Fix 5C — Settings moved off sidebar into profile panel
- Sidebar Settings button removed (was the last remaining item before the
  admin buttons). Users now open Settings via Account → Settings.
- Added a "Settings" pill button in the profile modal banner (right side
  of the avatar + name row). Clicking closes the profile modal and opens
  the Settings overlay.
- Full avatar-click dropdown (as the spec drew) not implemented — keeping
  the existing "Account" button → full profile modal pattern. Less
  disruptive and delivers the same user path.

### Fix 5D — User Role field: read-only for non-managers + label fix
Old label: `"User Your Role"` (typo). New: `"User Role"`.
When `isManager()` returns false, the select is replaced with a
read-only badge + "Contact a Manager to change your role." This
prevents the previous exploit where any user could `changeSelfRole` to
`manager`.

### Fix 1 — Date picker defaults to current quarter
New helper `_defaultBarStartFrac()` computes the MONTHS-column index
that matches the current month + year within the visible `quarters`
array, honouring the Q4/JAN-FEB-MAR year-rollover logic from
`getMonthLabel`. Used in:
- `addBar()` — the "+ Add Initiative" button inside the Edit Product modal
- `openAddRowModal()` — the first default bar shown when creating a new Product

If the current date falls outside the visible timeline the helper
returns `0` (same as the old hardcoded default).

### Fix 3 — Add Initiative shortcut on row kebab
New menu item between Edit and Comments: "Add Initiative".
Opens a compact `#quickInitModal` with just name + status — no dates,
no description, no deliverables. Defaults to the current quarter via
`_defaultBarStartFrac()`. Pushes a bar onto `row.bars`, persists, and
re-renders. Users can refine dates/desc later via Edit product.

### Fix 6 — Profile sync across desktop ↔ web
**Root cause of "my avatar/name is different on desktop vs web":** the
profile (name/title/org/avatarUrl) was written to `localStorage` only
and deliberately excluded from the `roadmap_data` JSONB sync payload.
See the v1.33.0 comment in `applyDataPayload` that explicitly said
"never sync personal profile fields".

Three changes to reverse that decision:
1. `buildDataPayload()` and `pushCloudData()` now include a `userProfile`
   sub-object (`{name, title, org, email, avatarUrl}`).
2. `applyDataPayload()` restores `userProfile` from the payload and
   re-applies it via `applyProfileToUI()` + `saveProfileSettings()`.
3. `saveProfileSettings()` now also calls `persistData()` (debounced at
   400ms) so profile edits immediately trigger a cloud sync.

Avatar `data:image/...` URLs are base64-encoded and live in the JSONB
blob — fine for normal-sized avatars. If users start uploading 5+ MB
photos we should revisit and move them to Supabase Storage.

**The other half of the original "different data" complaint** — roadmap
rows looking different — is explained by the Vercel deploy gap that we
fixed earlier today, not by a sync bug. `pushCloudData` +
`pullCloudData` do proper timestamp-based reconciliation, use the
`roadmap_data` table keyed by `user_id`, and have worked correctly
since v1.29.x. No changes needed to the roadmap-sync path.

## Not done

### Fix 5A — Move Style/Brand/TPL from Settings to Artefacts
Deferred. The Settings overlay is one large `innerHTML` string that
interleaves AI config, brand guide, templates, role, and integrations.
Cleanly extracting the Brand + Templates sections requires splitting
the overlay-builder into discrete render functions AND wiring those
into the Artefacts overlay's existing tab structure. That's a larger
refactor than the other v7 items — logging as a follow-up rather than
rushing a copy-paste that would likely leave broken save handlers.

## Tests on ship

- `npm test` — 22 passing
- Parse check — 0 failures
- Zero-emoji — still 0
