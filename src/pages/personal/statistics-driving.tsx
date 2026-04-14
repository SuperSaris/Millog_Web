// Körmönster detail page
// Route: /personal/statistics/driving?period=month|week|quarter|year|all
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
  IconClock,
  IconRoute,
  IconCalendar,
} from "@tabler/icons-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import {
  aggregateStats,
  buildFuelComparison,
  statPeriodStartDate,
  type StatPeriod,
} from "@/lib/stats-calculations";
import type { TripRow } from "./_shared";

const STATS_SELECT = [
  "id", "started_at", "ended_at",
  "distance_km", "energy_used_kwh", "cost_kr", "tag",
  "soc_start", "soc_end", "outside_temp_c",
  "source", "raw_drive_state",
].join(", ");

// Distance buckets — labels are resolved via t() at render time, not here
const DISTANCE_BUCKET_RANGES = [
  { min: 0,   max: 10,       color: "#60a5fa", key: "drivingDistUnder10" },
  { min: 10,  max: 50,       color: "#34d399", key: "drivingDist10to50"  },
  { min: 50,  max: 100,      color: "#f59e0b", key: "drivingDist50to100" },
  { min: 100, max: Infinity, color: "#a78bfa", key: "drivingDistOver100" },
] as const;

export function StatisticsDrivingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const period = (searchParams.get("period") ?? "month") as StatPeriod;

  const [trips, setTrips] = useState<TripRow[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const from = statPeriodStartDate(period).toISOString();
    try {
      const tripsRes = await supabase
        .from("trips")
        .select(STATS_SELECT)
        .eq("user_id", user.id)
        .is("superseded_by", null)
        .not("ended_at", "is", null)
        .gte("started_at", from)
        .order("started_at", { ascending: true })
        .limit(1000);
      setTrips((tripsRes.data ?? []) as unknown as TripRow[]);
    } finally {
      setLoading(false);
    }
  }, [user, period]);

  useEffect(() => { loadData(); }, [loadData]);

  const stats = useMemo(() => aggregateStats(trips, {
    milersattningPerKm: 0,
    fuel: buildFuelComparison(18.5, 7.5, 17.5, 6.5),
    period,
  }), [trips, period]);

  // Drive style (resolved from t() keys)
  const driveStyleBadge = stats.avgSpeedKmh > 70
    ? { label: t("personal.drivingStyleHighway"), color: "#EF5350" }
    : stats.avgSpeedKmh > 45
    ? { label: t("personal.drivingStyleMixed"), color: "#FF9800" }
    : { label: t("personal.drivingStyleCity"), color: "#42A5F5" };

  // Time-of-day buckets — labels via t()
  const timeOfDayData = useMemo(() => {
    const buckets = [
      { labelKey: "drivingMorning" as const, hours: [5,6,7,8],              color: "#FF9800" },
      { labelKey: "drivingDay"    as const, hours: [9,10,11,12,13,14,15],  color: "#42A5F5" },
      { labelKey: "drivingEvening" as const, hours: [16,17,18,19,20],      color: "#AB47BC" },
      { labelKey: "drivingNight"  as const, hours: [21,22,23,0,1,2,3,4],  color: "#78909C" },
    ];
    return buckets.map(b => ({
      label: t(`personal.${b.labelKey}`),
      color: b.color,
      count: trips.filter(tr => b.hours.includes(new Date(tr.started_at).getHours())).length,
    }));
  }, [trips, t]);

  // Day-of-week distribution — Mon-first, labels via t()
  const dayOfWeekData = useMemo(() => {
    const counts = Array(7).fill(0) as number[];
    for (const tr of trips) {
      const idx = (new Date(tr.started_at).getDay() + 6) % 7;
      counts[idx] = (counts[idx] ?? 0) + 1;
    }
    // Short day names: Mon–Sun in locale
    const dayLabels = Array.from({ length: 7 }, (_, i) => {
      // Anchor: 2024-01-01 is a Monday (getDay()=1), so offset i to reach Mon=0..Sun=6
      const d = new Date(2024, 0, 1 + i);
      return d.toLocaleDateString(undefined, { weekday: "short" });
    });
    return dayLabels.map((label, i) => ({
      label,
      count: counts[i] ?? 0,
      isWeekend: i >= 5,
    }));
  }, [trips]);

  // Distance distribution — labels via t()
  const distData = useMemo(() => {
    const total = trips.length;
    return DISTANCE_BUCKET_RANGES.map(b => {
      const bucketTrips = trips.filter(tr =>
        (tr.distance_km ?? 0) >= b.min && (tr.distance_km ?? 0) < b.max
      );
      const avgDist = bucketTrips.length > 0
        ? bucketTrips.reduce((s, tr) => s + (tr.distance_km ?? 0), 0) / bucketTrips.length
        : 0;
      const totalKm = bucketTrips.reduce((s, tr) => s + (tr.distance_km ?? 0), 0);
      return {
        label: t(`personal.${b.key}`),
        color: b.color,
        count: bucketTrips.length,
        pct: total > 0 ? bucketTrips.length / total : 0,
        avgDist,
        totalKm,
      };
    });
  }, [trips, t]);

  return (
    <div className="space-y-5 p-4 sm:p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/personal/statistics")}>
          <IconArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">{t("personal.drivingTitle")}</h1>
          <p className="text-xs text-muted-foreground">{t("personal.drivingSubtitle")}</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-20 rounded-xl" />
          <div className="grid gap-4 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
          </div>
        </div>
      ) : trips.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <IconRoute className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">{t("personal.drivingNoData")}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Hero — 4 stats + drive style */}
          <Card>
            <CardContent className="pt-4 pb-4">
              <div className="flex flex-wrap items-center gap-4 mb-3">
                {[
                  { label: t("personal.drivingKmPerTrip"),  value: stats.tripCount > 0 ? `${stats.avgTripKm.toFixed(0)} km` : "—" },
                  { label: t("personal.drivingLongest"),     value: stats.longestTripKm > 0 ? `${Math.round(stats.longestTripKm)} km` : "—" },
                  { label: t("personal.drivingTotalTime"),   value: stats.totalDriveMin > 0 ? (stats.totalDriveMin >= 60 ? `${Math.floor(stats.totalDriveMin / 60)}h ${stats.totalDriveMin % 60}m` : `${stats.totalDriveMin} min`) : "—" },
                  { label: t("personal.drivingKmPerDay"),    value: stats.periodDays > 0 ? `${(stats.totalKm / stats.periodDays).toFixed(1)} km` : "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="flex-1 min-w-22.5 rounded-lg bg-muted/50 px-3 py-2 text-center">
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                    <p className="text-base font-bold tabular-nums mt-0.5">{value}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{t("personal.drivingStyle")}:</span>
                <span
                  className="text-xs px-2.5 py-0.5 rounded-full font-semibold"
                  style={{ background: driveStyleBadge.color + "22", color: driveStyleBadge.color }}
                >
                  {driveStyleBadge.label}
                </span>
                {stats.avgSpeedKmh > 0 && (
                  <span className="text-xs text-muted-foreground">· {t("personal.drivingAvgSpeed", { speed: stats.avgSpeedKmh.toFixed(0) })}</span>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            {/* Time-of-day */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <IconClock className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-semibold">{t("personal.drivingTimeOfDay")}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={timeOfDayData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-sm">
                            <p className="font-medium">{label}</p>
                            <p className="text-muted-foreground">{payload[0]?.value} resor</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={56}>
                      {timeOfDayData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Day-of-week */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <IconCalendar className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-semibold">{t("personal.drivingDayOfWeek")}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={dayOfWeekData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-sm">
                            <p className="font-medium">{label}</p>
                            <p className="text-muted-foreground">{payload[0]?.value} resor</p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
                      {dayOfWeekData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.isWeekend ? "#a78bfa" : "#60a5fa"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-4 mt-1 justify-center">
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span className="inline-block w-2 h-2 rounded-sm bg-blue-400" /> {t("personal.drivingLegendWeekday")}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <span className="inline-block w-2 h-2 rounded-sm bg-violet-400" /> {t("personal.drivingLegendWeekend")}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Distance distribution — full width */}
            <Card className="md:col-span-2">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <IconRoute className="h-4 w-4 text-muted-foreground" />
                  <CardTitle className="text-sm font-semibold">{t("personal.drivingDistribution")}</CardTitle>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid md:grid-cols-2 gap-4">
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={distData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div className="rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-sm">
                              <p className="font-medium">{label}</p>
                              <p className="text-muted-foreground">{payload[0]?.value} resor</p>
                            </div>
                          );
                        }}
                      />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={56}>
                        {distData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>

                  {/* Detail rows */}
                  <div className="space-y-2.5">
                    {distData.map(b => (
                      <div key={b.label} className="space-y-0.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: b.color }} />
                            {b.label}
                          </span>
                          <span className="font-semibold tabular-nums">
                            {b.count} resor
                            {b.count > 0 && <span className="text-muted-foreground font-normal ml-1">({(b.pct * 100).toFixed(0)}%)</span>}
                          </span>
                        </div>
                        {b.count > 0 && (
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${b.pct * 100}%`, background: b.color }}
                            />
                          </div>
                        )}
                        {b.count > 0 && (
                          <p className="text-[11px] text-muted-foreground">
                            snitt {b.avgDist.toFixed(0)} km · totalt {Math.round(b.totalKm).toLocaleString("sv-SE")} km
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
