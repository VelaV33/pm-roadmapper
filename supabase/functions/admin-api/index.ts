import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handle, verifyRequest, jsonResponse, errorResponse, isSuperAdmin, isPlatformAdmin, SUPER_ADMINS } from "../_shared/auth.ts";

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
      is_platform_admin: isPlatformAdmin(user),
      email: user.email,
    });
  }

  // All other actions require super admin or platform admin (derived from verified JWT).
  if (!isSuperAdmin(user) && !isPlatformAdmin(user)) {
    return errorResponse("Access denied. Super Admin or Platform Admin role required.", 403);
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
      const uMeta = (u.user_metadata || {}) as Record<string, unknown>;
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
        user_metadata: {
          full_name: uMeta.full_name || uMeta.display_name || null,
          company: uMeta.company || null,
          phone: uMeta.phone || null,
          designation: uMeta.designation || null,
        },
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

    // Enrich with organization info
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("user_id, organization_id, tier, subscription_status");
    const { data: orgs } = await supabase
      .from("organizations")
      .select("id, name");
    const orgMap: Record<string, string> = {};
    (orgs || []).forEach((o: { id: string; name: string }) => { orgMap[o.id] = o.name; });
    const profileMap: Record<string, { organization_id?: string; tier?: string; subscription_status?: string }> = {};
    (profiles || []).forEach((p: { user_id: string; organization_id?: string; tier?: string; subscription_status?: string }) => { profileMap[p.user_id] = p; });
    users.forEach((u) => {
      const prof = profileMap[u.id];
      (u as Record<string, unknown>).organization_id = prof?.organization_id || null;
      (u as Record<string, unknown>).org_name = prof?.organization_id ? (orgMap[prof.organization_id] || null) : null;
      (u as Record<string, unknown>).tier = prof?.tier || "basic";
      (u as Record<string, unknown>).subscription_status = prof?.subscription_status || null;
    });

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
    // v1.24.0: expanded role list. canEdit() in the renderer maps these to
    // per-feature permissions.
    const ALLOWED_ROLES = ["super_admin", "manager", "product_manager", "developer", "viewer"];
    if (!ALLOWED_ROLES.includes(role)) {
      return errorResponse("Invalid role", 400);
    }

    const { error } = await supabase.auth.admin.updateUserById(target_user_id, {
      app_metadata: { role },
    });

    if (error) {
      console.error("[admin-api] set-role error:", error.message);
      return errorResponse("Failed to update role", 500);
    }

    return jsonResponse({ ok: true, message: "Role updated to " + role });
  }

  // ── TEAMS (v1.24.0) ────────────────────────────────────────────────────
  // ACTION: list-teams — anyone signed in can ask, but we return more
  // detail (members) to super admins via the same endpoint.
  if (action === "list-teams") {
    const { data: teams, error: tErr } = await supabase
      .from("teams")
      .select("*")
      .order("name", { ascending: true });
    if (tErr) {
      console.error("[admin-api list-teams] error:", tErr.message);
      return errorResponse("Failed to list teams", 500);
    }
    const { data: members } = await supabase
      .from("team_members")
      .select("*");
    // Resolve user_id → email/name for each member
    const { data: allUsers } = await supabase.auth.admin.listUsers();
    const userMap: Record<string, { email: string; name?: string }> = {};
    (allUsers?.users || []).forEach((u) => {
      const md = u.user_metadata as { display_name?: string; full_name?: string } | undefined;
      userMap[u.id] = {
        email: u.email || "",
        name: md?.display_name || md?.full_name,
      };
    });
    const enriched = (teams || []).map((t) => {
      const teamMembers = (members || [])
        .filter((m) => m.team_id === t.id)
        .map((m) => ({
          user_id: m.user_id,
          role_in_team: m.role_in_team,
          email: userMap[m.user_id]?.email || "(unknown)",
          name: userMap[m.user_id]?.name,
        }));
      return { ...t, members: teamMembers };
    });
    return jsonResponse({ ok: true, teams: enriched });
  }

  // v1.25.0: shared input validators for team writes
  const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
  const validateTeamFields = (
    name: unknown, description: unknown, color: unknown,
  ): string | null => {
    if (name != null) {
      const n = String(name).trim();
      if (n.length === 0 || n.length > 100) return "Team name must be 1\u2013100 characters";
    }
    if (description != null && String(description).length > 1000) {
      return "Description must be \u2264 1000 characters";
    }
    if (color != null && !HEX_COLOR.test(String(color))) {
      return "Color must be a #RRGGBB hex value";
    }
    return null;
  };

  // ACTION: create-team
  if (action === "create-team") {
    const { name, description, color } = body;
    if (!name || !String(name).trim()) return errorResponse("Team name required", 400);
    const verr = validateTeamFields(name, description, color);
    if (verr) return errorResponse(verr, 400);
    const { data, error } = await supabase
      .from("teams")
      .insert({
        name: String(name).trim(),
        description: description ? String(description).trim() : null,
        color: color || "#0ea5e9",
        created_by: user.id,
      })
      .select("id")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        return errorResponse("A team with that name already exists", 409);
      }
      console.error("[admin-api create-team] error:", (error as { code?: string }).code || error.message);
      return errorResponse("Failed to create team", 500);
    }
    return jsonResponse({ ok: true, id: data.id });
  }

  // ACTION: update-team
  if (action === "update-team") {
    const { id, name, description, color } = body;
    if (!id) return errorResponse("id required", 400);
    const verr = validateTeamFields(name, description, color);
    if (verr) return errorResponse(verr, 400);
    const updates: Record<string, unknown> = {};
    if (name != null) updates.name = String(name).trim();
    if (description != null) updates.description = String(description).trim();
    if (color != null) updates.color = String(color);
    if (Object.keys(updates).length === 0) return jsonResponse({ ok: true });
    const { error } = await supabase
      .from("teams")
      .update(updates)
      .eq("id", id);
    if (error) {
      console.error("[admin-api update-team] error:", (error as { code?: string }).code || error.message);
      return errorResponse("Failed to update team", 500);
    }
    return jsonResponse({ ok: true });
  }

  // ACTION: delete-team
  if (action === "delete-team") {
    const { id } = body;
    if (!id) return errorResponse("id required", 400);
    const { error } = await supabase
      .from("teams")
      .delete()
      .eq("id", id);
    if (error) {
      console.error("[admin-api delete-team] error:", error.message);
      return errorResponse("Failed to delete team", 500);
    }
    return jsonResponse({ ok: true });
  }

  // ACTION: set-team-members — replace the entire member list for a team
  if (action === "set-team-members") {
    const { id, member_user_ids } = body;
    if (!id || !Array.isArray(member_user_ids)) {
      return errorResponse("id and member_user_ids[] required", 400);
    }
    // Wipe existing members and insert the new set
    const { error: delErr } = await supabase
      .from("team_members")
      .delete()
      .eq("team_id", id);
    if (delErr) {
      console.error("[admin-api set-team-members del] error:", delErr.message);
      return errorResponse("Failed to update members", 500);
    }
    if (member_user_ids.length > 0) {
      const rows = member_user_ids.map((uid: string) => ({
        team_id: id,
        user_id: uid,
        role_in_team: "member",
      }));
      const { error: insErr } = await supabase
        .from("team_members")
        .insert(rows);
      if (insErr) {
        console.error("[admin-api set-team-members ins] error:", insErr.message);
        return errorResponse("Failed to add members", 500);
      }
    }
    return jsonResponse({ ok: true });
  }

  // ── ORGANIZATIONS ──────────────────────────────────────────────────────
  // ACTION: list-organizations — returns all orgs with user counts
  if (action === "list-organizations") {
    const { data: orgs, error } = await supabase
      .from("organizations")
      .select("*")
      .order("name");
    if (error) return errorResponse("Failed to list organizations", 500);

    // Get user counts per org
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("organization_id");

    const counts: Record<string, number> = {};
    (profiles || []).forEach((p: { organization_id?: string }) => {
      if (p.organization_id) counts[p.organization_id] = (counts[p.organization_id] || 0) + 1;
    });

    const enriched = (orgs || []).map((o: { id: string }) => ({
      ...o,
      user_count: counts[o.id] || 0,
    }));

    return jsonResponse({ ok: true, organizations: enriched });
  }

  // ACTION: create-organization — creates an org (platform_admin only)
  if (action === "create-organization") {
    if (!isPlatformAdmin(user)) return errorResponse("Platform admin required", 403);
    const { name, domain } = body;
    if (!name) return errorResponse("Name required", 400);

    const { data, error } = await supabase
      .from("organizations")
      .insert({ name, domain: domain || null, created_by: user.id })
      .select("id")
      .single();
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ ok: true, id: data.id });
  }

  // ACTION: update-organization — updates org name/domain
  if (action === "update-organization") {
    if (!isPlatformAdmin(user)) return errorResponse("Platform admin required", 403);
    const { id, name, domain } = body;
    if (!id) return errorResponse("Missing id", 400);
    const updates: Record<string, unknown> = {};
    if (name != null) updates.name = name;
    if (domain !== undefined) updates.domain = domain || null;

    const { error } = await supabase
      .from("organizations")
      .update(updates)
      .eq("id", id);
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ ok: true });
  }

  // ACTION: delete-organization — deletes org (nulls user_profiles.organization_id)
  if (action === "delete-organization") {
    if (!isPlatformAdmin(user)) return errorResponse("Platform admin required", 403);
    const { id } = body;
    if (!id) return errorResponse("Missing id", 400);

    // Unlink users first
    await supabase.from("user_profiles").update({ organization_id: null }).eq("organization_id", id);

    const { error } = await supabase.from("organizations").delete().eq("id", id);
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ ok: true });
  }

  // ACTION: assign-user-org — assigns a user to an org
  if (action === "assign-user-org") {
    const { user_id, organization_id } = body;
    if (!user_id) return errorResponse("Missing user_id", 400);

    const { error } = await supabase
      .from("user_profiles")
      .update({ organization_id: organization_id || null })
      .eq("user_id", user_id);
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ ok: true });
  }

  return errorResponse("Unknown action", 400);
}));
