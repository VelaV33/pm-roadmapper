# PM Roadmapper — User Guide

**Version 1.1.0 | April 2026**

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Main Roadmap](#main-roadmap)
3. [G2M Checklist](#g2m-checklist)
4. [ToDo List](#todo-list)
5. [KPI Scorecard & Timesheet](#kpi-scorecard--timesheet)
6. [User Change Requests (UCR)](#user-change-requests)
7. [Artifacts & Collateral](#artifacts--collateral)
8. [CapacityIQ](#capacityiq)
9. [Settings](#settings)
10. [Roles & Permissions](#roles--permissions)
11. [Data Import & Export](#data-import--export)
12. [Keyboard Shortcuts & Tips](#tips)

---

## 1. Getting Started

### Installation
1. Run `PM Roadmapper Setup 1.1.0.exe`
2. The app installs to your user profile (no admin required)
3. A desktop shortcut is created automatically

### First Login
1. Open PM Roadmapper
2. Enter your email and password, or click **Create Account**
3. On first login, an **interactive tour** walks you through every feature
4. Click the **?** button in the toolbar anytime to replay the tour

### Your Data
- All data saves automatically (local + cloud sync)
- Each user has their own isolated data — no cross-user leakage
- Cloud sync happens in the background on every save
- Works offline; syncs when back online

---

## 2. Main Roadmap

The roadmap is a timeline view of all your product initiatives.

### Viewing the Roadmap
- **Timeline**: Columns represent months, grouped by financial year quarters (FY runs Apr-Mar)
- **Red "Today" line**: Shows current date position on the timeline
- **Sections**: Colour-coded groups (e.g., Overarching Strategy, Product Initiative, Globalization)
- **Rows**: Each row is an initiative with timeline bars

### Row Features
- **Number**: Sequential per section
- **Priority badge**: P1 (red), P2 (amber), P3 (green)
- **G2M badge**: Shows readiness % if G2M data exists — click to open G2M
- **ToDo badge**: Shows outstanding task count — click to open ToDo
- **Drag handle** (⠿): Drag rows to reorder within a section
- **Edit** (✎): Open the row edit modal
- **Comments** (💬): Add threaded comments per row

### Editing a Row
Click any row name or the ✎ button to open the edit modal:
- **Row Label**: Name of the initiative
- **Priority Level**: P1 (Critical), P2 (Important), P3 (Nice to Have)
- **Section**: Which group this row belongs to
- **Product Initiatives**: Timeline bars with name, status colour, date range
- **Deliverables**: Key milestones
- **Links**: URLs to related resources
- **Attachments**: Upload documents
- **Status & Tracking**: Shows G2M readiness score and ToDo outstanding items

### Adding Content
- **+ Row button**: Appears between rows on hover
- **Content dropdown** (✏): Add Row or Add Section
- **Sections**: Create colour-coded groups to organise initiatives

### Timeline Bars
Each initiative can have multiple bars:
- **Blue**: In Progress / Development
- **Green**: Released / Complete
- **Amber**: At Risk / Warning
- **Grey**: Planning / Backlog
- **Red**: Blocked / Critical

---

## 3. G2M Checklist

**Go-To-Market Business Readiness** — ensures you're ready to launch a product.

### Opening G2M
Click the green **🚀 G2M** button in the toolbar.

### Product Selection
- Dropdown at top shows ALL initiatives from your roadmap, grouped by section
- Each product gets its own independent checklist

### Product Description
- Rich text area below the product selector
- Paste images (Ctrl+V) or type text
- Saved per initiative

### Checklist
126+ items across 14 departments:
- Technology - Engineering (19 items)
- Technology - Product Management (6 items)
- Technology - Software and Systems (19 items)
- International (4 items)
- Technology - Infrastructure (7 items)
- Logistics (13 items)
- Finance (8 items)
- GSM Contracts (11 items)
- Operations: Installations (5 items)
- Operations: PSD (6 items)
- Operations: ECC (10 items)
- Sales (8 items)
- Marketing (9 items)
- Legal (3 items)

### For Each Item
- **YES / NO / N/A** radio buttons
- **Comment** field
- **Links**: Click "+ link" to add supporting URLs
- **+TDL button**: Send item to ToDo List with a due date

### Scoring
- **Overall readiness %** at the top (Yes / total applicable items)
- **Per-department %** on each category header
- N/A items excluded from scoring
- Colour coded: Red (<50%), Amber (50-79%), Green (80%+)

### Export
- **Export Word** (full checklist): Header button
- **Per-department Export**: Button on each category header

### Custom Rows
Click **+ Add Custom Row** to add your own checklist items to any category.

---

## 4. ToDo List

Task management with Kanban board, time tracking, and KPI integration.

### Opening ToDo
Click the purple **📋 ToDo** button in the toolbar.

### Creating Tasks
1. Click **+ Add Task**
2. Fill in: task description, initiative, due date, hour estimate, KPI attribute
3. Click **Add**

### Task Features
- **Status**: Open → In Progress → Done (dropdown per task)
- **Due date**: Colour-coded (red=overdue, amber=within 7 days, green=ok)
- **Hour estimate**: Set when creating
- **Actual hours**: Log when working on the task
- **KPI attribute**: Link task to a KPI for timesheet tracking
- **Comments**: 💬 button for inline comments
- **Links**: 🔗 button to attach URLs
- **Edit**: Double-click task text to edit inline

### Filters
- **Initiative filter**: Show tasks for a specific product
- **Status filter**: All / Open / In Progress / Done

### Kanban Board
Click **🔲 Kanban** to switch to board view:
- Three columns: Open, In Progress, Done
- **Drag and drop** cards between columns
- Cards show initiative tag, due date, comments

### Integration
- Tasks pulled from G2M via "+TDL" button
- Actual hours feed into the KPI Timesheet
- Tasks visible in the row edit modal under "Status & Tracking"

---

## 5. KPI Scorecard & Timesheet

### Opening KPIs
Click the teal **📊 KPIs** button in the toolbar.

### Scorecard View
10 KPIs across 4 groups, each scored 0-4 (total 40):

| Group | KPIs |
|-------|------|
| Product Performance | Product Success Performance, Product Delivery Performance |
| Product Management | Product Strategy, Product Roadmaps, Product Collateral, Product Training |
| Business Integration | Sales & Marketing, Support & Operations, Engineering Integration |
| NetStar Values | Living the NetStar Values |

### Scoring
- **PM Score** (0-4): Self-assessment
- **Target**: Default 3, adjustable
- **Manager Score** (0-4): Manager evaluation
- **Approved**: Checkbox — when ticked, manager score takes precedence
- **RAG status**: Green (3-4), Amber (2), Red (0-1)
- **Gap indicator**: Shows if on target or below

### Evidence Collection
Each KPI has:
- **+ Link**: Add supporting URLs
- **📎 Attach**: Upload documents
- **+ Meeting**: Log meetings (date, attendees, outcomes, actions) — for Integration KPIs
- **+ Training**: Log training sessions (date, audience, count, materials) — for Training KPI

### Financial Year Quarters
- Dropdown shows FY25 through FY28
- Format: FY27-Q1 = Apr-Jun 2026

### Quarterly Trend
Bar chart at top showing score progression across quarters.

### Auto-Populated Metrics
- Product Roadmaps: Links to your roadmap data
- Product Delivery: Shows G2M average readiness
- Product Performance: Shows ToDo task completion rate

### Timesheet View
Toggle to **Timesheet** to see weekly time allocation:
- Pulls data from ToDo List tasks
- Shows tasks with logged actual hours
- Summary: total logged, weekly target (35h), utilisation %
- KPI breakdown: hours per KPI vs target
- Click **Open ToDo List** to log time, then return via **← Back to Timesheet**

### Custom KPIs
Click **+ Add KPI** (in Scorecard view) to add custom KPIs to any group.

### Export
**📄 Export Word** generates a formatted scorecard document.

---

## 6. User Change Requests (UCR)

Formal change management for product changes.

### Opening UCR
Click the red **📝 UCR** button in the toolbar.

### Creating a UCR
1. Click **+ New UCR**
2. Fill in all fields (expandable card)
3. Set status: Draft → Submitted → Approved → Rejected → Implemented

### Fields
- Title, Priority (P1/P2/P3)
- Description of requested change
- Key outcomes (business value)
- Internal & external stakeholders
- Business owner (final approval)
- Workarounds awareness
- Business impact if not implemented
- Financial impact (ZAR)
- Required resources
- D365 impact (Yes/No)
- Acceptance criteria
- Supporting documents

### Systems Impact Checklist
19 systems, each with Yes/N/A:
NOMS, CRM, BI Dashboards, Latest Location, Big Data, ProFleet, MyNetstar, Safe & Sound, FleetAI, Navixy, Fleet Manager, Command Sender, RF Highsites, PCATU, Mobitech Device, Unit Management, Website, Legal, Other

### Approval Section
- Business approver: Name, title, date
- Technology approver: Name, title, date

### Export
**📄 Export Word** generates a sign-off ready document with all fields, systems table, and signature lines.

---

## 7. Artifacts & Collateral

Create product collateral with AI assistance.

### Opening Artifacts
Click the purple **📄 Artifacts** button in the toolbar.

### Artifact Types
Brochure, FAQ, Product Information Guide (PIG), Presentation/PowerPoint, Data Sheet, Sales Guide, Training Material, Release Note, Technical Document, Other

### Creating an Artifact
1. Click **+ New Artifact** (opens modal)
2. **Title**: Name of the document
3. **Type**: Select artifact type
4. **Initiative**: Link to a roadmap initiative
5. **Description**: Brief description
6. **AI Instructions**: Tell AI exactly what you want (e.g., "Create a 2-page brochure focusing on fleet management benefits")
7. **Reference Documents**: Upload data sheets, PIGs, specs — AI reads these
8. **Visual Template**: Upload a template for look & feel
9. **Output Format**: Word, PowerPoint, Excel, or PDF
10. Click **Save as Draft** or **🤖 Generate with AI**

### Brand Guide
Set up once in **⚙️ Settings** or via **🎨 Brand Guide** button:
- Upload your CI/brand guide document
- **🤖 AI Analyse**: Auto-extracts colours, fonts, tone, style rules
- Set brand colours (hex codes), fonts, logo URL
- Upload brand assets (logos, icons)
- Style notes and guidelines
- All saved and persisted — AI uses this for every artifact

### Templates Tab
Click **📐 Templates** in the Artifacts toolbar:
- Upload a template file per artifact type
- AI follows the template's structure when generating

### AI Providers
Configure in **⚙️ Settings**:
- **Google Gemini**: Gemini 2.5 Flash, Gemini 2.5 Pro
- **OpenAI**: GPT-4o, GPT-4o Mini
- **Anthropic Claude**: Claude Sonnet 4.5, Claude Haiku 4.5, Claude Opus 4.6
- API key stored per user (never shared)

---

## 8. CapacityIQ

Team capacity planning with heatmaps and templates.

### Opening CapacityIQ
Click the teal **⚡ CapacityIQ** button in the toolbar.

### Navigation (Sidebar)
- **📊 Dashboard**: Capacity heatmap
- **📋 Initiatives**: Active work items
- **📐 Templates**: Reusable initiative templates
- **👥 Teams & People**: Team management
- **📅 Sprints**: Sprint schedule
- **📚 Task Reference**: Task type library

### Dashboard
Capacity heatmap grid (Team x Sprint):
- Green (0-75%): Under capacity
- Amber (76-95%): Healthy load
- Red (96%+): Over capacity
- Shows allocated/available hours per cell

### Teams & People
- 11 pre-seeded teams: Backend, Frontend, IoT, QA, BI, Systems, Support, Operations, DBA, DevOps, Mobile
- Add custom teams with colour picker
- Add members: name, role, hours/day, productivity factor
- **Edit Memberships**: Assign members to multiple teams

### Sprints
- 6 pre-seeded sprints (FY27-Q1, 2-week cadence)
- Create custom sprints with date ranges

### Templates
4 starter templates:
- **New Hardware Integration** (24 tasks)
- **New Software Feature** (12 tasks)
- **BI Dashboard Request** (8 tasks)
- **Vigil / Utilities Change** (5 tasks)
- **Create custom templates** with tasks from the library + G2M items

### Creating an Initiative
1. Go to **Templates** → click a template
2. Tasks auto-populate with default hours and team assignments
3. Edit description, link to roadmap initiative
4. Assign tasks to teams, sprints, set hours
5. Track status: Planning → In Progress → Blocked → Complete

### Task Management
- **+ Add Task**: Custom tasks on any initiative
- **→TDL**: Send any task to the ToDo List
- Delete tasks, change status inline

### Export
**📄 Export** on Dashboard generates a Word document with the capacity heatmap.

---

## 9. Settings

Click the **⚙️** button in the toolbar.

### AI Configuration
- Provider: Google Gemini / OpenAI / Anthropic Claude
- Model selection per provider
- API key (stored locally, never shared)

### Brand Guide
- Upload brand/CI guide document
- AI analysis to auto-extract brand info
- Brand colours with visual swatches
- Brand fonts
- Logo URL
- Brand assets (logos, icons)
- Style notes / guidelines

### Artifact Templates
- Upload a template per artifact type (10 types)
- Shows configuration status

### Role
- Manager, Product Manager, Developer, Read Only

---

## 10. Roles & Permissions

| Feature | Manager | Product Manager | Developer | Read Only |
|---------|---------|----------------|-----------|-----------|
| Roadmap | Full | Full | Read | Read |
| G2M | Full | Full | Read | Read |
| ToDo | Full | Full | Full | Read |
| KPIs | Full | Full | Read | Read |
| Timesheet | Full | Full | Read | Read |
| UCR | Full | Full | Read | Read |
| CapacityIQ | Full | Full | Full | Read |
| Artifacts | Full | Full | Read | Read |
| Manage Roles | Yes | No | No | No |

---

## 11. Data Import & Export

### Import (💾 Data → Import Data)
Three options:
1. **Download Excel Template**: Pre-formatted .xlsx with Instructions, Sections, Initiatives sheets
2. **Import from Excel Template**: Select filled-in .xlsx — auto-populates roadmap
3. **Restore JSON Backup**: Import previously saved .json backup (replaces all data)

### Export
- **💾 Data → Save Backup**: Download full JSON backup
- **Export to Excel**: Available from various toolbar options
- **Print/PDF**: Preview and print roadmap
- **Word Export**: Available in G2M, KPIs, UCR, Artifacts, CapacityIQ

### Cloud Sync
- Automatic background sync to Supabase
- Syncs ALL data: roadmap, G2M, ToDo, KPIs, UCR, Artifacts, CapacityIQ
- Works across devices with same login
- Offline-capable: queues changes for sync

---

## 12. Tips

### Productivity
- **Import first**: Use 💾 Data → Import to bulk-load your roadmap from Excel
- **G2M per product**: Set up G2M checklists early — they drive the readiness score
- **KPI attributes on tasks**: Link TDL tasks to KPIs for automatic timesheet tracking
- **Templates in CapacityIQ**: Create templates from real projects to speed up future planning

### Onboarding Tour
- Click the **?** button in the toolbar anytime to replay the tour
- Auto-shows on first login

### Sharing
- Use the **Share** feature to invite colleagues by email
- Shared roadmaps are read-only for recipients
- Each user maintains their own data isolation

---

**PM Roadmapper v1.1.0** — Built for Netstar Product Management
