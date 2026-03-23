import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AREA_LABELS: Record<string, string> = {
  hardware_platform: "Hardware platforms, products, specs",
  software_platform: "Software platforms, SDKs, APIs, ecosystem",
  pricing: "Pricing in local currency (ZAR/USD/EUR), tiers, licensing",
  suppliers_partnerships: "Suppliers, strategic partners, alliances, JVs",
  market_insights: "Acquisitions, share price, exec changes, employee count, revenue",
  regions_markets: "Regions, countries, market entry, geographic presence",
  esg: "ESG initiatives, sustainability, governance, ratings",
  strengths_weaknesses: "Strengths and weaknesses with evidence",
  market_share: "Market share %, industry ranking, growth rate",
  marketing_tactics: "Marketing channels, campaigns, positioning",
  customer_insights: "Target segments, major customers, satisfaction, reviews",
};

function buildPrompt(competitors: string[], areas: string[]): string {
  const areaList = areas.map(a => AREA_LABELS[a] || a).join("; ");
  return `Research these competitors: ${competitors.join(", ")}

For each, investigate: ${areaList}

Use web search to find CURRENT, SPECIFIC data. Include real numbers, prices in ZAR and USD, dates, names. Every claim needs a source URL.

CRITICAL: Your ENTIRE response must be a single JSON object. Start with { and end with }. No markdown, no explanation, no text outside the JSON. Structure:
{"competitors":[{"name":"X","threat_score":7,"overview":"2 paragraphs about the company","research":{"area_key":{"summary":"paragraph","details":["fact — source: URL","fact2 — source: URL"],"sources":["URL"]}},"swot":{"strengths":["with evidence"],"weaknesses":["with evidence"],"opportunities":["with rationale"],"threats":["with evidence"]},"key_insights":["detailed insight with data"],"recommendations":[{"title":"action","description":"detail","suggested_timeline_months":3,"priority":"high"}]}],"overall_summary":"3 paragraphs","market_trends":["trend with data"],"comparison_matrix":{"categories":["Cat1","Cat2"],"data":{"CompanyA":{"Cat1":"val"}}},"sources":["URL1","URL2"]}`;
}

function extractJSON(text: string): unknown {
  let s = text.trim();
  // Strip markdown fences
  s = s.replace(/^```(?:json)?\s*\n?/g, "").replace(/\n?```\s*$/g, "");
  // Try direct parse
  try { return JSON.parse(s); } catch {}
  // Try finding the outermost JSON object
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(s.substring(start, end + 1)); } catch {}
  }
  // Try fixing common issues: trailing commas, unescaped newlines in strings
  try {
    const fixed = s.substring(start, end + 1)
      .replace(/,\s*([}\]])/g, "$1") // remove trailing commas
      .replace(/\n/g, "\\n"); // escape newlines
    return JSON.parse(fixed);
  } catch {}
  throw new Error("No valid JSON found in " + s.length + " chars of response");
}

function log(msg: string) { console.log(`[${new Date().toISOString()}] ${msg}`); }

