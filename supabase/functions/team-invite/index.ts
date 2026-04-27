// POST /team-invite
// Body: { recipient_email: string, team_id?: string, team_name?: string }
// Headers: Authorization: Bearer <user JWT>
//
// Creates a team_invites row and emails the recipient a signup link. The
// inviter identity comes from the JWT so it can't be spoofed. Each invitee
// is granted a 30-day trial on the first redemption.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handle, verifyRequest, jsonResponse, errorResponse, rateLimit } from "../_shared/auth.ts";

const APP_URL  = Deno.env.get("APP_URL")  || "https://app.pmroadmapper.com";
const SITE_URL = Deno.env.get("SITE_URL") || "https://pmroadmapper.com";

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

// 32 bytes -> 43 char base64url, no padding. URL-safe.
function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

serve(handle(async (req) => {
  const { user, supabase } = await verifyRequest(req);
  await rateLimit("team_invite", user.id, 20, 3600);  // 20/hour per inviter

  const body = await req.json().catch(() => ({}));
  const { recipient_email, team_id, team_name } = body || {};

  if (!recipient_email || typeof recipient_email !== "string") {
    return errorResponse("recipient_email required", 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient_email)) {
    return errorResponse("Invalid recipient email", 400);
  }
  if (team_id && typeof team_id !== "string") return errorResponse("Invalid team_id", 400);
  if (team_name && typeof team_name !== "string") return errorResponse("Invalid team_name", 400);
  if (team_name && team_name.length > 200) return errorResponse("team_name too long", 400);

  const normalizedEmail = recipient_email.toLowerCase().trim();
  const inviterEmail    = user.email || "";
  const meta            = (user.user_metadata || {}) as { display_name?: string; full_name?: string };
  const inviterName     = meta.display_name || meta.full_name || (inviterEmail.split("@")[0] || "A user");

  if (normalizedEmail === inviterEmail.toLowerCase()) {
    return errorResponse("You cannot invite yourself", 400);
  }

  // Invalidate any prior pending invite for the same (inviter, email) so the
  // most recent email link is the only live one.
  await supabase
    .from("team_invites")
    .update({ status: "revoked" })
    .eq("inviter_user_id", user.id)
    .eq("invited_email", normalizedEmail)
    .eq("status", "pending");

  const token = randomToken();
  const expiresAt = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();

  const { error: insertErr } = await supabase.from("team_invites").insert({
    inviter_user_id:    user.id,
    invited_email:      normalizedEmail,
    invite_token:       token,
    team_id:            team_id || null,
    team_name:          team_name || null,
    status:             "pending",
    trial_granted_days: 30,
    expires_at:         expiresAt,
  });
  if (insertErr) {
    console.error("[team-invite] insert error:", insertErr.message);
    return errorResponse("Failed to create invite", 500);
  }

  // 2. Send email via Resend (same pattern as send-invite).
  const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
  const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "Roadmap OS <onboarding@resend.dev>";
  if (!RESEND_KEY) {
    // v1.46.1: surface the actual config gap so the renderer can show
    // something more useful than "unknown" in its toast. The frontend
    // (renderer/index.html ~L32567) reads email_error + hint and
    // displays both.
    console.error("[team-invite] RESEND_API_KEY is not set in this function's environment");
    return jsonResponse({
      ok: true,
      email_sent: false,
      invite_token: token,
      email_error: "RESEND_API_KEY is not set on the team-invite function",
      hint: "Add RESEND_API_KEY in Supabase Dashboard → Edge Functions → team-invite → Secrets, then re-deploy.",
    });
  }

  const acceptUrl = `${APP_URL}/?invite_token=${encodeURIComponent(token)}&email=${encodeURIComponent(normalizedEmail)}`;
  const safeInviter     = escapeHtml(inviterName);
  const safeInviterMail = escapeHtml(inviterEmail);
  const safeTeamName    = escapeHtml(team_name || "");
  const teamLine        = team_name
    ? `<p style="color:#374151;font-size:14px">You've been invited to join the <strong>${safeTeamName}</strong> team.</p>`
    : "";

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [normalizedEmail],
      subject: `${inviterName} invited you to Roadmap OS — 30-day free trial`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1f2937">
          <div style="background:#1a1464;border-radius:10px;padding:20px 24px;margin-bottom:24px">
            <h2 style="color:#fff;margin:0;font-size:20px">Roadmap OS</h2>
          </div>
          <h2 style="color:#1a1464;margin-top:0">You're invited to a 30-day free trial</h2>
          <p style="color:#374151;font-size:15px"><strong>${safeInviter}</strong> (${safeInviterMail}) invited you to collaborate on Roadmap OS.</p>
          ${teamLine}
          <div style="background:#f0f5ff;border:1px solid #c5d5ea;border-radius:8px;padding:16px 20px;margin:20px 0">
            <p style="margin:0;font-size:11px;color:#7b8db0;text-transform:uppercase;letter-spacing:.08em">What you get</p>
            <ul style="margin:10px 0 0;padding-left:18px;color:#1a1464;font-size:14px;line-height:1.55">
              <li><strong>30 days free</strong> — no card, no auto-charge at the end.</li>
              <li>Full Roadmap, G2M Readiness, KPI Scorecard, CapacityIQ.</li>
              <li>Keep collaborating after the trial by picking a plan.</li>
            </ul>
          </div>
          <div style="text-align:center;margin:28px 0">
            <a href="${acceptUrl}" style="display:inline-block;background:#1a1464;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600">Accept invite &amp; start trial</a>
          </div>
          <p style="color:#6b7280;font-size:12px;text-align:center;margin:0">
            Or copy this link: <br>
            <span style="word-break:break-all;color:#4338ca">${escapeHtml(acceptUrl)}</span>
          </p>
          <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">
            This invite expires in 14 days. If you weren't expecting it, you can safely ignore it.<br>
            Pricing &amp; plans: <a href="${SITE_URL}/pricing" style="color:#4338ca">${escapeHtml(SITE_URL)}/pricing</a>
          </p>
        </div>
      `,
    }),
  });

  if (!resendRes.ok) {
    const txt = await resendRes.text();
    console.error("[team-invite] resend error:", resendRes.status, txt.substring(0, 200));
    // v1.46.1: parse Resend's JSON error and surface the actual reason
    // (e.g. "domain not verified", "rate limit exceeded"). Fall back to
    // raw text if Resend returned non-JSON.
    let parsedMessage = "";
    let parsedName = "";
    try {
      const j = JSON.parse(txt);
      parsedMessage = (j && (j.message || j.error || j.name)) || "";
      parsedName = (j && j.name) || "";
    } catch (_) { /* not JSON */ }
    let hint = "";
    const lcMsg = (parsedMessage || txt).toLowerCase();
    if (resendRes.status === 401 || resendRes.status === 403) {
      hint = "Resend rejected the API key. Verify RESEND_API_KEY value in Supabase secrets.";
    } else if (resendRes.status === 422 && (lcMsg.indexOf("verify") >= 0 || lcMsg.indexOf("domain") >= 0)) {
      hint = "The from-domain on " + FROM_EMAIL + " is not verified in Resend. Either verify the domain at resend.com/domains or set FROM_EMAIL to onboarding@resend.dev (Resend's testing sender).";
    } else if (resendRes.status === 429) {
      hint = "Resend rate limit hit. Try again shortly, or upgrade Resend plan.";
    } else if (parsedName === "validation_error") {
      hint = "Resend rejected the request payload. Check the from-address format and recipient validity.";
    }
    return jsonResponse({
      ok: true,
      email_sent: false,
      invite_token: token,
      email_error: "Resend HTTP " + resendRes.status + (parsedMessage ? ": " + parsedMessage : ""),
      hint: hint || "Check Supabase Dashboard → Edge Functions → team-invite logs for the full Resend response.",
    });
  }
  const resendData = await resendRes.json();
  return jsonResponse({ ok: true, email_sent: true, invite_token: token, email_id: resendData.id });
}));
