import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handle, verifyRequest, jsonResponse } from "../_shared/auth.ts";

serve(handle(async (req) => {
  const { user, supabase } = await verifyRequest(req);

  // Identity comes from the verified JWT — never the request body.
  const callerEmail = (user.email || "").toLowerCase();
  const callerId = user.id;

  // Shares to me (where I'm the recipient)
  let sharedToMe: unknown[] = [];
  if (callerEmail) {
    const { data, error } = await supabase
      .from("shared_roadmaps")
      .select("*")
      .eq("recipient_email", callerEmail)
      .order("created_at", { ascending: true });
    if (error) console.error("[get-my-shares] sharedToMe:", error.message);
    if (data) sharedToMe = data;
  }

  // Shares from me (where I'm the owner)
  const { data: sharedByMeData, error: err2 } = await supabase
    .from("shared_roadmaps")
    .select("*")
    .eq("owner_id", callerId)
    .order("created_at", { ascending: true });
  if (err2) console.error("[get-my-shares] sharedByMe:", err2.message);

  return jsonResponse({
    ok: true,
    shared_to_me: sharedToMe,
    shared_by_me: sharedByMeData || [],
  });
}));
