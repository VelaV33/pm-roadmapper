import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handle, verifyRequest, jsonResponse, errorResponse, isSuperAdmin, SUPER_ADMINS } from "../_shared/auth.ts";

serve(handle(async (req) => {
  // verifyRequest enforces a valid JWT — caller identity comes from there.
  const { user, supabase } = await verifyRequest(req);

  const body = await req.json().catch(() => ({}));
  const { action, target_user_id, role } = body || {};

  // ACTION: check-role — anyone authenticated can ask about themselves.
  if (action === "check-role") {
    return jsonResponse({
      ok: true,
      is_super_admin: isSuperAdmin(user),
      email: user.email,
    });
  }

  // All other actions require super admin (derived from verified JWT).
  if (!isSuperAdmin(user)) {
    return errorResponse("Access denied. Super Admin role required.", 403);
  }

  // ACTION: list-users
  if (action === "list-users") {
    const { data: allUsers, error: listErr } = await supabase.auth.admin.listUsers();
    if (listErr) {
      console.error("[admin-api] list error:", listErr.message);
      return errorResponse("Failed to list users", 500);
    }
    const users = (allUsers?.users || []).map((u) => {
      const appRole = (u.app_metadata as { role?: string } | undefined)?.role;
      return {
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in: u.last_sign_in_at,
        is_super_admin:
          SUPER_ADMINS.includes((u.email || "").toLowerCase()) || appRole === "super_admin",
        role: appRole || "product_manager",
        rows_count: 0,
        sections_count: 0,
      };
    });

    // Get roadmap data counts
    for (const u of users) {
      const { data: rd } = await supabase
        .from("roadmap_data")
        .select("data")
        .eq("user_id", u.id)
        .limit(1);
      if (rd && rd[0] && rd[0].data) {
        const d = rd[0].data as { rows?: unknown[]; sections?: unknown[] };
        u.rows_count = (d.rows || []).length;
        u.sections_count = (d.sections || []).length;
      }
    }

    return jsonResponse({ ok: true, users });
  }

  // ACTION: get-user-data
  if (action === "get-user-data") {
    if (!target_user_id) return errorResponse("target_user_id required", 400);

    const { data: rd } = await supabase
      .from("roadmap_data")
      .select("data, updated_at")
      .eq("user_id", target_user_id)
      .limit(1);

    const { data: targetLookup } = await supabase.auth.admin.getUserById(target_user_id);
    const targetUser = targetLookup?.user;

    return jsonResponse({
      ok: true,
      user: { id: target_user_id, email: targetUser?.email },
      data: rd && rd[0] ? rd[0].data : null,
      updated_at: rd && rd[0] ? rd[0].updated_at : null,
    });
  }

  // ACTION: set-role — store role in app_metadata (server-only writable)
  if (action === "set-role") {
    if (!target_user_id || !role) {
      return errorResponse("target_user_id and role required", 400);
    }
    const ALLOWED_ROLES = ["super_admin", "product_manager", "viewer"];
    if (!ALLOWED_ROLES.includes(role)) {
      return errorResponse("Invalid role", 400);
    }

    // Prevent removing the last hardcoded super admin's privileges from being meaningless —
    // hardcoded admins always remain super admin regardless.
    const { error } = await supabase.auth.admin.updateUserById(target_user_id, {
      app_metadata: { role },
    });

    if (error) {
      console.error("[admin-api] set-role error:", error.message);
      return errorResponse("Failed to update role", 500);
    }

    return jsonResponse({ ok: true, message: "Role updated to " + role });
  }

  return errorResponse("Unknown action", 400);
}));
