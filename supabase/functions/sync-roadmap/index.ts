import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handle, verifyRequest, jsonResponse, errorResponse } from "../_shared/auth.ts";

serve(handle(async (req) => {
  const { user, supabase } = await verifyRequest(req);

  const body = await req.json().catch(() => ({}));
  const { data } = body || {};

  // IMPORTANT: identity comes from the verified JWT, not the request body.
  // A user can only sync their OWN roadmap.
  const user_id = user.id;

  if (!data) return errorResponse("Missing data", 400);

  // Sanity-check shape so we don't store random garbage.
  if (typeof data !== "object" || Array.isArray(data)) {
    return errorResponse("Invalid data shape", 400);
  }

  // Check if row exists
  const { data: existing } = await supabase
    .from("roadmap_data")
    .select("user_id")
    .eq("user_id", user_id)
    .limit(1);

  let result;
  if (existing && existing.length > 0) {
    result = await supabase
      .from("roadmap_data")
      .update({ data, updated_at: new Date().toISOString() })
      .eq("user_id", user_id);
  } else {
    result = await supabase
      .from("roadmap_data")
      .insert({ user_id, data, updated_at: new Date().toISOString() });
  }

  if (result.error) {
    // Log details server-side, return generic message to caller.
    console.error("[sync-roadmap] db error:", result.error.message, result.error.details);
    return errorResponse("Failed to save roadmap", 500);
  }

  // Verify the data was saved
  const { data: verify } = await supabase
    .from("roadmap_data")
    .select("data, updated_at")
    .eq("user_id", user_id)
    .limit(1);

  const dataVerified = !!(verify && verify.length > 0 && verify[0].data !== null);
  const savedRows = dataVerified ? ((verify![0].data as { rows?: unknown[] }).rows || []).length : 0;

  return jsonResponse({
    ok: dataVerified,
    action: existing && existing.length > 0 ? "updated" : "inserted",
    verified: dataVerified,
    saved_rows: savedRows,
    rows_in_data: ((data as { rows?: unknown[] }).rows || []).length,
  });
}));
