# CLAUDE.md — Roadmap OS Project Context

## Project Overview
Roadmap OS (formerly PM Roadmapper) is a product roadmap tool that ships as both an Electron desktop app and a Vercel-hosted web app from a single codebase.

## Critical Architecture Facts
- **renderer/index.html** is a 23,445-line single-file SPA. ALL UI, logic, and styles live here. Do NOT split it into separate files.
- The renderer calls `window.electronAPI.*` for platform ops. Two implementations exist: `main.js`/`preload.js` (Electron) and `web/shim/electronAPI.js` (browser).
- Data is stored as one JSONB blob per user in the `roadmap_data` Supabase table.
- Dark mode uses CSS variables and a class toggle. Every new UI element MUST support dark mode.
- Navigation uses a `showPage('pageId')` pattern. Pages are `<div>` sections toggled by display.
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
- **Adding a new page:** Create `<div id="my-page" class="page" style="display:none">`, add nav button with `onclick="showPage('my-page')"`, add case in `showPage()` function.
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
- Emoji check: `grep -Pc '[\x{1F300}-\x{1FAFF}]' renderer/index.html` (must be 0)
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
