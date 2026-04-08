# Flows — Millog Web

> The critical user journeys that define the product. Each flow describes the step-by-step experience, what triggers it, what the happy path looks like, and where things can go wrong.

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

---

## 1. Fleet Admin Onboarding

**Trigger:** Company decides to use Millog for their Tesla fleet  
**Frequency:** Once per organization  
**Goal:** Org created, admin logged in, ready to invite drivers  
**Target time:** Under 2 minutes

### Steps

```
1. Admin visits app.millogapp.se
     → Sees login page with "Skapa nytt flottkonto" link
     
2. Clicks "Skapa nytt flottkonto" → /signup
     → Enters: company name, org number (optional), name, email, password

3. Clicks "Skapa flottkonto"
     → Client validates all fields
     → supabase.auth.signUp() creates auth user
     → DB trigger creates profiles row
     → Edge Function fleet-create-org creates:
       - organizations row
       - organization_members row (role = 'admin')
       - Updates profiles.org_id + profiles.org_role

4. Redirect to /dashboard
     → Empty state: "Välkommen! Bjud in din första förare."
     → Two CTA buttons: "Bjud in förare" and "Importera CSV"

5. Admin is fully set up. No further configuration required.
```

### Error Paths

| Error | Recovery |
| ----- | -------- |
| Email already registered | "Denna e-post är redan registrerad. Logga in istället." |
| Weak password | "Lösenordet måste vara minst 8 tecken." |
| Network error | "Kunde inte skapa konto — kontrollera din anslutning." |
| Edge Function fails | "Något gick fel. Försök igen." + retry button |

### Success Criteria

- Time from clicking "Skapa" to seeing the empty dashboard: < 3 seconds
- Zero emails required before admin can start working
- No configuration screens that must be completed first

---

## 2. Single Driver Invite

**Trigger:** Admin wants to add one driver  
**Frequency:** 1–5 times per week during initial rollout, rare after  
**Goal:** Driver account created, temp password visible to admin  
**Target time:** Under 30 seconds

### Steps

```
1. Admin is on /dashboard/drivers
     → Clicks "Bjud in förare" → /dashboard/drivers/new

2. Enters driver's name and email
     → Client validates: name ≥ 2 chars, valid email

3. Clicks "Skapa konto"
     → Calls Edge Function fleet-create-drivers (single mode)
     → Edge Function:
       a. Generates 12-char cryptographically random temp password
       b. supabase.auth.admin.createUser({ email, password: tempPwd })
       c. Inserts profiles row (must_change_password = true)
       d. Inserts organization_members row (role = 'driver')
       e. Inserts fleet_invitations row (status = 'pending')
       f. Returns { name, email, tempPassword } to caller

4. UI shows success card:
     ┌─────────────────────────────────────┐
     │ ✓ Konto skapat                       │
     │                                       │
     │ Johan Svensson                        │
     │ johan@company.se                      │
     │                                       │
     │ Tillfälligt lösenord:                 │
     │ [Kx9#mPqR2w5L]  [📋 Kopiera]         │
     │                                       │
     │ [Skicka inbjudningsmail] [Bjud in en  │
     │                           till]        │
     └─────────────────────────────────────┘

5. Admin copies temp password → shares with driver via company IT process

6. Optional: clicks "Skicka inbjudningsmail"
     → Triggers email with App Store link + instructions
     → Password is NOT included in the email (security)
```

### Key Design Choice

The temp password is displayed **on screen** — not emailed. This is intentional:
- Many companies have their own credential distribution processes
- Email delivery is unreliable (spam filters, delays)
- The copy button is the fastest path
- The email is supplemental, not critical

### Error Paths

| Error | Recovery |
| ----- | -------- |
| Email already in org | "Denna e-post finns redan i er organisation." |
| Email exists (different org) | "Denna e-post tillhör redan ett annat konto." |
| Edge Function timeout | "Kunde inte skapa konto — försök igen." |

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

### The 60-Second Path

```
1. Admin opens app.millogapp.se → auto-redirects to /dashboard
     → Already logged in (session persisted)

2. Scans the 6 stat cards:
     → "87% efterlevnad" ✓
     → "3 otaggade resor" — acceptable
     → "8/10 aktiva fordon" — 2 not yet paired, expected

3. Glances at weekly km chart:
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

**Trigger:** Admin wants to map a vehicle to a specific driver, or manage pool cars  
**Frequency:** During initial setup, and when cars/drivers change  
**Goal:** Each vehicle has a clear owner for accountability

### Steps

```
1. /dashboard/vehicles

2. Find vehicle (vehicles appear automatically when drivers pair)
     → VIN or model name shown

3. Click the "Förare" cell for the vehicle
     → Dropdown shows all unassigned drivers
     → Select driver → saved immediately

4. Optionally: click vehicle display label
     → Edit inline: "5YJ3E7EB5..." → "Silver Model Y — ABC 123"
     → Saved on blur/enter

5. For pool cars: leave "Förare" as "Ej tilldelad"
     → Vehicle is tracked but not assigned to any single driver
     → Multiple drivers could use it (each with their own trips)
```

### Why Vehicle Assignment Matters

- **Accountability:** "Who was driving REG-123 last Tuesday?" — the assignment answers this
- **Reporting:** Per-driver reports include the vehicle they were assigned to
- **Compliance:** Vehicles without an assigned driver are flagged (pool car = intentional, unassigned = problem)

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
