# Roadmap OS — Acceptance Criteria

**Version targeted:** v1.45.1
**Authored:** 2026-04-26

Each entry mirrors a feature ID in `TEST_PLAN.md`. Every checkbox must be objectively verifiable (provably true or false from observation). Generic non-functional concerns (dark mode, accessibility, error handling, persistence) are repeated per feature on purpose so testers can sign each off without cross-referencing.

---

# Section 1 — Authentication & Onboarding

### F-001 Email + password sign in
- [ ] Submitting valid credentials transitions to the dashboard / roadmap within 5 seconds.
- [ ] Submitting invalid credentials shows red `#authErr` text "Invalid login credentials" and keeps the user on the auth page.
- [ ] Pressing-and-holding the eye icon reveals the password while held; releasing hides it again.
- [ ] **Remember me** unchecked -> next browser-restart requires re-auth; checked -> session persists.
- [ ] **Forgot password?** link navigates to the reset view.
- [ ] Dark mode: auth screen uses CSS variables — no hardcoded white/black surfaces.
- [ ] Accessibility: email + password inputs have visible labels, focus rings, and submit on Enter.
- [ ] Error handling: every failure path produces either an inline error or a toast — never a silent failure.
- [ ] Persistence: a successful login persists across page refresh until manual sign-out (or until token expiry triggers refresh).

### F-002 Sign up
- [ ] All required fields (Email, Password, Confirm, Full Name, Company, Phone, Designation) are validated before submission.
- [ ] Password mismatch shows an inline error and does not submit.
- [ ] Existing email triggers a clear "Account exists" toast; no enumeration via timing differences.
- [ ] Successful signup auto-signs the user in and triggers the onboarding tour.
- [ ] All inputs have placeholders that match the documented examples.
- [ ] Dark mode + accessibility + error handling + persistence: as F-001.

### F-003 Forgot password
- [ ] Submitting a valid email shows a generic "If your account exists you'll receive a reset link" success message.
- [ ] Form returns to sign-in state after submission.
- [ ] Invalid email format triggers an inline validation error.

### F-004 Google + Microsoft OAuth
- [ ] Both buttons render with the correct provider logo + brand colours.
- [ ] Clicking opens the provider's OAuth flow in a new window or via redirect.
- [ ] Cancelling the flow returns the user to the auth screen with no error toast.
- [ ] First-time OAuth login auto-creates a user record AND seeds the empty roadmap.
- [ ] Calendar scopes (`calendar.readonly` for Google, `Calendars.Read` for Microsoft) are requested when the user clicks Connect on the Capacity page.

### F-005 Onboarding tour
- [ ] Auto-fires once on first login per user.
- [ ] **Replay Onboarding Tour** button in Settings always restarts the tour.
- [ ] Each step spotlights a real UI element and the tooltip is fully visible (no clipping).
- [ ] **Skip** dismisses the tour immediately and clears the spotlight.
- [ ] Esc key dismisses the tour.
- [ ] Tour overlay never blocks input after dismissal.

### F-006 Invite teammates
- [ ] Up to 10 emails can be entered at once.
- [ ] Invalid email format highlights the row red.
- [ ] **Pull Calendar Attendees** button only appears when Google Calendar is connected.
- [ ] Sent invites use the Roadmap OS branded email template with `app.pmroadmapper.com` CTA.
- [ ] Resend errors surface the specific upstream error (e.g., "verify domain", "RESEND_API_KEY rejected") in a toast.

---

# Section 2 — Roadmap

### F-010 Open the roadmap
- [ ] Top nav **Roadmap** link closes every overlay and shows the roadmap page.
- [ ] The Roadmap nav item gets the `.active` class.
- [ ] No console errors on navigation.

### F-010.A Logo upload
- [ ] Click on the logo zone opens an OS file picker filtered to image types.
- [ ] Accepted formats: PNG, JPG, SVG.
- [ ] Files > 5 MB are rejected with a toast.
- [ ] Uploaded logo persists across reload AND across devices (synced).

### F-010.B Edit roadmap header text
- [ ] Title, subtitle, author, description, portfolio badge are all `contenteditable`.
- [ ] Click anywhere on the text -> caret enters edit mode.
- [ ] Blur saves the value; reload preserves it.

### F-011 Sections — add / edit / delete
- [ ] **+ Add Section** opens an inline form with name + colour picker + Add + Cancel.
- [ ] Empty name -> Add button does nothing OR toast prompts for a name.
- [ ] Section colour swatch changes the header background; persists.
- [ ] Deleting a non-empty section prompts for confirmation; rows survive (orphaned).

### F-011.A Follow section
- [ ] Eye icon flips between "Follow this section to get alerts on changes" and "Stop following this section".
- [ ] State persists in `section.followers[]` and survives reload.

