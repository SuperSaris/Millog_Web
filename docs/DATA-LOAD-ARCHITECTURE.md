# Data Load Architecture — Millog Web

> **Status:** ENFORCED — every developer and AI agent working on Millog Web must follow these rules.  
> **Violation of these rules will cause performance regressions, high Supabase bill, and broken UX at scale.**

---

## The Problem This Document Solves

A Tesla driver who commutes daily accumulates ~5 trips/day.

| Period | Expected trip count |
|--------|---------------------|
| Week   | ~35 trips           |
| Month  | ~150 trips          |
| Quarter| ~450 trips          |
| **Year**   | **~1 825 trips**    |

Loading all 1 825 trips into the browser in one query then rendering every row in the DOM is:
- **~3 MB of JSON** transferred (with `raw_drive_state` JSONB columns, easily 5–15 MB)
- **1 825 React nodes** rendered to the DOM simultaneously
- **Client-side filter + reduce** on the wrong data set (silently truncated by `.limit()`)
- A **summary line showing wrong numbers** because totals are computed from the truncated subset

These are not hypothetical — `.limit(500)` will silently drop trips from a power user's year view, giving them a wrong mileage report.

---

## Rule 1 — PAGE_SIZE = 50. Never load more than 50 trip rows for display.

```typescript
// ✅ Correct
const PAGE_SIZE = 50;
supabase.from("trips").select(LIST_SELECT).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

// ❌ Wrong — silently drops data, misleads the user
supabase.from("trips").select(...).limit(500);
```

**Rationale:** 50 rows is ~5–10 days of trips for a daily driver. It renders instantly and keeps the DOM fast. The user can load more on demand.

**No exceptions.** Even for internal admin views — use pagination every time.

---

## Rule 2 — Summary stats come from a dedicated aggregate query, NEVER from paginated rows.

The filter summary bar ("35 resor · 579 km · 213 kr") must always reflect the full date range, regardless of how many rows are loaded in the list.

```typescript
// ✅ Correct — separate lightweight query for aggregate
const AGGREGATE_SELECT = "distance_km, cost_kr, tag"; // 3 tiny columns

supabase
  .from("trips")
  .select(AGGREGATE_SELECT)
  .eq("user_id", user.id)
  .gte("started_at", from)
  .lte("started_at", to);
// → 1 000 trips × 3 numbers ≈ 25 KB. Acceptable.
// → Client sums to get count, km, kr totals.

// ❌ Wrong — totals computed from the subset in the DOM
const summary = groups.flatMap(g => g.trips).reduce(...);
// This shows wrong numbers when page 2+ exists.
```

**Why a separate select and not an RPC?** Avoids needing a new Postgres function for a simple case. Three numeric columns per row is trivial payload. Add an RPC (`trip_period_stats`) if this becomes a bottleneck at >2 000 rows.

---

## Rule 3 — `raw_drive_state` is FORBIDDEN in list queries.

`raw_drive_state` is a JSONB column storing the raw Tesla telemetry snapshot. It is **10–50 KB per trip**.

```typescript
// ✅ List query — no raw_drive_state
const LIST_SELECT =
  "id, started_at, ended_at, start_address, end_address, " +
  "start_lat, start_lng, end_lat, end_lng, " +
  "distance_km, energy_used_kwh, cost_kr, tag, " +
  "soc_start, soc_end, outside_temp_c, notes";

// ❌ List query — forbidden
"... raw_drive_state"
// Loading raw_drive_state for 50 rows = up to 2.5 MB of wasted payload.
// For 500 rows (the old limit) = up to 25 MB.
```

`raw_drive_state` is ONLY fetched in the **single-trip detail query** (`/personal/trips/:id`).

---

## Rule 4 — Chart queries must use aggregated data, not individual rows.

The km-per-day chart on the home page (`PersonalDashboardPage`) currently fetches 500 individual trip rows and groups them client-side. This is wrong.

```typescript
// ✅ Target: RPC aggregate for chart data
const { data } = await supabase.rpc("trip_daily_km", {
  p_user_id: user.id,
  p_from: rangeStart,
});
// Returns: [{ date: "2026-04-01", km: 45.2 }, ...]

// ❌ Current (to be fixed): individual rows for chart
supabase.from("trips").select("started_at, distance_km").limit(500)
// If you must use this pattern temporarily: REMOVE raw_drive_state, limit = 300.
```

**Action item:** Create `trip_daily_km` RPC function. Until then, limit the query to `"started_at, distance_km"` only (no raw_drive_state, no addresses).

---

## Rule 5 — The `.limit()` pattern is BANNED. Use `.range()`.

