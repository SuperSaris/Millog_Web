// DashboardPage — fleet overview: fleet KPIs, quick actions, driver table, vehicle grid, alerts

import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth-context";
import { useOrg } from "@/contexts/org-context";
import { supabase } from "@/lib/supabase";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction, CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  IconRoute, IconBolt, IconTag, IconCar, IconUsers,
  IconTrendingUp, IconArrowNarrowRight, IconCircleCheck, IconAlertTriangle,
  IconChevronRight, IconUserPlus, IconFileText, IconBattery,
} from "@tabler/icons-react";

// ── Types ─────────────────────────────────────────────────────
type DriverStat = {
  user_id: string;
  full_name: string | null;
  email: string;
  role: string;
  km_this_month: number;
  trip_count: number;
  untagged_count: number;
  last_trip_at: string | null;
};

type OrgVehicle = {
  ov_id: string;
  vehicle_id: string;
  display_label: string | null;
  model: string | null;
  vin: string | null;
  soc: number | null;
  charge_state: string | null;
  last_seen: string | null;
  battery_kwh_usable: number | null;
  telemetry_enabled: boolean;
};

type FleetTrip = {
  id: string;
  started_at: string;
  ended_at: string | null;
  start_address: string | null;
  end_address: string | null;
  distance_km: number | null;
  tag: string | null;
  user_id: string;
  driver_name: string;
};

// ── Formatters ────────────────────────────────────────────────
function fmtDaysAgo(iso: string | null): string {
  if (!iso) return "—";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (diff === 0) return "Idag";
  if (diff === 1) return "Igår";
  return `${diff} dagar sedan`;
}
function signalNum(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "object" && value !== null) {
    const v = (value as Record<string, unknown>)["value"];
    if (typeof v === "number") return v;
  }
  return null;
}
function signalStr(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) {
    const v = (value as Record<string, unknown>)["value"];
    if (typeof v === "string") return v;
  }
  return null;
}

// ── Battery ring ──────────────────────────────────────────────
function BatteryRingSmall({ pct, color }: { pct: number; color: string }) {
  const R = 18;
  const C = 2 * Math.PI * R;
  const offset = C - (pct / 100) * C;
  return (
    <svg width="44" height="44" viewBox="0 0 44 44">
      <circle cx="22" cy="22" r={R} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="5" />
      <circle
        cx="22" cy="22" r={R} fill="none" stroke={color} strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={`${C.toFixed(2)} ${C.toFixed(2)}`}
        strokeDashoffset={offset.toFixed(2)}
        style={{ transform: "rotate(-90deg)", transformOrigin: "22px 22px" }}
      />
      <text x="22" y="26" textAnchor="middle" fill="currentColor" fontSize="10" fontWeight="700">{pct}%</text>
    </svg>
  );
}

