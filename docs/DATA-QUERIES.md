# Data & Queries — Millog Web

> Every Supabase query the web portal needs, organized by screen. Plus the Edge Function contracts for privileged operations.

---

## Supabase Client Setup

```typescript
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true, // needed for password reset links
  },
});
```

**Rule:** Every query below runs through the anon key client. RLS enforces access. No service role key in the web app.

---

## Table: Quick Reference

### Existing Tables (read from)

| Table | What the web portal reads |
| ----- | ------------------------- |
| `profiles` | Driver name, email, org_id, org_role, active_vehicle_id |
| `vehicles` | Model, VIN, telemetry_enabled, display_name |
| `trips` | All trip data (km, cost, tag, addresses, timestamps) |
| `vehicle_telemetry_cache` | Last signal timestamps (to show "last data received") |

### New Tables (read + write via admin)

| Table | What the web portal does |
| ----- | ------------------------ |
| `organizations` | Read own org, update settings |
| `organization_members` | Read all members, manage roles |
| `fleet_invitations` | Read invitations, create via Edge Function |
| `organization_tags` | CRUD custom trip tags |
| `organization_vehicle_assignments` | Assign vehicles to drivers |

---

## Queries by Screen

### Dashboard Overview (`/dashboard`)

**Fleet stats (aggregated):**
```typescript
// Total km, elkostnad, work km — for all org members in period
const { data: fleetStats } = await supabase.rpc('fleet_trip_stats', {
  p_start: periodStart,   // timestamptz
  p_end: periodEnd,       // timestamptz
});

// Returns: { total_km, total_cost_kr, work_km, untagged_count, 
//            total_trips, tagged_trips }
```

If no RPC exists, equivalent client-side query:
```typescript
// Get all trips for org members in period
const { data: trips } = await supabase
  .from('trips')
  .select('distance_km, cost_kr, tag, started_at')
  .gte('started_at', periodStart)
  .lte('started_at', periodEnd)
  .not('superseded_by', 'is', null); // exclude superseded

// Aggregate client-side:
const totalKm = trips.reduce((sum, t) => sum + (t.distance_km ?? 0), 0);
const totalCost = trips.reduce((sum, t) => sum + (t.cost_kr ?? 0), 0);
const workKm = trips.filter(t => t.tag === 'work')
  .reduce((sum, t) => sum + (t.distance_km ?? 0), 0);
const untagged = trips.filter(t => t.tag === 'untagged').length;
```

**Active vehicles count:**
```typescript
const { count: activeVehicles } = await supabase
  .from('vehicles')
  .select('id', { count: 'exact', head: true })
  .eq('telemetry_enabled', true)
  .in('user_id', orgMemberUserIds); // pre-fetched from org context
```

**Weekly km chart data:**
```typescript
// Trips grouped by week — aggregate client-side
const { data: chartTrips } = await supabase
  .from('trips')
  .select('distance_km, tag, started_at')
  .gte('started_at', sixWeeksAgo)
  .is('superseded_by', null)
  .order('started_at', { ascending: true });

// Group by ISO week client-side using date-fns getISOWeek()
```

---

### Driver List (`/dashboard/drivers`)

**All drivers with status:**
```typescript
// Organization members with their profiles and vehicles
const { data: members } = await supabase
  .from('organization_members')
  .select(`
    id,
    role,
    user_id,
    profiles!inner (
      id,
      full_name,
      email
    )
  `)
  .eq('org_id', orgId);

// For each driver, get their vehicle and untagged trip count
// Option A: separate queries per driver (fine for <50 drivers)
// Option B: batch query with IN clause
const driverUserIds = members.map(m => m.user_id);

const { data: vehicles } = await supabase
  .from('vehicles')
  .select('id, user_id, display_name, model, vin, telemetry_enabled')
  .in('user_id', driverUserIds);

const { data: untaggedCounts } = await supabase
  .from('trips')
  .select('user_id')
  .eq('tag', 'untagged')
  .is('superseded_by', null)
  .in('user_id', driverUserIds);

// Aggregate untagged per user client-side
```

