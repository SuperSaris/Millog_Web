# Architecture — Millog Web

> The fleet portal is a **static SPA** that reads from Supabase. It has no server runtime, no backend process, and no connection to the telemetry pipeline. By the time the admin opens the dashboard, the VPS bridge has already written everything to the database.

---

## System Context

```
┌──────────────────────────────────────────────────────────┐
│                     Millog Ecosystem                      │
│                                                          │
│  Tesla Vehicle ──► VPS Bridge ──► Supabase (Postgres)    │
│  (Fleet Telemetry)   (MQTT)       (trips, breadcrumbs,   │
│                                    vehicles, profiles)    │
│                                          │                │
│                          ┌───────────────┼────────────┐  │
│                          │               │            │  │
│                     Mobile App      Millog Web    Edge Functions
│                     (Driver)        (Fleet Admin) (server-side ops)
│                          │               │            │  │
│                          └───────────────┼────────────┘  │
│                                          │                │
│                                     Supabase Auth         │
│                                     (shared sessions)     │
└──────────────────────────────────────────────────────────┘
```

**The web portal touches exactly two things:**
1. **Supabase** (Postgres via `@supabase/supabase-js`, Auth for sessions)
2. **Edge Functions** (for privileged operations: account creation, PDF generation)

It does NOT touch: VPS, MQTT, bridge, Tesla API, telemetry stream.

---

## Authentication Architecture

### How It Works

```
Fleet Admin (browser)
  │
  ├── Login: supabase.auth.signInWithPassword()
  │          → Supabase returns JWT + refresh token
  │          → Stored in localStorage via @supabase/ssr
  │
  ├── Every request: JWT attached automatically
  │                   RLS policies evaluate auth.uid()
  │
  └── Logout: supabase.auth.signOut()
              → Tokens cleared
```

### Session Management

- Use `createBrowserClient()` from `@supabase/ssr`
- `autoRefreshToken: true` — silent refresh before JWT expires
- `persistSession: true` — survives page refresh (localStorage)
- `detectSessionInUrl: true` — needed for password reset redirect links

### Auth Context Shape

```typescript
interface AuthContextValue {
  user: User | null;          // Supabase auth user
  session: Session | null;    // Current session (JWT + refresh)
  isLoading: boolean;         // True while initial session loads
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}
```

### Org Context Shape (nested inside Auth)

```typescript
// src/contexts/org-context.tsx
type OrgRole = "admin" | "driver" | "viewer";
type MemberStatus = "invited" | "active" | "deactivated";

interface Organization {
  id: string;
  name: string;
  org_number: string | null;
  billing_email: string | null;
  settings: Record<string, unknown>;
  created_at: string;
}

interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgRole;
  status: MemberStatus;
}

interface OrgContextValue {
  organization: Organization | null;
  membership: OrganizationMember | null;
  role: OrgRole | null;
  isAdmin: boolean;
  isFleetUser: boolean;
  loading: boolean;
  /** Re-fetch org data (e.g. after settings change) */
  refresh: () => Promise<void>;
}
```

---

## Authorization Model

### Role Hierarchy

| Role     | Can manage drivers | Can read trips | Can export | Can edit settings | Can manage billing |
| -------- | ------------------ | -------------- | ---------- | ----------------- | ------------------ |
| admin    | ✅                  | ✅              | ✅          | ✅                 | ✅                  |
| viewer   | ❌                  | ✅              | ✅          | ❌                 | ❌                  |
| driver   | ❌                  | Own only       | Own only   | ❌                 | ❌                  |

### How RLS Enforces This

Fleet admins don't get service-role access. They get **additive RLS policies** that allow:
- `SELECT` on `trips` WHERE the trip's `user_id` belongs to the same org
- `SELECT` on `organizations` WHERE user is a member
- `ALL` on `organization_members` WHERE user is an admin of that org
- `ALL` on `fleet_invitations` WHERE user is an admin
- `ALL` on `organization_tags` WHERE user is an admin
- `SELECT` on `organization_tags` WHERE user is any member (drivers read tags too)

**Critically:** No `UPDATE` or `DELETE` policy on `trips` for fleet admins. Trips are read-only to admins. The driver owns their data.

### Route Guards

