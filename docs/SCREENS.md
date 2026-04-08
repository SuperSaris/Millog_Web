# Screens — Millog Web

> Every screen the fleet admin interacts with. For each: what it shows, why it matters, what data it needs, what the empty state looks like, and what actions are available.

---

## Table of Contents

1. [Login](#1-login)
2. [Signup](#2-signup--organization-creation)
3. [Fleet Overview (Dashboard Home)](#3-fleet-overview--dashboard-home)
4. [Driver List](#4-driver-list)
5. [Driver Detail](#5-driver-detail)
6. [Driver Invite (Single)](#6-driver-invite-single)
7. [Bulk CSV Import](#7-bulk-csv-import)
8. [Vehicle List](#8-vehicle-list)
9. [Compliance View](#9-compliance-view)
10. [Reports & Export](#10-reports--export)
11. [Settings — Organization](#11-settings--organization)
12. [Settings — Custom Tags](#12-settings--custom-tags)
13. [Settings — Admins & Viewers](#13-settings--admins--viewers)
14. [Settings — Billing](#14-settings--billing)
15. [Privacy / Transparency Page](#15-privacy--transparency-page)

---

## 1. Login

**Route:** `/login`  
**Auth required:** No  
**Why it matters:** First touchpoint. Must feel trustworthy and professional.

### Layout

- Centered card on dark/neutral background
- Millog logo at top
- Email + password fields
- "Logga in" primary button
- "Glömt lösenord?" text link below
- "Skapa nytt flottkonto" link → `/signup`

### Behavior

- On submit: `supabase.auth.signInWithPassword({ email, password })`
- Success: redirect to `/dashboard`
- Invalid credentials: inline error "Fel e-post eller lösenord"
- Network error: inline error "Kunde inte ansluta — försök igen"
- "Glömt lösenord?" triggers `supabase.auth.resetPasswordForEmail(email)` → shows confirmation "Återställningslänk skickad till din e-post"

### Empty/Error States

- No empty state (always shows form)
- Error messages appear inline below the form, not as toasts

---

## 2. Signup — Organization Creation

**Route:** `/signup`  
**Auth required:** No  
**Why it matters:** This is where a company becomes a Millog fleet customer. Must be frictionless — under 2 minutes.

### Layout

- Centered card, wider than login
- Step indicator (optional — single form is fine for Phase 1)
- Fields:
  - **Företagsnamn** (company name) — required
  - **Organisationsnummer** — optional, format validated (XXXXXX-XXXX)
  - **Ditt namn** (admin's name) — required
  - **E-post** — required, validated
  - **Lösenord** — required, min 8 chars, strength indicator
  - **Bekräfta lösenord** — must match
- "Skapa flottkonto" primary button
- "Har du redan ett konto? Logga in" link → `/login`

### Behavior

1. Client-side validation (all fields)
2. `supabase.auth.signUp({ email, password, options: { data: { full_name } } })`
3. Call Edge Function `fleet-create-org`:
   - Creates `organizations` row
   - Creates `organization_members` row (role = 'admin')
   - Updates `profiles.org_id` and `profiles.org_role`
4. Redirect to `/dashboard`
5. Dashboard shows empty state: "Välkommen! Bjud in din första förare för att komma igång."

### Validation

- Organisationsnummer: regex `/^\d{6}-\d{4}$/` (or 10 digits without dash)
- Email: standard email format
- Password: minimum 8 characters

---

## 3. Fleet Overview — Dashboard Home

**Route:** `/dashboard`  
**Auth required:** Yes (admin or viewer)  
**Why it matters:** The admin's daily landing page. One glance should answer: "Is everything running smoothly?"

### Layout

```
┌─────────────────────────────────────────────────────────┐
│ [Sidebar]  │  Översikt                    [Period: ▼]   │
│            │                                             │
│ Översikt   │  ┌──────┐ ┌──────┐ ┌──────┐               │
│ Förare     │  │Total │ │El-   │ │Avdrags│               │
│ Fordon     │  │km    │ │kostnad│ │bara km│               │
│ Efterlevnad│  │12 450│ │8 320 │ │9 800  │               │
│ Rapporter  │  │      │ │kr    │ │km     │               │
│ Inställn.  │  └──────┘ └──────┘ └──────┘               │
│            │  ┌──────┐ ┌──────┐ ┌──────┐               │
│            │  │Otag- │ │Efter-│ │Aktiva │               │
│            │  │gade  │ │levnad│ │fordon │               │
│            │  │23    │ │87%   │ │8/10   │               │
│            │  │resor │ │      │ │       │               │
│            │  └──────┘ └──────┘ └──────┘               │
│            │                                             │
│            │  ┌─────────────────────────────────────┐   │
│            │  │  Km per vecka (stapeldiagram)        │   │
│            │  │  ▓▓▓▓  ▓▓▓▓▓  ▓▓▓  ▓▓▓▓▓▓  ▓▓▓▓   │   │
│            │  │  v.14   v.15  v.16   v.17   v.18    │   │
│            │  └─────────────────────────────────────┘   │
│            │                                             │
│            │  Senaste aktivitet                          │
│            │  • Johan Svensson avslutade en resa (2 min)│
│            │  • Lisa Karlsson taggade 3 resor (1 h)     │
│            │  • Ny förare: Erik Nilsson (igår)          │
└─────────────────────────────────────────────────────────┘
```

### Stat Cards (6 total)

| Card | Value | Secondary | Source |
| ---- | ----- | --------- | ------ |
| **Total km** | Sum of `trips.distance_km` for period | "+12% vs förra månaden" | `trips` aggregation |
| **Elkostnad** | Sum of `trips.cost_kr` for period | "genomsnitt X kr/mil" | `trips` aggregation |
| **Avdragsgilla km** | Sum where `tag = 'work'` | "uppskattat avdrag: X kr" (×2.50 kr/km) | `trips` filtered |
| **Otaggade resor** | Count where `tag = 'untagged'` | "X förare har otaggade" | `trips` count |
| **Efterlevnadsgrad** | % trips tagged in last 30 days | "↑ 5% sedan förra veckan" | Calculated |
| **Aktiva fordon** | Count where `telemetry_enabled = true` | "X av Y totalt" | `vehicles` + `org_vehicle_assignments` |

### Period Selector

- Options: **Denna månad** (default), **Förra månaden**, **I år**, **Anpassad period**
- Custom: date range picker (shadcn Calendar + Popover)
- All stat cards and charts update when period changes

### Weekly Chart

- Recharts `BarChart` — km driven per week for the selected period
- Stacked by tag category (work = blue, personal = gray, commute = yellow, untagged = red outline)
- Hover tooltip shows exact km + breakdown

### Recent Activity Feed (optional, Phase 1)

- Last 10 events: new trips, tags applied, new drivers added
- Simple list with timestamp, driver name, action description
- Low priority — can ship without this in initial MVP

### Empty State

First login after signup:

```
┌─────────────────────────────────────────────┐
│                                             │
│  🏢  Välkommen till Millog Fleet            │
│                                             │
│  Inga förare tillagda ännu.                 │
│  Bjud in din första förare för att          │
│  komma igång.                               │
│                                             │
│  [Bjud in förare]  [Importera CSV]          │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 4. Driver List

**Route:** `/dashboard/drivers`  
**Auth required:** Yes (admin or viewer)  
**Why it matters:** The admin's main workspace. They come here to check who needs attention, add new drivers, and drill into individual logs.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  Förare                    [Sök...]  [Bjud in] [Import] │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Namn            E-post              Status   Otag. │ │
│  │─────────────────────────────────────────────────── │ │
│  │ Johan Svensson  johan@company.se    ● Aktiv    0   │ │
│  │ Lisa Karlsson   lisa@company.se     ● Aktiv    5   │ │
│  │ Erik Nilsson    erik@company.se     ○ Ej park. 0   │ │
│  │ Anna Lindgren   anna@company.se     ● Aktiv    12  │ │
│  │ Karl Persson    karl@company.se     ◌ Inaktiv  -   │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  Visar 5 av 30 förare                    [← 1 2 3 ... →]│
└─────────────────────────────────────────────────────────┘
```

### Table Columns

| Column | Data | Sortable | Notes |
| ------ | ---- | -------- | ----- |
| **Namn** | `profiles.full_name` | Yes | Click → driver detail |
| **E-post** | `profiles.email` | Yes | |
| **Fordon** | Vehicle display name or VIN | No | From `organization_vehicle_assignments` |
| **Status** | Derived: Aktiv / Ej parkopplad / Inaktiv | Yes | See status logic below |
| **Otaggade resor** | Count of `trips` where `tag = 'untagged'` | Yes | Red badge if > 0 |
| **Senaste resa** | `MAX(trips.ended_at)` | Yes | Relative time ("2 timmar sedan") |
| **Åtgärder** | Dropdown menu | No | Visa, Återställ lösenord, Inaktivera |

### Status Logic

| Status | Condition | Badge color |
| ------ | --------- | ----------- |
| **Aktiv** | `telemetry_enabled = true` AND member is active | Green |
| **Ej parkopplad** | Account exists but vehicle not yet paired | Yellow |
| **Inaktiv** | Member deactivated by admin | Gray |

### Actions

- **"Bjud in förare"** button → navigates to `/dashboard/drivers/new`
- **"Importera CSV"** button → navigates to `/dashboard/drivers/import`
- **Search** — filters by name or email (client-side for <100 drivers)
- **Row click** → navigates to `/dashboard/drivers/:id`
- **Actions menu per row:**
  - "Visa detaljer" → driver detail page
  - "Återställ lösenord" → triggers password reset email
  - "Skicka påminnelse" → sends compliance reminder
  - "Inaktivera" → confirmation dialog → deactivates member

### Empty State

```
Inga förare tillagda ännu.
Bjud in din första förare eller importera en lista.

[Bjud in förare]  [Importera CSV]
```

---

## 5. Driver Detail

**Route:** `/dashboard/drivers/:id`  
**Auth required:** Yes (admin or viewer)  
**Why it matters:** The per-driver deep dive. This is where the admin checks if someone is compliant, reviews their trips, and exports their körjournal.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  ← Tillbaka till förare                                  │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Johan Svensson                    ● Aktiv      │    │
│  │  johan@company.se                               │    │
│  │  Model Y Long Range — ABC 123                   │    │
│  │  Parkopplad sedan: 2026-01-15                    │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                   │
│  │ Km   │ │ El-  │ │Arbete│ │Otag- │                   │
│  │denna │ │kostnad│ │vs    │ │gade  │                   │
│  │mån.  │ │denna │ │privat│ │resor │                   │
│  │1 245 │ │mån.  │ │72/28%│ │  5   │                   │
│  └──────┘ └──────┘ └──────┘ └──────┘                   │
│                                                          │
│  Resor                                    [Period: ▼]   │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Datum      Från → Till         km    kWh  kr  Tagg │ │
│  │──────────────────────────────────────────────────── │ │
│  │ 8 apr 08:15  Hemma → Kontoret  12,3  2,1  4   Arb │ │
│  │ 8 apr 17:30  Kontoret → Hemma  12,5  2,3  5   Pend│ │
│  │ 7 apr 10:00  Kontoret → Kund   45,2  7,8  16  Arb │ │
│  │ 7 apr 14:30  Kund → Kontoret   44,8  8,1  17  Arb │ │
│  │ 6 apr 09:00  Hemma → Kontoret  12,1  2,0  4   -   │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  [Exportera körjournal]  [Skicka påminnelse]            │
└─────────────────────────────────────────────────────────┘
```

### Header Card

- Driver name, email, status badge
- Assigned vehicle (display label or model + reg number)
- Pairing date (`vehicles.telemetry_verified_at`)
- Quick actions: Återställ lösenord, Skicka påminnelse, Inaktivera

### Summary Stats (4 cards)

| Card | Value | Notes |
| ---- | ----- | ----- |
| **Km denna månad** | Sum `distance_km` | Period-aware |
| **Elkostnad denna månad** | Sum `cost_kr` | Formatted "X kr" |
| **Arbete vs Privat** | Ratio of work/personal trips | Pie or percentage |
| **Otaggade resor** | Count untagged | Red if > 0 |

### Trip Table

- Columns: Datum, Tid, Från → Till, km, kWh, Kostnad (kr), Tagg
- Color-coded tag badge (same colors as mobile app: work=blue, personal=gray, commute=yellow, untagged=red outline)
- Period selector: same as dashboard overview
- Pagination: 25 trips per page
- Sortable by date (default: newest first)

### Actions

- **"Exportera körjournal"** → calls `fleet-generate-report` Edge Function for this driver + selected period → downloads PDF
- **"Skicka påminnelse"** → calls `fleet-send-reminder` → shows confirmation toast
- **"Återställ lösenord"** → `supabase.auth.admin.resetPasswordForEmail()` via Edge Function
- **"Inaktivera"** → confirmation dialog → deactivates member, stops counting in subscription

### Empty State (driver with no trips)

```
Inga resor registrerade ännu.
Resor loggas automatiskt när föraren kör — ingen åtgärd krävs.
```

---

## 6. Driver Invite (Single)

**Route:** `/dashboard/drivers/new`  
**Auth required:** Yes (admin only)  
**Why it matters:** The most common admin action after initial setup. Must be fast and foolproof.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  ← Tillbaka till förare                                  │
│                                                          │
│  Bjud in förare                                          │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Namn    [________________________]              │    │
│  │  E-post  [________________________]              │    │
│  │                                                   │    │
│  │                          [Skapa konto]            │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ── After creation: ──────────────────────────────────  │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  ✓ Konto skapat                                  │    │
│  │                                                   │    │
│  │  Johan Svensson                                   │    │
│  │  johan.svensson@company.se                        │    │
│  │                                                   │    │
│  │  Tillfälligt lösenord:                            │    │
│  │  ┌──────────────────────────┐                     │    │
│  │  │  Kx9#mPqR2w5L    [📋]   │                     │    │
│  │  └──────────────────────────┘                     │    │
│  │                                                   │    │
│  │  Dela lösenordet med föraren via er egen          │    │
│  │  IT-process (e-post, SMS, eller personligen).     │    │
│  │                                                   │    │
│  │  [Skicka inbjudningsmail]  [Bjud in en till]      │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Behavior

1. Admin enters name + email
2. Click "Skapa konto" → calls Edge Function `fleet-create-drivers` (single mode)
3. Edge Function:
   - Creates Supabase Auth user with random 12-char temp password
   - Creates `profiles` row (must_change_password = true)
   - Creates `organization_members` row (role = 'driver')
   - Returns `{ name, email, tempPassword }` to caller
4. UI shows the success card with temp password + copy button
5. **"Skicka inbjudningsmail"** — optional, sends Supabase email with App Store link (no password in email)
6. **"Bjud in en till"** — resets form for next driver

### Critical UX Decision

The temp password is shown **on screen** with a copy button. This is the primary distribution path. The admin copies it and shares via their company's IT process. The email is a nice-to-have supplement, not the critical path.

### Validation

- Name: required, min 2 chars
- Email: required, valid format, not already in the org

---

## 7. Bulk CSV Import

**Route:** `/dashboard/drivers/import`  
**Auth required:** Yes (admin only)  
**Why it matters:** The killer feature for onboarding a 30-car fleet. Without this, the admin creates 30 accounts one by one. With this: upload CSV, click confirm, done.

### Layout — Step 1: Upload

```
┌─────────────────────────────────────────────────────────┐
│  Importera förare från CSV                               │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │                                                   │    │
│  │     Dra och släpp en CSV-fil här                   │    │
│  │     eller klicka för att välja fil                 │    │
│  │                                                   │    │
│  │     Format: namn,epost (en förare per rad)        │    │
│  │     Max 500 rader per import                       │    │
│  │                                                   │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  Exempelfil:                                             │
│  ┌──────────────────────────────────┐                   │
│  │  namn,epost                       │                   │
│  │  Johan Svensson,johan@company.se  │                   │
│  │  Lisa Karlsson,lisa@company.se    │                   │
│  └──────────────────────────────────┘                   │
│                                                          │
│  [Ladda ner exempelmall (.csv)]                          │
└─────────────────────────────────────────────────────────┘
```

### Layout — Step 2: Preview & Validate

```
┌─────────────────────────────────────────────────────────┐
│  Förhandsgranska import (30 förare)                      │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  ✓  Johan Svensson    johan@company.se             │ │
│  │  ✓  Lisa Karlsson     lisa@company.se              │ │
│  │  ✗  [tomt namn]       erik@company.se    ← Fel     │ │
│  │  ✗  Anna Lindgren     anna@              ← Ogiltig │ │
│  │  ✓  Karl Persson      karl@company.se              │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  28 giltiga · 2 fel                                      │
│                                                          │
│  [Avbryt]                    [Skapa 28 konton]           │
└─────────────────────────────────────────────────────────┘
```

### Layout — Step 3: Results

```
┌─────────────────────────────────────────────────────────┐
│  Import klar — 28 av 28 konton skapade ✓                │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Namn             E-post              Lösenord      │ │
│  │  Johan Svensson   johan@company.se    Kx9#mPqR [📋]│ │
│  │  Lisa Karlsson    lisa@company.se     Ht4!nWsQ [📋]│ │
│  │  Karl Persson     karl@company.se     Jm7&bRtY [📋]│ │
│  │  ...                                               │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  [Exportera som CSV]  [Tillbaka till förare]             │
└─────────────────────────────────────────────────────────┘
```

### Behavior

1. **Upload:** Client-side CSV parsing (use `papaparse` or native). Validate headers (`namn,epost` or `name,email`).
2. **Preview:** Show all rows with validation status. Errors highlighted in red. Admin can proceed with only valid rows.
3. **Create:** Call Edge Function `fleet-create-drivers` in batch mode. Show progress: "12/28 konton skapade..."
4. **Results:** Show each created account with their temp password. "Exportera som CSV" button downloads a CSV with `namn,epost,lösenord` for the admin's records.

### Edge Cases

- Duplicate email in CSV → flagged in preview
- Email already exists in Supabase → flagged in preview ("Konto finns redan")
- Edge Function partial failure → show which succeeded and which failed
- CSV with wrong headers → "Ogiltigt format. Förväntat: namn,epost"

---

## 8. Vehicle List

**Route:** `/dashboard/vehicles`  
**Auth required:** Yes (admin or viewer)  
**Why it matters:** Shows which cars are streaming telemetry, which are assigned to whom, and which are unassigned pool cars.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  Fordon                                        [Sök...] │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Fordon              Modell      Förare     Status  │ │
│  │─────────────────────────────────────────────────── │ │
│  │ Silver MY — ABC 123  Model Y LR  J.Svensson ● Aktiv│ │
│  │ Svart M3 — DEF 456   Model 3 P   L.Karlsson ● Aktiv│ │
│  │ Vit MY — GHI 789     Model Y SR  (ej tilldelad) ◌  │ │
│  │ Röd MX — JKL 012     Model X LR  E.Nilsson  ○ Ej p.│ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Table Columns

| Column | Data | Notes |
| ------ | ---- | ----- |
| **Fordon** | Display label or VIN | Editable inline (click to edit) |
| **Modell** | `vehicles.model` + trim | e.g., "Model Y Long Range" |
| **Förare** | Assigned driver name | "(ej tilldelad)" if null |
| **Telemetri** | Last data timestamp | "2 min sedan" or "Aldrig" |
| **Status** | telemetry_enabled state | Aktiv / Ej parkopplad / Inaktiv |

### Actions

- **Click "Förare" cell** → opens assignment dialog (dropdown of org drivers + "Ingen" option)
- **Click display label** → inline edit (save on blur/enter)
- **Status badge tooltip** → shows last telemetry timestamp

### Empty State

```
Inga fordon registrerade ännu.
Fordon läggs till automatiskt när förare parkopplar sin Tesla i Millog-appen.
```

---

## 9. Compliance View

**Route:** `/dashboard/compliance`  
**Auth required:** Yes (admin or viewer)  
**Why it matters:** THE reason companies buy fleet management. "Who is falling behind on trip tagging?" — answered in one screen, with one-click reminder actions.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  Efterlevnad                             [Period: ▼]     │
│                                                          │
│  ┌──────────────────────┐  ┌───────────────────────┐    │
│  │  Flottans             │  │  Trend (6 månader)    │    │
│  │  efterlevnadsgrad     │  │                       │    │
│  │       87%             │  │  ──────/───────────   │    │
│  │  ↑ 5% sedan förra mån│  │  80%  85%  87%        │    │
│  └──────────────────────┘  └───────────────────────┘    │
│                                                          │
│  Förare med otaggade resor (sämst först)                 │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 🔴 Anna Lindgren      12 otaggade   Senast: 14 d  │ │
│  │    sedan              [Skicka påminnelse]           │ │
│  │ 🟡 Lisa Karlsson       5 otaggade   Senast: 3 d   │ │
│  │    sedan              [Skicka påminnelse]           │ │
│  │ 🟢 Johan Svensson      0 otaggade   Senast: idag  │ │
│  │ 🟢 Karl Persson        0 otaggade   Senast: idag  │ │
│  │ 🟢 Erik Nilsson        0 otaggade   Senast: igår  │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  [Skicka påminnelse till alla med otaggade]              │
└─────────────────────────────────────────────────────────┘
```

### Color Logic

| Badge | Condition | Meaning |
| ----- | --------- | ------- |
| 🟢 Grön | 0 untagged trips | Fully compliant |
| 🟡 Gul | 1–5 untagged trips | Needs attention |
| 🔴 Röd | 6+ untagged OR last tagged > 14 days ago | Requires action |

### Key Metrics

- **Fleet compliance score:** `(total_tagged / total_trips) × 100` for last 30 days
- **Per-driver untagged count:** `COUNT(*) WHERE tag = 'untagged' AND user_id = X`
- **Last tagged:** `MAX(trips.updated_at) WHERE tag != 'untagged' AND user_id = X`

### Actions

- **"Skicka påminnelse" per driver** → Edge Function sends email + push notification
- **"Skicka till alla"** → batch reminder to all non-green drivers
- **Click driver row** → navigates to driver detail

### Compliance Trend Chart

- Recharts `LineChart` — monthly compliance % over last 6 months
- Single line, area fill
- Y-axis: 0–100%, X-axis: months

### Empty State

```
Ingen resedata ännu.
Efterlevnadsöversikten visas när förare har börjat köra.
```

---

## 10. Reports & Export

**Route:** `/dashboard/reports`  
**Auth required:** Yes (admin or viewer)  
**Why it matters:** Year-end deliverable. Everything builds toward this screen — the admin clicks export and hands a Skatteverket-ready PDF to the accountant.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  Rapporter                                               │
│                                                          │
│  Period                                                  │
│  ┌────────────────────────────────────────┐              │
│  │ [Denna månad ▼]  eller  [2026-01-01] → [2026-04-08] │ │
│  └────────────────────────────────────────┘              │
│                                                          │
│  Förare                                                  │
│  ┌────────────────────────────────────────┐              │
│  │ [Alla förare ▼]  eller  [Johan Svensson ▼]          │ │
│  └────────────────────────────────────────┘              │
│                                                          │
│  ┌──────────────────────────────────────────┐           │
│  │  📄  Körjournal (PDF)                     │           │
│  │      Komplett körjournal per förare,       │           │
│  │      Skatteverket-kompatibelt format.      │           │
│  │                              [Ladda ner]  │           │
│  ├──────────────────────────────────────────┤           │
│  │  📊  Flottöversikt (PDF)                  │           │
│  │      Alla förare, sammanfattning per       │           │
│  │      förare + totalsumma för flottan.      │           │
│  │                              [Ladda ner]  │           │
│  ├──────────────────────────────────────────┤           │
│  │  📋  Rådata (CSV)                         │           │
│  │      Alla resor i platt CSV-format         │           │
│  │      för Fortnox, Visma, Excel.            │           │
│  │                              [Ladda ner]  │           │
│  ├──────────────────────────────────────────┤           │
│  │  🧾  Förmånsbeskattning                   │           │
│  │      Privata km per förare per år.         │           │
│  │      Redo för Skatteverkets beräkning.     │           │
│  │                              [Ladda ner]  │           │
│  └──────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────┘
```

### Export Types

| Export | Format | Content | Edge Function |
| ------ | ------ | ------- | ------------- |
| **Körjournal** | PDF | Per-driver: trip log with date, from/to, km, purpose, cost. Matches Skatteverket format. | `fleet-generate-report` (type: 'korjournal') |
| **Flottöversikt** | PDF | Cover page + per-driver summary + fleet totals. The CFO/accountant report. | `fleet-generate-report` (type: 'fleet-overview') |
| **Rådata** | CSV | Flat file: all trips, all columns. For import to Fortnox/Visma/Excel. | Client-side generation from cached trip data |
| **Förmånsbeskattning** | PDF | Private km per driver per year. Work/personal/commute split. | `fleet-generate-report` (type: 'formansbeskatning') |

### Behavior

1. Admin selects period + driver (or "Alla förare")
2. Clicks "Ladda ner" on desired export type
3. For PDF: calls Edge Function → receives download URL → browser downloads
4. For CSV: generated client-side from cached trip data → browser downloads
5. Loading state: "Genererar rapport..." with spinner
6. Error: "Kunde inte generera rapport — försök igen"

---

## 11. Settings — Organization

**Route:** `/dashboard/settings`  
**Auth required:** Yes (admin only)  
**Why it matters:** Basic org configuration. Set once, rarely changed.

### Fields

| Field | Type | Notes |
| ----- | ---- | ----- |
| **Företagsnamn** | Text input | Required |
| **Organisationsnummer** | Text input | Format: XXXXXX-XXXX, optional |
| **Faktura-e-post** | Email input | For Stripe invoices |
| **Standard elpris (kr/kWh)** | Number input | Default tariff for fleet cost calculations |
| **Momsnummer** | Text input | Optional, for invoices |

Save button: "Spara ändringar"

---

## 12. Settings — Custom Tags

**Route:** `/dashboard/settings/tags`  
**Auth required:** Yes (admin only)  
**Why it matters:** Replaces generic Work/Commute/Personal with company-specific labels. Critical for förmånsbeskattning accuracy — drivers always know exactly what to pick.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  Egna taggar                                   [Ny tagg]│
│                                                          │
│  Dessa taggar visas i förarnas app istället för de       │
│  generiska Work/Privat/Pendling-taggarna.                │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ ⣿ 🔵 Firma - Jobb       Arbete (work)      [✏️][🗑️]│ │
│  │ ⣿ 🔵 Kundbesök          Arbete (work)      [✏️][🗑️]│ │
│  │ ⣿ 🟡 Pendling           Pendling (commute) [✏️][🗑️]│ │
│  │ ⣿ ⚪ Privat             Privat (personal)  [✏️][🗑️]│ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  ⣿ = drag to reorder                                    │
└─────────────────────────────────────────────────────────┘
```

### Tag Editor Dialog

Fields:
- **Etikett** (label) — free text, e.g., "Kundbesök"
- **Skattekategori** — dropdown: Arbete / Pendling / Privat (maps to work/commute/personal)
- **Färg** — color picker (optional, for visual grouping)
- **Standard** — toggle: "Gör till standardtagg för denna kategori"

### Behavior

- Tags are stored in `organization_tags`
- Drivers see these labels in the mobile app tag picker
- Both `fleet_tag_id` and the standard `tag` column are written to trips (Skatteverket compat)
- Drag-to-reorder updates `sort_order`

---

## 13. Settings — Admins & Viewers

**Route:** `/dashboard/settings/admins`  
**Auth required:** Yes (admin only)  
**Why it matters:** Multiple people need access — HR manager, CFO, external accountant.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  Administratörer och granskare            [Lägg till]    │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Ganim Alaydi       ganim@millog.se    Admin   [Du] │ │
│  │ Sofia Lindqvist    sofia@company.se   Admin   [🗑️] │ │
│  │ Anders Revisor     anders@revisor.se  Granskare[🗑️] │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Roles

- **Admin** — full access: manage drivers, settings, billing, export
- **Granskare (viewer)** — read-only: see dashboard, trips, compliance, export. Cannot manage drivers or settings.

### Add Dialog

- Email input + role selector (Admin / Granskare)
- If email exists in Supabase: add as `organization_member` with selected role
- If email doesn't exist: create account (same flow as driver invite but with admin/viewer role)

---

## 14. Settings — Billing

**Route:** `/dashboard/settings/billing`  
**Auth required:** Yes (admin only)  
**Why it matters:** Companies need invoices with their VAT number, and they need to manage their subscription.

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  Fakturering                                             │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Nuvarande plan: Fleet Starter                   │    │
│  │  79 kr/förare/månad                               │    │
│  │  10 aktiva förare = 790 kr/månad                  │    │
│  │                                                   │    │
│  │  Nästa faktura: 1 maj 2026                        │    │
│  │                                                   │    │
│  │  [Hantera betalning och fakturor]                 │    │
│  │  (öppnar Stripe kundportal)                       │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

### Behavior

- Displays current plan, active driver count, monthly cost
- "Hantera betalning" button → redirects to Stripe Customer Portal (Stripe manages payment methods, invoices, plan changes)
- No Stripe UI embedded in the app — redirect to Stripe's hosted portal

---

## 15. Privacy / Transparency Page

**Route:** `/privacy`  
**Auth required:** No (public)  
**Why it matters:** GDPR compliance. Every org needs to reference this in their DPA (Data Processing Agreement). Non-negotiable.

### Content (static, Swedish)

1. **Vilka uppgifter vi hanterar** — Trip data (date, distance, addresses, cost, tag), driver name, email
2. **Vem som kan se uppgifterna** — The driver (all their data), fleet admin (trip data for their org's drivers, read-only), Millog (technical access for support)
3. **Rättslig grund** — GDPR Article 6(1)(c): legal obligation (Skatteverket körjournal requirement)
4. **Lagringstid** — Trip data retained while org subscription is active + 7 years (Swedish tax record retention requirement)
5. **Dina rättigheter** — Access, correction, erasure (within legal retention limits), portability
6. **Kontakt** — privacy@millogapp.se

### Design

- Clean, readable, no dashboard chrome
- Millog logo at top
- Swedish language only
- Static HTML/JSX — no data fetching
