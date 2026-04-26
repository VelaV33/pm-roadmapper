#!/bin/bash
# ============================================================
# Roadmap OS — Layer 2: E2E Browser Audit
# ============================================================
# Uses Claude Code to generate Playwright tests, run them
# against the live web app, and produce AUDIT_E2E.md.
# ============================================================

if [ ! -f "renderer/index.html" ]; then
  echo "❌ Run this from the pm-roadmapper repo root"
  exit 1
fi

# Ensure Playwright is installed
if ! command -v npx &> /dev/null; then
  echo "❌ npx not found. Install Node.js first."
  exit 1
fi

# Install Playwright if not present
if [ ! -d "node_modules/playwright" ]; then
  echo "Installing Playwright..."
  npm install -D playwright @playwright/test
  npx playwright install chromium
fi

echo "# E2E Audit — $(date '+%Y-%m-%d %H:%M')" > AUDIT_E2E.md

claude --dangerously-skip-permissions "You are a QA automation engineer for Roadmap OS. Your job: write and run Playwright E2E tests to verify every fix from v1–v12 works in the live web app.

Read AUDIT_CHECKLIST.md first. Then:

STEP 1: Create a Playwright test file at tests/audit.spec.js that tests every E2E check in the checklist.

The web app is at: https://app.pmroadmapper.com
Test credentials: Use the existing test account or create one during the test.

IMPORTANT: The app is a single-page app. Navigation happens via showPage() which updates #hash. Playwright should:
- Wait for elements with waitForSelector
- Use page.locator() for finding elements
- Take screenshots on failures
- Use appropriate timeouts (the app loads data from Supabase)

STEP 2: Write the test file:

