# Component Map — Millog Web

> Maps every screen to the shadcn/ui components it uses, plus shared patterns and custom components.

---

## shadcn/ui Component Inventory

Components to install from shadcn/ui (b0 preset):

| Component | Used On | `pnpm dlx shadcn@latest add` |
| --------- | ------- | ----- |
| **Button** | Every screen | `button` |
| **Card** | Dashboard stats, driver summary, vehicle cards | `card` |
| **DataTable** | Driver list, trip list, compliance, vehicles | `table` + custom |
| **Input** | All forms (login, signup, settings, invite) | `input` |
| **Label** | All form fields | `label` |
| **Dialog** | Confirm actions, invite result, tag editor | `dialog` |
| **DropdownMenu** | Row actions, period selector, user menu | `dropdown-menu` |
| **Select** | Tag category picker, role picker, vehicle assignment | `select` |
| **Badge** | Tag labels, compliance status, role labels | `badge` |
| **Tabs** | Settings page (org/tags/admins/billing) | `tabs` |
| **Calendar** | Date range picker (reports, filters) | `calendar` |
| **Popover** | Date picker trigger, color picker | `popover` |
| **Separator** | Section dividers in settings, driver detail | `separator` |
| **Avatar** | Driver initials in list and detail | `avatar` |
| **Skeleton** | Loading states for cards, tables, charts | `skeleton` |
| **Toast** | Success/error notifications | `sonner` |
| **Alert** | Empty states, warnings, error messages | `alert` |
| **Progress** | Compliance percentage bars | `progress` |
| **Tooltip** | Icon actions, truncated text, chart hover | `tooltip` |
| **Sheet** | Mobile nav drawer (responsive) | `sheet` |
| **Sidebar** | Desktop navigation | `sidebar` |
| **Breadcrumb** | Page navigation trail | `breadcrumb` |
| **Command** | Search palette (Cmd+K) | `command` |
| **Form** | All forms (react-hook-form + zod integration) | `form` |
| **Switch** | Toggle settings (e.g., email notifications) | `switch` |
| **Checkbox** | Bulk select drivers, CSV preview rows | `checkbox` |

**Install command (all at once):**
```bash
pnpm dlx shadcn@latest add button card table input label dialog dropdown-menu select badge tabs calendar popover separator avatar skeleton sonner alert progress tooltip sheet sidebar breadcrumb command form switch checkbox
```

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

### Signup (`/signup`)

```
Card
├── CardHeader → "Skapa företagskonto"
├── CardContent
│   ├── Form
│   │   ├── Input (Företagsnamn)
│   │   ├── Input (Organisationsnummer, optional)
│   │   ├── Input (E-post)
│   │   ├── Input (Lösenord)
│   │   ├── Input (Faktura-e-post)
│   │   └── Button ("Skapa konto")
│   └── Alert (error state)
└── CardFooter → Link ("Har redan konto? Logga in")
```

---

### Dashboard Overview (`/dashboard`)

```
Page
├── Header
│   ├── Breadcrumb (Hem / Dashboard)
│   ├── PeriodSelector (DropdownMenu: "Denna vecka" | "Denna månad" | "Senaste 30 dagar")
│   └── Button ("Exportera", secondary)
│
├── StatsRow (6 × Card)
│   ├── StatCard ("Totala km")
│   ├── StatCard ("Elkostnad")
│   ├── StatCard ("Tjänsteresor km")
│   ├── StatCard ("Otaggade resor", alert if > 0)
│   ├── StatCard ("Aktiva fordon")
│   └── StatCard ("Förare")
│
├── Card → WeeklyChart
│   └── recharts BarChart (stacked: work/personal/commute/untagged)
│
└── Card → RecentActivity (last 5 trips across fleet)
    └── Table rows with driver name, from → to, km, tag badge
```

**Custom components:**
- `<StatCard>` — Card with icon, label, value, optional trend indicator
- `<WeeklyChart>` — recharts BarChart wrapper with Swedish labels
- `<PeriodSelector>` — DropdownMenu with preset date ranges

---

### Driver List (`/dashboard/drivers`)

```
Page
├── Header
│   ├── Breadcrumb
│   ├── Input (search/filter)
│   └── ButtonGroup
│       ├── Button ("Bjud in förare")
│       └── Button ("Importera CSV", secondary)
│
└── DataTable
    ├── Columns:
    │   ├── Avatar + Name
    │   ├── Email
    │   ├── Vehicle (display_name or "Ej tilldelad")
    │   ├── Otaggade resor (Badge: green/yellow/red)
    │   ├── Senaste resa (relative date)
    │   └── Actions (DropdownMenu: Visa, Skicka påminnelse, Inaktivera)
    ├── Sortable headers (name, untagged count, last trip)
    └── Pagination (25 per page)
```

