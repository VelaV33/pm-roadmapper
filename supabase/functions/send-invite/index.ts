import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    console.log("Received request:", JSON.stringify(body));

    const { recipient_email, owner_name, owner_email, roadmap_name, owner_id } = body;

    if (!recipient_email || !owner_name || !roadmap_name) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Use Supabase built-in env vars (always available)
    const RESEND_KEY    = Deno.env.get("RESEND_API_KEY");
    const SUPA_URL      = Deno.env.get("SUPABASE_URL");
    const SUPA_KEY      = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const FROM_EMAIL    = Deno.env.get("FROM_EMAIL") || "PM Roadmapper <onboarding@resend.dev>";

    console.log("RESEND_KEY present:", !!RESEND_KEY);
    console.log("SUPA_URL:", SUPA_URL);
    console.log("FROM_EMAIL:", FROM_EMAIL);

    // 1. Save share record
    const supabase = createClient(SUPA_URL!, SUPA_KEY!);
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
      console.error("Share save error:", shareErr.message);
    } else {
      console.log("Share record saved");
    }

    // 2. Send email via Resend
    console.log("Sending email to:", recipient_email);
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
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
            <div style="background:#1a1464;border-radius:10px;padding:20px 24px;margin-bottom:24px">
              <h2 style="color:#fff;margin:0;font-size:20px">PM Roadmapper</h2>
            </div>
            <h2 style="color:#1a1464">You've been invited</h2>
            <p style="color:#374151;font-size:15px"><strong>${owner_name}</strong> has shared their roadmap with you:</p>
            <div style="background:#f0f5ff;border:1px solid #c5d5ea;border-radius:8px;padding:16px;margin:20px 0">
              <p style="margin:0;font-size:11px;color:#7b8db0;text-transform:uppercase;letter-spacing:.08em">Shared roadmap</p>
              <p style="margin:6px 0 0;font-size:16px;font-weight:700;color:#1a1464">${roadmap_name}</p>
            </div>
            <p style="color:#374151;font-size:14px">Log in to PM Roadmapper to view it — the roadmap will appear as a tab when you sign in.</p>
            <div style="text-align:center;margin:24px 0">
              <a href="https://github.com/VelaV33/pm-roadmapper/releases/latest" style="display:inline-block;background:#1a1464;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600">Download PM Roadmapper</a>
            </div>
            <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">
              This invite was sent by ${owner_name} (${owner_email}).<br>
              If you don't have PM Roadmapper yet, download it from the link above and create a free account.<br>
              If you weren't expecting this, you can safely ignore it.
            </p>
          </div>
        `
      })
    });

    const resendData = await resendRes.json();
    console.log("Resend response status:", resendRes.status);
    console.log("Resend response:", JSON.stringify(resendData));

    if (!resendRes.ok) {
      return new Response(JSON.stringify({ 
        ok: true, 
        warning: `Share saved but email failed: ${resendData.message || JSON.stringify(resendData)}` 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ ok: true, email_id: resendData.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (e) {
    console.error("Edge function exception:", e.message, e.stack);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
