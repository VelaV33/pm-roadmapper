import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handle, verifyRequest, jsonResponse, errorResponse } from "../_shared/auth.ts";

// Notifications CRUD + email delivery.
//
// Actions (all require a verified JWT):
//   list                                  — return all notifications for the caller
//   mark_read({id})                       — mark a single notification read
//   mark_all_read                         — mark every unread notification read
//   delete({id})                          — remove a single notification
//   create({recipient_email, type, title, body, link})
//                                          — write a notification AND send an email via Resend.
//                                            Resolves email -> user_id via auth.admin.listUsers.
//                                            For registered users: writes the in-app row + emails.
//                                            For non-registered emails: emails only (no in-app row).
//
// The create action is what other parts of the app call when they want to
// notify someone. It's gated by JWT (so only signed-in users can send
// notifications) but uses the service role to write the row (so it bypasses
// the recipient's RLS).

const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "PM Roadmapper <onboarding@resend.dev>";

async function sendNotificationEmail(opts: {
  to: string;
  fromName: string;
  title: string;
  body: string | null;
  link: string | null;
  type: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!RESEND_KEY) {
    console.error("[notifications-api] RESEND_API_KEY not set");
    return { ok: false, error: "RESEND_API_KEY not set" };
  }
  const safe = (s: string) => String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const ctaLabel = "Open PM Roadmapper";
  const ctaUrl = "https://github.com/VelaV33/pm-roadmapper/releases/latest";

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#374151">
      <div style="background:#1a1464;border-radius:10px;padding:18px 24px;margin-bottom:24px">
        <h2 style="color:#fff;margin:0;font-size:18px;font-weight:800">PM Roadmapper</h2>
      </div>
      <h2 style="color:#1a1464;font-size:22px;font-weight:800;margin:0 0 14px">${safe(opts.title)}</h2>
      ${opts.body ? `<p style="font-size:15px;line-height:1.55;color:#374151;margin:0 0 18px">${safe(opts.body)}</p>` : ""}
      <p style="font-size:13px;color:#6b7280;margin:0 0 22px">From <strong>${safe(opts.fromName)}</strong></p>
      <div style="text-align:center;margin:28px 0">
        <a href="${ctaUrl}" style="display:inline-block;background:#1a1464;color:#fff;text-decoration:none;padding:12px 28px;border-radius:9999px;font-size:14px;font-weight:700">${ctaLabel}</a>
      </div>
      <p style="color:#9ca3af;font-size:11px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">
        You're receiving this because you're a teammate on PM Roadmapper. Open the app to see all your assigned items, and to manage notification preferences.
      </p>
    </div>
  `;
  const text = `${opts.title}\n${opts.body || ""}\nFrom ${opts.fromName}\n\nOpen PM Roadmapper: ${ctaUrl}`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [opts.to],
        subject: opts.title,
        html,
        text,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error("[notifications-api] resend error:", res.status, txt.substring(0, 300));
      return { ok: false, error: `Resend ${res.status}: ${txt.substring(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[notifications-api] email send failed:", (e as Error).message);
    return { ok: false, error: (e as Error).message };
  }
}

serve(handle(async (req) => {
  const { user, supabase } = await verifyRequest(req);
  const body = await req.json().catch(() => ({}));
  const { action } = body || {};

  if (action === "list" || !action) {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("recipient_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      console.error("[notifications-api list] error:", error.message);
      return errorResponse("Failed to list notifications", 500);
    }
    const items = data || [];
    const unread = items.filter((n) => !n.read).length;
    return jsonResponse({ ok: true, notifications: items, unread });
  }

  if (action === "mark_read") {
    const { id } = body;
    if (!id) return errorResponse("Missing id", 400);
    const { error } = await supabase
      .from("notifications")
      .update({ read: true, read_at: new Date().toISOString() })
      .eq("id", id)
      .eq("recipient_user_id", user.id);
    if (error) {
      console.error("[notifications-api mark_read] error:", error.message);
      return errorResponse("Failed to mark read", 500);
    }
    return jsonResponse({ ok: true });
  }

  if (action === "mark_all_read") {
    const { error } = await supabase
      .from("notifications")
      .update({ read: true, read_at: new Date().toISOString() })
      .eq("recipient_user_id", user.id)
      .eq("read", false);
    if (error) {
      console.error("[notifications-api mark_all_read] error:", error.message);
      return errorResponse("Failed to mark all read", 500);
    }
    return jsonResponse({ ok: true });
  }

  if (action === "delete") {
    const { id } = body;
    if (!id) return errorResponse("Missing id", 400);
    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("recipient_user_id", user.id);
    if (error) {
      console.error("[notifications-api delete] error:", error.message);
      return errorResponse("Failed to delete", 500);
    }
    return jsonResponse({ ok: true });
  }

  if (action === "create") {
    const { recipient_email, type, title, body: notifBody, link } = body;
    if (!recipient_email || typeof recipient_email !== "string") {
      return errorResponse("Missing recipient_email", 400);
    }
    if (!type || !title) return errorResponse("Missing type or title", 400);

    const cleanEmail = recipient_email.toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return errorResponse("Invalid recipient email", 400);
    }

    // Don't send a notification to yourself — that's just noise.
    if (cleanEmail === (user.email || "").toLowerCase()) {
      return jsonResponse({ ok: true, skipped: "self" });
    }

    const senderName =
      ((user.user_metadata as { display_name?: string; full_name?: string } | undefined)?.display_name) ||
      ((user.user_metadata as { display_name?: string; full_name?: string } | undefined)?.full_name) ||
      (user.email?.split("@")[0]) ||
      "A teammate";

    // Length caps
    const safeTitle = String(title).substring(0, 200);
    const safeBody = notifBody ? String(notifBody).substring(0, 1000) : null;
    const safeLink = link ? String(link).substring(0, 500) : null;

    // Resolve recipient email -> user_id. If they're a registered user we
    // also write an in-app notification row. Either way, we send the email.
    const { data: allUsers, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) {
      console.error("[notifications-api create list] error:", listErr.message);
      return errorResponse("Failed to resolve recipient", 500);
    }
    const recipient = (allUsers?.users || []).find(
      (u) => (u.email || "").toLowerCase() === cleanEmail,
    );

    // Read recipient notification preferences from user_metadata. Defaults
    // to "all on" so existing users see no behavior change. Each type has
    // an in_app_<type> and email_<type> toggle, plus a master switch.
    // Non-registered emails (contacts) can't have prefs, so they always
    // get the email.
    type Prefs = {
      master?: boolean;
      [key: string]: boolean | undefined;
    };
    const prefs: Prefs = (recipient?.user_metadata as { notification_prefs?: Prefs } | undefined)?.notification_prefs || {};
    const masterOn = prefs.master !== false;
    const cleanType = String(type).substring(0, 50);
    const inAppKey = `in_app_${cleanType}`;
    const emailKey = `email_${cleanType}`;
    const wantInApp = masterOn && (prefs[inAppKey] !== false);
    const wantEmail = masterOn && (prefs[emailKey] !== false);

    let inAppId: string | null = null;
    if (recipient && wantInApp) {
      const { data, error } = await supabase
        .from("notifications")
        .insert({
          recipient_user_id: recipient.id,
          sender_user_id: user.id,
          type: cleanType,
          title: safeTitle,
          body: safeBody,
          link: safeLink,
        })
        .select("id")
        .single();
      if (error) {
        console.error("[notifications-api create insert] error:", error.message);
        // Don't fail the whole request — still try to send the email
      } else {
        inAppId = data.id;
      }
    }

    // Email: always send for contacts (no prefs); for registered users, honour their pref.
    let emailResult: { ok: boolean; error?: string; skipped?: string } = { ok: false, skipped: "pref" };
    if (!recipient || wantEmail) {
      emailResult = await sendNotificationEmail({
        to: cleanEmail,
        fromName: senderName,
        title: safeTitle,
        body: safeBody,
        link: safeLink,
        type: cleanType,
      });
    }

    return jsonResponse({
      ok: true,
      id: inAppId,
      registered: !!recipient,
      in_app_sent: !!inAppId,
      email_sent: emailResult.ok,
      email_error: emailResult.error,
      skipped_by_prefs: !inAppId && !emailResult.ok && !!recipient,
    });
  }

  return errorResponse("Unknown action", 400);
}));
