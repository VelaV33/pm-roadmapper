/* ════════════════════════════════════════════════════════════════════════════
 * /api/transcribe — stateless CORS bypass for Gemini audio transcription
 *
 * Mirrors main.js:432 (transcribe-audio IPC handler). Tries a sequence of
 * Gemini models in order; returns the first one that produces non-empty,
 * coherent text. Same security model as ai-proxy: user supplies their own
 * API key; we never store or log it.
 * ════════════════════════════════════════════════════════════════════════════ */

export const config = { runtime: 'edge' };

const MODELS = [
  'gemini-3-flash-preview',
  'gemini-3-pro-preview',
  'gemini-3.1-pro-preview',
  'gemini-2.5-flash',
];

const PROMPT =
  'This is a voice recording of someone giving instructions for a product ' +
  'roadmap tool. Listen carefully and transcribe EXACTLY what is spoken, ' +
  'word for word. Do NOT make up or generate content. If you cannot hear ' +
  'clear speech, respond with "[unclear audio]". Return ONLY the exact transcription.';

// ─── Per-IP rate limit (shared semantics with ai-proxy.js) ───────────────────
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 15; // transcription is heavier — tighter cap
const _hits = new Map();

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

  const { base64, apiKey, mimeType } = body || {};
  if (typeof apiKey !== 'string' || !apiKey) return json({ ok: false, error: 'Missing apiKey' }, 400);
  if (typeof base64 !== 'string' || !base64) return json({ ok: false, error: 'Missing audio' }, 400);

  const mime = mimeType || 'audio/webm';
  let firstError = '';

  for (const model of MODELS) {
    try {
      const url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
                  model + ':generateContent?key=' + encodeURIComponent(apiKey);

      const upstream = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: mime, data: base64 } },
              { text: PROMPT },
            ],
          }],
          generationConfig: { maxOutputTokens: 2000, temperature: 0 },
        }),
      });

      const raw = await upstream.text();
      let data;
      try { data = JSON.parse(raw); }
      catch { data = {}; }

      if (upstream.ok && data.candidates) {
        const parts = data.candidates[0]?.content?.parts || [];
        let text = '';
        parts.forEach(p => { if (p.text) text += p.text; });
        const trimmed = text.trim();
        const lower   = trimmed.toLowerCase();
        if (
          trimmed &&
          !lower.includes('unable to process audio') &&
          !lower.includes('cannot transcribe') &&
          !lower.includes('[unclear audio]')
        ) {
          return json({ ok: true, text: trimmed, model });
        }
      } else if (!firstError) {
        firstError = model + ': HTTP ' + upstream.status;
      }
    } catch (_e) {
      // Try next model.
    }
  }

  return json({ ok: false, error: firstError || 'All transcription models failed.' });
}
