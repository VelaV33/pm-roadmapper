# Discovery Notes — Test Plan v1 (2026-04-26)

While documenting Roadmap OS for `TEST_PLAN.md` and `ACCEPTANCE_CRITERIA.md`, the following items were observed. None were code-modified per task instructions; they're flagged here so the parallel bug-fix agent / next QA pass can investigate.

## Ambiguities (multiple valid interpretations)

1. **Two `openSettings()` functions exist** — line 9694 (the structured Settings modal with Timeline / Export defaults / Appearance / Data management / Integrations / Help & Support sections) and line 35100 (an alternative settings overlay focused on AI Configuration / Brand Guide / Artifact Templates / Role / Integrations / Onboarding). Both are wired into different paths in the UI. The TEST_PLAN documents the structured one (F-073) but a tester may also encounter the second variant via Artifacts → Brand Guide / Templates → Settings. Behaviour is consistent but the surfaces differ; the second overlay still contains a small number of literal "AI" / "Style" / "Tpl" / "OK" text labels (lines ~35118, 35136, 35180, 35189) which look like emoji-replacement leftovers.

2. **Bar (initiative) modal vs row modal** — the "trimmed" `barModal` (line 2563, opened by `openBarModal`) is documented as F-025 (legacy) because in v1.45.0 the pill click was rerouted to `openEditModal`. However the `barModal` HTML and CSS are still in the DOM and reachable via "+ Add Initiative" inside the row form and from older code paths. A QA tester finding it should expect a slimmer modal (name/desc/colour/dates) rather than the full editor.

3. **UCR overlay reachability** — UCR was removed from the sidebar in v1.38.0 (per CHANGELOG line 299–300) but the overlay HTML still exists (line 2948). Triggers remain in old hash routes (`#ucr` → `openUCR()` per `_PMR_OVERLAY_MAP`). It's testable but no visible nav link exists. F-063 documents it conditionally.

4. **Voice recording dialog** — `openVoiceRecordingDialog()` (line 11445) is reachable programmatically but `addVoiceToRowModal()` (line 11253) was modified in v1.45.0 Fix 3 to *remove* voice/recording elements from the row modal. F-140 documents it as legacy / programmatic only. If the parent agent wants to fully remove the orphan code, that's a clean follow-up.

5. **Settings Theme dropdown** — F-073 / F-073.A test the Light / Dark theme switch. The first `openSettings()` (line 9694) has the dropdown wired to `appSettings.theme` but I didn't verify whether changing theme triggers a re-render of all open overlays in real time. If a tester changes theme while CapacityIQ is open, it may require navigating away and back to fully re-skin.

6. **Tour overlay** — `tourOverlay` (line 3285) uses a 9999px box-shadow technique. `openShare()` (line 11334) explicitly calls `endTour()` to dismiss it because the box-shadow blocks all input. This means: opening Share *while a tour is active* dismisses the tour silently rather than carrying on after Share closes. Testers should know that's intentional, not a bug.

## Possible bugs (worth a follow-up)

1. **Section-followers notification fanout is deferred** — per `FIX_LOG_V14.md` Fix 11 "Skipped: Section-followers notification fanout (deferred — data captured, UI works)". Section follow data is captured in `section.followers[]` but `_notifyRowWatchers` doesn't fan out to section followers. F-011.A passes the UI test but the user would not actually receive notifications until this is wired.

2. **Currency selector scope** — per `FIX_LOG_V14.md` Fix 3 "Skipped: extending the currency selector to other revenue inputs (KPI views still use plain numbers)". F-075 covers the row modal only. KPI revenue / financial-impact fields in UCR still display unprefixed numbers.

3. **`openSettings()` duplicate name** — JavaScript hoisting / last-definition-wins means whichever script tag is loaded second overrides the first. With the renderer being a single file in source order, only one `openSettings` is ever active. A `git grep` for `openSettings(` shows both `<button onclick="openSettings()">` and `function openSettings()` references — both are real entry points. Since they share a name, callers can't disambiguate. The structured Settings modal (line 9694) is the second definition in the file, so it wins. The first (line 35100) is dead code from a function-name collision standpoint UNLESS the calling context defines a local `openSettings`. Worth verifying with a grep audit.

4. **`grep -c "background.*white\|background.*#fff"` count** — per `CLAUDE.md` testing guidance, every `background: white` or `background: #fff` should have a dark-mode override. Documenting the count as a regression metric. Some recent additions (e.g., the celebration overlay's `var(--white)` fallback) may not have explicit dark-mode rules; F-040.E relies on the dark-mode CSS variable inversion to flip them.

5. **OAuth deep-link timing** — F-082 covers the OAuth landing fix from v1.43.3 + v1.45.1. The `_pmrSeedAfterLogin()` 500ms timeout is heuristic — on slow connections or when the renderer takes longer to hydrate, the overlay may not open. Potential edge case.

6. **Tooltip coverage gaps** — per `FIX_LOG_V14.md` Fix 13: 572 `<button>` tags vs 215 `title=` attributes (~38% coverage). JS-generated buttons (kebab menu items, dynamic action rows) often set `el.title = '...'` in their render functions rather than as a static attribute, so the grep undercounts. F-153 documents the static count; a more accurate audit would run a runtime DOM check.

7. **Dashboard route** — F-010 routes `Roadmap` nav click to `showRoadmapView()` which calls `closeAllOverlays()`. The Dashboard nav link calls `showDashboard()`. Both are documented but the SPA's `showPage()` pattern referenced in `CLAUDE.md` doesn't exist (no `function showPage(` in the file) — the codebase uses `showRoadmapView` + `showDashboard` + the `_PMR_OVERLAY_MAP` pattern instead. Anyone reading `CLAUDE.md` and looking for `showPage` will not find it.

## Doc-only observations (not bugs)

1. `ROADMAP_OS_USER_GUIDE.md` is dated **April 2026 / v1.1.0** — predates everything in the V14 fix queue. Many features documented in the test plan are not in the user guide (Products page, Insights, Integrations, Feedback inbox, Billing, Platform Admin). Consider regenerating the user guide alongside future doc passes.

2. `README.md` says the renderer is "23k lines" but the actual count is 38,822 lines. A doc-refresh follow-up would help orient new contributors.

3. The test plan assumes F-XXX IDs are stable. If new features are added between sections, prefer suffixing with letters (F-XXX.A) over renumbering — both files cross-reference and renumbering would force a global rewrite.

---

**Authored:** 2026-04-26 by the test-plan-2026-04-26 agent.
