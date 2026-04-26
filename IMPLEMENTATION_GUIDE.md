# Roadmap OS — Complete Implementation Guide
## (Read this top to bottom. Do exactly what it says. Don't skip anything.)

---

## PHASE 0: BEFORE YOU START

### What you need:
- Your MacBook with Claude Code installed
- Terminal open
- Internet connection
- About 2-3 hours for the first run (you can walk away after launching each batch)

### Check Claude Code is installed:
```bash
claude --version
```
If this errors, install Claude Code first:
```bash
npm install -g @anthropic-ai/claude-code
```

### Check you're logged into Claude Code:
```bash
claude --print-auth
```
If not logged in, run:
```bash
claude login
```

---

## PHASE 1: SET UP YOUR WORKSPACE

### Step 1.1 — Open Terminal and go to your repo
```bash
cd ~/path-to/pm-roadmapper
```
Replace `~/path-to/pm-roadmapper` with wherever your actual repo lives. For example it might be:
```bash
cd ~/Documents/pm-roadmapper
```
or
```bash
cd ~/Projects/pm-roadmapper
```

**How to check you're in the right folder:**
```bash
ls renderer/index.html
```
If it says `renderer/index.html` — you're in the right place.
If it says `No such file or directory` — you're in the wrong folder. Find the right one.

### Step 1.2 — Make sure you're on the right git branch
```bash
git branch
```
You should see `* main` or `* develop` (whichever you work on).

If you want to create a fresh branch for all this work:
```bash
git checkout -b feature/v1-v12-fixes
```

### Step 1.3 — Pull the latest code
```bash
git pull origin main
```
(or `develop` — whatever your main branch is)

### Step 1.4 — Create a folder for all the downloaded files
On your Mac, create a folder on your Desktop called `roadmap-fixes`:
```bash
mkdir -p ~/Desktop/roadmap-fixes
```

---

## PHASE 2: DOWNLOAD ALL FILES FROM THIS CONVERSATION

### Step 2.1 — Download every file from this chat

Go back through our conversation and download these files. Save them ALL to `~/Desktop/roadmap-fixes/`:

**Fix queue files (12 total):**
1. `ROADMAP_OS_FIXES.md` (v1)
2. `run-fixes.sh` (v1)
3. `CLAUDE.md`
4. `ROADMAP_OS_FIXES_V2.md`
5. `run-fixes-v2.sh`
6. `ROADMAP_OS_FIXES_V3.md`
7. `run-fixes-v3.sh`
8. `ROADMAP_OS_FIXES_V4.md`
9. `run-fixes-v4.sh`
10. `ROADMAP_OS_FIXES_V5.md`
11. `run-fixes-v5.sh`
12. `ROADMAP_OS_FIXES_V6.md`
13. `run-fixes-v6.sh`
14. `ROADMAP_OS_FIXES_V7.md`
15. `run-fixes-v7.sh`
16. `ROADMAP_OS_FIXES_V8.md`
17. `run-fixes-v8.sh`
18. `ROADMAP_OS_FIXES_V9.md`
19. `run-fixes-v9.sh`
20. `ROADMAP_OS_FIXES_V10.md`
21. `run-fixes-v10.sh`
22. `ROADMAP_OS_FIXES_V11.md`
23. `run-fixes-v11.sh`
24. `ROADMAP_OS_FIXES_V12.md`
25. `run-fixes-v12.sh`

**Audit files (8 total):**
26. `AUDIT_README.md`
27. `AUDIT_CHECKLIST.md`
28. `audit-static.sh`
29. `audit-e2e.sh`
30. `audit-visual.sh`
31. `audit-all.sh`
32. `audit-fix.sh`
33. `audit-loop.sh`

### Step 2.2 — Verify you have all the files
```bash
ls ~/Desktop/roadmap-fixes/
```
You should see all 33 files. Count them:
```bash
ls ~/Desktop/roadmap-fixes/ | wc -l
```
Should say 33 (or close — the exact count depends on whether you downloaded CLAUDE.md once or twice).

---

## PHASE 3: COPY FILES INTO YOUR REPO

### Step 3.1 — Copy the CLAUDE.md file (this goes in your repo permanently)
```bash
cp ~/Desktop/roadmap-fixes/CLAUDE.md ~/path-to/pm-roadmapper/CLAUDE.md
```