```
/login              → Public (no auth required)
/signup             → Public (no auth required)
/accept-invite      → Public (no auth required)
/dashboard/*        → Requires authenticated session (DashboardLayout auth guard)
/dashboard/settings → Visible to all fleet users (admin-only writes enforced in UI)
/personal/*         → Requires authenticated session (PersonalLayout auth guard)
```

**Note:** There is no server-side route protection beyond Supabase RLS. The `DashboardLayout` component redirects unauthenticated users to `/login`. Write operations (invite driver, update org, etc.) check `isAdmin` in the UI and Edge Functions validate the JWT + org admin role server-side.

---

## Data Flow Patterns

### Pattern 1: Read-Only Dashboard Data

```
Component → useQuery() → supabase.from('trips').select() → RLS filters → Data
```

All dashboard reads go through the anon key client. RLS ensures:
- Admin sees trips for all org members
- Viewer sees trips for all org members
- Driver (if they logged into web) sees only their own

The web portal is built for admins. Drivers use the mobile app. But the RLS model is sound either way.

### Pattern 2: Privileged Write Operations (via Edge Functions)

```
Component → fetch() → Edge Function (service role) → Supabase Admin API → Result
```

Operations that need the service role key:
- **Creating driver accounts** — `supabase.auth.admin.createUser()` requires service role
- **Generating PDF reports** — needs cross-user trip data aggregation
- **Sending reminder emails** — needs to reference org member data server-side

The client calls these as authenticated fetch requests:
```typescript
const { data } = await supabase.functions.invoke('fleet-invite-driver', {
  body: { name: 'Johan', email: 'johan@company.se', role: 'driver' }
});
```

The Edge Function validates the caller's JWT, checks they're an org admin, then uses the service role for privileged operations.

### Pattern 3: Realtime (Optional, Phase 1+)

The dashboard could subscribe to Supabase Realtime for live updates:
- New trips appearing as drivers return from drives
- Compliance score updating in real-time

**Phase 1 decision:** Not required. `react-query` with `staleTime` + `refetchInterval` (every 60s) is sufficient. Admins don't need sub-second latency.

---

## Routing Architecture

### Client-Side Routing (react-router-dom v7)

```
# Auth routes
/login               → LoginPage (via AuthLayout)
/signup              → SignupPage (standalone — 5-step wizard)
/accept-invite       → AcceptInvitePage (standalone)

# Dashboard routes (via DashboardLayout — sidebar + content area)
/dashboard              → DashboardPage (KPIs, charts, map, onboarding states)
/dashboard/drivers      → DriversPage (table + invite dialog)
/dashboard/drivers/:id  → DriverDetailPage (profile, stats, trips)
/dashboard/vehicles     → VehiclesPage (card grid + add vehicle dialog)
/dashboard/compliance   → CompliancePage (untagged trips + bulk tag)
/dashboard/reports      → ReportsPage (period selector + 3 export cards)
/dashboard/settings     → SettingsPage (5 cards: org, admins, tags, billing, language)

# Personal routes (via PersonalLayout)
/personal               → PersonalDashboardPage
/personal/trips         → TripsPage
/personal/trips/:id     → TripDetailPage
/personal/statistics    → StatisticsPage
/personal/statistics/efficiency → StatisticsEfficiencyPage
/personal/statistics/driving    → StatisticsDrivingPage
/personal/export        → ExportPage

# Fallback
/*                   → Redirect to /login
```

### SPA Hosting (Loopia)

Since this is a client-side SPA, all routes must resolve to `index.html`. The `.htaccess` file handles this:

```apache
Options -MultiViews
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^ index.html [QSA,L]
```

No server-side rendering. No edge functions running at the hosting level. Pure static files.

---

## Environment Variables

```bash
# .env.local (never committed)
VITE_SUPABASE_URL=https://bfbdoamqywlkgynjgway.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...

# Optional: Stripe publishable key (for billing portal redirect)
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

**Security rules:**
- `VITE_` prefix = exposed to client bundle (Vite convention) — only safe for anon/publishable keys
- Service role key, Stripe secret key = Edge Functions only, never in client
- No Tesla API keys in this project — the web portal never talks to Tesla

---

## Build & Deploy

```bash
# Build
pnpm build
# Output: dist/index.html, dist/assets/*.js, dist/assets/*.css

