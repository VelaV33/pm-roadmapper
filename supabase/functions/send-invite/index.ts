import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handle, verifyRequest, jsonResponse, errorResponse } from "../_shared/auth.ts";

// Basic HTML escape — used when interpolating any user-controlled string into
// the email body to avoid HTML injection.
function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

serve(handle(async (req) => {
  const { user, supabase } = await verifyRequest(req);

  const body = await req.json().catch(() => ({}));
  const { recipient_email, roadmap_name } = body || {};

  // owner_id, owner_name, owner_email come from the verified JWT — NOT body —
  // so a caller cannot impersonate someone else.
  const owner_id = user.id;
  const owner_email = user.email || "";
  const meta = (user.user_metadata || {}) as { display_name?: string; full_name?: string };
  const owner_name = meta.display_name || meta.full_name || (owner_email.split("@")[0] || "A user");

  if (!recipient_email || !roadmap_name) {
    return errorResponse("Missing required fields", 400);
  }
  if (typeof recipient_email !== "string" || typeof roadmap_name !== "string") {
    return errorResponse("Invalid field types", 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient_email)) {
    return errorResponse("Invalid recipient email", 400);
  }
  if (roadmap_name.length > 200) {
    return errorResponse("Roadmap name too long", 400);
  }

  const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
  const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "Roadmap OS <onboarding@resend.dev>";
  const APP_URL = Deno.env.get("APP_URL") || "https://app.pmroadmapper.com";

  // 1. Save share record (owner_id derived from JWT — cannot be spoofed)
  const { error: shareErr } = await supabase
    .from("shared_roadmaps")
    .upsert(
      {
        owner_id,
        owner_name,
        owner_email,
        recipient_email: recipient_email.toLowerCase().trim(),
        roadmap_name,
      },
      { onConflict: "owner_id,recipient_email" },
    );

  if (shareErr) {
    console.error("[send-invite] share save error:", shareErr.message);
    return errorResponse("Failed to save share", 500);
  }

  // 2. Send email via Resend. v1.43.1 — surface the actual error back to the
  // caller so the UI can show it (previously the generic "share saved" was
  // returned no matter what, masking missing API keys / unverified domains).
  if (!RESEND_KEY) {
    return jsonResponse({
      ok: true,
      email_sent: false,
      email_error: "RESEND_API_KEY not set",
      hint: "Set the RESEND_API_KEY secret in Supabase: `supabase secrets set RESEND_API_KEY=re_...`",
    });
  }

  const safeOwner = escapeHtml(owner_name);
  const safeOwnerEmail = escapeHtml(owner_email);
  const safeRoadmap = escapeHtml(roadmap_name);

  // v1.43.1 — branded email template using the actual app accent color and
  // pointing at the live web app instead of the GitHub release page.
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px">
        <tr><td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(15,23,42,.08)">
            <tr><td style="background:linear-gradient(135deg,#3b82f6 0%,#2563eb 100%);padding:28px 32px">
              <table role="presentation" cellpadding="0" cellspacing="0"><tr>
                <td style="vertical-align:middle">
                  <table role="presentation" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,.16);border-radius:9px;width:36px;height:36px"><tr><td align="center" style="font-size:18px;font-weight:800;color:#ffffff;width:36px;height:36px;line-height:36px">R</td></tr></table>
                </td>
                <td style="padding-left:12px;color:#ffffff;font-size:18px;font-weight:800;letter-spacing:-0.01em;vertical-align:middle">Roadmap OS</td>
              </tr></table>
            </td></tr>
            <tr><td style="padding:32px">
              <h1 style="margin:0 0 12px;font-size:22px;font-weight:800;color:#0f172a">You've been invited to collaborate</h1>
              <p style="margin:0 0 16px;font-size:15px;line-height:1.55;color:#475569"><strong>${safeOwner}</strong> shared a roadmap with you on Roadmap OS.</p>
              <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px 18px;margin:18px 0">
                <div style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#1d4ed8;font-weight:700">Shared roadmap</div>
                <div style="margin-top:4px;font-size:16px;font-weight:700;color:#0f172a">${safeRoadmap}</div>
              </div>
              <p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.55">Sign in (or create a free account) and the roadmap will appear in your workspace.</p>
              <div style="text-align:center">
                <a href="${APP_URL}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:13px 32px;border-radius:9999px;font-size:14px;font-weight:700;letter-spacing:.01em">Open Roadmap OS</a>
              </div>
              <p style="color:#94a3b8;font-size:12px;text-align:center;margin:18px 0 0">If the button doesn't work, paste this in your browser:<br><a href="${APP_URL}" style="color:#3b82f6;word-break:break-all">${APP_URL}</a></p>
            </td></tr>
            <tr><td style="background:#f8fafc;padding:18px 32px;border-top:1px solid #e2e8f0;text-align:center">
              <p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.6">Sent by ${safeOwner} (${safeOwnerEmail}) via Roadmap OS<br>If you weren't expecting this, you can safely ignore it.</p>
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `;

  let resendRes: Response;
  try {
    resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [recipient_email],
        subject: `${owner_name} shared a roadmap with you — Roadmap OS`,
        html,
      }),
    });
  } catch (e) {
    console.error("[send-invite] resend network error:", (e as Error).message);
    return jsonResponse({
      ok: true,
      email_sent: false,
      email_error: "Network error contacting Resend: " + (e as Error).message,
    });
  }

  if (!resendRes.ok) {
    const txt = await resendRes.text();
    console.error("[send-invite] resend error:", resendRes.status, txt.substring(0, 400));
    let parsed: { message?: string; name?: string } = {};
    try { parsed = JSON.parse(txt); } catch { /* ignore */ }
    const errMsg = parsed.message || parsed.name || `HTTP ${resendRes.status}`;
    return jsonResponse({
      ok: true,
      email_sent: false,
      email_error: errMsg,
      hint: resendRes.status === 403
        ? "From-domain not verified in Resend. Verify pmroadmapper.com or use the onboarding@resend.dev sender for testing."
        : (resendRes.status === 401 ? "RESEND_API_KEY rejected. Rotate the key and update the Supabase secret." : "See Supabase function logs for details."),
    });
  }

  const resendData = await resendRes.json();
  return jsonResponse({ ok: true, email_sent: true, email_id: resendData.id });
}));