**What this does:** CLAUDE.md is read automatically by Claude Code every time it runs in your repo. It gives Claude Code persistent context about the project architecture, coding standards, and design rules.

### Step 3.2 — Copy ALL fix queue files into your repo
```bash
cp ~/Desktop/roadmap-fixes/ROADMAP_OS_FIXES*.md ~/path-to/pm-roadmapper/
cp ~/Desktop/roadmap-fixes/run-fixes*.sh ~/path-to/pm-roadmapper/
```

### Step 3.3 — Copy ALL audit files into your repo
```bash
cp ~/Desktop/roadmap-fixes/AUDIT_*.md ~/path-to/pm-roadmapper/
cp ~/Desktop/roadmap-fixes/audit-*.sh ~/path-to/pm-roadmapper/
```

### Step 3.4 — Verify everything is in place
```bash
cd ~/path-to/pm-roadmapper
ls *.md *.sh
```
You should see CLAUDE.md, all the ROADMAP_OS_FIXES files, all the run-fixes scripts, all the audit files.

---

## PHASE 4: RUN THE FIX QUEUES (v1 through v12)

**IMPORTANT:** You run these ONE AT A TIME, in order. Each one takes 30-90 minutes depending on the fix count. You CAN walk away — Claude Code runs autonomously. But wait for each one to finish before starting the next.

**How to know when one is done:** Claude Code will print its final message and return you to the terminal prompt (`$`). You'll also see a `FIX_LOG*.md` file created.

### Step 4.1 — Run v1 (16 fixes)
```bash
cd ~/path-to/pm-roadmapper
bash run-fixes.sh
```

**What happens:**
- Claude Code starts
- It reads ROADMAP_OS_FIXES.md and CLAUDE.md
- It works through all 16 fixes
- It logs everything to FIX_LOG.md
- When done, you get your terminal prompt back

**Walk away. Come back when it's done.**

**When it finishes, check:**
```bash
cat FIX_LOG.md
```
This shows what Claude Code did for each fix.

### Step 4.2 — Run v2 (16 fixes)
```bash
bash run-fixes-v2.sh
```
Wait for it to finish. Check `FIX_LOG_V2.md` when done.

### Step 4.3 — Run v3 (20 fixes)
```bash
bash run-fixes-v3.sh
```
Wait. Check `FIX_LOG_V3.md`.

### Step 4.4 — Run v4 (8 fixes)
```bash
bash run-fixes-v4.sh
```
Wait. Check `FIX_LOG_V4.md`.

### Step 4.5 — Run v5 (10 fixes)
```bash
bash run-fixes-v5.sh
```
Wait. Check `FIX_LOG_V5.md`.

### Step 4.6 — Run v6 (9 fixes)
```bash
bash run-fixes-v6.sh
```
Wait. Check `FIX_LOG_V6.md`.

### Step 4.7 — Run v7 (6 fixes)
```bash
bash run-fixes-v7.sh
```
Wait. Check `FIX_LOG_V7.md`.

### Step 4.8 — Run v8 (9 fixes)
```bash
bash run-fixes-v8.sh
```
Wait. Check `FIX_LOG_V8.md`.

### Step 4.9 — Run v9 (11 fixes)
```bash
bash run-fixes-v9.sh
```
Wait. Check `FIX_LOG_V9.md`.

### Step 4.10 — Run v10 (8 fixes — integrations)
```bash
bash run-fixes-v10.sh
```
Wait. Check `FIX_LOG_V10.md`.

### Step 4.11 — Run v11 (9 fixes)
```bash
bash run-fixes-v11.sh
```
Wait. Check `FIX_LOG_V11.md`.

### Step 4.12 — Run v12 (9 fixes)
```bash
bash run-fixes-v12.sh
```
Wait. Check `FIX_LOG_V12.md`.

---

## PHASE 5: VERIFY THE BUILD WORKS

After all 12 batches have run, verify nothing is broken:

### Step 5.1 — Check the HTML file isn't corrupted
```bash
node -e "require('fs').readFileSync('renderer/index.html','utf8')" && echo "OK"
```
Should print `OK`. If it errors, the file is corrupted and you need to check what happened.

