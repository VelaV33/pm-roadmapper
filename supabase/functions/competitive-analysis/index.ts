import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AREA_LABELS: Record<string, string> = {
  // Fleet Management — aligned with industry feature tables
  driver_behaviour: "Driver Behaviour — Driver Monitoring ABCs, Driver Scoring (RAG), Real-time driver feedback, Fatigue/Distraction/Smoking/Seatbelt/Phone detection, Driver & Vehicle License Management, Vehicle Immobilisation, Breathalyser, Impact Detection, Share my Journey, Driver coaching, Score cards, Leaderboards",
  canbus_fuel: "CANBUS & Fuel Monitoring — CAN connected devices, OBD port devices, Engine warnings, Brake level warnings, TPMS integration, RPM & Idling, Fuel level monitoring (CAN/probe), Fuel theft/siphoning detection, Fuel trend analysis, Fuel cap sensors, Anti-siphoning devices, Fuel reconciliation, Route costing, Fuel consumption reports, Cost-per-km, Fuel card integration, Fuel receipt matching with location",
  svr_jamming: "SVR & Jamming — Stolen Vehicle Recovery capability, 24/7 call centre, Signal jamming detection, Anti-jamming technology, CME device, National coverage, Recovery success rate, Response time SLA",
  alarms_alerts: "Alarms & Alerts — Engine fault alerts, Brake pad warnings, Oil/water fluctuation alerts, Geo-fence alerts, Crash alerts & analysis, Battery tampering alerts, Low battery alerts, Towing alerts, High risk area alerts, Impact alerts, Device health alerts, No-go zone alerts, Speed alerts",
  job_scheduling: "Job Scheduling — Job dispatching, Route planning & scheduling, Task management via app, Field services management, Electronic proof of delivery (EPOD), Dispatch IQ",
  mobile_apps: "Mobile Apps — Fleet manager app, Driver app, Consumer/SVR app, Insurance app, EPOD app, Navigation app, Vehicle inspection app, Driver messaging, Voice calls, App store ratings (iOS/Android), Offline capability. List each app by name.",
  geofencing: "Geofencing — Geo-fence creation, No-go zones, Border alerts, Zone management, Geo-zone reporting, Zone-based alerts",
  green_driving_co2: "Green Driving & CO2 — CO2 emissions monitoring, EV fleet management, Driver behaviour linked green driving scores, Engine diagnostics linked efficiency",
  cameras_dashcams: "Cameras & AI Dashcams — AI dashcam models, Resolution, Front/rear/in-cab/side channels, ADAS (collision avoidance), Fatigue detection, Distraction detection, Smoking/phone/seatbelt detection, Night vision/infrared, LTE live streaming, Video storage, Video download, Video analysis, MobileEye integration, Number of camera channels (1/2/4)",
  peripherals: "Peripherals — Panic buttons, Driver ID (iButton/RFID/BLE tag), Driver feedback buzzer, Voice kit & keypad, Temperature sensors, Door sensors, Cement mixer sensors, Seat pressure sensors, Cargo door sensors, Fuel cap/flap sensors, Tamper sensors, Power take-off, Taxi metre, Ruggedised RFID reader",
  fis_bureau: "FIS/Bureau & AARTO — 24/7 bureau/control room service, FIS track and react service, AARTO compliance, Speeding data for infringements, Camera surveillance, Driver control, Smart bureau, Smart control room",
  asset_lifecycle: "Asset Lifecycle — Asset monitoring, Scheduled downtime, Maintenance scheduling, Preventive maintenance alerts, Maintenance cycles, Driver advance warnings via app, Service history tracking",
  vas_services: "VAS — Roadside assistance, Medical assistance, Emergency evacuation (EVAC), Towing assistance, Recovery warranty, Car insurance brokerage, Personal computer tracking, Hospital cover, Disability cover, Armed response via WhatsApp, Device protection/replacement plans, Legal solutions",
  route_management: "Route Management — Route planning, Route optimisation, Route costing, Route replay, Planned vs actual route comparison",
  bi_dashboards: "BI Dashboards & Reports — KPI dashboards, Trip reports, In/out of location reports, Driver scores, Event violations, Cost analysis, Distance/driving time/idle time/parking time, Data integration API, Custom report builder, Scheduled reports, Power BI/Tableau integration, E-toll reports, Speed buffer reports, Site visits, Unit list, Message log, Incidents, Score cards, Battery trend, Trip logs, Hours worked, ABCs reports",
  trailer_tracking: "Trailer & Cargo Tracking — Wireless trailer trackers, Battery life (years), Temperature sensors, Cargo monitoring, Geo-fence for trailers, Trailer grouping, Maintenance cycle alerts, Cold chain monitoring",
  in_cab_device: "In-Cab Device — AI driving coach with visual alerts, In-cab screen/display, Navigation, Driver behaviour display, SMS position request, Traffic info, Impact detection alerts",
  vehicle_inspections: "Vehicle Inspections — Electronic road inspection forms, Pre-trip vehicle inspection, Inspection checklists via app",
  remote_door: "Remote Door & Access — Vehicle access control, Remote door unlock/lock, Door open/close sensors",
  mining_features: "Mining Features — Collision avoidance sensors, Onboard weighing, Tip sensors, Mining sector specific tracking, Underground tracking",
  fixed_assets_devices: "Fixed Assets & Devices — Wired devices, Wireless devices, Battery-powered trackers (battery life years), Rechargeable devices, Plug & Play OBD, IP ratings, Accelerometer, GPS accuracy, Supported asset types (bikes, golf carts, containers, boats, cars, trucks, equipment)",
  white_label_api: "White-Label & API — White-label app, REST API, Webhooks, SDK, Integration partners (ERP, TMS, insurance), Data sharing, SatComms for remote areas",
  // Generic areas
  hardware_platform: "Hardware platforms — all product lines with model numbers, specs, pricing per unit",
  software_platform: "Software platform — complete feature list, architecture, tech stack, integrations",
  pricing: "Exact pricing in ZAR and USD — device cost, monthly subscription per vehicle, setup fees, contract terms, volume discounts",
  suppliers_partnerships: "Strategic partnerships, OEM deals, distribution partners, technology alliances",
  market_insights: "Acquisitions, share price, CEO/CTO/exec changes, employee count, revenue, funding",
  regions_markets: "Geographic presence, countries, HQ, offices, market entry, key verticals",
  esg: "ESG initiatives, sustainability, carbon tracking, governance",
  strengths_weaknesses: "Competitive strengths and weaknesses with evidence",
  market_share: "Market share %, industry ranking, installed base, vehicles managed",
  marketing_tactics: "Marketing channels, trade shows, thought leadership, social media",
  customer_insights: "Target segments, major customers, case studies, reviews",
};

