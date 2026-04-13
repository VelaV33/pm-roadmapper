import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handle, jsonResponse, errorResponse } from "../_shared/auth.ts";

// SECURITY NOTES:
// - This endpoint is intentionally unauthenticated (signup).
// - We rate-limit by IP via Deno KV.
// - We do NOT reveal whether an email is already registered (enumeration).
// - All new accounts are auto-confirmed via the admin API. We do NOT
//   auto-confirm pre-existing accounts — that would let an attacker
//   activate someone else's abandoned signup.

let kv: Deno.Kv | null = null;
async function getKv() {
  if (!kv) kv = await Deno.openKv();
  return kv;
}
async function rateLimited(ip: string): Promise<boolean> {
  if (!ip) return false;
  try {
    const k = await getKv();
    const key = ["rl", "create-user", ip];
    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1 hour
    const max = 5;
    const entry = await k.get<{ count: number; reset: number }>(key);
    let bucket = entry.value;
    if (!bucket || bucket.reset < now) bucket = { count: 0, reset: now + windowMs };
    bucket.count += 1;
    await k.set(key, bucket, { expireIn: windowMs });
    return bucket.count > max;
  } catch (e) {
    console.error("[create-user] kv error:", (e as Error).message);
    return false;
  }
}

const GENERIC_OK = "Account creation requested. Check your email — if this address is eligible, you'll be able to sign in shortly.";

serve(handle(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || req.headers.get("cf-connecting-ip")
    || "";
  if (await rateLimited(ip)) {
    return errorResponse("Too many signup attempts. Please wait and try again.", 429);
  }

  const { email, password, user_metadata } = await req.json().catch(() => ({} as Record<string, unknown>));

  if (!email || !password || typeof email !== "string" || typeof password !== "string") {
    return errorResponse("Email and password are required", 400);
  }
  if (password.length < 8) {
    return errorResponse("Password must be at least 8 characters", 400);
  }
  // Light email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return errorResponse("Invalid email", 400);
  }

  const cleanEmail = email.toLowerCase().trim();

  const SUPA_URL = Deno.env.get("SUPABASE_URL");
  const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPA_URL || !SUPA_KEY) return errorResponse("Server misconfigured", 500);
  const supabase = createClient(SUPA_URL, SUPA_KEY);

  // Try to create. If the email already exists, Supabase returns an error;
  // we map that to the generic OK message so the response is identical.
  // Build user_metadata from optional signup fields
  const meta: Record<string, string> = {};
  if (user_metadata && typeof user_metadata === "object") {
    for (const k of ["full_name", "company", "phone", "designation"]) {
      const v = (user_metadata as Record<string, unknown>)[k];
      if (typeof v === "string" && v.trim()) meta[k] = v.trim();
    }
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: cleanEmail,
    password,
    email_confirm: true,
    user_metadata: Object.keys(meta).length > 0 ? meta : undefined,
  });

  if (error) {
    // Log internally; do not reveal details to caller.
    console.log("[create-user] createUser error (suppressed):", error.message);
    return jsonResponse({ ok: true, message: GENERIC_OK });
  }

  return jsonResponse({
    ok: true,
    message: GENERIC_OK,
    // We deliberately do NOT echo back user_id / email — successful signup
    // and "email already taken" must be indistinguishable to the client.
  });
}));
