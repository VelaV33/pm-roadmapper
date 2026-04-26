#!/bin/bash
# ============================================================
# Roadmap OS — Full Autonomous QA Audit
# ============================================================
# Runs all 3 audit layers in sequence and produces a
# consolidated AUDIT_REPORT.md
#
# Usage: bash audit-all.sh
# ============================================================

if [ ! -f "renderer/index.html" ]; then
  echo "❌ Run this from the pm-roadmapper repo root"
  exit 1
fi

echo "=============================================="
echo "  Roadmap OS — Full QA Audit"
echo "  $(date '+%Y-%m-%d %H:%M')"
echo "=============================================="
echo ""

# Create screenshots directory
mkdir -p tests/screenshots

# ---- Layer 1: Static Code Audit ----
echo "▸ Layer 1: Static Code Audit..."
bash audit-static.sh
echo "  ✓ Static audit complete → AUDIT_STATIC.md"
echo ""

# ---- Layer 2: E2E Browser Tests ----
echo "▸ Layer 2: E2E Browser Tests..."
bash audit-e2e.sh
echo "  ✓ E2E audit complete → AUDIT_E2E.md"
echo ""

# ---- Layer 3: Visual Screenshot Review ----
echo "▸ Layer 3: Visual Screenshot Review..."
bash audit-visual.sh
echo "  ✓ Visual audit complete → AUDIT_VISUAL.md"
echo ""

# ---- Consolidate Reports ----
echo "▸ Consolidating reports..."

claude --dangerously-skip-permissions "You are the QA lead for Roadmap OS. Three audit reports have been generated:
1. AUDIT_STATIC.md — code-level verification
2. AUDIT_E2E.md — browser-level functional tests
3. AUDIT_VISUAL.md — visual/design verification

Read all three reports. Then produce a consolidated AUDIT_REPORT.md with:

## Executive Summary
- Total fixes audited: 132 (v1–v12)
- Overall pass rate: X%
- Critical failures: X
- Non-critical issues: X

## Status by Version
| Version | Fixes | Pass | Fail | Skip | Rate |
|---------|-------|------|------|------|------|
| v1 | 16 | X | X | X | X% |
| v2 | 16 | X | X | X | X% |
| ... | ... | ... | ... | ... | ... |
| v12 | 9 | X | X | X | X% |
| **Total** | **132** | **X** | **X** | **X** | **X%** |

## Critical Failures (Must Fix Before Release)
List each failed fix with:
- Fix ID
- What was expected
- What was found
- Suggested remediation

## Non-Critical Issues (Fix in Next Sprint)
Same format.

## Working Features (Verified)
List the major features that passed all 3 layers.

## Recommendations
1. Which fixes to prioritise for remediation
2. Whether another fix batch is needed
3. Any architectural concerns discovered during audit

Write this to AUDIT_REPORT.md. Be specific, cite evidence from the audit reports, and make it actionable.

Begin now."

echo ""
echo "=============================================="
echo "  AUDIT COMPLETE"
echo "=============================================="
echo ""
echo "  Reports generated:"
echo "    • AUDIT_STATIC.md  — Code verification"
echo "    • AUDIT_E2E.md     — Browser tests"
echo "    • AUDIT_VISUAL.md  — Visual review"
echo "    • AUDIT_REPORT.md  — Consolidated report"
echo ""
echo "  Screenshots: tests/screenshots/"
echo ""
echo "  Open AUDIT_REPORT.md for the executive summary."
echo "=============================================="