\`\`\`javascript
// tests/audit.spec.js
const { test, expect } = require('@playwright/test');

const APP_URL = 'https://app.pmroadmapper.com';
const TEST_EMAIL = process.env.TEST_EMAIL || 'test@example.com';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'testpassword123';

test.describe('Roadmap OS — Full Audit v1-v12', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(APP_URL);
    // Login if needed
    // ... check if already logged in, if not, login
  });

  // ===== NAVIGATION =====
  test('Nav: All top nav items exist and route correctly', async ({ page }) => {
    const navItems = ['dashboard', 'roadmap', 'plans', 'todo', 'checklist', 'capacityiq', 'integrations'];
    for (const item of navItems) {
      const btn = page.locator(\`[data-page=\"\${item}\"], [onclick*=\"'\${item}'\"]\`).first();
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(500);
        // Verify page rendered
      }
    }
  });

  test('Nav: Browser back button works', async ({ page }) => {
    // Navigate: Dashboard → Plans → Roadmap
    await page.click('[data-page=\"dashboard\"], [onclick*=\"dashboard\"]');
    await page.waitForTimeout(500);
    await page.click('[data-page=\"plans\"], [onclick*=\"plans\"]');
    await page.waitForTimeout(500);
    await page.click('[data-page=\"roadmap\"], [onclick*=\"roadmap\"]');
    await page.waitForTimeout(500);

    // Back should go to Plans
    await page.goBack();
    await page.waitForTimeout(500);
    // Verify we're on Plans (not login)
    const url = page.url();
    expect(url).not.toContain('login');
    expect(url).not.toContain('signup');
  });

  test('Nav: Sidebar closes on page click (mobile/web)', async ({ page }) => {
    // Open sidebar if it has a toggle
    const toggle = page.locator('.burger-menu, .hamburger, .sidebar-toggle').first();
    if (await toggle.isVisible()) {
      await toggle.click();
      await page.waitForTimeout(300);
      // Click a nav item
      await page.click('[data-page=\"plans\"], [onclick*=\"plans\"]');
      await page.waitForTimeout(300);
      // Sidebar should be closed
      const sidebar = page.locator('.sidebar, #sidebar, .nav-menu');
      // Check if sidebar is not visible or not in 'open' state
    }
  });

  // ===== DARK MODE =====
  test('Dark mode: No white backgrounds on any page', async ({ page }) => {
    // Toggle dark mode
    // Navigate to each major page and screenshot
    const pages = ['dashboard', 'roadmap', 'plans', 'todo', 'checklist', 'capacityiq'];
    for (const p of pages) {
      await page.click(\`[data-page=\"\${p}\"], [onclick*=\"'\${p}'\"]\`);
      await page.waitForTimeout(500);
      await page.screenshot({ path: \`tests/screenshots/dark-\${p}.png\` });
    }
  });

  // ===== EMOJI CHECK =====
  test('No emoji visible on any page', async ({ page }) => {
    const pages = ['dashboard', 'roadmap', 'plans', 'todo', 'checklist'];
    for (const p of pages) {
      await page.click(\`[data-page=\"\${p}\"], [onclick*=\"'\${p}'\"]\`);
      await page.waitForTimeout(500);
      // Check page text for emoji
      const text = await page.textContent('body');
      const emojiRegex = /[\u{1F300}-\u{1FAFF}]/u;
      expect(emojiRegex.test(text)).toBe(false);
    }
  });

  // ===== ROADMAP =====
  test('Roadmap: Today line positioned correctly', async ({ page }) => {
    await page.click('[data-page=\"roadmap\"], [onclick*=\"roadmap\"]');
    await page.waitForTimeout(1000);
    const todayLine = page.locator('#today-line, .today-line, .today-marker');
    if (await todayLine.isVisible()) {
      const box = await todayLine.boundingBox();
      // Should NOT be at far left (x > 50px at minimum)
      expect(box.x).toBeGreaterThan(50);
    }
  });

  test('Roadmap: Add Product button exists (not Add Row)', async ({ page }) => {
    await page.click('[data-page=\"roadmap\"], [onclick*=\"roadmap\"]');
    await page.waitForTimeout(500);
    const addProduct = page.locator('text=Add Product').first();
    const addRow = page.locator('text=Add Row').first();
    // Add Product should exist, Add Row should not
  });

  // ===== INITIATIVES =====
  test('Initiative: Edit modal has revenue, labels, owner, comments', async ({ page }) => {
    await page.click('[data-page=\"roadmap\"], [onclick*=\"roadmap\"]');
    await page.waitForTimeout(1000);
    // Click on an initiative to edit
    // ... find a row and click it or click three-dot menu → Edit
    // Check for fields
  });

  test('Initiative: Three-dot menu has Duplicate, Archive, Watch', async ({ page }) => {
    // Find a row's three-dot menu and click
    // Check for menu items
  });

  // ===== PLANS =====
  test('Plans: Share button exists', async ({ page }) => {
    await page.click('[data-page=\"plans\"], [onclick*=\"plans\"]');
    await page.waitForTimeout(500);
    const shareBtn = page.locator('text=Share, button:has-text(\"Share\")').first();
  });

  test('Plans: Follow eye button exists', async ({ page }) => {
    // Check for eye/follow button on Plans page
  });

  // ===== TEMPLATES =====
  test('Templates: 10+ platform templates exist', async ({ page }) => {
    // Navigate to Templates page
    // Count template cards
  });

  // ===== CAPACITY IQ =====
  test('CIQ: Dashboard has team capacity section', async ({ page }) => {
    await page.click('[data-page=\"capacityiq\"], [onclick*=\"capacityiq\"]');
    await page.waitForTimeout(1000);
    // Check for team capacity cards
  });

  test('CIQ: Templates page has 10+ templates (not just 2)', async ({ page }) => {
    // Navigate to CIQ templates
    // Count template cards — should be > 2
  });

  // ===== INTEGRATIONS =====
  test('Integrations page: 5 integration cards render', async ({ page }) => {
    await page.click('[data-page=\"integrations\"], [onclick*=\"integrations\"]');
    await page.waitForTimeout(500);
    // Count integration cards
  });

  // ===== HELP WIDGET =====
  test('Help widget: Floating button in bottom-right', async ({ page }) => {
    const helpBtn = page.locator('.help-fab, #help-widget, .help-fab-button');
    await expect(helpBtn.first()).toBeVisible();
  });

  // ===== LOADING SPINNER =====
  test('Loading spinner exists', async ({ page }) => {
    const overlay = page.locator('#loading-overlay');
    // Should exist in DOM (even if hidden)
    await expect(overlay).toHaveCount(1);
  });

  // ===== SELECT ALL =====
  test('Select All: exists on task add modals', async ({ page }) => {
    // Navigate to Plans → Add Task → check for Select All checkbox
  });

});
\`\`\`

STEP 3: Run the tests:
\`\`\`bash
mkdir -p tests/screenshots
npx playwright test tests/audit.spec.js --reporter=list 2>&1 | tee tests/audit-results.txt
\`\`\`

STEP 4: Parse the results and write AUDIT_E2E.md:
- For each test: PASS or FAIL with the error message
- Attach screenshot paths for visual failures
- Summary at the bottom with pass/fail counts

STEP 5: If tests fail because the app requires login, create a login helper:
\`\`\`javascript
async function login(page) {
  await page.goto(APP_URL);
  await page.waitForTimeout(2000);
  // Check if already logged in
  const isLoggedIn = await page.locator('.dashboard, .roadmap-page, [data-page]').first().isVisible().catch(() => false);
  if (isLoggedIn) return;
  // Enter credentials
  await page.fill('input[type=\"email\"]', TEST_EMAIL);
  await page.fill('input[type=\"password\"]', TEST_PASSWORD);
  await page.click('button[type=\"submit\"], button:has-text(\"Login\"), button:has-text(\"Sign In\")');
  await page.waitForTimeout(3000);
}
\`\`\`

NOTE: If you cannot access the live web app (network issues), create the test file anyway and document that it needs to be run manually. Write the test structure and expected results in AUDIT_E2E.md.

Begin now. Read AUDIT_CHECKLIST.md first."
