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
  const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "PM Roadmapper <onboarding@resend.dev>";

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

  // 2. Send email via Resend
  if (!RESEND_KEY) {
    // Share saved, but we can't email — that's still a partial success.
    return jsonResponse({ ok: true, email_sent: false });
  }

  const safeOwner = escapeHtml(owner_name);
  const safeOwnerEmail = escapeHtml(owner_email);
  const safeRoadmap = escapeHtml(roadmap_name);

  const resendRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [recipient_email],
      subject: `${owner_name} shared a roadmap with you — PM Roadmapper`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
          <div style="background:#1a1464;border-radius:10px;padding:20px 24px;margin-bottom:24px">
            <h2 style="color:#fff;margin:0;font-size:20px">PM Roadmapper</h2>
          </div>
          <h2 style="color:#1a1464">You've been invited</h2>
          <p style="color:#374151;font-size:15px"><strong>${safeOwner}</strong> has shared their roadmap with you:</p>
          <div style="background:#f0f5ff;border:1px solid #c5d5ea;border-radius:8px;padding:16px;margin:20px 0">
            <p style="margin:0;font-size:11px;color:#7b8db0;text-transform:uppercase;letter-spacing:.08em">Shared roadmap</p>
            <p style="margin:6px 0 0;font-size:16px;font-weight:700;color:#1a1464">${safeRoadmap}</p>
          </div>
          <p style="color:#374151;font-size:14px">Log in to PM Roadmapper to view it — the roadmap will appear as a tab when you sign in.</p>
          <div style="text-align:center;margin:24px 0">
            <a href="https://github.com/VelaV33/pm-roadmapper/releases/latest" style="display:inline-block;background:#1a1464;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600">Download PM Roadmapper</a>
          </div>
          <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">
            This invite was sent by ${safeOwner} (${safeOwnerEmail}).<br>
            If you don't have PM Roadmapper yet, download it from the link above and create a free account.<br>
            If you weren't expecting this, you can safely ignore it.
          </p>
        </div>
      `,
    }),
  });

  if (!resendRes.ok) {
    const txt = await resendRes.text();
    console.error("[send-invite] resend error:", resendRes.status, txt.substring(0, 200));
    return jsonResponse({
      ok: true,
      email_sent: false,
      message: "Share saved — recipient will see it when they log in.",
    });
  }

  const resendData = await resendRes.json();
  return jsonResponse({ ok: true, email_sent: true, email_id: resendData.id });
}));
