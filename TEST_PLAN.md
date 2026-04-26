# Roadmap OS — Test Plan

**Version targeted:** v1.45.1 (renderer/index.html ~38,800 lines)
**Authored:** 2026-04-26
**Audience:** Manual QA testers, release engineers, support engineers reproducing customer reports.

This document enumerates every user-facing feature in Roadmap OS and provides explicit, clickable test steps for each one. Cross-reference the matching feature ID in `ACCEPTANCE_CRITERIA.md` for the definition-of-done.

---

## How to use this document

1. Each feature has a stable ID (`F-XXX`). Sub-features share the parent ID with a letter suffix (`F-XXX.A`).
2. **Where** locates the feature in the UI in click-path form.
3. **Preconditions** are set up once for the whole batch unless otherwise stated.
4. **Test steps** are clickable: a tester reading them should know exactly what to click.
5. **Expected result** is what the user should see/experience.
6. **Edge cases** are sub-cases worth confirming after the happy path passes.

### Universal preconditions (set once)

- App is open (Electron build OR `https://app.pmroadmapper.com`).
- A test user account exists with at least one roadmap row, one section, one initiative bar, and one ToDo task. If none, run F-005 first to onboard fresh.
- Two test accounts (`tester+a@example.com` and `tester+b@example.com`) exist for sharing/permission tests.
- Browser dev-tools available so the tester can inspect toasts and error console when expected behaviour is "no error".
- Screen width >= 1280px unless the test explicitly says mobile/narrow.

---

# Section 1 — Authentication & Onboarding

### F-001 Email + password sign in
**Where:** Auth screen (`#authOverlay`) -> Email + Password fields -> `Sign In` button.
**Preconditions:** Existing account with known credentials. App is freshly loaded, signed-out.
**Test steps:**
1. Load the app; the auth screen is shown automatically.
2. Type `tester+a@example.com` into the **Email address** field.
3. Type the correct password into the **Password** field.
4. Press and hold the eye icon next to the password — confirm the password is revealed while held, hidden on release.
5. Leave **Remember me** ticked.
6. Click **Sign In**.
**Expected result:** Auth screen disappears within 5s, the dashboard or roadmap loads, the top-right **Account** button is active, and the user's email is reflected when opening the Account modal (F-074).
**Edge cases to test:**
- Invalid password -> red `#authErr` text "Invalid login credentials" appears, the form stays open.
- Empty email -> form does not submit, no toast.
- Untick **Remember me**, sign in, close the browser, re-open: user must re-authenticate.

### F-002 Sign up (create account)
**Where:** Auth screen -> `Don't have an account? Create account` link.
**Preconditions:** Use a brand-new email address never used in the app.
**Test steps:**
1. On the auth screen, click **Create account**.
2. Fill in **Email**, **Password**, **Confirm password**, **Full Name**, **Company / Organisation**, **Phone Number**, **Designation / Role**.
3. Click the primary **Create account** button.
**Expected result:** Account is created; user is signed in; the welcome toast appears; the onboarding tour (F-005) launches automatically.
**Edge cases to test:**
- Password != confirm password -> inline error, button does not submit.
- Email already exists -> toast "Account exists — try signing in".
- Required field empty -> button shows error, form does not submit.

### F-003 Forgot password
**Where:** Auth screen -> `Forgot password?` link.
**Test steps:**
1. Click **Forgot password?**
2. Type the registered email address.
3. Click the primary button (label changes to **Send reset link**).
**Expected result:** Success toast confirms a reset email was sent. The form returns to sign-in view.
**Edge cases:** Unknown email -> success message still appears (no enumeration). Invalid email format -> inline error.

### F-004 Google + Microsoft OAuth sign-in
**Where:** Auth screen -> `Continue with Google` / `Continue with Microsoft` buttons.
**Test steps:**
1. Click **Continue with Google** (or Microsoft).
2. Complete the provider's sign-in flow in the popup / redirect.
3. Approve any scope-consent screens.
**Expected result:** App receives the OAuth callback, signs the user in, and lands on the dashboard / roadmap.
**Edge cases:** Cancelled OAuth flow -> user returns to auth screen, no session, no toast spam. First-time Google login auto-creates the account.

### F-005 Onboarding tour (interactive)
**Where:** Auto-fires on first login, or via Settings -> "Replay Onboarding Tour".
**Test steps:**
1. Sign in for the first time, OR open Settings (F-073) and click **Replay Onboarding Tour**.
2. Read tooltip 1; click **Next**.
3. Continue through every step using **Next** and **Back**.
4. Click **Skip** during any step.
**Expected result:** Tour spotlights real UI elements; tooltips position themselves visibly; **Skip** dismisses the tour immediately. The tour overlay never blocks the app after dismissal.
**Edge cases:** Tour over a closed page (e.g. ToDo) auto-opens that page first. Pressing Esc during the tour ends it.

### F-006 Invite teammates (onboarding)
**Where:** First-run onboarding step OR Account -> Invite Your Teammates.
**Test steps:**
1. From the onboarding modal, click **Invite Your Teammates**.
2. Type 1–3 email addresses (one per row).
3. Optional: Click **Pull Calendar Attendees** if Google Calendar is connected.
4. Click **Send Invites**.
**Expected result:** Toast confirms invites sent; recipients receive an email from the `send-invite` Edge function with a Roadmap OS branded template.
**Edge cases:** Invalid email -> row is highlighted red, send aborts. Resend API key error -> toast surfaces the actual error string ("verify domain", "RESEND_API_KEY rejected").

---

# Section 2 — Roadmap (Main Page)

### F-010 Open the roadmap
**Where:** Top nav -> **Roadmap** link.
**Test steps:**
1. From any other page, click **Roadmap** in the top nav.
**Expected result:** All overlays close; the roadmap page is visible with sections, rows, timeline, today line. The Roadmap nav item is highlighted.

### F-010.A Logo upload
**Where:** Roadmap page -> top-left logo zone.
**Test steps:**
1. Hover the logo placeholder; the **Upload Logo** hint appears.
2. Click the logo zone.
3. Select a PNG, JPG, or SVG file <= 1 MB.
**Expected result:** Logo replaces the placeholder; persists across page reload.
**Edge cases:** File > 5 MB -> toast warns of size limit. Non-image file -> rejected with toast.

### F-010.B Edit roadmap title / subtitle / author / description / portfolio badge
**Where:** Roadmap header text fields (contenteditable).
**Test steps:**
1. Click the title "Product Roadmap"; type new text; click outside.
2. Repeat for subtitle, author, description, portfolio badge.
**Expected result:** Each value persists across reload and across devices (cross-device sync).

