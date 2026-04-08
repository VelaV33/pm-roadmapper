#!/usr/bin/env bash
# Deploy the security-hardened edge functions and run pending migrations.
# Run this from the repo root after `supabase login` and `supabase link`.
#
# Usage:
#   ./scripts/deploy-supabase.sh
#
# Functions that require JWT verification (the gateway rejects calls
# without a valid Authorization header). Our code also re-verifies — the
# gateway is belt-and-suspenders.
JWT_FUNCTIONS=(
  sync-roadmap
  get-shared-roadmap
  get-my-shares
  send-invite
  admin-api
  competitive-analysis
)

# Functions that MUST be unauthenticated (signup / password recovery).
# These implement their own rate limiting and never reveal account existence.
NO_JWT_FUNCTIONS=(
  create-user
  reset-password
)

set -euo pipefail

echo "──────────────────────────────────────────────────────────────"
echo " 1/3  Pushing database migrations"
echo "──────────────────────────────────────────────────────────────"
supabase db push

echo
echo "──────────────────────────────────────────────────────────────"
echo " 2/3  Deploying JWT-gated functions"
echo "──────────────────────────────────────────────────────────────"
for fn in "${JWT_FUNCTIONS[@]}"; do
  echo "→ $fn (verify_jwt=true)"
  supabase functions deploy "$fn"
done

echo
echo "──────────────────────────────────────────────────────────────"
echo " 3/3  Deploying public functions"
echo "──────────────────────────────────────────────────────────────"
for fn in "${NO_JWT_FUNCTIONS[@]}"; do
  echo "→ $fn (verify_jwt=false — public, but rate-limited + JWT-less by design)"
  supabase functions deploy "$fn" --no-verify-jwt
done

echo
echo "✓ Done. Verify in the Supabase dashboard that:"
echo "    • All functions show the correct JWT setting"
echo "    • Migration 20260408000000_security_hardening was applied"
echo "    • RLS is enabled on roadmap_data and shared_roadmaps"
