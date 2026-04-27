# Microsoft Teams + Planner Integration

This document describes what's wired up today (Phase 1) and what's stubbed
for a future drop (Phase 2). The Teams card is the sixth integration
provider in Roadmap OS, joining Jira, GitHub, Slack, Asana, and Linear.

For Azure AD app registration steps + secrets configuration, see
[INTEGRATION_SETUP_GUIDE.md - section 6](./INTEGRATION_SETUP_GUIDE.md).

---

## What it does

A single Teams connection bundles two sub-features:

1. **Microsoft Planner sync** (Jira-equivalent). Bidirectional sync between
   a Planner plan and a Roadmap OS plan / section / feedback queue. The
   Configure modal lets the user pick a Planner plan; tasks are imported
   on `Sync Now` and the export path PATCHes Planner tasks back when
   Roadmap OS-side changes are detected.
2. **Channel notifications** (Slack-equivalent). The user picks a
   Microsoft Teams team + channel during Configure. The backend exposes a
   `postTeamsNotification(conn, html)` helper that posts an HTML message
   to that channel via Microsoft Graph.

Both sub-features share one OAuth connection (one row in
`integration_connections` with `provider = 'teams'`). The connection's
`config` JSONB carries:

```jsonc
{
  "userId": "...",            // Graph /me id
  "displayName": "Sabelo V",
  "email": "...",
  // Planner
  "planId": "...",
  "planName": "...",
  "groupId": "...",           // Microsoft 365 group that owns the plan
  // Notifications
  "notificationTeamId": "...",
  "notificationChannelId": "...",
  "notificationTeamName": "...",
  "notificationChannelName": "..."
}
```

---

## Planner mapping

| Planner field        | Roadmap OS field                          |
|----------------------|-------------------------------------------|
| `title`              | `title` / `name`                          |
| `percentComplete: 0` | `status: 'todo'`                          |
| `percentComplete: 50`| `status: 'in_progress'`                   |
| `percentComplete: 100`| `status: 'done'`                         |
| `assignments` (first key) | `assignee` (Graph user id)           |
| `dueDateTime`        | `dueDate` (date-only slice)               |
| `appliedCategories` (keys) | `labels`                            |
| `id`                 | `externalId`                              |
| `orderHint`          | `externalKey` (truncated)                 |

Planner has no native "blocked" status, so on import nothing maps to
`blocked`. On export, `blocked` is treated like `in_progress`
(percentComplete = 50) until Microsoft adds a real blocked state.

The `description` field is currently sourced from the task title to avoid
the per-task `/details` round trip — Microsoft Graph throttling makes that
2x request count painful on large plans. If richer descriptions become
load-bearing, fetch `/planner/tasks/{id}/details` and gate it behind a
"deep import" toggle.

---

## Microsoft Graph specifics

- **OAuth endpoints** (multi-tenant):
  - `https://login.microsoftonline.com/common/oauth2/v2.0/authorize`
  - `https://login.microsoftonline.com/common/oauth2/v2.0/token`
- **Scopes:** `User.Read offline_access Channel.ReadBasic.All ChannelMessage.Send Group.Read.All Tasks.ReadWrite Team.ReadBasic.All`
- **API base:** `https://graph.microsoft.com/v1.0`
- **Throttling:** 429 responses include a `Retry-After` (seconds) header.
  The `graphFetch` helper in `integrations-sync/index.ts` and
  `integrations-api/index.ts` honours it with up to 3 retries.
- **Pagination:** `value` + `@odata.nextLink`. Both helpers cap loops at
  20 pages to avoid runaway scans.
- **Planner PATCH:** every `PATCH /planner/tasks/{id}` requires an
  `If-Match` header set to the `@odata.etag` returned by the matching GET.
  `applyExportToPlanner` does the GET-then-PATCH dance for you.

---

## Phase 1 - what ships now

- Azure AD app registration documented end-to-end in the setup guide.
- OAuth flow (`integrations-oauth`):
  - Provider entry with multi-tenant `/common/` endpoints + scope on token
    exchange + refresh.
  - Callback enrichment seeds `config` with `{ userId, displayName, email }`
    from `GET /me`.
