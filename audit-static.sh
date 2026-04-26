#!/bin/bash
# ============================================================
# Roadmap OS — Layer 1: Static Code Audit
# ============================================================
# Uses Claude Code to grep the codebase and verify every fix
# from v1–v12 exists in the code. Produces AUDIT_STATIC.md.
# ============================================================

if [ ! -f "renderer/index.html" ]; then
  echo "❌ Run this from the pm-roadmapper repo root"
  exit 1
fi

echo "# Static Audit — $(date '+%Y-%m-%d %H:%M')" > AUDIT_STATIC.md

claude --dangerously-skip-permissions "You are a QA auditor for Roadmap OS. Your job: verify that every fix from v1–v12 is actually implemented in the codebase by running grep/search commands.

Read AUDIT_CHECKLIST.md first. Then for EVERY fix listed, run the STATIC check described. Record results as PASS or FAIL with evidence.

FORMAT your output in AUDIT_STATIC.md as:

## V1 Fixes
| Fix | Description | Check | Result | Evidence |
|-----|-------------|-------|--------|----------|
| V1-F1 | Initiative click-to-edit | onclick on roadmap rows opens edit | PASS/FAIL | grep output or line number |

METHODOLOGY:
1. For each fix, run the grep command specified in the STATIC column
2. If the grep finds the expected code: PASS
3. If the grep finds nothing or wrong code: FAIL
4. Record the exact grep output or line number as evidence
5. Move to next fix immediately — do NOT stop

SPECIFIC CHECKS TO RUN:

1. Emoji sweep: grep -Pc '[\x{1F300}-\x{1FAFF}]' renderer/index.html — MUST be 0
2. Hardcoded whites: grep -c 'background.*#fff\|background.*white' renderer/index.html
3. Template count: grep -c 'type.*platform' inside getDefaultTemplates function
4. CSS variable system: grep -c 'var(--' renderer/index.html — should be high (500+)
5. NavManager: grep -n 'NavManager\|const NavManager' renderer/index.html
6. Task library sync: grep -n 'syncTemplateTasksToLibrary' renderer/index.html
7. Today line: grep -n 'positionTodayLine' renderer/index.html
8. Archive: grep -n 'archiveInitiative\|currentData.archive' renderer/index.html
9. Watch: grep -n 'toggleWatch\|row.watchers' renderer/index.html
10. Comments: grep -n 'addComment.*row\|comment.*thread\|renderComments' renderer/index.html
11. Revenue field: grep -n 'revenue\|Revenue\|ROI' renderer/index.html | head -5
12. Labels: grep -n 'INITIATIVE_LABELS\|label-pill' renderer/index.html | head -5
13. Integration tables: ls supabase/migrations/*integration* 2>/dev/null
14. Integration functions: ls supabase/functions/integrations-* 2>/dev/null
15. Integrations page: grep -n 'integrations-page\|integrations-grid' renderer/index.html
16. Pages removed: grep -n 'UCR\|ucr-page' renderer/index.html — should be 0 or removed
17. Free trial: grep -c 'free trial\|Free Trial' renderer/index.html — should be minimal (0-1)
18. Select All: grep -n 'toggleAllCheckboxes\|selectAll\|select-all' renderer/index.html | head -10
19. Loading overlay: grep -n 'loading-overlay\|showLoadingOverlay' renderer/index.html | head -5
20. Onboarding: grep -n 'onboarding-step\|showOnboarding' renderer/index.html | head -5
21. Help widget: grep -n 'help-fab\|help-widget\|help.*float' renderer/index.html | head -5
22. Date range filter: grep -n 'dateRangeFilter\|date-range\|applyDateRangeFilter' renderer/index.html | head -5
23. Plan share: grep -n 'sharePlan\|plan.*share\|share.*plan' renderer/index.html | head -5
24. Team logo: grep -n 'team.*logo\|teamLogo\|uploadTeamLogo' renderer/index.html | head -5
25. Change log: grep -n 'changeLog\|logRoadmapChange' renderer/index.html | head -5

Run ALL 25 checks plus any others needed for the checklist items. Then at the end, produce a SUMMARY:

## Summary
- Total fixes checked: X
- PASS: X
- FAIL: X
- Pass rate: X%

### Critical Failures (must fix)
- list...

### Non-Critical (nice to have)
- list...

Write everything to AUDIT_STATIC.md. Begin now."
