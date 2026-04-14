# Component Map — Millog Web

> Maps every screen to the shadcn/ui components it uses, plus shared patterns and custom components.

---

## shadcn/ui Component Inventory

Components installed from shadcn/ui:

| Component | File | Used On |
| --------- | ---- | ------- |
| **Avatar** | `ui/avatar.tsx` | Driver initials |
| **Badge** | `ui/badge.tsx` | Tag labels, role labels, status indicators |
| **Breadcrumb** | `ui/breadcrumb.tsx` | Dashboard layout navigation trail |
| **Button** | `ui/button.tsx` | Every screen |
| **Calendar** | `ui/calendar.tsx` | Date pickers |
| **Card** | `ui/card.tsx` | Stats, settings, vehicle cards, export cards |
| **Chart** | `ui/chart.tsx` | Recharts theming |
| **Checkbox** | `ui/checkbox.tsx` | Bulk select in compliance, pool car toggle |
| **Dialog** | `ui/dialog.tsx` | Invite driver, add vehicle, confirmations |
| **Drawer** | `ui/drawer.tsx` | Mobile drawer |
| **DropdownMenu** | `ui/dropdown-menu.tsx` | Row actions, user menu |
| **Form** | `ui/form.tsx` | react-hook-form integration |
| **Input** | `ui/input.tsx` | All forms |
| **Label** | `ui/label.tsx` | All form fields |
| **Popover** | `ui/popover.tsx` | Date pickers, tooltips |
| **Select** | `ui/select.tsx` | Role picker, driver assignment, tag select |
| **Separator** | `ui/separator.tsx` | Section dividers |
| **Sheet** | `ui/sheet.tsx` | Mobile nav drawer |
| **Sidebar** | `ui/sidebar.tsx` | Desktop navigation |
| **Skeleton** | `ui/skeleton.tsx` | Loading states |
| **Sonner** | `ui/sonner.tsx` | Toast notifications |
| **Table** | `ui/table.tsx` | Driver list, compliance, trip lists |
| **Tabs** | `ui/tabs.tsx` | Personal home (Resor/Statistik/Exportera) |
| **Toggle** | `ui/toggle.tsx` | Settings toggle buttons |
| **ToggleGroup** | `ui/toggle-group.tsx` | Login mode toggle (Org/Personal) |
| **Tooltip** | `ui/tooltip.tsx` | Icon actions, hover info |

---

## Screen → Component Mapping

### Login (`/login`)

```
Card
├── CardHeader → Logo + "Logga in" title
├── CardContent
│   ├── Form
│   │   ├── Label + Input (email)
│   │   ├── Label + Input (password, type="password")
│   │   └── Button ("Logga in", type="submit")
│   └── Link ("Glömt lösenord?")
└── CardFooter → Link ("Skapa företagskonto →")
```

**Custom:** None — pure shadcn form.

---

### Signup — 5-Step Wizard (`/signup`)

```
StandaloneLayout (no sidebar)
├── Progress bar ("Steg 1 av 5" with fill)
├── Card (centered, max-width 600px)
│   │
│   ├── Step 1: Organisation
│   │   ├── Input (Företagsnamn — required)
│   │   ├── Input (Organisationsnummer — optional, XXXXXX-XXXX)
│   │   ├── Input (Faktura-e-post — optional)
│   │   └── Info text: "All information kan ändras senare..."
│   │
│   ├── Step 2: Administratör
│   │   ├── Input (Fullständigt namn)
│   │   ├── Input (E-post)
│   │   ├── Input (Lösenord)
│   │   └── Input (Bekräfta lösenord)
│   │
│   ├── Step 3: Synlighet
│   │   └── 6 × Toggle row (Resor, Statistik, Elkostnad, Karta, Taggning, Exportera)
│   │       ├── Label + description text
│   │       └── Switch toggle
│   │
│   ├── Step 4: Taggning
│   │   ├── Radio card group (Ingen / Tjänst / Pendling / Privat)
│   │   ├── Switch (Kräv taggning)
│   │   └── Switch (Egna taggar)
│   │
│   └── Step 5: Granska
│       ├── Read-only summary of steps 1–4
│       └── Button ("Skapa organisation")
│
├── Navigation: [Tillbaka] [Nästa] buttons per step
│
└── Celebration screen (post-creation)
    ├── 3 next-step hint cards
    └── Button ("Gå till dashboard")
```