### F-011 Sections (lanes) — add / edit / delete / reorder
**Where:** Legend -> Roadmap dropdown -> **+ Add Section**, OR section header kebab.
**Test steps:**
1. Click **Roadmap** dropdown -> **+ Add Section**. The add-section form appears.
2. Type a name, pick a colour with the colour picker, click **Add Section**.
3. Click the section header colour swatch on an existing section to recolour it.
4. Click the section header **Edit** button -> rename -> save.
5. Click the section header **Delete** (trash) button -> confirm.
**Expected result:** Section is created/recoloured/renamed/deleted in real time. Rows in a deleted section are kept (orphaned at the end) unless the user confirms moving them.

### F-011.A Follow section
**Where:** Section header -> **Follow** (eye) icon.
**Test steps:**
1. Click the **Follow** icon on a section header.
2. Confirm the icon flips to "Stop following".
3. Refresh the page — follow state persists.
**Expected result:** `section.followers[]` includes the current user's email; tooltip flips between "Follow this section to get alerts on changes" and "Stop following this section".

### F-012 Rows (initiatives) — add
**Where:** Roadmap dropdown -> **+ Add Product**, OR Quick Actions -> **+ Add Initiative**, OR `+ Row` hover button between rows, OR Dashboard -> **+ Add Initiative**.
**Test steps:**
1. Click **Roadmap** dropdown -> **+ Add Product**. The Edit Product modal opens (F-020).
2. Fill in **Product Label** (required), pick a section, optionally set priority.
3. Click **Save**.
**Expected result:** Row appears in the chosen section with an empty timeline. Empty section now has 1 row.

### F-013 Rows — drag-and-drop reorder + cross-section move
**Where:** Row drag handle on the left of each row.
**Test steps:**
1. Click and hold a row's drag handle.
2. Drag upward — a 2px accent-colour drop indicator should appear above the target row.
3. Drop on the gap above another row in a different section.
4. Drop directly onto a section header.
**Expected result:**
- Drop indicator appears at the precise landing position (above OR below the target row depending on cursor Y).
- Cross-section drop re-parents the row (`row.sec` updated) — verified by reload.
- Drop on section header lands the row at the top of that section.
- No surrounding rows are displaced.
**Edge cases:** Drag onto an empty section header -> row lands as the only row in that section. Drop onto the source position -> no-op, no console errors.

### F-014 Rows — sort within sections
**Where:** Legend -> **Sort** dropdown (`#roadmapSortSelect`).
**Test steps:**
1. Click the **Sort** dropdown.
2. Select **Priority (high -> low)**.
3. Confirm rows reorder *within* each section (section headers stay visible).
4. Switch to **Name (A-Z)** then **Start month** then **End month**.
5. Switch back to **Default order**.
**Expected result:** Section grouping is preserved at all times. Each section's rows reorder according to the selected key. Default order restores the manually-arranged order.

### F-015 Roadmap range filter (column narrowing)
**Where:** Legend -> **Range** dropdown.
**Test steps:**
1. With > 4 quarters of data, click **Range** and select **This Quarter**.
2. Confirm month/quarter columns outside this quarter are hidden.
3. Section header colspan should shrink to fit the visible months.
4. Try **Next Quarter**, **H1**, **H2**, **YTD**, **This Fiscal Year**, then **All**.
**Expected result:** Visible columns tighten/expand to the chosen window. Today line is hidden if today falls outside the window. Selecting **All** restores every column without flicker.

### F-016 View toggle: Timeline / Kanban
**Where:** Legend -> **View** segmented buttons.
**Test steps:**
1. Click **Kanban**.
2. Confirm a 3-column board (Open / In Progress / Done — or by status colour) replaces the timeline.
3. Confirm the today line is removed.
4. Each card shows the parent product name + section + priority.
5. Drag a card to a different column.
6. Click a card.
7. Click **Timeline** to return.
**Expected result:**
- Kanban shows one card per initiative (bar), not one per product.
- Drop changes the bar's status (`bar.c`); persistence confirmed by reload.
- Click opens the full Edit Product modal with the bar scrolled into view.
- Switching back redraws the timeline + today line.

### F-017 Today line (red) on timeline
**Where:** Roadmap page -> vertical red line over current month column.
**Test steps:** Reload the roadmap page on any date; observe the line position.
**Expected result:** Line aligns with the current month's column. Hidden in Kanban or when range filter excludes today's date.

### F-018 Tabs (multiple roadmaps)
**Where:** Above the legend -> tabs strip with `+ New Tab` button.
**Test steps:**
1. Click `+ New Tab`. Type a name and choose **New (independent)** vs **Stacked**.
2. Switch between tabs.
3. Rename a tab via the pencil icon.
4. Close a tab via the X.
**Expected result:** Each independent tab has its own sections/rows/quarters. Stacked tab renders below the active tab. Renaming, switching, and closing all persist across reload.

### F-018.A Merge Roadmaps
**Where:** Tabs strip -> **Merge Roadmaps** button (visible when 2+ tabs exist).
**Test steps:**
1. Create a second tab; populate it with 1 section + 1 row.
2. Click **Merge Roadmaps**.
3. Pick **source** = second tab and **target** = first tab.
4. Choose **Stack** mode -> click **Merge**.
5. Repeat with **Merge** mode (named-section-match).
**Expected result:**
- Stack: every source section appears (with new IDs) in the target.
- Merge: sections with case-insensitive matching names are combined; rows re-parent to the target's section ID; unmatched sections become new sections.
- Source tab is unchanged; toast confirms merge success.

### F-019 Quarters / FY controls
**Where:** Legend -> Roadmap dropdown.
**Test steps:**
1. Click **+ Add Quarter** — adds the next quarter.
2. Click **+ Add Financial Year** — adds 4 quarters.
3. Click **Configure FY start month...** — pick e.g. JAN.
4. Click **Remove last quarter** — confirms.
5. Click **Edit Timeline** (Data dropdown) -> modal opens for editing quarter labels/years/months.
**Expected result:** Timeline header reflects each change; today line repositions correctly. FY start change updates Q_MONTH_MAP so every visible quarter label is correct.

---

# Section 3 — Edit Product (Row) Modal

### F-020 Open Edit Product modal
**Where:** Click a row name, click the row's pencil button, or click any timeline pill.
**Test steps:**
1. Click a row name OR pencil.
2. Confirm the modal opens with the row's data populated.
3. Click an initiative pill — confirm the modal opens AND the clicked initiative scrolls into view AND is briefly highlighted with a blue ring.
4. Close via X, Cancel, Esc, or backdrop-click — confirm changes are discarded.
**Expected result:** Modal opens centered, focus moves into the modal, focus is restored to the trigger when closed.

