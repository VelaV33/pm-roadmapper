// Shared auth + CORS helpers for Roadmap OS edge functions.
// Every function MUST verify the JWT before performing any privileged work.
// The service role key bypasses RLS, so identity must come from a verified JWT
// — never from a field in the request body.

import { createClient, SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

// Hardcoded super admins. Additional super admins live in app_metadata.role.
// IMPORTANT: do NOT use user_metadata for roles — it is user-writable.
export const SUPER_ADMINS = ["velasabelo.com@gmail.com"];

export function isSuperAdmin(user: User | null): boolean {
  if (!user) return false;
  const email = (user.email || "").toLowerCase();
  if (SUPER_ADMINS.includes(email)) return true;
  // app_metadata is server-only writable
  const role = (user.app_metadata as { role?: string } | undefined)?.role;
  return role === "super_admin";
}

export interface VerifiedRequest {
  user: User;
  supabase: SupabaseClient;
}

// Verify the Authorization header and return a service-role client + the
// authenticated user. Throws a Response on failure (caller should rethrow).
export async function verifyRequest(req: Request): Promise<VerifiedRequest> {
  const SUPA_URL = Deno.env.get("SUPABASE_URL");
  const SUPA_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPA_URL || !SUPA_SERVICE_KEY) {
    throw errorResponse("Server misconfigured", 500);
  }

  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    throw errorResponse("Unauthorized", 401);
  }
  const token = authHeader.slice(7).trim();
  if (!token) throw errorResponse("Unauthorized", 401);

  // Use a separate client (anon-key style) to validate the user JWT.
  // We then return a service-role client for the actual privileged work.
  const verifier = createClient(SUPA_URL, SUPA_SERVICE_KEY);
  const { data, error } = await verifier.auth.getUser(token);
  if (error || !data?.user) {
    throw errorResponse("Invalid or expired session", 401);
  }

  const supabase = createClient(SUPA_URL, SUPA_SERVICE_KEY);
  return { user: data.user, supabase };
}

// v1.26.8: Per-user / per-action rate limiter backed by Deno KV. Caller picks
// the bucket key (e.g. "send_invite") and a quota (max calls per windowSec).
// Returns null if the call is allowed; throws an errorResponse if exceeded.
//
// Storage: ['ratelimit', bucket, userId, windowStart] -> count
// We bucket by aligned window so old entries fall off naturally and there's no
// cleanup logic. Each key has a TTL of 2 windows just to be safe.
let _kv: Deno.Kv | null = null;
async function _getKv(): Promise<Deno.Kv | null> {
  try {
    if (!_kv) _kv = await Deno.openKv();
    return _kv;
  } catch (e) {
    console.warn("[ratelimit] Deno KV unavailable:", (e as Error).message);
    return null;
  }
}
export async function rateLimit(
  bucket: string,
  userId: string,
  max: number,
  windowSec: number,
): Promise<void> {
  const kv = await _getKv();
  if (!kv) return;  // fail-open if KV is down — better than blocking everyone
  const windowStart = Math.floor(Date.now() / 1000 / windowSec) * windowSec;
  const key = ["ratelimit", bucket, userId, windowStart];
  const cur = await kv.get<number>(key);
  const next = (cur.value || 0) + 1;
  if (next > max) {
    throw errorResponse(
      `Rate limit exceeded — try again in ${windowSec} seconds.`,
      429,
    );
  }
  await kv.set(key, next, { expireIn: windowSec * 2 * 1000 });
}

// Wrap a handler with consistent error / CORS handling.
export function handle(
  fn: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof Response) return e;
      // v1.25.0: log only name + message (no stack) to avoid leaking module
      // paths and version info into Supabase logs.
      console.error("[edge-function] unhandled:", (e as Error).name + ": " + (e as Error).message);
      return errorResponse("Internal error", 500);
    }
  };
}
