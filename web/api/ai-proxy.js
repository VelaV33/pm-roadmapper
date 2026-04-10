/* ════════════════════════════════════════════════════════════════════════════
 * /api/ai-proxy — stateless CORS bypass for OpenAI / Anthropic / Gemini
 *
 * The browser cannot call api.openai.com / api.anthropic.com /
 * generativelanguage.googleapis.com directly because none of them send
 * permissive CORS headers. The Electron app dodges this by running the
 * request from main.js:598 (the Node main process). The web build dodges it
 * by running through this Vercel Edge function instead.
 *
 * SECURITY MODEL:
 *   • Users supply their OWN API key in the request body (same as Electron).
 *   • This function never reads, stores, or logs the key.
 *   • It just forwards the call and returns the upstream response.
 *   • Per-IP rate limit (in-memory, best-effort) caps abuse if a user's key
 *     leaks. Anything more robust requires Vercel KV or upstream limits.
 *
 * Response shape exactly matches the Electron handler so the shim's
 * aiRequest pass-through works without translation.
 * ════════════════════════════════════════════════════════════════════════════ */

export const config = { runtime: 'edge' };

// ─── Tiny per-IP rate limit (best-effort, resets per cold-start) ─────────────
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 30;
const _hits = new Map(); // ip -> [timestamps]

function rateLimit(ip) {
  const now = Date.now();
  const arr = (_hits.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (arr.length >= MAX_PER_WINDOW) return false;
  arr.push(now);
  _hits.set(ip, arr);
  return true;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ ok: false, error: 'POST only' }, 405);

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (!rateLimit(ip)) return json({ ok: false, error: 'Rate limit exceeded' }, 429);

  let body;
  try { body = await req.json(); }
  catch { return json({ ok: false, error: 'Invalid JSON' }, 400); }

  const { provider, apiKey, model, prompt, systemPrompt, imageBase64, imageMime } = body || {};

  if (typeof apiKey !== 'string' || !apiKey) return json({ ok: false, error: 'Missing apiKey' }, 400);
  if (typeof prompt !== 'string' || !prompt) return json({ ok: false, error: 'Missing prompt' }, 400);

  let url, headers, payload, extractText;

  try {
    if (provider === 'gemini') {
      url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
            (model || 'gemini-2.5-flash') + ':generateContent?key=' + encodeURIComponent(apiKey);
      headers = { 'Content-Type': 'application/json' };
      const parts = [];
      if (imageBase64) parts.push({ inlineData: { mimeType: imageMime || 'image/png', data: imageBase64 } });
      parts.push({ text: (systemPrompt ? systemPrompt + '\n\n' : '') + prompt });
      payload = JSON.stringify({
        contents: [{ parts }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 8192 },
      });
      extractText = (data) => data?.candidates?.[0]?.content?.parts?.[0]?.text || null;

    } else if (provider === 'openai') {
      url = 'https://api.openai.com/v1/chat/completions';
      headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey };
      payload = JSON.stringify({
        model: model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt || 'You are a helpful assistant.' },
          { role: 'user',   content: prompt },
        ],
        temperature: 0.3,
        max_tokens: 8192,
      });
      extractText = (data) => data?.choices?.[0]?.message?.content || null;

    } else if (provider === 'claude') {
      url = 'https://api.anthropic.com/v1/messages';
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      };
      payload = JSON.stringify({
        model: model || 'claude-sonnet-4-5-20250514',
        max_tokens: 8192,
        system: systemPrompt || 'You are a helpful assistant.',
        messages: [{ role: 'user', content: prompt }],
      });
      extractText = (data) => data?.content?.[0]?.text || null;

    } else {
      return json({ ok: false, error: 'Unknown provider: ' + provider }, 400);
    }

    const upstream = await fetch(url, { method: 'POST', headers, body: payload });
    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); }
    catch { return json({ ok: false, error: 'Parse error from upstream' }, 502); }

    const out = extractText(data);
    if (out) return json({ ok: true, text: out });

    // Don't echo full upstream body — may contain key fragments or PII
    return json({
      ok: false,
      error: data?.error?.message || ('Upstream error (HTTP ' + upstream.status + ')'),
    });

  } catch (e) {
    return json({ ok: false, error: e.message || String(e) }, 500);
  }
}
