# PM Roadmapper

Product strategy and roadmap tool. Ships as both a desktop app (Electron)
and a web app, sharing one Supabase backend so a single user account works
everywhere.

| | Live URL | How users get it |
|---|---|---|
| 🌐 Web | **https://app.pmroadmapper.com** | sign up in a browser |
| 🖥️ Desktop | https://github.com/VelaV33/pm-roadmapper/releases | download installer; auto-updates from GitHub Releases |
| 🏠 Marketing site | https://pmroadmapper.com | (separate `pm-roadmapper-site` repo) |

---

## Quick start (development)

### Desktop app
```bash
npm install
npm start
```
Requires [Node.js v18+](https://nodejs.org).

### Web app
```bash
cd web
npm install
npm run build      # builds web/public/ from ../renderer/
npx vercel dev     # http://localhost:3000 (or 3001 if 3000 is taken)
```
The first run prompts you to link to the Vercel project — pick `web`.

---

## Architecture

The renderer is a single 23k-line `renderer/index.html` SPA. Both
distributions run that **same renderer unchanged**:

- **Electron**: `main.js` exposes 24 IPC methods to the renderer via
  `preload.js`. The renderer calls `window.electronAPI.*` for file I/O,
  Supabase REST proxying, AI provider proxying, etc.
- **Web**: `web/shim/electronAPI.js` re-implements all 24 methods using
  browser APIs (IndexedDB cache, Supabase Storage, Blob downloads,
  vendored pdf.js / mammoth / jszip parsers). Two Vercel Edge functions
  (`web/api/ai-proxy.js`, `web/api/transcribe.js`) act as stateless CORS
  proxies for OpenAI / Anthropic / Gemini — users still bring their own
  API keys.

The shim's contracts match `main.js` exactly so the renderer cannot tell
the difference at runtime. See `web/README.md` for the full method-by-method
mapping.

### Backend

Single Supabase project: `nigusoyssktoebzscbwe`.

- **Auth**: Supabase Auth. One signup works on both web and desktop.
- **Data**: `roadmap_data` (one JSONB blob per user), plus per-feature
  tables (`contacts`, `notifications`, `feedback_*`, `teams`, etc.).
- **Storage**: `attachments` bucket, path-scoped by `auth.uid()`.
- **RLS**: every public table has `FORCE ROW LEVEL SECURITY` and
  per-user / per-team isolation policies. Cross-tenant data leakage is
  not possible. See `supabase/migrations/`.

---

## Build & release (desktop)

```bash
npm run build:win    # → dist/*.exe   (Windows)
npm run build:mac    # → dist/*.dmg   (macOS, must run on a Mac)
npm run build:linux  # → dist/*.AppImage
```

To publish to GitHub Releases (so existing users get the auto-update):

```bash
$env:GH_TOKEN="ghp_yourtokenhere"          # PowerShell
npx electron-builder --win --publish always
```

Or upload `dist/*.exe`, `dist/*.exe.blockmap`, and `dist/latest.yml`
manually to a new release on GitHub.

---

## Build & deploy (web)

```bash
cd web
npm install
npm run build         # writes web/public/
npx vercel --prod     # deploys to https://app.pmroadmapper.com
```

The current Vercel project ships pre-built `public/` directly — no build
runs on Vercel. See `web/vercel.json` and the commit history for the
trade-off and the long-term cleanup TODO.

End-to-end smoke test checklist: **`web/SMOKE_TEST.md`** — sign up two
test accounts and verify cross-tenant isolation before opening signups
to the world.

---

## Project structure

```
├── main.js                  # Electron main process
├── preload.js               # contextBridge → electronAPI
├── renderer/
│   └── index.html           # Full SPA (23k lines, runs in both targets)
├── web/                     # Web build — outside electron-builder files[]
│   ├── shim/electronAPI.js  # Browser implementation of all 24 IPC methods
│   ├── api/                 # Vercel Edge functions (AI proxy, transcribe)
│   ├── scripts/build.js     # Copies renderer + injects shim into public/
│   ├── public/              # Built static site (committed; .vercelignore'd in)
│   └── vercel.json
├── supabase/
│   ├── config.toml          # Local dev config + per-function JWT verify
│   ├── migrations/          # Schema + RLS — applied to live project
│   └── functions/           # Edge functions (admin-api, contacts-api, etc.)
└── package.json
```

---

## Key files when something breaks

| Symptom | Look here |
|---|---|
| Web shim missing a method | `web/shim/electronAPI.js` + `preload.js` (must match) |
| Desktop IPC misbehaving | `main.js` (handler) + `preload.js` (bridge) |
| RLS denying a query | `supabase/migrations/*.sql` policies |
| AI request fails on web | `web/api/ai-proxy.js` (rate limit, upstream error) |
| New schema needed | New migration in `supabase/migrations/`, apply via `supabase db push` |