---

### Dashboard Overview (`/dashboard`)

```
Page
├── WelcomeOnboarding (shown when organization === null)
│   ├── Card (centered, large)
│   │   ├── Bolt icon
│   │   ├── "Välkommen till Millog Fleet!" heading
│   │   ├── "Du har ingen organisation kopplad..."
│   │   └── Button ("Skapa organisation" → /signup)
│   └── 3 × Info cards (invite, connect, track)
│
├── GettingStartedBanner (shown when org exists but fleet is empty)
│   └── Card (primary styling)
│       ├── "Kom igång med Millog Fleet" heading
│       └── 3 checklist items:
│           ├── [ ] Bjud in din första förare → /dashboard/drivers
│           ├── [ ] Koppla ert första fordon → /dashboard/vehicles
│           └── [x] Granska organisationsinställningar → /dashboard/settings
│       (auto-hides when: >1 member AND >0 vehicles)
│
├── Greeting header ("God morgon/eftermiddag/kväll!")
│
├── Untagged alert pill (amber, links to /personal, shown when >0 untagged)
│
├── KpiSectionCards (4 × Card, responsive grid)
│   ├── Total km (+ trip count)
│   ├── Tjänstekm (+ milersättning estimate)
│   ├── Elkostnad (this month)
│   └── Otaggade resor (green if 0, red count if >0)
│
├── ActivityChart (Card)
│   └── Recharts AreaChart — km/day for last 30 days, gradient fill
│
└── Bottom row (responsive grid)
    ├── RecentTripsCard — last 5 trips with tag badges, from→to, distance, cost
    ├── VehicleStatusCard — battery ring SVG, SoC%, charge state, Leaflet mini-map
    └── BatteryHealthCard — SoH%, progress bar, capacity estimate, sparkline trend
```

**Custom components:**
- `<KpiSectionCards>` — 4 stat cards in responsive grid (via `section-cards.tsx`)
- `<ActivityChart>` — Recharts AreaChart with gradient (via `chart-area-interactive.tsx`)
- `<WelcomeOnboarding>` — Full-page welcome when no org
- `<GettingStartedBanner>` — Checklist card for new orgs

---

### Driver List (`/dashboard/drivers`)

```
Page
├── Header
│   ├── "Förare" heading + description
│   └── Button ("Bjud in förare" → opens InviteDriverDialog)
│
├── Card ("Alla förare ({count})")
│   └── Table
│       ├── Columns:
│       │   ├── Namn (full_name)
│       │   ├── E-post (email, with mail icon)
│       │   ├── Roll (Badge: Förare / Administratör / Läsare)
│       │   ├── Status (StatusBadge: Aktiv / Inbjuden / Inaktiverad)
│       │   ├── Tillagd (formatted invited_at date)
│       │   └── Åtgärder (DropdownMenu, admin only)
│       ├── Clickable rows → /dashboard/drivers/:userId
│       └── Empty state: "Inga förare tillagda ännu."
│
└── InviteDriverDialog (Dialog, opened by button)
    ├── Input (Namn)
    ├── Input (E-post)
    ├── Select (Roll: Förare / Administratör / Läsare)
    └── Button ("Skicka inbjudan")
        → Calls fleet-invite-driver Edge Function
        → Toast on success
```

**Custom components:**
- `<StatusBadge>` — Color-coded badge (active=green, invited=yellow, deactivated=red)
- `<InviteDriverDialog>` — Inline Dialog with name + email + role → calls Edge Function

---

### Driver Detail (`/dashboard/drivers/:id`)