**Last trip per driver:**
```typescript
// For displaying "senaste resa" column
// This could be an RPC for efficiency, or fetched per-driver
const { data: lastTrips } = await supabase
  .from('trips')
  .select('user_id, ended_at')
  .in('user_id', driverUserIds)
  .is('superseded_by', null)
  .order('ended_at', { ascending: false });
// Take first per user_id client-side
```

---

### Driver Detail (`/dashboard/drivers/:id`)

**Driver profile + vehicle:**
```typescript
const { data: profile } = await supabase
  .from('profiles')
  .select('id, full_name, email')
  .eq('id', driverUserId)
  .single();

const { data: vehicle } = await supabase
  .from('vehicles')
  .select('id, display_name, model, vin, telemetry_enabled, telemetry_verified_at')
  .eq('user_id', driverUserId)
  .limit(1)
  .single();
```

**Driver trips (paginated):**
```typescript
const PAGE_SIZE = 25;

const { data: trips, count } = await supabase
  .from('trips')
  .select('*', { count: 'exact' })
  .eq('user_id', driverUserId)
  .is('superseded_by', null)
  .gte('started_at', periodStart)
  .lte('started_at', periodEnd)
  .order('started_at', { ascending: false })
  .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
```

**Driver summary stats:**
```typescript
const { data: driverTrips } = await supabase
  .from('trips')
  .select('distance_km, cost_kr, tag')
  .eq('user_id', driverUserId)
  .is('superseded_by', null)
  .gte('started_at', periodStart)
  .lte('started_at', periodEnd);

// Aggregate client-side: total km, total cost, work/personal ratio, untagged count
```

---

### Compliance View (`/dashboard/compliance`)

**Per-driver compliance data:**
```typescript
// Get all org driver user_ids
const driverIds = members
  .filter(m => m.role === 'driver')
  .map(m => m.user_id);

// Get untagged count per driver (last 30 days)
const { data: recentTrips } = await supabase
  .from('trips')
  .select('user_id, tag, updated_at')
  .in('user_id', driverIds)
  .is('superseded_by', null)
  .gte('started_at', thirtyDaysAgo);

// Client-side aggregation:
// Per driver: { untaggedCount, totalTrips, lastTaggedAt, compliancePct }
// Fleet-wide: { totalTagged, totalTrips, compliancePct }
// Color: green (0 untagged), yellow (1-5), red (6+ or lastTagged > 14 days)
```

**Compliance trend (monthly):**
```typescript
// Get trips from last 6 months, group by month
const { data: trendTrips } = await supabase
  .from('trips')
  .select('tag, started_at')
  .in('user_id', driverIds)
  .is('superseded_by', null)
  .gte('started_at', sixMonthsAgo);

// Group by month, calculate tagged/total per month
```

---

### Vehicle List (`/dashboard/vehicles`)

```typescript
// Vehicles with their assignments
const { data: assignments } = await supabase
  .from('organization_vehicle_assignments')
  .select(`
    id,
    vehicle_id,
    assigned_user_id,
    display_label,
    vehicles!inner (
      id, model, vin, telemetry_enabled, user_id
    )
  `)
  .eq('org_id', orgId);

// Also get vehicles that exist for org users but have no assignment yet
const { data: allOrgVehicles } = await supabase
  .from('vehicles')
  .select('id, model, vin, display_name, telemetry_enabled, user_id')
  .in('user_id', driverIds);

// Merge: assigned vehicles + unassigned vehicles
```

**Update vehicle assignment:**
```typescript
await supabase
  .from('organization_vehicle_assignments')
  .upsert({
    org_id: orgId,
    vehicle_id: vehicleId,
    assigned_user_id: driverUserId, // or null for pool
    display_label: label,
    assigned_by: currentUserId,
  }, { onConflict: 'org_id,vehicle_id' });
```

