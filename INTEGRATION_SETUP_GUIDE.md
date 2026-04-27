# Roadmap OS — Integration Setup Guide (v1.41.0)

After Claude Code builds the integration framework you need to **register OAuth apps**
with each provider, set the resulting Client ID + Client Secret as Supabase secrets,
deploy the edge functions, and run the migration.

The six providers wired in are **Jira (Cloud), GitHub, Slack, Asana, Linear,
Microsoft Teams + Planner**.

---

## Callback URL (same pattern for all providers)

```
https://nigusoyssktoebzscbwe.supabase.co/functions/v1/integrations-oauth/callback/{provider}
```

Replace `{provider}` with: `jira`, `github`, `slack`, `asana`, `linear`, `teams`.

---

## 1. Jira (Atlassian)

1. Go to https://developer.atlassian.com/console/myapps/
2. Create a new app -> "OAuth 2.0 (3LO)"
3. Add scopes: `read:jira-work`, `write:jira-work`, `read:jira-user`, `offline_access`
4. Set callback URL:
   `https://nigusoyssktoebzscbwe.supabase.co/functions/v1/integrations-oauth/callback/jira`
5. Copy the Client ID and Client Secret.
6. Set in Supabase:
   ```bash
   supabase secrets set JIRA_CLIENT_ID=your_client_id
   supabase secrets set JIRA_CLIENT_SECRET=your_client_secret
   ```
7. (Optional, for inbound webhooks) Pick a strong random secret and set:
   ```bash
   supabase secrets set JIRA_WEBHOOK_SECRET=your_random_secret
   ```
   In Jira, register a webhook at:
   `https://nigusoyssktoebzscbwe.supabase.co/functions/v1/integrations-webhook/webhook/jira?secret=your_random_secret`

## 2. GitHub

1. Go to https://github.com/settings/developers -> "OAuth Apps" -> "New OAuth App".
2. App name: "Roadmap OS"
3. Homepage URL: `https://pmroadmapper.com`
4. Callback URL:
   `https://nigusoyssktoebzscbwe.supabase.co/functions/v1/integrations-oauth/callback/github`
5. Copy Client ID and generate a Client Secret.
6. Set in Supabase:
   ```bash
   supabase secrets set GITHUB_CLIENT_ID=your_client_id
   supabase secrets set GITHUB_CLIENT_SECRET=your_client_secret
   supabase secrets set GITHUB_WEBHOOK_SECRET=any_random_string
   ```
7. Register a webhook on each repo (or use a GitHub App for bulk):
   - Payload URL: `https://nigusoyssktoebzscbwe.supabase.co/functions/v1/integrations-webhook/webhook/github`
   - Secret: same value as `GITHUB_WEBHOOK_SECRET`
   - Events: Issues, Issue comments

## 3. Slack

1. Go to https://api.slack.com/apps -> "Create New App" -> "From scratch".
2. App name: "Roadmap OS"; pick a workspace.
3. **OAuth & Permissions** -> add Redirect URL:
   `https://nigusoyssktoebzscbwe.supabase.co/functions/v1/integrations-oauth/callback/slack`
4. Bot Token Scopes: `channels:read`, `chat:write`, `incoming-webhook`
5. User Token Scopes: `channels:read`
6. Install to workspace, then go to **Basic Information** for Client ID, Client Secret, and Signing Secret.
7. Set in Supabase:
   ```bash
   supabase secrets set SLACK_CLIENT_ID=your_client_id
   supabase secrets set SLACK_CLIENT_SECRET=your_client_secret
   supabase secrets set SLACK_SIGNING_SECRET=your_signing_secret
   ```
8. **Event Subscriptions** -> Request URL:
   `https://nigusoyssktoebzscbwe.supabase.co/functions/v1/integrations-webhook/webhook/slack`
   - Subscribe to bot events: `message.channels`

## 4. Asana

1. Go to https://app.asana.com/0/developer-console -> "Create new app".
2. App name: "Roadmap OS"
3. Redirect URL:
   `https://nigusoyssktoebzscbwe.supabase.co/functions/v1/integrations-oauth/callback/asana`
4. Copy Client ID and Client Secret.
5. Set in Supabase:
   ```bash
   supabase secrets set ASANA_CLIENT_ID=your_client_id
   supabase secrets set ASANA_CLIENT_SECRET=your_client_secret
   supabase secrets set ASANA_WEBHOOK_SECRET=random_string
   ```
6. Webhooks are created via the Asana API per-resource; the framework calls
   that for you when you select a project in the configure modal.

## 5. Linear

1. Go to https://linear.app/settings/api -> "OAuth Applications" -> "New application".
2. App name: "Roadmap OS"
3. Redirect URL:
   `https://nigusoyssktoebzscbwe.supabase.co/functions/v1/integrations-oauth/callback/linear`
