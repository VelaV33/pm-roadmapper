# Roadmap OS — Complete Product Summary

**Version:** 1.27.8 | **Last updated:** 13 April 2026

---

## Part 1: For the CTO

### Technology Stack

| Layer | Technology | Why |
|---|---|---|
| **Desktop runtime** | Electron 28.3 (Chromium + Node.js) | Cross-platform desktop app (Windows, macOS, Linux) with native OS integration (system tray, file dialogs, OS keychain, auto-update) |
| **Web runtime** | Vanilla JS SPA served by Vercel | Same renderer as Electron, running unchanged in a browser via a shim that re-implements 24 IPC methods with browser APIs |
| **Backend** | Supabase (PostgreSQL 17, Auth, Storage, Edge Functions) in eu-west-1 | Managed BaaS with built-in auth, RLS, real-time, and Deno edge functions. Zero backend servers to manage |
| **Auth** | Supabase Auth + Google OAuth + custom protocol deep-link | Email/password + Google SSO. Single identity across desktop and web. Desktop OAuth uses a `pmroadmapper://` custom URI scheme to bridge browser → Electron |
| **Serverless functions** | 15 Supabase Edge Functions (Deno) + 2 Vercel Edge Functions | Supabase handles data/auth/email. Vercel handles CORS-bypass proxying for AI providers |
| **AI providers** | OpenAI (GPT-4o), Anthropic (Claude Sonnet 4.5), Google (Gemini 2.5 Flash) | BYO-key model — users supply their own API keys. Keys never touch our servers in plaintext; a stateless proxy forwards them |
| **Email** | Resend | Transactional emails: invites, notifications, password resets. Branded HTML templates |
| **Payments** | Paystack | Subscription billing (Standard $17/mo, Pro $25/mo). Webhook writes tier to `user_profiles`. Marketing site handles checkout flow |
| **Desktop distribution** | GitHub Releases + electron-updater | NSIS installer (Windows), DMG (macOS), AppImage (Linux). Auto-update polls `latest.yml` from GitHub Releases on every launch |
| **Web hosting** | Vercel (Edge Network) | Static SPA + 2 Edge Functions. Auto-deploys from `main` branch on push. Custom domain: app.pmroadmapper.com |
| **DNS/Domain** | Vercel DNS | pmroadmapper.com (marketing) + app.pmroadmapper.com (product). HTTPS auto-provisioned via Let's Encrypt |

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     renderer/index.html                     │
│                 (23,445-line single-file SPA)                │
│            Runs unchanged in BOTH Electron and browser       │
│                                                             │
│  ┌──────────────┐              ┌──────────────────────────┐ │
│  │ Electron app │              │ Web app (Vercel)          │ │
│  │              │              │                          │ │
│  │ main.js      │              │ shim/electronAPI.js      │ │
│  │ preload.js   │              │ (re-implements all 24    │ │
│  │ (24 IPC      │              │  IPC methods using       │ │
│  │  methods)    │              │  browser APIs)           │ │
│  └──────┬───────┘              └──────────┬───────────────┘ │
└─────────┼──────────────────────────────────┼────────────────┘
          │                                  │
          │  ┌───────────────────────────┐   │
          └──┤   Supabase (eu-west-1)    ├───┘
             │                           │
             │  • Auth (email + OAuth)   │
             │  • PostgreSQL 17 (RLS)    │
             │  • Storage (attachments)  │
             │  • 15 Edge Functions      │
             └─────────┬─────────────────┘
                       │
          ┌────────────┼────────────────┐
          │            │                │
    ┌─────▼────┐ ┌─────▼────┐ ┌────────▼───────┐
    │  Resend  │ │ Paystack │ │ AI Providers   │
    │  (email) │ │ (billing)│ │ (user's key)   │
    └──────────┘ └──────────┘ └────────────────┘
```

### Dual-Target Strategy — The Shim Pattern

The renderer is a single 23k-line `index.html` that calls `window.electronAPI.*` for all platform-specific operations. The contract is defined in `preload.js` (24 methods). Two implementations exist:

| Method category | Electron (`main.js`) | Web (`shim/electronAPI.js`) |
|---|---|---|
| **Data persistence** | Local JSON files in `%APPDATA%` | IndexedDB (`pmr-cache` store) |
| **Supabase REST** | Node.js `https.request` (CORS bypass) | Direct `fetch()` (CORS allowed by Supabase) |
| **AI requests** | Node.js `https.request` (CORS bypass) | `fetch('/api/ai-proxy')` (Vercel Edge proxy) |
| **File save** | Native `dialog.showSaveDialog` | `Blob` + `<a download>` |
| **File pick** | Native `dialog.showOpenDialog` | `<input type=file>` |
| **Attachments** | Local filesystem (`%APPDATA%/attachments/`) | Supabase Storage bucket (`attachments/{uid}/`) |
| **PDF export** | Hidden `BrowserWindow.printToPDF` | `window.open()` + `window.print()` |
| **Document parsing** | Node.js `pdf-parse`, `mammoth`, `adm-zip` | Browser `pdfjs-dist`, `mammoth.browser`, `JSZip` (lazy-loaded from `/shim/`) |
| **Remember me** | OS keychain (`safeStorage.encryptString`) | Supabase `persistSession` (localStorage) |
| **OAuth callback** | `pmroadmapper://` custom protocol IPC | URL fragment detection (`#access_token=...`) |

The renderer cannot tell which implementation is running. This means:
- **Zero code forks** in the UI layer
- **One codebase** produces both distribution targets
- **Features ship simultaneously** to desktop and web

### Security Architecture

| Layer | Mechanism |
|---|---|
| **Data isolation** | PostgreSQL Row-Level Security on every public table. `FORCE ROW LEVEL SECURITY` enabled on all 11+ tables so even the table owner (postgres) is subject to policies. Cross-tenant data leakage is impossible at the database level |
| **Auth** | Supabase Auth with JWT validation. Edge functions verify JWTs at both the gateway layer (`verify_jwt = true` in config) and in application code (`verifyRequest()` in `_shared/auth.ts`) for defence-in-depth |
| **Roles** | Super admin role stored in `app_metadata` (server-only writable), NOT `user_metadata` (user-writable). Migrated in `20260408000000_security_hardening.sql` |
| **Rate limiting** | IP-based via Deno KV on all public endpoints (signup: 5/hr, feedback: 10/hr, votes: 30/hr). Per-user rate limits on write-heavy operations (invite: 20/hr, notifications: 100/hr) |
| **Secrets** | AI API keys stored in browser `localStorage` (web) or OS keychain (desktop). Never transmitted to our backend in plaintext — the AI proxy is stateless and never logs keys |
| **CSP** | `script-src 'self' 'unsafe-inline' 'unsafe-eval'` — all external libraries vendored into `/shim/` at build time. No CDN dependencies at runtime |
| **XSS prevention** | HTML-escaped user metadata in email templates. `innerHTML` usage carefully scoped. `webSecurity: true` + `sandbox: true` in Electron |
| **Desktop hardening** | `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. Custom protocol validation (`pmroadmapper://` only). Path traversal protection on attachment names. URL scheme allowlist (`http`, `https`, `mailto` only) for `shell.openExternal` |
| **Electron auto-update** | electron-updater polls GitHub Releases for `latest.yml` with SHA-512 integrity verification |

### Database Schema (15 migrations, 11+ tables)

| Table | Purpose | Key columns | RLS |
|---|---|---|---|
| `roadmap_data` | One JSONB blob per user — the entire roadmap state | `user_id` (unique), `data` (jsonb) | Owner-only CRUD |
| `user_profiles` | Tier, subscription status, Paystack IDs | `tier` (basic/standard/pro/premium), `paystack_*`, `subscription_status` | Owner-only read; tier update is service-role only |
| `shared_roadmaps` | "User A shares with email B" | `owner_id`, `recipient_email`, `roadmap_name` | Owner manages; recipient reads by email match |
| `roadmap_comments` | Threaded comments on roadmap rows | `roadmap_owner_id`, `row_id`, `parent_id` (self-ref), `content`, `resolved` | Owner + author + shared recipients via EXISTS subquery |
| `competitive_analyses` | AI research results | `competitors[]`, `research_areas[]`, `results` (jsonb), `status` | Owner-only |
| `feedback_items` | Stakeholder feedback inbox | `title`, `status`, `linked_row_id`, `vote_count` | Owner-only; public INSERT via edge function |
| `feedback_votes` | One vote per email per item | `feedback_item_id`, `voter_email` (unique constraint) | No public SELECT (aggregated into vote_count) |
| `contacts` | People who aren't registered users yet | `email`, `name`, `status` (inactive/invited/active), `metadata` (jsonb) | Owner-only |
| `notifications` | In-app notification inbox | `recipient_user_id`, `type`, `title`, `body`, `read` | Recipient-only |
| `teams` | Org-wide teams | `name` (unique), `color`, `created_by` | Creator + members via team_members subquery |
| `team_members` | Team membership | `team_id`, `user_id`, `role_in_team` | Creator sees all; members see own row |
| `subscription_events` | Paystack webhook audit log | `email`, `event_type`, `raw_payload` (jsonb), `processed` | Service-role only (no public policies) |
| Storage: `attachments` | File uploads | Path: `{user_id}/{timestamp}_{filename}` | Path-scoped by `auth.uid()` |

**Triggers:**
- `on_auth_user_created_user_profile` — auto-creates a `basic` profile row on signup (SECURITY DEFINER, runs as postgres to bypass FORCE RLS)
- `fb_recompute_vote_count` — keeps `feedback_items.vote_count` in sync with `feedback_votes` on INSERT/DELETE
- `contacts_touch_updated_at` / `teams_touch_updated_at` — auto-update `updated_at` on row changes

**Helper functions:**
- `get_auth_user_id_by_email(text)` — lookup `auth.users.id` by email. SECURITY DEFINER, granted only to `service_role`. Used by the Paystack webhook on the marketing site

### Performance Optimizations

| Optimization | Impact |
|---|---|
| Lazy-loaded `pdf-parse`, `mammoth`, `electron-updater` in main.js | ~3 sec faster cold start (modules loaded only when the user triggers PDF/DOCX import or after 5 sec for auto-update) |
| `show: false` + `ready-to-show` on BrowserWindow | Eliminates blank-window flash during startup — window appears already-painted |
| Vendored browser libraries from `node_modules` into `public/shim/` | CSP-compliant (no CDN scripts blocked), cached after first page load |
| On-demand script loading for PDF.js, mammoth, JSZip | Document parsers only load when user imports a file of that type |
| IndexedDB cache for roadmap data (web) | Offline-capable read after first sync |
| Atomic file writes with `.tmp` → `.bak` rotation (desktop) | No data corruption on crash during save |

---

## Part 2: For the Product Manager

### Product Positioning

**Roadmap OS** is a product strategy and roadmap tool built for product managers who need to:
- Plan quarterly roadmaps with timeline and kanban views
- Track initiatives from strategy through delivery
- Communicate roadmap decisions to executives and stakeholders
- Coordinate across engineering, design, and business teams
- Use AI to accelerate competitive research, requirement writing, and prioritization

It ships as both a **desktop app** (for power users who want offline access and native performance) and a **web app** (for quick access from any browser). A single account works on both.

### Buyer Personas

#### Primary: Head of Product / Senior PM
- **Pain point:** Scattered roadmap artifacts (slides, spreadsheets, Jira boards) that don't tell a coherent strategy story
- **Value prop:** Single source of truth that connects strategy (OKRs, prioritization frameworks) to execution (task plans, capacity, G2M checklists)
- **Buying trigger:** New fiscal year planning, board meeting prep, or team scaling past 3 PMs where coordination breaks down
- **Key features they care about:** Dashboard, Roadmap (timeline + kanban), OKR tracking, PDF/PPT/Excel exports for executive presentations

#### Secondary: VP of Engineering / CTO
- **Pain point:** Visibility into what product is planning and when engineering capacity will be needed
- **Value prop:** CapacityIQ (resource planning by role/sprint), Plan (WBS task breakdown with milestones and predecessors), bidirectional sync between Plan and G2M
- **Buying trigger:** Missed deadlines due to capacity misalignment, or a new product launch with cross-functional dependencies
- **Key features they care about:** CapacityIQ, Plans (project planner), Team management, Notifications

#### Tertiary: Founder / Solo PM at a Startup
- **Pain point:** Needs a lightweight roadmap tool that isn't Jira-heavy but is more structured than a spreadsheet
- **Value prop:** Fast setup, AI-powered competitive analysis, feedback portal for collecting stakeholder input, all-in-one (no Jira + Productboard + Notion stack)
- **Buying trigger:** First board meeting where they need to present a professional roadmap, or first enterprise customer asking "what's on the roadmap?"
- **Key features they care about:** AI features (competitive analysis, brand guide), Feedback portal, Export to PDF/PPT

### Feature Map (Exhaustive)

#### Core Roadmap
- **Timeline view** — Gantt-style 12-24 month view with draggable date ranges, color-coded by section
- **Kanban view** — Card-based columns by status (Strategy, In Progress, Released, Delayed, At Risk)
- **Sections** — Color-coded initiative groupings (e.g. "Platform", "Mobile", "Infrastructure")
- **Rows / Initiatives** — Each row has: name, description, owner, priority (High/Med/Low), status, tags, date range, team assignment, attachments, comments
- **Quarterly columns** — Visual timeline with Q1-Q4 markers, FY boundaries
- **Drag-and-drop** — Reorder rows within sections, drag across kanban columns
- **Inline editing** — Click any field to edit in-place

#### Dashboard
- Morning greeting with time-aware message
- Initiative health summary (on-track, at-risk, delayed counts)
- KPI trend sparklines
- Capacity utilization overview
- Quick-action cards (add row, open plans, run AI)

#### Plans (Project Planner)
- WBS-style task hierarchy (phases → tasks → subtasks)
- Gantt preview with milestone diamonds
- Predecessor/successor dependencies
- Owner assignment from contacts or team members
- Status tracking per task
- Template library (pre-built plan templates for common workflows)
- Bidirectional sync with G2M Checklist

#### CapacityIQ
- Dashboard with utilization heatmap
- Initiatives mapped to teams
- Sprint/cycle planning with capacity allocation
- Template management for recurring capacity patterns
- Team & People directory
- Task reference library

#### Prioritization
- **Score Initiatives** — Custom weighted scoring (impact, effort, confidence, reach)
- **Frameworks** — Pre-built templates: RICE, ICE, MoSCoW, Kano, Cost of Delay
- **Value vs. Effort Matrix** — 2x2 scatter plot with quadrant labels
- **OKRs** — Objective + Key Result tracking with progress percentages

#### G2M (Go-to-Market) Checklist
- Category-based readiness checklist (Product, Engineering, Marketing, Sales, Support, Legal)
- Owner assignment per item
- Status tracking (Not Started, In Progress, Complete, Blocked)
- Bidirectional sync with Plans
- Print/export to branded PDF

#### Reports & Strategy
- Initiative health dashboard
- KPI Scorecard with custom metrics, trend analysis, quarterly comparisons
- Data-driven insights with AI-generated recommendations
- Export to branded PDF with letterhead

#### Feedback Portal
- Public submission form (no login required for submitters)
- Vote system (one vote per email per item, enforced at DB level)
- Status workflow: New → Reviewing → Planned → In Progress → Shipped → Declined
- Link feedback items to roadmap initiatives (close the loop)
- Owner inbox view with filtering

#### Collaboration
- **Share roadmaps** — Share with specific email addresses; recipient sees a read-only tab
- **Threaded comments** — Per-initiative comment threads with resolve/unresolve
- **Contacts** — CRM-lite for people who aren't registered users (name, email, role, company, notes)
- **Invite flow** — Send branded email invites to contacts; track invite status
- **Notifications** — In-app inbox + email delivery for task assignments, mentions, shares
- **Notification preferences** — Per-type toggles (in-app + email) with master switch
- **Teams** — Create teams, assign members with roles (member/lead), use for ownership filtering

#### Admin
- User management dashboard (list users, view roles, set super admin)
- Team editor (create/edit/delete teams, manage members)
- Role-based access: super admin via `app_metadata` (server-only writable)

#### AI Features (Pro tier only)
- **Competitive Analysis** — Enter competitor names + research areas → AI generates SWOT analysis, market comparison matrix, threat assessment, strategic recommendations
- **Brand Guide** — Upload company documents → AI extracts brand voice, tone, terminology guidelines
- **Decision Dissection (DDS)** — Structured AI reasoning framework for product decisions
- **Use Case Requirements (UCR)** — AI-assisted requirement capture with structured templates
- **Voice transcription** — Record audio in-app → Gemini transcribes to text (tries 4 model versions in sequence)
- **AI-generated artifacts** — Summaries, reports, and recommendations powered by the user's chosen provider

#### Import / Export
- **Import from Excel** — Auto-detect columns from MS Project, Planner, Asana, Jira, ClickUp exports; preview mapping before commit
- **Import from documents** — PDF text extraction, Word (DOCX), PowerPoint (PPTX slide text), CSV/TXT
- **Export to PDF** — Branded A3 landscape with letterhead, confidentiality footer, quarterly grouping
- **Export to PowerPoint** — Native PPTX generation via pptxgenjs
- **Export to Excel** — HTML table → .xls with styling preserved
- **Backup export/import** — Full JSON backup of all roadmap data

#### Settings & Personalization
- **Dark mode** — Full dark theme with CSS variable overrides
- **Company logo upload** — Appears in exports, stored in localStorage
- **AI provider configuration** — Choose provider (Gemini/OpenAI/Claude), enter API key, select model
- **Notification preferences** — Per-type in-app + email toggles

#### Authentication & Identity
- **Email/password signup** — Via Supabase Auth with OTP verification
- **Google OAuth** — "Continue with Google" on both web and desktop
- **Deep-link OAuth (desktop)** — Browser completes Google sign-in → `pmroadmapper://` bridges session back to Electron
- **Remember me** — OS keychain (desktop) / localStorage (web)
- **Password reset** — Email-based OTP code flow (not a clickable link — designed for a desktop app where the user types the code)
- **Unified identity** — One account works on both desktop and web

#### Pricing Tiers
| Tier | Price | Features |
|---|---|---|
| **Basic** | Free | Core roadmap, timeline, kanban, sections, rows, export, dark mode |
| **Standard** | $17/mo | Everything in Basic + Plans, CapacityIQ, Prioritization, G2M, Reports, Feedback, Sharing, Teams, Notifications |
| **Pro** | $25/mo | Everything in Standard + all AI features (Competitive Analysis, Brand Guide, DDS, UCR, voice transcription) |

### Accessibility
- Skip-to-main-content link (visible on Tab focus)
- `aria-live` regions for toast notifications
- `aria-modal` + `role="dialog"` on modals
- Keyboard-navigable sidebar nav (Tab + Enter/Space activation)
- `aria-current="page"` on active nav items
- `:focus-visible` outlines on all interactive elements
- Dark mode as an accessibility feature (reduced eye strain)

### Guided Onboarding
- 12-step product tour on first sign-in ("Welcome to Roadmap OS!")
- Contextual tooltips on key UI elements
- Sample data pre-populated for new accounts

---

## Part 3: For the Software Engineer

### Repository Structure

```
netstar-roadmap-app/
├── main.js                          # Electron main process (870+ lines)
│                                    #   20 IPC handlers, protocol registration,
│                                    #   single-instance lock, auto-updater,
│                                    #   lazy-loaded modules, security hardening
│
├── preload.js                       # contextBridge: 25 methods exposed to renderer
│                                    #   (24 original + onOAuthCallback for deep-link)
│
├── renderer/
│   └── index.html                   # 23,445-line single-file SPA
│                                    #   All UI, all logic, all styles
│                                    #   100+ modal/overlay states
│                                    #   Custom Supabase auth wrapper (_supabase)
│                                    #   Dark mode via CSS variables
│
├── package.json                     # Electron: v1.27.8, productName "Roadmap OS"
│                                    #   appId: com.pmroadmapper.app (kept for upgrade compat)
│                                    #   Deps: electron, electron-builder, supabase-js,
│                                    #   pdf-parse, mammoth, adm-zip, pptxgenjs, xlsx
│
├── vercel.json                      # Vercel config at repo root
│                                    #   installCommand: cd web && npm install
│                                    #   buildCommand: cd web && npm run build
│                                    #   outputDirectory: web/public
│
├── .vercelignore                    # Excludes dist/ (3GB), node_modules/ (500MB),
│                                    #   Electron-only files from Vercel uploads
│
├── api/                             # Vercel Edge Functions (at repo root for
│   ├── ai-proxy.js                  #   Vercel auto-discovery)
│   └── transcribe.js                #   Stateless CORS-bypass proxies with
│                                    #   per-IP rate limiting (30/min, 15/min)
│
├── web/                             # Web build — outside Electron's files[] allowlist
│   ├── shim/
│   │   └── electronAPI.js           # 500+ lines: browser implementations of all 24
│   │                                #   IPC methods. IndexedDB, fetch, Blob downloads,
│   │                                #   Supabase Storage, lazy-loaded parsers
│   │
│   ├── scripts/
│   │   └── build.js                 # Build pipeline: copy renderer → inject shim
│   │                                #   script tags → vendor libs from node_modules
│   │                                #   → copy web/static/ → output to web/public/
│   │
│   ├── static/
│   │   └── privacy.html             # Privacy Policy page (Roadmap OS branded)
│   │
│   ├── package.json                 # Web deps: supabase-js, pdfjs-dist, mammoth, jszip
│   └── README.md
│
├── supabase/
│   ├── config.toml                  # Auth, storage, edge runtime config
│   │                                #   site_url: https://app.pmroadmapper.com
│   │                                #   15 function configs with verify_jwt settings
│   │
│   ├── migrations/                  # 15 migration files (20260101 → 20260410)
│   │   ├── 20260101000000_baseline_studio_created_objects.sql
│   │   ├── 20260323100000_competitive_analysis.sql
│   │   ├── 20260403000000_fix_rls_policies.sql
│   │   ├── 20260403000001_fix_shared_rls.sql
│   │   ├── 20260403000002_add_unique_constraint.sql
│   │   ├── 20260408000000_security_hardening.sql
│   │   ├── 20260408120000_feedback_portal.sql
│   │   ├── 20260408180000_contacts.sql
│   │   ├── 20260408200000_notifications.sql
│   │   ├── 20260408210000_contacts_metadata.sql
│   │   ├── 20260408220000_teams.sql
│   │   ├── 20260409000000_fix_user_profiles_rls.sql
│   │   ├── 20260409100000_web_launch_isolation_and_storage.sql
│   │   ├── 20260410212624_add_paystack_subscription_fields.sql
│   │   └── 20260410213803_add_get_auth_user_id_by_email_helper.sql
│   │
│   └── functions/                   # 15 Deno edge functions
│       ├── _shared/auth.ts          # Shared: JWT verify, CORS, rate limiting, super admin check
│       ├── admin-api/               # User/team management (super admin only)
│       ├── competitive-analysis/    # AI competitive research (Pro tier)
│       ├── contacts-api/            # Contact CRUD + invite emails
│       ├── create-user/             # Public signup (rate-limited)
│       ├── feedback-list/           # Feedback inbox management
│       ├── feedback-submit/         # Public feedback submission
│       ├── feedback-vote/           # Public voting
│       ├── get-my-shares/           # List shared roadmaps
│       ├── get-shared-roadmap/      # Read a shared roadmap
│       ├── notifications-api/       # Notification CRUD + email delivery
│       ├── reset-password/          # OTP-based password reset
│       ├── send-invite/             # Share roadmap via email
│       └── sync-roadmap/            # Upsert roadmap JSONB blob
│
├── assets/                          # Electron app icons (ico, png)
├── dist/                            # Built installers (gitignored, ~3GB)
├── ROADMAP_OS_USER_GUIDE.md         # End-user documentation
└── README.md                        # Developer README with architecture docs
```

### Key Engineering Decisions

| Decision | Rationale |
|---|---|
| **Single 23k-line HTML file** | Zero build tooling (no webpack/vite/esbuild). CSP-friendly. Fast iteration. Trade-off: no tree-shaking, no TypeScript, harder to navigate |
| **JSONB blob per user** (not normalized tables) | Roadmap data is deeply nested (sections → rows → bars → metadata). Normalizing would require 10+ tables with complex JOINs. JSONB keeps reads/writes simple and atomic. Trade-off: no server-side querying of individual initiatives |
| **BYO AI key** (not server-managed) | Avoids holding user secrets server-side. No billing relationship with AI providers. Users control their own costs and model choices. Trade-off: users must manage their own API keys |
| **Electron + web from same renderer** | Avoids maintaining two codebases. The shim pattern means features ship to both targets simultaneously. Trade-off: the shim must be kept in exact sync with preload.js (24 methods) |
| **Custom protocol for desktop OAuth** | Google OAuth requires HTTPS redirect URIs. The web page acts as a bridge: completes OAuth, then triggers `pmroadmapper://` to pass tokens back to Electron. Avoids the need for a local HTTP server or manual code paste |
| **Supabase Edge Functions** (not a custom server) | Zero-ops backend. Functions auto-scale, auto-deploy, and have built-in auth integration. Trade-off: Deno runtime (not Node.js), vendor lock-in |
| **`FORCE ROW LEVEL SECURITY`** on every table | Defence-in-depth. Even if a misconfigured connection uses the table owner role, RLS still applies. Cross-tenant data leakage is impossible at the database level |
| **Lazy-loaded heavy modules** (pdf-parse, mammoth, electron-updater) | ~3 sec faster Electron cold start. These modules are only needed when the user actually imports a document or after 5 sec for update checks |
| **Vendored browser libraries** (not CDN) | The renderer has `script-src 'self'` CSP. Any CDN-loaded script would be silently blocked. Vendoring from node_modules into `public/shim/` at build time is mandatory, not an optimization |

### Version History (v1.27.x train — this session)

| Version | What shipped |
|---|---|
| **v1.27.0** | Web version launch. electronAPI shim (24 methods). Vercel Edge Functions for AI/transcribe. Critical RLS fix on `user_profiles` (closed a hole that let any user self-grant `premium` tier). Per-creator team isolation. `attachments` storage bucket. Renderer a11y fixes (sidebar keyboard nav, inert AI key links, `target="_blank"` without `rel="noopener"`) |
| **v1.27.1** | Privacy Policy link removed (was pointing to anthropic.com). Supabase Auth `site_url` + `redirect_to` updated to `app.pmroadmapper.com` |
| **v1.27.2** | Login page redesign (2-column hero + form). Google OAuth working end-to-end on web. `checkOAuthRedirect()` parses URL fragment, fetches user, persists session, cleans URL |
| **v1.27.3** | Electron OAuth deep-link (Phase 2). `pmroadmapper://` custom protocol registered in main.js. Single-instance lock. Bridge page at `app.pmroadmapper.com/?to=desktop`. Cold-start deep-link handling |
| **v1.27.4** | Faster cold start (lazy-loaded pdf-parse, mammoth, electron-updater). `show:false` + `ready-to-show` on BrowserWindow. Fix: `handleGoogleAuth()` was overriding `redirectTo` without `?to=desktop` |
| **v1.27.5** | Full rebrand from "PM Roadmapper" to "Roadmap OS". ~50 string replacements across 13 files. 4 edge functions redeployed. Email templates updated. CTA links updated to `app.pmroadmapper.com`. appId kept as `com.pmroadmapper.app` for upgrade compatibility |
| **v1.27.6** | Real Privacy Policy at `app.pmroadmapper.com/privacy.html`. New `web/static/` directory for committed static pages. Privacy link restored in auth footer |
| **v1.27.7** | Export headers + download filenames rebranded (uppercase "PM ROADMAPPER" and "PM_Roadmapper_*" filenames missed by earlier case-sensitive replace) |
| **v1.27.8** | Toolbar title fix — bare "Roadmapper" (without "PM " prefix) changed to "Roadmap OS" |

### Infrastructure Changes (this session)

| Change | Impact |
|---|---|
| **Vercel project root moved to repo root** | Build script reads from `../renderer/` which only works from repo root. `.vercelignore` excludes `dist/` (3GB) and Electron `node_modules/` (500MB). `installCommand: cd web && npm install` prevents Vercel from installing Electron deps |
| **Supabase migration history repaired** | MCP-applied migrations had different timestamps than local files. Repaired via `supabase migration repair --status reverted/applied`. All 15 migrations now have matching Local + Remote entries |
| **Baseline migration added** | Three tables created via Supabase Studio had no local `CREATE TABLE` migration. Added `20260101000000_baseline_studio_created_objects.sql` so `supabase db push` works from a fresh checkout |
| **Marketing site Paystack migrations adopted** | Local `20260410000000` was a duplicate of two marketing-site-applied migrations (`20260410212624` + `20260410213803`). Dropped the local duplicate, pulled the authoritative files |
| **Custom domain configured** | `app.pmroadmapper.com` → Vercel `web` project. `pmroadmapper.com` + `www` → `pm-roadmapper-site` project. All DNS managed by Vercel (registrar: Vercel). HTTPS auto-provisioned |
| **`gh` CLI installed + authenticated** | GitHub Releases now created from CLI (`gh release create v1.27.x ...`) instead of manual upload. Faster release cycles |

### How to Ship a Release

**Web only (e.g. renderer-only change):**
```bash
cd web && npm run build       # rebuild public/
cd .. && vercel --prod --yes  # deploy (or just git push after dashboard root-dir fix)
```

**Desktop + Web:**
```bash
# 1. Bump version in package.json
# 2. Rebuild web
cd web && npm run build && cd ..

# 3. Deploy web
vercel --prod --yes

# 4. Build Electron installer
npm run build:win   # (or :mac / :linux)

# 5. Commit, tag, push
git add -A && git commit -m "v1.x.y: ..."
git tag -a v1.x.y -m "..."
git push origin main develop v1.x.y

# 6. Publish GitHub Release (auto-update for existing users)
gh release create v1.x.y "dist/Roadmap OS Setup 1.x.y.exe" \
  "dist/Roadmap OS Setup 1.x.y.exe.blockmap" \
  "dist/latest.yml" \
  --title "v1.x.y — ..." --notes "..."
```

**Edge functions only:**
```bash
supabase functions deploy <function-name> --no-verify-jwt  # or without flag if JWT-gated
```

---

## Appendix: Live URLs

| | URL |
|---|---|
| **Web app** | https://app.pmroadmapper.com |
| **Marketing site** | https://pmroadmapper.com |
| **Privacy Policy** | https://app.pmroadmapper.com/privacy.html |
| **Desktop releases** | https://github.com/VelaV33/pm-roadmapper/releases |
| **Supabase project** | `nigusoyssktoebzscbwe` (eu-west-1) |
| **Vercel project** | `velasabelocom-6814s-projects/web` |