**Update display label:**
```typescript
await supabase
  .from('organization_vehicle_assignments')
  .update({ display_label: newLabel })
  .eq('id', assignmentId);
```

---

### Settings — Organization

**Read org:**
```typescript
const { data: org } = await supabase
  .from('organizations')
  .select('*')
  .eq('id', orgId)
  .single();
```

**Update org:**
```typescript
await supabase
  .from('organizations')
  .update({
    name: newName,
    org_number: newOrgNumber,
    billing_email: newEmail,
  })
  .eq('id', orgId);
```

---

### Settings — Custom Tags

**Read tags:**
```typescript
const { data: tags } = await supabase
  .from('organization_tags')
  .select('*')
  .eq('org_id', orgId)
  .order('sort_order', { ascending: true });
```

**Create tag:**
```typescript
const { data: newTag } = await supabase
  .from('organization_tags')
  .insert({
    org_id: orgId,
    label: 'Kundbesök',
    tax_category: 'work',
    color: '#3B82F6',
    sort_order: nextOrder,
  })
  .select()
  .single();
```

**Update tag:**
```typescript
await supabase
  .from('organization_tags')
  .update({ label: newLabel, tax_category: newCategory, color: newColor })
  .eq('id', tagId);
```

**Delete tag:**
```typescript
await supabase
  .from('organization_tags')
  .delete()
  .eq('id', tagId);
```

**Reorder tags (drag-and-drop):**
```typescript
// After reorder, update sort_order for all tags in batch
const updates = reorderedTags.map((tag, index) => ({
  id: tag.id,
  org_id: orgId,
  label: tag.label,
  tax_category: tag.tax_category,
  sort_order: index,
}));

await supabase
  .from('organization_tags')
  .upsert(updates, { onConflict: 'id' });
```

---

### Settings — Admins & Viewers

**Read admins/viewers:**
```typescript
const { data: admins } = await supabase
  .from('organization_members')
  .select(`
    id,
    role,
    user_id,
    profiles!inner (
      full_name,
      email
    )
  `)
  .eq('org_id', orgId)
  .in('role', ['admin', 'viewer']);
```

**Remove admin/viewer:**
```typescript
await supabase
  .from('organization_members')
  .delete()
  .eq('id', memberId);
```

---

## Edge Function Contracts

### `fleet-create-org`

**Purpose:** Create a new organization + first admin member  
**Auth:** Requires valid JWT (caller must be authenticated)  
**Method:** POST

```typescript
// Request
{
  name: string;           // Company name
  org_number?: string;    // Organisationsnummer
  billing_email: string;  // Invoice email
}

// Response (200)
{
  org: {
    id: string;
    name: string;
    org_number: string | null;
    billing_email: string;
  };
}

// Errors
// 400: Missing required fields
// 409: User already belongs to an organization
// 500: Internal error
```

**Server-side logic:**
1. Validate inputs
2. Get caller's user_id from JWT
3. Check caller is not already in an org (UNIQUE constraint on organization_members.user_id)
4. INSERT organizations row (created_by = caller)
5. INSERT organization_members row (role = 'admin')
6. UPDATE profiles SET org_id, org_role = 'admin'

---

### `fleet-create-drivers`

**Purpose:** Create one or more driver accounts with temp passwords  
**Auth:** Requires valid JWT + caller must be org admin  
**Method:** POST

```typescript
// Request
{
  drivers: Array<{
    name: string;
    email: string;
  }>;
}

// Response (200)
{
  results: Array<{
    name: string;
    email: string;
    tempPassword: string;    // 12-char random, shown to admin
    success: boolean;
    error?: string;          // if success = false
  }>;
  created: number;
  failed: number;
}

// Errors
// 401: Not authenticated
// 403: Not an org admin
// 400: Invalid input (empty array, bad email format)
```

