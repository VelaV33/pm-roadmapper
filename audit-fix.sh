#!/bin/bash
# ============================================================
# Roadmap OS — Auto-Remediation Runner
# ============================================================
# Reads AUDIT_REPORT.md, identifies all FAIL items,
# generates fix code, and applies them autonomously.
# Run this AFTER audit-all.sh completes.
#
# Usage: bash audit-fix.sh
# ============================================================

if [ ! -f "AUDIT_REPORT.md" ]; then
  echo "❌ AUDIT_REPORT.md not found. Run audit-all.sh first."
  exit 1
fi

echo "# Auto-Remediation Log — $(date '+%Y-%m-%d %H:%M')" > REMEDIATION_LOG.md

claude --dangerously-skip-permissions "You are a senior engineer fixing all issues found in the QA audit. Read AUDIT_REPORT.md and identify every item marked as FAIL.

For each FAIL item:
1. Read the specific failure description and evidence
2. Find the relevant code in renderer/index.html (or main.js, web/shim/electronAPI.js, or edge functions)
3. Implement the fix
4. Verify the fix by running the same grep/check that found the failure
5. Log the fix in REMEDIATION_LOG.md
6. Move to the next failure immediately

RULES:
- Do NOT ask questions. Fix everything autonomously.
- Do NOT skip any FAIL item. Fix them all.
- After all fixes: bump version, rebuild web (cd web && npm run build), commit.
- If a fix requires backend changes (Supabase secrets, OAuth config), implement the frontend and log the backend requirement.
- Preserve existing patterns. Match codebase style.
- Dark mode CSS variables. Zero emoji. SVG icons only.

After fixing all items, run the static audit checks again to verify:
1. grep -Pc '[\x{1F300}-\x{1FAFF}]' renderer/index.html — must be 0
2. node -e \"require('fs').readFileSync('renderer/index.html','utf8')\" && echo 'OK'
3. Any other checks that previously failed

Write a summary in REMEDIATION_LOG.md:
## Summary
- Total failures from audit: X
- Fixed: X
- Remaining (blocked): X
- New version: X.Y.Z

Begin now. Read AUDIT_REPORT.md first."
