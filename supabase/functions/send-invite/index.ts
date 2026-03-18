import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { recipient_email, owner_name, owner_email, roadmap_name, owner_id } = await req.json();

    if (!recipient_email || !owner_name || !roadmap_name) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const RESEND_KEY     = Deno.env.get("RESEND_API_KEY")!;
    const SUPA_URL       = Deno.env.get("SUPABASE_URL")!;
    const SUPA_SERV_KEY  = Deno.env.get("SUPA_SERVICE_KEY")!;
    const FROM_EMAIL     = Deno.env.get("FROM_EMAIL") || "PM Roadmapper <onboarding@resend.dev>";
    const APP_URL        = Deno.env.get("APP_URL") || "https://nigusoyssktoebzscbwe.supabase.co";

    // 1. Save share record via service role (bypasses RLS)
    const supabase = createClient(SUPA_URL, SUPA_SERV_KEY);
    const { error: shareErr } = await supabase
      .from("shared_roadmaps")
      .upsert({
        owner_id,
        owner_name,
        owner_email,
        recipient_email: recipient_email.toLowerCase().trim(),
        roadmap_name,
      }, { onConflict: "owner_id,recipient_email" });

    if (shareErr) {
      return new Response(JSON.stringify({ error: shareErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 2. Check if user already has an account — if not, send Supabase invite
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const userExists = existingUsers?.users?.some(u => u.email === recipient_email.toLowerCase());

    if (!userExists) {
      // Send Supabase auth invite (creates account + magic link)
      await supabase.auth.admin.inviteUserByEmail(recipient_email, {
        data: { invited_by: owner_name, roadmap_name }
      });
    }

    // 3. Send invite email via Resend
    const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f7fc;font-family:'Helvetica Neue',Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 20px">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)">
        
        <!-- Header -->
        <tr><td style="background:#1a1464;padding:28px 36px">
          <table cellpadding="0" cellspacing="0"><tr>
            <td style="background:rgba(255,255,255,.12);border-radius:8px;padding:8px 14px">
              <span style="color:#fff;font-size:18px;font-weight:800;letter-spacing:.04em">PM Roadmapper</span>
            </td>
          </tr></table>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:36px 36px 24px">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1464">You've been invited</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6">
            <strong>${owner_name}</strong> has shared their roadmap with you:
          </p>

          <!-- Roadmap card -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0f5ff;border:1px solid #c5d5ea;border-radius:10px;margin-bottom:28px">
            <tr><td style="padding:18px 20px">
              <p style="margin:0 0 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#7b8db0">Shared roadmap</p>
              <p style="margin:0;font-size:16px;font-weight:700;color:#1a1464">${roadmap_name}</p>
              <p style="margin:4px 0 0;font-size:12px;color:#7b8db0">Shared by ${owner_name} (${owner_email})</p>
            </td></tr>
          </table>

          <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6">
            ${userExists
              ? "Sign in to PM Roadmapper and the shared roadmap will appear as a tab when you log in."
              : "You'll need to create a PM Roadmapper account to view this roadmap. Click below to get started — it only takes a minute."
            }
          </p>

          <!-- CTA -->
          <table cellpadding="0" cellspacing="0" style="margin-bottom:28px">
            <tr><td style="background:#1a1464;border-radius:8px">
              <a href="${APP_URL}" style="display:block;padding:13px 28px;color:#fff;font-size:14px;font-weight:700;text-decoration:none">
                ${userExists ? "Open PM Roadmapper →" : "Create account &amp; view roadmap →"}
              </a>
            </td></tr>
          </table>

          <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.6">
            If you weren't expecting this invitation, you can safely ignore this email.<br>
            This invite was sent by ${owner_name} (${owner_email}).
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;border-top:1px solid #e8edf7;padding:20px 36px">
          <p style="margin:0;font-size:11px;color:#9ca3af;text-align:center">
            PM Roadmapper · Product Strategy Tool
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [recipient_email],
        subject: `${owner_name} shared a roadmap with you — PM Roadmapper`,
        html: emailHtml,
      })
    });

    const resendData = await resendRes.json();
    if (!resendRes.ok) {
      console.error("Resend error:", resendData);
      // Share was already saved — email failure is non-fatal
      return new Response(JSON.stringify({ ok: true, warning: "Share saved but email failed: " + (resendData.message || "unknown") }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ ok: true, email_id: resendData.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (e) {
    console.error("Edge function error:", e);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