```
Page
├── Header
│   ├── Breadcrumb (Dashboard / Förare / Johan Svensson)
│   └── ButtonGroup
│       ├── Button ("Exportera körjournal")
│       └── DropdownMenu ("Skicka påminnelse", "Inaktivera")
│
├── SummaryRow (4 × Card)
│   ├── StatCard ("Totala km")
│   ├── StatCard ("Elkostnad")
│   ├── StatCard ("Tjänsteresor")
│   └── StatCard ("Otaggade", alert variant)
│
├── Card (Fordonsinfo)
│   └── Vehicle name, model, VIN, telemetry status badge
│
└── Card (Resor)
    ├── PeriodSelector + Search
    └── DataTable (trips)
        ├── Datum (formatted date)
        ├── Från → Till (addresses, truncated with tooltip)
        ├── Km
        ├── Kostnad (kr)
        ├── Tagg (Badge)
        └── Duration
```

---

### Vehicle List (`/dashboard/vehicles`)

```
Page
├── Header
│   ├── "Fordon" heading + description
│   └── Button ("Lägg till fordon" → opens AddVehicleDialog, admin only)
│
├── Filter tabs: Alla / Tilldelade / Otilldelade / Poolbilar
│
├── Vehicle card grid (1→2→3 columns, responsive)
│   └── VehicleCard (per vehicle)
│       ├── Car icon + display label (or model name, or "Namnlöst fordon")
│       ├── Trim + last 6 chars of VIN
│       ├── Status badges: Pool (secondary), Telemetry (green), SoC% (outline)
│       ├── Assigned drivers with primary indicator
│       └── Admin actions: toggle pool, assign/unassign (DropdownMenu)
│
├── Empty state: "Inga fordon kopplade ännu."
│   └── Hint: "Fordonet måste vara registrerat i Millog-appen först."
│
└── AddVehicleDialog (Dialog, opened by button)
    ├── Input (VIN — required, max 17 chars)
    ├── Input (Display name — optional)
    ├── Select (Tilldela förare — optional, from active org members)
    ├── Checkbox (Poolbil)
    └── Button ("Lägg till fordon")
        → Step 1: Looks up VIN in vehicles table
        → Step 2: If found → creates organization_vehicles row
        → Step 3: If driver selected → creates organization_vehicle_assignments row
        → Error if VIN not found: "Inget fordon med angivet VIN hittades."
```

**Custom components:**
- `<VehicleCard>` — Card with vehicle info, badges, driver assignments, admin actions
- `<AddVehicleDialog>` — VIN lookup dialog (does NOT create vehicles — only links existing ones)

---

### Compliance View (`/dashboard/compliance`)

```
Page
├── Header
│   ├── "Efterlevnad" heading + description
│   └── Bulk action bar (visible when rows selected)
│       ├── Tag select (Tjänst / Pendling / Privat / Otaggad)
│       └── Button ("Tagga {count} resor")
│
├── Card (untagged trips table)
│   └── Table
│       ├── Checkbox (per row, for bulk select)
│       ├── Datum (formatted date)
│       ├── Förare (driver name, from org members join)
│       ├── Sträcka (from → to addresses)
│       ├── Km (distance)
│       ├── Tagg (current tag Badge + quick-tag buttons)
│       └── Actions (per-row tag buttons)
│
└── Success state: "Alla resor är taggade!" (when no untagged trips)
```

---

### Reports & Export (`/dashboard/reports`)

```
Page
├── Header → "Rapporter & Export" heading + description
│
├── Period selector row
│   ├── DateInput (Från)
│   └── DateInput (Till)
│
├── Card (Körjournal — CSV)
│   ├── Description text
│   └── Button ("Exportera")
│
├── Card (Flottöversikt — PDF)
│   ├── Description text
│   └── Button ("Exportera")
│
└── Card (Skatteunderlag — PDF)
    ├── Description text
    └── Button ("Exportera")

All 3 cards call fleet-generate-report Edge Function.
Currently returns 501 — scaffold only.
```

