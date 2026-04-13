# CLAUDE.md — Roadmap OS Project Context

## Project Overview
Roadmap OS (formerly PM Roadmapper) is a product roadmap tool that ships as both an Electron desktop app and a Vercel-hosted web app from a single codebase.

## Critical Architecture Facts
- **renderer/index.html** is a 23,445-line single-file SPA. ALL UI, logic, and styles live here. Do NOT split it into separate files.
- The renderer calls `window.electronAPI.*` for platform ops. Two implementations exist: `main.js`/`preload.js` (Electron) and `web/shim/electronAPI.js` (browser).
- Data is stored as one JSONB blob per user in the `roadmap_data` Supabase table.
- Dark mode uses CSS variables and a `.dark-mode` class toggle on `<body>`. Every new UI element MUST support dark mode.
- Navigation uses individual open/close functions per feature (openPlans, openG2M, openCapacity, openTodo, etc.) — there is NO centralized `showPage()` router.
- 15 Supabase Edge Functions (Deno) in `supabase/functions/`.
- Supabase project ID: `nigusoyssktoebzscbwe` (eu-west-1).

## Dark Mode Variables (lines 38-52)
```css
body.dark-mode {
  --navy: #e2e8f0;       /* WARNING: inverted for text, NOT for backgrounds */
  --bg: #0f172a;
  --white: #1e293b;       /* dark surface — confusing name, but this IS the dark card bg */
  --border: #334155;
  --text: #e2e8f0;
  --muted: #94a3b8;
  --surface-low: #1e293b;
  --surface-high: #334155;
  --outline-var: #475569;
  --light-blue-bg: #1e3a8a;
  --toolbar-bg: rgba(15,23,42,.92);
}
```

**CRITICAL:** `--navy` flips to LIGHT in dark mode (for text inversion). Do NOT use `var(--navy)` as a background in dark mode — it will be light. Use `#0f172a` or `var(--bg)` for dark backgrounds instead.

## Coding Standards
- Match existing patterns exactly: indentation, naming, CSS structure.
- No build tools (no webpack/vite). The HTML file is served as-is.
- External libraries are vendored into `web/shim/` or `public/shim/` — no CDN imports at runtime.
- Use CSS variables for all colors (especially for dark mode compatibility).
- All Supabase tables use `FORCE ROW LEVEL SECURITY`.
- Edge functions must verify JWT at both gateway and application level.

## Design Rules
1. **ZERO EMOJI.** No Unicode emoji anywhere in the app. Use clean, minimal SVG icons (stroke-based, 1.5-2px stroke, `currentColor`, matching sidebar nav style).
2. **Dark mode is mandatory** for every element. No white backgrounds in dark mode.
3. **UI consistency:** All pages must match the main roadmap page's design language — border-radius: 12px on cards, subtle shadows, consistent spacing.
4. **Dropdowns must be dark-mode-aware.**

## Common Patterns
- **Dark mode override:** Add rules after line ~97 in the dark-mode CSS section
- **SVG icons:** `viewBox="0 0 20 20"`, `stroke="currentColor"`, `stroke-width="1.5"`, `fill="none"`. Wrap in `<span class="icon">`
- **Saving data:** Merge into the user's JSONB blob and call the sync function
- **Edge functions:** Follow `_shared/auth.ts` pattern

## Testing
- Web build: `cd web && npm run build` — must succeed
- Dark mode: toggle and check EVERY new element
- Zero emoji: `grep -Pc '[\x{1F300}-\x{1FAFF}]' renderer/index.html` should be 0