### F-020.A Edit product fields
**Where:** Inside the row modal.
**Test steps for each:**
- **Product Label**: type a value; required to save.
- **Product Description**: paste multi-line text; field is sized vertically; label sits *above* the input (not beside).
- **Section**: pick from dropdown OR click `+ New section` inline -> name + colour -> Create -> it becomes the selected section.
- **Priority Level**: select **None**, **P1**, **P2**, **P3**.
- **Parent product**: pick another row to nest this row under it.
- **Revenue / ROI**: pick a currency from the 14-currency dropdown (USD/ZAR/EUR/GBP/KES/ZMW/MWK/NGN/INR/AUD/CAD/JPY/CNY/BRL); type a number.
- **Labels**: type a label, press Enter; type another, press Enter; X removes a label.
- **Initiative Owner**: pick a user from the dropdown (sourced from cap members + roadmap row owners + plan task owners).
**Expected result:** Each field saves on **Save**; reload confirms persistence. Currency choice persists across rows in `appSettings.currency`.

### F-020.B Initiatives (timeline bars) — add / edit / delete
**Where:** Edit Product modal -> **Product Initiatives** section.
**Test steps:**
1. Click **+ Add Initiative**. A new bar block appears with name/desc/dates/colour fields.
2. Type a name; pick a start month and an end month.
3. Pick a colour from the colour swatches (Released, In Progress, Delayed, Strategy, At Risk).
4. Add a description.
5. Click trash to delete a bar.
6. Click **Save**.
**Expected result:** Bars render on the timeline at the correct months with the correct colour and label.

### F-020.C Deliverables
**Test steps:** Click **+ Add** -> type a deliverable name + due date -> save. Confirm the deliverable shows in the row's deliverables list and on `Reports -> Deliverables Tracker`.

### F-020.D Links + Attachments
**Test steps:**
1. **+ Add Link** -> URL + label -> save.
2. **+ Attach File** -> pick a file (web: opens file picker; desktop: native dialog).
3. Confirm a download icon appears next to the file name.
4. Click the download icon -> file downloads (Electron: opens; Web: browser save dialog).
**Edge cases:** File > 50 MB -> upload fails with toast. Click file name -> same download flow.

### F-020.E Linked Initiatives (dependencies / references)
**Test steps:**
1. Click **+ Link** -> modal pops up with all rows from this and shared roadmaps.
2. Pick a target row + relationship (depends-on / references).
3. Confirm the link chip appears with the target row name; the target row's edit modal also shows the inverse link.

### F-020.F Expected Outcomes (predictions)
**Test steps:**
1. **+ Add** under Expected Outcomes.
2. Fill **metric**, **target**, **units**, **timeframe**, **hypothesis**.
3. Save.
**Expected result:** Outcomes appear in `Reports -> Launch Outcomes` after the row is released.

### F-020.G Launch Outcomes & Release Notes
**Test steps:**
1. Set a release date.
2. Type release notes for **Dev**, **Customer**, **Internal** audiences (3 tabs).
3. Save.
**Expected result:** Notes are visible in `Reports -> Launch Outcomes`. Status badge reads "Released DD MMM YYYY".

### F-020.H Comments thread (in-row)
**Test steps:**
1. Type a comment, click **Post**.
2. Refresh — comment persists with timestamp + author.
3. The comment count badge increments.

### F-020.I Save / Cancel
**Test steps:**
1. Edit a field, click **Cancel** — confirm prompt: "Discard changes?".
2. Edit a field, click **Save** — modal closes, change is reflected on the roadmap.

### F-021 Row kebab menu actions
**Where:** Row hover -> kebab icon.
**Test steps:**
1. Click the kebab on a row.
2. Each menu item: **Edit**, **Duplicate**, **Move up / down**, **Recolour**, **Follow product** / **Unfollow product**, **Follow section** / **Unfollow section**, **Add comment**, **Delete**.
3. Click each in turn (some require confirmation).
**Expected result:** Each action has the documented effect; deleting prompts; duplicating creates a copy with `(copy)` suffix; follow toggles persist.

### F-022 Add Section form
**Where:** Roadmap dropdown -> **+ Add Section** OR keyboard shortcut.
**Test steps:** Type name, pick colour, click **Add Section**. Confirm it appears at the bottom of the section list; rows can be added to it via row form's section dropdown.

### F-023 Edit Section modal
**Where:** Section header -> Edit (pencil) icon.
**Test steps:** Rename, recolour, save. Confirm the section header updates and rows in that section are unaffected.

### F-024 Edit Quarters modal
**Where:** Legend -> Data dropdown -> **Edit Timeline**.
**Test steps:**
1. Click **Edit Timeline**. Modal opens with the list of quarters.
2. Change quarter label (e.g., "Q1") and year for each.
3. Reorder via drag handles (if present).
4. Click **Save**.
**Expected result:** Timeline header rerenders with new labels; today line repositions; persistence verified by reload.

### F-025 Bar (initiative) modal — legacy
**Where:** Programmatic / not directly user-clickable in the latest build (legacy entry kept for back-compat).
**Test steps:** From the row modal, the simpler bar modal can still appear when called from older code paths. Confirm fields: name, desc, color, start, end. Save updates the bar.

---

# Section 4 — Products Page

### F-030 Open Products page
**Where:** Top nav -> **Products**.
**Test steps:** Click **Products**. Page opens with summary bar (Total / In Development / Live (GA) / Beta / Total Revenue / Open Bugs), search, filters, view toggle.

### F-030.A Filter / search
**Test steps:** Type into search; combine with type filter (Digital/Hardware/Firmware/Hybrid), stage filter, status filter. Confirm visible products narrow accordingly. Empty state has clear copy.

### F-030.B Table view sort
**Test steps:** Click each sortable column header (Product, Code, Type, Status, Stage, Priority, Owner, Revenue, Bugs, Version). First click ascending, second click descending.

### F-030.C Card view
**Test steps:** Click the card-view icon in the toolbar. Confirm a responsive grid of product cards.

### F-031 Product detail (8 tabs)
**Where:** Click a product row/card.
**Test steps for each tab:**
- **Overview** — visual lifecycle bar, snapshot stats, profile fields, recent activity.
- **Commercial** — revenue/cost/margin stats, pricing model, price points table.
- **Releases & Bugs** — release notes cards, bug rows with severity dots and status select; **+ New Release** / **+ New Bug** forms.
- **Plan & Tasks** — linked plan progress + top-12 task table; click `Open plan`.
- **Specs** — Hardware section visible only for hardware/firmware/hybrid products; Digital section for digital/hybrid; Quality & Support always visible.
- **History** — vertical timeline with type-specific marker icons; filter chips for 10 event types.
- **Documents** — auto-aggregated `documentRepository` items for `initiativeId == row.id`.
- **Discussion** — read-only view of `row.comments[]` with link back to the edit modal.
**Expected result:** Each tab loads without console error; data persists; switching tabs preserves filters.

