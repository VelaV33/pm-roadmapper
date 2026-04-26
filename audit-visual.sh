#!/bin/bash
# ============================================================
# Roadmap OS — Layer 3: Visual Screenshot Audit
# ============================================================
# Takes screenshots of every page in light and dark mode,
# then analyzes for contrast issues, emoji, layout problems.
# ============================================================

if [ ! -f "renderer/index.html" ]; then
  echo "❌ Run this from the pm-roadmapper repo root"
  exit 1
fi

echo "# Visual Audit — $(date '+%Y-%m-%d %H:%M')" > AUDIT_VISUAL.md

claude --dangerously-skip-permissions "You are a visual QA auditor for Roadmap OS. Your job: take screenshots of every page in both light and dark mode, then analyze them for issues.

STEP 1: Create a Playwright screenshot script at tests/visual-audit.js:

\`\`\`javascript
const { chromium } = require('playwright');

const APP_URL = 'https://app.pmroadmapper.com';
const PAGES = [
  'dashboard', 'roadmap', 'plans', 'todo', 'checklist',
  'capacityiq', 'integrations', 'artefacts', 'settings',
  'prioritisation', 'reports', 'feedback'
];

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(APP_URL);
  // Login...
  await page.waitForTimeout(3000);

  const results = [];

  for (const pageName of PAGES) {
    try {
      // Navigate
      await page.evaluate((p) => {
        if (typeof showPage === 'function') showPage(p);
        else if (typeof NavManager !== 'undefined') NavManager.goTo(p);
      }, pageName);
      await page.waitForTimeout(1500);

      // Light mode screenshot
      await page.evaluate(() => {
        document.body.classList.remove('dark-mode');
        document.documentElement.classList.remove('dark-mode');
      });
      await page.waitForTimeout(300);
      await page.screenshot({ path: \`tests/screenshots/light-\${pageName}.png\`, fullPage: true });

      // Dark mode screenshot
      await page.evaluate(() => {
        document.body.classList.add('dark-mode');
        document.documentElement.classList.add('dark-mode');
      });
      await page.waitForTimeout(300);
      await page.screenshot({ path: \`tests/screenshots/dark-\${pageName}.png\`, fullPage: true });

      results.push({ page: pageName, status: 'captured' });
    } catch (err) {
      results.push({ page: pageName, status: 'error', error: err.message });
    }
  }

  // Write results
  const fs = require('fs');
  fs.writeFileSync('tests/screenshot-results.json', JSON.stringify(results, null, 2));

  await browser.close();
})();
\`\`\`

STEP 2: Run the screenshot script:
\`\`\`bash
mkdir -p tests/screenshots
node tests/visual-audit.js
\`\`\`

STEP 3: If screenshots were captured, view each one and analyze for:
- White backgrounds in dark mode (FAIL if found)
- Light text on light backgrounds in light mode (FAIL)
- Emoji visible anywhere (FAIL)
- Buttons cut off at top of toolbars (FAIL)
- Layout overflow / horizontal scrollbars where unexpected (FAIL)
- Missing SVG icons (blank spaces where icons should be)
- Loading spinners rendering correctly

STEP 4: If you CANNOT run Playwright (network restrictions), do a MANUAL visual audit by reading the CSS:
- grep for all background-color declarations without .dark-mode overrides
- grep for all color declarations that might be too light
- grep for any remaining emoji
- Check border-radius consistency on modals

STEP 5: Write results to AUDIT_VISUAL.md:

## Visual Audit Results

| Page | Light Mode | Dark Mode | Issues |
|------|-----------|-----------|--------|
| Dashboard | PASS/FAIL | PASS/FAIL | description |
| Roadmap | PASS/FAIL | PASS/FAIL | description |
| ... | ... | ... | ... |

### Screenshots
- Light mode: tests/screenshots/light-{page}.png
- Dark mode: tests/screenshots/dark-{page}.png

### Issues Found
1. ...
2. ...

### Summary
- Pages checked: X
- Light mode issues: X
- Dark mode issues: X
- Emoji found: X

Begin now."
