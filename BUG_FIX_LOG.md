# Code Review Fix Log — 2026-04-26

Branch: `code-review-fixes-2026-04-26`
Base: `main` @ v1.45.1

---

## Summary

- **Total fixes applied:** 13
- **Passes run:** all 5 (static/syntax, dark mode, logic bugs, UX, performance)
- **Deferred items:** 0 (no major design decisions needed; everything found was a small, contained patch)
- **Areas with no findings (i.e. checked, considered clean):**
  - Dark mode catch-all coverage at lines ~132–164 already handles `[style*="background:#fff"]`, `[style*="background:white"]`, `[style*="background:var(--navy)"]`, `[style*="color:#1a1464"]` etc.; sampling confirmed no inline rule reaches the user without coverage.
  - localStorage parsing for `pmr_session`, `pmr_saved_analyses`, `g2m_templates`, `pmr_custom_presets` — all wrapped in try/catch in current callers.
  - Notification arrays (`_notifications`, `_localNotifications`, `_roadmapChangeLog`) are bounded.
  - Global Escape-to-close handler at line ~13817 already covers `.modal-overlay` and `.plan-modal-backdrop`.
  - Auto-sync timer + cloud push/pull error paths are protected with try/catch and surface via `showSyncBadge`.
  - Auth flow signup/forgot/reset-code paths all wrap supaRequest in try/catch.
  - All existing setInterval timers are paired with clearInterval at known teardown points (auto sync, badge refresh, notif poll, voice timer, comp timer, oauth poll).
  - No undefined onclick handler functions remain (script audit returned 0 unknown identifiers in inline event-attribute call positions).
  - No emoji in renderer/index.html (post-fix scan: 0).

The fixes prioritized: defensive wrapping of async error paths so the UI doesn't get stuck, removing one referenced-but-undefined function (`addG2MRow`), fixing string-escaping in dynamically-generated onchange handlers (G2M radios), patching listener-leak patterns in the autocomplete helpers, and tightening modal lifecycle (voice mic shutdown on Esc, toast stacking).


---

## [pass-1 #1] renderer/index.html:14131 — addG2MRow handler references undefined function
Symptom: When a G2M category is empty, the inline-state link calls `addG2MRow(product, catName)`, but no function with that name exists. Clicking "+ Add item" silently failed with `ReferenceError: addG2MRow is not defined`.
Fix: Re-pointed the onclick to `showG2MAddRowForm(catName)` (which already exists and shows the in-page add-row form). Extended `showG2MAddRowForm` to accept an optional category name and pre-select it in the dropdown.
Risk: Low — function reuse, falls back to default category if name doesn't match.
Verified: syntax check OK, emoji count 0.

## [pass-1 #2] renderer/index.html:27637 — _pollForConnection swallows fetch errors silently
Symptom: OAuth status poller `setInterval` calls `await fetchIntegrationStatuses()`. If that throws (network error during polling), the unhandled rejection logs into the console for every tick and the interval keeps spinning.
Fix: Wrapped the body in try/catch with a console.warn. Validated that `statuses` is an array before `.find`.
Risk: Low — defensive only.
Verified: syntax check OK.

## [pass-1 #3] renderer/index.html:9984 — Password reset shows success even on failure
Symptom: `_supabase.auth.resetPasswordForEmail(email).then(...)` always toasted "Password reset email sent" — even when Supabase returned `{ error }` (rate limit, invalid email, etc.). User had no idea the request failed.
Fix: Inspect `res.error` before showing success; added `.catch` for transport-level errors.
Risk: Low.
Verified: syntax check OK.

## [pass-1 #4] renderer/index.html:10045 — Manual cloud sync leaves badge stuck on 'syncing' if the call rejects
Symptom: The settings page "Sync now" button calls `pushCloudData().then(...)` with no `.catch`. A network failure leaves the cloud badge stuck on "syncing" forever and the user gets no feedback.
Fix: Added `.catch` to surface the error toast and switch the badge to 'error'. Also handle the `res.ok===false` branch by setting badge to 'error'.
Risk: Low.
Verified: syntax check OK.

## [pass-1 #5] renderer/index.html:10489 — loadComments rejection leaves modal stuck on "Loading…"
Symptom: Comments thread modal calls `loadComments(rowId).then(renderThread)` with no error handling. If the fetch fails (e.g., expired token mid-session), the user sees the loading spinner forever.
Fix: Added `.catch` that swaps the spinner for an error message when there's no cached fallback.
Risk: Low.
Verified: syntax check OK.

## [pass-1 #6] renderer/index.html:8438 — OAuth fallback button never recovers if token processing throws
Symptom: The desktop-handoff overlay's "Continue in browser instead" button calls `_processOAuthFragment(raw).then(...)`. A thrown error inside the function would leave the overlay on top of the app forever.
Fix: Added `.catch` that removes the overlay and clears the URL hash regardless of failure.
Risk: Low.
Verified: syntax check OK.

