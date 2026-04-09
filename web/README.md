# PM Roadmapper — Web Version

A Vercel-hosted browser build of the PM Roadmapper Electron app, running on
the same Supabase project so a single user account works on both platforms.

## How it works

The Electron app's renderer is a single 23k-line `renderer/index.html` that
talks to the Electron main process via `window.electronAPI` (defined in
`preload.js`). This `web/` build:

1. Copies `renderer/index.html` to `web/public/index.html` at build time.
2. Prepends a `<script src="/shim/electronAPI.js">` tag so the shim defines
   `window.electronAPI` *before* the renderer loads.
3. The shim re-implements all 24 IPC methods using browser APIs:
   - **Direct supabase-js** for everything that was just a CORS-bypass proxy
     (`supa-request`, `supa-db-request`).
   - **IndexedDB** for the offline cache (`load-data`, `save-data`).
   - **Blob + download anchor** for file save operations.
   - **`<input type=file>`** for file picking.
   - **Supabase Storage** for attachments (path-scoped by `auth.uid()`).
   - **`window.print()`** for PDF export.
   - **Vercel serverless functions** (`api/ai-proxy.ts`, `api/transcribe.ts`)
     for the only two methods that genuinely can't run in a browser due to
     CORS: AI requests and audio transcription. Users still bring their own
     API keys; the proxies are stateless and never store keys.
4. Supabase Auth handles signup/login. Same `auth.users` table as Electron.

## Coexistence with Electron

`web/` is **deliberately outside** the Electron `package.json` `build.files`
array, so the Electron build never picks it up. Conversely, the Electron app
never references anything under `web/`. Either build can ship without the
other.

## Local dev

```bash
cd web
npm install
npm run build         # copies + injects renderer/index.html
npx vercel dev        # serves the static site + serverless functions
```

## Deploy

```bash
cd web
npx vercel link       # link to the pm-roadmapper Vercel project
npx vercel deploy     # preview deploy
npx vercel deploy --prod
```

Required environment variables (set in Vercel dashboard):

| Name | Where | Why |
|---|---|---|
| `VITE_SUPABASE_URL` | client + functions | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | client | Anon key, RLS-protected |

**No AI provider keys server-side.** Users bring their own.
