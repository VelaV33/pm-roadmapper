import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Super admin emails — can be expanded via the admin UI
const SUPER_ADMINS = ["velasabelo.com@gmail.com"];

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { action, caller_email, caller_id, target_user_id, role } = await req.json();

    const SUPA_URL = Deno.env.get("SUPABASE_URL");
    const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPA_URL!, SUPA_KEY!);

    // Check if caller is super admin
    const { data: allUsers } = await supabase.auth.admin.listUsers();
    const callerUser = allUsers?.users?.find(u => u.id === caller_id);

    // Check super admin status from user metadata or hardcoded list
    const isSuperAdmin = callerUser && (
      SUPER_ADMINS.includes(callerUser.email?.toLowerCase() || '') ||
      callerUser.user_metadata?.role === 'super_admin'
    );

    // ACTION: check-role — anyone can check their own role
    if (action === 'check-role') {
      return new Response(JSON.stringify({
        ok: true,
        is_super_admin: isSuperAdmin,
        email: callerUser?.email
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // All other actions require super admin
    if (!isSuperAdmin) {
      return new Response(JSON.stringify({ error: "Access denied. Super Admin role required." }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ACTION: list-users — get all users with their data summary
    if (action === 'list-users') {
      const users = allUsers?.users?.map(u => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in: u.last_sign_in_at,
        is_super_admin: SUPER_ADMINS.includes(u.email?.toLowerCase() || '') || u.user_metadata?.role === 'super_admin',
        role: u.user_metadata?.role || 'product_manager'
      })) || [];

      // Get roadmap data counts for each user
      for (const user of users) {
        const { data: rd } = await supabase
          .from("roadmap_data")
          .select("data")
          .eq("user_id", user.id)
          .limit(1);

        if (rd && rd[0] && rd[0].data) {
          user.rows_count = (rd[0].data.rows || []).length;
          user.sections_count = (rd[0].data.sections || []).length;
        } else {
          user.rows_count = 0;
          user.sections_count = 0;
        }
      }

      return new Response(JSON.stringify({ ok: true, users }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // ACTION: get-user-data — fetch a specific user's full roadmap data
    if (action === 'get-user-data') {
      if (!target_user_id) {
        return new Response(JSON.stringify({ error: "target_user_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const { data: rd } = await supabase
        .from("roadmap_data")
        .select("data, updated_at")
        .eq("user_id", target_user_id)
        .limit(1);

      const targetUser = allUsers?.users?.find(u => u.id === target_user_id);

      return new Response(JSON.stringify({
        ok: true,
        user: { id: target_user_id, email: targetUser?.email },
        data: rd && rd[0] ? rd[0].data : null,
        updated_at: rd && rd[0] ? rd[0].updated_at : null
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ACTION: set-role — assign super_admin or remove it
    if (action === 'set-role') {
      if (!target_user_id || !role) {
        return new Response(JSON.stringify({ error: "target_user_id and role required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const { error } = await supabase.auth.admin.updateUserById(target_user_id, {
        user_metadata: { role: role }
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      return new Response(JSON.stringify({ ok: true, message: "Role updated to " + role }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action: " + action }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (e) {
    console.error("admin-api error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