const TAG_STYLES: Record<string, { pill: string; dot: string }> = {
  work:     { pill: "bg-blue-50 text-blue-700 border-blue-200",          dot: "bg-blue-500"    },
  commute:  { pill: "bg-amber-50 text-amber-700 border-amber-200",       dot: "bg-amber-500"   },
  personal: { pill: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  untagged: { pill: "bg-gray-100 text-gray-500 border-gray-200",         dot: "bg-gray-400"    },
};

// ── Quick Actions Bar ─────────────────────────────────────────
function QuickActionsBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const actions = [
    {
      label: t("dashboard.qaInviteDriver"),
      icon: <IconUserPlus className="size-4" />,
      color: "bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200",
      onClick: () => navigate("/dashboard/drivers"),
    },
    {
      label: t("dashboard.qaAddVehicle"),
      icon: <IconCar className="size-4" />,
      color: "bg-violet-50 hover:bg-violet-100 text-violet-700 border-violet-200",
      onClick: () => navigate("/dashboard/vehicles/import"),
    },
    {
      label: t("dashboard.qaCompliance"),
      icon: <IconTag className="size-4" />,
      color: "bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200",
      onClick: () => navigate("/dashboard/compliance"),
    },
    {
      label: t("dashboard.qaReport"),
      icon: <IconFileText className="size-4" />,
      color: "bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200",
      onClick: () => navigate("/dashboard/reports"),
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {actions.map((a) => (
        <button
          key={a.label}
          onClick={a.onClick}
          className={`flex items-center gap-2.5 rounded-xl border px-4 py-3 text-sm font-medium transition-colors cursor-pointer ${a.color}`}
        >
          {a.icon}
          {a.label}
        </button>
      ))}
    </div>
  );
}

// ── Fleet KPI Cards ───────────────────────────────────────────
function FleetKpiCards({
  driverCount,
  vehicleCount,
  fleetKm,
  tripCount,
  untaggedCount,
  loading,
}: {
  driverCount: number;
  vehicleCount: number;
  fleetKm: number;
  tripCount: number;
  untaggedCount: number;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const compliancePct = tripCount > 0 ? Math.round(((tripCount - untaggedCount) / tripCount) * 100) : 100;

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
      </div>
    );
  }

  const cards = [
    {
      desc: t("dashboard.activeDrivers"),
      value: driverCount.toString(),
      sub: t("nav.drivers"),
      icon: <IconUsers className="size-4" />,
      color: "#3b82f6",
    },
    {
      desc: t("dashboard.totalVehicles"),
      value: vehicleCount.toString(),
      sub: t("nav.vehicles"),
      icon: <IconCar className="size-4" />,
      color: "#8b5cf6",
    },
    {
      desc: t("dashboard.fleetKm"),
      value: tripCount === 0 ? "0 km" : `${Math.round(fleetKm).toLocaleString("sv-SE")} km`,
      sub: t("dashboard.fleetKmSub"),
      icon: <IconRoute className="size-4" />,
      color: "#f59e0b",
    },
    {
      desc: t("dashboard.complianceRate"),
      value: `${compliancePct}%`,
      sub: t("dashboard.complianceRateSub"),
      icon: compliancePct === 100
        ? <IconCircleCheck className="size-4" />
        : <IconAlertTriangle className="size-4" />,
      color: compliancePct === 100 ? "#22c55e" : compliancePct >= 80 ? "#f59e0b" : "#ef4444",
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.desc} className="@container/card">
          <CardHeader>
            <CardDescription>{c.desc}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[200px]/card:text-3xl">
              {c.value}
            </CardTitle>
            <CardAction>
              <div className="rounded-lg p-1.5" style={{ backgroundColor: c.color + "18" }}>
                <span style={{ color: c.color }}>{c.icon}</span>
              </div>
            </CardAction>
          </CardHeader>
          <CardFooter className="flex-col items-start gap-1 text-sm">
            <div className="text-muted-foreground">{c.sub}</div>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}

// ── Fleet Activity Chart ──────────────────────────────────────
const chartConfig: ChartConfig = { km: { label: "km", color: "#3b82f6" } };

function FleetActivityChart({ trips, loading }: { trips: FleetTrip[]; loading: boolean }) {
  const { t } = useTranslation();

  const chartData = useMemo(() => {
    const byDay = new Map<string, number>();
    const now = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      byDay.set(d.toISOString().slice(0, 10), 0);
    }
    for (const tr of trips) {
      const key = tr.started_at.slice(0, 10);
      if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + (tr.distance_km ?? 0));
    }
    return Array.from(byDay.entries()).map(([date, km]) => ({
      date,
      label: new Date(date + "T12:00").toLocaleDateString("sv-SE", { day: "numeric", month: "short" }),
      km: Math.round(km),
    }));
  }, [trips]);

  const totalKm = useMemo(() => trips.reduce((s, tr) => s + (tr.distance_km ?? 0), 0), [trips]);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardDescription>{t("dashboard.activityChart")}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {Math.round(totalKm).toLocaleString("sv-SE")} km
            </CardTitle>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <IconTrendingUp className="size-3.5" />
            {t("dashboard.activityChartSub")}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-2 sm:px-6">
        {loading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : (
          <ChartContainer config={chartConfig} className="h-40 w-full">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="kmGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={4} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
              <ChartTooltip content={<ChartTooltipContent indicator="line" />} cursor={{ stroke: "rgba(0,0,0,0.08)", strokeWidth: 28 }} />
              <Area dataKey="km" stroke="#3b82f6" strokeWidth={2} fill="url(#kmGradient)" dot={false} activeDot={{ r: 4, fill: "#3b82f6" }} />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ── Alerts Panel ──────────────────────────────────────────────
function AlertsPanel({
  drivers,
  vehicles,
  loading,
}: {
  drivers: DriverStat[];
  vehicles: OrgVehicle[];
  loading: boolean;
}) {
  const { t } = useTranslation();

  const alerts = useMemo(() => {
    const items: { type: "warning" | "info"; message: string }[] = [];
    for (const d of drivers) {
      if (d.untagged_count > 5) {
        items.push({ type: "warning", message: t("dashboard.alertUntaggedDriver", { name: d.full_name || d.email.split("@")[0], count: d.untagged_count }) });
      }
    }
    for (const v of vehicles) {
      if (v.soc != null && v.soc < 20) {
        items.push({ type: "warning", message: t("dashboard.alertLowBattery", { name: v.display_label || v.model || "Fordon", pct: v.soc }) });
      }
    }
    for (const v of vehicles) {
      if (v.telemetry_enabled && !v.last_seen) {
        items.push({ type: "info", message: t("dashboard.alertNoTelemetry", { name: v.display_label || v.model || "Fordon" }) });
      }
    }
    return items;
  }, [drivers, vehicles, t]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t("dashboard.alertsTitle")}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => <Skeleton key={i} className="h-10 rounded-lg" />)}
          </div>
        ) : alerts.length === 0 ? (
          <div className="flex items-center gap-2.5 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
            <IconCircleCheck className="size-4 text-emerald-600 shrink-0" />
            <span className="text-sm text-emerald-700 font-medium">{t("dashboard.allGood")}</span>
          </div>
        ) : (
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <div key={i} className={`flex items-start gap-2.5 rounded-xl border px-4 py-3 ${a.type === "warning" ? "bg-amber-50 border-amber-200" : "bg-blue-50 border-blue-200"}`}>
                <IconAlertTriangle className={`size-4 shrink-0 mt-0.5 ${a.type === "warning" ? "text-amber-600" : "text-blue-600"}`} />
                <span className={`text-sm font-medium ${a.type === "warning" ? "text-amber-700" : "text-blue-700"}`}>{a.message}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Driver Table ──────────────────────────────────────────────
function DriverTable({ drivers, loading }: { drivers: DriverStat[]; loading: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{t("dashboard.driverTableTitle")}</CardTitle>
            <CardDescription>{t("dashboard.driverTableDesc")}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => navigate("/dashboard/drivers")}>
            {t("dashboard.seeAll")} <IconChevronRight className="size-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{[1,2,3].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>
        ) : drivers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <IconUsers className="size-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">{t("dashboard.noDriverStats")}</p>
            <Button size="sm" variant="outline" onClick={() => navigate("/dashboard/drivers")} className="mt-2">
              <IconUserPlus className="size-4 mr-1.5" />{t("dashboard.qaInviteDriver")}
            </Button>
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead>{t("dashboard.colDriver")}</TableHead>
                  <TableHead className="text-right">{t("dashboard.colKm")}</TableHead>
                  <TableHead className="text-right">{t("dashboard.colTrips")}</TableHead>
                  <TableHead className="text-right hidden sm:table-cell">{t("dashboard.colUntagged")}</TableHead>
                  <TableHead className="text-right hidden md:table-cell">{t("dashboard.colLastTrip")}</TableHead>
                  <TableHead className="text-right">{t("dashboard.colCompliance")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drivers.map((d) => {
                  const pct = d.trip_count > 0 ? Math.round(((d.trip_count - d.untagged_count) / d.trip_count) * 100) : 100;
                  const compColor = pct === 100 ? "text-emerald-600" : pct >= 80 ? "text-amber-600" : "text-rose-600";
                  return (
                    <TableRow key={d.user_id} className="cursor-pointer hover:bg-muted/30" onClick={() => navigate(`/dashboard/drivers/${d.user_id}`)}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="text-xs font-semibold text-primary">{(d.full_name || d.email).charAt(0).toUpperCase()}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate max-w-36">{d.full_name || d.email.split("@")[0]}</p>
                            <p className="text-xs text-muted-foreground truncate max-w-36">{d.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-sm font-medium">{Math.round(d.km_this_month).toLocaleString("sv-SE")}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm text-muted-foreground">{d.trip_count}</TableCell>
                      <TableCell className="text-right tabular-nums text-sm hidden sm:table-cell">
                        {d.untagged_count > 0 ? <span className="text-amber-600 font-medium">{d.untagged_count}</span> : <span className="text-muted-foreground">0</span>}
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground hidden md:table-cell">{fmtDaysAgo(d.last_trip_at)}</TableCell>
                      <TableCell className="text-right">
                        <span className={`text-sm font-semibold tabular-nums ${compColor}`}>{pct}%</span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Vehicle Grid ──────────────────────────────────────────────
function VehicleGrid({ vehicles, loading }: { vehicles: OrgVehicle[]; loading: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{t("dashboard.vehicleGridTitle")}</CardTitle>
            <CardDescription>{t("dashboard.vehicleGridDesc")}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => navigate("/dashboard/vehicles")}>
            {t("dashboard.seeAll")} <IconChevronRight className="size-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{[1,2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : vehicles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <IconCar className="size-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">{t("dashboard.noVehicleData")}</p>
            <Button size="sm" variant="outline" onClick={() => navigate("/dashboard/vehicles/import")} className="mt-2">
              <IconCar className="size-4 mr-1.5" />{t("dashboard.qaAddVehicle")}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {vehicles.map((v) => {
              const battColor = v.soc == null ? "#9ca3af" : v.soc >= 70 ? "#22c55e" : v.soc >= 40 ? "#f59e0b" : "#ef4444";
              const isCharging = v.charge_state?.toLowerCase().includes("charging") && !v.charge_state?.toLowerCase().includes("complete");
              const stateLabel = isCharging ? t("dashboard.charging")
                : v.charge_state?.toLowerCase().includes("complete") ? t("dashboard.charged")
                : t("dashboard.parked");
              return (
                <div key={v.ov_id} className="flex items-center gap-3 rounded-xl border px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => navigate("/dashboard/vehicles")}>
                  {v.soc != null ? (
                    <BatteryRingSmall pct={v.soc} color={battColor} />
                  ) : (
                    <div className="w-11 h-11 rounded-full border-[5px] border-muted flex items-center justify-center shrink-0">
                      <IconBattery className="size-4 text-muted-foreground/40" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{v.display_label || v.model || "Tesla"}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {v.vin ? `…${v.vin.slice(-6)}` : ""}{v.vin && v.battery_kwh_usable ? " · " : ""}{v.battery_kwh_usable ? `${v.battery_kwh_usable} kWh` : ""}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <Badge variant="outline" className={`text-xs ${isCharging ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
                      {isCharging && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />}
                      {stateLabel}
                    </Badge>
                    {v.telemetry_enabled && (
                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">{t("vehicles.telemetryActive")}</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Recent Fleet Trips ─────────────────────────────────────────
function RecentFleetTrips({ trips, loading }: { trips: FleetTrip[]; loading: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{t("dashboard.fleetRecentTrips")}</CardTitle>
            <CardDescription>{t("dashboard.fleetRecentTripsDesc")}</CardDescription>
          </div>
          <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => navigate("/dashboard/compliance")}>
            {t("dashboard.seeAll")} <IconChevronRight className="size-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
        ) : trips.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">{t("dashboard.noTrips")}</div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            {trips.map((trip, idx) => {
              const tag = trip.tag ?? "untagged";
              const ts = (TAG_STYLES[tag as keyof typeof TAG_STYLES] ?? TAG_STYLES.untagged)!;
              const tagLabels: Record<string, string> = {
                work: t("personal.tagWork"), commute: t("personal.tagCommute"),
                personal: t("personal.tagPersonal"), untagged: t("personal.tagUntagged"),
              };
              const startedAt = new Date(trip.started_at);
              const dateStr = startedAt.toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
              const timeStr = startedAt.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
              return (
                <div key={trip.id} className={`flex items-center gap-3 px-4 py-3 border-b last:border-b-0 ${idx % 2 === 0 ? "bg-card" : "bg-muted/20"}`}>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${ts.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-sm font-medium leading-tight">
                      <span className="truncate max-w-28">{trip.start_address?.split(",")[0] ?? "—"}</span>
                      <IconArrowNarrowRight className="size-3 shrink-0 text-muted-foreground" />
                      <span className="truncate max-w-28">{trip.end_address?.split(",")[0] ?? "—"}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-xs text-muted-foreground">{dateStr} · {timeStr}</span>
                      <span className="text-xs text-muted-foreground">·</span>
                      <span className="text-xs font-medium text-muted-foreground">{trip.driver_name}</span>
                      <Badge variant="outline" className={`text-xs border h-4 px-1.5 ${ts.pill}`}>{tagLabels[tag] ?? tag}</Badge>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold tabular-nums">
                      {trip.distance_km != null ? `${Math.round(trip.distance_km).toLocaleString("sv-SE")} km` : "—"}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Onboarding empty state (no org) ──────────────────────────
function WelcomeOnboarding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="space-y-8">
      <div className="text-center py-8">
        <div className="mx-auto w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <IconBolt className="size-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{t("dashboard.welcomeTitle")}</h1>
        <p className="mt-2 text-muted-foreground max-w-md mx-auto">{t("dashboard.welcomeSubtitle")}</p>
        <Button className="mt-6" size="lg" onClick={() => navigate("/signup")}>{t("dashboard.createOrgButton")}</Button>
      </div>
    </div>
  );
}

// ── Getting-started banner ────────────────────────────────────
function GettingStartedBanner({ driverCount, vehicleCount }: { driverCount: number; vehicleCount: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const steps = [
    { done: driverCount > 1, label: t("dashboard.stepInviteDrivers"), action: () => navigate("/dashboard/drivers") },
    { done: vehicleCount > 0, label: t("dashboard.stepAddVehicles"), action: () => navigate("/dashboard/vehicles") },
    { done: true, label: t("dashboard.stepReviewSettings"), action: () => navigate("/dashboard/settings") },
  ];
  if (steps.every((s) => s.done)) return null;
  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg p-2 bg-primary/10 shrink-0">
            <IconCircleCheck className="size-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-semibold">{t("dashboard.getStartedTitle")}</p>
            <p className="text-sm text-muted-foreground mt-0.5">{t("dashboard.getStartedDesc")}</p>
            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5">
              {steps.map((step) => (
                <button key={step.label} onClick={step.action} className="flex items-center gap-2 text-sm hover:underline cursor-pointer">
                  {step.done ? <IconCircleCheck className="size-4 text-emerald-500 shrink-0" /> : <div className="size-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />}
                  <span className={step.done ? "text-muted-foreground line-through" : "font-medium"}>{step.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { organization, loading: orgLoading } = useOrg();

  const [drivers, setDrivers]         = useState<DriverStat[]>([]);
  const [orgVehicles, setOrgVehicles] = useState<OrgVehicle[]>([]);
  const [fleetTrips, setFleetTrips]   = useState<FleetTrip[]>([]);
  const [allTrips, setAllTrips]       = useState<FleetTrip[]>([]);
  const [driverCount, setDriverCount] = useState(0);
  const [vehicleCount, setVehicleCount] = useState(0);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    if (!user || !organization) return;

    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const rangeStart = monthStart < thirtyDaysAgo ? thirtyDaysAgo : monthStart;

    supabase
      .from("organization_members")
      .select("user_id, role, status, profiles(full_name, email)")
      .eq("organization_id", organization.id)
      .eq("status", "active")
      .then(async ({ data: members }) => {
        if (!members || members.length === 0) {
          setLoading(false);
          return;
        }
        setDriverCount(members.length);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const memberIds = members.map((m: any) => m.user_id as string);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const memberMap = new Map<string, { full_name: string | null; email: string }>(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          members.map((m: any) => {
            const p = m.profiles as { full_name: string | null; email: string } | null;
            return [m.user_id as string, { full_name: p?.full_name ?? null, email: p?.email ?? "?" }];
          }),
        );

        const [monthTripsRes, recentTripsRes, vehiclesRes] = await Promise.all([
          supabase
            .from("trips")
            .select("id, started_at, ended_at, start_address, end_address, distance_km, tag, user_id")
            .in("user_id", memberIds)
            .is("superseded_by", null)
            .gte("started_at", rangeStart)
            .not("ended_at", "is", null)
            .order("started_at", { ascending: true })
            .limit(2000),
          supabase
            .from("trips")
            .select("id, started_at, ended_at, start_address, end_address, distance_km, tag, user_id")
            .in("user_id", memberIds)
            .is("superseded_by", null)
            .not("ended_at", "is", null)
            .order("started_at", { ascending: false })
            .limit(10),
          supabase
            .from("organization_vehicles")
            .select("id, vehicle_id, display_label, vehicles(model, vin, battery_kwh_usable, telemetry_enabled)")
            .eq("organization_id", organization.id),
        ]);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const toFleetTrip = (tr: any): FleetTrip => ({
          id: tr.id,
          started_at: tr.started_at,
          ended_at: tr.ended_at,
          start_address: tr.start_address,
          end_address: tr.end_address,
          distance_km: tr.distance_km,
          tag: tr.tag,
          user_id: tr.user_id,
          driver_name: memberMap.get(tr.user_id)?.full_name || memberMap.get(tr.user_id)?.email?.split("@")[0] || "?",
        });

        const monthTrips = (monthTripsRes.data ?? []).map(toFleetTrip);
        const recentTrips = (recentTripsRes.data ?? []).map(toFleetTrip);
        setAllTrips(monthTrips);
        setFleetTrips(recentTrips);

        // Per-driver stats
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const driverStats: DriverStat[] = members.map((m: any) => {
          const uid = m.user_id as string;
          const info = memberMap.get(uid)!;
          const myTrips = monthTrips.filter((tr) => tr.user_id === uid);
          const lastTrip = myTrips[myTrips.length - 1];
          return {
            user_id: uid,
            full_name: info.full_name,
            email: info.email,
            role: m.role as string,
            km_this_month: myTrips.reduce((s, tr) => s + (tr.distance_km ?? 0), 0),
            trip_count: myTrips.length,
            untagged_count: myTrips.filter((tr) => !tr.tag || tr.tag === "untagged").length,
            last_trip_at: lastTrip?.started_at ?? null,
          };
        });
        driverStats.sort((a, b) => b.km_this_month - a.km_this_month);
        setDrivers(driverStats);

        // Org vehicles with telemetry
        const rawVehicles = vehiclesRes.data ?? [];
        setVehicleCount(rawVehicles.length);

        if (rawVehicles.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const vehicleIds = rawVehicles.map((ov: any) => ov.vehicle_id as string);
          const { data: telCache } = await supabase
            .from("vehicle_telemetry_cache")
            .select("vehicle_id, signal, value, received_at")
            .in("vehicle_id", vehicleIds)
            .in("signal", ["Soc", "BatteryLevel", "ChargeState"]);

          const telMap = new Map<string, Record<string, unknown>>();
          for (const row of (telCache ?? [])) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const r = row as any;
            if (!telMap.has(r.vehicle_id)) telMap.set(r.vehicle_id, {});
            telMap.get(r.vehicle_id)![r.signal] = r;
          }

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const enriched: OrgVehicle[] = rawVehicles.map((ov: any) => {
            const vId = ov.vehicle_id as string;
            const tel = telMap.get(vId) ?? {};
            const vInfo = ov.vehicles as Record<string, unknown> | null;
            const socRow = (tel["Soc"] ?? tel["BatteryLevel"]) as Record<string, unknown> | undefined;
            const chargeRow = tel["ChargeState"] as Record<string, unknown> | undefined;
            return {
              ov_id: ov.id as string,
              vehicle_id: vId,
              display_label: ov.display_label as string | null,
              model: vInfo?.["model"] as string | null,
              vin: vInfo?.["vin"] as string | null,
              battery_kwh_usable: vInfo?.["battery_kwh_usable"] as number | null,
              telemetry_enabled: (vInfo?.["telemetry_enabled"] as boolean) ?? false,
              soc: socRow ? signalNum(socRow["value"]) : null,
              charge_state: chargeRow ? signalStr(chargeRow["value"]) : null,
              last_seen: socRow ? (socRow["received_at"] as string | null) : null,
            };
          });
          setOrgVehicles(enriched);
        }

        setLoading(false);
      });
  }, [user, organization]);

  const fleetKm = useMemo(() => allTrips.reduce((s, tr) => s + (tr.distance_km ?? 0), 0), [allTrips]);
  const untaggedCount = useMemo(() => allTrips.filter((tr) => !tr.tag || tr.tag === "untagged").length, [allTrips]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "God morgon" : hour < 18 ? "God eftermiddag" : "God kväll";

  if (!orgLoading && !organization) return <WelcomeOnboarding />;

  return (
    <div className="space-y-6">
      {/* Onboarding checklist */}
      <GettingStartedBanner driverCount={driverCount} vehicleCount={vehicleCount} />

      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{greeting}!</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {organization?.name} · {new Date().toLocaleDateString("sv-SE", { month: "long", year: "numeric" })}
          </p>
        </div>
        {!loading && untaggedCount > 0 && (
          <a href="/dashboard/compliance" className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 hover:bg-amber-100 transition-colors cursor-pointer">
            <IconTag className="size-3.5 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700 font-medium">
              {untaggedCount} {t("dashboard.untaggedAlert")} &mdash; {t("dashboard.seeAll")}
            </p>
          </a>
        )}
      </div>

      {/* Quick actions */}
      <QuickActionsBar />

      {/* Fleet KPI cards */}
      <FleetKpiCards
        driverCount={driverCount}
        vehicleCount={vehicleCount}
        fleetKm={fleetKm}
        tripCount={allTrips.length}
        untaggedCount={untaggedCount}
        loading={loading}
      />

      {/* Activity chart + alerts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <FleetActivityChart trips={allTrips} loading={loading} />
        </div>
        <div>
          <AlertsPanel drivers={drivers} vehicles={orgVehicles} loading={loading} />
        </div>
      </div>

      {/* Driver table + Vehicle grid */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <DriverTable drivers={drivers} loading={loading} />
        </div>
        <div className="lg:col-span-2">
          <VehicleGrid vehicles={orgVehicles} loading={loading} />
        </div>
      </div>

      {/* Recent fleet trips */}
      <RecentFleetTrips trips={fleetTrips} loading={loading} />
    </div>
  );
}
