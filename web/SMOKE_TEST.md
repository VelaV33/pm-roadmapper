# Web build — smoke test checklist

Run through this before merging `feature/web-version` to `develop`.

## 0. Build the static site

```bash
cd web
npm install
npm run build
```

Expected: `[web build] OK — public/ written` plus 6 files in `public/shim/`
(electronAPI.js, supabase.js, pdf.min.js, pdf.worker.min.js,
mammoth.browser.min.js, jszip.min.js).

If any vendored library is missing, the build fails loudly with the path
that wasn't found in `node_modules`.

## 1. Local Vercel dev server

```bash
npx vercel dev
```

Expected: server on http://localhost:3000. First run prompts you to link
to a Vercel project; choose **link** and pick the `pm-roadmapper` project
(or create a new one — there are no env vars to set yet).

**DevTools console — must be clean of these on first load:**
- ❌ `Refused to load the script ... CSP` — vendoring failed
- ❌ `window.electronAPI is undefined` — shim not injected
- ❌ `supabase.createClient is not a function` — supabase.js not loaded
- ✅ `[electronAPI shim] ready — running in browser mode`

## 2. Sign-up flow (uses the renderer's existing login UI)

1. Click the renderer's signup link.
2. Enter a fresh email + password (≥ 8 chars).
3. Submit.

Expected: Supabase Auth creates the row, the
`on_auth_user_created_user_profile` trigger auto-creates a `basic` profile
row, the renderer transitions to the main UI.

**Verify in Supabase Studio (SQL editor):**
```sql
SELECT u.id, u.email, p.tier, p.created_at
  FROM auth.users u
  LEFT JOIN public.user_profiles p ON p.user_id = u.id
 ORDER BY u.created_at DESC LIMIT 5;
```
The new user should have `tier = 'basic'`.

## 3. Same account signs in on Electron

Open the Electron app and sign in with the email + password just created.
**Expected:** logs in successfully (proves the unified-identity requirement).

## 4. Roadmap CRUD

- Create a section.
- Create a row.
- Edit, drag, delete.
- Refresh the page.

Expected: changes persist via Supabase. The IndexedDB cache also fills —
verify in DevTools → Application → IndexedDB → `pmr-cache` → `roadmap`.

## 5. File operations

- **Backup export**: triggers a `netstar-roadmap-backup.json` download.
- **Backup import**: pick the just-downloaded file, data restores.
- **Save XLS export**: triggers an `.xls` download (uses SheetJS already
  vendored under `/vendor/xlsx.full.min.js`).
- **Print to PDF**: opens a new window and triggers the browser print
  dialog. May be blocked on first attempt by the popup blocker — allow
  popups for `localhost` and retry.

## 6. Document parsing (lazy-loaded vendored libraries)

For each, watch the Network tab — the parser script should appear ONCE
on first use, then be cached:

- **PDF**: import a PDF document → `pdf.min.js` and `pdf.worker.min.js`
  load from `/shim/...`. Text extraction succeeds.
- **DOCX**: import a Word doc → `mammoth.browser.min.js` loads.
- **PPTX**: import a PowerPoint → `jszip.min.js` loads, slide text
  extracted.
- **XLSX**: imports use the already-loaded SheetJS vendor.

## 7. Attachments via Supabase Storage

- Pick attachments → uploaded under `attachments/{auth.uid()}/...`.
- Open attachment → opens a signed URL in a new tab.

**Verify in Supabase Studio → Storage → attachments bucket:** files exist
under your user-id folder, **not visible** to a different signed-in user.
Test by signing in as a second account and checking that user A's files
are not listed.

## 8. AI request (with a real key)

In the renderer's AI settings, enter a real OpenAI / Anthropic / Gemini
key and trigger an AI action. Expected: response within a few seconds.
The request goes to `/api/ai-proxy`. Watch for `429 Rate limit exceeded`
if you fire >30 in a minute (hits the per-IP limit).

The serverless function MUST never log the API key — verify by checking
Vercel function logs after a test request.

## 9. Audio transcription

Record voice in the renderer (uses `MediaRecorder`). Submit. Goes to
`/api/transcribe`, which tries Gemini models in order. Returns text.

**Permission**: the Permissions-Policy header in `vercel.json` allows
microphone access on `'self'`. Browser will still prompt the user once.

## 10. Cross-tenant isolation (the launch requirement)

**This is the most important test.** Sign up two unrelated accounts:

| User A | User B |
|---|---|
| `alice+test1@example.com` | `bob+test1@example.com` |

For each, log in and verify:

- ❌ Cannot see the other user's roadmap data
- ❌ Cannot see the other user's contacts
- ❌ Cannot see the other user's notifications
- ❌ Cannot see the other user's teams (list should be empty for fresh accounts)
- ❌ Cannot list / read the other user's attachments in Supabase Storage
- ❌ Cannot read the other user's `user_profiles.tier`

Run this confirmation query in Supabase SQL editor (signed in as User B
via the Studio's "set role" feature is impractical; instead, exercise it
through the renderer):

In User B's session, attempt:
```javascript
// In DevTools console while signed in as User B
const r = await electronAPI.supaDb({
  path: '/rest/v1/user_profiles?select=*',
  method: 'GET'
});
console.log(r);
```
Expected: returns ONLY User B's own row. (Before the RLS fix, this would
have returned every user's row.)

## 11. Electron app still works

Run the Electron app concurrently (`npm start` from the project root) and
exercise the same flows. Expected: zero regression. Both apps use the
same Supabase project, so changes made in one show up after refresh in
the other.

---

If any step fails, **don't deploy.** Fix the shim or the migration first.