4. Copy Client ID and Client Secret.
5. Set in Supabase:
   ```bash
   supabase secrets set LINEAR_CLIENT_ID=your_client_id
   supabase secrets set LINEAR_CLIENT_SECRET=your_client_secret
   supabase secrets set LINEAR_WEBHOOK_SECRET=random_string
   ```
6. Register a webhook in Linear -> Settings -> API:
   - URL: `https://nigusoyssktoebzscbwe.supabase.co/functions/v1/integrations-webhook/webhook/linear`
   - Secret: same as `LINEAR_WEBHOOK_SECRET`

## 6. Microsoft Teams + Planner

Microsoft Teams integration covers two sub-features in a single connection:

- **Planner sync** (Jira-equivalent): bidirectional sync between a Microsoft
  Planner plan and a Roadmap OS plan / section / feedback queue.
- **Channel notifications** (Slack-equivalent): post status updates to a
  Microsoft Teams channel.

Both require the same Azure AD app registration.

1. Go to https://portal.azure.com -> **Azure Active Directory** -> **App
   registrations** -> **New registration**.
2. Name: `Roadmap OS`.
3. Supported account types: pick **Accounts in any organizational directory
   (Any Azure AD directory - Multitenant)** to allow users from any tenant
   to authorize. The OAuth endpoints use `/common/` to match this.
4. Redirect URI:
   - Platform: **Web**
   - URL: `https://nigusoyssktoebzscbwe.supabase.co/functions/v1/integrations-oauth/callback/teams`
5. Register the app, then grab the **Application (client) ID** from the
   Overview page.
6. **Certificates & secrets** -> **New client secret** -> set a long expiry
   and copy the **Value** (this is your client secret — only shown once).
7. **API permissions** -> **Add a permission** -> **Microsoft Graph** ->
   **Delegated permissions**, then add all of:
   - `User.Read`
   - `offline_access`
   - `Channel.ReadBasic.All`
   - `ChannelMessage.Send`
   - `Group.Read.All`
   - `Tasks.ReadWrite`
   - `Team.ReadBasic.All`
8. Some of these (e.g. `Group.Read.All`) require admin consent. Click
   **Grant admin consent for [your tenant]** if you're a tenant admin, or
   ask a tenant admin to do so. End users in other tenants will be prompted
   to consent on first authorization (or their admin will, depending on the
   tenant's consent settings).
9. Set in Supabase:
   ```bash
   supabase secrets set TEAMS_CLIENT_ID=your_application_client_id
   supabase secrets set TEAMS_CLIENT_SECRET=your_client_secret_value
   ```
10. (Optional, Phase 2) Register a Microsoft Graph **change notification**
    subscription pointing at:
    `https://nigusoyssktoebzscbwe.supabase.co/functions/v1/integrations-webhook/webhook/teams`
    The endpoint already handles the `validationToken` echo handshake.
    Active processing of notifications (auto-import on Planner task changes)
    is documented in [TEAMS_INTEGRATION.md](./TEAMS_INTEGRATION.md) as Phase 2.

---

## Apply the migration

```bash
supabase db push
```

This creates `integration_connections`, `integration_mappings`, `integration_sync_log`
in your project (idempotent — safe to re-run).

## Deploy the edge functions

```bash
supabase functions deploy integrations-oauth
supabase functions deploy integrations-webhook
supabase functions deploy integrations-api
supabase functions deploy integrations-sync
```

The four functions all have `verify_jwt = false` in `supabase/config.toml` because
each verifies inside the function (OAuth callbacks come from external providers,
webhooks come signed-by-provider, the api/sync functions verify the user JWT
directly with the Supabase auth admin API for routing flexibility).

## Verify in the app

1. Start the app.
2. Open the **Integrations** entry in the top nav.
3. Click **Connect** on any card -> a browser tab opens for OAuth.
4. Approve. The page returns to `#integrations?connected=<provider>` and the card
   flips to **Connected**.
5. Click **Configure** to pick a project / repo / channel and sync direction.
6. Click **Sync Now** to trigger an immediate import.

## Troubleshooting

- **"Token exchange failed"**: the secret on the provider side and the Supabase
  secret don't match. Re-set the secret and redeploy `integrations-oauth`.
- **"Signature verification failed" on webhooks**: the `*_WEBHOOK_SECRET` in
  Supabase doesn't match what's registered with the provider.
- **OAuth callback blocked by CSP**: callback runs server-side, never in the
  browser. If the popup never closes, the provider rejected the redirect URL
  (case-sensitive — must match exactly).
- **No projects show in the Configure modal**: the user might not have access to
  any in their connected workspace. For Jira, also make sure the cloud ID was
  saved (check `integration_connections.config`).
