#!/bin/bash
# ============================================================
# Roadmap OS — Continuous QA Loop
# ============================================================
# Runs the full cycle: audit → fix → re-audit → repeat
# until all checks pass or max iterations reached.
#
# This is the "AI factory" mode — deploy and walk away.
#
# Usage: bash audit-loop.sh
# ============================================================

if [ ! -f "renderer/index.html" ]; then
  echo "❌ Run this from the pm-roadmapper repo root"
  exit 1
fi

MAX_ITERATIONS=3
ITERATION=0

echo "=============================================="
echo "  Roadmap OS — Continuous QA Loop"
echo "  Max iterations: $MAX_ITERATIONS"
echo "  Started: $(date '+%Y-%m-%d %H:%M')"
echo "=============================================="

while [ $ITERATION -lt $MAX_ITERATIONS ]; do
  ITERATION=$((ITERATION + 1))
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  ITERATION $ITERATION of $MAX_ITERATIONS"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Step 1: Run the audit
  echo "▸ Running full audit..."
  bash audit-all.sh

  # Step 2: Check if there are any failures
  FAIL_COUNT=$(grep -c "FAIL" AUDIT_REPORT.md 2>/dev/null || echo "0")
  echo "  Failures found: $FAIL_COUNT"

  if [ "$FAIL_COUNT" -eq 0 ] || [ "$FAIL_COUNT" = "0" ]; then
    echo ""
    echo "=============================================="
    echo "  ✅ ALL CHECKS PASSED"
    echo "  Iterations needed: $ITERATION"
    echo "  Completed: $(date '+%Y-%m-%d %H:%M')"
    echo "=============================================="
    exit 0
  fi

  # Step 3: Run auto-remediation
  echo "▸ Running auto-remediation for $FAIL_COUNT failures..."
  bash audit-fix.sh

  # Archive this iteration's reports
  mkdir -p audit-history/iteration-$ITERATION
  cp AUDIT_STATIC.md AUDIT_E2E.md AUDIT_VISUAL.md AUDIT_REPORT.md REMEDIATION_LOG.md \
     audit-history/iteration-$ITERATION/ 2>/dev/null

  echo "  ✓ Iteration $ITERATION complete. Reports archived to audit-history/iteration-$ITERATION/"
done

echo ""
echo "=============================================="
echo "  ⚠️  MAX ITERATIONS REACHED ($MAX_ITERATIONS)"
echo "  Some failures may remain."
echo "  Check AUDIT_REPORT.md for details."
echo "  Completed: $(date '+%Y-%m-%d %H:%M')"
echo "=============================================="

# Final summary
claude --dangerously-skip-permissions "Read all reports in audit-history/ directories (iteration-1, iteration-2, iteration-3). Produce a FINAL_QA_SUMMARY.md that shows:
1. What passed on each iteration
2. What was fixed between iterations
3. What still fails (if anything)
4. Whether the app is ready for release
5. Any manual testing required

Be specific and actionable. This is the final document the product owner reads.
Write to FINAL_QA_SUMMARY.md."
