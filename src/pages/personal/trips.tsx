// Trips page — full trip list with period filter, tag filter, day groups
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import {
  TripsTab,
  getPeriodStart,
  type TripRow,
  type Period,
} from "./_shared";

export function TripsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [period, setPeriod] = useState<Period>("month");
  const [trips, setTrips]   = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const from = getPeriodStart(period).toISOString();
    supabase
      .from("trips")
      .select("id, started_at, ended_at, start_address, end_address, start_lat, start_lng, end_lat, end_lng, distance_km, energy_used_kwh, cost_kr, tag, soc_start, soc_end, outside_temp_c, notes, raw_drive_state")
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

  return (
    <TripsTab
      trips={trips}
      loading={loading}
      period={period}
      onPeriodChange={setPeriod}
      onSelect={(trip) => navigate(`/personal/trips/${trip.id}`)}
    />
  );
}
