import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handle, jsonResponse, errorResponse } from "../_shared/auth.ts";

// Public submission endpoint. No JWT — anyone with the form URL can submit.
// Defences:
//   • Rate limit per IP via Deno KV (10 / hour)
//   • Required field validation
//   • Length caps
//   • Owner must be a real user id (we verify it exists)

let kv: Deno.Kv | null = null;
async function getKv() { if (!kv) kv = await Deno.openKv(); return kv; }
async function rateLimited(ip: string): Promise<boolean> {
  if (!ip) return false;
  try {
    const k = await getKv();
    const key = ["rl", "feedback-submit", ip];
    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1 hour
    const max = 10;
    const entry = await k.get<{ count: number; reset: number }>(key);
    let bucket = entry.value;
    if (!bucket || bucket.reset < now) bucket = { count: 0, reset: now + windowMs };
    bucket.count += 1;
    await k.set(key, bucket, { expireIn: windowMs });
    return bucket.count > max;
  } catch (e) {
    console.error("[feedback-submit] kv error:", (e as Error).message);
    return false;
  }
}

serve(handle(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || req.headers.get("cf-connecting-ip")
    || "";
  if (await rateLimited(ip)) {
    return errorResponse("Too many submissions. Please wait and try again.", 429);
  }

  const body = await req.json().catch(() => ({}));
  const { owner_user_id, title, description, submitter_email, submitter_name } = body || {};

  if (!owner_user_id || typeof owner_user_id !== "string") {
    return errorResponse("Missing owner_user_id", 400);
  }
  if (!title || typeof title !== "string") {
    return errorResponse("Title is required", 400);
  }
  if (title.length > 200) return errorResponse("Title too long (max 200 chars)", 400);
  if (description && description.length > 5000) return errorResponse("Description too long (max 5000 chars)", 400);
  if (submitter_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitter_email)) {
    return errorResponse("Invalid email format", 400);
  }

  const SUPA_URL = Deno.env.get("SUPABASE_URL");
  const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPA_URL || !SUPA_KEY) return errorResponse("Server misconfigured", 500);
  const supabase = createClient(SUPA_URL, SUPA_KEY);

  // Verify the owner is a real user (don't let people spam-submit to fake user ids)
  const { data: ownerLookup, error: ownerErr } = await supabase.auth.admin.getUserById(owner_user_id);
  if (ownerErr || !ownerLookup?.user) {
    return errorResponse("Invalid recipient", 404);
  }

  const { data, error } = await supabase
    .from("feedback_items")
    .insert({
      owner_user_id,
      title: title.trim(),
      description: description ? description.trim() : null,
      submitter_email: submitter_email ? submitter_email.toLowerCase().trim() : null,
      submitter_name: submitter_name ? submitter_name.trim() : null,
      status: "new",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[feedback-submit] insert error:", error.message);
    return errorResponse("Failed to submit feedback", 500);
  }

  return jsonResponse({
    ok: true,
    id: data.id,
    message: "Thanks! Your feedback has been received.",
  });
}));
