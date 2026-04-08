# Millog Web — Fleet Dashboard

**Status:** Pre-development — documentation phase  
**Authoritative product spec:** [`Millog/Docs/product/MILLOG-WEB.md`](../Millog/Docs/product/MILLOG-WEB.md)

---

## What This Is

A B2B fleet management web portal for Swedish companies with Tesla fleets. The admin creates all driver accounts centrally, drivers just download the Millog app and drive, trips auto-log via server-side telemetry, and one PDF export at year-end covers the whole fleet — Skatteverket-compliant körjournal without a single manual entry.

**Not** a web version of the mobile app. This is the admin's tool. Drivers never use it.

---

## Tech Stack

| Layer          | Choice                                         | Why                                                        |
| -------------- | ---------------------------------------------- | ---------------------------------------------------------- |
| Framework      | Vite + React + TypeScript                      | Static SPA — no server runtime needed                      |
| UI             | shadcn/ui (b0 preset) + Tailwind CSS v4        | Accessible, copy-in components, no vendor lock-in          |
| Charts         | Recharts                                       | Fleet-level data visualization                             |
| Data fetching  | @tanstack/react-query + @supabase/supabase-js  | Caching, refetching, optimistic updates                    |
| Auth           | Supabase Auth via @supabase/ssr                | Same backend as mobile app, cookie-based sessions          |
| Routing        | react-router-dom v7                            | Client-side SPA routing                                    |
| Hosting        | Loopia static hosting (Sweden)                 | `dist/` folder + `.htaccess`, GDPR-clean Swedish hosting   |
| Billing        | Stripe (not RevenueCat)                        | B2B web subscription, per-driver pricing                   |
| Language       | Swedish only (Phase 1)                         | All UI strings in Swedish, sv-SE locale for dates/numbers  |

---

## Getting Started

```bash
# Prerequisites: Node.js 20+, pnpm 9+

# Initialize (already scaffolded with shadcn b0 preset)
pnpm dlx shadcn@latest init --preset b0 --template vite

# Install dependencies
pnpm install

# Environment variables
cp .env.example .env.local
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# Development
pnpm dev

# Build for production
pnpm build
# Output: dist/ → upload to Loopia via FTP
```

---

## Documentation

| Document                                      | What it covers                                              |
| --------------------------------------------- | ----------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)  | System architecture, auth model, Supabase integration       |
| [docs/SCREENS.md](docs/SCREENS.md)            | Every screen with layout, data, components, empty states    |
| [docs/FLOWS.md](docs/FLOWS.md)                | Critical user flows — onboarding, invite, compliance, export|
| [docs/DATA-QUERIES.md](docs/DATA-QUERIES.md)  | Supabase queries, RLS patterns, Edge Function contracts     |
| [docs/COMPONENT-MAP.md](docs/COMPONENT-MAP.md)| shadcn/ui components mapped to screens and patterns         |

---

## Key Principles

1. **The portal is a pure Supabase client.** It never talks to the VPS, MQTT, bridge, or Tesla API. All data is already in Supabase by the time the admin opens the dashboard.
2. **No secrets in the client bundle.** Anon key is fine (RLS enforces access). Service role key lives in Edge Functions only.
3. **Fleet admin sees trip data but never modifies it.** Read-only access via RLS. The driver owns their körjournal.
4. **Swedish-only UI.** All strings hardcoded in Swedish. No i18n framework in Phase 1.
5. **Ease of use over feature count.** A fleet admin should feel productive in under 5 minutes.

---

## Domain

- **Web portal:** `app.millogapp.se`
- **Landing page:** `millogapp.se` (separate, not part of this project)

---

## Project Structure

```
src/
├── components/
│   ├── ui/           ← shadcn/ui (auto-generated)
│   ├── layout/       ← Sidebar, Header, DashboardShell
│   ├── drivers/      ← DriverTable, InviteForm, BulkImport
│   ├── vehicles/     ← VehicleTable, AssignmentDialog
│   ├── compliance/   ← ComplianceList, StatusBadge
│   ├── reports/      ← ReportGenerator, ExportButtons
│   └── charts/       ← FleetKmChart, ComplianceTrend
├── lib/
│   ├── supabase.ts   ← Client init
│   ├── types.ts      ← Database types
│   └── utils.ts      ← cn(), formatters
├── hooks/            ← use-auth, use-org, use-drivers, etc.
├── contexts/         ← AuthProvider, OrgProvider
├── pages/            ← One file per route
└── routes.tsx        ← React Router config
```