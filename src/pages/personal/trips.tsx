// Trips page — paginated trip list with period/date-range filter, custom tags, and server aggregates.
//
// DATA LOAD RULES (see docs/DATA-LOAD-ARCHITECTURE.md):
//   - PAGE_SIZE = 50 — never load more than 50 display rows per request
//   - Use .range() not .limit() for paginated queries
//   - Summary totals come from a separate lightweight aggregate query (AGGREGATE_SELECT)
//     so the "N resor · X km · Y kr" bar is always accurate even when there are 1000+ trips
//   - raw_drive_state is EXCLUDED from list queries (belongs in the detail view only)

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import {
  TripsTab,
  getPeriodStart,
  type TripRow,
  type Period,
  type CustomTag,
  type CustomRange,
} from "./_shared";

// Governance: raw_drive_state intentionally excluded — 10–50 KB per trip, not needed in list view
const LIST_SELECT =
  "id, started_at, ended_at, start_address, end_address, " +
  "start_lat, start_lng, end_lat, end_lng, " +
  "distance_km, energy_used_kwh, cost_kr, tag, " +
  "soc_start, soc_end, outside_temp_c, notes";

// Aggregate select: 3 tiny columns for accurate period totals (no .range() applied to this query)
const AGGREGATE_SELECT = "distance_km, cost_kr, tag";

const PAGE_SIZE = 50;

export type PeriodTotals = { count: number; km: number; kr: number };

export function TripsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [period, setPeriod]           = useState<Period>("month");
  const [customRange, setCustomRange] = useState<CustomRange | null>(null);
  const [trips, setTrips]             = useState<TripRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore]         = useState(false);
  const [pageIndex, setPageIndex]     = useState(0);
  const [periodTotals, setPeriodTotals] = useState<PeriodTotals | null>(null);
  const [customTags, setCustomTags]   = useState<CustomTag[]>([]);

  // Fetch user's custom tags once on mount
  useEffect(() => {
    if (!user) return;
    supabase
      .from("trip_custom_tags")
      .select("id, name, color, is_work_tag")
      .eq("user_id", user.id)
      .order("name")
      .then(({ data }) => { if (data) setCustomTags(data as CustomTag[]); });
  }, [user]);

  // Derive the active date range from period preset or custom range
  const getRange = useCallback((): { from: string; to: string } => {
    if (customRange) {
      const toDate = new Date(customRange.to);
      toDate.setHours(23, 59, 59, 999);
      return { from: customRange.from.toISOString(), to: toDate.toISOString() };
    }
    return { from: getPeriodStart(period).toISOString(), to: new Date().toISOString() };
  }, [period, customRange]);

  // Reset + load first page + load aggregate whenever period/range changes
  useEffect(() => {
    if (!user) return;

    const { from, to } = getRange();

    setTrips([]);
    setPageIndex(0);
    setHasMore(false);
    setLoading(true);
    setPeriodTotals(null);

    // 1. First page of trips (for list rendering)
    const pagePromise = supabase
      .from("trips")
      .select(LIST_SELECT)
      .eq("user_id", user.id)
      .is("superseded_by", null)
      .gte("started_at", from)
      .lte("started_at", to)
      .order("started_at", { ascending: false })
      .range(0, PAGE_SIZE - 1);

    // 2. Aggregate totals for full period — no .range() so we count everything
    //    Payload: ~1 000 trips × 3 columns ≈ 25 KB, always accurate
    const aggregatePromise = supabase
      .from("trips")
      .select(AGGREGATE_SELECT)
      .eq("user_id", user.id)
      .is("superseded_by", null)
      .gte("started_at", from)
      .lte("started_at", to);

    Promise.all([pagePromise, aggregatePromise]).then(([pageRes, aggRes]) => {
      if (!pageRes.error && pageRes.data) {
        setTrips((pageRes.data as unknown) as TripRow[]);
        setHasMore(pageRes.data.length === PAGE_SIZE);
      }
      if (!aggRes.error && aggRes.data) {
        const rows = aggRes.data;
        setPeriodTotals({
          count: rows.length,
          km: rows.reduce((s, r) => s + (r.distance_km ?? 0), 0),
          kr: rows.reduce((s, r) => s + (r.cost_kr ?? 0), 0),
        });
      }
      setLoading(false);
    });
  }, [user, getRange]);

  // Load the next page and append to the existing list
  async function loadMore() {
    if (!user || loadingMore || !hasMore) return;
    const nextPage = pageIndex + 1;
    const { from, to } = getRange();
    setLoadingMore(true);
    const { data, error } = await supabase
      .from("trips")
      .select(LIST_SELECT)
      .eq("user_id", user.id)
      .is("superseded_by", null)
      .gte("started_at", from)
      .lte("started_at", to)
      .order("started_at", { ascending: false })
      .range(nextPage * PAGE_SIZE, (nextPage + 1) * PAGE_SIZE - 1);
    if (!error && data) {
      setTrips(prev => [...prev, ...(data as unknown) as TripRow[]]);
      setHasMore(data.length === PAGE_SIZE);
      setPageIndex(nextPage);
    }
    setLoadingMore(false);
  }

  return (
    <TripsTab
      trips={trips}
      loading={loading}
      loadingMore={loadingMore}
      hasMore={hasMore}
      onLoadMore={loadMore}
      periodTotals={periodTotals}
      period={period}
      onPeriodChange={(p) => { setPeriod(p); setCustomRange(null); }}
      onSelect={(trip) => navigate(`/personal/trips/${trip.id}`)}
      customTags={customTags}
      customRange={customRange}
      onCustomRangeChange={setCustomRange}
    />
  );
}
