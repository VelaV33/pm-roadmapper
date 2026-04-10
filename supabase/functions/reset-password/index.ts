import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handle, jsonResponse, errorResponse, corsHeaders } from "../_shared/auth.ts";

// SECURITY NOTE: this function is intentionally UNAUTHENTICATED — a user who
// has lost their password obviously cannot present a JWT. To prevent abuse:
//
//   1. We never set a password directly. We generate a one-time recovery link
//      via the admin API and email it to the address on file. Only the actual
//      mailbox owner can use the link.
//   2. We always return the SAME generic message — no user enumeration.
//   3. We rate-limit by IP via a Deno KV bucket (10 requests / 10 min / IP).
//
// The previous version of this function was an instant-account-takeover
// primitive (anyone could set anyone's password). It has been removed.

const GENERIC_MSG = "If an account exists for that email, a password reset link has been sent.";

// Deno KV-backed rate limiter (no external dependency).
let kv: Deno.Kv | null = null;
async function getKv() {
  if (!kv) kv = await Deno.openKv();
  return kv;
}

async function rateLimited(ip: string): Promise<boolean> {
  if (!ip) return false;
  try {
    const k = await getKv();
    const key = ["rl", "reset-password", ip];
    const now = Date.now();
    const windowMs = 10 * 60 * 1000;
    const max = 10;
    const entry = await k.get<{ count: number; reset: number }>(key);
    let bucket = entry.value;
    if (!bucket || bucket.reset < now) {
      bucket = { count: 0, reset: now + windowMs };
    }
    bucket.count += 1;
    await k.set(key, bucket, { expireIn: windowMs });
    return bucket.count > max;
  } catch (e) {
    console.error("[reset-password] kv error:", (e as Error).message);
    return false; // fail open — better than locking out everyone
  }
}

async function sendRecoveryOtpEmail(to: string, otp: string): Promise<boolean> {
  const RESEND_KEY = Deno.env.get("RESEND_API_KEY");
  const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "Roadmap OS <onboarding@resend.dev>";
  if (!RESEND_KEY) {
    console.error("[reset-password] RESEND_API_KEY not set");
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [to],
      subject: "Your Roadmap OS password reset code",
      // text fallback so the code is always copy-pasteable
      text: `Your Roadmap OS password reset code is: ${otp}\n\nOpen Roadmap OS, click "Forgot password" then "I have a code", and paste it along with your new password. The code expires in 1 hour.`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px">
          <h2 style="color:#1a1464;margin-top:0">Password reset code</h2>
          <p style="color:#374151">Enter this 6-digit code in Roadmap OS to reset your password:</p>
          <div style="text-align:center;margin:28px 0">
            <div style="display:inline-block;font-family:'Courier New',monospace;font-size:32px;font-weight:700;letter-spacing:8px;color:#1a1464;background:#f0f5ff;border:1px solid #c5d5ea;border-radius:10px;padding:18px 28px">${otp}</div>
          </div>
          <p style="color:#374151;font-size:13px">This code expires in 1 hour. Open Roadmap OS, click "Forgot password" on the sign-in screen, then click "I have a code" and enter it along with your new password.</p>
          <p style="color:#9ca3af;font-size:12px;margin-top:24px">If you didn't request this, you can safely ignore this email — your password has not been changed.</p>
        </div>
      `,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("[reset-password] resend error:", res.status, txt.substring(0, 200));
    return false;
  }
  return true;
}

serve(handle(async (req) => {
  // Rate limit by client IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || req.headers.get("cf-connecting-ip")
    || "";
  if (await rateLimited(ip)) {
    return errorResponse("Too many requests. Please wait and try again.", 429);
  }

  const { email } = await req.json().catch(() => ({}));
  if (!email || typeof email !== "string") {
    // Even validation errors return the generic message, to avoid telling
    // attackers which inputs are well-formed.
    return jsonResponse({ ok: true, message: GENERIC_MSG });
  }
  const cleanEmail = email.toLowerCase().trim();
  // Light email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return jsonResponse({ ok: true, message: GENERIC_MSG });
  }

  const SUPA_URL = Deno.env.get("SUPABASE_URL");
  const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPA_URL || !SUPA_KEY) return errorResponse("Server misconfigured", 500);
  const supabase = createClient(SUPA_URL, SUPA_KEY);

  // Generate a recovery OTP via admin API. We use the email_otp from the
  // returned properties — a 6-digit code the user types into the app — instead
  // of a clickable link, because Roadmap OS is a desktop app with no web
  // page to redirect to. If the user does not exist this call returns an
  // error — we swallow it and still return the generic message.
  try {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: cleanEmail,
    });
    const otp = (data as { properties?: { email_otp?: string } } | null)?.properties?.email_otp;
    if (!error && otp) {
      sendRecoveryOtpEmail(cleanEmail, otp).catch((e) =>
        console.error("[reset-password] email send failed:", e.message),
      );
    } else if (error) {
      console.log("[reset-password] generateLink error (suppressed):", error.message);
    }
  } catch (e) {
    console.error("[reset-password] unexpected:", (e as Error).message);
  }

  return jsonResponse({ ok: true, message: GENERIC_MSG });
}));
