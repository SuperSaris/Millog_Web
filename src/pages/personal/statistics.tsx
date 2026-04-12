// Statistics page — period stats, monthly chart, tag breakdown
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import { StatisticsTab, getPeriodStart, type TripRow, type Period } from "./_shared";

export function StatisticsPage() {
  const { user } = useAuth();

  const [period, setPeriod] = useState<Period>("month");
  const [trips, setTrips]   = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const from = getPeriodStart(period).toISOString();
    supabase
      .from("trips")
      .select("id, started_at, ended_at, distance_km, energy_used_kwh, cost_kr, tag")
      .eq("user_id", user.id)
      .is("superseded_by", null)
      .gte("started_at", from)
      .order("started_at", { ascending: true })
      .limit(500)
      .then(({ data, error }) => {
        if (!error && data) setTrips(data as TripRow[]);
        setLoading(false);
      });
  }, [user, period]);

  return (
    <StatisticsTab
      trips={trips}
      loading={loading}
      period={period}
      onPeriodChange={setPeriod}
    />
  );
}
