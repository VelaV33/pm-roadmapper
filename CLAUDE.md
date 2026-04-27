# CLAUDE.md — Roadmap OS Project Context

## Project Overview
Roadmap OS (formerly PM Roadmapper) is a product roadmap tool that ships as both an Electron desktop app and a Vercel-hosted web app from a single codebase.

## Critical Architecture Facts
- **renderer/index.html** is a ~38,800-line single-file SPA. ALL UI, logic, and styles live here. Do NOT split it into separate files.
- The renderer calls `window.electronAPI.*` for platform ops. Two implementations exist: `main.js`/`preload.js` (Electron) and `web/shim/electronAPI.js` (browser).
- Data is stored as one JSONB blob per user in the `roadmap_data` Supabase table.
- Dark mode uses CSS variables and a class toggle. Every new UI element MUST support dark mode.
- Navigation is overlay-based: top-level views are full-screen `.modal-overlay` panels (`#kpiOverlay`, `#capOverlay`, etc.) opened by `openX()` and dismissed by `closeX()`. The roadmap itself is always rendered underneath; "going to roadmap" just calls `closeAllOverlays()`. The catalog of views lives in `_PMR_OVERLAY_MAP` (renderer/index.html, around line 38527) and `_pmrWireHistory()` (around line 38654) wraps each `openX/closeX` so back/forward + URL hash + nav-active state stay in sync.
- 15 Supabase Edge Functions (Deno) in `supabase/functions/`.
- Supabase project ID: `nigusoyssktoebzscbwe` (eu-west-1).

## Coding Standards
- Match existing patterns exactly: indentation, naming, CSS structure.
- No build tools (no webpack/vite). The HTML file is served as-is.
- External libraries are vendored into `web/shim/` or `public/shim/` — no CDN imports at runtime.
- Use CSS variables for all colors (especially for dark mode compatibility).
- All Supabase tables use `FORCE ROW LEVEL SECURITY`.
- Edge functions must verify JWT at both gateway and application level.

## Design Rules (CRITICAL)
1. **ZERO EMOJI.** No Unicode emoji anywhere in the app. Use clean, minimal SVG icons (stroke-based, 1.5-2px stroke, `currentColor`, matching sidebar nav style). This is non-negotiable.
2. **Dark mode is mandatory** for every element. No white backgrounds in dark mode. Use CSS variables: `var(--page-bg)`, `var(--card-bg)`, `var(--surface-bg)`, `var(--text-primary)`, `var(--text-secondary)`, `var(--border-color)`, `var(--input-bg)`, `var(--modal-bg)`.
3. **UI consistency:** All pages must match the main roadmap page's design language — border-radius: 12px on cards, subtle shadows, consistent spacing (16-20px padding), same typography.
4. **Dropdowns must be dark-mode-aware:** `<select>`, `<option>`, and custom dropdowns need explicit dark background + light text in dark mode.

## Common Patterns
- **Adding a new page (overlay):**
  1. Add the markup as a `<div class="modal-overlay hidden" id="myOverlay">…</div>` inside the body.
  2. Define `function openMyView(){ ... document.getElementById('myOverlay').classList.add('open'); }` and a matching `function closeMyView(){ document.getElementById('myOverlay').classList.remove('open'); }`. Don't push history yourself — the wrapper does it.
  3. Register the view in `_PMR_OVERLAY_MAP` (renderer/index.html ~38527) with `{ open:'openMyView', close:'closeMyView', id:'myOverlay', nav:'My View' }`. The `nav` value must match the label of the matching top-nav `<a>` so `updateNavActive()` highlights it.
  4. Wire the top-nav entry: `<a onclick="closeAllOverlays();openMyView();updateNavActive('My View');return false;">My View</a>` (match the existing nav style — see the Integrations entry for a recent example).
  5. `_pmrWireHistory()` runs once on script load and wraps both functions so opening pushes `#myView` to the URL and back/forward navigates correctly. Heavy views can be added to `_PMR_HEAVY_VIEWS` to show the branded loading overlay during the open call.
- **Saving data:** Merge into the user's JSONB blob and call the sync function.
- **Dark mode:** Check how existing `.dark-mode` selectors work. New elements need explicit dark mode overrides.
- **Edge functions:** Follow the pattern in `supabase/functions/_shared/auth.ts` for auth + rate limiting.
- **SVG icons:** Use inline SVGs with `viewBox="0 0 20 20"`, `stroke="currentColor"`, `stroke-width="1.5"`, `fill="none"`. Wrap in `<span class="icon">`.
- **Task Library:** When creating tasks ANYWHERE in the app (To-Do, Plans, G2M), also call `addToTaskLibrary(taskData)` to keep the central task library in sync.

## Data Model Extensions
- `currentData.taskLibrary[]` — Central task registry fed by To-Do, Plans, G2M
- `currentData.documentRepository` — `{ folders: [], documents: [] }` with Supabase Storage for files
- `row.links[]` — Initiative linking (dependencies + references, own roadmap + shared)
- User profile picture stored in Supabase Storage or as base64 in settings

## Testing
- Syntax check: `node -e "require('fs').readFileSync('renderer/index.html','utf8')"` (ensures file isn't corrupted)
- Emoji check (POSIX): `grep -Pc '[\x{1F300}-\x{1FAFF}]' renderer/index.html` (must be 0)
- Emoji check (Windows-safe): `node -e "process.stdout.write(String((require('fs').readFileSync('renderer/index.html','utf8').match(/[\u{1F300}-\u{1FAFF}]/gu) || []).length))"`
- White background check: `grep -c "background.*white\|background.*#fff" renderer/index.html` (each must have a dark mode override)
- Web build: `cd web && npm run build` — must succeed without errors

## Autonomous Operation
When working on a fix queue:
1. Never ask for clarification — make the best decision and log it in FIX_LOG.md
2. Never stop between fixes — complete one, move to the next
3. Self-review after each fix — re-read changes, check for syntax errors, verify logic
4. Preserve existing patterns — match the codebase style exactly
5. Dark mode everything — every new element must support dark mode
6. Keep the single-file SPA pattern — all UI changes go into renderer/index.html
7. Zero emoji — replace any emoji encountered while working
8. Reference the roadmap page as the UI gold standard
