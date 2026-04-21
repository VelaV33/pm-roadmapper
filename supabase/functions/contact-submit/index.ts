import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handle, jsonResponse, errorResponse } from "../_shared/auth.ts";

// Public Contact Us submission endpoint. No JWT — anyone with the form URL
// can submit. Mirrors feedback-submit:
//   • Rate limit per IP via Deno KV (10 / hour)
//   • Required field validation + length caps
//   • Service-role insert into public.leads (RLS has no policies)

let kv: Deno.Kv | null = null;
async function getKv() { if (!kv) kv = await Deno.openKv(); return kv; }
async function rateLimited(ip: string): Promise<boolean> {
  if (!ip) return false;
  try {
    const k = await getKv();
    const key = ["rl", "contact-submit", ip];
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
    console.error("[contact-submit] kv error:", (e as Error).message);
    return false;
  }
}

const ALLOWED_SOURCES = ["contact_form", "login", "legal", "landing"];

serve(handle(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim()
    || req.headers.get("cf-connecting-ip")
    || "";
  if (await rateLimited(ip)) {
    return errorResponse("Too many submissions. Please wait and try again.", 429);
  }

  const body = await req.json().catch(() => ({}));
  const { name, surname, company, email, message, source } = body || {};

  const nameStr    = typeof name === "string" ? name.trim() : "";
  const surnameStr = typeof surname === "string" ? surname.trim() : "";
  const companyStr = typeof company === "string" ? company.trim() : "";
  const emailStr   = typeof email === "string" ? email.trim().toLowerCase() : "";
  const msgStr     = typeof message === "string" ? message.trim() : "";
  const srcStr     = typeof source === "string" && ALLOWED_SOURCES.includes(source)
    ? source : "contact_form";

  if (!nameStr)    return errorResponse("Name is required", 400);
  if (!surnameStr) return errorResponse("Surname is required", 400);
  if (!emailStr)   return errorResponse("Email is required", 400);
  if (!msgStr)     return errorResponse("Message is required", 400);

  if (nameStr.length    > 100)  return errorResponse("Name too long (max 100 chars)", 400);
  if (surnameStr.length > 100)  return errorResponse("Surname too long (max 100 chars)", 400);
  if (companyStr.length > 200)  return errorResponse("Company too long (max 200 chars)", 400);
  if (emailStr.length   > 200)  return errorResponse("Email too long (max 200 chars)", 400);
  if (msgStr.length     > 5000) return errorResponse("Message too long (max 5000 chars)", 400);

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
    return errorResponse("Invalid email format", 400);
  }

  const SUPA_URL = Deno.env.get("SUPABASE_URL");
  const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPA_URL || !SUPA_KEY) return errorResponse("Server misconfigured", 500);
  const supabase = createClient(SUPA_URL, SUPA_KEY);

  const ua = req.headers.get("user-agent") || null;

  const { data, error } = await supabase
    .from("leads")
    .insert({
      name:       nameStr,
      surname:    surnameStr,
      company:    companyStr || null,
      email:      emailStr,
      message:    msgStr,
      source:     srcStr,
      ip:         ip || null,
      user_agent: ua,
      status:     "new",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[contact-submit] insert error:", error.message);
    return errorResponse("Failed to submit", 500);
  }

  return jsonResponse({
    ok: true,
    id: data.id,
    message: "Thanks! We'll be in touch shortly.",
  });
}));
