import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { user_id, data } = await req.json();

    if (!user_id || !data) {
      return new Response(JSON.stringify({ error: "Missing user_id or data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const SUPA_URL = Deno.env.get("SUPABASE_URL");
    const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPA_URL!, SUPA_KEY!);

    // Check if row exists
    const { data: existing } = await supabase
      .from("roadmap_data")
      .select("user_id")
      .eq("user_id", user_id)
      .limit(1);

    let result;
    if (existing && existing.length > 0) {
      // Update
      result = await supabase
        .from("roadmap_data")
        .update({ data, updated_at: new Date().toISOString() })
        .eq("user_id", user_id);
    } else {
      // Insert
      result = await supabase
        .from("roadmap_data")
        .insert({ user_id, data, updated_at: new Date().toISOString() });
    }

    if (result.error) {
      console.error("Sync error:", result.error.message, result.error.details);
      return new Response(JSON.stringify({
        error: result.error.message,
        details: result.error.details,
        hint: result.error.hint
      }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // Verify the data was saved by reading it back (check actual data content)
    const { data: verify, error: verifyErr } = await supabase
      .from("roadmap_data")
      .select("data, updated_at")
      .eq("user_id", user_id)
      .limit(1);

    const dataVerified = verify && verify.length > 0 && verify[0].data !== null;
    const savedRows = dataVerified ? (verify[0].data.rows || []).length : 0;

    if (!dataVerified) {
      console.error("VERIFICATION FAILED: row exists but data is null/missing", verifyErr);
    }

    return new Response(JSON.stringify({
      ok: dataVerified,
      action: existing && existing.length > 0 ? "updated" : "inserted",
      verified: dataVerified,
      saved_rows: savedRows,
      rows_in_data: (data.rows || []).length
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (e) {
    console.error("sync-roadmap error:", e.message, e.stack);
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