**Server-side logic (per driver):**
1. Generate 12-char cryptographically random password (crypto.getRandomValues)
2. `supabase.auth.admin.createUser({ email, password: tempPwd, email_confirm: true })`
3. INSERT profiles row (full_name, org_id, org_role = 'driver', must_change_password = true)
4. INSERT organization_members row (role = 'driver', invited_by = caller)
5. INSERT fleet_invitations row (status = 'accepted', created_user_id = new user id)
6. Return { name, email, tempPassword }

**Security:** Temp password is returned to the caller (the admin) once and never stored in plaintext anywhere. The admin sees it on screen with a copy button. Supabase Auth stores it as a bcrypt hash.

---

### `fleet-generate-report`

**Purpose:** Generate PDF reports for fleet export  
**Auth:** Requires valid JWT + caller must be org admin or viewer  
**Method:** POST

```typescript
// Request
{
  type: 'korjournal' | 'fleet-overview' | 'csv' | 'formansbeskatning';
  start_date: string;       // ISO date
  end_date: string;         // ISO date
  driver_id?: string;       // UUID — if omitted, all drivers
}

// Response (200)
{
  download_url: string;     // Signed URL to download the file
  filename: string;         // e.g., "korjournal-johan-svensson-2026-03.pdf"
  expires_at: string;       // URL expiry timestamp
}

// Errors
// 401: Not authenticated
// 403: Not admin/viewer of this org
// 400: Invalid date range or type
// 404: No trips found for the given criteria
```

**Server-side logic:**
1. Validate caller is admin/viewer of an org
2. Query all trips for the org's drivers in the date range
3. Generate PDF using a library (e.g., `pdf-lib`, `jsPDF`, or Deno-compatible alternative)
4. Upload to Supabase Storage (private bucket, signed URL)
5. Return signed download URL (expires in 1 hour)

---

### `fleet-send-reminder`

**Purpose:** Send compliance reminder email to driver(s)  
**Auth:** Requires valid JWT + caller must be org admin  
**Method:** POST

```typescript
// Request
{
  driver_ids?: string[];    // UUIDs — if omitted, all non-compliant drivers
}

// Response (200)
{
  sent: number;
  failed: number;
}

// Errors
// 401: Not authenticated
// 403: Not an org admin
// 400: Invalid driver IDs
```

**Server-side logic:**
1. Get untagged trip counts per driver
2. For each target driver:
   a. Compose email: "Du har X otaggade resor..."
   b. Send via Supabase SMTP (or Resend if scaled)
3. Return count sent/failed

---

## RPC Functions (Optional — For Query Optimization)

If client-side aggregation becomes slow (>100 drivers, >10,000 trips), create server-side RPCs:

### `fleet_trip_stats`

```sql
CREATE OR REPLACE FUNCTION fleet_trip_stats(
  p_start timestamptz,
  p_end timestamptz
) RETURNS TABLE (
  total_km numeric,
  total_cost_kr numeric,
  work_km numeric,
  untagged_count bigint,
  total_trips bigint,
  tagged_trips bigint
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    COALESCE(SUM(distance_km), 0) AS total_km,
    COALESCE(SUM(cost_kr), 0) AS total_cost_kr,
    COALESCE(SUM(CASE WHEN tag = 'work' THEN distance_km ELSE 0 END), 0) AS work_km,
    COUNT(*) FILTER (WHERE tag = 'untagged') AS untagged_count,
    COUNT(*) AS total_trips,
    COUNT(*) FILTER (WHERE tag != 'untagged') AS tagged_trips
  FROM trips
  WHERE started_at >= p_start
    AND started_at <= p_end
    AND superseded_by IS NULL
    AND user_id IN (
      SELECT om.user_id FROM organization_members om
      WHERE om.org_id = (
        SELECT org_id FROM organization_members WHERE user_id = auth.uid()
      )
    );
$$;
```

### `fleet_driver_compliance`

