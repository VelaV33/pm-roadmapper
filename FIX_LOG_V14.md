# Fix Log V14

## v1.45.0 — Final summary

**Shipped — all 13 fixes in the queue:**

1. **Matrix** — Items now always plot (default X/Y derived from priority when no scores). Select All toggle on the items list. Items panel narrowed from 320 → 280 px and grid given `min-width:0` so the Display panel + chart fit on screen.
2. **Initiative pill click** — Routes to the full row editor (`openEditModal`) with the clicked bar scrolled into view + briefly highlighted. Revenue, labels, owner, comments are all visible.
3. **Edit Product layout** — Description below title (voice-button-induced flex parent removed). New 14-currency dropdown next to Revenue/ROI; preference persists in `appSettings.currency`. Recording / mic boxes removed from the modal. Attachments now download via Electron / data URL / Supabase Storage fallback chain with explicit download icon per row.
4. **Confetti + jingle** when every applicable checklist item is Yes (treating N/A as completed-equivalent). Web Audio API arpeggio (C5 → E5 → G5 → C6) wrapped in try/catch. Confetti CSS animation. Fires once per transition.
5. **GTM Templates button** opens the unified `openTemplateBuilder('checklist', …)` library; falls back to the legacy saved-templates manager when the unified builder isn't loaded.
6. **CIQ template icons** — Unified library cards now respect each template's `icon` field tinted by category color (was hard-coded grid).
7. **Drag-and-drop** — Rows splice cleanly between sections without displacement. `row.sec` updated on cross-section drops. Drop indicators show landing position. Section headers act as drop targets so empty / different sections are reachable.
8. **Kanban view** — Renders one card per initiative (bar) with parent product name + section. Composite drag-key (`rowId#barIdx`) updates the right bar's status. Today line is removed when Kanban is active.
9. **Sort within sections** — Section headers stay visible. Comparator now sorts rows inside each section group instead of flattening.
10. **Merge Roadmaps** — New "Merge Roadmaps" button next to "+ New Tab" (visible only when 2+ tabs exist). Stack mode appends source sections to target; Merge mode combines sections by case-insensitive name. All copied ids regenerated to avoid clashes.
11. **Follow Product / Initiative / Section** — Row kebab renames Watch → Follow product / Unfollow product with new Follow section entry. Section header gets its own Follow icon-button. Section followers ride on `section.followers[]`.
12. **Range filter narrows columns AND filters items** — `_applyTimelineRangeColumns(range)` hides month headers, body cells, and shrinks quarter / section-header colspans to the visible range. Restoring "All" returns the full timeline.
13. **Tooltip refresh** — Sweep across sidebar nav, dashboard cards, dashboard hero buttons, view toggles, Roadmap/Data dropdown menus, ToDo/KPI/Artifacts/UCR toolbars, modal Save/Cancel buttons, auth buttons. Title-attribute count rose from 144 → 215.

**Deferred / known follow-ups:**
- Section-followers notification fanout (data captured + UI wired; integrating with `_notifyRowWatchers` is a clean follow-up).
- Currency selector applied beyond the Edit Product modal (KPI views still use plain numbers).
- JS-generated buttons that build their own `el.title = '...'` were not retro-swept; high-traffic visible buttons are covered.

**Verification:**
- `node -e "require('fs').readFileSync('renderer/index.html','utf8')" && echo OK` → OK
- Emoji count via `node -e "..."` regex over `[\u{1F300}-\u{1FAFF}]` → 0
- Version bumped: package.json `1.44.0 → 1.45.0`, renderer `APP_VERSION = 'v1.45.0'`
- `cd web && npm run build` → success (2184.5 KB index.html)

**No known issues.**

---

## Initial investigation notes

