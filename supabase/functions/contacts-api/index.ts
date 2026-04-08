import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handle, verifyRequest, jsonResponse, errorResponse } from "../_shared/auth.ts";

// Contacts CRUD + active/inactive split + invite flow.
//
// Actions (all require a verified JWT):
//   list             — return all contacts owned by the caller, with status
//                      computed against auth.users (active vs inactive)
//   add              — create a new contact { email, name, notes }
//   update           — patch { id, name?, notes? }
//   delete           — { id }
//   send_invite      — generate a Resend recovery-style invite email so the
//                      contact can self-register, then mark contact as 'invited'
//   match_active     — for a list of emails, return which ones already exist
//                      in auth.users (used by the User Management page)

const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "PM Roadmapper <onboarding@resend.dev>";

async function sendInviteEmail(to: string, inviterName: string): Promise<boolean> {
  if (!RESEND_KEY) {
    console.error("[contacts-api] RESEND_API_KEY not set");
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject: `${inviterName} has invited you to PM Roadmapper`,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
            <div style="background:#1a1464;border-radius:10px;padding:20px 24px;margin-bottom:24px">
              <h2 style="color:#fff;margin:0;font-size:20px">PM Roadmapper</h2>
            </div>
            <h2 style="color:#1a1464">You've been invited</h2>
            <p style="color:#374151;font-size:15px">${inviterName} has added you as a teammate on their PM Roadmapper workspace and would like you to join.</p>
            <p style="color:#374151;font-size:14px">PM Roadmapper is a desktop product strategy and roadmap tool. Once you sign up, your assigned tasks will be visible in your account.</p>
            <div style="text-align:center;margin:24px 0">
              <a href="https://github.com/VelaV33/pm-roadmapper/releases/latest" style="display:inline-block;background:#1a1464;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:600">Download PM Roadmapper</a>
            </div>
            <p style="color:#9ca3af;font-size:12px;margin-top:32px;border-top:1px solid #e5e7eb;padding-top:16px">
              Download the app from the link above and sign up with this email address (${to}) to automatically link your account.
            </p>
          </div>
        `,
      }),
    });
    if (!res.ok) {
      const txt = await res.text();
      console.error("[contacts-api] resend error:", res.status, txt.substring(0, 200));
      return false;
    }
    return true;
  } catch (e) {
    console.error("[contacts-api] email send failed:", (e as Error).message);
    return false;
  }
}

serve(handle(async (req) => {
  const { user, supabase } = await verifyRequest(req);
  const body = await req.json().catch(() => ({}));
  const { action } = body || {};

  // ── LIST ───────────────────────────────────────────────────────────────
  if (action === "list" || !action) {
    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[contacts-api list] error:", error.message);
      return errorResponse("Failed to list contacts", 500);
    }
    // Compute active status by matching contact emails against auth.users
    const contacts = data || [];
    const emails = contacts.map((c) => (c.email || "").toLowerCase());
    let activeEmails = new Set<string>();
    if (emails.length > 0) {
      const { data: allUsers } = await supabase.auth.admin.listUsers();
      activeEmails = new Set(
        (allUsers?.users || [])
          .map((u) => (u.email || "").toLowerCase())
          .filter(Boolean),
      );
    }
    const enriched = contacts.map((c) => ({
      ...c,
      is_active: activeEmails.has((c.email || "").toLowerCase()),
    }));
    return jsonResponse({ ok: true, contacts: enriched });
  }

  // ── ADD ────────────────────────────────────────────────────────────────
  if (action === "add") {
    const { email, name, notes } = body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return errorResponse("Valid email required", 400);
    }
    const cleanEmail = email.toLowerCase().trim();
    const { data, error } = await supabase
      .from("contacts")
      .insert({
        owner_user_id: user.id,
        email: cleanEmail,
        name: name ? String(name).trim() : null,
        notes: notes ? String(notes).trim() : null,
        status: "inactive",
      })
      .select("id")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return errorResponse("Already in your contacts", 409);
      }
      console.error("[contacts-api add] error:", error.message);
      return errorResponse("Failed to add contact", 500);
    }
    return jsonResponse({ ok: true, id: data.id });
  }

  // ── UPDATE ─────────────────────────────────────────────────────────────
  if (action === "update") {
    const { id, name, notes } = body;
    if (!id) return errorResponse("Missing id", 400);
    const updates: Record<string, unknown> = {};
    if (name != null) updates.name = String(name).trim();
    if (notes != null) updates.notes = String(notes).trim();
    if (Object.keys(updates).length === 0) return jsonResponse({ ok: true });
    const { error } = await supabase
      .from("contacts")
      .update(updates)
      .eq("id", id)
      .eq("owner_user_id", user.id);
    if (error) {
      console.error("[contacts-api update] error:", error.message);
      return errorResponse("Failed to update contact", 500);
    }
    return jsonResponse({ ok: true });
  }

  // ── DELETE ─────────────────────────────────────────────────────────────
  if (action === "delete") {
    const { id } = body;
    if (!id) return errorResponse("Missing id", 400);
    const { error } = await supabase
      .from("contacts")
      .delete()
      .eq("id", id)
      .eq("owner_user_id", user.id);
    if (error) {
      console.error("[contacts-api delete] error:", error.message);
      return errorResponse("Failed to delete contact", 500);
    }
    return jsonResponse({ ok: true });
  }

  // ── SEND INVITE ────────────────────────────────────────────────────────
  if (action === "send_invite") {
    const { id } = body;
    if (!id) return errorResponse("Missing id", 400);
    // Look up the contact
    const { data: contact, error: lookupErr } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", id)
      .eq("owner_user_id", user.id)
      .single();
    if (lookupErr || !contact) return errorResponse("Contact not found", 404);

    const inviterName =
      ((user.user_metadata as { display_name?: string; full_name?: string } | undefined)?.display_name) ||
      ((user.user_metadata as { display_name?: string; full_name?: string } | undefined)?.full_name) ||
      (user.email?.split("@")[0]) ||
      "A teammate";

    const sent = await sendInviteEmail(contact.email, inviterName);

    // Mark as invited regardless of email success — the user can always re-send
    await supabase
      .from("contacts")
      .update({ status: "invited", invite_sent_at: new Date().toISOString() })
      .eq("id", id)
      .eq("owner_user_id", user.id);

    return jsonResponse({ ok: true, email_sent: sent });
  }

  return errorResponse("Unknown action", 400);
}));
