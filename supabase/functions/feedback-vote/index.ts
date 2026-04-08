import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handle, jsonResponse, errorResponse } from "../_shared/auth.ts";

// Public vote endpoint. One vote per email per item, enforced at the DB level
// via the UNIQUE(feedback_item_id, voter_email) constraint.

let kv: Deno.Kv | null = null;
async function getKv() { if (!kv) kv = await Deno.openKv(); return kv; }
async function rateLimited(ip: string): Promise<boolean> {
  if (!ip) return false;
  try {
    const k = await getKv();
    const key = ["rl", "feedback-vote", ip];
    const now = Date.now();
    const windowMs = 60 * 60 * 1000;
    const max = 30;
    const entry = await k.get<{ count: number; reset: number }>(key);
    let bucket = entry.value;
    if (!bucket || bucket.reset < now) bucket = { count: 0, reset: now + windowMs };
    bucket.count += 1;
    await k.set(key, bucket, { expireIn: windowMs });
    return bucket.count > max;
  } catch (e) {
    console.error("[feedback-vote] kv error:", (e as Error).message);
    return false;
  }
}

serve(handle(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || req.headers.get("cf-connecting-ip")
    || "";
  if (await rateLimited(ip)) {
    return errorResponse("Too many requests", 429);
  }

  const { feedback_item_id, voter_email } = await req.json().catch(() => ({}));
  if (!feedback_item_id || typeof feedback_item_id !== "string") {
    return errorResponse("Missing feedback_item_id", 400);
  }
  if (!voter_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(voter_email)) {
    return errorResponse("Valid email required to vote", 400);
  }

  const SUPA_URL = Deno.env.get("SUPABASE_URL");
  const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPA_URL || !SUPA_KEY) return errorResponse("Server misconfigured", 500);
  const supabase = createClient(SUPA_URL, SUPA_KEY);

  const { error } = await supabase
    .from("feedback_votes")
    .insert({
      feedback_item_id,
      voter_email: voter_email.toLowerCase().trim(),
    });

  if (error) {
    // Unique constraint violation = already voted; treat as success.
    if ((error as { code?: string }).code === "23505") {
      return jsonResponse({ ok: true, message: "You've already voted." });
    }
    console.error("[feedback-vote] insert error:", error.message);
    return errorResponse("Failed to record vote", 500);
  }

  return jsonResponse({ ok: true, message: "Vote recorded. Thanks!" });
}));
