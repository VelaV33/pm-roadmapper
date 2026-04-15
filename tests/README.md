# Tests

Two Node-based test files — no framework, no watcher, no transpile step.
The goal is a 10-second `npm test` that catches the classes of bug most
likely to bite a 26k-line inline-JS renderer.

## Run

```bash
npm test              # both suites
npm run test:capacity # pure helpers only
npm run test:parse    # renderer parse-check only
```

## What each file covers

### `capacity.test.js`

Pure-function assertions for the v1.33.0 capacity + calendar helpers.
Helpers are re-declared in the test (not `require`-d from the renderer,
which lives inside HTML) — the test is the contract, and the in-app
copy must stay in sync.

- `getCapHours()` — default fallback, sub-object defaults, string
  coercion, NaN handling.
- `_getTodosForWeek()` — ISO-week range filter, correct sum, excludes
  todos without `due`, excludes next-week items.
- `_normalizeGoogleEvent()` — cancelled/null/start-less rejection,
  30-minute → 0.5 h rounding, ISO date extraction, `(no title)`
  fallback.
- `_normalizeGraphEvent()` — isCancelled rejection, 90-minute → 1.5 h
  rounding, source tagging, `extId` preservation.
- Timesheet weekly target derivation from capacity settings.

### `renderer.parse.test.js`

Extracts every inline `<script>` block from `renderer/index.html` and
compiles each via `new vm.Script(...)`. Parses only — does not run. If a
brace is lost in a hand edit or a regex hits a template literal, this
test fails before the app ships. Cost: ~100 ms for ~1.3 MB of JS.

## Adding a new test

- Keep it pure — if the helper under test reads from a DOM global,
  either refactor the helper to take its inputs explicitly or stub the
  global at the top of the file.
- One `assert(name, cond, detail?)` per observable outcome. Avoid
  compound assertions; they hide which branch broke.
- No external dependencies. Node builtins only.