---

### Settings (`/dashboard/settings`)

```
Page (visible to all fleet users — admin-only writes enforced in UI)
├── Header → "Inställningar" heading
│
├── OrganizationCard (Card)
│   ├── Input (Organisationsnamn — editable)
│   ├── Input (Organisationsnummer — editable)
│   └── Button ("Spara ändringar")
│       → Updates organizations table
│
├── AdminsCard (Card — read-only)
│   └── List of admin/viewer members
│       ├── Name + email
│       └── Role badge (Administratör / Läsare)
│
├── TagsCard (Card — read-only)
│   ├── Default tag badges (Tjänst, Pendling, Privat, Otaggad)
│   └── Info: "Anpassade taggar kommer snart"
│
├── BillingCard (Card — placeholder)
│   └── Text: "Kommer snart."
│
└── LanguageCard (Card)
    └── 2 × Button (Svenska / English)
        → Changes i18n language + localStorage
```

**Note:** Settings is NOT tabbed — all 5 cards render vertically on a single page.

---

## Shared Custom Components

These are project-specific components (not shadcn/ui):

### `<SectionCards>` / `<KpiSectionCards>`
```
4 KPI stat cards on dashboard overview (total km, work km, cost, untagged)
Uses: Card
Location: src/components/section-cards.tsx
```

### `<ChartAreaInteractive>`
```
Recharts AreaChart with gradient fill for activity chart
Uses: recharts AreaChart, Card
Location: src/components/chart-area-interactive.tsx
```

### `<DataTable>`
```
Reusable data table component
Uses: Table from shadcn/ui
Location: src/components/data-table.tsx
```

### `<LanguageSwitcher>`
```
Svenska / English toggle buttons
Uses: Button
Location: src/components/language-switcher.tsx
```

### `<RequireRole>`
```
Role-check utility component for guarding content
Location: src/components/require-role.tsx
```

### `<SiteHeader>`
```
Top header bar for the dashboard
Location: src/components/site-header.tsx
```

---

## Layout Components

### `<DashboardLayout>` (`src/layouts/dashboard-layout.tsx`)
Desktop: Sidebar (via `app-sidebar.tsx`) + main content area  
Mobile (<768px): Sheet drawer + full-width content

```
DashboardLayout
├── AppSidebar (desktop) / Sheet (mobile)
│   ├── Org name in header (falls back to "Millog")
│   ├── Nav items:
│   │   ├── Översikt (/dashboard) — LayoutDashboard icon
│   │   ├── Förare (/dashboard/drivers) — Users icon
│   │   ├── Fordon (/dashboard/vehicles) — Car icon
│   │   ├── Efterlevnad (/dashboard/compliance) — ClipboardCheck icon
│   │   ├── Rapporter (/dashboard/reports) — FileText icon
│   │   └── Inställningar (/dashboard/settings) — Settings icon
│   └── Footer: user dropdown (language toggle + logout)
│
├── SiteHeader (mobile)
│
└── SidebarInset
    ├── Dynamic breadcrumbs (from URL path segments)
    │   └── Special regex for driver detail pages
    └── Outlet (page content)
```

Auth guard: redirects to `/login` if no user. No org-level guard.

### `<PersonalLayout>` (`src/layouts/personal-layout.tsx`)
Personal sidebar + content area for individual users.

### `<AuthLayout>` (`src/layouts/auth-layout.tsx`)
Centered card on background, used for login page only.

```
AuthLayout
├── Centered container
│   └── Outlet (LoginPage card)
└── No sidebar
```

**Note:** Signup (`/signup`) and Accept Invite (`/accept-invite`) are standalone pages — they do NOT use AuthLayout.

---

## Chart Components (recharts)

### `<ChartAreaInteractive>` (`src/components/chart-area-interactive.tsx`)
```
Type: AreaChart with gradient fill
Data: km/day for last 30 days
Uses: recharts AreaChart, Area, XAxis, YAxis, Tooltip
```

