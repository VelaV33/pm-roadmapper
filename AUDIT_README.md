# Roadmap OS — Autonomous QA Audit System

## How This Works

This system has three automated layers that run sequentially:

1. **Static Audit** (`audit-static.sh`) — Claude Code greps the codebase to verify every fix from v1–v12 exists in the code. Takes ~5 minutes. Produces `AUDIT_STATIC.md`.

2. **E2E Test Suite** (`audit-e2e.sh`) — Claude Code generates and runs Playwright tests against the live web app. Clicks every button, navigates every page, checks dark mode, verifies elements. Takes ~15-20 minutes. Produces `AUDIT_E2E.md`.

3. **Visual Review** (`audit-visual.sh`) — Claude Code takes screenshots of every page in both light and dark mode, then analyzes them for contrast issues, emoji presence, layout problems. Takes ~10 minutes. Produces `AUDIT_VISUAL.md`.

**Final output:** `AUDIT_REPORT.md` — a consolidated pass/fail report across all three layers with specific line items for every fix from v1–v12.

---

## Quick Start

```bash
# From your pm-roadmapper repo root:

# Run all three layers in sequence:
bash audit-all.sh

# Or run individually:
bash audit-static.sh    # Layer 1: Code verification
bash audit-e2e.sh       # Layer 2: Browser tests
bash audit-visual.sh    # Layer 3: Visual review
```

---

## Prerequisites

```bash
# Install Playwright (one-time setup)
npm install -D playwright @playwright/test
npx playwright install chromium

# Ensure the web app is deployed and accessible
# at https://app.pmroadmapper.com (or localhost for testing)
```
