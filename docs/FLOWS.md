# Flows — Millog Web

> The critical user journeys that define the product. Each flow describes the step-by-step experience, what triggers it, what the happy path looks like, and where things can go wrong.

## Implementation Status (May 2025)

| Flow | Frontend | Backend |
| ---- | -------- | ------- |
| 1. Fleet Admin Onboarding | ✅ `/signup` — 5-step wizard (org info, admin account, visibility settings, tag settings, review) | ✅ Edge Function `fleet-create-org` deployed (v1) |
| 2. Single Driver Invite | ✅ InviteDriverDialog inline on `/dashboard/drivers` (name + email + role select) | ✅ Edge Function `fleet-invite-driver` deployed (v1) — SMTP needed for magic links |
| 3. Bulk Driver Import | ❌ Not started | ❌ No Edge Function |
| 4. Driver Activation | N/A (mobile app flow) | N/A |
| 5. Daily Admin Check-In | ✅ Dashboard with KPIs, charts, map, onboarding states | ✅ Fleet schema deployed |
| 6. Compliance Review | ✅ `/dashboard/compliance` with bulk tag | ✅ Fleet schema deployed |
| 7. Monthly Export | ✅ `/dashboard/reports` with period selector | ⚠️ Edge Function `fleet-generate-report` deployed (scaffold — returns 501) |
| 8. Year-End Tax Report | ✅ Same reports page, Skatteverket card | ⚠️ Same Edge Function (scaffold) |
| 9. Deactivate Driver | ✅ Action in drivers table (deactivate/reactivate) | ✅ Fleet schema deployed |
| 10. Password Reset | ✅ (Supabase built-in on login page) | ✅ |
| 11. Custom Tag Setup | ⚠️ Tags card in settings (read-only, shows defaults) | ❌ CRUD not built yet |
| 12. Vehicle Assignment | ✅ `/dashboard/vehicles` — AddVehicleDialog (VIN lookup), assign/unassign, pool toggle | ✅ Fleet schema deployed |
| 13. Personal Statistics | ✅ Full detail pages (efficiency, driving patterns) | ✅ |
| 14. Delete Organization | ✅ 3-step confirmation dialog in Settings (impact summary → account toggle → type name) | ✅ Edge Function `fleet-delete-org` ready (telemetry offboard + CASCADE delete) |

**Remaining blockers:**
- SMTP must be configured in Supabase for invite emails (Flow 2)
- `fleet-generate-report` returns 501 — report generation logic not implemented (Flows 7–8)
- `fleet-create-org` needs redeployment to accept `billing_email` + `settings` JSONB from the 5-step wizard
- Bulk driver import not started (Flow 3)
- Custom tag CRUD not built (Flow 11)

---

## Table of Contents