## [pass-1 #7] renderer/index.html:8754 — handleAuthPrimary login path has no catch around signInWithPassword
Symptom: `await _supabase.auth.signInWithPassword(...)` without try/catch. If the Supabase JS client throws (CORS, DNS, timeout), the whole `handleAuthPrimary` async function rejects and the loading spinner never clears. Also `result.error.message.indexOf(...)` would throw TypeError on a falsy message.
Fix: Wrapped in try/catch, falling through to the existing connection-error path. Coerced `result.error.message||''` to avoid the secondary TypeError.
Risk: Low — fallback path matches the signup branch.
Verified: syntax check OK.

## [pass-5 #1] renderer/index.html:17415 — attachLibraryAutocomplete leaks a document mousedown listener per input
Symptom: The library autocomplete attaches a `document.addEventListener('mousedown', …)` for every input it's bound to. Across project plans / G2M / ToDo views with many task rows, this accumulates one listener per input on the document. Listeners hold closures referencing the (re-rendered) input, blocking GC.
Fix: Attach the outside-click listener only when the dropdown is actually shown, and remove it in `closeDropdown`. Same fix applied to `attachOwnerAutocomplete`.
Risk: Low — guarded so only one listener is active at a time per input; removed reliably on close.
Verified: syntax check OK.

## [pass-3 #1] renderer/index.html:14153 — G2M radio onchange uses raw g2mCurrentProduct, breaks if product name has an apostrophe
Symptom: Three onchange handlers on the Yes/No/N-A radio inputs interpolate `g2mCurrentProduct` directly (raw, unescaped) into a single-quoted JS string. If a product/initiative name contains an apostrophe, the resulting onchange attribute closes early and breaks the row's interactivity. The same loop already builds an `escapedProduct` for sibling onchanges; these three were missed.
Fix: Replaced the three raw uses with `escapedProduct`.
Risk: Low — same data, just escaped consistently.
Verified: syntax check OK.

## [pass-4 #1] renderer/index.html:13359 — Toasts overlap on stacked calls
Symptom: showToast renders each toast at `bottom:24px` with the same fixed transform; back-to-back calls (e.g. sync flow toasts in quick succession) overlap each other and the user only sees the last one.
Fix: Existing toasts get bumped upward by 56px each before the new one is appended; the bottom transition makes it feel natural.
Risk: Very low — purely visual.
Verified: syntax check OK.

## [pass-5 #3] renderer/index.html:12946 — _compTimer interval can leak if showAnalysisLoading runs twice
Symptom: `_compTimer = setInterval(...)` overwrites without clearing. If the analysis loading screen is rendered twice (e.g. user clicks Run, then a guard check rejects + retries), the first interval becomes orphaned and keeps firing forever, mutating an element ID that may belong to a stale page.
Fix: Clear `_compTimer` before assigning a new one.
Risk: Low — defensive only.
Verified: syntax check OK.

## [pass-5 #2] renderer/index.html:17337 — attachOwnerAutocomplete leaks a document mousedown listener per input
Symptom: Same pattern as #pass-5 #1, applied separately to the owner autocomplete used in plan tables and G2M assignee fields.
Fix: Same approach — gate the document listener behind dropdown lifecycle.
Risk: Low.
Verified: syntax check OK.

## [pass-1 #8] renderer/index.html:8165 — _sbFetch fallback fetch can reject instead of returning {ok:false}
Symptom: The browser-fallback branch of `_sbFetch` doesn't catch transport errors. Many callers branch on `res.ok` rather than try/catch, so a network blip surfaces as an unhandled rejection.
Fix: Wrapped the fallback in try/catch returning `{ok:false, status:0, data:{error:'network error'}}` to match the shape callers expect.
Risk: Low — preserves the success-path return shape.
Verified: syntax check OK.

## [pass-3 #2] renderer/index.html:13838 — Voice command modal closed via Esc leaks the mic stream
Symptom: The voice-command modal (`#voiceCmdModal`) is created with the `.modal-overlay` class. The global Esc handler in `keydown` removes the overlay via `top.remove()` but does NOT call `stopVoiceRecording()`, so `_voiceTimerInterval` keeps ticking and the MediaRecorder stream stays live. The mic indicator stays on in the OS taskbar. The Cancel button calls stopVoiceRecording explicitly — Esc does not.
Fix: When the global Esc handler removes a modal whose id is `voiceCmdModal`, call `stopVoiceRecording()` first.
Risk: Low — wrapped in try/catch and gated on the function existing.
Verified: syntax check OK.

