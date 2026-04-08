import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handle, verifyRequest, jsonResponse, errorResponse } from "../_shared/auth.ts";

// JWT-gated read of the owner's feedback inbox + update / delete operations.
//
// Actions:
//   list                            — return all feedback for the owner
//   update_status(id, status)       — mark new/reviewing/planned/.../shipped
//   link_row(id, row_id)            — link to a roadmap initiative
//   unlink_row(id)                  — clear the link
//   delete(id)                      — remove an item

serve(handle(async (req) => {
  const { user, supabase } = await verifyRequest(req);
  const body = await req.json().catch(() => ({}));
  const { action, id, status, row_id } = body || {};

  if (action === "list" || !action) {
    const { data, error } = await supabase
      .from("feedback_items")
      .select("*")
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[feedback-list] error:", error.message);
      return errorResponse("Failed to load feedback", 500);
    }
    return jsonResponse({ ok: true, items: data || [] });
  }

  if (!id) return errorResponse("Missing id", 400);

  // Authorisation: every other action requires the row to belong to the caller.
  const { data: row } = await supabase
    .from("feedback_items")
    .select("id, owner_user_id")
    .eq("id", id)
    .single();
  if (!row || row.owner_user_id !== user.id) {
    return errorResponse("Not found", 404);
  }

  if (action === "update_status") {
    const ALLOWED = ["new", "reviewing", "planned", "in_progress", "shipped", "declined"];
    if (!ALLOWED.includes(status)) return errorResponse("Invalid status", 400);
    const { error } = await supabase.from("feedback_items").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return errorResponse("Failed to update status", 500);
    return jsonResponse({ ok: true });
  }

  if (action === "link_row") {
    if (!row_id) return errorResponse("Missing row_id", 400);
    const { error } = await supabase.from("feedback_items").update({ linked_row_id: row_id, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return errorResponse("Failed to link row", 500);
    return jsonResponse({ ok: true });
  }

  if (action === "unlink_row") {
    const { error } = await supabase.from("feedback_items").update({ linked_row_id: null, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) return errorResponse("Failed to unlink row", 500);
    return jsonResponse({ ok: true });
  }

  if (action === "delete") {
    const { error } = await supabase.from("feedback_items").delete().eq("id", id);
    if (error) return errorResponse("Failed to delete", 500);
    return jsonResponse({ ok: true });
  }

  return errorResponse("Unknown action", 400);
}));