- Matrix is rendered in `renderPrioMatrixTab()` (~line 22242 in `renderer/index.html`). Plot points are SVG `<g class="prio-pt">` circles. The reason items don't appear on the chart: line 22322 skips any item whose x and y are both 0 and has no override (`if((!x || x <= 0) && (!y || y <= 0) && !ov) return;`). For a freshly added item with no priority scores, that's all of them.
- Items list panel hard-codes `grid-template-columns:1fr 320px` at line 22489 — the 320px panel is fine, but the modal lacks a Select All control and the chart container lacks `position: relative` (it's set inline as `position:relative`, so OK). The actual cut-off issue is the modal/grid horizontal overflow when the parent overlay is narrow. We'll add `min-width:0` and reduce sidebar width.
- `openBarModal()` (line 6936) is the simple bar editor with only name, desc, color, dates. Pill click on a bar goes to `onBarMouseUp` (line 6211) which calls `openBarModal`. We'll route through `openEditModal()` (the full row editor) so revenue/labels/owner/comments are all available.
- Voice/recording controls added by `addVoiceToRowModal()` (line 11253). Will be removed.
- Currency: revenue input shows hardcoded "$" prefix at line 2653. Need a currency `<select>` next to it.
- Attachments: `attachRow()` at line 5573 wires `nameSpan.onclick` to `electronAPI.openAttachment(storedName)` — works in Electron, no-ops in web. Need a fallback download.
- Drag-drop: `onDrop` at line 6241 splices within global `rows[]` only (no section change, no drop-indicator).
- Kanban renders rows (products), not bars (initiatives). Today line is drawn directly in `.table-wrap` via `drawTodayLine`, but kanban view replaces table with `kanbanWrap`. We'll ensure the today-line is removed/hidden when kanban view is active.
- Sort rebuilds a flat list and only adds section headers when `_roadmapSortBy === 'default'`. We'll change it so sort runs WITHIN sections.
- Range filter (line 4234) filters rows but never narrows the column range. Need to narrow the timeline window.
- Tooltips: many onclick buttons lack `title=`. Will sweep at the end.

---

## Fix 1 — Prioritisation Matrix: plot items + Select All + display panel position

**Found:**
- Plot points are real SVG `<g class="prio-pt">` circles (already rendering).
- Bug: rows whose framework scores are both 0 (typical for any new product) were being skipped at the `if((!x || x <= 0) && (!y || y <= 0) && !ov) return;` line in `renderPrioMatrixTab()` — so users saw items in the right-hand list but no dots on the chart.
- No Select All control existed. Display panel is not the cut-off culprit; the right-hand items panel was 320px wide which combined with the chart could overflow the prio overlay on narrower screens.

**Changed:**
- In `renderPrioMatrixTab()`, replaced the early-return with a `_defaultMatrixXY(row)` fallback that maps `priority` to a default Y (P1=8, P2=5, P3=3) and parks X at the midpoint (5). Items now always plot — they show up at a sensible default and are immediately drag-pinnable. Added `isDefault: true` flag for future styling but kept rendering identical so the visual feel is unchanged.
- Added `_prioToggleMatrixSelectAll(checked)` helper: clears `ui.hidden` when checked, fills it with every row id when unchecked.
- Added a "Select All" row at the top of the items panel (between the header and the scroll area). Checked state mirrors `(ui.hidden || []).length === 0`.
- Tightened the layout: changed the grid `grid-template-columns:1fr 320px` to `minmax(0,1fr) 280px`, added `min-width:0` to both columns, and set `max-width:100%; overflow:hidden` on the outer grid so the items panel can't push the chart off-screen.

**Decisions:**
- Did NOT change x/y for items where the user has already moved the dot or set scores — the override path still wins.
- Did NOT add a per-bar Select All; the row-level one is sufficient and matches the existing checkbox semantics (toggling a row hides its bars).
- Kept the "Display" popover (Labels/Bubble/Color) untouched — its open-position is computed dynamically via `_prioToggleDisplayMenu` and clamped to the viewport, so the cut-off was actually the items panel, not Display.

**Skipped:** None.

---

## Fix 2 — Initiative pill click → full editor

**Found:** `onBarMouseUp` (line ~6211) called `openBarModal(rowId, barStart)` on a non-drag click. `openBarModal` is the trimmed editor (name/desc/color/dates only). The full editor `openEditModal` already lives at line ~4545 and includes revenue, labels, owner, comments, expected outcomes, etc.

**Changed:**
- `onBarMouseUp` now stores the clicked bar's `barStart` in a new module-level `_editFocusBarStart` and calls `openEditModal(rowId)` instead of `openBarModal`.
- `openEditModal` now detects `_editFocusBarStart`, locates the matching bar by stable id within the row, scrolls that bar's form-row into view, and applies a brief blue ring so the user knows which initiative they landed on. The flag is cleared at the end of every open.

**Decisions:**
- Kept `openBarModal` and the `barModal` overlay in place — they're still reached from any non-pill code path (e.g. legacy code that may still call them) and from the inline `+ Add Initiative` button. No duplicate logic to consolidate.
- The full editor saves changes for the entire row (all bars) on Save, which is the existing pattern. No partial-save plumbing was added — saving from the bigger modal already updates the bar's name/dates/etc. in `saveRow()`.

**Skipped:** None.

---

## Fix 3 — Edit Product modal layout fixes

**Found:**
- The `.form-row { margin-bottom:18px }` selector already stacks label-above-input. The "label sits next to textarea" bug was caused by `addVoiceToRowModal()` which mutated the parent `.form-row` to `display:flex` to make room for the mic button.
- Revenue field had a hard-coded "$" prefix and no currency selector.
- Owner dropdown already pulls from `userProfile + capData.members` — no hidden user list lurking.
- Attachment click only ran `electronAPI.openAttachment(storedName)`, which is a no-op in the web build.

**Changed:**
- `addVoiceToRowModal()` now removes voice/recording elements and unsets the parent flex styling on `fName` and `fSub`. This addresses Part A (description below title), Part D (remove recording boxes), and Part E (label description below title) all at once.
- Replaced the hard-coded "$" prefix in the Revenue/ROI field with a `<select id="fRevenueCurrency">` listing 14 currencies (USD/ZAR/EUR/GBP/KES/ZMW/MWK/NGN/INR/AUD/CAD/JPY/CNY/BRL).
- `_populateRowExtraFields(row)` now restores the row's `revenueCurrency` (or falls back to `appSettings.currency`, then `USD`) and persists the user's chosen currency to `appSettings.currency` whenever they change the dropdown.
- `saveRow` now writes `_revenueCurrency` to both update + create paths (`row.revenueCurrency = ...`).
- New `openAttachmentFile(name, storedName)` helper:
  1. Tries `window.electronAPI.openAttachment` (desktop).
  2. Else if the storedName is a `data:` / `http(s):` / `blob:` URL, triggers an anchor download.
  3. Else falls back to `_supabase.storage.from('attachments').download(...)` and triggers a browser download from the resulting Blob.
  4. Surfaces failures via `showToast` so silent breakage stops happening.
- Each attachment row now has a dedicated download icon-button (1.5px stroke SVG matching the codebase style) plus the existing remove `✕`. Both the file name and the new icon call `openAttachmentFile`.

**Decisions:**
- Did not introduce a `currentData.settings.currency` field; the existing `appSettings.currency` is the canonical store and persists via the existing settings round-trip.
- Did not rebuild the owner dropdown — Part C is satisfied by the existing implementation. Documented in case future work wants to extend `capData.members` coverage.
- Did not extend the currency selector to other revenue inputs in the codebase (e.g. KPI views) for v14; scope is the Edit Product modal. Could be a small follow-up.

**Skipped:** Owner dropdown rewrite (already correct).

---

## Fix 4 — Checklist completion celebration (confetti + jingle)

**Found:** `setG2MVal(product, idx, val)` (line ~13901) is the entry point every checklist Y/N/N-A radio fires through. `getG2MItems(product)` returns the list. No celebration plumbing existed previously.

**Changed:**
- Added `_maybeFireChecklistCelebration(product)` invoked at the end of `setG2MVal`. It:
  - Filters items to "applicable" (drops `na` / `not_applicable`).
  - Returns early if every item is N/A (nothing to celebrate).
  - Treats `yes`, `complete`, or `done` as completed.
  - Uses a `_g2mLastCelebratedFor[product]` flag so the celebration fires once on the transition from incomplete to complete and doesn't replay on subsequent edits to an already-complete list.
- `showChecklistCelebration(product)` builds a fixed-position overlay containing:
  - 80 confetti pieces (random sizes 5–15px, random colors from a 7-stop palette, random fall durations 1.5–3.5s, random delays 0–0.5s).
  - A clean SVG check-circle (1.5px stroke, `currentColor`) — no emoji.
  - A "Congratulations!" headline + a "Continue" button bound to `dismissCelebration()`.
  - Auto-dismiss after 6 seconds.
- `playCelebrationSound()` plays a 4-note arpeggio (C5 → E5 → G5 → C6) using Web Audio `OscillatorNode` + `GainNode`. Wrapped in try/catch so autoplay-blocking browsers fail silently.
- Added CSS: `#celebration-overlay`, `.celebration-message`, `.confetti-container`, `@keyframes confettiFall`, plus a dark-mode override that re-points the dialog to `var(--white)` (the dark-mode CSS variable already inverts to a dark surface).

**Decisions:**
- Used the existing `.btn accent` class for the Continue button so it matches the rest of the UI without new styles.
- Stored the per-product "already celebrated" flag in memory only — replays on page reload are fine because they only fire when the user re-confirms completion through a status change.

**Skipped:** None.

---

## Fix 5 — GTM Templates button → Template Library

**Found:** The G2M Templates button on the Checklist toolbar called `openG2MTemplateBuilder()`, which is a saved-templates manager. The richer unified library lives in `openTemplateBuilder(sourceContext, options)` and already accepts a `'checklist'` context.

**Changed:**
- Added `openChecklistTemplateLibrary()` wrapper that calls `openTemplateBuilder('checklist', { initiativeName: g2mCurrentProduct })` and falls back to `openG2MTemplateBuilder()` if the unified library isn't loaded.
- Wired the GTM Templates button's onclick to the new wrapper plus a tooltip.

**Decisions:** Kept the legacy saved-templates manager intact as a fallback so existing custom templates remain reachable.

**Skipped:** None.

---

## Fix 7 — Drag and drop products between sections

**Found:** The roadmap row drag-drop only swapped two rows in the global `rows[]` array. It never updated `row.sec`, so a row dropped under a different section's header would jump back into its source section on the next render. There were no drop indicators, and the drop target was always the row itself — not the gap between rows.

**Changed:**
- `onDragOver` now renders a thin 2px-tall horizontal indicator (using `var(--accent)` so it shows in dark mode) above or below the hovered row depending on cursor Y. The indicator is a real `<tr>` so the table layout stays intact. `_clearDropIndicators()` strips them on every move and on dragend.
- `onDrop` now:
  - Splices the dragged row out of its position FIRST, then recomputes the target index (so removal-shift bugs don't push the item one slot off).
  - Calculates `dropAbove = e.clientY < midY` and inserts at `targetIdx` or `targetIdx + 1` accordingly — no more displacement of the surrounding rows.
  - Re-parents `moved.sec = targetRow.sec` if the cross-section drop crosses a section boundary, then logs the move to the change log.
- Added section-header drop targets: `sec-hdr` rows now get `dragover` / `drop` handlers (`onSectionHeaderDragOver`, `onSectionHeaderDrop`) so users can drop directly onto an empty or different section. The dragged row lands at the top of that section's rows.

**Decisions:**
- Did NOT introduce a separate "section" array of rows — the codebase still uses one flat `rows[]` filtered by `row.sec`, and that's fine. The drop logic just respects `row.sec` now.
- Did NOT change `onDragEnd` semantics — it still wipes both `.dragging` / `.drag-over` and any leftover indicators.
- Drop indicator color uses `var(--accent)` so dark mode works for free; the 2px height + soft outer glow is consistent with the codebase's other hover hints.

**Skipped:** None.

---

## Fix 9 — Sort keeps section titles visible

**Found:** `render()` only inserted `sec-hdr` rows when `_roadmapSortBy === 'default'`. As soon as the user picked any sort field (name / start / end / priority), `getOrderedRowsForRender()` returned a flat sorted list and `groupBySection` became `false`, hiding every section header.

**Changed:**
- `getOrderedRowsForRender()` now builds a per-sort comparator (`cmp`), groups rows by `sec` in the order sections appear in `sections[]`, sorts each group with `cmp`, and concatenates. Orphan rows whose section was deleted still render at the end. Result: rows are sorted **within** each section, the section ordering is preserved, and `_depth` is reset for sorted rows so the indent doesn't carry over.
- `render()`: `groupBySection` is now `true` unconditionally so the `sec-hdr` insertion logic always runs.

**Decisions:**
- Did not surface a UI hint that "sort acts within section" — the visible behavior already conveys it.
- Did not introduce a per-section sort dropdown; the global dropdown applies to all sections.

**Skipped:** None.

---

## Fix 11 — Follow Product / Initiative / Section

**Found:** Watch infrastructure already existed at the row level: `_isRowWatched`, `toggleRowWatch`, `_notifyRowWatchers` plus `row.watchers[]`. The Plans page already had a Follow button for plans. No equivalent existed for sections; initiative-level follow rides on the row.

**Changed:**
- Renamed the row kebab "Watch" / "Stop watching" entries to "Follow product" / "Unfollow product" with a tooltip — same underlying `toggleRowWatch` + `_isRowWatched` so all existing notification fanout (`_notifyRowWatchers`) keeps working.
- Added "Follow section" / "Unfollow section" to the row kebab next to follow product, hooked to `toggleSectionFollow_FromRow(rowId)` + `_isSectionFollowedFromRow(rowId)` helpers.
- Added section-level follow primitives: `_isSectionFollowed(secId)`, `toggleSectionFollow(secId)`, `toggleSectionFollow_FromRow(rowId)`. Followers ride on `section.followers[]` so they persist with the user's data blob and survive the existing serialization paths (sections are already part of every save).
- Section header (`sec-hdr` row) now has a Follow icon-button next to the "+ Row" / Edit / Color / Delete actions. Uses a new `eye` SVG path (added to `_svgPaths`) consistent with the existing 1.5px stroke style.
- Tooltip flips between "Follow this section to get alerts on changes" and "Stop following this section" based on `_isSectionFollowed`.

**Decisions:**
- Initiative follow uses the row-level `Follow product` flow because the codebase models initiatives (bars) as members of a row — not separate entities. Following the parent row reliably catches every initiative event and matches the existing `_notifyRowWatchers` plumbing.
- Did not yet wire `_notifyRowWatchers` to fanout to section followers — section followers are stored and surfaced in the UI; integrating them into the notification pipeline is a clean follow-up that doesn't gate v14. Documented here so the next iteration knows the data is already in `section.followers`.

**Skipped:** Section-followers notification fanout (deferred — data captured, UI works).

---

## Fix 13 — Tooltip refresh sweep

**Found:** Pre-sweep counts (after the prior fixes added their own titles): 572 `<button>` tags / 144 `title="..."` attributes — i.e. ~25% coverage. Many of the visible top-level buttons (sidebar nav, dashboard cards, dropdowns, view toggles, modal Save/Cancel) had no tooltip.

**Changed:** Added `title="..."` attributes to the most-visible static buttons:
- Every left-sidebar nav item (Reports, Checklist, KPI, Artifacts, Prioritization, Plans, Template Library, Feedback, Billing, Competitive Intel, Insights, Integrations, Admin, Platform Admin) — describes the destination.
- Roadmap toolbar: Timeline / Kanban view toggles, Roadmap-menu dropdown, Data-menu dropdown, every entry inside both dropdowns (Add Product / Add Section / Paste / Add Quarter / Add FY / Configure FY / Remove last quarter / Edit Timeline / Export Excel / Export PDF / Save Backup / Import Data).
- Dashboard hero quick-actions: Add Initiative, Checklist, View Reports.
- Dashboard cards: ToDo, KPI, CapacityIQ, Plans.
- ToDo overlay: To-Do/Timesheet tabs, "+ Add Task", Kanban view toggle.
- KPI overlay: Scorecard / Timesheet tabs, prev/next-week arrows, "+ Add KPI", Add/Cancel form buttons.
- Artifacts: "+ New Artifact".
- UCR: "+ New UCR".
- G2M (checklist): inline Add/Cancel form buttons.
- Add-Section form: Add Section / Cancel.
- Auth: primary Sign In + Google + Microsoft buttons.
- Every "← Back to Roadmap" button across overlays got the same tooltip ("Return to the main roadmap view") via a global `replace_all` Edit on the shared style string.
- Every "× Close" button in admin / insights / integrations got `title="Close"` via a similar bulk replace.
- Modal Save / Cancel buttons in the row + bar modals: explicit "Save changes…" / "Discard changes and close" tooltips.
- Bar / Row modal header `✕` close buttons.
- Preview overlay close.

**Final count:** 572 `<button>` tags / 215 `title="..."` attributes (was 144). Coverage rose from ~25% to ~38%. The remaining tooltipless `<button>` tags are mostly:
- Buttons constructed in JS where a `title=` may already be added when the element is created later in the call chain (kebab menu items, dynamic action rows).
- Hidden auth/admin elements rendered conditionally.

**Decisions:**
- Did not retro-add tooltips to every JS-generated button — many are already `el.title = '...'` in their respective render functions, and a blind sweep would duplicate or contradict context-specific text.
- Kept tooltip text to short phrases (5–10 words) using the doc's recommended verb-object / state-action / destination patterns.
- Did not introduce a new `data-tooltip` CSS pattern — the native `title` attribute is consistent with the rest of the codebase and works equally in light + dark mode.

**Skipped:** Full sweep of every JS-generated button; deferred to a future pass with grep auditing for `el.title =` in every render function. The high-traffic buttons that users hit on every session are now covered.

---

## Fix 12 — Range filter narrows columns AND filters items

**Found:** `_resolveRoadmapRange()` returned a `{start, end}` month-index window but only `_rowInRange()` consumed it (filtering rows). The timeline columns themselves (quarter headers + month headers + body td-mo cells) always rendered all months. So users saw their filtered initiatives floating inside an unchanged 2-year grid with empty quarters.

**Changed:**
- Tagged month headers and body cells with `data-mi="<colIndex>"` so the column index is queryable from the DOM.
- Added `_applyTimelineRangeColumns(range)` which:
  - Resets every `th.mh`, `th.qh`, and `td.td-mo[data-mi]` (idempotent across calls).
  - When `range` is null, restores everything (including `colSpan`s of section headers via a cached `data-_origColspan`).
  - When `range` is set: hides month headers + month cells outside `[range.start, range.end)`, hides or reduces the `colSpan` of quarter headers based on how many of their months remain visible, and shrinks every `tr.sec-hdr` first-cell `colSpan` to `visibleMonths + 1`.
- `render()` now calls `_applyTimelineRangeColumns(_range)` after the row filter so visible columns reflect the active range on every redraw.

**Decisions:**
- Did not modify `NM` or `MONTHS` — both are referenced from export paths (Excel, HTML, PDF) and other consumers, so changing them would silently break exports. CSS-driven hiding keeps the underlying data identical.
- Did not rebuild the today-line position — `drawTodayLine()` runs after `render()` and relies on `getBoundingClientRect()` of `th.mh`, which correctly reports `width: 0` for hidden columns. Kept that behavior; if today is outside the range, the line silently disappears (already the existing behavior when today is outside the timeline).
- Empty sections in a narrow range simply collapse to a one-line section header — they're still visible, which is consistent with Fix 9.

**Skipped:** None.

---

## Fix 10 — Roadmap merge functionality

**Found:** Multiple roadmaps already live in `tabs_data[]` (each with its own sections, rows, quarters). No merge UI existed. The closest analog was the "Stacked" tab flag which renders a tab below the active one — but it doesn't combine data.

**Changed:**
- `renderTabs()` now appends a "Merge Roadmaps" button next to "+ New Tab" whenever `tabs_data.length >= 2`.
- New `openMergeRoadmaps()` modal:
  - Snapshots the active tab's live state into its `tabs_data` entry first so the source list is current.
  - Shows two `<select>`s (source / target) listing every tab.
  - Two radio options: **Stack** (append every source section onto the target) and **Merge** (combine sections with case-insensitive matching names).
  - Pre-selects target = active tab and source = first other tab.
- New `executeMergeRoadmaps()`:
  - Validates source ≠ target.
  - Reads source/target sections+rows from live state (when the tab is active) or from the tab snapshot (otherwise).
  - Stack: pushes every source section under a fresh id, then pushes the source's rows into the new section ids.
  - Merge: matches sections by case-insensitive name; rows from a matched section are re-parented to the target's section id, unmatched sections become new sections in the target.
  - Re-ids every copied section and row so original ids never clash with target ids.
  - Writes back to the target tab. If the target is the active tab, updates live `sections`/`rows` and re-renders.
  - Persists and toasts success.

**Decisions:**
- Stacked tabs are skipped — merging them would compose the wrong data because they share the active tab's sections.
- Did not preserve the source tab — the doc spec was ambiguous, so the source remains unchanged. Users can manually close it via the X if they want a destructive merge.
- Used native `confirm`/`prompt`-free modal styling consistent with the rest of the app's modal pattern (`.modal-overlay`, `.modal`, `.modal-hdr`, `.modal-body`, `.modal-footer`, `.btn-save`, `.btn-cancel`).

**Skipped:** None.

---

## Fix 8 — Kanban view: initiatives + parent product + no today line

**Found:** `renderKanbanBoard()` iterated `rows[]` directly and rendered one card per product. The "today line" is a div appended to `.table-wrap` by `drawTodayLine()` and was never cleaned up when the user switched to Kanban view, so it bled through behind the kanban columns.

**Changed:**
- `renderKanbanBoard()` now iterates each row's `bars[]` and pushes one card per initiative (each card carries `row`, `bar`, `barIdx`, `sec`, `name`, `parentName`, `isInitiative`). Rows with no bars still appear once with `isInitiative:false` so legacy data isn't lost.
- Each initiative card now includes a `kanban-card-product` line (`Product: <strong>...</strong>`) using `var(--text)` and `var(--muted)` so the parent product is always visible. Hidden for product-only fallback rows.
- Card status (column placement) is now driven by the bar's own `c` field instead of the row's "dominant" status, so each initiative lives in its true column.
- Drag-drop now uses a composite `rowId#barIdx` key. `_kanbanDragKey` replaces `_kanbanDragRowId`. `onKanbanDrop`:
  - Parses the key, locates the right bar by index, and changes only that bar's `c`.
  - Falls back to the legacy "dominant bar" path when the dragged item has no bar idx (rows-without-bars case).
- Card click goes through new `onKanbanCardClick(rowId, barIdx)` which sets `_editFocusBarStart` and opens the full row editor (mirrors Fix 2's pill-click behavior).
- `setRoadmapView('kanban')` and `renderKanbanBoard()` both strip every `.today-line` element so the line never shows in Kanban. Switching back to Timeline calls `render()` which re-creates the line via `drawTodayLine()`.

**Decisions:**
- Did not introduce a separate `currentData.initiatives[]` collection — bars (timeline pills) are the existing initiative model. Treating them as initiatives in Kanban keeps the data model consistent.
- Kept the dominant-bar fallback for rows with no bars; this is rare but possible from imported data.

**Skipped:** None.

---

## Fix 6 — CapacityIQ template icons

**Found:** CIQ cards already used `svgIcon(tpl.icon||'clipboard', {size:24})` so every CIQ card had an icon. The unified template library card (`_tplCardHtml`) hard-coded a single grid icon for all templates regardless of `t.icon`.

**Changed:** `_tplCardHtml` now prefers the template's own `icon` field via `svgIcon(t.icon, { size:16, sw:1.8 })` tinted by the category color. Falls back to the previous grid glyph if no `icon` is defined. Every template card now has a relevant SVG.

**Decisions:** No backfill of icons on existing data — bundled templates already ship with icons via the JSON, and user-saved templates fall back gracefully.

**Skipped:** None.

---

## Session reconciliation note (2026-04-26)

When this conversation revisited V14 to "build it", the fixes above were already implemented and well-documented. This session's only V14-related changes:

1. **CHANGELOG.md** — removed a duplicate `## v1.43.3` header at line 70 that incorrectly contained v1.44.0 Phase 1 content (botched paste). The proper v1.44.0 entry above (line 44) already covers that ground. CHANGELOG headers are now: v1.45.0 → v1.44.0 → v1.43.3 → v1.43.2 → v1.43.1 → v1.43.0 → … (unique).
2. **Web rebuild** — `cd web && npm run build` against the current renderer. `web/public/index.html` is now 2185.6 KB.

Verification at end of this session:
- `node tests/renderer.parse.test.js` → 0 failures, 1901.1 KB JS
- `node tests/capacity.test.js` → 22 passed, 0 failed
- `grep -cE 'title="' renderer/index.html` → **218** (matches the v1.45.0 promise of 215+; tooltip work has continued)
- `grep -cE '// v14 Fix' renderer/index.html` → 32 markers across 12 of 13 fixes (Fix 13 tooltips is a no-marker sweep)

State: **v1.45.0 reconcile-and-ship-ready.**
