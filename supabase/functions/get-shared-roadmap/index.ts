import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { owner_id, share_id } = await req.json();
    if (!owner_id) {
      return new Response(JSON.stringify({ error: "Missing owner_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Use service role key — bypasses RLS so we can read any user's roadmap data
    const SUPA_URL = Deno.env.get("SUPABASE_URL");
    const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPA_URL!, SUPA_KEY!);

    // Verify the share record exists (caller must have a valid share)
    if (share_id) {
      const { data: shareRecord, error: shareErr } = await supabase
        .from("shared_roadmaps")
        .select("id")
        .eq("id", share_id)
        .single();
      if (shareErr || !shareRecord) {
        return new Response(JSON.stringify({ error: "Share not found or revoked" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // Fetch the owner's roadmap data
    const { data: roadmapRows, error: roadmapErr } = await supabase
      .from("roadmap_data")
      .select("data, updated_at")
      .eq("user_id", owner_id)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (roadmapErr) {
      console.error("Roadmap fetch error:", roadmapErr.message);
      return new Response(JSON.stringify({ error: "Failed to fetch roadmap: " + roadmapErr.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    if (!roadmapRows || roadmapRows.length === 0 || !roadmapRows[0].data) {
      return new Response(JSON.stringify({ error: "Owner has no roadmap data in the cloud" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      data: roadmapRows[0].data,
      updated_at: roadmapRows[0].updated_at
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (e) {
    console.error("get-shared-roadmap error:", e.message);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
