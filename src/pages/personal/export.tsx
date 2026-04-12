// Export page — generate Skatteverket-ready körjournal export
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import { ExportTab, getPeriodStart, type TripRow, type Period } from "./_shared";

export function ExportPage() {
  const { user } = useAuth();

  const [period, setPeriod]   = useState<Period>("month");
  const [trips, setTrips]     = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const from = getPeriodStart(period).toISOString();
    supabase
      .from("trips")
      .select("id, started_at, ended_at, start_address, end_address, distance_km, energy_used_kwh, cost_kr, tag, notes")
      .eq("user_id", user.id)
      .is("superseded_by", null)
      .gte("started_at", from)
      .order("started_at", { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (!error && data) setTrips(data as TripRow[]);
        setLoading(false);
      });
  }, [user, period]);

  if (loading) return null;

  return (
    <ExportTab
      trips={trips}
      period={period}
      onPeriodChange={setPeriod}
    />
  );
}
