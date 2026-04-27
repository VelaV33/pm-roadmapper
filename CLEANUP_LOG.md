# Cleanup Log — Discovery Items (2026-04-27)

Branch: `cleanup-discovery-2026-04-27`
Base: `main`
Source: `DISCOVERY_NOTES.md` (4 items triaged from test-plan agent's pass)

---

## Item 1 — Duplicate `openSettings()` functions

**Status:** done

### Investigated
- Two `openSettings()` definitions in `renderer/index.html`:
  - First at line 9711 (legacy — Timeline/FY/Date/Export/Theme/Data/Slack/Calendar/Help)
  - Second at line 35184 (live — AI Config/Brand Guide/Templates/Role/Slack/Onboarding)
- JavaScript last-defined-wins ⇒ the second is the live implementation; the first was dead.
- Catalogued every feature in the dead one and audited reachability:
  - **FY start month** — covered by `configureFYStart()` (legend menu, line 2517 `Configure FY start month…`).
  - **Dark mode / theme** — `appSettings.theme` is set but never read anywhere; the actual dark-mode flip uses `localStorage.pm_dark_mode` toggled from the "Dark mode" actionRow inside `openProfile()` (line ~10028).
  - **Date format (`appSettings.dateFormat`)** — value is stored but never read elsewhere in the codebase. Truly dead field.
  - **Default export format (`appSettings.exportFormat`)** — same: stored but never read.
  - **Clear all roadmap data** — duplicated in `openProfile()`'s Danger zone (line ~10095).
  - **Slack integration** — already in live settings (line 35310).
  - **Calendar integration** — lives on the Capacity view toolbar (per the inline comment in live settings, "Calendar integrations live on the Capacity view toolbar").
  - **Replay Onboarding Tour** — already in live settings ("Re-run Onboarding Tour", line 35318).
  - **Open Help Guide** — `openHelp()` was reachable ONLY from the dead settings. Migration required.

### Decision
Migrate "Open Help Guide" into the live `openSettings()` Help & Support section, then delete the legacy function. Replace it with a tombstone comment so the next reader knows what happened.

### Diff
- `renderer/index.html`:
  - Replaced lines 9710–9849 (legacy `openSettings()` body) with an 11-line comment block explaining the deletion and where features moved.
  - Inserted "Help & Support" subsection in live `openSettings()` (around line 35316–35323) with an "Open Help Guide" button alongside the existing "Re-run Onboarding Tour" button. Matches the live function's inline-`<button>` style.

### Verification
- `node -e "require('fs').readFileSync('renderer/index.html','utf8')"` → OK
- `grep -n "function openSettings"` returns exactly one definition (line 35055).
- `openHelp()` and `showOnboarding()` both still callable from the live settings overlay.

---

## Item 2 — `CLAUDE.md` outdated

**Status:** done

### Investigated
- `CLAUDE.md` claimed renderer was 23,445 lines; actual count is 38,782 (`wc -l renderer/index.html`).
- `CLAUDE.md` described navigation as `showPage('pageId')`; no such function exists. Real flow: each top-level view is a `.modal-overlay` opened via `openX()`, registered in `_PMR_OVERLAY_MAP` (line 38527), and history-wrapped by `_pmrWireHistory()` (line 38654) which pushes `#viewKey` and updates `updateNavActive()`.

### Decision
- Bump the renderer line count claim to "~38,800 lines" (round to a reader-friendly figure rather than baking in a number that drifts with every commit).
- Rewrite the architecture bullet about navigation to describe the real overlay/`_PMR_OVERLAY_MAP` pattern.
- Rewrite the "Adding a new page" Common Pattern to walk through the actual five steps (markup → open/close fns → map entry → nav anchor → automatic history wrapping). Reference the Integrations entry as a concrete example.
- Add a Windows-safe emoji check command alongside the POSIX one (the cleanup task itself needed this).

### Diff
- `CLAUDE.md`: Critical Architecture Facts § — line-count number + navigation bullet rewritten.
- `CLAUDE.md`: Common Patterns § — "Adding a new page" rewritten as a numbered 5-step list.
- `CLAUDE.md`: Testing § — added Node-based emoji check for Windows.

### Verification
- Re-read `CLAUDE.md` — no `showPage` references remain.
- The new "Adding a new page" steps match what the bug-hunt agent's pass actually did when adding new overlays (cross-checked against `_PMR_OVERLAY_MAP` in renderer/index.html).

---

## Item 3 — UCR overlay still exists, no sidebar entry

**Status:** done

### Investigated
- `#ucrOverlay` markup, CSS, and the full UCR JS suite (`openUCR`/`closeUCR`/`addNewUCR`/`renderUCR`/etc., starting at line 24319) are all present.
- `_PMR_OVERLAY_MAP['ucr']` route (line 38538) is wired so `#ucr` URL works.
- `openUCR()` is called in three places only:
  1. The function definition itself (line 24357)
  2. The onboarding tour's "UCR" step (line 35610) — uses `target:'[onclick*="openUCR"]'`, which silently fails because no such button is in the DOM, breaking the tour highlight.
  3. The route map.
- No sidebar/topnav button, no kebab-menu entry, no keyboard shortcut. Effectively unreachable from a fresh login unless a tester knows to type `#ucr` in the URL.

### Decision
- Put UCR back into the sidebar. Two reasons:
  1. The tour explicitly expects a `[onclick*="openUCR"]` element to exist, so adding the button fixes a latent UX bug rather than just adding a feature.
  2. UCR is documented as F-063 in `TEST_PLAN.md` — testers and end users need a discoverable entry point.
- Match the rest of the sidebar (Reports / Checklist / KPI Scorecard / Artifacts / Prioritization / Plans / Template Library / Feedback / Billing / Competitive Intel / Insights / Integrations) — same `<button class="sidebar-item">` pattern, same SVG style, same `closeDds();closeAllOverlays();openUCR()` handler chain. Replaced the old "removed in v1.38.0" comment block with a comment explaining the 2026-04-27 restoration.
- Did NOT add it to the top nav: the top-nav row is already crowded (Dashboard / Roadmap / Products / Checklist / Plans / To-Do / CapacityIQ / Reports / Insights) and other "module" pages live in the sidebar. The sidebar is the more consistent home.

### Diff
- `renderer/index.html` (around line 2299–2310): Replaced the explanatory removal comment with a longer comment + a new sidebar-item button labelled "Change Requests" with a checklist-style icon.

### Verification
- `node -e "require('fs').readFileSync('renderer/index.html','utf8')"` → OK
- Visual check: button appears in the sidebar under "KPI Scorecard" and above "Artifacts" — matches its historical position pre-v1.38.0.
- The history-wrapper picks up the new entry automatically (no `_PMR_OVERLAY_MAP` change needed — `ucr` was already registered).
- Tour step `[onclick*="openUCR"]` now resolves to the new sidebar button — the tour highlight will land correctly.

---

## Item 4 — Voice recording dialog leftover

**Status:** done

### Investigated
- `openVoiceRecordingDialog()` (was line 11357) builds a `#voiceCmdModal` overlay that wraps `MediaRecorder` + `getUserMedia` and routes the recording to Gemini transcription via `window.electronAPI.transcribeAudio`.
- The dialog is invoked only by `toggleAiVoiceCmd()` (was line 11353).
- `toggleAiVoiceCmd()` is referenced ONLY by its own definition — `grep -rn toggleAiVoiceCmd` returns no callers anywhere in the repo.
- The hidden `#aiVoiceBtn` in the toolbar (`<button id="aiVoiceBtn" style="display:none">`) had no `onclick` and no addEventListener attached — it was the visual placeholder for a button that was never wired up post-v1.45.0.
- `addVoiceToRowModal()` (line ~11431 today) deliberately strips voice elements from the row modal — v14 Fix 3 Part D.
- The Esc-handler at the formerly-line-13721 had a special case to stop the mic stream when `#voiceCmdModal` was closed via Escape.
- The OTHER voice feature — `addVoiceButton()` / `toggleVoice()` (now around line 11580+) — uses the browser's `webkitSpeechRecognition` API (NOT MediaRecorder) and is still attached to live UI: company-profile field rows (`renderer/index.html:11800`/`11804`), competitor-name input (`:12073`), and CI guidance textarea (`:12153`). Different feature, different code path. KEPT.
- `transcribeAudio` IPC plumbing exists in `preload.js` and `web/shim/electronAPI.js`. Tiny, harmless, kept in case voice command is reintroduced.

### Decision
- Delete the dead `MediaRecorder`-flavoured voice command dialog: `toggleAiVoiceCmd`, `openVoiceRecordingDialog`, `startVoiceRecording`, `stopVoiceRecording`, `stopAndTranscribe`, plus the `_mediaRecorder` / `_audioChunks` / `_voiceTimerInterval` globals.
- Replace with a tombstone comment so future readers know the IPC plumbing is intentionally still wired up.
- Drop the hidden `#aiVoiceBtn` HTML element (no listeners, no purpose).
- Simplify the Esc handler: remove the special `#voiceCmdModal` mic-stream-stop case; the generic `.remove()` is now sufficient since the dialog can't appear.
- Leave `addVoiceToRowModal()`, `runAiCommand()`, `aiCmdInput`, and the webkitSpeechRecognition-based `addVoiceButton()` alone — all still serve live code paths or are defensively useful.

### Diff
- `renderer/index.html`:
  - Replaced the ~217-line block (lines 11353–11577 in the old file) with a 13-line comment explaining the deletion and the rationale for keeping `addVoiceButton`/IPC.
  - Removed the `<button id="aiVoiceBtn">` from the hidden ai-cmd-bar div in the toolbar; updated the inline comment so the `#aiCmdInput`-only state is documented.
  - Simplified the Esc handler else-branch (was special-casing voiceCmdModal; now plain `top.remove()`).
- Renderer line count dropped 38,906 → 38,584 (322 lines removed).

### Verification
- `node -e "require('fs').readFileSync('renderer/index.html','utf8')"` → OK
- `grep -n "openVoiceRecordingDialog\|stopVoiceRecording\|voiceCmdModal\|startVoiceRecording\|stopAndTranscribe\|_mediaRecorder\|_audioChunks\|_voiceTimerInterval\|toggleAiVoiceCmd\|aiVoiceBtn"` returns matches only inside the tombstone comment blocks — no live code remains.
- `addVoiceButton` still resolved at line ~11580 and is referenced from CompanyProfile / CI flows.

---

## Final verification

| Check | Result |
| --- | --- |
| `node -e "require('fs').readFileSync('renderer/index.html','utf8')"` | OK |
| Emoji count (`/[\u{1F300}-\u{1FAFF}]/gu`) | 0 |
| `cd web && npm run build` | OK — `public/` written, `index.html: 2173.9 KB` |
| Renderer line count | 38,584 (down 322 from 38,906) |

## Final commit summary

Four discovery items resolved on `cleanup-discovery-2026-04-27`:

1. **Duplicate `openSettings()`** — deleted the dead first definition (lines 9711–9848 in the pre-cleanup file). All of its unique features were either already reachable elsewhere (FY start, dark mode, clear-data, integrations) or genuinely orphaned (date-format and export-format fields that are written but never read). The "Open Help Guide" button was the only feature that needed migrating — added as a Help & Support sub-section in the live `openSettings()` so `openHelp()` still has a UI entry point.
2. **`CLAUDE.md` updated** — line-count claim refreshed (`23,445` → `~38,800`); the `showPage('pageId')` fiction replaced with the real overlay-based pattern that uses `_PMR_OVERLAY_MAP` + `_pmrWireHistory`. "Adding a new page" rewritten as a concrete 5-step recipe. Added the Windows-safe Node-based emoji check.
3. **UCR sidebar entry restored** — `openUCR()` had been unreachable from the UI since v1.38.0 even though the overlay, route, and tour step all still referenced it. Added a "Change Requests" sidebar item using the same pattern as the surrounding modules (Reports, KPI Scorecard, Artifacts, etc.). The onboarding tour's `[onclick*="openUCR"]` highlight target now resolves correctly.
4. **Voice recording dialog removed** — `toggleAiVoiceCmd` / `openVoiceRecordingDialog` / `startVoiceRecording` / `stopVoiceRecording` / `stopAndTranscribe` plus their globals had zero call sites after v1.45.0 Fix 3 Part D. Removed (~210 lines) along with the orphan `#aiVoiceBtn` placeholder in the toolbar and the special-cased Esc handler branch. Kept the unrelated `addVoiceButton`/`toggleVoice` (webkitSpeechRecognition) feature wired to company-profile and CI fields, and kept the `transcribeAudio` IPC plumbing in case voice command is reintroduced.

Touched files: `renderer/index.html`, `CLAUDE.md`, `CLEANUP_LOG.md` (new).
