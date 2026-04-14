# Screens — Millog Web

> Every screen the fleet admin interacts with. Reflects the **actual implementation** as of May 2025.

---

## Table of Contents

1. [Login](#1-login)
2. [Signup — Organization Creation (5-Step Wizard)](#2-signup--organization-creation-5-step-wizard)
3. [Accept Invite](#3-accept-invite)
4. [Fleet Overview (Dashboard Home)](#4-fleet-overview--dashboard-home)
5. [Driver List](#5-driver-list)
6. [Driver Detail](#6-driver-detail)
7. [Vehicle List](#7-vehicle-list)
8. [Compliance View](#8-compliance-view)
9. [Reports & Export](#9-reports--export)
10. [Settings](#10-settings)
11. [Personal Home](#11-personal-home)

---

## Implementation Status

| # | Screen | Route | File | Status |
| - | ------ | ----- | ---- | ------ |
| 1 | Login | `/login` | `pages/login.tsx` | ✅ Working |
| 2 | Signup Wizard | `/signup` | `pages/signup.tsx` | ✅ 5-step wizard |
| 3 | Accept Invite | `/accept-invite` | `pages/accept-invite.tsx` | ✅ UI built (needs SMTP) |
| 4 | Dashboard Overview | `/dashboard` | `pages/dashboard/index.tsx` | ✅ KPI cards, charts, map, onboarding states |
| 5 | Driver List | `/dashboard/drivers` | `pages/dashboard/drivers.tsx` | ✅ Full CRUD |
| 6 | Driver Detail | `/dashboard/drivers/:id` | `pages/dashboard/driver-detail.tsx` | ✅ Profile, stats, trips |
| 7 | Vehicle List | `/dashboard/vehicles` | `pages/dashboard/vehicles.tsx` | ✅ Full CRUD |
| 8 | Compliance | `/dashboard/compliance` | `pages/dashboard/compliance.tsx` | ✅ Bulk tag actions |
| 9 | Reports | `/dashboard/reports` | `pages/dashboard/reports.tsx` | ✅ UI (Edge Function scaffold) |
| 10 | Settings | `/dashboard/settings` | `pages/dashboard/settings.tsx` | ✅ 5 cards |
| 11 | Personal Home | `/personal` | `pages/personal/index.tsx` | ✅ Full personal log |

### Not Started

| Feature | Notes |
| ------- | ----- |
| Bulk CSV Import | `/dashboard/drivers/import` — not built |
| Custom Tag CRUD | Tags card in settings is read-only (shows defaults) |
| Admin add/remove | Admins card in settings is read-only |
| Billing integration | Billing card says "Kommer snart" |

---

## 1. Login

**Route:** `/login`  
**File:** `pages/login.tsx`  
**Auth required:** No

### Layout

- Centered card with Millog branding
- Toggle between "Organisation" and "Privatperson" login modes
- Email + password fields
- "Logga in" primary button
- "Glömt lösenord?" text link
- Organization mode shows "Skapa nytt flottkonto" link → `/signup`

### Behavior

- `supabase.auth.signInWithPassword({ email, password })`
- Org login success → `/dashboard`
- Personal login success → `/personal`
- Error → inline error message below form
- Forgot password → `supabase.auth.resetPasswordForEmail(email)` → toast

---

## 2. Signup — Organization Creation (5-Step Wizard)

**Route:** `/signup`  
**File:** `pages/signup.tsx`  
**Auth required:** No

### 5 Steps

| Step | Title | Fields |
| ---- | ----- | ------ |
| 1 — Organisation | Organisationsinformation | Företagsnamn (required), Organisationsnummer (optional, XXXXXX-XXXX), Faktura-e-post (optional) |
| 2 — Administratör | Administratörskonto | Fullständigt namn, E-post, Lösenord, Bekräfta lösenord |
| 3 — Synlighet | Vad förarna ser | 6 toggles: Resor, Statistik, Elkostnad, Karta, Taggning, Exportera |
| 4 — Taggning | Restaggning | Default tag radio (Ingen/Tjänst/Pendling/Privat), Kräv taggning toggle, Egna taggar toggle |
| 5 — Granska | Granska och skapa | Read-only summary of all 4 previous steps |

### UI Details

- Centered card layout (max-width 600px)
- Progress bar: "Steg 1 av 5" with green fill
- Back/Next navigation buttons per step
- Each step has an info legend ("All information kan ändras senare under Inställningar.")
- Step 3 toggles have descriptive helper text per option
- Step 4 radio cards with description per tag option

### Behavior

1. Per-step validation (company name required on step 1, all admin fields on step 2)
2. Step 5 "Skapa organisation" button triggers:
   - `supabase.auth.signUp({ email, password, options: { data: { full_name } } })`
   - Edge Function `fleet-create-org` with `{ company_name, org_number, billing_email, settings }`
3. Success → celebration screen with next-step hints:
   - Bjud in förare
   - Lägg till fordon / koppla Tesla-konton
   - Finjustera inställningar
4. "Gå till dashboard" → `/dashboard`

### i18n

All keys under `setup.*` namespace (~70 keys). Both Swedish and English.

---

## 3. Accept Invite

**Route:** `/accept-invite?token=...`  
**File:** `pages/accept-invite.tsx`  
**Auth required:** No

### Behavior

1. Reads `token` from URL query params
2. Looks up `fleet_invitations` by token → gets organization name
3. Shows welcome card: "Välkommen! Du har bjudits in till {org}."
4. Password field → user sets their password
5. On submit → account activated, redirect to login

**Status:** UI built. Requires SMTP to be configured in Supabase for the invite email to reach the driver.

---

## 4. Fleet Overview — Dashboard Home

**Route:** `/dashboard`  
**File:** `pages/dashboard/index.tsx`  
**Auth required:** Yes

### Three States

#### State 1: No Organization (WelcomeOnboarding)

Shown when `organization === null` after org context loads.

- Large centered welcome card with Millog bolt icon
- "Välkommen till Millog Fleet!" heading
- "Du har ingen organisation kopplad till ditt konto ännu."
- "Skapa organisation" button → `/signup`
- 3 info cards showing the onboarding flow (invite, connect, track)

#### State 2: Empty Fleet (GettingStartedBanner)

Shown when org exists but is newly created (few members, no vehicles).

- Checklist card with primary styling:
  - [ ] Bjud in din första förare → `/dashboard/drivers`
  - [ ] Koppla ert första fordon → `/dashboard/vehicles`
  - [x] Granska organisationsinställningar → `/dashboard/settings`
- Auto-hides when: >1 member AND >0 vehicles
- Appears above the normal dashboard content

#### State 3: Normal Dashboard

- **Greeting**: "God morgon/eftermiddag/kväll!" with month/year
- **Untagged alert pill**: amber banner linking to `/personal`
- **4 KPI cards** (grid, responsive):
  - Total km (+ trip count)
  - Tjänstekm (+ milersättning estimate)
  - Elkostnad (this month)
  - Otaggade resor (green "Alla taggade" if 0, red count if >0)
- **Activity area chart**: km/day for last 30 days (Recharts AreaChart with gradient)
- **Bottom row** (3+2 grid on large screens):
  - **Recent trips card**: Last 5 trips with tag badges, from→to addresses, distance, cost
  - **Vehicle status card**: Battery ring SVG with SoC%, charge state badge, parking mini-map (Leaflet)
  - **Battery health card**: SoH%, progress bar, estimated vs original capacity, sparkline trend

### Data Sources

| Source | Query |
| ------ | ----- |
| Monthly trips | `trips` WHERE `user_id`, `superseded_by IS NULL`, date range |
| Recent 5 trips | `trips` ORDER BY `started_at DESC` LIMIT 5 |
| Vehicle | `vehicles` WHERE `user_id` LIMIT 1 |
| Telemetry | `vehicle_telemetry_cache` WHERE `vehicle_id` + signal list |
| Battery snapshots | `battery_snapshots` WHERE `vehicle_id` ORDER DESC LIMIT 8 |
| Org counts | `organization_members` COUNT + `organization_vehicles` COUNT |

---

## 5. Driver List

**Route:** `/dashboard/drivers`  
**File:** `pages/dashboard/drivers.tsx`  
**Auth required:** Yes

### Layout

- Page header: "Förare" + "Hantera förare i din organisation."
- "Bjud in förare" button (admin only) → opens InviteDriverDialog
- Card with title "Alla förare (count)"
- Data table with rows clickable → driver detail

### Table Columns

| Column | Data | Notes |
| ------ | ---- | ----- |
| Namn | `profiles.full_name` | Click row → detail |
| E-post | `profiles.email` | With mail icon |
| Roll | `organization_members.role` | Badge: Förare/Administratör/Läsare |
| Status | `organization_members.status` | StatusBadge component |
| Tillagd | `invited_at` | Formatted date |
| Åtgärder | Dropdown menu | Admin only |

### InviteDriverDialog

- Name, email, role (select: driver/admin/viewer)
- Calls Edge Function `fleet-invite-driver`
- Toast on success: "Inbjudan skickad till {email}"

### Row Actions (admin)

- Visa detaljer → `/dashboard/drivers/:userId`
- Inaktivera → `UPDATE organization_members SET status = 'deactivated'`
- Återaktivera → `UPDATE organization_members SET status = 'active'`

### Empty State

- User icon + "Inga förare tillagda ännu."
- "Bjud in förare genom att klicka på knappen ovan."

---

## 6. Driver Detail

**Route:** `/dashboard/drivers/:id`  
**File:** `pages/dashboard/driver-detail.tsx`  
**Auth required:** Yes

### Layout

- Breadcrumb: Dashboard / Förare / Förare
- Profile header card (name, email, role badge, status badge)
- 4 stat summary cards: km, elkostnad, work %, untagged
- Assigned vehicles section
- Recent trips table with tag badges

---

## 7. Vehicle List

**Route:** `/dashboard/vehicles`  
**File:** `pages/dashboard/vehicles.tsx`  
**Auth required:** Yes

### Layout

- Page header: "Fordon" + description
- "Lägg till fordon" button (admin only) → opens AddVehicleDialog
- Filter tabs: Alla / Tilldelade / Otilldelade / Poolbilar
- Vehicle card grid (1→2→3 columns)

### AddVehicleDialog

- **VIN** input (required, max 17 chars)
- Display name input (optional)
- Assign driver select (active org members)
- Pool car checkbox

**Flow:**
1. User enters VIN → dialog searches `vehicles` table by VIN
2. If found → creates `organization_vehicles` row linking vehicle to org
3. If driver selected → creates `organization_vehicle_assignments` row
4. If VIN not found → error: "Inget fordon med angivet VIN hittades."

**Important:** The web dashboard does NOT create vehicles. Vehicles must first be registered via the Millog mobile app (Tesla OAuth → sync). The web only links existing vehicles to the organization.

### VehicleCard

Each card shows:
- Car icon + display label (or model name, or "Namnlöst fordon")
- Trim + last 6 chars of VIN
- Status badges: Pool car (secondary), Telemetry (green), SoC% (outline)
- Assigned drivers with primary indicator
- Admin actions: toggle pool, assign/unassign drivers

### Empty State

- Car icon + "Inga fordon kopplade ännu."
- "Lägg till fordon genom att klicka på knappen ovan. Fordonet måste vara registrerat i Millog-appen först."

---

## 8. Compliance View

**Route:** `/dashboard/compliance`  
**File:** `pages/dashboard/compliance.tsx`  
**Auth required:** Yes

### Layout

- Page header: "Efterlevnad" + description
- Untagged trips table with:
  - Checkbox per row for bulk selection
  - Date, driver name, route, distance columns
  - Per-row tag badge + quick-tag buttons
- Bulk action bar: select tag → "Tagga" button → applies to all selected
- Success state: "Alla resor är taggade!" when no untagged trips

### Data

- Joins `trips` (where `tag = 'untagged'`) with `organization_members` + `profiles`
- Admin can directly tag trips via `UPDATE trips SET tag = ?`

---

## 9. Reports & Export

**Route:** `/dashboard/reports`  
**File:** `pages/dashboard/reports.tsx`  
**Auth required:** Yes

### Layout

- Period selector (From / To date inputs)
- 3 export cards:

| Card | Format | Description |
| ---- | ------ | ----------- |
| Körjournal | CSV | Complete drive log per driver |
| Flottöversikt | PDF | Fleet summary for all vehicles and drivers |
| Skatteunderlag | PDF | Tax-ready mileage reimbursement report |

### Status

UI complete. Edge Function `fleet-generate-report` is deployed but returns 501 — report generation logic not yet implemented. The cards show "Exportera" buttons that call the Edge Function and display error toast on failure.

---

## 10. Settings

**Route:** `/dashboard/settings`  
**File:** `pages/dashboard/settings.tsx`  
**Auth required:** Yes (visible to all fleet users, write operations admin-only)

### 6 Cards

| Card | Content | Status |
| ---- | ------- | ------ |
| **Organisation** | Company name + org number edit form with save button | ✅ Working (admin only writes) |
| **Administratörer** | Read-only list of admin/viewer members (name + email + role badge) | ⚠️ Read-only (no add/remove) |
| **Taggar** | Default tag badges displayed (Tjänst, Pendling, Privat, Otaggad) | ⚠️ Read-only (hint: "Anpassade taggar kommer snart") |
| **Fakturering** | "Kommer snart." placeholder text | ❌ Not implemented |
| **Språk** | Svenska / English toggle buttons | ✅ Working (all users) |
| **Riskzon** | Red-bordered danger zone card (admin-only). "Radera organisation" button opens 3-step confirmation dialog: (1) impact summary with driver names + vehicles, (2) toggle to also delete driver accounts, (3) type org name to confirm. Calls `fleet-delete-org` Edge Function. Post-deletion: sign out + redirect to `/login`. | ✅ Working (admin only) |

### Data

- Organization card: reads + updates `organizations` table
- Admins card: reads `organization_members` WHERE `role IN ('admin', 'viewer')` joined with `profiles`
- Language: writes to `localStorage` + `i18n.changeLanguage()`

---

## 11. Personal Home

**Route:** `/personal`  
**File:** `pages/personal/index.tsx`  
**Auth required:** Yes

### Layout

- 3-tab interface: Resor / Statistik / Exportera
- Period selector: Denna vecka / Denna månad / Senaste 3 mån / I år

### Trips Tab

- Trip list sorted by date (newest first)
- Each trip: tag badge, start→end addresses, distance, energy, cost
- Calendar date strip for quick navigation
- Click trip → inline expansion or trip detail

### Statistics Tab

- 8 customizable stat cards:
  - Energieffektivitet, Körmönster, Skatteavdrag, Bränslebesparingar
  - Miljöpåverkan, Laddningsbeteende, Resfördelning, Snittförbrukning
- Click Energieffektivitet → `/statistics-efficiency` (full detail page with charts)
- Click Körmönster → `/statistics-driving` (full detail page with charts)

### Export Tab

- Format selector + trip type filter
- "Exportfunktionen är under utveckling" placeholder

---

## Shared UI Patterns

### Sidebar (`app-sidebar.tsx`)

- 6 nav items: Översikt, Förare, Fordon, Efterlevnad, Rapporter, Inställningar
- All visible to all fleet users (no role filtering)
- Organization name in header (falls back to "Millog")
- User dropdown in footer: language toggle + logout

### Dashboard Layout (`dashboard-layout.tsx`)

- Auth guard → redirects to `/login` if no user
- Dynamic breadcrumbs from URL path segments
- Special regex for driver detail pages
- `SidebarInset` content area

### Loading States

- `Skeleton` components for all data-dependent UI
- Table skeleton rows, card skeleton blocks, chart skeleton rectangles

### Error Handling

- Edge Function failures → `toast.error()` via Sonner
- Form validation errors → inline `<p className="text-destructive">` below fields
- Empty query results → contextual empty states with helpful hints