**Custom components:**
- `<DriverDataTable>` — DataTable with driver-specific columns, sort, search
- `<ComplianceBadge>` — Badge with color logic (0=green, 1-5=yellow, 6+=red)
- `<InviteDriverDialog>` — Dialog with inline form (name + email) → shows temp password
- `<BulkImportDialog>` — Multi-step Dialog: upload CSV → preview table → results

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

### Single Driver Invite (`/dashboard/drivers/invite`)

```
Dialog (or inline on driver list page)
├── DialogHeader → "Bjud in förare"
├── DialogContent
│   ├── Form
│   │   ├── Input (Namn)
│   │   ├── Input (E-post)
│   │   └── Button ("Skapa konto")
│   │
│   └── ResultCard (shown after success)
│       ├── Alert (success, "Konto skapat!")
│       ├── Display: name, email
│       ├── Display: temp password (monospace, large)
│       ├── Button ("Kopiera lösenord", copies to clipboard)
│       └── Alert (info, "Lösenordet visas bara en gång...")
│
└── DialogFooter → Button ("Stäng")
```

---

### Bulk CSV Import (`/dashboard/drivers/import`)

```
Dialog (multi-step)

Step 1: Upload
├── Dropzone area (drag & drop CSV)
├── Button ("Välj fil")
└── Alert (info, "CSV-format: namn, e-post — en rad per förare")

Step 2: Preview
├── Table (parsed CSV rows)
│   ├── Checkbox (select/deselect)
│   ├── Namn
│   ├── E-post
│   └── Status (✓ valid / ✗ duplicate / ✗ bad email)
├── Summary: "28 av 30 giltiga"
└── Button ("Skapa 28 konton")

Step 3: Results
├── Table
│   ├── Namn
│   ├── E-post
│   ├── Tillfälligt lösenord
│   └── Status (✓ / ✗)
├── Button ("Kopiera alla lösenord")
└── Button ("Ladda ner som CSV")
```

---

### Compliance View (`/dashboard/compliance`)

```
Page
├── Header
│   ├── Breadcrumb
│   └── Button ("Skicka påminnelse till alla med otaggade")
│
├── Fleet Summary Card
│   ├── Progress bar (tagged % of total)
│   └── Text: "142 av 156 resor taggade (91%)"
│
└── DataTable (drivers sorted by untagged count DESC)
    ├── Avatar + Name
    ├── Otaggade resor (number, bold if > 0)
    ├── Totala resor
    ├── Compliance % (Progress micro-bar)
    ├── Senast taggad (relative date or "Aldrig")
    ├── Status (Badge: Grön/Gul/Röd)
    └── Actions (DropdownMenu: "Visa resor", "Skicka påminnelse")
```

---

### Reports & Export (`/dashboard/reports`)

```
Page
├── Header → "Rapporter & Export"
│
├── Card (Körjournal PDF)
│   ├── Select (driver or "Alla förare")
│   ├── DateRangePicker (start + end)
│   └── Button ("Generera PDF")
│
├── Card (Flottöversikt PDF)
│   ├── DateRangePicker
│   └── Button ("Generera PDF")
│
├── Card (Rådata CSV)
│   ├── Select (driver or alla)
│   ├── DateRangePicker
│   └── Button ("Ladda ner CSV")
│
└── Card (Förmånsbeskattning)
    ├── Select (year: 2025, 2026)
    ├── Select (driver or alla)
    └── Button ("Generera rapport")
```

**Custom components:**
- `<DateRangePicker>` — Popover + Calendar (two months), returns { from, to }
- `<ExportCard>` — Card with form fields + download button, handles loading + error states

---

### Settings (`/dashboard/settings`)

```
Page
├── Tabs
│   ├── Tab: Företag
│   │   ├── Form (name, org number, billing email)
│   │   └── Button ("Spara")
│   │
│   ├── Tab: Taggar
│   │   ├── Sortable list of org tags
│   │   │   ├── Color swatch + Label + Category badge
│   │   │   └── Actions: Edit, Delete
│   │   ├── Button ("Lägg till tagg")
│   │   └── Dialog (tag editor: label, category select, color picker)
│   │
│   ├── Tab: Administratörer
│   │   ├── Table (admins/viewers with role badges)
│   │   ├── Button ("Bjud in admin")
│   │   └── Dialog (invite admin form)
│   │
│   └── Tab: Fakturering
│       ├── Current plan display
│       ├── Billing info
│       └── Button ("Hantera prenumeration", links to Stripe portal)
```

---

## Shared Custom Components

These are project-specific components built on top of shadcn primitives:

### `<StatCard>`
```
Props: { title: string; value: string | number; icon: LucideIcon; trend?: number; alert?: boolean }
Uses: Card, CardHeader, CardContent
Location: src/components/stat-card.tsx
```

### `<ComplianceBadge>`
```
Props: { untaggedCount: number }
Logic: 0 → green "Komplett", 1-5 → yellow "{n} otaggade", 6+ → red "{n} otaggade"
Uses: Badge (with variant overrides)
Location: src/components/compliance-badge.tsx
```

