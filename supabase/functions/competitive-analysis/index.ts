import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AREA_LABELS: Record<string, string> = {
  hardware_platform: "Hardware platforms, products, specs",
  software_platform: "Software platforms, SDKs, APIs, ecosystem",
  pricing: "Exact pricing in ZAR and USD for every product/tier — link to pricing page. Include monthly, annual, enterprise tiers",
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
  return `You are a competitive intelligence researcher. Research: ${competitors.join(", ")}

Areas: ${areaList}

RULES:
- Search the ACTUAL company websites, product pages, pricing pages, investor relations pages, LinkedIn, Crunchbase, Wikipedia
- Every single bullet point MUST end with a direct URL to the ACTUAL source page (e.g. https://company.com/pricing, https://company.com/products/device-name) — NOT search engine URLs, NOT Google cache URLs
- Use SHORT bullet points, not paragraphs. Max 1-2 sentences per bullet
- Include exact model names, exact prices (with currency), exact dates, exact employee numbers
- For pricing: link to the actual pricing page URL
- For hardware: link to the actual product spec page URL
- For software: link to the actual feature/platform page URL
- For partnerships: link to the press release or announcement URL
- Comparison matrix must have 15+ categories covering: specific product models, software features, pricing tiers, geographic reach, employee count, revenue, market share

CRITICAL RULES:
1. Respond with ONLY a JSON object. Start with { end with }. No other text.
2. Do NOT include any vertexaisearch.cloud.google.com URLs — only use direct URLs to the actual company/source websites.
3. Keep each detail bullet to 1-2 sentences max. Be concise but specific.
4. You MUST complete the entire JSON — do not stop mid-way. If running long, reduce detail per bullet rather than omitting sections.
{"competitors":[{"name":"X","threat_score":7,"overview":"Short company description","research":{"area_key":{"summary":"2-3 sentence overview","details":["Short fact — https://actual-source-url.com/page","Another fact — https://actual-source-url.com/page"],"sources":["https://company.com/relevant-page"]}},"swot":{"strengths":["specific strength — https://source"],"weaknesses":["specific weakness — https://source"],"opportunities":["opportunity"],"threats":["threat"]},"key_insights":["insight with data — https://source"],"recommendations":[{"title":"action","description":"why and how","suggested_timeline_months":3,"priority":"high"}]}],"overall_summary":"Executive summary","market_trends":["trend — https://source"],"comparison_matrix":{"categories":["Product Line A","Product Line B","Entry Price","Enterprise Price","API Available","Cloud Platform","Mobile App","Employee Count","Revenue","HQ Location","Founded","Key Markets","Latest Product","CEO"],"data":{"CompanyA":{"Product Line A":"Model X — $999","Entry Price":"$199/mo"}}},"sources":["https://url1.com","https://url2.com"]}`;
}

function extractJSON(text: string): unknown {
  let s = text.trim();
  // Strip all markdown fences
  s = s.replace(/```json\s*/gi, "").replace(/```\s*/g, "");

  // Attempt 1: direct parse
  try { return JSON.parse(s); } catch (e) { log("Parse attempt 1 failed: " + (e as Error).message.substring(0, 80)); }

  // Attempt 2: find outermost { }
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const chunk = s.substring(start, end + 1);
    try { return JSON.parse(chunk); } catch (e) { log("Parse attempt 2 failed: " + (e as Error).message.substring(0, 80)); }

    // Attempt 3: fix trailing commas
    try { return JSON.parse(chunk.replace(/,\s*([}\]])/g, "$1")); } catch (e) { log("Parse attempt 3 failed: " + (e as Error).message.substring(0, 80)); }

    // Attempt 4: fix control chars inside string values
    try {
      const fixed = chunk.replace(/[\x00-\x1f]/g, (c) => {
        if (c === "\n") return "\\n";
        if (c === "\r") return "\\r";
        if (c === "\t") return "\\t";
        return "";
      }).replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(fixed);
    } catch (e) { log("Parse attempt 4 failed: " + (e as Error).message.substring(0, 80)); }

    // Attempt 5: try to find the parse error position and truncate
    try {
      const testParse = JSON.parse(chunk);
      return testParse;
    } catch (e) {
      const posMatch = (e as Error).message.match(/position (\d+)/);
      if (posMatch) {
        const pos = parseInt(posMatch[1]);
        log("Parse error at position " + pos + ", trying to salvage...");
        // Try closing the JSON at the error point
        let truncated = chunk.substring(0, pos);
        // Close any open structures
        const opens = (truncated.match(/[{\[]/g) || []).length;
        const closes = (truncated.match(/[}\]]/g) || []).length;
        for (let i = 0; i < opens - closes; i++) {
          truncated += truncated.lastIndexOf("[") > truncated.lastIndexOf("{") ? "]" : "}";
        }
        try { return JSON.parse(truncated); } catch {}
      }
    }
  }

  // Last resort: return the raw text as a structured fallback
  log("All JSON parse attempts failed on " + s.length + " chars — returning raw text");
  return {
    overall_summary: s.substring(0, 5000),
    competitors: [],
    market_trends: [],
    sources: [],
    _raw: true
  };
}

