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
interface OrgContextValue {
  org: Organization | null;   // Current organization
  role: 'admin' | 'viewer' | null;  // Current user's role
  members: OrgMember[];       // All org members (drivers + admins)
  isLoading: boolean;
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
/privacy            → Public (no auth required)
/dashboard/*        → Requires authenticated session
/dashboard/settings/* → Requires role === 'admin'
/dashboard/drivers/new → Requires role === 'admin'
/dashboard/drivers/import → Requires role === 'admin'
```

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
const { data } = await supabase.functions.invoke('fleet-create-drivers', {
  body: { drivers: [{ name: 'Johan', email: 'johan@company.se' }] }
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
/                    → Redirect to /dashboard (if authenticated) or /login
/login               → LoginPage
/signup              → SignupPage
/privacy             → PrivacyPage
/dashboard           → DashboardLayout (sidebar + content area)
  /dashboard              → FleetOverview
  /dashboard/drivers      → DriverList
  /dashboard/drivers/:id  → DriverDetail
  /dashboard/drivers/new  → DriverInvite
  /dashboard/drivers/import → BulkImport
  /dashboard/vehicles     → VehicleList
  /dashboard/compliance   → ComplianceView
  /dashboard/reports      → ReportsExport
  /dashboard/settings     → OrgSettings
  /dashboard/settings/tags → TagManagement
  /dashboard/settings/admins → AdminManagement
  /dashboard/settings/billing → BillingPortal
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
