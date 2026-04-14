// Statistics page — full stats with scalable multi-OEM data model
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import { StatisticsTab, type TripRow, type CustomTag, type CustomRange } from "./_shared";
import {
  type StatPeriod,
  type ChargingSessionRow,
  statPeriodStartDate,
} from "@/lib/stats-calculations";

// Vehicle spec shape — used for WLTP efficiency. Intentionally minimal so
// it works for any BEV OEM (Tesla, Polestar, Volvo, BMW etc.) as long as
// the onboarding flow writes battery_kwh_usable + battery_range_km_wltp.
type VehicleSpec = {
  id: string;
  battery_kwh_usable: number | null;
  battery_range_km_wltp: number | null;
};

// Select all columns StatisticsTab needs. Keep this list in sync with TripRow.
const STATS_SELECT = [
  "id", "started_at", "ended_at",
  "distance_km", "energy_used_kwh", "cost_kr", "tag",
  "soc_start", "soc_end", "outside_temp_c",
  "source", "raw_drive_state",
].join(", ");

export function StatisticsPage() {
  const { user } = useAuth();

  const [period, setPeriod]           = useState<StatPeriod>("month");
  const [customRange, setCustomRange] = useState<CustomRange | null>(null);
  const [trips, setTrips]             = useState<TripRow[]>([]);
  const [chargingSessions, setChargingSessions] = useState<ChargingSessionRow[]>([]);
  const [customTags, setCustomTags]   = useState<CustomTag[]>([]);
  const [vehicle, setVehicle]         = useState<VehicleSpec | null>(null);
  const [loading, setLoading]         = useState(true);

  // Stable reload function — called whenever period or custom range changes.
  // Architecture note: single parallel Promise.all so one slow query never
  // blocks others. Designed to scale: adding a new OEM just means a different
  // bridge writes the same `trips` columns — no query changes needed here.
  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const from = statPeriodStartDate(
      period,
      customRange?.from,
    ).toISOString();

    const toDate = customRange?.to
      ? new Date(customRange.to.getFullYear(), customRange.to.getMonth(), customRange.to.getDate(), 23, 59, 59)
      : null;

    try {
      const [tripsRes, vehicleRes, customTagsRes, chargingRes] = await Promise.all([
        supabase
          .from("trips")
          .select(STATS_SELECT)
          .eq("user_id", user.id)
          .is("superseded_by", null)
          .not("ended_at", "is", null)
          .gte("started_at", from)
          .order("started_at", { ascending: true })
          .limit(1000),

        supabase
          .from("vehicles")
          .select("id, battery_kwh_usable, battery_range_km_wltp")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle(),

        supabase
          .from("trip_custom_tags")
          .select("id, name, color, is_work_tag")
          .eq("user_id", user.id),

        supabase
          .from("charging_sessions")
          .select("energy_added_kwh, cost_kr, is_home, charger_type, start_battery_pct, end_battery_pct, started_at")
          .eq("user_id", user.id)
          .gte("started_at", from),
      ]);

      // Apply custom range upper bound client-side (avoids extra index scan)
      let tripData = (tripsRes.data ?? []) as unknown as TripRow[];
      if (toDate) {
        const toTime = toDate.getTime();
        tripData = tripData.filter(t => new Date(t.started_at).getTime() <= toTime);
      }

      setTrips(tripData);
      setVehicle((vehicleRes.data as VehicleSpec | null) ?? null);
      setCustomTags((customTagsRes.data ?? []) as CustomTag[]);
      setChargingSessions((chargingRes.data ?? []) as ChargingSessionRow[]);
    } finally {
      setLoading(false);
    }
  }, [user, period, customRange]);

  useEffect(() => { loadData(); }, [loadData]);

  return (
    <StatisticsTab
      trips={trips}
      chargingSessions={chargingSessions}
      customTags={customTags}
      vehicle={vehicle}
      loading={loading}
      period={period}
      customRange={customRange}
      onPeriodChange={setPeriod}
      onCustomRangeChange={setCustomRange}
    />
  );
}