function buildPrompt(competitors: string[], areas: string[], guidance?: string): string {
  // Keep prompt concise — use short labels for many areas, full descriptions for few
  const useShort = areas.length > 6;
  const areaList = areas.map(a => {
    const full = AREA_LABELS[a] || a;
    return useShort ? full.split("—")[0].trim() : full;
  }).join("\n- ");

  return `You are a fleet management competitive intelligence researcher. Research: ${competitors.join(", ")}

Areas to compare:
- ${areaList}

RULES: Use short bullets (1 sentence each). Include real URLs to company websites (NOT google/vertexaisearch URLs). Prices in ZAR and USD. Be concise — complete the full JSON.
${guidance ? `USER GUIDANCE: ${guidance}\n` : ''}
Respond with ONLY JSON. Start with { end with }.
{"competitors":[{"name":"X","overview":"Short description","research":{"area_key":{"summary":"overview","details":["fact — https://company.com/page"],"sources":["https://url"]}},"swot":{"strengths":["s"],"weaknesses":["w"],"opportunities":["o"],"threats":["t"]},"key_insights":["insight"],"recommendations":[{"title":"action","description":"detail","suggested_timeline_months":3,"priority":"high"}]}],"overall_summary":"summary","market_trends":["trend"],"comparison_matrix":{"categories":["Cat1","Cat2"],"data":{"Co":{"Cat1":"val"}}},"sources":["https://url"]}`;
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
    const { competitors, research_areas, analysis_id, external_api, guidance } = await req.json();
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

    const prompt = buildPrompt(competitors, research_areas, guidance);
    // Scale web searches: fewer areas = more searches per area, more areas = fewer to stay in time
    const webSearches = Math.max(3, Math.min(10, Math.floor(20 / (competitors.length * Math.max(1, research_areas.length / 3)))));
    log(`Prompt built — ${prompt.length} chars, webSearches: ${webSearches}`);

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
      const prompt = buildPrompt(competitors, research_areas, guidance);
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "x-api-key": API_KEY, "content-type": "application/json", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 10000, tools: [{ type: "web_search_20250305", name: "web_search", max_uses: webSearches }], messages: [{ role: "user", content: prompt }] }),
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
          tools: [{ type: "web_search_20250305", name: "web_search", max_uses: webSearches }],
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
