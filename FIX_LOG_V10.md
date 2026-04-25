# Roadmap OS Fix Log v10 — Integrations — 2026-04-25

v1.40.2 → **v1.41.0** (target). Five two-way integrations: Jira, GitHub, Slack, Asana, Linear.

## Pre-flight findings

- Existing edge functions follow the shared pattern in `_shared/auth.ts`:
  `handle()` wrapper for CORS+errors, `verifyRequest(req)` returns
  `{user, supabase}` (service-role client). CORS uses `*` origin with
  `authorization, x-client-info, apikey, content-type` headers. JSON
  responses come back via `jsonResponse(body, status)`.
- A prior `user_integrations` table already exists from v1.28.0 (Slack-only
  scaffold). v10 adds richer tables (`integration_connections`,
  `integration_mappings`, `integration_sync_log`) per spec — kept separate so
  the Slack-API status flow continues working unchanged.
- `slack-api` edge function exists from prior work; I leave it in place and
  add the 5 new functions alongside.
- App URL for OAuth redirects: `https://app.pmroadmapper.com`.
- Supabase project ref: `nigusoyssktoebzscbwe` (eu-west-1).

## Decisions

- **Auth pattern**: every edge function uses the existing
  `_shared/auth.ts` `handle()` + `verifyRequest()` helpers EXCEPT OAuth
  callbacks (called by external providers, no JWT) and webhook receivers
  (signed by provider, no user JWT). Those routes do raw routing inside the
  handler.
- **Provider tokens** are stored on `integration_connections.access_token` /
  `refresh_token`. Encrypted-at-rest by Supabase. Never returned to the
  frontend — `/status` and `/configure` endpoints select only safe columns.
- **Webhook signature verification** is implemented per provider:
  GitHub HMAC-SHA256 (`X-Hub-Signature-256`), Slack signing-secret
  (`X-Slack-Signature` + `X-Slack-Request-Timestamp`), Asana
  HMAC-SHA256 (`X-Hook-Signature`), Linear HMAC-SHA256, Jira shared-secret
  (header `X-Atlassian-Webhook-Identifier` + secret param).
- **Conflict detection** uses `sync_hash` on the mapping row — MD5 of
  `title|description|status|priority|dueDate`. If both sides changed since
  last sync, log a `conflict` row and apply the side with the newer
  `updatedAt`.
- **OAuth popup flow** is the same as the existing Google calendar OAuth —
  open the auth URL in `window.open()`, poll `/status` every 5s, render
  Integrations page on success.

## Phase tracking

- [x] Fix 1 — DB migration (3 tables + RLS + indexes + triggers)
- [x] Fix 2 — integrations-oauth (authorize/callback/disconnect/status)
- [x] Fix 3 — integrations-sync (import/export/sync)
- [x] Fix 4 — integrations-webhook (Jira/GH/Slack/Asana/Linear receivers)
- [x] Fix 5 — integrations-api (project listing + configure + history)
- [x] Fix 6 — Integrations page UI
- [x] Fix 7 — Frontend sync helpers
- [x] Fix 8 — INTEGRATION_SETUP_GUIDE.md
- [x] Bump v1.41.0 + commit + push + rebuild
