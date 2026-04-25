// ════════════════════════════════════════════════════════════════════════════
// web build script
//
// Copies the Electron renderer into web/public/ and prepends a <script> tag
// for the electronAPI shim, so the unmodified renderer runs in the browser.
//
// This script is the ONLY place that touches files outside web/. It reads
// from ../renderer/ and ../preload.js but never writes outside web/public/.
// ════════════════════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');

const root        = path.resolve(__dirname, '..', '..');           // netstar-roadmap-app/
const webDir      = path.resolve(__dirname, '..');                  // netstar-roadmap-app/web/
const rendererSrc = path.join(root, 'renderer', 'index.html');
const vendorSrc   = path.join(root, 'renderer', 'vendor');
const publicDir   = path.join(webDir, 'public');
const shimDir     = path.join(webDir, 'shim');

// 1. Make sure public/ exists and is empty.
fs.rmSync(publicDir, { recursive: true, force: true });
fs.mkdirSync(publicDir, { recursive: true });

// 2. Read the renderer.
let html = fs.readFileSync(rendererSrc, 'utf-8');

// 3. Inject script tags immediately after <head>. Must load BEFORE the
//    renderer's own scripts so window.electronAPI is defined when the
//    renderer first looks for it.
//
//    EVERYTHING is vendored from node_modules and served from /shim/. The
//    renderer's CSP uses script-src 'self' which would block any CDN URL,
//    so vendoring is mandatory, not an optimisation.
//
//    Loaded eagerly:
//      • /shim/supabase.js  — every shim method that talks to the DB needs it
//      • /shim/electronAPI.js
//
//    Loaded on-demand by the shim's readFile() (so they don't bloat cold
//    start, but are cached after first use):
//      • /shim/pdf.min.js + pdf.worker.min.js — PDF text extraction
//      • /shim/mammoth.browser.min.js         — DOCX text extraction
//      • /shim/jszip.min.js                   — PPTX XML extraction
const injection =
  '\n  <!-- web build: electronAPI shim — must load before all renderer scripts -->\n' +
  '  <script src="/shim/supabase.js"></script>\n' +
  '  <script src="/shim/electronAPI.js"></script>\n';

if (!html.includes('<head>')) {
  throw new Error('Renderer index.html has no <head> tag — aborting build');
}
html = html.replace('<head>', '<head>' + injection);

// 4. Write the patched renderer.
fs.writeFileSync(path.join(publicDir, 'index.html'), html, 'utf-8');

// 5. Copy renderer/vendor (xlsx, pptxgen) verbatim — they already work in
//    the browser. Path stays /vendor/... so the renderer's existing
//    <script src="vendor/..."> tags resolve.
const vendorDest = path.join(publicDir, 'vendor');
fs.mkdirSync(vendorDest, { recursive: true });
for (const f of fs.readdirSync(vendorSrc)) {
  fs.copyFileSync(path.join(vendorSrc, f), path.join(vendorDest, f));
}

// 6. Copy the shim folder + vendored libraries from node_modules into
//    public/shim so they're served from 'self' and pass the renderer's CSP.
const shimDest    = path.join(publicDir, 'shim');
const nodeModules = path.join(webDir, 'node_modules');
fs.mkdirSync(shimDest, { recursive: true });

// 6a. shim/electronAPI.js (the entrypoint)
for (const f of fs.readdirSync(shimDir)) {
  fs.copyFileSync(path.join(shimDir, f), path.join(shimDest, f));
}

// 6b. Vendored libraries. Each entry: [src in node_modules, dest filename].
//     Hard fail if any are missing — easier to spot than a runtime CSP block.
const vendored = [
  ['@supabase/supabase-js/dist/umd/supabase.js', 'supabase.js'],
  ['pdfjs-dist/build/pdf.min.js',                'pdf.min.js'],
  ['pdfjs-dist/build/pdf.worker.min.js',         'pdf.worker.min.js'],
  ['mammoth/mammoth.browser.min.js',             'mammoth.browser.min.js'],
  ['jszip/dist/jszip.min.js',                    'jszip.min.js'],
];
for (const [src, dest] of vendored) {
  const fullSrc = path.join(nodeModules, src);
  if (!fs.existsSync(fullSrc)) {
    throw new Error('[web build] Missing vendored lib: ' + src + '\n' +
                    '  Did you run "npm install" in web/?');
  }
  fs.copyFileSync(fullSrc, path.join(shimDest, dest));
}

// 7. Copy committed static files (privacy.html etc.) from web/static/ into
//    public/ at the root. These are NOT processed — they ship as-is. Skipped
//    silently if web/static/ doesn't exist (no static files yet is fine).
const staticDir = path.join(webDir, 'static');
let staticCount = 0;
if (fs.existsSync(staticDir)) {
  for (const f of fs.readdirSync(staticDir)) {
    const fullSrc = path.join(staticDir, f);
    const stat = fs.statSync(fullSrc);
    if (stat.isFile()) {
      fs.copyFileSync(fullSrc, path.join(publicDir, f));
      staticCount++;
    }
  }
}

// 8. Copy data/ directory (template JSON files etc.) into public/data/.
const dataSrc  = path.join(root, 'data');
const dataDest = path.join(publicDir, 'data');
let dataCount  = 0;
if (fs.existsSync(dataSrc)) {
  fs.mkdirSync(dataDest, { recursive: true });
  for (const f of fs.readdirSync(dataSrc)) {
    const fullSrc = path.join(dataSrc, f);
    const stat = fs.statSync(fullSrc);
    if (stat.isFile()) {
      fs.copyFileSync(fullSrc, path.join(dataDest, f));
      dataCount++;
    }
  }
}

// 9. Copy CHANGELOG.md into public/ so the in-app What's New modal and the
//    marketing site /changelog page can fetch it from the same origin.
const changelogSrc  = path.join(root, 'CHANGELOG.md');
const changelogDest = path.join(publicDir, 'CHANGELOG.md');
let changelogCopied = false;
if (fs.existsSync(changelogSrc)) {
  fs.copyFileSync(changelogSrc, changelogDest);
  changelogCopied = true;
}

console.log('[web build] OK — public/ written');
console.log('[web build]   index.html: ' + (html.length / 1024).toFixed(1) + ' KB');
console.log('[web build]   vendor/:    ' + fs.readdirSync(vendorDest).length + ' files');
console.log('[web build]   shim/:      ' + fs.readdirSync(shimDest).length + ' files');
console.log('[web build]   static/:    ' + staticCount + ' files');
console.log('[web build]   data/:      ' + dataCount + ' files');
console.log('[web build]   CHANGELOG.md: ' + (changelogCopied ? 'copied' : 'missing'));