function log(msg: string) { console.log(`[${new Date().toISOString()}] ${msg}`); }

// Deep-clean all vertexaisearch/google redirect URLs from results
function cleanResults(obj: unknown): unknown {
  if (typeof obj === 'string') {
    // Remove vertexaisearch URLs from inline text
    return obj.replace(/https?:\/\/vertexaisearch\.cloud\.google\.com[^\s,)"']*/g, '').replace(/\s*—?\s*source:\s*$/gi, '').trim();
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanResults).filter(item => {
      if (typeof item === 'string') return !item.match(/^https?:\/\/vertexaisearch\.cloud\.google\.com/) && item.trim().length > 0;
      return true;
    });
  }
  if (obj && typeof obj === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      cleaned[key] = cleanResults(val);
    }
    return cleaned;
  }
  return obj;
}

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
          generationConfig: { maxOutputTokens: 65536, temperature: 0.2 },
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

    // ═══ CLAUDE with user key ═══
    } else if (useExt && external_api.provider === "claude_user") {
      log("Using user-provided Claude API key...");
      const API_KEY = external_api.key;
      // Falls through to the same Claude logic below but with user's key
      const prompt = buildPrompt(competitors, research_areas);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": API_KEY, "content-type": "application/json", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 10000, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 10 }], messages: [{ role: "user", content: prompt }] }),
      });
      log(`User Claude responded — ${res.status} in ${Date.now() - t0}ms`);
      if (!res.ok) { const e = await res.text(); return errResp(502, "Claude error " + res.status + ": " + e.substring(0, 300)); }
      const data = await res.json();
      const wSrc: string[] = [];
      for (const block of data.content || []) { if (block.type === "web_search_tool_result") { for (const r of block.content || []) { if (r.url) wSrc.push(r.url); } } }
      const tb = data.content?.find((b: { type: string }) => b.type === "text");
      if (!tb?.text) return errResp(502, "No text in response");
      try { results = extractJSON(tb.text) as Record<string, unknown>; } catch { results = { overall_summary: tb.text, competitors: [], market_trends: [], sources: wSrc, _raw: true }; }
      const filt = (u: string) => !u.includes("vertexaisearch") && !u.includes("webcache.google");
      if (wSrc.filter(filt).length) { (results as Record<string, unknown>).sources = [...new Set([...((results as Record<string, unknown>).sources as string[] || []).filter(filt), ...wSrc.filter(filt)])]; }

    // ═══ CLAUDE (server key default) ═══
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

      // Merge web sources — filter out Google internal/cache URLs
      const filterUrl = (u: string) => !u.includes("vertexaisearch.cloud.google.com") && !u.includes("webcache.googleusercontent.com") && !u.includes("google.com/search");
      const cleanSources = webSources.filter(filterUrl);
      if (cleanSources.length) {
        const existing = ((results as Record<string, unknown>).sources as string[] || []).filter(filterUrl);
        (results as Record<string, unknown>).sources = [...new Set([...existing, ...cleanSources])];
      }
    }

    // Deep-clean all Google redirect URLs from results
    results = cleanResults(results);

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