### F-031.A Product detail — Edit / Watch buttons
**Test steps:** Click **Edit** -> opens the row edit modal. Click **Watch** -> toggles `row.watchers[]`, button label flips between "Watch" / "Watching".

---

# Section 5 — Checklist (G2M Readiness)

### F-040 Open Checklist
**Where:** Top nav -> **Checklist** OR sidebar -> **Checklist**.
**Test steps:**
1. Click **Checklist**.
2. Pick a product from the dropdown (sourced from roadmap rows).
3. Confirm 14 categories load with their items.
**Expected result:** Header shows readiness % with score bar (red < 50, amber 50-79, green >= 80). Category tabs show per-department %.

### F-040.A Set item value (Yes / No / N/A)
**Test steps:** Click each radio in turn. Comment field text persists. **+ link** adds supporting URL.
**Edge cases:** Setting every applicable item to **Yes** triggers the celebration overlay (F-040.E).

### F-040.B Add task to ToDo from G2M
**Test steps:** Click **+TDL** on any item -> modal asks for due date -> confirm -> task appears in ToDo (F-050) with the right initiative and KPI link.

### F-040.C Custom row
**Test steps:** Click **+ Add Custom Row** -> type task name (or pick **From Library**) -> choose category -> **Add**. Confirm it joins the chosen category.

### F-040.D Convert to Plan
**Test steps:** Click **Convert to Plan** -> confirms creation -> Plans page opens with all checklist items as tasks under the new plan.

### F-040.E Celebration confetti + jingle
**Test steps:** Set every applicable checklist item (skipping N/A) to **Yes**. Wait < 1s.
**Expected result:** A fixed-position overlay shows confetti + a check-circle SVG + "Congratulations!" + a Continue button. A 4-note arpeggio plays (try/catch wrapped). Auto-dismisses in 6s; only fires once per transition to complete.

### F-040.F Browse Templates / GTM Templates
**Test steps:** Click **Browse Templates** -> opens template library scoped to G2M context. Click **GTM Templates** -> opens unified template library (`openTemplateBuilder('checklist', ...)`); falls back to legacy saved-templates manager when unified library isn't loaded.

### F-040.G Edit product description
**Test steps:** Click the description area below the product dropdown; type or paste; click outside to save. Reload — content persists.

### F-040.H Export Word
**Test steps:** Click **Export Word** in the header. Confirm a `.docx` downloads containing every category, item statuses, comments, links.

---

# Section 6 — ToDo List

### F-050 Open ToDo
**Where:** Top nav -> **To-Do** OR Dashboard ToDo card.
**Test steps:** Confirm header shows Open / In Progress / Done counts; filters; **+ Add Task** button; view toggle.

### F-050.A Add task
**Test steps:** Click **+ Add Task** -> type description (autocomplete from task library) -> pick initiative -> due date -> estimate (hours) -> KPI -> **Add**.
**Expected result:** Task appears with status "Open"; counts update.

### F-050.B Add from library
**Test steps:** Click **From Library** -> multi-select tasks across G2M / Plans / Library tabs -> click **Select All** on a tab -> **Import**. Tasks land in the active initiative bucket.

### F-050.C Edit task
**Test steps:** Double-click task description -> edit inline -> blur to save. Click the kebab -> **Edit Task** -> full edit modal.

### F-050.D Status change
**Test steps:** Use the per-task dropdown to flip Open -> In Progress -> Done. Counts update; date colours flip (red overdue, amber within 7d, green OK).

### F-050.E Comments + Links per task
**Test steps:** Comments button -> add comment -> save. Links button -> add URL -> save.

### F-050.F Hours: estimate vs actual
**Test steps:** Set estimate when creating; later edit and log actual hours. Confirm timesheet (F-051) reflects actual hours.

### F-050.G Filters: initiative + status
**Test steps:** Pick a non-empty initiative filter -> list narrows. Pick "All Initiatives" — shows everything. Status filter (All / Open / In Progress / Done) narrows by status.

### F-050.H Kanban view
**Test steps:** Click **Kanban** -> 3 columns. Drag a card from Open -> In Progress -> confirm dropped card now shows under the new column AND the underlying task's status flipped. Click the toggle again to return to list view.

### F-050.I Templates button
**Test steps:** Click **Templates** -> unified template library opens with ToDo context. Pick a template -> **Import** -> tasks land in the ToDo list.

### F-051 Timesheet view
**Where:** ToDo header -> **Timesheet** segmented button (also reachable from KPI overlay).
**Test steps:**
1. Click **Timesheet**.
2. Use prev/next-week arrows to scroll weeks.
3. Confirm weekly target = `appSettings.capacity.hoursPerWeek` (default 35).
4. Tasks with logged actual hours appear; KPI breakdown shows hours/KPI vs target.
5. Click **Open ToDo List** -> returns to ToDo; **Back to Timesheet** returns.

---

# Section 7 — Plans (Project Plans)

### F-060 Open Plans
**Where:** Top nav -> **Plans** OR Dashboard -> Plans card.
**Test steps:** Sidebar shows the plans list + **+ New plan**. Main area shows the active plan's tasks. Plan-name input at top is editable.

### F-060.A Create new plan
**Test steps:** Click **+ New plan** -> name -> linked roadmap rows (multi-select) -> save. Plan opens active.

### F-060.B Plan views: List / Timeline / Gantt / Kanban
**Test steps:** Toggle each view button.
- **List**: editable rows for description / status / owner / start / due / hours.
- **Timeline**: bars on a calendar; **Filter** opens status/priority/owner picker; **Unplanned** counter filters tasks missing dates.
- **Gantt**: tasks with dependency arrows; dark-mode aware (alternating stripes, grid lines, month labels switch with theme).
- **Kanban**: status columns; drag to change.

### F-060.C Add task
**Test steps:** Click **+ Add task** -> modal with description / owner / dates / hours / priority / status / KPI / predecessors / parent (sub-task). Save.

### F-060.D Predecessors / dependencies
**Test steps:** From a task -> **Predecessors** picker -> choose other tasks. Confirm Gantt shows arrows; circular dependencies are blocked with toast.

### F-060.E Sprint bar (Plan progress)
**Test steps:** Confirm the sprint bar (relabelled "Plan progress" in v1.43.0) shows sprint goal, DoD, DoR toggles, velocity. Buttons centered.

### F-060.F Save as Template
**Test steps:** Click **Save as template** -> name -> category -> description -> save. Template appears in Template Library (F-070).

### F-060.G Upload Excel
**Test steps:** Click **Upload Excel** -> select a Project / Planner / Asana / Jira / ClickUp export. Preview table -> map columns -> **Import** -> tasks land in the active plan.

