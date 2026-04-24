// POST /redeem-invite
// Body: { invite_token: string }
// Headers: Authorization: Bearer <user JWT>
//
// Redeems a pending team_invites row for the authenticated user. Must be
// called AFTER the invitee signs up / logs in. Starts a 30-day trial by
// setting their user_profiles row to:
//   tier='standard', subscription_status='trialing',
//   trial_started_at=now(), tier_expires_at=now()+30d, invited_by_user_id=<inviter>.
//
// Idempotent: re-submitting an already-accepted token is a no-op (200 OK).
// Does NOT downgrade an existing paid user — if the invitee already has
// subscription_status='active', we only mark the invite accepted and skip the
// trial fields.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handle, verifyRequest, jsonResponse, errorResponse } from "../_shared/auth.ts";

serve(handle(async (req) => {
  const { user, supabase } = await verifyRequest(req);

  const body = await req.json().catch(() => ({}));
  const { invite_token } = body || {};
  if (!invite_token || typeof invite_token !== "string" || invite_token.length < 20) {
    return errorResponse("invite_token required", 400);
  }

  const userEmail = (user.email || "").toLowerCase();

  // 1. Look up invite by token (service role bypasses RLS — safe because
  // token is opaque 32-byte random).
  const { data: invite, error: inviteErr } = await supabase
    .from("team_invites")
    .select("*")
    .eq("invite_token", invite_token)
    .maybeSingle();
  if (inviteErr) {
    console.error("[redeem-invite] lookup error:", inviteErr.message);
    return errorResponse("Failed to read invite", 500);
  }
  if (!invite) return errorResponse("Invite not found", 404);

  // 2. Already accepted by this user → no-op success.
  if (invite.status === "accepted" && invite.accepted_user_id === user.id) {
    return jsonResponse({ ok: true, already_accepted: true });
  }
  if (invite.status !== "pending") {
    return errorResponse(`Invite is ${invite.status}`, 410);
  }
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    await supabase.from("team_invites").update({ status: "expired" }).eq("id", invite.id);
    return errorResponse("Invite has expired", 410);
  }
  if ((invite.invited_email || "").toLowerCase() !== userEmail) {
    return errorResponse("Invite was issued to a different email", 403);
  }

  // 3. Load (or stub) the invitee's profile so we can decide whether to grant
  // the trial or skip (already paid).
  const { data: existing, error: profileErr } = await supabase
    .from("user_profiles")
    .select("user_id, subscription_status, tier, tier_expires_at")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileErr) {
    console.error("[redeem-invite] profile read error:", profileErr.message);
    return errorResponse("Failed to read profile", 500);
  }

  const grantTrial = !existing || existing.subscription_status !== "active";
  const now = new Date();
  const trialEnd = new Date(now.getTime() + (invite.trial_granted_days || 30) * 24 * 3600 * 1000);

  if (grantTrial) {
    const profilePatch: Record<string, unknown> = {
      user_id:             user.id,
      email:               userEmail,
      tier:                "standard",
      subscription_status: "trialing",
      trial_started_at:    now.toISOString(),
      tier_expires_at:     trialEnd.toISOString(),
      invited_by_user_id:  invite.inviter_user_id,
      updated_at:          now.toISOString(),
    };
    const { error: upErr } = await supabase
      .from("user_profiles")
      .upsert(profilePatch, { onConflict: "user_id" });
    if (upErr) {
      console.error("[redeem-invite] profile upsert error:", upErr.message);
      return errorResponse("Failed to start trial", 500);
    }
  }

  // 4. Mark invite accepted.
  const { error: acceptErr } = await supabase
    .from("team_invites")
    .update({
      status:           "accepted",
      accepted_at:      now.toISOString(),
      accepted_user_id: user.id,
    })
    .eq("id", invite.id);
  if (acceptErr) {
    console.error("[redeem-invite] accept update error:", acceptErr.message);
    // Non-fatal — trial already granted, just log.
  }

  return jsonResponse({
    ok:              true,
    trial_granted:   grantTrial,
    trial_ends_at:   grantTrial ? trialEnd.toISOString() : null,
    inviter_user_id: invite.inviter_user_id,
    team_id:         invite.team_id,
    team_name:       invite.team_name,
  });
}));