function errResp(status: number, error: string) {
  return new Response(JSON.stringify({ error }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const t0 = Date.now();
  try {
    const { competitors, research_areas, analysis_id, external_api } = await req.json();
    log(`START — competitors: ${competitors?.join(", ")}, areas: ${research_areas?.length}, engine: ${external_api?.provider || "claude"}`);

    if (!competitors?.length) return errResp(400, "Add at least one competitor");
    if (!research_areas?.length) return errResp(400, "Select at least one research area");

    const SUPA_URL = Deno.env.get("SUPABASE_URL");
    const SUPA_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(SUPA_URL!, SUPA_KEY!);

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return errResp(401, "Unauthorized");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return errResp(401, "Invalid token");
    log(`Auth OK — user: ${user.email}`);

    // Premium check
    const PREMIUM_EMAILS = ["velasabelo.com@gmail.com"];
    let isPremium = PREMIUM_EMAILS.includes((user.email || "").toLowerCase());
    if (!isPremium) {
      const { data: profile } = await supabase.from("user_profiles").select("tier,tier_expires_at").eq("user_id", user.id).single();
      isPremium = !!(profile?.tier === "premium" && (!profile.tier_expires_at || new Date(profile.tier_expires_at) > new Date()));
    }
    if (!isPremium) return errResp(403, "Premium subscription required");
    log("Premium OK");

    if (analysis_id) await supabase.from("competitive_analyses").update({ status: "processing" }).eq("id", analysis_id);

    const prompt = buildPrompt(competitors, research_areas);
    log(`Prompt built — ${prompt.length} chars`);

    let results: unknown;
    const useExt = external_api?.provider && external_api?.key;

    // ═══ GEMINI ═══
    if (useExt && external_api.provider === "gemini") {
      log("Calling Gemini API...");
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${external_api.key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 16000, temperature: 0.2 },
          tools: [{ google_search: {} }],
        }),
      });
      log(`Gemini responded — ${res.status} in ${Date.now() - t0}ms`);
      if (!res.ok) { const e = await res.text(); log("Gemini error: " + e); return errResp(502, "Gemini API error " + res.status + ": " + e.substring(0, 200)); }
      const data = await res.json();
      const txt = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      log(`Gemini text: ${txt.length} chars`);
      results = extractJSON(txt);

    // ═══ OPENAI ═══
    } else if (useExt && external_api.provider === "openai") {
      log("Calling OpenAI API...");
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${external_api.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o", max_tokens: 12000, temperature: 0.2, messages: [{ role: "system", content: "Return valid JSON only." }, { role: "user", content: prompt }] }),
      });
      log(`OpenAI responded — ${res.status} in ${Date.now() - t0}ms`);
      if (!res.ok) { const e = await res.text(); log("OpenAI error: " + e); return errResp(502, "OpenAI error " + res.status + ": " + e.substring(0, 200)); }
      const data = await res.json();
      results = extractJSON(data.choices?.[0]?.message?.content || "");

    // ═══ CLAUDE (default) ═══
    } else {
      const API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
      if (!API_KEY) return errResp(500, "ANTHROPIC_API_KEY not set");

      log("Calling Claude API with web search...");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": API_KEY, "content-type": "application/json", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 10000,
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 10 }],
          messages: [{ role: "user", content: prompt }],
        }),
      });
      log(`Claude responded — ${res.status} in ${Date.now() - t0}ms`);

      if (!res.ok) {
        const e = await res.text();
        log("Claude error: " + e);
        // Parse for specific error type
        try {
          const errObj = JSON.parse(e);
          if (errObj.error?.type === "rate_limit_error") return errResp(429, "Rate limit hit. Wait 60 seconds and try again. Tip: select fewer research areas.");
        } catch {}
        return errResp(502, "Claude API error " + res.status + ": " + e.substring(0, 300));
      }

      const data = await res.json();
      log(`Claude parsed — blocks: ${data.content?.length}, tokens: in=${data.usage?.input_tokens} out=${data.usage?.output_tokens}`);

      // Collect source URLs from web search results
      const webSources: string[] = [];
      for (const block of data.content || []) {
        if (block.type === "web_search_tool_result") {
          for (const r of block.content || []) { if (r.url) webSources.push(r.url); }
        }
      }
      log(`Found ${webSources.length} web sources`);

      const textBlock = data.content?.find((b: { type: string }) => b.type === "text");
      if (!textBlock?.text) return errResp(502, "No text in Claude response");

      log(`Extracting JSON from ${textBlock.text.length} chars`);
      try {
        results = extractJSON(textBlock.text) as Record<string, unknown>;
      } catch (jsonErr) {
        log(`JSON parse failed: ${(jsonErr as Error).message} — returning raw text as fallback`);
        // Return raw text as a structured result so the client can still show something
        results = {
          overall_summary: textBlock.text,
          competitors: [],
          market_trends: [],
          sources: webSources,
          _raw: true
        };
      }

      // Merge web sources
      if (webSources.length) {
        const existing = ((results as Record<string, unknown>).sources as string[]) || [];
        (results as Record<string, unknown>).sources = [...new Set([...existing, ...webSources])];
      }
    }

    // Save to DB
    if (analysis_id) {
      await supabase.from("competitive_analyses").update({ results, status: "complete", updated_at: new Date().toISOString() }).eq("id", analysis_id);
    }

    log(`DONE — ${Date.now() - t0}ms total`);
    return new Response(JSON.stringify({ ok: true, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e) {
    log(`EXCEPTION after ${Date.now() - t0}ms: ${(e as Error).message}`);
    return errResp(500, (e as Error).message);
  }
});
