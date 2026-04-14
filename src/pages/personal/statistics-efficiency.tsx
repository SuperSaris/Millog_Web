// Energieffektivitet detail page
// Route: /personal/statistics/efficiency?period=month|week|quarter|year|all
import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconArrowLeft,
  IconBolt,
  IconTemperature,
  IconTrendingUp,
  IconFlame,
  IconSnowflake,
} from "@tabler/icons-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import {
  aggregateStats,
  computeEfficiencyStats,
  computeWltpEfficiency,
  buildFuelComparison,
  statPeriodStartDate,
  type StatPeriod,
} from "@/lib/stats-calculations";
import type { TripRow } from "./_shared";

// Vehicle spec
type VehicleSpec = {
  id: string;
  battery_kwh_usable: number | null;
  battery_range_km_wltp: number | null;
};

const STATS_SELECT = [
  "id", "started_at", "ended_at",
  "distance_km", "energy_used_kwh", "cost_kr", "tag",
  "soc_start", "soc_end", "outside_temp_c",
  "source", "raw_drive_state",
].join(", ");

// Temperature bands
const TEMP_BANDS = [
  { label: "Under −10°",  min: -Infinity, max: -10, color: "#60a5fa" },
  { label: "−10 – 0°",   min: -10,       max: 0,   color: "#93c5fd" },
  { label: "0 – 10°",    min: 0,         max: 10,  color: "#6ee7b7" },
  { label: "10 – 20°",   min: 10,        max: 20,  color: "#34d399" },
  { label: "Över 20°",   min: 20,        max: Infinity, color: "#f97316" },
];