1. [Fleet Admin Onboarding](#1-fleet-admin-onboarding)
2. [Single Driver Invite](#2-single-driver-invite)
3. [Bulk Driver Import](#3-bulk-driver-import)
4. [Driver Activation (mobile app)](#4-driver-activation-mobile-app-side)
5. [Daily Admin Check-In](#5-daily-admin-check-in)
6. [Compliance Review & Reminder](#6-compliance-review--reminder)
7. [Monthly Export](#7-monthly-export)
8. [Year-End Tax Report](#8-year-end-tax-report)
9. [Deactivate Driver](#9-deactivate-driver)
10. [Password Reset](#10-password-reset)
11. [Custom Tag Setup](#11-custom-tag-setup)
12. [Vehicle Assignment](#12-vehicle-assignment)
13. [Personal Statistics — Sub-page Navigation](#13-personal-statistics--sub-page-navigation)
14. [Delete Organization](#14-delete-organization)

---

## 1. Fleet Admin Onboarding

**Trigger:** Company decides to use Millog for their Tesla fleet  
**Frequency:** Once per organization  
**Goal:** Org created, admin logged in, ready to invite drivers  
**Target time:** Under 3 minutes

### Steps — 5-Step Signup Wizard (`/signup`)

```
1. Admin visits app.millogapp.se
     → Sees login page with "Skapa nytt flottkonto" link
     
2. Clicks "Skapa nytt flottkonto" → /signup
     → 5-step wizard appears with progress bar ("Steg 1 av 5")

3. Step 1 — Organisation (Organisationsinformation)
     → Företagsnamn (required)
     → Organisationsnummer (optional, format XXXXXX-XXXX)
     → Faktura-e-post (optional)
     → Info: "All information kan ändras senare under Inställningar."

4. Step 2 — Administratör (Administratörskonto)
     → Fullständigt namn (required)
     → E-post (required)
     → Lösenord (required)
     → Bekräfta lösenord (required)

5. Step 3 — Synlighet (Vad förarna ser)
     → 6 toggles controlling driver-visible features:
       - Resor (trip list)
       - Statistik (stats overview)
       - Elkostnad (electricity cost)
       - Karta (map)
       - Taggning (tag editor)
       - Exportera (export function)

6. Step 4 — Taggning (Restaggning)
     → Default tag radio: Ingen / Tjänst / Pendling / Privat
     → Toggle: Kräv taggning (require drivers to tag all trips)
     → Toggle: Egna taggar (allow custom tags)

7. Step 5 — Granska (Granska och skapa)
     → Read-only summary of all 4 previous steps
     → "Skapa organisation" button

8. On submit:
     → supabase.auth.signUp() creates auth user
     → Edge Function fleet-create-org creates:
       - organizations row (with billing_email + settings JSONB)
       - organization_members row (role = 'admin')
     → Celebration screen with next-step hints:
       - Bjud in förare
       - Lägg till fordon / koppla Tesla-konton
       - Finjustera inställningar
     → "Gå till dashboard" → /dashboard

9. Dashboard shows onboarding state:
     → GettingStartedBanner: checklist (invite drivers, add vehicles, review settings)
     → Normal KPI dashboard appears below (initially empty)
```

### Error Paths

| Error | Recovery |
| ----- | -------- |
| Email already registered | "Denna e-post är redan registrerad. Logga in istället." |
| Weak password | "Lösenordet måste vara minst 8 tecken." |
| Network error | "Kunde inte skapa konto — kontrollera din anslutning." |
| Edge Function fails | "Något gick fel. Försök igen." + retry button |
| Passwords don't match | "Lösenorden stämmer inte överens." (step 2 validation) |

### Success Criteria

- Time from clicking "Skapa" to seeing the dashboard: < 3 seconds
- Zero emails required before admin can start working
- All initial settings (visibility, tagging) are pre-configured — no forced config steps later

---

## 2. Single Driver Invite

**Trigger:** Admin wants to add one driver  
**Frequency:** 1–5 times per week during initial rollout, rare after  
**Goal:** Driver account created, added to organization  
**Target time:** Under 30 seconds

### Steps

```
1. Admin is on /dashboard/drivers
     → Clicks "Bjud in förare" button → InviteDriverDialog opens (inline dialog)

2. Dialog fields:
     → Namn (name, required)
     → E-post (email, required)
     → Roll (select: Förare / Administratör / Läsare — defaults to Förare)

3. Clicks "Skicka inbjudan"
     → Calls Edge Function fleet-invite-driver with { name, email, role }
     → Edge Function:
       a. Creates auth user (or finds existing)
       b. Inserts organization_members row
       c. Inserts fleet_invitations row (token generated)
       d. Returns success

4. Toast: "Inbjudan skickad till {email}"
     → Dialog closes
     → Driver appears in table with status "Inbjuden"

5. Driver receives invite email (when SMTP is configured)
     → Email contains link to /accept-invite?token=...
     → Driver sets password → account activated → status changes to "Aktiv"
```

### Current Limitations

- SMTP is not yet configured in Supabase → invite emails are not delivered
- Admin must manually share credentials until SMTP is set up
- The `fleet-invite-driver` Edge Function is deployed but email delivery depends on SMTP

### Error Paths

| Error | Recovery |
| ----- | -------- |
| Email already in org | Toast error: "Denna e-post finns redan i er organisation." |
| Invalid email format | Client-side validation prevents submit |
| Edge Function timeout | Toast error: "Kunde inte skicka inbjudan — försök igen." |

---

## 3. Bulk Driver Import

**Trigger:** Admin onboarding a fleet of 10+ drivers at once  
**Frequency:** Once per org (initial rollout), occasionally for additions  
**Goal:** All driver accounts created in one batch, all temp passwords available  
**Target time:** Under 5 minutes for 30 drivers

### Steps

```
1. Admin navigates to /dashboard/drivers/import

2. Uploads CSV file (drag-and-drop or file picker)
     → CSV format: namn,epost (Swedish headers OR name,email)
     → Client parses CSV with papaparse or similar
     → Validates each row:
       - Name: ≥ 2 chars, not empty
       - Email: valid format, no duplicates within file

3. Preview table appears:
     → Valid rows shown with ✓
     → Invalid rows highlighted with ✗ and error message
     → Summary: "28 giltiga · 2 fel"
     → Admin can dismiss invalid rows or cancel and fix CSV

4. Clicks "Skapa 28 konton"
     → Progress indicator: "Skapar konton... 12/28"
     → Calls Edge Function fleet-create-drivers (batch mode)
     → Each account is created sequentially server-side
       (not parallelized — Supabase auth admin API rate limits)

5. Results table appears:
     → Each row: name, email, temp password, copy button
     → "Exportera som CSV" button → downloads results with passwords
     → "Tillbaka till förare" → /dashboard/drivers (now populated)

6. Admin downloads results CSV → distributes via IT process
```

### Progress UX

The Edge Function processes accounts one at a time. The client polls or uses Realtime to update progress:

```
Skapar konton...
████████████████░░░░░░░░  12/28
Johan Svensson — klar ✓
Lisa Karlsson — klar ✓
...
```

### Error Paths

| Error | Recovery |
| ----- | -------- |
| Wrong CSV format | "Ogiltigt format. Förväntade kolumner: namn, epost" |
| 200+ duplicate emails | Preview catches all duplicates before creation |
| Partial batch failure | Results show which succeeded (with passwords) and which failed (with reason). Admin can retry failed ones individually. |
| File too large (>500 rows) | "Max 500 förare per import. Dela upp filen." |

---

## 4. Driver Activation (Mobile App Side)

**Trigger:** Driver receives credentials from admin  
**Frequency:** Once per driver  
**Goal:** Driver goes from "credentials received" to "Tesla streaming telemetry"  
**Target time:** Under 5 minutes

> This flow happens in the mobile app, not the web portal. Documented here so the admin understands what the driver experiences.

### Steps

```
1. Driver downloads Millog from App Store
     → Given app link by admin (or in invitation email)

2. Opens app → login screen
     → Enters company email + temp password from admin

3. App detects must_change_password = true
     → HARD BLOCK: full-screen "Välj ett nytt lösenord"
     → Cannot dismiss, cannot navigate, cannot skip
     → New password: min 8 chars, must differ from temp

4. Driver sets new password → app continues to normal flow

5. Tesla OAuth flow
     → Driver authorizes Millog to access their Tesla
     → Token exchange via Edge Function

6. Virtual Key pairing
     → Driver follows in-app instructions to pair virtual key
     → Requires physical presence near the car (Bluetooth)

7. Pairing complete
     → telemetry_enabled = true
     → Fleet Telemetry config pushed to car
     → Car starts streaming to VPS bridge

8. Admin sees in web portal:
     "Johan Svensson — ● Parkopplad"
     (status changes from "Ej parkopplad" to "Aktiv")
```

### What the Admin Sees During This Flow

On `/dashboard/drivers`, the driver's row updates:

```
Before: Erik Nilsson    erik@company.se    ○ Ej parkopplad    0
After:  Erik Nilsson    erik@company.se    ● Aktiv            0
```

The admin doesn't need to do anything. The driver self-serves.

---

## 5. Daily Admin Check-In

**Trigger:** Admin opens the portal to check fleet status  
**Frequency:** Daily (or multiple times per day)  
**Goal:** Confirm everything is running, spot problems early  
**Target time:** Under 60 seconds for "all clear"

### First-Time Experience (No Org)

If the user has no organization (e.g., signed up but org creation failed):
- Dashboard shows `WelcomeOnboarding`: "Välkommen till Millog Fleet!"
- "Skapa organisation" button → `/signup`
- 3 info cards explaining the flow (invite, connect, track)

### New Org (Empty Fleet)

If the user has an org but no drivers/vehicles yet:
- Dashboard shows `GettingStartedBanner`: checklist card
  - [ ] Bjud in din första förare → `/dashboard/drivers`
  - [ ] Koppla ert första fordon → `/dashboard/vehicles`
  - [x] Granska organisationsinställningar → `/dashboard/settings`
- Banner auto-hides when: >1 member AND >0 vehicles
- Normal dashboard content renders below (but empty)

### The 60-Second Path (Active Fleet)

```
1. Admin opens app.millogapp.se → auto-redirects to /dashboard
     → Already logged in (session persisted)

2. Scans the 4 KPI cards:
     → Total km (+ trip count)
     → Tjänstekm (+ milersättning estimate)
     → Elkostnad (this month)
     → Otaggade resor (green if 0, red count if >0)

3. Glances at activity area chart (km/day for last 30 days)
     → Normal activity levels ✓

4. Checks compliance if the untagged count is high:
     → Quick click to /dashboard/compliance
     → Sees Anna has 12 untagged — sends reminder
     → Back to dashboard

5. Done. Close tab. Total time: 45 seconds.
```

### The "Something's Wrong" Path

```
1. Admin sees stat cards:
     → "62% efterlevnad" — down from 87% last week
     → "23 otaggade resor" — spike

2. Clicks to /dashboard/compliance
     → Sees 4 drivers with 5+ untagged trips
     → Two drivers haven't tagged anything in 14 days (red)

3. Sends reminders to all non-compliant drivers
     → Bulk: "Skicka påminnelse till alla med otaggade"

4. Checks /dashboard/drivers
     → Sees one new driver still "Ej parkopplad" after 3 days
     → Contacts them directly (Slack/email/phone)

5. Total time: 3 minutes. Problem identified and actioned.
```

---

## 6. Compliance Review & Reminder

**Trigger:** Admin notices untagged trip count rising, or weekly review cadence  
**Frequency:** Weekly  
**Goal:** All drivers have 0 untagged trips  
**Target time:** Under 2 minutes

### Steps

```
1. /dashboard/compliance

2. Review ranked list (worst first):
     🔴 Anna Lindgren — 12 untagged, last tagged 14 days ago
     🟡 Lisa Karlsson — 5 untagged, last tagged 3 days ago
     🟢 Johan Svensson — 0 untagged

3. For red drivers: click "Skicka påminnelse"
     → Edge Function sends email:
       "Hej Anna! Du har 12 otaggade resor i Millog.
        Öppna appen och tagga dem — det tar bara en minut."
     → Also sends push notification (if mobile app supports it)

4. For bulk: "Skicka påminnelse till alla med otaggade"
     → Sends to all yellow and red drivers

5. Monitor trend chart:
     → If compliance is trending down month-over-month:
       consider all-hands reminder or policy change
```

### What the Driver Receives

**Email (Swedish):**
```
Hej [namn]!

Du har [X] otaggade resor i Millog.
Öppna appen och tagga dem — det tar bara en minut.

Otaggade resor kan inte inkluderas i körjournalen.

Vänliga hälsningar,
[Organisationsnamn] via Millog
```

**Push notification (if available):**
```
Du har X otaggade resor. Öppna Millog för att tagga dem.
```

---

## 7. Monthly Export

**Trigger:** End of month, or accountant requests data  
**Frequency:** Monthly  
**Goal:** Download a PDF/CSV covering the past month for all drivers  
**Target time:** Under 2 minutes

### Steps

```
1. /dashboard/reports

2. Select period: "Förra månaden" (or custom range)

3. Select scope: "Alla förare" (default)

4. Click "Flottöversikt (PDF)"
     → Loading: "Genererar rapport..."
     → Edge Function aggregates trip data for all org drivers
     → Generates PDF:
       - Cover page: org name, period, generated date
       - Per-driver summary: km, cost, work/personal split
       - Fleet totals: total km, total cost, total deductible km
     → Browser downloads PDF

5. Optionally: click "Rådata (CSV)"
     → Downloads flat CSV with all trips for the period
     → Can be imported into Fortnox, Visma, or Excel
```

### PDF Content Structure

```
KÖRJOURNAL — Flottöversikt
[Organisationsnamn]
Period: 2026-03-01 — 2026-03-31

────────────────────────────────────────────

SAMMANFATTNING
  Totalt antal förare: 10
  Total körsträcka: 12 450 km
  Total elkostnad: 8 320 kr
  Arbetsresor: 9 800 km (78%)
  Privata resor: 2 150 km (17%)
  Pendling: 500 km (5%)

────────────────────────────────────────────

FÖRARE: Johan Svensson
Fordon: Model Y Long Range — ABC 123
  Körsträcka: 1 245 km
  Elkostnad: 832 kr
  Arbete: 920 km | Privat: 325 km

  Datum      Från              Till            km    Tagg
  2026-03-01 Hemma             Kontoret        12,3  Arbete
  2026-03-01 Kontoret          Hemma           12,5  Pendling
  ...

────────────────────────────────────────────

FÖRARE: Lisa Karlsson
...
```

---

## 8. Year-End Tax Report

**Trigger:** January — accountant needs full-year körjournal + förmånsbeskattning data  
**Frequency:** Once per year  
**Goal:** One-click download of the entire year's data, Skatteverket-ready  
**Target time:** Under 5 minutes

### Steps

```
1. /dashboard/reports

2. Select period: custom → 2025-01-01 to 2025-12-31

3. Download per-driver körjournal PDFs:
     → Select "Alla förare" + "Körjournal (PDF)"
     → Downloads ZIP with one PDF per driver
     → Each PDF is a standalone Skatteverket-compliant körjournal

4. Download förmånsbeskattning summary:
     → Click "Förmånsbeskattning"
     → Downloads PDF/CSV with:
       Per driver: total private km, total work km, total commute km
       This feeds directly into Skatteverket's förmånsvärde calculation

5. Hand both files to accountant
     → Accountant uses körjournal PDFs for each driver's tax filing
     → Accountant uses förmånsbeskattning data for company's payroll tax
```

### Förmånsbeskattning Report Content

```
FÖRMÅNSBESKATTNING — Sammanfattning 2025
[Organisationsnamn]

Förare             Privat km   Pendling km   Arbete km   Totalt km
─────────────────────────────────────────────────────────────────
Johan Svensson      3 200        1 500        12 800      17 500
Lisa Karlsson       2 800        1 200        14 200      18 200
Erik Nilsson        4 100        0            10 500      14 600
...
─────────────────────────────────────────────────────────────────
TOTALT              10 100       2 700        37 500      50 300

Privat + Pendling km per förare avgör förmånsvärde för tjänstebil.
Källa: Millog automatisk körjournal (telemetri).
```

### Why This Matters

This is literally the product's reason for existing. Every other feature builds toward this moment: the accountant downloads one package and the entire fleet is tax-compliant. No chasing 30 people. No manual entry. No wrong format.

---

## 9. Deactivate Driver

**Trigger:** Employee leaves the company, or car is reassigned  
**Frequency:** Occasional  
**Goal:** Disable the driver's access while preserving their historical data

### Steps

```
1. /dashboard/drivers → find driver → actions menu → "Inaktivera"

2. Confirmation dialog:
     "Vill du inaktivera Johan Svenssons konto?
      Kontot kan inte logga in.
      Historisk resedata behålls.
      Telemetriströmmen stoppas.
      Du kan återaktivera kontot senare."
     [Avbryt]  [Inaktivera]

3. On confirm:
     → organization_members row updated (or flag set)
     → profiles.is_active = false
     → Telemetry config cleared for their vehicle (via Edge Function)
     → Vehicle assignment cleared

4. Driver row updates to gray "◌ Inaktiv" status
     → Historical trips still visible to admin
     → Stripe subscription count decreases by 1
```

### Reactivation

Same flow in reverse — "Återaktivera" in actions menu. Driver would need to re-pair Tesla.

---

## 10. Password Reset

**Trigger:** Driver forgot their password, or admin wants to force a reset  
**Frequency:** Occasional  
**Goal:** Driver can log in again with a new password

### Admin-Initiated Flow

```
1. /dashboard/drivers → find driver → actions menu → "Återställ lösenord"

2. Confirmation: "Skicka återställningslänk till johan@company.se?"
     [Avbryt]  [Skicka]

3. On confirm:
     → Calls Edge Function → supabase.auth.admin.resetPasswordForEmail()
     → Driver receives email with reset link
     → Toast: "Återställningslänk skickad"
```

### What the Driver Sees

Standard Supabase password reset email → link to password reset page → set new password → login.

---

## 11. Custom Tag Setup

**Trigger:** Admin wants drivers to use company-specific trip labels  
**Frequency:** Once during initial setup, rare edits after  
**Goal:** Drivers see org-specific labels instead of generic Work/Commute/Personal

### Steps

```
1. /dashboard/settings/tags

2. Click "Ny tagg"
     → Dialog opens:
       Etikett: [________________________]
       Skattekategori: [Arbete ▼]
       Färg: [🔵] (optional)
       Standard: [ ] Gör till standardtagg

3. Create tags:
     → "Firma - Jobb" (Arbete) — blue
     → "Kundbesök" (Arbete) — blue
     → "Pendling" (Pendling) — yellow
     → "Privat" (Privat) — gray

4. Drag to desired order (sort_order)

5. Result:
     → organization_tags rows created
     → Next time a driver opens their tag picker in the app:
       they see "Firma - Jobb", "Kundbesök", "Pendling", "Privat"
       instead of generic "Work", "Commute", "Personal"
```

### Impact on Existing Data

- Tags are only applied to new trips going forward
- Existing trips keep their generic `tag` value
- The `fleet_tag_id` FK is set alongside the standard `tag` — both are written
- Skatteverket exports use the standard `tag` column (work/commute/personal) — always compatible

---

## 12. Vehicle Assignment

**Trigger:** Admin wants to link an existing vehicle to the organization and assign it to a driver  
**Frequency:** During initial setup, and when cars/drivers change  
**Goal:** Each vehicle has a clear owner for accountability

### Important: Web Dashboard Does NOT Create Vehicles

Vehicles must first be registered via the **Millog mobile app**:
1. Vehicle owner completes Tesla OAuth in the mobile app
2. `tesla-token-exchange` Edge Function syncs vehicle to the `vehicles` table
3. Virtual Key pairing is completed (requires physical proximity)
4. Telemetry config is pushed to the car

The web dashboard only **links existing vehicles** to the organization. It does not interact with the Tesla API.

### Steps — Add Vehicle to Organization

```
1. /dashboard/vehicles
     → Clicks "Lägg till fordon" → AddVehicleDialog opens

2. Enters VIN (required, 17 chars)
     → Optional display name
     → Optional driver assignment (select from active org members)
     → Pool car checkbox

3. Clicks "Lägg till fordon"
     → Dialog searches vehicles table by VIN
     → If found: creates organization_vehicles row
     → If driver selected: creates organization_vehicle_assignments row
     → If not found: error "Inget fordon med angivet VIN hittades.
        Fordonet måste vara registrerat i Millog-appen först."

4. Vehicle appears in card grid with:
     → Display label (or model name, or "Namnlöst fordon")
     → Trim + last 6 chars of VIN
     → Status badges: Pool (secondary), Telemetry (green), SoC% (outline)
     → Assigned driver(s) with primary indicator
```

### Steps — Manage Existing Vehicle

```
1. On a VehicleCard, admin can:
     → Toggle pool car status
     → Assign/unassign drivers
     → View telemetry status badge

2. Filter tabs: Alla / Tilldelade / Otilldelade / Poolbilar
```

### Why Vehicle Assignment Matters

- **Accountability:** "Who was driving REG-123 last Tuesday?" — the assignment answers this
- **Reporting:** Per-driver reports include the vehicle they were assigned to
- **Compliance:** Vehicles without an assigned driver are flagged (pool car = intentional, unassigned = problem)

---

## 13. Personal Statistics — Sub-page Navigation

**Trigger:** Driver clicks a stat card (e.g. "Energieffektivitet" or "Körmönster") on the Statistics overview  
**Frequency:** Daily/weekly — personal insight browsing  
**Goal:** Drill into a detailed breakdown for one metric without losing the selected time period

### Breadcrumb Trail

```
Hem  →  Statistik  →  [Detail page title]
```

The selected period (`month` / `year` / `alltime`) is forwarded via query string so the detail page always shows the same period the user was already viewing.

### URL Structure

```
/personal/statistics/{slug}?period={period}
```

| Slug         | Full URL example                                  | Stat card that opens it |
| ------------ | ------------------------------------------------- | ----------------------- |
| `efficiency` | `/personal/statistics/efficiency?period=month`    | Energieffektivitet      |
| `driving`    | `/personal/statistics/driving?period=month`       | Körmönster              |

### Steps

```
1. /personal (Statistics tab selected)
     → Period picker visible (Denna månad / Detta år / Alltid)
     → Stat cards rendered — clickable cards show › chevron

2. User taps a clickable stat card
     → useNavigate("/personal/statistics/{slug}?period={currentPeriod}")

3. /personal/statistics/{slug}?period={period}
     → useSearchParams() reads period
     → Page fetches its own data for that vehicle + period
     → Back button: navigate("/personal/statistics")
     → Breadcrumb: Hem › Statistik › [Page title]

4. User taps Back
     → Returns to /personal (Statistics tab, same period)
```

### Same Pattern: Trip Detail

```
/personal/trips/:id
```

Tapping a trip in the Trips tab opens the exact same sub-page pattern:
- Trip list → click row → full trip detail page
- Back button returns to `/personal` (Trips tab)

This is the canonical "master → detail" pattern for the personal section.

### How to Add a New Detail Sub-page

Follow these five steps — in order:

**1. Create the page** `src/pages/personal/statistics-{slug}.tsx`

```tsx
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function StatisticsSlugPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const period = (searchParams.get("period") ?? "month") as Period;

  // Fetch your own data here using period + active vehicle

  return (
    // Back button: navigate("/personal/statistics")
    // ALL strings: t("personal.slugXxx")  — never hardcode Swedish
  );
}
```

**2. Add translation keys** to `src/i18n/sv.ts` AND `src/i18n/en.ts`

```ts
// sv.ts  (source of truth)
slugTitle: "Min nya statistik",
slugSubtitle: "Detaljerad vy",
// ... all strings the page uses

// en.ts  (typed against TranslationStrings — TS will fail if keys are missing)
slugTitle: "My new statistic",
slugSubtitle: "Detailed view",
```

**3. Register the route** in `src/app.tsx`

```tsx
<Route path="statistics/slug" element={<StatisticsSlugPage />} />
```

Route must be nested inside the `<Route path="/personal">` parent.

**4. Make the stat card clickable** in `src/pages/personal/_shared.tsx`

```tsx
<StatCard
  title={t("personal.statCardSlug")}
  href={`/personal/statistics/slug?period=${period}`}
  // ...
/>
```

**5. Add the stat card title key** `statCardSlug` to both `sv.ts` and `en.ts`.

### i18n Rules (Non-Negotiable)

- **Every string visible to the user must use `t()`** — no hardcoded Swedish, no hardcoded English.
- Keys live under the `personal.*` namespace.
- `sv.ts` is the source of truth. `en.ts` implements the `TranslationStrings` type — TypeScript will error if a key is present in `sv.ts` but missing from `en.ts`.
- **Interpolated values** (numbers, units) use the `{{ variable }}` syntax: `t("personal.distDetailTrips", { count: n })`.
- **Day names and weekday labels** must use `toLocaleDateString(undefined, { weekday: "short" })` anchored to a reference date — not translation keys. This automatically adapts to any locale.
- **Never translate units** (km, kWh, %) — they are universal.

---

## 14. Delete Organization

**Trigger:** Admin decides to permanently shut down the fleet organization  
**Frequency:** Rare (once per org lifetime)  
**Goal:** Complete removal of org, members, vehicles, assignments, invitations, tags; best-effort telemetry offboarding; optional driver account deletion  
**Target time:** Under 1 minute

### Steps — 3-Step Confirmation Dialog (Settings → Danger Zone)

```
1. Admin scrolls to "Riskzon" card at bottom of Settings page (admin-only)
2. Clicks "Radera organisation" → dialog opens
3. Step 1 — Impact Summary:
   - Red warning: "Denna åtgärd är permanent. Det finns inget sätt att återställa."
   - Lists all drivers (name + email) who will be affected
   - Lists all vehicles (model + VIN tail) that will be disconnected
   - Lists data that will be permanently deleted
4. Step 2 — Account Deletion Choice:
   - Toggle: "Radera även förarnas användarkonton" (default OFF)
   - When ON: warning that drivers lose ALL personal data
   - When OFF: info that drivers keep their accounts
5. Step 3 — Type Organization Name:
   - Must type exact org name (case-sensitive) to enable delete button
   - "Radera organisation permanent" button (destructive, disabled until match)
6. On confirm → calls fleet-delete-org Edge Function
7. Edge Function:
   a. Verifies JWT + admin role
   b. Best-effort offboards all telemetry vehicles (push empty config via VPS proxy)
   c. If toggle ON: deletes driver auth accounts via admin API
   d. DELETE organization row → CASCADE handles members, vehicles, assignments, invitations, tags
8. On success → sign out → redirect to /login → toast "Organisationen har raderats."
```

### Edge Function: `fleet-delete-org`

- Auth: `--no-verify-jwt` (manual JWT verification)
- Body: `{ delete_driver_accounts: boolean }`
- Response: `{ success: true, offboarded_vehicles: number, deleted_accounts: number }`
- Telemetry offboarding: parallel with 30s global timeout, 8s per vehicle, never blocks deletion
- Uses service role for DELETE (bypasses RLS)

### Safety Measures

- 3-step confirmation prevents accidental deletion
- Exact org name match required (no "type DELETE" shortcuts)
- Admin-only — card hidden for non-admin users
- Telemetry offboarding is best-effort — failure never blocks the deletion
- Post-deletion sign-out prevents stale state

---

## Flow Priority for Phase 1 Implementation

| Priority | Flow | Why |
| -------- | ---- | --- |
| **P0** | Fleet Admin Onboarding | Can't do anything without an org |
| **P0** | Single Driver Invite | Can't have drivers without creating accounts |
| **P0** | Login | Can't use the product without auth |
| **P1** | Daily Admin Check-In (Dashboard) | The daily touchpoint — must feel fast and complete |
| **P1** | Compliance Review | Primary value proposition — "who needs attention?" |
| **P1** | Monthly Export | The deliverable that justifies the subscription |
| **P2** | Bulk CSV Import | Critical for 10+ driver fleets, but single invite works first |
| **P2** | Year-End Tax Report | High value but infrequent — monthly export covers interim |
| **P2** | Custom Tag Setup | Important for förmånsbeskattning but generic tags work first |
| **P3** | Vehicle Assignment | Nice-to-have — vehicles auto-appear when drivers pair |
| **P3** | Deactivate/Reactivate Driver | Edge case — needed but not day-one critical |
| **P3** | Password Reset | Standard auth feature — ship early but not complex |