### `<DateRangePicker>`
```
Props: { value: { from: Date; to: Date }; onChange: (range) => void }
Uses: Popover, Calendar (mode="range"), Button
Location: src/components/date-range-picker.tsx
```

### `<PeriodSelector>`
```
Props: { value: string; onChange: (period) => void }
Presets: "this-week", "this-month", "last-30-days", "last-quarter", "this-year", "custom"
Uses: DropdownMenu
Location: src/components/period-selector.tsx
```

### `<DriverAvatar>`
```
Props: { name: string; size?: 'sm' | 'md' | 'lg' }
Logic: Extract initials from name, deterministic color from name hash
Uses: Avatar, AvatarFallback
Location: src/components/driver-avatar.tsx
```

### `<TripTagBadge>`
```
Props: { tag: string; orgTags?: OrgTag[] }
Logic: Maps tag to color (built-in: work=blue, personal=purple, commute=teal, untagged=gray; org tags use their custom color)
Uses: Badge
Location: src/components/trip-tag-badge.tsx
```

### `<EmptyState>`
```
Props: { icon: LucideIcon; title: string; description: string; action?: { label: string; onClick: () => void } }
Used for: No drivers, no trips, no vehicles, no reports
Location: src/components/empty-state.tsx
```

### `<PageHeader>`
```
Props: { title: string; breadcrumbs: Array<{ label: string; href?: string }>; actions?: ReactNode }
Uses: Breadcrumb, heading typography
Location: src/components/page-header.tsx
```

---

## Layout Components

### `<AppLayout>`
Desktop: Sidebar (240px) + main content area  
Mobile (<768px): Sheet drawer + full-width content

```
AppLayout
├── Sidebar (desktop) / Sheet (mobile)
│   ├── Logo
│   ├── Nav items:
│   │   ├── Översikt (/dashboard) — LayoutDashboard icon
│   │   ├── Förare (/dashboard/drivers) — Users icon
│   │   ├── Fordon (/dashboard/vehicles) — Car icon
│   │   ├── Efterlevnad (/dashboard/compliance) — ClipboardCheck icon
│   │   ├── Rapporter (/dashboard/reports) — FileText icon
│   │   └── Inställningar (/dashboard/settings) — Settings icon
│   └── Footer: user avatar + name + logout
│
└── Main
    ├── Mobile header (Sheet trigger + page title)
    └── Content (scrollable)
```

### `<AuthLayout>`
Centered card on gradient background, used for login/signup/reset-password.

```
AuthLayout
├── Centered container (max-w-md)
│   ├── Logo (centered above card)
│   └── {children} (Card with form)
└── Footer: "© Millog 2026" + privacy link
```

---

## Chart Components (recharts)

### `<WeeklyKmChart>`
```
Type: BarChart (stacked)
Data: [{ week: "V.14", work: 320, personal: 150, commute: 80, untagged: 40 }, ...]
Colors: Brand tag colors from Millog theme
Uses: recharts BarChart, Bar, XAxis, YAxis, Tooltip, Legend
Location: src/components/charts/weekly-km-chart.tsx
```

### `<ComplianceTrendChart>`
```
Type: LineChart
Data: [{ month: "Jan", compliancePct: 85 }, { month: "Feb", compliancePct: 91 }, ...]
Uses: recharts LineChart, Line, XAxis, YAxis, Tooltip
Location: src/components/charts/compliance-trend-chart.tsx
```

---

## File Structure Summary

```
src/
├── components/
│   ├── ui/              ← shadcn/ui components (auto-generated)
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── table.tsx
│   │   └── ...
│   ├── charts/          ← recharts wrappers
│   │   ├── weekly-km-chart.tsx
│   │   └── compliance-trend-chart.tsx
│   ├── stat-card.tsx
│   ├── compliance-badge.tsx
│   ├── date-range-picker.tsx
│   ├── period-selector.tsx
│   ├── driver-avatar.tsx
│   ├── trip-tag-badge.tsx
│   ├── empty-state.tsx
│   ├── page-header.tsx
│   ├── app-layout.tsx
│   └── auth-layout.tsx
├── pages/               ← route pages
│   ├── login.tsx
│   ├── signup.tsx
│   ├── reset-password.tsx
│   ├── dashboard/
│   │   ├── index.tsx      (overview)
│   │   ├── drivers/
│   │   │   ├── index.tsx  (list)
│   │   │   └── [id].tsx   (detail)
│   │   ├── vehicles.tsx
│   │   ├── compliance.tsx
│   │   ├── reports.tsx
│   │   └── settings.tsx
│   └── privacy.tsx
├── hooks/               ← react-query hooks
│   ├── use-fleet-stats.ts
│   ├── use-drivers.ts
│   ├── use-driver-trips.ts
│   ├── use-compliance.ts
│   ├── use-vehicles.ts
│   ├── use-org-tags.ts
│   └── use-auth.ts
├── lib/
│   ├── supabase.ts
│   ├── query-keys.ts
│   └── utils.ts
└── types/
    └── database.ts      ← generated from Supabase
```