### F-060.H Share plan
**Test steps:** Click **Share** (people icon) -> email -> **Share**. Recipient sees the plan as read-only / commenter (per role).

### F-060.I Follow plan
**Test steps:** Click **Follow** -> label flips to **Following**. Plan changes deliver notifications.

---

# Section 8 — CapacityIQ

### F-061 Open CapacityIQ
**Where:** Top nav -> **CapacityIQ** OR Dashboard -> CapacityIQ card.
**Test steps:** Sidebar nav: Dashboard / Templates / Teams & People / Task Library. Topbar shows the page title.

### F-061.A Dashboard heatmap
**Where:** CapacityIQ -> Dashboard.
**Test steps:** Confirm a Team x Sprint heatmap. Cells colour-coded green (0-75%), amber (76-95%), red (96%+). Each cell shows allocated/available hours. Hover shows team + sprint detail.

### F-061.B Per-team capacity strip
**Test steps:** Above the dashboard heatmap, confirm per-team rows showing capacity / allocated / available + utilisation bar. Members on multiple teams contribute to each row.

### F-061.C Capacity defaults
**Where:** Inline editor at the top of the dashboard.
**Test steps:** Change **Hours per week** -> confirm weekly/monthly/yearly breakdowns AND timesheet target (F-051) update immediately. Change `hoursPerDay` and `workDays` via Settings.

### F-061.D Teams & People
**Test steps:**
1. Click **+ Add Team** -> modal: name, colour, logo (<= 200KB base64), members (multi-select with role + hours/day + productivity factor). Save.
2. Edit a team — same modal pre-populated.
3. **Edit Memberships** for a member -> assign to multiple teams.
4. Delete a team -> confirm.
**Expected result:** Team card shows logo + member avatars; counts roll up to dashboard.

### F-061.E Templates page (CIQ)
**Test steps:** Confirm bundled templates load (35+ items including New Hardware Integration, New Software Feature, BI Dashboard Request, etc.). Each card displays its own SVG icon tinted by category colour. Click a template -> preview -> **Use** -> tasks populate in a new initiative.

### F-061.F Task Library
**Test steps:**
1. Search by name / category / owner.
2. Filter by category dropdown.
3. Click **+ Add task** -> name, category, default owner, default hours, KPI tag -> save.
4. Click **Bulk upload** -> Excel template -> upload populated file -> **Import**.
5. Click **Template** to download a starter Excel.
**Expected result:** Library entries are sorted by useCount then alphabetical; entries propagate to ToDo's "From Library" picker.

### F-061.G Calendar integration (Google + Outlook)
**Where:** CapacityIQ Dashboard topbar -> **Calendar Integrations** OR Settings -> Calendar.
**Test steps:**
1. Click **Connect Google Calendar** — OAuth flow opens in a new window.
2. Approve `calendar.readonly` scope.
3. Window closes / app reloads. Status shows **Connected**.
4. Click **Sync now** -> preview shows imported events with quarter-hour rounded durations.
5. Approve preview -> events become ToDo entries.
6. Repeat for **Connect Outlook** (`Calendars.Read`).
**Expected result:** Both providers can connect simultaneously. Disconnect button revokes the token.

### F-061.H Calendar screenshot import (legacy)
**Test steps:** Click **Import from screenshot** -> upload an image -> AI parses into events -> confirm.

---

# Section 9 — KPI Scorecard & Timesheet

### F-062 Open KPI
**Where:** Sidebar -> **KPI Scorecard**.
**Test steps:** Header: **Scorecard** / **Timesheet** segmented buttons; quarter dropdown (FY25-FY28); overall score; **+ Add KPI**.

### F-062.A Scorecard view
**Test steps:** Confirm 10 default KPIs in 4 groups (Product Performance, Product Management, Business Integration, NetStar Values). Each row has PM Score, Target, Manager Score, Approved checkbox, RAG status, gap indicator.

### F-062.B Score a KPI
**Test steps:** Click PM Score (0-4); change Target; click Manager Score; tick Approved -> manager score takes precedence. RAG flips colour.

### F-062.C Evidence collection
**Test steps:** **+ Link** adds URL; **Attach** uploads doc; **+ Meeting** logs meeting (date, attendees, outcomes, actions) for Integration KPIs; **+ Training** logs training session for Training KPI.

### F-062.D Quarterly trend chart
**Test steps:** Confirm the bar chart at the top reflects per-quarter scores; switching quarters updates form fields.

### F-062.E Auto-populated metrics
**Test steps:** Verify Product Roadmaps shows roadmap link; Product Delivery Performance shows G2M average; Product Performance shows ToDo completion rate. Numbers update when the underlying data changes.

### F-062.F Add custom KPI
**Test steps:** Click **+ Add KPI** -> name, group, tool/source, description -> **Add**. New row appears under the chosen group; persists.

### F-062.G Export Word
**Test steps:** Click **Export Word** -> `.docx` downloads with formatted scorecard.

### F-062.H Timesheet view
**Test steps:** Click **Timesheet** -> see weekly breakdown; prev/next-week buttons; KPI breakdown; total logged vs target.

---

# Section 10 — UCR (User Change Requests)

### F-063 Open UCR
**Where:** Sidebar -> **Change Requests** (hidden in default top nav; reachable through old code paths and search).
**Test steps:** Click **+ New UCR**. Form expands with all fields.

### F-063.A Create UCR
**Test steps:** Fill in: title, priority, description, key outcomes, internal/external stakeholders, business owner, workarounds awareness, business impact, financial impact (ZAR), required resources, D365 impact (Yes/No), acceptance criteria, supporting documents.

### F-063.B Systems impact checklist (19 systems)
**Test steps:** Tick each system Yes / N/A. Confirm the table shows in the Word export.

### F-063.C Approval section
**Test steps:** Fill business approver name/title/date and technology approver fields.

### F-063.D Status workflow
**Test steps:** Cycle status: Draft -> Submitted -> Approved -> Rejected -> Implemented. Filter dropdown narrows the list.

### F-063.E Export Word
**Test steps:** Click **Export Word** on a UCR -> sign-off ready document with signature lines.

---

# Section 11 — Artifacts & Collateral

### F-064 Open Artifacts
**Where:** Sidebar -> **Artifacts**.
**Test steps:** Header has **+ New Artifact**, **Brand Guide**, **Templates**.

### F-064.A New Artifact
**Test steps:** Click **+ New Artifact** -> modal with title, type (Brochure / FAQ / PIG / Presentation / Data Sheet / Sales Guide / Training Material / Release Note / Technical Document / Other), initiative, description, AI instructions, reference documents (multi-upload), visual template, output format (Word/PowerPoint/Excel/PDF). Click **Save as Draft** OR **Generate with AI**.
**Expected result:** Draft saves; AI-generate kicks off a request to the configured provider; once complete, a downloadable file is offered.

