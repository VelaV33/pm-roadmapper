import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email, user_id } = await req.json();
    if (!email && !user_id) {
      return new Response(JSON.stringify({ error: "Missing email or user_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const SUPA_URL = Deno.env.get("SUPABASE_URL");
    const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPA_URL!, SUPA_KEY!);

    // Get shares where this user is the recipient
    const { data: sharedToMe, error: err1 } = await supabase
      .from("shared_roadmaps")
      .select("*")
      .eq("recipient_email", email.toLowerCase().trim())
      .order("created_at", { ascending: true });

    if (err1) console.error("sharedToMe error:", err1.message);

    // Get shares where this user is the owner
    let sharedByMe: any[] = [];
    if (user_id) {
      const { data, error: err2 } = await supabase
        .from("shared_roadmaps")
        .select("*")
        .eq("owner_id", user_id)
        .order("created_at", { ascending: true });
      if (err2) console.error("sharedByMe error:", err2.message);
      if (data) sharedByMe = data;
    }

    return new Response(JSON.stringify({
      ok: true,
      shared_to_me: sharedToMe || [],
      shared_by_me: sharedByMe
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (e) {
    console.error("get-my-shares error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
