# Deploy security-hardened edge functions and run pending migrations.
# Run from repo root after `supabase login` and `supabase link`.
#
# Usage:
#   .\scripts\deploy-supabase.ps1

$ErrorActionPreference = 'Stop'

$JwtFunctions = @(
    'sync-roadmap',
    'get-shared-roadmap',
    'get-my-shares',
    'send-invite',
    'admin-api',
    'competitive-analysis'
)

# These MUST be unauthenticated (signup / password recovery). They have
# their own rate limiting and never reveal account existence.
$NoJwtFunctions = @('create-user', 'reset-password')

Write-Host '=============================================================='
Write-Host ' 1/3  Pushing database migrations'
Write-Host '=============================================================='
supabase db push

Write-Host ''
Write-Host '=============================================================='
Write-Host ' 2/3  Deploying JWT-gated functions'
Write-Host '=============================================================='
foreach ($fn in $JwtFunctions) {
    Write-Host "-> $fn (verify_jwt=true)"
    supabase functions deploy $fn
}

Write-Host ''
Write-Host '=============================================================='
Write-Host ' 3/3  Deploying public functions (signup / password recovery)'
Write-Host '=============================================================='
foreach ($fn in $NoJwtFunctions) {
    Write-Host "-> $fn (verify_jwt=false, rate-limited in code)"
    supabase functions deploy $fn --no-verify-jwt
}

Write-Host ''
Write-Host 'Done. Verify in the Supabase dashboard that:'
Write-Host '  - All functions show the correct JWT setting'
Write-Host '  - Migration 20260408000000_security_hardening was applied'
Write-Host '  - RLS is enabled on roadmap_data and shared_roadmaps'