export function StatisticsEfficiencyPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const period = (searchParams.get("period") ?? "month") as StatPeriod;

  const [trips, setTrips] = useState<TripRow[]>([]);
  const [vehicle, setVehicle] = useState<VehicleSpec | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const from = statPeriodStartDate(period).toISOString();
    try {
      const [tripsRes, vehicleRes] = await Promise.all([
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
      ]);
      setTrips((tripsRes.data ?? []) as unknown as TripRow[]);
      setVehicle((vehicleRes.data as unknown as VehicleSpec | null) ?? null);
    } finally {
      setLoading(false);
    }
  }, [user, period]);

  useEffect(() => { loadData(); }, [loadData]);

  const wltpSpec = useMemo(() => computeWltpEfficiency(vehicle), [vehicle]);
  const effStats = useMemo(() => computeEfficiencyStats(trips, wltpSpec), [trips, wltpSpec]);
  const stats = useMemo(() => aggregateStats(trips, {
    milersattningPerKm: 0,
    fuel: buildFuelComparison(18.5, 7.5, 17.5, 6.5),
    period,
  }), [trips, period]);

  // Monthly efficiency trend
  const monthlyData = useMemo(() => {
    const byMonth = new Map<string, { label: string; kwh: number; count: number }>();
    for (const tr of trips) {
      if (!tr.energy_used_kwh || !tr.distance_km || tr.distance_km < 1) continue;
      const d = new Date(tr.started_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("sv-SE", { month: "short", year: "2-digit" });
      const ex = byMonth.get(key) ?? { label, kwh: 0, count: 0 };
      // accumulate sum of (kWh/100km) * count for weighted average
      ex.kwh += (tr.energy_used_kwh / tr.distance_km) * 100;
      ex.count += 1;
      byMonth.set(key, ex);
    }
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, { label, kwh, count }]) => ({
        label,
        kWh: count > 0 ? parseFloat((kwh / count).toFixed(2)) : 0,
      }));
  }, [trips]);

  // Temperature band stats
  const bandData = useMemo(() => {
    return TEMP_BANDS.map(band => {
      const bandTrips = trips.filter(tr => {
        const temp = tr.outside_temp_c;
        return temp != null && temp >= band.min && temp < band.max
          && tr.energy_used_kwh != null && tr.distance_km != null && tr.distance_km >= 1;
      });
      const totalKwh = bandTrips.reduce((s, tr) => s + ((tr.energy_used_kwh ?? 0) / (tr.distance_km ?? 1)) * 100, 0);
      const avgKwh = bandTrips.length > 0 ? totalKwh / bandTrips.length : null;
      const totalCost = bandTrips.reduce((s, tr) => s + (tr.cost_kr ?? 0), 0);
      const totalKm = bandTrips.reduce((s, tr) => s + (tr.distance_km ?? 0), 0);
      const avgCostPer100 = totalKm > 0 ? (totalCost / totalKm) * 100 : null;
      return {
        label: band.label,
        color: band.color,
        count: bandTrips.length,
        avgKwh,
        avgCostPer100,
      };
    });
  }, [trips]);

  // Pie data for band distribution by count
  const pieData = useMemo(() =>
    bandData.filter(b => b.count > 0).map(b => ({ name: b.label, value: b.count, color: b.color })),
    [bandData]);

  const tripsWithTemp = trips.filter(tr => tr.outside_temp_c != null).length;

  const effColor = effStats
    ? effStats.vsSpec <= 0 ? "#10b981"
    : effStats.vsSpec <= effStats.wltpSpec * 0.2 ? "#f59e0b"
    : "#ef4444"
    : undefined;

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/personal/statistics")}>
          <IconArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">{t("personal.efficiencyTitle")}</h1>
          <p className="text-xs text-muted-foreground">{t("personal.efficiencySubtitle")}</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-xl" />
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
          </div>
        </div>
      ) : !effStats ? (
        <Card>
          <CardContent className="py-10 text-center">
            <IconBolt className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{t("personal.efficiencyNoData")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Hero */}
          <Card>
            <CardContent className="pt-5 pb-4">
              <div className="flex flex-wrap items-center gap-6">
                {/* Main number */}
                <div className="text-center">
                  <p className="text-4xl font-bold tabular-nums" style={{ color: effColor }}>
                    {effStats.avgKwhPer100.toFixed(1)}
                  </p>
                  <p className="text-sm text-muted-foreground">{t("personal.efficiencyAvg")}</p>
                </div>
                <div className="h-12 w-px bg-border hidden sm:block" />
                {/* WLTP */}
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums text-muted-foreground">
                    {effStats.wltpSpec.toFixed(1)}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("personal.efficiencyWltp")}</p>
                </div>
                <div className="h-12 w-px bg-border hidden sm:block" />
                {/* vs WLTP */}
                <div className="text-center">
                  <p className="text-2xl font-bold tabular-nums" style={{ color: effStats.vsSpec <= 0 ? "#10b981" : "#f59e0b" }}>
                    {effStats.vsSpec <= 0 ? "−" : "+"}{Math.abs(effStats.vsSpec).toFixed(1)}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("personal.efficiencyVsWltp")}</p>
                </div>
                <div className="h-12 w-px bg-border hidden sm:block" />
                {/* Bäst/Sämst */}
                <div className="flex gap-4">
                  <div className="text-center">
                    <p className="text-lg font-bold tabular-nums text-emerald-500">{effStats.bestKwhPer100.toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground">{t("personal.efficiencyBest")}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-lg font-bold tabular-nums text-red-500">{effStats.worstKwhPer100.toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground">{t("personal.efficiencyWorst")}</p>
                  </div>
                </div>
                <div className="h-12 w-px bg-border hidden sm:block" />
                {/* Cost */}
                {effStats.avgCostPerKm != null && (
                  <div className="text-center">
                    <p className="text-2xl font-bold tabular-nums">{effStats.avgCostPerKm.toFixed(2)}</p>
                    <p className="text-xs text-muted-foreground">{t("personal.efficiencyCostPerKm")}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Monthly efficiency trend */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <IconTrendingUp className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-semibold">{t("personal.efficiencyMonthlyChart")}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {monthlyData.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">{t("personal.efficiencyNoChartData")}</p>
                ) : (
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={monthlyData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} domain={["auto", "auto"]} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-sm">
                              <p className="font-medium">{label}</p>
                              <p className="text-muted-foreground">{payload[0]?.value} kWh/100km</p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="kWh" radius={[3, 3, 0, 0]} maxBarSize={40}>
                        {monthlyData.map((entry, idx) => (
                          <Cell
                            key={idx}
                            fill={
                              wltpSpec && entry.kWh <= wltpSpec ? "#10b981" :
                              wltpSpec && entry.kWh <= wltpSpec * 1.2 ? "#f59e0b" :
                              "#ef4444"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
                <div className="flex items-center gap-4 mt-1 justify-center">
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" /> {t("personal.efficiencyLegendBelow")}</span>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><span className="inline-block w-2 h-2 rounded-sm bg-amber-500" /> {t("personal.efficiencyLegendNear")}</span>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><span className="inline-block w-2 h-2 rounded-sm bg-red-500" /> {t("personal.efficiencyLegendAbove")}</span>
                </div>
              </CardContent>
            </Card>

            {/* Temperature distribution */}
            {tripsWithTemp > 0 ? (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <IconTemperature className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-semibold">{t("personal.efficiencyTempPie")}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  {pieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={68}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {pieData.map((entry, idx) => (
                            <Cell key={idx} fill={entry.color} />
                          ))}
                        </Pie>
                        <Legend
                          wrapperStyle={{ fontSize: 11 }}
                          formatter={(value) => <span className="text-[11px]">{value}</span>}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            return (
                              <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-sm">
                                <p className="font-medium">{payload[0]?.name}</p>
                                <p className="text-muted-foreground">{payload[0]?.value} {t("personal.efficiencyTripsUnit")}</p>
                              </div>
                            );
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="text-xs text-muted-foreground py-4 text-center">{t("personal.efficiencyNoPieData")}</p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <IconTemperature className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-semibold">{t("personal.efficiencyTempZones")}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 pb-4">
                  <p className="text-xs text-muted-foreground">{t("personal.efficiencyTempNoData")}</p>
                </CardContent>
              </Card>
            )}

            {/* Efficiency per temperature band — full width */}
            {tripsWithTemp > 0 && (
              <Card className="md:col-span-2">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <IconFlame className="h-4 w-4 text-muted-foreground" />
                    <CardTitle className="text-sm font-semibold">{t("personal.efficiencyBandTable")}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {bandData.map(band => (
                      <div key={band.label} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: band.color }} />
                          <span className="text-xs text-muted-foreground truncate">{band.label}</span>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <span className="text-xs text-muted-foreground">{band.count} {t("personal.efficiencyTripsUnit")}</span>
                          <span className="text-xs font-semibold tabular-nums w-28 text-right">
                            {band.avgKwh != null ? `${band.avgKwh.toFixed(1)} kWh/100km` : "—"}
                          </span>
                          <span className="text-xs text-muted-foreground tabular-nums w-20 text-right">
                            {band.avgCostPer100 != null ? `${band.avgCostPer100.toFixed(0)} kr/100km` : ""}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Insight */}
                  {(() => {
                    const cold = bandData.find(b => b.label === "Under −10°");
                    const warm = bandData.find(b => b.label === "Över 20°");
                    if (cold?.avgKwh && warm?.avgKwh && cold.count > 0 && warm.count > 0) {
                      const delta = cold.avgKwh - warm.avgKwh;
                      return (
                        <div className="mt-3 rounded-lg bg-blue-500/10 px-3 py-2">
                          <div className="flex items-center gap-2">
                            <IconSnowflake className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                            <p className="text-xs text-blue-400">
                              {t("personal.efficiencyBandColdInsight", { delta: delta.toFixed(1), pct: ((delta / warm.avgKwh) * 100).toFixed(0) })}
                            </p>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </CardContent>
              </Card>
            )}

            {/* Summary table */}
            <Card className={tripsWithTemp > 0 ? "" : "md:col-span-2"}>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <IconBolt className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-semibold">{t("personal.efficiencySummary")}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-1.5">
                {[
                  { label: t("personal.efficiencyTripsWithData"), value: `${effStats.tripCount}` },
                  { label: t("personal.efficiencyTotalEnergy"), value: stats.totalKwh > 0 ? `${stats.totalKwh.toFixed(1)} kWh` : "—" },
                  { label: t("personal.efficiencyTotalKm"), value: `${Math.round(stats.totalKm).toLocaleString("sv-SE")} km` },
                  { label: t("personal.efficiencyWltpSpec"), value: `${effStats.wltpSpec.toFixed(1)} kWh/100km` },
                  { label: t("personal.efficiencyAvgSocDelta"), value: effStats.avgSocDelta != null ? `${effStats.avgSocDelta.toFixed(1)}%` : "—" },
                  { label: t("personal.efficiencyCostPerKm"), value: effStats.avgCostPerKm != null ? `${effStats.avgCostPerKm.toFixed(2)} kr` : "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <span className="text-xs font-semibold tabular-nums">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