```sql
CREATE OR REPLACE FUNCTION fleet_driver_compliance(
  p_days int DEFAULT 30
) RETURNS TABLE (
  user_id uuid,
  full_name text,
  email text,
  untagged_count bigint,
  total_trips bigint,
  last_tagged_at timestamptz
) LANGUAGE sql SECURITY DEFINER AS $$
  SELECT
    p.id AS user_id,
    p.full_name,
    p.email,
    COUNT(*) FILTER (WHERE t.tag = 'untagged') AS untagged_count,
    COUNT(*) AS total_trips,
    MAX(t.updated_at) FILTER (WHERE t.tag != 'untagged') AS last_tagged_at
  FROM organization_members om
  JOIN profiles p ON p.id = om.user_id
  LEFT JOIN trips t ON t.user_id = om.user_id
    AND t.started_at >= NOW() - (p_days || ' days')::interval
    AND t.superseded_by IS NULL
  WHERE om.org_id = (
    SELECT org_id FROM organization_members WHERE user_id = auth.uid()
  )
  AND om.role = 'driver'
  GROUP BY p.id, p.full_name, p.email
  ORDER BY untagged_count DESC;
$$;
```

---

## react-query Patterns

### Query Keys Convention

```typescript
// Consistent key structure for cache management
const queryKeys = {
  org: (orgId: string) => ['org', orgId] as const,
  members: (orgId: string) => ['org', orgId, 'members'] as const,
  drivers: (orgId: string) => ['org', orgId, 'drivers'] as const,
  driver: (userId: string) => ['driver', userId] as const,
  driverTrips: (userId: string, period: string) => ['driver', userId, 'trips', period] as const,
  fleetStats: (orgId: string, period: string) => ['org', orgId, 'stats', period] as const,
  compliance: (orgId: string) => ['org', orgId, 'compliance'] as const,
  vehicles: (orgId: string) => ['org', orgId, 'vehicles'] as const,
  tags: (orgId: string) => ['org', orgId, 'tags'] as const,
};
```

### Example Hook

```typescript
// hooks/use-fleet-stats.ts
export function useFleetStats(orgId: string, period: { start: string; end: string }) {
  return useQuery({
    queryKey: queryKeys.fleetStats(orgId, `${period.start}-${period.end}`),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('distance_km, cost_kr, tag')
        .gte('started_at', period.start)
        .lte('started_at', period.end)
        .is('superseded_by', null);

      if (error) throw error;

      return {
        totalKm: data.reduce((sum, t) => sum + (t.distance_km ?? 0), 0),
        totalCost: data.reduce((sum, t) => sum + (t.cost_kr ?? 0), 0),
        workKm: data.filter(t => t.tag === 'work')
          .reduce((sum, t) => sum + (t.distance_km ?? 0), 0),
        untaggedCount: data.filter(t => t.tag === 'untagged').length,
        totalTrips: data.length,
        taggedTrips: data.filter(t => t.tag !== 'untagged').length,
      };
    },
    staleTime: 60_000,       // 1 minute — admin doesn't need real-time
    refetchInterval: 60_000, // Auto-refetch every minute
  });
}
```

---

## Important Query Rules

1. **All queries go through anon key + RLS.** Never construct queries that bypass user_id filtering — even if RLS would catch it, explicit filtering documents intent and prevents logic bugs.

2. **Always filter `superseded_by IS NULL`** when querying trips. Superseded trips are old versions that have been merged — they must not appear in counts, stats, or exports.

3. **Pagination for trip lists** — use `.range()` with 25 rows per page. Fleet dashboards with 30 drivers and 6 months of trips will have 5,000+ rows — never load all at once for the trip table.

4. **Aggregations can be client-side initially.** For <50 drivers and <10,000 trips, reducing in JavaScript is fast enough. Add RPCs when performance requires it.

5. **Never query `vehicle_telemetry_cache` for fleet dashboard stats.** It's a live signal cache for real-time display. Trip data in the `trips` table is the canonical source for all fleet reporting.
