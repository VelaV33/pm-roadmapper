import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email, new_password } = await req.json();

    if (!email || !new_password) {
      return new Response(JSON.stringify({ error: "Email and new password are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (new_password.length < 8) {
      return new Response(JSON.stringify({ error: "Password must be at least 8 characters" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const SUPA_URL = Deno.env.get("SUPABASE_URL");
    const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPA_URL!, SUPA_KEY!);

    // Find the user by email
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const user = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase().trim());

    if (!user) {
      return new Response(JSON.stringify({ error: "No account found with this email address." }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Reset the password via admin API
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password: new_password,
    });

    if (error) {
      console.error("Reset password error:", error.message);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      message: "Password reset successfully! You can now sign in with your new password."
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (e) {
    console.error("reset-password error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