### Step 5.2 — Rebuild the web app
```bash
cd web && npm install && npm run build && cd ..
```
This should complete without errors. If it errors, read the error message — it'll tell you what's wrong.

### Step 5.3 — Check for emoji (should be zero)
```bash
grep -Pc '[\x{1F300}-\x{1FAFF}]' renderer/index.html
```
Should print `0`. If it prints a number > 0, there are still emoji in the code.

### Step 5.4 — Deploy the web app
```bash
vercel --prod --yes
```
Or if you use git push to deploy:
```bash
git add -A
git commit -m "v2.0.0: 132 fixes across v1-v12"
git push origin main
```

### Step 5.5 — Build the desktop app (optional, if you want to test Electron)
```bash
npm run build:mac
```
(or `build:win` for Windows)

---

## PHASE 6: RUN THE QA AUDIT

Now we verify that everything actually works.

### Step 6.1 — Install Playwright (one-time setup)
```bash
cd ~/path-to/pm-roadmapper
npm install -D playwright @playwright/test
npx playwright install chromium
```
This downloads a browser that Playwright uses for automated testing. Takes 2-3 minutes.

### Step 6.2 — Option A: Run the full audit (one command)
```bash
bash audit-all.sh
```
This runs all 3 layers (static + E2E + visual) and produces `AUDIT_REPORT.md`.
Takes about 30-45 minutes total. Walk away.

### Step 6.3 — Option B: Run the AI factory loop (fully autonomous)
```bash
bash audit-loop.sh
```
This is the big one. It:
1. Runs the full audit
2. Reads the failures
3. Auto-fixes every failure
4. Re-audits to verify the fixes
5. Repeats up to 3 times
6. Produces `FINAL_QA_SUMMARY.md`

This can take 1-3 hours. Walk away completely. Come back to a report.

### Step 6.4 — Read the results
When it's done:
```bash
cat AUDIT_REPORT.md
```
Or if you used the loop:
```bash
cat FINAL_QA_SUMMARY.md
```

This gives you:
- Total fixes checked: 132
- Pass rate: X%
- Every failure listed with what's wrong and how to fix it
- Whether the app is ready for release

---

## PHASE 7: IF THERE ARE STILL FAILURES

### Step 7.1 — Run auto-remediation manually
If the loop didn't fix everything, you can run remediation again:
```bash
bash audit-fix.sh
```
Then re-audit:
```bash
bash audit-all.sh
```

### Step 7.2 — Check specific failures
Open `AUDIT_REPORT.md` and look for FAIL items. For each one:
- Read what was expected
- Read what was found
- The report tells you exactly what to fix

### Step 7.3 — Manual fixes
For anything Claude Code couldn't fix automatically (like Supabase secrets, OAuth registration), follow the instructions in:
- `INTEGRATION_SETUP_GUIDE.md` (for integration OAuth apps)
- `FIX_LOG_V*.md` files (for any `// TODO: requires backend` items)

---

## PHASE 8: FINAL DEPLOYMENT

Once `AUDIT_REPORT.md` shows an acceptable pass rate (aim for 90%+):

### Step 8.1 — Commit everything
```bash
cd ~/path-to/pm-roadmapper
git add -A
git commit -m "v2.0.0: 132 fixes + QA audit complete"
git push origin main
```

### Step 8.2 — Deploy web
```bash
cd web && npm run build && cd ..
vercel --prod --yes
```

### Step 8.3 — Deploy edge functions (for integrations)
```bash
supabase functions deploy integrations-oauth --no-verify-jwt
supabase functions deploy integrations-webhook --no-verify-jwt
supabase functions deploy integrations-api
supabase functions deploy integrations-sync
```

### Step 8.4 — Apply database migration (for integrations)
```bash
supabase db push
```

### Step 8.5 — Build desktop app
```bash
npm run build:mac
```

### Step 8.6 — Create GitHub release
```bash
git tag -a v2.0.0 -m "v2.0.0: 132 fixes"
git push origin v2.0.0
gh release create v2.0.0 --title "v2.0.0 — Major Update" --notes "132 fixes across 12 batches"
```

---

## QUICK REFERENCE: THE OVERNIGHT RUN

If you want to do everything overnight in one session, here's the play:

