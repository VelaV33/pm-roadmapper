/* ════════════════════════════════════════════════════════════════════════════
 * electronAPI browser shim
 *
 * Implements every method on window.electronAPI that the unmodified Electron
 * renderer expects (defined in ../../preload.js). Each method's contract is
 * preserved exactly so the 23k-line index.html cannot tell whether it's
 * running in Electron or in a browser.
 *
 * Backed by:
 *   • supabase-js          — auth, REST, storage
 *   • IndexedDB            — offline cache (replaces local JSON file)
 *   • Blob + download anchor — file save operations
 *   • <input type=file>    — file picker
 *   • Vercel /api/*        — AI proxy + audio transcription (CORS-blocked
 *                            from browser direct, so they go through
 *                            stateless serverless functions)
 *   • CDN-loaded parsers   — pdf.js, mammoth, JSZip (loaded on demand by
 *                            readFile to keep cold-start small)
 *
 * Self-contained: no module imports, single global. Loaded by build.js
 * before any renderer script.
 * ════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ─── Supabase project ──────────────────────────────────────────────────────
  // Mirrors main.js:556-557. Anon key is RLS-protected and safe to expose.
  const SUPA_URL  = 'https://nigusoyssktoebzscbwe.supabase.co';
  const SUPA_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5pZ3Vzb3lzc2t0b2VienNjYndlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM4Mzg4MDEsImV4cCI6MjA4OTQxNDgwMX0.RhMTy0kL5LuEhxPb3R6SSxUTHGauouudCWlPHWteTtI';

  if (!window.supabase || !window.supabase.createClient) {
    console.error('[electronAPI shim] supabase-js UMD did not load — auth will fail');
  }
  const sb = window.supabase
    ? window.supabase.createClient(SUPA_URL, SUPA_ANON, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: 'pmr-web-auth' }
      })
    : null;

  // ─── State ─────────────────────────────────────────────────────────────────
  let _activeUserId = null;
  const _resetCallbacks = [];

  // ─── IndexedDB cache (replaces local JSON file) ────────────────────────────
  // Schema: one object store, key = userId (or 'default'), value = roadmap blob
  const DB_NAME = 'pmr-cache';
  const STORE   = 'roadmap';

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }
  async function idbGet(key) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const r  = tx.objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror   = () => reject(r.error);
    });
  }
  async function idbPut(key, value) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  }
  function cacheKey() { return _activeUserId || 'default'; }

  // ─── File save helper ──────────────────────────────────────────────────────
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ─── File picker helper ────────────────────────────────────────────────────
  function pickFiles({ accept, multiple } = {}) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      if (accept)   input.accept   = accept;
      if (multiple) input.multiple = true;
      input.onchange = () => {
        const files = input.files ? Array.from(input.files) : [];
        resolve(files);
      };
      // If the user closes the picker without choosing, browsers don't fire
      // a reliable cancel event. We resolve with [] from a focus listener.
      const onFocus = () => {
        setTimeout(() => {
          if (!input.files || input.files.length === 0) resolve([]);
          window.removeEventListener('focus', onFocus);
        }, 300);
      };
      window.addEventListener('focus', onFocus);
      input.click();
    });
  }

  // ─── Lazy CDN script loader (for parsers) ──────────────────────────────────
  const _loadedScripts = {};
  function loadScript(src) {
    if (_loadedScripts[src]) return _loadedScripts[src];
    _loadedScripts[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.crossOrigin = 'anonymous';
      s.onload  = () => resolve();
      s.onerror = () => reject(new Error('Failed to load ' + src));
      document.head.appendChild(s);
    });
    return _loadedScripts[src];
  }

  // ─── Supabase REST helpers (replace Electron supa-* IPC) ───────────────────
  // The renderer uses supaRequest for /auth/v1/* and supaDb for /rest/v1/*.
  // Both are pure CORS-bypass proxies in Electron; in the browser we hit
  // Supabase directly. CORS is allowed by Supabase for its own domain.

  async function getAccessToken() {
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data.session?.access_token || null;
  }

  async function supaFetchRaw(path, method, body, token) {
    const m = (method || 'GET').toUpperCase();
    const headers = {
      'Content-Type': 'application/json',
      'apikey':       SUPA_ANON,
      'Authorization': 'Bearer ' + (token || (await getAccessToken()) || SUPA_ANON),
    };
    try {
      const res = await fetch(SUPA_URL + path, {
        method: m,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      let data;
      const text = await res.text();
      try { data = text ? JSON.parse(text) : {}; }
      catch { data = {}; }
      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      return { ok: false, status: 0, data: { error_description: e.message } };
    }
  }

  async function supaDbFetchRaw(path, method, body, token) {
    const m = (method || 'GET').toUpperCase();
    const headers = {
      'Content-Type': 'application/json',
      'apikey':       SUPA_ANON,
      'Authorization': 'Bearer ' + (token || (await getAccessToken()) || SUPA_ANON),
    };
    if (m !== 'GET' && m !== 'DELETE') {
      headers['Prefer'] = 'return=representation,resolution=merge-duplicates';
    }
    try {
      const res = await fetch(SUPA_URL + path, {
        method: m,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let data;
      try { data = text.trim() ? JSON.parse(text) : (m === 'DELETE' ? [] : {}); }
      catch { data = { message: 'Parse error: ' + text.slice(0, 100) }; }
      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      return { ok: false, status: 0, data: { message: e.message } };
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // electronAPI surface — every method matches preload.js exactly
  // ═════════════════════════════════════════════════════════════════════════
  window.electronAPI = {

    // ── Identity ────────────────────────────────────────────────────────────
    setActiveUser: async (userId) => {
      _activeUserId = userId || null;
      return { ok: true };
    },

    // ── Local roadmap cache (replaces local JSON file) ──────────────────────
    loadData: async () => {
      try {
        const data = await idbGet(cacheKey());
        if (data && (data.rows || data.sections)) return { ok: true, data };
        return { ok: false };
      } catch (e) {
        console.error('[shim loadData]', e);
        return { ok: false };
      }
    },
    saveData: async (payload) => {
      try {
        await idbPut(cacheKey(), payload);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    // ── Backup export / import ──────────────────────────────────────────────
    exportBackup: async () => {
      try {
        const data = await idbGet(cacheKey());
        if (!data) return { ok: false, error: 'No data to export' };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        downloadBlob(blob, 'netstar-roadmap-backup.json');
        return { ok: true, path: 'netstar-roadmap-backup.json' };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },
    importBackup: async () => {
      const files = await pickFiles({ accept: '.json' });
      if (!files.length) return { ok: false };
      try {
        const text = await files[0].text();
        const data = JSON.parse(text);
        await idbPut(cacheKey(), data);
        return { ok: true, data };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    // ── Print to PDF (uses browser print dialog) ────────────────────────────
    printPDF: async (htmlContent) => {
      try {
        const w = window.open('', '_blank');
        if (!w) return { ok: false, error: 'Popup blocked — allow popups for this site' };
        w.document.open();
        w.document.write(htmlContent);
        w.document.close();
        // Give styles + images a moment to settle, then trigger print.
        setTimeout(() => { try { w.focus(); w.print(); } catch (_) {} }, 500);
        return { ok: true, path: '(browser print dialog)' };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    // ── Save text file ──────────────────────────────────────────────────────
    saveFile: async ({ content, defaultName, ext, label }) => {
      try {
        const mime = ext === 'html' ? 'text/html' :
                     ext === 'csv'  ? 'text/csv'  : 'text/plain';
        downloadBlob(new Blob([content], { type: mime }), defaultName);
        return { ok: true, path: defaultName };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    // ── Save binary file from base64 ────────────────────────────────────────
    saveBinaryFile: async ({ base64, defaultName, ext, label }) => {
      try {
        const bin = atob(base64);
        const buf = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
        downloadBlob(new Blob([buf], { type: 'application/octet-stream' }), defaultName);
        return { ok: true, path: defaultName };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    // ── Read & parse a file the user picks (PDF / DOCX / XLSX / PPTX / …) ──
    readFile: async (opts) => {
      const accept = (opts?.filters || [])
        .flatMap(f => f.extensions || [])
        .filter(x => x !== '*')
        .map(x => '.' + x).join(',') || undefined;
      const files = await pickFiles({ accept });
      if (!files.length) return { ok: false };
      const file = files[0];
      const name = file.name;
      const ext  = ('.' + (name.split('.').pop() || '')).toLowerCase();

      // Upload to attachments bucket so it persists across sessions
      let storedName = '';
      try {
        const { data: { user } } = await sb.auth.getUser();
        if (user) {
          const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_');
          storedName = Date.now() + '_' + safe;
          await sb.storage.from('attachments').upload(user.id + '/' + storedName, file);
        }
      } catch (e) {
        console.warn('[shim readFile] storage upload failed:', e.message);
      }

      try {
        // PDF — lazy-load pdf.js (vendored under /shim/)
        if (ext === '.pdf') {
          await loadScript('/shim/pdf.min.js');
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/shim/pdf.worker.min.js';
          const buf = await file.arrayBuffer();
          const doc = await window.pdfjsLib.getDocument({ data: buf }).promise;
          let text = '';
          for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const tc   = await page.getTextContent();
            text += tc.items.map(it => it.str).join(' ') + '\n';
          }
          return { ok: true, name, ext, text, storedName };
        }

        // DOCX — lazy-load mammoth (vendored under /shim/)
        if (ext === '.docx') {
          await loadScript('/shim/mammoth.browser.min.js');
          const buf = await file.arrayBuffer();
          const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
          return { ok: true, name, ext, text: result.value || '', storedName };
        }

        // XLSX / XLS — base64 for SheetJS in renderer (already vendored)
        if (ext === '.xlsx' || ext === '.xls') {
          const buf = await file.arrayBuffer();
          const b64 = btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
          return { ok: true, name, ext, base64: b64, storedName };
        }

        // PPTX — lazy-load JSZip (vendored under /shim/), extract <a:t> text
        if (ext === '.pptx') {
          try {
            await loadScript('/shim/jszip.min.js');
            const buf = await file.arrayBuffer();
            const zip = await window.JSZip.loadAsync(buf);
            let text = '';
            const slidePaths = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p));
            for (const p of slidePaths) {
              const xml = await zip.files[p].async('string');
              const matches = xml.match(/<a:t>([^<]*)<\/a:t>/g) || [];
              matches.forEach(m => { text += m.replace(/<\/?a:t>/g, '') + ' '; });
              text += '\n';
            }
            return { ok: true, name, ext, text: text.trim(), storedName };
          } catch (e) {
            // Fall back to base64 so the renderer can at least keep it as an attachment
            const buf = await file.arrayBuffer();
            const b64 = btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
            return { ok: true, name, ext, base64: b64, storedName };
          }
        }

        // .doc (legacy Word) — best-effort raw text extraction
        if (ext === '.doc') {
          const buf  = new Uint8Array(await file.arrayBuffer());
          let raw    = '';
          for (let i = 0; i < buf.length; i++) raw += String.fromCharCode(buf[i]);
          const text = raw.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s{3,}/g, '\n');
          return { ok: true, name, ext, text, storedName };
        }

        // CSV / TXT / fallback — read as text
        const text = await file.text();
        return { ok: true, name, ext, text, storedName };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    // ── Attachments via Supabase Storage ────────────────────────────────────
    pickAttachments: async () => {
      const files = await pickFiles({
        accept: '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.png,.jpg,.jpeg,.gif,.svg,.zip,.rar',
        multiple: true,
      });
      if (!files.length) return { ok: false };

      const { data: { user } } = await sb.auth.getUser();
      if (!user) return { ok: false, error: 'Not authenticated' };

      const results = [];
      for (const file of files) {
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const storedName = Date.now() + '_' + safe;
        const path = user.id + '/' + storedName;
        const { error } = await sb.storage.from('attachments').upload(path, file);
        if (!error) results.push({ name: file.name, storedName });
        else console.error('[shim pickAttachments] upload error:', error.message);
      }
      return { ok: true, files: results };
    },

    openAttachment: async (storedName) => {
      // Mirror the Electron-side path-traversal guard.
      if (typeof storedName !== 'string' || !storedName) {
        return { ok: false, error: 'Invalid name' };
      }
      if (storedName.includes('/') || storedName.includes('\\') || storedName.includes('..')) {
        return { ok: false, error: 'Invalid name' };
      }
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return { ok: false, error: 'Not authenticated' };

      const path = user.id + '/' + storedName;
      const { data, error } = await sb.storage.from('attachments').createSignedUrl(path, 60);
      if (error || !data?.signedUrl) {
        return { ok: false, error: error?.message || 'File not found' };
      }
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      return { ok: true };
    },

    // ── Open external URL (mirror Electron protocol allowlist) ──────────────
    openExternal: async (url) => {
      try {
        if (typeof url !== 'string') return { ok: false, error: 'Invalid URL' };
        let parsed;
        try { parsed = new URL(url); } catch { return { ok: false, error: 'Invalid URL' }; }
        const allowed = ['http:', 'https:', 'mailto:'];
        if (!allowed.includes(parsed.protocol)) {
          return { ok: false, error: 'URL scheme not allowed' };
        }
        window.open(parsed.toString(), '_blank', 'noopener,noreferrer');
        return { ok: true };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    // ── Audio transcription via /api/transcribe ─────────────────────────────
    transcribeAudio: async ({ base64, apiKey, mimeType }) => {
      try {
        const res = await fetch('/api/transcribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64, apiKey, mimeType }),
        });
        return await res.json();
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    // ── AI provider request via /api/ai-proxy ───────────────────────────────
    aiRequest: async (opts) => {
      try {
        const res = await fetch('/api/ai-proxy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(opts),
        });
        return await res.json();
      } catch (e) {
        return { ok: false, error: e.message };
      }
    },

    // ── Window focus — no-op in browser ─────────────────────────────────────
    refocusWindow: async () => ({ ok: true }),

    // ── Reset-data subscription (used by Electron menu) ─────────────────────
    // Web equivalent: store the callback. Caller can wire a UI button to
    // window.dispatchEvent(new Event('pmr-reset-data')) if they want to
    // expose it later.
    onResetData: (cb) => {
      _resetCallbacks.push(cb);
      window.addEventListener('pmr-reset-data', cb);
    },

    // ── Supabase REST proxies (now direct fetches) ──────────────────────────
    supaRequest: (opts) => supaFetchRaw(opts.path, opts.method, opts.body, opts.token),
    supaDb:      (opts) => supaDbFetchRaw(opts.path, opts.method, opts.body, opts.token),

    // ── Saved credentials ───────────────────────────────────────────────────
    // Electron uses safeStorage (OS keychain). The web equivalent is
    // Supabase's persistSession (already on by default — see createClient
    // above). These methods are kept as no-ops with the same response shape
    // so the renderer's "Remember me" code path doesn't error.
    saveCredentials:  async (_opts) => ({ ok: true }),
    loadCredentials:  async ()      => ({ ok: true, found: false }),
    clearCredentials: async ()      => ({ ok: true }),
  };

  console.log('[electronAPI shim] ready — running in browser mode');
})();