# Deploy to Loopia
# FTP upload dist/ contents to app.millogapp.se document root
# Ensure .htaccess is in the root alongside index.html

# Verify
curl -I https://app.millogapp.se/dashboard/drivers
# Should return 200 (not 404) — .htaccess is working
```

---

## Security Considerations

| Threat | Mitigation |
| ------ | ---------- |
| XSS via trip data (addresses, notes) | React auto-escapes JSX. Never use `dangerouslySetInnerHTML`. |
| Broken access control (admin sees wrong org) | RLS requires org membership JOIN — cannot bypass by guessing IDs |
| CSV injection in bulk import | Validate CSV server-side in Edge Function. Parameterized queries only. |
| Session hijacking | HTTPS-only. Supabase JWT with short expiry + refresh rotation. |
| Service role key exposure | Never in client bundle. Edge Functions only. |
| Enumeration of org members | All APIs require authenticated session + org membership check |

---

## What This Project Does NOT Own

To prevent scope creep, these are explicitly other systems' responsibilities:

- **Trip detection, opening, closing** → VPS bridge (server/bridge/)
- **Tesla API calls, wake logic** → Mobile app + Edge Functions
- **Telemetry streaming, MQTT** → VPS Docker stack
- **Individual user billing (RevenueCat)** → Mobile app
- **Driver-facing UI** → Mobile app (Expo/React Native)
- **Database schema management** → Millog main repo (supabase/)

---

## Implementation Status (May 2025)

### Contexts & Providers

| Provider | File | Status |
| -------- | ---- | ------ |
| `AuthProvider` | `src/contexts/auth-context.tsx` | ✅ Implemented — email + password login, session persistence |
| `OrgProvider` | `src/contexts/org-context.tsx` | ✅ Implemented — fetches `organization_members` + `organizations` for current user; exposes `organization`, `membership`, `role`, `isAdmin`, `isFleetUser`, `loading`, `refresh()`. Organization interface includes `billing_email` and `settings` JSONB. |

### Route Guards

| Guard | File | Status |
| ----- | ---- | ------ |
| `DashboardLayout` auth guard | `src/layouts/dashboard-layout.tsx` | ✅ Redirects to `/login` if no user. No org-level guard — pages handle empty org state individually. |
| `PersonalLayout` auth guard | `src/layouts/personal-layout.tsx` | ✅ Redirects to `/login` if no user. |

### Pages — Fleet Dashboard

| Screen | Route | File | Status |
| ------ | ----- | ---- | ------ |
| Login | `/login` | `pages/login.tsx` | ✅ Working (email + password, org/personal toggle) |
| Signup | `/signup` | `pages/signup.tsx` | ✅ 5-step wizard — calls `fleet-create-org` Edge Function |
| Accept Invite | `/accept-invite` | `pages/accept-invite.tsx` | ✅ UI built — requires SMTP for invite emails |
| Dashboard Overview | `/dashboard` | `pages/dashboard/index.tsx` | ✅ KPI cards, charts, map, battery health, onboarding states (WelcomeOnboarding + GettingStartedBanner) |
| Drivers List | `/dashboard/drivers` | `pages/dashboard/drivers.tsx` | ✅ Full CRUD: DataTable, InviteDriverDialog, status badges, deactivate/reactivate |
| Driver Detail | `/dashboard/drivers/:id` | `pages/dashboard/driver-detail.tsx` | ✅ Profile card, stats row, assigned vehicles, trip table |
| Vehicles | `/dashboard/vehicles` | `pages/dashboard/vehicles.tsx` | ✅ Vehicle card grid, AddVehicleDialog (VIN lookup), pool car toggle, driver assignment |
| Compliance | `/dashboard/compliance` | `pages/dashboard/compliance.tsx` | ✅ Untagged trips table, bulk tag actions, single-trip tag buttons |
| Reports | `/dashboard/reports` | `pages/dashboard/reports.tsx` | ✅ Period selector, 3 export cards (CSV/PDF/Skatteverket). Edge Function returns 501 — report logic not yet implemented. |
| Settings | `/dashboard/settings` | `pages/dashboard/settings.tsx` | ✅ 5 cards: org form, admins list, tags (read-only), billing placeholder, language switcher. Visible to all fleet users — admin-only writes enforced in UI. |

### Pages — Personal

| Screen | Route | File | Status |
| ------ | ----- | ---- | ------ |
| Personal Home | `/personal` | `pages/personal/index.tsx` | ✅ Independent personal drive log |
| Trips | `/personal/trips` | `pages/personal/trips.tsx` | ✅ Trip list with date navigation |
| Trip Detail | `/personal/trips/:id` | `pages/personal/trip-detail.tsx` | ✅ Full trip detail page |
| Statistics | `/personal/statistics` | `pages/personal/statistics.tsx` | ✅ Stat card overview |
| Efficiency Detail | `/personal/statistics/efficiency` | `pages/personal/statistics-efficiency.tsx` | ✅ Charts + detail metrics |
| Driving Detail | `/personal/statistics/driving` | `pages/personal/statistics-driving.tsx` | ✅ Charts + detail metrics |
| Export | `/personal/export` | `pages/personal/export.tsx` | ✅ Export format selection |

### Sidebar & Navigation

- `app-sidebar.tsx`: 6 nav items (Översikt, Förare, Fordon, Efterlevnad, Rapporter, Inställningar) — all visible to all fleet users (no role filtering)
- `personal-sidebar.tsx`: Personal navigation sidebar
- `dashboard-layout.tsx`: Dynamic breadcrumbs including driver detail regex

### Shared Components (non-ui)

| Component | File | Purpose |
| --------- | ---- | ------- |
| `app-sidebar` | `src/components/app-sidebar.tsx` | Fleet sidebar with 6 nav items + org name |
| `personal-sidebar` | `src/components/personal-sidebar.tsx` | Personal sidebar |
| `language-switcher` | `src/components/language-switcher.tsx` | sv/en toggle |
| `require-role` | `src/components/require-role.tsx` | Role check utility |
| `section-cards` | `src/components/section-cards.tsx` | KPI card components |
| `site-header` | `src/components/site-header.tsx` | Top header bar |
| `chart-area-interactive` | `src/components/chart-area-interactive.tsx` | Recharts area chart |
| `data-table` | `src/components/data-table.tsx` | Reusable data table |

### i18n

- `sv.ts` and `en.ts` contain all keys across: `common.*`, `nav.*`, `login.*`, `setup.*`, `invite.*`, `dashboard.*`, `drivers.*`, `vehicles.*`, `compliance.*`, `reports.*`, `settings.*`, `personal.*`

### Backend (Supabase Edge Functions)

| Function | Status | Notes |
| -------- | ------ | ----- |
| `fleet-create-org` | ✅ Deployed (v1) | Creates org + admin member. Needs redeployment to accept `billing_email` + `settings`. |
| `fleet-invite-driver` | ✅ Deployed (v1) | Creates driver account with temp password. SMTP needed for invite emails. |
| `fleet-generate-report` | ✅ Deployed (v1) | Returns 501 — scaffold only, report generation logic not implemented. |
| `fleet-delete-org` | ✅ Ready | Permanently deletes org + CASCADE data. Best-effort telemetry offboarding for all org vehicles. Optional driver account deletion. 3-step UI confirmation required. |

### Database Schema (Fleet Tables)

| Table | Status | Notes |
| ----- | ------ | ----- |
| `organizations` | ✅ Deployed | Includes `billing_email` (text) and `settings` (jsonb NOT NULL DEFAULT '{}') |
| `organization_members` | ✅ Deployed | Roles: admin, viewer, driver. Statuses: active, invited, deactivated |
| `fleet_invitations` | ✅ Deployed | Tracks invitation tokens and status |
| `organization_vehicles` | ✅ Deployed | Links vehicles to organizations |
| `organization_vehicle_assignments` | ✅ Deployed | Assigns specific vehicles to drivers within org |

### Not Built

| Feature | Notes |
| ------- | ----- |
| Bulk CSV import | `/dashboard/drivers/import` route not created |
| Custom tag CRUD | Tags card in settings is read-only (shows defaults) |
| Admin add/remove | Admins card in settings is read-only |
| Billing integration | Billing card says "Kommer snart" |
| Compliance reminders | No email sending capability yet |
| Report PDF generation | Edge Function scaffold only |