### F-012 Add row
- [ ] Edit Product modal opens with the chosen section pre-selected.
- [ ] Required field: Product Label. Save is disabled OR rejects empty submission.
- [ ] On save, row appears in the chosen section in real time.

### F-013 Drag-and-drop
- [ ] A 2px-tall horizontal accent-coloured indicator appears at the precise landing position above OR below the hovered row, depending on cursor Y.
- [ ] Cross-section drop updates `row.sec` and persists across reload.
- [ ] Drop directly onto a section header lands the row at the top of that section.
- [ ] No surrounding rows are displaced after drop.
- [ ] Drag end clears every drop indicator and `.dragging` class.
- [ ] Drop on the source position is a no-op (no console error).

### F-014 Sort within sections
- [ ] Default order, Priority (high -> low), Name (A-Z), Start month, End month all work.
- [ ] Section headers stay visible regardless of sort.
- [ ] Each section's rows reorder *within* the section; section ordering itself is unchanged.

### F-015 Range filter
- [ ] All / This Quarter / Next Quarter / H1 / H2 / YTD / This Fiscal Year all work.
- [ ] Hidden columns: month headers AND body cells AND quarter headers reduce colspan.
- [ ] Section header colspan shrinks to fit visible months (cached `data-_origColspan` restored on All).
- [ ] Today line is hidden when today falls outside the visible range.
- [ ] Selecting "All" restores every column; today line returns.