Other charts are inlined in page components (e.g., battery sparkline in dashboard, SoC ring SVG in vehicle status card).

---

## File Structure (Actual)

```
src/
├── components/
│   ├── ui/                        ← shadcn/ui components (auto-generated)
│   │   ├── avatar.tsx
│   │   ├── badge.tsx
│   │   ├── breadcrumb.tsx
│   │   ├── button.tsx
│   │   ├── calendar.tsx
│   │   ├── card.tsx
│   │   ├── chart.tsx
│   │   ├── checkbox.tsx
│   │   ├── dialog.tsx
│   │   ├── drawer.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── form.tsx
│   │   ├── input.tsx
│   │   ├── label.tsx
│   │   ├── popover.tsx
│   │   ├── select.tsx
│   │   ├── separator.tsx
│   │   ├── sheet.tsx
│   │   ├── sidebar.tsx
│   │   ├── skeleton.tsx
│   │   ├── sonner.tsx
│   │   ├── table.tsx
│   │   ├── tabs.tsx
│   │   ├── toggle.tsx
│   │   ├── toggle-group.tsx
│   │   └── tooltip.tsx
│   ├── app-sidebar.tsx            ← Fleet sidebar (6 nav items)
│   ├── personal-sidebar.tsx       ← Personal sidebar
│   ├── chart-area-interactive.tsx ← Recharts area chart
│   ├── data-table.tsx             ← Reusable data table
│   ├── language-switcher.tsx      ← sv/en toggle
│   ├── require-role.tsx           ← Role check utility
│   ├── section-cards.tsx          ← KPI stat cards
│   ├── site-header.tsx            ← Top header bar
│   ├── nav-documents.tsx          ← Nav helpers
│   ├── nav-main.tsx
│   ├── nav-secondary.tsx
│   └── nav-user.tsx
├── contexts/
│   ├── auth-context.tsx           ← Supabase auth
│   └── org-context.tsx            ← Organization membership
├── hooks/
│   └── use-mobile.ts             ← Mobile detection hook
├── i18n/
│   ├── index.ts                   ← i18next config
│   ├── sv.ts                      ← Swedish strings (source of truth)
│   └── en.ts                      ← English strings (typed)
├── layouts/
│   ├── auth-layout.tsx            ← Login page layout
│   ├── dashboard-layout.tsx       ← Fleet sidebar + breadcrumbs + auth guard
│   └── personal-layout.tsx        ← Personal sidebar + auth guard
├── lib/
│   ├── supabase.ts                ← Supabase client
│   └── utils.ts                   ← Utility functions (cn, etc.)
├── pages/
│   ├── login.tsx
│   ├── signup.tsx                 ← 5-step wizard
│   ├── accept-invite.tsx
│   ├── dashboard/
│   │   ├── index.tsx              ← Overview (KPIs, charts, map, onboarding states)
│   │   ├── drivers.tsx            ← Driver list + InviteDriverDialog
│   │   ├── driver-detail.tsx      ← Driver profile + stats + trips
│   │   ├── vehicles.tsx           ← Vehicle cards + AddVehicleDialog
│   │   ├── compliance.tsx         ← Untagged trips + bulk tag
│   │   ├── reports.tsx            ← 3 export cards
│   │   └── settings.tsx           ← 5 cards (org, admins, tags, billing, language)
│   └── personal/
│       ├── index.tsx              ← Personal dashboard (3 tabs)
│       ├── trips.tsx              ← Trip list
│       ├── trip-detail.tsx        ← Trip detail
│       ├── statistics.tsx         ← Stat card overview
│       ├── statistics-efficiency.tsx ← Efficiency detail
│       ├── statistics-driving.tsx    ← Driving patterns detail
│       ├── export.tsx             ← Export page
│       └── _shared.tsx            ← Shared personal components
├── app.tsx                        ← Routes + providers
├── main.tsx                       ← Entry point
└── index.css                      ← Global styles
```