### F-064.B Brand Guide modal
**Test steps:** Click **Brand Guide** -> upload CI guide -> **AI Analyse** auto-extracts colours / fonts / tone. Set hex colours (visual swatches), fonts, logo URL, brand assets. Style notes/guidelines textarea. All persist.

### F-064.C Templates per artifact type
**Test steps:** Click **Templates** -> list of 10 artifact types. Upload a template per type -> confirm "Configured" badge.

### F-064.D Filter artifacts
**Test steps:** Use **Initiative** and **Type** filters -> list narrows. Count chip updates.

---

# Section 12 — Prioritization

### F-065 Open Prioritization
**Where:** Sidebar -> **Prioritization**.
**Test steps:** Sidebar nav: Top 10 / Score / Frameworks / Matrix / OKRs.

### F-065.A Score Initiatives
**Test steps:** Click **Score**. Each row has fields for selected framework (RICE / ICE / MoSCoW). Type values; total score recomputes. Click **Open Priority Ratings** modal to bulk-edit.

### F-065.B Frameworks
**Test steps:** Switch between RICE, ICE, MoSCoW. Each framework changes the score columns; previously typed scores are preserved per-framework.

### F-065.C Matrix (Value vs Effort)
**Test steps:**
1. Click **Matrix**. Confirm SVG chart with X (effort) and Y (value) axes.
2. Confirm every initiative row appears as a draggable dot (rows with no scores get a sensible default — Y derived from priority, X at midpoint).
3. **Select All** checkbox toggles all rows on/off the chart; per-row checkboxes also toggle.
4. Drag a dot to a new position — score persists.
5. Resize the panel — items panel + chart fit on screen without horizontal scroll.
6. Open the **Display** popover -> toggle Labels / Bubble / Color -> confirm chart updates.

### F-065.D Top 10
**Test steps:** Confirm the page lists the top 10 initiatives by current framework score, with rank badges. Click any to open Edit Product.

### F-065.E OKRs
**Test steps:**
1. **+ New Objective** -> title, period, description.
2. **+ Add Key Result** -> title, target, current, unit. Progress % auto-calculates.
3. **Link initiatives** -> multi-select roadmap rows -> save -> linked chips appear under the KR.
4. Delete KR / Objective with confirmation.

---

# Section 13 — Reports

### F-066 Open Reports
**Where:** Top nav -> **Reports** OR Dashboard quick action.
**Test steps:** Sidebar lists 12 reports: Initiative Health, Weekly Status, Launch Outcomes, OKR Progress, Sprint Metrics, G2M Readiness, Prioritisation, Weekly Capacity, Change Requests, Roadmap Change Log, QBR Pack, Deliverables Tracker.

### F-066.A Each report renders
**Test steps:** Click each report in turn. Confirm:
- **Initiative Health**: status of every roadmap initiative.
- **Weekly Status**: Shipped / Shipping next / Blocked.
- **Launch Outcomes**: per-shipped initiative — closing-the-loop table (expected vs actual + status pill Met/Partial/Missed/Pending), release notes editor (3 audience tabs), feedback thread with sentiment, audience filter, **Include unreleased**, **Export to Markdown**.
- **OKR Progress**: per-objective bar with KR completion.
- **Sprint Metrics**: per-plan velocity, hours, mix.
- **G2M Readiness**: per-product completeness.
- **Prioritisation**: framework scores.
- **Weekly Capacity**: time allocation this week.
- **Change Requests**: UCR summary.
- **Roadmap Change Log**: latest 200 add/edit/delete entries with action badge + user.
- **QBR Pack**: quarterly summary.
- **Deliverables Tracker**: promised vs delivered.

---

# Section 14 — Insights, Competitive Intel, Feedback

### F-067 Insights
**Where:** Top nav -> **Insights**.
**Test steps:** Confirm AI-driven roadmap suggestions and risks render. Saved analyses appear at the bottom (top 3).

### F-068 Competitive Intel
**Where:** Sidebar -> **Competitive Intel**.
**Test steps:**
1. Click **Add competitor** -> name + URL -> **Save**.
2. Run **Analyse** -> AI returns positioning + gaps.
3. Save analysis -> appears in saved list.

### F-069 Feedback Inbox
**Where:** Sidebar -> **Feedback**.
**Test steps:**
1. Confirm header shows count chip + **Share submission link** + **Refresh**.
2. Click **Share submission link** -> modal with public link -> **Copy**.
3. Submit feedback via that public link in another browser -> return -> click **Refresh** -> new item appears.
4. Vote / link an item to a roadmap row -> status flow Triage -> Planned -> In Progress -> Shipped -> Declined.

---

# Section 15 — Template Library

### F-070 Open Template Library
**Where:** Sidebar -> **Template Library**.
**Test steps:** Confirm:
- Search input filters by name/category/tags.
- Scope filter: All / Platform / My Organisation.
- Category filter populated dynamically.
- Cards show icon, category colour, task count, preview.

### F-070.A Upload Template
**Test steps:** Click **Upload Template** -> pick Excel -> auto-detects context -> preview tasks -> save.

### F-070.B Create Template (admin)
**Test steps:** Visible only to admins. Click **+ Create Template** -> name, category, tasks (multi-select from library) -> **Save**.

### F-070.C Use a template
**Test steps:** Click a card -> **Use** -> pick target context (Plans / ToDo / Checklist / CapacityIQ) -> tasks land in the chosen context with their default hours/owner/category.

---

# Section 16 — Sharing & Notifications

### F-071 Share Roadmap
**Where:** Top toolbar -> **Share** button.
**Test steps:**
1. Click **Share**.
2. Type `tester+b@example.com` -> click **Share**.
3. Confirm green status banner: "Roadmap shared with ... — invite email sent".
4. The chip for the invitee appears in "Currently shared with".
5. Click **Revoke** -> confirm -> chip disappears.
6. Sign in as B in another browser -> confirm shared roadmap appears as a tab with the owner's name.

### F-072 Notifications
**Where:** Top toolbar -> **Notifications** (bell icon).
**Test steps:**
1. Click bell — modal with empty state OR list of items.
2. If items exist: confirm unread items have an accent dot + bold title; counter shows unread count; **Mark all read** clears all dots.
3. Click an item -> marked read -> linked context opens (e.g., a row, plan, comment).
4. Hover to reveal delete (x); click to remove a single notification.

### F-072.A Local desktop notifications
**Test steps (desktop only):** Settings -> Notification preferences -> enable desktop notifications -> minimise the app -> trigger an event (e.g., another user shares a roadmap) -> OS-level notification should appear.

---