### F-016 Timeline / Kanban view
- [ ] Kanban renders **one card per initiative (bar)**, not per product.
- [ ] Each card shows parent product name, section, priority.
- [ ] Card status equals `bar.c` (not the row's "dominant" status).
- [ ] Drag between columns updates the bar's status; reload confirms persistence.
- [ ] Today line is removed when Kanban is active.
- [ ] Card click opens the full Edit Product modal with `_editFocusBarStart` set so the bar scrolls into view + briefly highlights.

### F-017 Today line
- [ ] Red vertical line aligns with the current month column on first render.
- [ ] Line repositions correctly after window resize.
- [ ] Line is hidden in Kanban view.
- [ ] Line is hidden when range filter excludes today.

### F-018 Tabs
- [ ] **+ New Tab** opens a chooser (independent vs stacked).
- [ ] Independent tabs have their own sections / rows / quarters.
- [ ] Stacked tabs render below the active tab.
- [ ] Pencil icon renames; X closes; switching is single-click.

### F-018.A Merge Roadmaps
- [ ] **Merge Roadmaps** button only renders when `tabs_data.length >= 2`.
- [ ] Modal pre-selects target = active tab; source = first other tab.
- [ ] Validates source != target.
- [ ] Stack mode appends every source section under fresh IDs.
- [ ] Merge mode combines sections by case-insensitive name; rows re-parent.
- [ ] All copied IDs are regenerated to avoid clashes.
- [ ] Source tab is preserved (not destructively merged).

### F-019 Quarters / FY controls
- [ ] **+ Add Quarter** appends one quarter; **+ Add Financial Year** appends 4.
- [ ] **Configure FY start month...** picker updates `Q_MONTH_MAP` so every visible quarter label is correct.
- [ ] **Remove last quarter** prompts for confirmation.
- [ ] **Edit Timeline** modal allows editing labels/years/months for every quarter; save updates the live timeline.

---

# Section 3 — Edit Product Modal

### F-020 Open Edit Product
- [ ] Modal centers on the screen with focus moved into the modal.
- [ ] Esc / X / Cancel / backdrop-click all close without saving (with confirm if dirty).
- [ ] Pill-click sets `_editFocusBarStart` and scrolls the matching bar into view + applies a ~600ms blue ring.
- [ ] Focus returns to the trigger element when the modal closes.

### F-020.A Edit product fields
- [ ] **Product Label**: required; empty submission rejected with inline error.
- [ ] **Product Description**: label sits above the textarea (not beside).
- [ ] **Section**: dropdown shows every section; inline new-section creates and selects in one click.
- [ ] **Priority**: 4 options including None.
- [ ] **Parent product**: optional; cycle protection (cannot pick own descendants).
- [ ] **Currency dropdown**: 14 currencies; default = `appSettings.currency` || USD; selection persists in `appSettings.currency` for next-row default.
- [ ] **Labels**: Enter to add; X to remove; suggestions from datalist.
- [ ] **Owner**: dropdown sourced from `userProfile + capData.members + roadmap row owners + plan task owners`.

### F-020.B Initiatives (timeline bars)
- [ ] **+ Add Initiative** creates a new bar block.
- [ ] Start month <= End month enforced (otherwise warning).
- [ ] Colour swatch options: Released / In Progress / Delayed / Strategy / At Risk.
- [ ] Save updates all bars on the row.

### F-020.C Deliverables
- [ ] **+ Add** appends a deliverable row with name + due date.
- [ ] Deliverables appear on `Reports -> Deliverables Tracker` after save.

### F-020.D Links + Attachments
- [ ] **+ Add Link**: URL + label; opens in new tab on click.
- [ ] **+ Attach File**: 50 MB ceiling; rejection toast on oversize.
- [ ] Each attachment row has a download icon + remove (X).
- [ ] Download tries `window.electronAPI.openAttachment` first, then `data:`/`http(s):`/`blob:` URL anchor download, then Supabase Storage download.
- [ ] Failures show a toast (not silent).

### F-020.E Linked Initiatives
- [ ] **+ Link** modal lists all rows from this AND shared roadmaps.
- [ ] Selecting a target adds a chip with the target name + relationship.
- [ ] Inverse link appears in the target row's edit modal.

### F-020.F Expected Outcomes
- [ ] **+ Add** creates a row with metric, target, units, timeframe, hypothesis fields.
- [ ] All fields persist; outcomes feed `Reports -> Launch Outcomes`.

### F-020.G Launch Outcomes & Release Notes
- [ ] Release date input.
- [ ] 3 audience tabs (Dev / Customer / Internal) with separate textareas.
- [ ] Status badge reads `Released DD MMM YYYY` after save.

### F-020.H Comments thread
- [ ] Comment textarea + Post button.
- [ ] Posted comments show timestamp + author + delete (own comments).
- [ ] Comment count badge updates live.
- [ ] Ctrl/Cmd+Enter in the textarea posts the comment.

### F-020.I Save / Cancel
- [ ] **Save** button has `title="Save the product and all its initiatives"`.
- [ ] **Cancel** button has `title="Discard changes and close"`.
- [ ] Modifying any field then clicking Cancel prompts for discard confirmation.

### F-021 Row kebab menu
- [ ] Menu items: Edit, Duplicate, Move up, Move down, Recolour, Follow product / Unfollow product, Follow section / Unfollow section, Add comment, Delete.
- [ ] Delete prompts for confirmation.
- [ ] Duplicate creates a copy with `(copy)` suffix.

### F-022 Add Section form
- [ ] Inline form with name + colour + Add (green) + Cancel.
- [ ] Add button has `title="Create the new section"`; Cancel has `title="Discard and close the new-section form"`.

### F-023 Edit Section
- [ ] Pencil icon on section header opens an edit modal.
- [ ] Saved changes apply immediately; reload confirms persistence.

### F-024 Edit Quarters
- [ ] Modal lists every quarter with editable label + year + month inputs.
- [ ] Save updates the live timeline header AND today-line position.

### F-025 Bar (initiative) modal — legacy
- [ ] Still reachable from legacy code paths; not surfaced from Edit Product as of v1.45.0.
- [ ] Fields: name, description, colour, start, end. Save persists.

---

# Section 4 — Products Page

### F-030 Open Products
- [ ] Page renders summary bar + search + filters + view toggle.
- [ ] Empty state copy: "No products match the current filters. Add initiatives on the Roadmap to see them here, or clear filters above."

### F-030.A Filter / search
- [ ] Search filters live across `name + code + family + owner + tagline`.
- [ ] Type, Stage, Status filters narrow visible rows.
- [ ] Combining search with a filter intersects results.

### F-030.B Table sort
- [ ] Each sortable column header has hover affordance.
- [ ] First click -> ascending; second click on same column -> descending.
- [ ] Active sort key shows arrow indicator.

### F-030.C Card view
- [ ] Cards have product image OR type icon, name, code, status badge, tagline, type / stage / version badges, label pills (max 4 + count), revenue / open bugs / progress %, owner + updatedAt.

### F-031 Product detail (8 tabs)
- [ ] All 8 tabs render without error: Overview, Commercial, Releases & Bugs, Plan & Tasks, Specs, History, Documents, Discussion.
- [ ] Specs hides Hardware section for digital-only products; hides Digital section for hardware-only products; Quality & Support always visible.
- [ ] History timeline filters by 10 event types (chips).

### F-031.A Product detail Edit / Watch
- [ ] **Edit** opens the row edit modal.
- [ ] **Watch** toggles `row.watchers[]`; label flips between **Watch** and **Watching**.

---

# Section 5 — Checklist

### F-040 Open Checklist
- [ ] Product dropdown is populated from `rows[]` grouped by section.
- [ ] Header readiness % = (Yes count + N/A count weighted) / total applicable.
- [ ] Score bar is red < 50, amber 50-79, green >= 80.
- [ ] 14 categories load with their items (engineering, PM, software, international, infrastructure, logistics, finance, GSM contracts, installations, PSD, ECC, sales, marketing, legal).

### F-040.A Set item value
- [ ] Yes / No / N/A radios update score in real time.
- [ ] Comment field auto-saves on blur.
- [ ] **+ link** adds a URL row with title + URL + delete.
- [ ] **+TDL** opens a date picker -> creates a ToDo entry tagged with the initiative + KPI.

### F-040.C Custom row
- [ ] Inline form: text input + From Library button + category dropdown + Add + Cancel.
- [ ] Custom row joins the chosen category; persists.

### F-040.D Convert to Plan
- [ ] Creates a new plan with all checklist items as tasks.
- [ ] Plans page opens after confirmation.

### F-040.E Celebration overlay
- [ ] Fires only on transition from incomplete to complete.
- [ ] 80 confetti pieces animate; SVG check-circle icon (no emoji); "Congratulations!" headline; Continue button.
- [ ] Web Audio API arpeggio (C5 / E5 / G5 / C6) plays — wrapped in try/catch (silent failure on autoplay-block browsers).
- [ ] Auto-dismisses after 6s.
- [ ] Doesn't replay on subsequent edits to an already-complete list.
- [ ] Dark-mode aware: dialog uses `var(--white)` so the dark theme inverts cleanly.

### F-040.F Templates buttons
- [ ] **Browse Templates** -> unified library scoped to `g2m`.
- [ ] **GTM Templates** -> calls `openTemplateBuilder('checklist', { initiativeName: g2mCurrentProduct })`; falls back to legacy `openG2MTemplateBuilder()` when unified library isn't loaded.

### F-040.H Export Word
- [ ] Click -> `.docx` downloads.
- [ ] Document includes every category, item statuses, comments, links.

---

# Section 6 — ToDo

### F-050 Open ToDo
- [ ] Header counts: Open (default colour), In Progress (amber), Done (green).
- [ ] Filters: Initiative + Status.
- [ ] Buttons: + Add Task, From Library, Templates, Kanban toggle, Back to Roadmap.

### F-050.A Add task
- [ ] Inline form with description, initiative, due date, estimate, KPI.
- [ ] Description input has autocomplete from task library.
- [ ] Default status: open.

### F-050.B Add from library
- [ ] Multi-select across G2M / Plans / Library tabs.
- [ ] Per-tab Select All checkbox (with per-source category checkboxes on G2M).
- [ ] Imported tasks land in the active initiative bucket.

### F-050.D Status change
- [ ] Dropdown per task: Open -> In Progress -> Done.
- [ ] Date colours flip (red overdue, amber within 7d, green OK).

### F-050.F Hours
- [ ] Estimate input (number, step 0.5).
- [ ] Actual hours input on the task edit modal.
- [ ] Hours field has a hover-only `?` tooltip that explains effort tracking.

### F-050.H Kanban view
- [ ] 3 columns: Open / In Progress / Done.
- [ ] Drag a card -> drop in another column -> status flips + persists.
- [ ] Click a card -> opens the Edit Task modal.

### F-051 Timesheet
- [ ] Weekly target = `getCapHours().hpw` (default 35).
- [ ] Prev/next-week buttons navigate by 7 days.
- [ ] Tasks with logged actual hours appear; KPI breakdown table shows hours/KPI vs target.
- [ ] **Open ToDo List** -> returns to ToDo; **Back to Timesheet** returns.

---

# Section 7 — Plans

### F-060 Open Plans
- [ ] Sidebar: + New plan button + plans list + Back to Roadmap.
- [ ] Topbar: plan name input + linked rows + view toggles + Templates / Upload Excel / Save as template / Follow / Share / + Add task.

### F-060.B Plan views
- [ ] List view: editable rows with status / priority / owner / dates / hours / KPI.
- [ ] Timeline view: bars on a calendar; Filter button opens status/priority/owner picker; Unplanned counter toggles a no-dates filter; bottom horizontal scrollbar visible.
- [ ] Gantt view: dependency arrows; alternating row stripes / grid lines / month labels switch with theme.
- [ ] Kanban view: status columns; drag to change.

### F-060.C Add task
- [ ] Modal with description / owner / dates / hours / priority / status / KPI / predecessors / parent (sub-task).

### F-060.D Predecessors
- [ ] Picker excludes the current task.
- [ ] Circular dependencies blocked with toast.

### F-060.E Sprint bar
- [ ] Renders only when an active sprint exists.
- [ ] Shows: sprint goal, DoD, DoR toggles, velocity, points -> hours tracker.
- [ ] Buttons centered (v1.34.0 toolbar centering fix).

### F-060.F Save as Template
- [ ] Modal: name, category, description, tags.
- [ ] Save adds the template to the user-organisation scope of the Template Library.

### F-060.G Upload Excel
- [ ] Supported sources: MS Project, MS Planner, Asana, Jira, ClickUp.
- [ ] Preview table maps columns; user can adjust mappings before import.

### F-060.H Share plan
- [ ] Email-based share; recipient sees the plan as read-only or commenter.

### F-060.I Follow plan
- [ ] Toggle between Follow and Following.
- [ ] Plan changes deliver notifications to followers.

---

# Section 8 — CapacityIQ

### F-061 Open CapacityIQ
- [ ] Sidebar: Dashboard, Templates, Teams & People, Task Library.

### F-061.A Dashboard heatmap
- [ ] Team x Sprint matrix.
- [ ] Cell colour: green 0-75 %, amber 76-95 %, red >= 96 %.
- [ ] Hover shows team / sprint / allocated / available.

### F-061.B Per-team capacity strip
- [ ] Renders above the heatmap.
- [ ] Each team shows: capacity / allocated / available + utilisation bar.
- [ ] Members on multiple teams contribute hours to each team they belong to.

### F-061.C Capacity defaults
- [ ] **Hours per week** input updates weekly/monthly/yearly breakdowns + timesheet target immediately.
- [ ] `appSettings.capacity.hoursPerDay` and `workDays` editable from Settings.

### F-061.D Teams & People
- [ ] **+ Add Team**: name, colour, logo (<= 200 KB base64), members.
- [ ] Per-member: role + hours/day + productivity factor.
- [ ] **Edit Memberships** allows multi-team assignment.

### F-061.E Templates
- [ ] All bundled platform templates (35+) render after the library hydrates.
- [ ] Each card shows `svgIcon(t.icon)` tinted by category colour (no hardcoded grid icon).
- [ ] **Use** populates a new initiative.

### F-061.F Task Library
- [ ] Search by name/category/owner.
- [ ] Category filter dropdown lists every category with counts.
- [ ] Sort: most-used first then alphabetical.
- [ ] **+ Add task**, **Bulk upload** (Excel), **Template** download.

### F-061.G Calendar integration
- [ ] Connect Google Calendar — OAuth with `calendar.readonly` scope.
- [ ] Connect Outlook — OAuth with `Calendars.Read` scope.
- [ ] **Sync now** previews events with quarter-hour rounded durations + source tag.
- [ ] Disconnect button revokes the token (clears `appSettings.integrations.google` / `.microsoft` connection state).
- [ ] Tokens stored only in `roadmap_data` JSONB (per-user RLS).

---

# Section 9 — KPI Scorecard

### F-062 Open KPI
- [ ] Header: Scorecard / Timesheet toggle + quarter dropdown (FY25-FY28) + overall score + + Add KPI.

### F-062.A Scorecard
- [ ] 10 default KPIs grouped into 4 groups.
- [ ] Each row has PM Score, Target, Manager Score, Approved checkbox, RAG status, gap indicator.

### F-062.B Score
- [ ] Approved checkbox makes Manager Score take precedence in roll-up.
- [ ] RAG: green (3-4), amber (2), red (0-1).

### F-062.C Evidence
- [ ] **+ Link** adds URL.
- [ ] **Attach** uploads a doc.
- [ ] **+ Meeting** logs date / attendees / outcomes / actions for Integration KPIs.
- [ ] **+ Training** logs date / audience / count / materials for Training KPI.

### F-062.E Auto-populated metrics
- [ ] Product Roadmaps row: linked to roadmap data.
- [ ] Product Delivery row: shows G2M average readiness across products.
- [ ] Product Performance row: shows ToDo task completion rate.

### F-062.G Export Word
- [ ] Click -> `.docx` downloads with formatted scorecard.

### F-062.H Timesheet
- [ ] Pulls actual hours from ToDo tasks.
- [ ] Shows logged total / weekly target / utilisation %.
- [ ] KPI breakdown table.

---

# Section 10 — UCR

### F-063 Open UCR
- [ ] **+ New UCR** expands a card with all fields.
- [ ] Status filter: Draft / Submitted / Approved / Rejected / Implemented.

### F-063.B Systems impact checklist
- [ ] 19 systems each with Yes / N/A.

### F-063.E Export Word
- [ ] Document includes every field, the systems table, and signature lines.

---

# Section 11 — Artifacts

### F-064 Open Artifacts
- [ ] + New Artifact, Brand Guide, Templates buttons.
- [ ] Filters: Initiative + Type.

### F-064.A New Artifact
- [ ] Modal with title, type (10 options), initiative, description, AI instructions, reference docs, visual template, output format (Word/PowerPoint/Excel/PDF).
- [ ] Save as Draft OR Generate with AI buttons.
- [ ] AI generation uses the configured provider + model + key.

### F-064.B Brand Guide
- [ ] Upload CI guide.
- [ ] **AI Analyse** auto-extracts colours, fonts, tone.
- [ ] Manual entry: hex colours (with visual swatches), fonts, logo URL, brand assets, style notes.

### F-064.C Templates
- [ ] One template per artifact type (10 types).
- [ ] "Configured" badge reflects upload state.

---

# Section 12 — Prioritization

### F-065 Open
- [ ] Sidebar: Top 10, Score, Frameworks, Matrix, OKRs.

### F-065.C Matrix
- [ ] Every initiative plots — rows with no scores get default position (`_defaultMatrixXY`: Y from priority, X = 5 midpoint).
- [ ] **Select All** checkbox at the top of the items panel toggles every row on/off.
- [ ] Items panel = 280 px wide; chart column has `min-width: 0`; outer grid `max-width: 100%; overflow: hidden`.
- [ ] Drag a dot updates the row's score; persists.
- [ ] Display popover (Labels / Bubble / Color) clamps to viewport.

### F-065.E OKRs
- [ ] **+ New Objective** creates an objective with title / period / description.
- [ ] **+ Add Key Result** adds a KR with target / current / unit + linked initiatives picker.
- [ ] Progress % auto-calculates per KR and per Objective.
- [ ] Delete prompts for confirmation.

---

# Section 13 — Reports

### F-066 Open
- [ ] 12 reports in the sidebar.
- [ ] Sidebar item shows icon + name + short description.

### F-066.A Each report renders without console error
- [ ] **Initiative Health**.
- [ ] **Weekly Status** — Shipped / Shipping next / Blocked groupings.
- [ ] **Launch Outcomes** — closing-the-loop table per shipped initiative + 3-audience release-notes editor + feedback thread + audience filter + Include unreleased toggle + Export to Markdown.
- [ ] **OKR Progress**.
- [ ] **Sprint Metrics**.
- [ ] **G2M Readiness**.
- [ ] **Prioritisation**.
- [ ] **Weekly Capacity**.
- [ ] **Change Requests**.
- [ ] **Roadmap Change Log** — latest 200 add/edit/delete entries with action badge + user.
- [ ] **QBR Pack**.
- [ ] **Deliverables Tracker**.

---

# Section 14 — Insights / Competitive / Feedback

### F-067 Insights
- [ ] AI suggestions render with risk badges.
- [ ] Saved analyses (top 3) appear at the bottom.

### F-068 Competitive Intel
- [ ] Add competitor -> name + URL + Save.
- [ ] Analyse -> AI returns positioning + gaps.
- [ ] Save -> analysis appears in saved list.

### F-069 Feedback
- [ ] Inbox count chip updates live.
- [ ] Public submission link can be copied.
- [ ] Each item has vote count + status flow (Triage -> Planned -> In Progress -> Shipped -> Declined).
- [ ] Items can be linked to roadmap rows.

---

# Section 15 — Template Library

### F-070 Open Template Library
- [ ] Search input filters by name/category/tags.
- [ ] Scope filter: All / Platform / My Organisation.
- [ ] Category filter populated dynamically.

### F-070.A Upload Template
- [ ] Excel pickup auto-detects context; preview shown before save.

### F-070.B Create Template
- [ ] **+ Create Template** visible only to admins.
- [ ] Modal: name, category, tasks (multi-select from library).

### F-070.C Use a template
- [ ] Picks target context (Plans / ToDo / Checklist / CapacityIQ).
- [ ] Tasks land with default hours/owner/category preserved.

---

# Section 16 — Sharing & Notifications

### F-071 Share Roadmap
- [ ] Email validation enforced (must contain `@`).
- [ ] Success banner appears in green; error banner in red.
- [ ] Shared chip appears in "Currently shared with"; **Revoke** removes access after confirmation.
- [ ] Recipient sees the shared roadmap as a tab on next login.

### F-072 Notifications
- [ ] Bell icon shows red dot + count when unread > 0.
- [ ] Modal lists items with icon + title (bold for unread) + detail + time + accent dot for unread.
- [ ] **Mark all read** clears every dot.
- [ ] Clicking an item: marks read AND opens its linked context.
- [ ] Hover delete (X) removes a single notification.

### F-072.A Local desktop notifications
- [ ] Settings toggle for desktop notifications.
- [ ] OS-level notification fires for share invites, comment mentions, plan-follower events.

---

# Section 17 — Account & Settings

### F-073 Settings
- [ ] Sections: Timeline, Export defaults, Appearance, Data management, Integrations, Help & Support.
- [ ] **Save Settings** persists; **Cancel** discards.

### F-073.A Dark mode
- [ ] Theme toggle in Settings -> Light / Dark.
- [ ] Every page (Roadmap, Products, Checklist, ToDo, Plans, CapacityIQ, KPI, UCR, Artifacts, Reports, Insights, Integrations, Feedback, Billing, Settings, Profile, every modal) uses CSS variables — no hardcoded white/black.
- [ ] Dropdowns / `<select>` / `<option>` / custom dropdowns: explicit dark background + light text in dark mode.

### F-074 Account
- [ ] Banner: avatar + name + email; clickable avatar opens file picker (<= 2 MB).
- [ ] Edit name / company / phone / designation; **Save** persists across reload + cross-device.
- [ ] Change password: old + new + confirm.
- [ ] Sign out works in one click.

### F-074.A Notification preferences
- [ ] Toggles for row-watcher fanout, plan followers, section followers, share invites.

### F-074.B Role
- [ ] Read-only badge for non-managers.
- [ ] Manager dropdown allows changing own role across the 4 options.

### F-074.C Re-run Onboarding
- [ ] Settings -> **Re-run Onboarding Tour** restarts the tour.

### F-075 Currency
- [ ] 14-currency dropdown next to Revenue/ROI.
- [ ] Selection persists in `appSettings.currency` for future row-modal defaults.

---

# Section 18 — Integrations

### F-080 Open Integrations
- [ ] Integrations entry lives in the burger sidebar (not top nav) per v1.43.3.
- [ ] Grid shows 5 cards: Jira, GitHub, Slack, Asana, Linear.
- [ ] Slack card uses the official Slack icon (v1.45.1).

### F-081 Connect a provider
- [ ] **Connect** opens the provider's OAuth flow (popup OR `window.electronAPI.openExternal` on desktop).
- [ ] Flow returns to `#integrations?connected=<provider>` and the card flips to **Connected** with subtitle from `config` (siteName, repo, channel, projectName, teamName).
- [ ] Edge function 404 -> toast: "Edge functions not deployed. See INTEGRATION_SETUP_GUIDE.md".
- [ ] Edge function 500 with body -> toast surfaces the actual upstream error.
- [ ] Successful connection toast: "<Provider> connected successfully."

### F-081.A Configure
- [ ] Modal lists provider's projects/repos/channels/teams.
- [ ] Sync direction: Two-way / Import only / Push only.
- [ ] Save persists `sync_direction` and selected resource.

### F-081.B Sync Now
- [ ] Trigger immediate import.
- [ ] Toast confirms count of items imported in seconds.
- [ ] `last_synced_at` updates on the card.

### F-081.C Disconnect
- [ ] Confirms before disconnecting.
- [ ] Card flips back to **Connect**; `integration_connections` row marked disconnected.

### F-082 OAuth deep-link
- [ ] Visiting `#integrations?connected=asana` while signed-out -> after sign-in, app lands on Integrations (not dashboard).
- [ ] URL query string is preserved through the auth round-trip.
- [ ] After handling, URL is replaced with `#integrations` (query stripped).

---

# Section 19 — Admin

### F-090 User Management
- [ ] Visible only to managers / super-admins (`_isSuperAdmin || isManager()`).
- [ ] Can list, invite, edit role, suspend, remove org users.

### F-091 Platform Admin
- [ ] Visible only to platform admins / super-admins.
- [ ] Tabs: Users, Stats, Teams, Orgs, Leads.
- [ ] New-leads badge on the sidebar item.

---

# Section 20 — Billing

### F-100 Open Billing
- [ ] Current-plan card shows status badge (Active / Trial / Past due / Cancelled / No subscription) + tier + days remaining + seat count.
- [ ] Plans grid: Standard $17/mo, Pro $25/mo, Standard Yearly $170/yr, Pro Yearly $250/yr with Save labels.
- [ ] Switch buttons open Paystack hosted page for monthly plans; yearly switches open a `switch_plan` request.
- [ ] **Cancel subscription** triggers a confirm + creates a `cancel` `billing_request`; banner shows "Cancellation requested. Your subscription will run until ...".
- [ ] **Update payment method** opens Paystack.

---

# Section 21 — Help / What's New

### F-110 Help Guide
- [ ] Modal with left-nav tabs.
- [ ] First tab is auto-active.
- [ ] Esc / X closes.

### F-110.A Help FAB
- [ ] Bottom-right floating ? button on every signed-in page.
- [ ] Menu: Help Guide, What's New, Contact Support.

### F-111 What's New
- [ ] Red dot on FAB when there's an unseen release (`APP_VERSION` > last-seen).
- [ ] Modal renders `CHANGELOG.md` content with newest first.
- [ ] Closing clears the red dot for the current version.

---

# Section 22 — Data Import / Export

### F-120 Save Backup
- [ ] Click -> `.json` downloads.
- [ ] File contains `_appVersion + sections + rows + tabs_data + quarters + g2m + todo + kpi + ucr + capData + taskLibrary + documentRepository + appSettings`.

### F-121 Import Data (JSON)
- [ ] File picker accepts `.json`.
- [ ] Confirm prompt: "Replace ALL current data with this backup?".
- [ ] Successful import shows toast + reloads the roadmap.
- [ ] Invalid JSON -> toast "Could not parse backup".

### F-122 Export Excel (Roadmap)
- [ ] Click -> `.xls` downloads.
- [ ] Sheets: Sections, Initiatives, Quarters.

### F-123 Export PDF (Roadmap)
- [ ] Click -> preview overlay opens with the roadmap rendered.
- [ ] Print -> Save as PDF works on all major browsers.

### F-124 Excel template
- [ ] **Download Excel Template** generates a `.xlsx` with Instructions / Sections / Initiatives sheets.
- [ ] **Import from Excel Template** previews + maps columns before populating.

### F-125 Paste from Spreadsheet
- [ ] Modal with textarea.
- [ ] Pasted rows preview-parse into the active section.
- [ ] Confirm to insert.

---

# Section 23 — Document Repository

### F-130 Document Repository
- [ ] Drag-and-drop file upload.
- [ ] 50 MB ceiling; oversize files rejected with toast.
- [ ] Upload progress visible.
- [ ] Files persist in Supabase Storage `attachments` bucket with path-scoped RLS by `auth.uid()`.
- [ ] Download button per file.
- [ ] Folders: create / rename / delete; drag files between folders.

---

# Section 25 — Cross-cutting

### F-150 Cloud sync
- [ ] Save -> cloud chip flashes "Syncing..." -> "Saved" within 5s.
- [ ] Cross-device: change on A appears on B after reload (no manual sync) within 5s.
- [ ] Forcing sync via the cloud chip is idempotent.

### F-151 Offline behaviour
- [ ] Edits while offline are queued locally.
- [ ] Reconnect auto-flushes the queue.
- [ ] Cloud chip visibly toggles between Offline / Saved.

### F-152 Keyboard shortcuts
- [ ] Esc closes the topmost modal/overlay (z-index aware).
- [ ] Tab/Shift+Tab traps focus inside modals.
- [ ] Enter/Space activate `role="button" tabindex="0"` divs.
- [ ] Ctrl/Cmd+Enter posts a comment.
- [ ] Backdrop click closes modals (unless `data-no-backdrop-close`).

### F-153 Tooltips
- [ ] At least 215 `title=` attributes on static buttons (verified via `grep -cE 'title="' renderer/index.html >= 215`).
- [ ] All sidebar nav items, dashboard cards, view toggles, dropdowns, modal Save/Cancel, auth buttons have descriptive tooltips (5-10 words).

### F-154 Cloud sync chip
- [ ] Visible only when there are unsaved changes.
- [ ] Click forces a sync.
- [ ] Tooltip "Click to sync now".

### F-155 Sidebar toggle
- [ ] Burger button collapses/expands the sidebar.
- [ ] Collapse state persists across reload.

### F-156 Browser back/forward
- [ ] Each `openX` overlay pushes a `#view` history entry.
- [ ] Back closes overlays in reverse open order before navigating away from the SPA.
- [ ] Boot calls `history.replaceState` so the first Back never drops to the auth screen.

### F-157 Mobile responsiveness
- [ ] At <= 768px width: sidebar collapses; toolbar nav wraps; cards stack to one column; modals are full-screen.

### F-158 Comments threading
- [ ] Per-row comment thread persists.
- [ ] Author name + avatar + timestamp on each comment.
- [ ] Edit / delete affordances visible only on own comments.

### F-159 Pill click -> focused full editor
- [ ] Click any timeline pill -> Edit Product modal opens.
- [ ] Clicked initiative scrolls into view + briefly highlights with a blue ring (~600ms).

### F-160 Emoji-free icons
- [ ] `grep -Pc '[\x{1F300}-\x{1FAFF}]' renderer/index.html` returns `0`.
- [ ] Every icon is a stroke-based SVG (1.5-2 px stroke, `currentColor`).

---

# Universal acceptance criteria (apply to every feature)

For each feature above, the following must also hold true unless explicitly noted otherwise:

- [ ] **Dark mode**: All elements use CSS variables (`var(--page-bg)`, `var(--card-bg)`, `var(--text)`, etc.). No hardcoded white/black backgrounds.
- [ ] **Accessibility**: Keyboard navigable. Focus visible. ARIA roles where appropriate (`role="dialog"` + `aria-modal="true"` on every `.modal-overlay`).
- [ ] **Error handling**: Failures show a toast OR inline error — never silent. Console errors inspectable for dev review.
- [ ] **Persistence**: State survives a page reload AND cross-device sync (or the test plan explicitly notes that it's session-only).
- [ ] **Performance**: Interactions complete within 500 ms perceived latency for local actions; within 5 s for cloud-bound actions.
- [ ] **No regressions**: existing features (roadmap, ToDo, KPI, etc.) still render after the new feature is exercised.
- [ ] **Single-file SPA pattern preserved**: no new top-level files in `renderer/` (per `CLAUDE.md`).
- [ ] **No emoji**: per `CLAUDE.md`. Icons are SVG only.

---

End of ACCEPTANCE_CRITERIA.md.
