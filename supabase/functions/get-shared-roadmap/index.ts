import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handle, verifyRequest, jsonResponse, errorResponse, isSuperAdmin } from "../_shared/auth.ts";

serve(handle(async (req) => {
  const { user, supabase } = await verifyRequest(req);

  const { owner_id } = await req.json().catch(() => ({}));
  if (!owner_id) return errorResponse("Missing owner_id", 400);

  // Authorization: caller must be EITHER
  //   (a) the owner themselves, OR
  //   (b) a recipient with a non-revoked share record matching this owner, OR
  //   (c) a super admin (read-only audit access).
  const callerIsOwner = user.id === owner_id;
  const callerIsAdmin = isSuperAdmin(user);

  let allowed = callerIsOwner || callerIsAdmin;

  if (!allowed) {
    // Check shared_roadmaps for an active share to this caller's email.
    const callerEmail = (user.email || "").toLowerCase();
    if (!callerEmail) return errorResponse("Forbidden", 403);

    const { data: shareRow, error: shareErr } = await supabase
      .from("shared_roadmaps")
      .select("id")
      .eq("owner_id", owner_id)
      .eq("recipient_email", callerEmail)
      .limit(1)
      .maybeSingle();

    if (shareErr) {
      console.error("[get-shared-roadmap] share lookup error:", shareErr.message);
      return errorResponse("Forbidden", 403);
    }
    if (!shareRow) return errorResponse("Forbidden", 403);
    allowed = true;
  }

  // Fetch the owner's roadmap data (service role bypasses RLS by design).
  const { data: roadmapRows, error: roadmapErr } = await supabase
    .from("roadmap_data")
    .select("data, updated_at")
    .eq("user_id", owner_id)
    .order("updated_at", { ascending: false })
    .limit(1);

  if (roadmapErr) {
    console.error("[get-shared-roadmap] roadmap fetch error:", roadmapErr.message);
    return errorResponse("Failed to fetch roadmap", 500);
  }

  if (!roadmapRows || roadmapRows.length === 0 || !roadmapRows[0].data) {
    return errorResponse("Owner has no roadmap data", 404);
  }

  return jsonResponse({
    ok: true,
    data: roadmapRows[0].data,
    updated_at: roadmapRows[0].updated_at,
  });
}));