# Section 17 — Account & Settings

### F-073 Settings (gear)
**Where:** Sidebar -> bottom OR Account -> Settings.
**Test steps:**
- **Timeline**: Financial year start month, date format (DD/MM vs MM/DD).
- **Export defaults**: Excel / PDF.
- **Appearance**: Theme — Light / Dark.
- **Data management**: **Clear all roadmap data** (with confirm).
- **Integrations**: Slack button -> opens Slack integration modal; Calendar button -> opens calendar integration modal.
- **Help & Support**: **Open Help Guide**, **Replay Onboarding Tour**.
- **Save Settings** persists; **Cancel** discards.

### F-073.A Dark mode
**Test steps:** Switch theme to Dark. Confirm every page (Roadmap, Products, Checklist, ToDo, Plans, CapacityIQ, KPI, UCR, Artifacts, Reports, Insights, Integrations, Feedback, Billing, Settings, Profile, every modal) renders without white surfaces, all dropdowns have dark backgrounds, all SVG icons are visible (use `currentColor`).

### F-074 Account / Profile
**Where:** Top toolbar -> **Account**.
**Test steps:**
1. Banner: avatar (click to upload), name, email.
2. Edit name, company, phone, designation; **Save**.
3. Click avatar -> upload PNG/JPG <= 2 MB -> confirm avatar replaces.
4. Change password section: old password + new password + confirm -> **Update**.
5. Sign out button at the bottom.
**Expected result:** Avatar persists across reload AND across devices (synced via `userProfile.avatarUrl`).

### F-074.A Notification preferences
**Test steps:** Account -> notification preferences -> toggle row-watcher fanout, plan-followers, section-followers, share invites. **Save** -> persists.

### F-074.B Role
**Test steps:** Confirm role is read-only for non-managers (badge with role name + "Contact a Manager"). Managers see a dropdown to set their own role across Manager / Product Manager / Developer / Read Only.

### F-074.C Re-run Onboarding
**Test steps:** From Settings or Profile -> click **Re-run Onboarding Tour** -> tour starts.

### F-075 Currency selector
**Where:** Edit Product modal -> Revenue / ROI.
**Test steps:** Pick a currency from the 14-option dropdown. Save. Open another row -> confirm `appSettings.currency` is the new default.

---

# Section 18 — Integrations

### F-080 Open Integrations
**Where:** Sidebar -> **Integrations** (post v1.43.3 it lives in the burger sidebar, not the top nav).
**Test steps:**
1. Click **Integrations**.
2. Confirm the grid shows 5 cards: **Jira**, **GitHub**, **Slack**, **Asana**, **Linear**.
3. Each card shows: provider icon (real official Slack icon as of v1.45.1), description, feature pills (Import issues / Push updates / Two-way sync / Team picker), connection status dot, **Connect** OR **Configure / Sync Now / Disconnect** depending on state, and **Learn more** when disconnected.

### F-081 Connect a provider (per-provider differences inline)
**Test steps:**
1. Click **Connect** on a card.
2. The provider's OAuth window opens (Atlassian for Jira; GitHub OAuth Apps; Slack workspace; Asana; Linear).
3. Approve the requested scopes:
   - **Jira**: `read:jira-work write:jira-work read:jira-user offline_access`
   - **GitHub**: read+write issues
   - **Slack**: `channels:read chat:write incoming-webhook`
   - **Asana**: project read+write
   - **Linear**: team / issue scopes
4. Flow returns to `#integrations?connected=<provider>`. Card flips to **Connected** with the provider's account/site/project subtitle.
5. Toast: "<provider> connected successfully."
**Edge cases:**
- Provider rejects redirect URI (case-mismatch) -> no callback; popup must be closed manually.
- HTTP 404 from `/integrations-oauth/authorize/...` -> toast: "Edge functions not deployed. See INTEGRATION_SETUP_GUIDE.md".
- HTTP 500 with body -> toast surfaces the actual upstream error (e.g., "JIRA_CLIENT_ID not set").

### F-081.A Configure project / repo / channel / team
**Test steps:** Click **Configure** -> modal lists projects / repos / channels / teams returned by the provider's API -> pick one -> choose sync direction (Two-way / Import only / Push only) -> **Save**.

### F-081.B Sync Now
**Test steps:** Click **Sync Now** -> status spinner; toast confirms `{n} tasks/issues imported in {seconds}s`. Items appear in the linked Roadmap section / Plan / row.

### F-081.C Disconnect
**Test steps:** Click **Disconnect** -> confirm prompt -> card flips back to **Connect**.

### F-082 OAuth callback deep-link survives login
**Test steps:**
1. Sign out.
2. Paste `https://app.pmroadmapper.com/#integrations?connected=asana` (or the corresponding desktop deep-link).
3. Sign in.
**Expected result:** App lands on the Integrations page (not the dashboard), the toast confirms the connection, the URL is replaced with `#integrations`.

---

# Section 19 — Admin & Platform Admin

### F-090 User Management (per-org admin)
**Where:** Sidebar -> **User Management** (visible only to managers / super-admins).
**Test steps:**
1. List all org users with role + status.
2. Invite a user by email -> set role -> **Send invite**.
3. Edit a user's role -> confirm.
4. Remove / revoke a user -> confirm.

### F-091 Platform Admin (super-admin only)
**Where:** Sidebar -> **Platform Admin**.
**Test steps:**
1. Tabs: **Users**, **Stats**, **Teams**, **Orgs**, **Leads**.
2. **Users**: search across all platform users; change role; suspend; delete.
3. **Stats**: aggregate counts, MAU, DAU, plan tier breakdown.
4. **Teams / Orgs**: list, create, edit, delete platform-wide teams/orgs.
5. **Leads**: badge in sidebar indicates new leads; click to see lead detail.

---

# Section 20 — Billing & Subscription

### F-100 Open Billing
**Where:** Sidebar -> **Billing**.
**Test steps:**
1. Page shows current plan card (status, tier, days remaining, seats).
2. Plans grid: Standard ($17/mo), Pro ($25/mo), Standard Yearly ($170/yr), Pro Yearly ($250/yr) with feature lists.
3. Click **Switch to Pro** -> opens Paystack hosted page.
4. After payment, return to the app -> status flips to Active.
5. Click **Cancel subscription** -> confirms -> cancellation pending banner shows; subscription remains active until expiry.
6. Click **Update payment method** -> opens Paystack.

---

# Section 21 — Insights / Help / What's New

### F-110 Help Guide
**Where:** Settings -> **Open Help Guide** OR `?` FAB.
**Test steps:** Modal with left-nav tabs (Roadmap / G2M / ToDo / KPI / etc.). Click each tab -> corresponding cards render. Esc / X closes.

