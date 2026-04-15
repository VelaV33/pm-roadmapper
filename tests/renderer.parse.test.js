#!/usr/bin/env node
// ══════════════════════════════════════════════════════════════════════════════
// renderer.parse.test.js — v1.33.0
//
// Extracts every inline <script> block from renderer/index.html and parses
// each with the V8 parser (via new vm.Script). Any syntax error in the
// renderer will fail here before a user ever sees a blank app.
//
// This is cheap insurance against hand-editing a 26k-line file: if a brace
// went missing, you find out from `node tests/renderer.parse.test.js`
// instead of from a user's bug report.
// ══════════════════════════════════════════════════════════════════════════════

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const rendererPath = path.resolve(__dirname, '..', 'renderer', 'index.html');
const html = fs.readFileSync(rendererPath, 'utf-8');

// Strip scripts that declare a src="..." attribute — we only want inline JS.
const scriptRe = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;

let blockIdx = 0, totalBytes = 0, failures = 0;
let m;
while ((m = scriptRe.exec(html)) !== null) {
  blockIdx++;
  const src = m[1];
  // Skip JSON and blank blocks.
  if (!src.trim()) continue;
  // Skip obvious non-JS content types.
  const openTag = html.slice(m.index, m.index + 60);
  if (/type="application\/json"/.test(openTag)) continue;
  if (/type="text\/template"/.test(openTag))    continue;

  totalBytes += src.length;
  try {
    // new vm.Script compiles without running — cheap full parse.
    new vm.Script(src, { filename: 'renderer.block' + blockIdx + '.js' });
  } catch (e) {
    failures++;
    console.log('  FAIL block ' + blockIdx + ' — ' + e.message);
    // Locate approximate line in source file for easier debugging.
    const before = html.slice(0, m.index);
    const lineNo = before.split('\n').length;
    console.log('         starts ~line ' + lineNo + ' of renderer/index.html');
  }
}

console.log('\n── Renderer parse check ──');
console.log('  blocks scanned:  ' + blockIdx);
console.log('  total JS bytes:  ' + (totalBytes / 1024).toFixed(1) + ' KB');
console.log('  failures:        ' + failures);
process.exit(failures === 0 ? 0 : 1);