```typescript
// ❌ .limit() is a hard cap with no pagination signal
.limit(500) // silent truncation — caller cannot know if there are more rows

// ✅ .range() + check for more
.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
// If data.length === PAGE_SIZE → there may be more rows → show "Load more"
// If data.length < PAGE_SIZE → you have reached the end
```

The only permitted uses of `.limit()`:
- `.limit(1)` for existence checks or `.maybeSingle()`
- `.limit(5)` or `.limit(8)` for "recent N items" widgets where truncation is explicit and expected
- Aggregate queries where you intentionally want all rows (use `.limit()` only when count is bounded and documented)

---

## Rule 6 — DOM row budget: max 200 trip rows rendered simultaneously.

If the user loads more pages and accumulates >200 rendered rows:

1. **Preferred:** Windowed/virtual rendering using `react-virtual` or a similar library — only render visible rows.
2. **Acceptable for now:** After exceeding 200 rows, collapse the oldest day-group into a summary card: *"+ N resor (14 mars – 5 jan) — Visa"*, and discard the rendered nodes.

This rule prevents the browser from choking on a power user's year view.

**Current state (April 2026):** Not yet implemented. Tracked as tech debt. Triggered when we have evidence of >200 DOM rows causing frame-rate issues.

---

## Rule 7 — Period → load budget map

| Period  | Initial pages auto-loaded | Max rows in DOM before collapse |
|---------|---------------------------|---------------------------------|
| Week    | 2 pages (100 rows)        | Never collapse — max ~35/week   |
| Month   | 1 page (50 rows)          | 150 rows                        |
| Quarter | 1 page (50 rows)          | 200 rows                        |
| Year    | 1 page (50 rows)          | 200 rows — warn user if >500 total |
| Custom  | 1 page (50 rows)          | Based on day span               |

For **Year** and **Quarter**: after the initial 50-row load, display the period total from the aggregate query. The user sees "1 245 resor · 18 400 km · 2 600 kr" immediately even though only 50 rows are rendered.

---

## Rule 8 — The "Select tag" in a list must not block navigation.

Inline tag selects use `stopPropagation` to prevent the row click-through. When adding interactions to list rows, always audit: does this event bubble up and trigger unintended navigation?

---

## Rule 9 — Query checklist for every new Supabase list query

Before shipping any new Supabase query that returns a list, answer these:

- [ ] **Does it use `.range()` instead of `.limit(N > 10)`?**
- [ ] **Does it exclude `raw_drive_state`?**
- [ ] **Is there a separate aggregate query for totals/counts if the user sees a summary?**
- [ ] **Is the total row count bounded and documented (e.g., "recent 5 widget")?**
- [ ] **Is the DOM row budget respected?**
- [ ] **Is the response payload < 500 KB for the initial load?**

If any answer is "no" → fix before shipping.

---

## Payload Size Reference

| Query type                              | Typical payload |
|-----------------------------------------|-----------------|
| 50 full trip rows (LIST_SELECT)         | ~100 KB         |
| 50 trip rows (with raw_drive_state)     | ~500 KB – 2 MB  |
| 500 trip rows (with raw_drive_state)    | ~5 MB – 25 MB ❌ |
| Aggregate: 1 000 rows × 3 columns      | ~25 KB ✅       |
| Single trip detail (all columns)        | ~20–80 KB ✅    |

---

## Current Compliance Status (April 2026)

| Location                            | Status | Notes |
|-------------------------------------|--------|-------|
| `trips.tsx` list query              | ✅ Fixed | PAGE_SIZE=50, .range(), no raw_drive_state, aggregate query |
| `_shared.tsx` TripsTab summary      | ✅ Fixed | Uses periodTotals prop (server aggregate) |
| `index.tsx` chart/home query        | ⚠️ Partial | Removed raw_drive_state; still uses .limit(300); RPC needed |
| `trip-detail.tsx` single-trip query | ✅ OK | Single row, raw_drive_state intentional |
| Dashboard drivers/vehicles queries  | ✅ OK | Small result sets, bounded by org size |

---

## Future: Add `trip_period_stats` RPC

When the aggregate select approach becomes a bottleneck (>5 000 trips, or Supabase billing pressure):

```sql
create or replace function trip_period_stats(
  p_user_id uuid,
  p_from     timestamptz,
  p_to       timestamptz
) returns table(count bigint, total_km numeric, total_kr numeric)
language sql stable security definer
set search_path = public
as $$
  select
    count(*)::bigint,
    coalesce(sum(distance_km), 0)::numeric,
    coalesce(sum(cost_kr), 0)::numeric
  from trips
  where user_id = p_user_id
    and superseded_by is null
    and started_at >= p_from
    and started_at <= p_to;
$$;
```

This replaces the lightweight aggregate select with a single-row response.
