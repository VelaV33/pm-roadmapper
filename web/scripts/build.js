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

// 3. Inject the shim script tag immediately after <head>. Must load BEFORE
//    any of the renderer's own scripts so window.electronAPI is defined when
//    the renderer first looks for it.
const injection =
  '\n  <!-- web build: electronAPI shim — must load before all renderer scripts -->\n' +
  '  <script src="/shim/supabase.min.js"></script>\n' +
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

// 6. Copy the shim folder into public/shim so it's served at /shim/...
const shimDest = path.join(publicDir, 'shim');
fs.mkdirSync(shimDest, { recursive: true });
for (const f of fs.readdirSync(shimDir)) {
  fs.copyFileSync(path.join(shimDir, f), path.join(shimDest, f));
}

console.log('[web build] OK — public/ written');
console.log('[web build]   index.html: ' + (html.length / 1024).toFixed(1) + ' KB');
console.log('[web build]   vendor/:    ' + fs.readdirSync(vendorDest).length + ' files');
console.log('[web build]   shim/:      ' + fs.readdirSync(shimDest).length + ' files');