### F-110.A Help FAB (`?` floating button)
**Where:** Bottom-right floating ? button on every page.
**Test steps:** Click `?` -> menu: Help Guide, What's New, Contact Support.

### F-111 What's New
**Where:** Help FAB -> **What's New**.
**Test steps:**
1. A red dot on the FAB indicates an unseen release.
2. Click **What's New** -> modal renders the CHANGELOG.md content (latest first).
3. Closing it clears the red dot for this release.

---

# Section 22 — Data: Import / Export / Backup

### F-120 Save Backup (JSON)
**Where:** Legend -> Data dropdown -> **Save Backup**.
**Test steps:** Click **Save Backup** -> `.json` downloads. Open the file — contains `_appVersion`, `sections`, `rows`, `tabs_data`, `quarters`, `g2m`, `todo`, `kpi`, `ucr`, `capData`, `taskLibrary`, `documentRepository`, `appSettings`.

### F-121 Import Data (JSON restore)
**Where:** Data dropdown -> **Import Data**.
**Test steps:**
1. Click **Import Data** -> file picker.
2. Select a `.json` backup.
3. Confirm prompt: "Replace ALL current data with this backup?".
4. Click **Yes** -> data replaces; toast confirms; reload to verify cross-device sync.
**Edge cases:** Invalid JSON -> toast "Could not parse backup". Schema mismatch -> soft-merge with toast warning.

### F-122 Export Excel (Roadmap)
**Where:** Data dropdown -> **Export Excel**.
**Test steps:** Click -> `.xls` downloads. Open in Excel. Sheets: Sections, Initiatives, Quarters. Headers match the on-screen table.

### F-123 Export PDF (Roadmap)
**Where:** Data dropdown -> **Export PDF**.
**Test steps:** Click -> preview overlay opens with the roadmap table rendered -> click **Print** -> choose **Save as PDF** in the OS dialog.

### F-124 Excel template + import for roadmap
**Where:** Data dropdown -> **Import Data** -> also offers the Excel template path.
**Test steps:**
1. Click **Download Excel Template** -> blank `.xlsx` with Instructions / Sections / Initiatives sheets.
2. Fill it in.
3. Click **Import from Excel Template** -> preview -> **Import** -> roadmap populates.

### F-125 Paste from Spreadsheet
**Where:** Roadmap dropdown -> **Paste from Spreadsheet**.
**Test steps:** Modal opens with a textarea. Copy rows from Excel/Sheets -> paste -> preview -> confirm -> rows are inserted into the active section.

---

# Section 23 — Document Repository

### F-130 Document Repository (file uploads)
**Where:** Edit Product -> Attachments OR per-product Documents tab.
**Test steps:**
1. Drag-and-drop a file onto the attachment area.
2. Confirm upload progress + 50 MB ceiling enforced.
3. File appears in the list with download button + remove (X).
4. Click download -> file opens (Electron: native open; Web: browser save).
5. Folders: create a folder -> drag a file into it -> folder count updates.

---

# Section 24 — Voice Recording (legacy / removed from row modal)

### F-140 Voice recording dialog
**Where:** Programmatic only — no longer surfaces from the Edit Product modal as of v1.45.0.
**Test steps:** If invoked from a legacy code path, the dialog opens with mic + record button + transcribe. Confirm transcription appears in the parent textarea.

---

# Section 25 — Cross-cutting concerns

### F-150 Cross-device cloud sync
**Test steps:**
1. On device A: edit a row, add a section, change settings.
2. Reload on device B (same account).
**Expected result:** Within 5s of save on A, B reflects the change after reload (no manual sync). Toolbar shows a cloud-sync chip ("Syncing... / Saved").

### F-150.A Force sync via cloud chip
**Test steps:** Click the cloud chip -> status changes to "Syncing..." -> "Saved" within 5s.

### F-151 Offline behaviour
**Test steps:**
1. Disconnect network.
2. Edit a row; add a ToDo; close+reopen the app.
3. Reconnect.
**Expected result:** Local changes are queued; on reconnect they push automatically. The cloud chip flips from grey "Offline" to green "Saved".

### F-152 Keyboard shortcuts
**Test steps:**
- **Esc**: closes the topmost modal/overlay.
- **Tab / Shift+Tab**: traps inside modals (focus loops within the modal's focusable elements).
- **Enter / Space**: activates `role="button" tabindex="0"` divs (sidebar nav, logo zone).
- **Ctrl/Cmd+Enter** in a comment textarea: posts the comment.
- Backdrop click on a modal: closes it (unless `data-no-backdrop-close`).

### F-153 Tooltips on visible buttons
**Test steps:** Hover any sidebar nav item, dashboard card, view toggle, dropdown, modal Save/Cancel, auth button -> a native `title` tooltip appears within 500ms with a short, descriptive label (5-10 words).
**Expected result:** Coverage is at least 215 `title=` attributes on static buttons across the app.

### F-154 Top toolbar — cloud sync status
**Where:** Top toolbar -> cloud icon (between Share and Account when sync state changes).
**Test steps:** Click -> forces a sync; tooltip "Click to sync now". Visible only when there are unsaved changes.

### F-155 Top toolbar — Sidebar toggle
**Test steps:** Click the burger button -> sidebar collapses / expands. State persists across reload.

### F-156 Browser back / forward navigation
**Test steps:**
1. Navigate Roadmap -> Plans -> CapacityIQ.
2. Press browser **Back** twice -> CapacityIQ closes, Plans closes.
3. Press **Forward** twice -> returns to Plans, then CapacityIQ.
**Expected result:** Each `openX` overlay pushes a `#view` history entry. Popstate closes modals first, then navigates. First Back press never drops to the pre-login screen (boot calls `replaceState`).

### F-157 Mobile / narrow responsiveness
**Test steps:** Resize browser to 768px wide. Confirm sidebar collapses; toolbar nav wraps; cards stack to one column; modals are full-screen with scrolling body.

### F-158 Comments threading (per row)
**Test steps:** Edit Product -> Comments -> post a comment. Have user B (shared) post a reply. Confirm threading + author + timestamp + edit/delete affordances on own comments.

### F-159 Initiative pill click -> full editor with focus
**Test steps:** Click any initiative pill on the timeline. The full Edit Product modal opens with the clicked initiative scrolled into view AND briefly highlighted with a blue ring (~600ms).

### F-160 Emoji-free icon system
**Test steps:** Visual scan of every page: every icon is a stroke-based SVG (1.5-2px stroke, `currentColor`); no Unicode emoji anywhere. Confirm via `grep -Pc '[\x{1F300}-\x{1FAFF}]' renderer/index.html` returns `0`.

---

End of TEST_PLAN.md. Cross-references in `ACCEPTANCE_CRITERIA.md`.