- API surface (`integrations-api`):
  - `GET /projects/teams` -> Planner plans (`/me/planner/plans`).
  - `GET /teams-list/teams` -> joined Microsoft Teams (`/me/joinedTeams`).
  - `GET /teams-channels/{teamId}/teams` -> channels of a team.
- Sync (`integrations-sync`):
  - `fetchTeamsItems(conn)` reads `/planner/plans/{planId}/tasks` with
    pagination + 429 retry.
  - `applyExportToPlanner(conn, item, externalId?)` creates or updates
    Planner tasks, including the `If-Match` etag handshake on update.
  - `postTeamsNotification(conn, html)` posts an HTML message to the
    configured team+channel via `/teams/{id}/channels/{id}/messages`.
- Webhook (`integrations-webhook`):
  - Echoes the `validationToken` query param when Microsoft Graph performs
    the subscription validation handshake (5-second deadline).
  - Logs change notification payloads and returns 200 (no processing yet).
- Frontend (`renderer/index.html`):
  - Sixth `INTEGRATION_DEFS` entry for Teams.
  - Configure modal exposes both selectors: Planner plan + Team/Channel
    for notifications. Selections persist into `connection.config`.
  - Connected-card subtitle shows `Plan 'X' · #channel`.
- Migration `20260427000000_teams_integration.sql` extends the
  `integration_connections.provider` CHECK to include `'teams'`.

---

## Phase 2 - what's still stubbed

Two pieces are intentionally deferred because they need additional design
work and Microsoft-side configuration that's painful to do without a real
tenant in front of you:

### 1. Auto-post Teams notification on initiative status change

`postTeamsNotification(conn, html)` is exported from `integrations-sync` as
a callable helper. The renderer-side hook that fires it whenever an
initiative's status changes is **not yet wired**. The right place is the
status-change site in `renderer/index.html` (search for status mutation
sites e.g. `status-change` handlers around the row card editors) -
hooking it there should:

1. Read the user's Teams connection config (via `fetchIntegrationStatuses`).
2. Skip if no Teams connection or no `notificationChannelId`.
3. Build an HTML message (e.g. `<b>Roadmap OS</b> - "<i>{name}</i>" moved
   from <b>{old}</b> to <b>{new}</b>`).
4. Call the new helper through a thin edge-function endpoint
   (e.g. `POST /integrations-api/notify/teams`) that internally invokes
   `postTeamsNotification` server-side with the user's stored token.

The reason it's stubbed: the renderer has multiple status-mutation sites
(roadmap rows, plan tasks, kanban cards), and we want a single fan-out
hook rather than five sprinkled calls. That refactor is out of scope here.

### 2. Process Microsoft Graph change notifications

The `/integrations-webhook/webhook/teams` endpoint passes the validation
handshake but doesn't yet:

- Verify the `clientState` value that you set when creating the
  `/subscriptions` resource.
- Decrypt `encryptedContent` (Graph encrypts payload at rest with the
  certificate you uploaded during subscription creation).
- Fan out notifications into the user's roadmap blob the way Jira/GitHub
  webhooks do.

To unblock that you'll need:

- A subscription manager (cron + edge function) that creates and renews
  `/subscriptions` resources (max lifetime ~3 days for most resources).
- A keypair stored in Supabase Vault for payload decryption.
- A mapping from `subscription.clientState` -> `connection_id` so we know
  which Roadmap OS user a given inbound notification belongs to.

Until then, Roadmap OS only sees Planner changes when the user clicks
**Sync Now** (or once the configured `sync_frequency` cron lands).

---

## Limits / known issues

- **Planner has no per-task URL.** `externalUrl` is set to the plan board
  URL (`https://tasks.office.com/_#/plantaskboard/{planId}`) for now.
- **Description is title-only.** See the Planner mapping table above for
  why; flip on a "deep import" toggle later if richer notes are needed.
- **Permissions.** `Group.Read.All` and `Channel.ReadBasic.All` need
  admin consent in most tenants. End users in restricted tenants will see
  the Microsoft consent screen reject their authorize call until an admin
  grants consent for the app.
- **No "blocked" status** on Planner. The mapping leaves `blocked` 100%
  one-way (Roadmap -> Planner becomes 50% complete; Planner -> Roadmap
  never produces blocked).