### Evening (10 minutes of your time):
```bash
cd ~/path-to/pm-roadmapper

# Copy all files (assuming they're on your Desktop)
cp ~/Desktop/roadmap-fixes/* .

# Start v1 in tmux so it survives if you close Terminal
tmux new-session -d -s fixes 'bash run-fixes.sh && bash run-fixes-v2.sh && bash run-fixes-v3.sh && bash run-fixes-v4.sh && bash run-fixes-v5.sh && bash run-fixes-v6.sh && bash run-fixes-v7.sh && bash run-fixes-v8.sh && bash run-fixes-v9.sh && bash run-fixes-v10.sh && bash run-fixes-v11.sh && bash run-fixes-v12.sh && cd web && npm run build && cd .. && bash audit-loop.sh'
```

### Morning (check the results):
```bash
# Reattach to see if it's still running
tmux attach -t fixes

# Or just check the final report
cat FINAL_QA_SUMMARY.md
```

That one tmux command chains ALL 12 fix batches + web build + the full audit loop. It'll run for 6-12 hours depending on Claude Code's speed.

---

## TROUBLESHOOTING

### "command not found: claude"
Install Claude Code:
```bash
npm install -g @anthropic-ai/claude-code
claude login
```

### "renderer/index.html not found"
You're in the wrong directory. Find your repo:
```bash
find ~ -name "renderer" -type d 2>/dev/null
```

### "Permission denied" when running .sh files
```bash
chmod +x *.sh
```

### Claude Code stops mid-run
Just re-run the same script. It picks up from where it left off (it reads the code state, not a checkpoint).

### "npm run build" fails
Read the error. Common fix:
```bash
cd web && npm install && cd ..
```
Then try the build again.

### tmux session disconnected
```bash
tmux ls              # list sessions
tmux attach -t fixes # reattach
```

### Web app not updating after deploy
Clear your browser cache or open in incognito.

---

## FILE INVENTORY (what you should have in your repo after everything)

```
pm-roadmapper/
├── CLAUDE.md                          ← Claude Code reads this automatically
├── ROADMAP_OS_FIXES.md               ← v1 fix spec
├── ROADMAP_OS_FIXES_V2.md            ← v2 fix spec
├── ROADMAP_OS_FIXES_V3.md            ← ...
├── ROADMAP_OS_FIXES_V4.md
├── ROADMAP_OS_FIXES_V5.md
├── ROADMAP_OS_FIXES_V6.md
├── ROADMAP_OS_FIXES_V7.md
├── ROADMAP_OS_FIXES_V8.md
├── ROADMAP_OS_FIXES_V9.md
├── ROADMAP_OS_FIXES_V10.md
├── ROADMAP_OS_FIXES_V11.md
├── ROADMAP_OS_FIXES_V12.md
├── run-fixes.sh                       ← v1 launcher
├── run-fixes-v2.sh                    ← v2 launcher
├── run-fixes-v3.sh                    ← ...
├── ...
├── run-fixes-v12.sh
├── AUDIT_CHECKLIST.md                 ← verification spec (132 fixes)
├── audit-static.sh                    ← Layer 1: grep audit
├── audit-e2e.sh                       ← Layer 2: Playwright tests
├── audit-visual.sh                    ← Layer 3: screenshot review
├── audit-all.sh                       ← runs all 3 layers
├── audit-fix.sh                       ← auto-fixes failures
├── audit-loop.sh                      ← full cycle: audit→fix→repeat
├── FIX_LOG.md                         ← generated by v1 run
├── FIX_LOG_V2.md                      ← generated by v2 run
├── ...
├── FIX_LOG_V12.md
├── AUDIT_STATIC.md                    ← generated by audit
├── AUDIT_E2E.md                       ← generated by audit
├── AUDIT_VISUAL.md                    ← generated by audit
├── AUDIT_REPORT.md                    ← generated by audit
├── FINAL_QA_SUMMARY.md               ← generated by audit loop
├── INTEGRATION_SETUP_GUIDE.md         ← generated by v10 (manual steps for OAuth)
└── tests/
    └── screenshots/                   ← generated by visual audit
        ├── light-dashboard.png
        ├── dark-dashboard.png
        └── ...
```
