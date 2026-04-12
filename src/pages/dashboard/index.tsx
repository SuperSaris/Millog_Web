// DashboardPage — premium fleet overview with live vehicle status, battery health, and trip activity
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
  CardAction,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { MapContainer, TileLayer, Marker } from "react-leaflet";
import L from "leaflet";
import {
  IconRoute,
  IconBriefcase,
  IconBolt,
  IconTag,
  IconCar,
  IconMapPin,
  IconTrendingUp,
  IconArrowNarrowRight,
  IconCircleCheck,
  IconAlertTriangle,
  IconChevronRight,
} from "@tabler/icons-react";

// ── Leaflet icon fix ──────────────────────────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});
const carIcon = new L.DivIcon({
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 0 0 3px rgba(59,130,246,.35),0 2px 6px rgba(0,0,0,.3)"></div>`,
  iconSize: [14, 14], iconAnchor: [7, 7], className: "",
});

// ── Types ─────────────────────────────────────────────────────
type TripTag = "work" | "commute" | "personal" | "untagged";
type TripRow = {
  id: string; started_at: string; ended_at: string | null;
  start_address: string | null; end_address: string | null;
  distance_km: number | null; cost_kr: number | null;
  tag: TripTag; energy_used_kwh: number | null;
  end_lat: number | null; end_lng: number | null;
};
type VehicleRow = {
  id: string; display_name: string | null; model: string | null;
  trim: string | null; battery_kwh_usable: number | null; chemistry: string | null;
};
type TelemetryRow = { signal: string; value: unknown; received_at: string };
type SnapshotRow = { estimated_capacity_kwh: number | null; snapped_at: string };

const MILERSATTNING_PER_KM = 2.5;
const TAG_STYLES: Record<TripTag, { pill: string; dot: string }> = {
  work:     { pill: "bg-blue-50 text-blue-700 border-blue-200",      dot: "bg-blue-500"    },
  commute:  { pill: "bg-amber-50 text-amber-700 border-amber-200",   dot: "bg-amber-500"   },
  personal: { pill: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500" },
  untagged: { pill: "bg-gray-100 text-gray-500 border-gray-200",     dot: "bg-gray-400"    },
};

// ── Signal helpers ────────────────────────────────────────────
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
function signalLocation(value: unknown): { lat: number; lng: number } | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  const lat = typeof v["latitude"] === "number" ? v["latitude"]
    : typeof v["lat"] === "number" ? v["lat"] : null;
  const lng = typeof v["longitude"] === "number" ? v["longitude"]
    : typeof v["lng"] === "number" ? v["lng"] : null;
  if (lat !== null && lng !== null) return { lat, lng };
  return null;
}

// ── Battery ring SVG ──────────────────────────────────────────
function BatteryRing({ pct, color }: { pct: number; color: string }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  const offset = C - (pct / 100) * C;
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" aria-label={`${pct}%`}>
      <circle cx="42" cy="42" r={R} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="7" />
      <circle
        cx="42" cy="42" r={R} fill="none" stroke={color} strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${C.toFixed(2)} ${C.toFixed(2)}`}
        strokeDashoffset={offset.toFixed(2)}
        style={{ transform: "rotate(-90deg)", transformOrigin: "42px 42px", transition: "stroke-dashoffset 0.8s ease" }}
      />
      <text x="42" y="47" textAnchor="middle" fill="currentColor" fontSize="15" fontWeight="700">{pct}%</text>
    </svg>
  );
}

// ── SoH health label ──────────────────────────────────────────
function getSoHInfo(soh: number): { label: string; color: string; cls: string } {
  if (soh >= 95) return { label: "Utmärkt",   color: "#22c55e", cls: "text-emerald-600" };
  if (soh >= 88) return { label: "Mycket bra", color: "#84cc16", cls: "text-lime-600"    };
  if (soh >= 80) return { label: "Bra",        color: "#f59e0b", cls: "text-amber-600"   };
  if (soh >= 70) return { label: "Acceptabel", color: "#f97316", cls: "text-orange-500"  };
  return             { label: "Låg",         color: "#ef4444", cls: "text-rose-500"    };
}

// ── Formatters ────────────────────────────────────────────────
function fmtKm(km: number | null) { return km == null ? "—" : `${Math.round(km).toLocaleString("sv-SE")} km`; }
function fmtKr(kr: number | null) { return kr == null || kr === 0 ? "—" : `${Math.round(kr).toLocaleString("sv-SE")} kr`; }
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" }); }
function fmtDate(iso: string) { return new Date(iso + "T12:00").toLocaleDateString("sv-SE", { day: "numeric", month: "short" }); }

// ── KPI grid cards ────────────────────────────────────────────
function KpiSectionCards({ trips, loading }: { trips: TripRow[]; loading: boolean }) {
  const { t } = useTranslation();
  const stats = useMemo(() => {
    const totalKm  = trips.reduce((s, tr) => s + (tr.distance_km ?? 0), 0);
    const workKm   = trips.filter(tr => tr.tag === "work" || tr.tag === "commute").reduce((s, tr) => s + (tr.distance_km ?? 0), 0);
    const elCost   = trips.reduce((s, tr) => s + (tr.cost_kr ?? 0), 0);
    const milerKr  = workKm * MILERSATTNING_PER_KM;
    const untagged = trips.filter(tr => !tr.tag || tr.tag === "untagged").length;
    return { totalKm, workKm, elCost, milerKr, untagged };
  }, [trips]);

  if (loading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
      </div>
    );
  }

  const cards = [
    {
      desc: t("dashboard.totalKm"),
      value: fmtKm(stats.totalKm),
      sub: `${trips.length} resor`,
      icon: <IconRoute className="size-4" />,
      color: "#3b82f6",
      trend: null,
    },
    {
      desc: t("dashboard.workTripsKm"),
      value: fmtKm(stats.workKm),
      sub: fmtKr(stats.milerKr) + " milers.",
      icon: <IconBriefcase className="size-4" />,
      color: "#8b5cf6",
      trend: null,
    },
    {
      desc: t("dashboard.electricityCost"),
      value: fmtKr(stats.elCost),
      sub: t("dashboard.thisMonth"),
      icon: <IconBolt className="size-4" />,
      color: "#f59e0b",
      trend: null,
    },
    {
      desc: t("dashboard.untaggedTrips"),
      value: stats.untagged === 0 ? "Alla taggade" : `${stats.untagged} st`,
      sub: stats.untagged === 0 ? "Bra jobbat!" : "Tagga för skatteunderlag",
      icon: stats.untagged === 0
        ? <IconCircleCheck className="size-4" />
        : <IconAlertTriangle className="size-4" />,
      color: stats.untagged === 0 ? "#22c55e" : "#ef4444",
      trend: null,
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

// ── Activity area chart ───────────────────────────────────────
const chartConfig: ChartConfig = {
  km: { label: "km", color: "#3b82f6" },
};

function ActivityChart({ trips, loading }: { trips: TripRow[]; loading: boolean }) {
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
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval={4}
              />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
              <ChartTooltip
                content={<ChartTooltipContent indicator="line" />}
                cursor={{ stroke: "rgba(0,0,0,0.08)", strokeWidth: 28 }}
              />
              <Area
                dataKey="km"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#kmGradient)"
                dot={false}
                activeDot={{ r: 4, fill: "#3b82f6" }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ── Vehicle status card ────────────────────────────────────────
function VehicleStatusCard({
  vehicle, telemetry, lastTripEnd, loading,
}: {
  vehicle: VehicleRow | null;
  telemetry: TelemetryRow[];
  lastTripEnd: { lat: number; lng: number } | null;
  loading: boolean;
}) {
  const { t } = useTranslation();

  const socSignal = telemetry.find(s => s.signal === "Soc" || s.signal === "BatteryLevel");
  const locationSignal = telemetry.find(s => s.signal === "Location" || s.signal === "VehicleLocation");
  const chargeSignal = telemetry.find(s => s.signal === "ChargeState");

  const soc = socSignal ? signalNum(socSignal.value) : null;
  const location = locationSignal ? signalLocation(locationSignal.value) : null;
  const mapLocation = location ?? lastTripEnd;
  const chargeState = chargeSignal ? signalStr(chargeSignal.value) : null;

  const isCharging = chargeState?.toLowerCase().includes("charging") && !chargeState?.toLowerCase().includes("complete");
  const isFull = chargeState?.toLowerCase().includes("complete");

  const battColor = soc != null
    ? soc >= 70 ? "#22c55e" : soc >= 40 ? "#f59e0b" : "#ef4444"
    : "#9ca3af";

  const statusLabel = isCharging ? t("dashboard.charging")
    : isFull ? t("dashboard.charged")
    : t("dashboard.parked");

  const statusColor = isCharging
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : "bg-gray-100 text-gray-500 border-gray-200";

  if (loading) return <Skeleton className="h-64 rounded-2xl" />;

  if (!vehicle) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center h-48 gap-3">
          <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
            <IconCar className="size-6 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground">{t("dashboard.noVehicle")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardDescription>{t("dashboard.vehicleStatus")}</CardDescription>
            <CardTitle className="text-base font-semibold mt-0.5">
              {vehicle.display_name ?? vehicle.model ?? "Tesla"}
            </CardTitle>
          </div>
          <Badge variant="outline" className={`text-xs border ${statusColor}`}>
            {isCharging && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse" />}
            {statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Battery + SoC ring */}
        <div className="flex items-center gap-4">
          {soc != null ? (
            <BatteryRing pct={soc} color={battColor} />
          ) : (
            <div className="w-21 h-21 rounded-full border-[7px] border-muted flex items-center justify-center">
              <span className="text-xs text-muted-foreground">—</span>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-sm font-medium">{t("dashboard.batteryHealth")}</p>
            {soc != null && (
              <p className="text-2xl font-bold tabular-nums" style={{ color: battColor }}>{soc}%</p>
            )}
            {vehicle.battery_kwh_usable != null && (
              <p className="text-xs text-muted-foreground">
                {vehicle.battery_kwh_usable} kWh kapacitet
              </p>
            )}
            {vehicle.trim && (
              <p className="text-xs text-muted-foreground truncate max-w-35">{vehicle.trim}</p>
            )}
          </div>
        </div>

        {/* Mini parking map */}
        {mapLocation ? (
          <div className="rounded-xl overflow-hidden border" style={{ height: 160 }}>
            <MapContainer
              center={[mapLocation.lat, mapLocation.lng]}
              zoom={15}
              scrollWheelZoom={false}
              dragging={false}
              zoomControl={false}
              attributionControl={false}
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
              <Marker position={[mapLocation.lat, mapLocation.lng]} icon={carIcon} />
            </MapContainer>
          </div>
        ) : (
          <div className="rounded-xl bg-muted/30 border flex items-center justify-center gap-2" style={{ height: 100 }}>
            <IconMapPin className="size-4 text-muted-foreground/40" />
            <span className="text-xs text-muted-foreground">{t("dashboard.locationUnknown")}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Battery health card ────────────────────────────────────────
function BatteryHealthCard({
  vehicle, snapshots, loading,
}: {
  vehicle: VehicleRow | null; snapshots: SnapshotRow[]; loading: boolean;
}) {
  const { t } = useTranslation();

  const latest = snapshots.find(s => s.estimated_capacity_kwh != null);
  const usable = vehicle?.battery_kwh_usable ?? null;
  const soh = latest && usable
    ? Math.round((latest.estimated_capacity_kwh! / usable) * 100)
    : null;
  const health = soh != null ? getSoHInfo(soh) : null;

  // Sparkline data: last 5 snapshots' SoH
  const sparkData = snapshots
    .filter(s => s.estimated_capacity_kwh != null)
    .slice(0, 5)
    .reverse()
    .map(s => ({ value: usable ? Math.round((s.estimated_capacity_kwh! / usable) * 100) : 0 }));

  if (loading) return <Skeleton className="h-48 rounded-2xl" />;

  const iconEl = soh == null ? null
    : soh >= 80 ? <IconCircleCheck className="size-4" />
    : <IconAlertTriangle className="size-4" />;

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>{t("dashboard.batteryHealth")}</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[200px]/card:text-3xl">
          {soh != null ? `${soh}%` : "—"}
        </CardTitle>
        {health && (
          <CardAction>
            <Badge
              variant="outline"
              className="text-xs border"
              style={{ color: health.color, borderColor: health.color + "44", backgroundColor: health.color + "10" }}
            >
              {iconEl} {health.label}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {health && (
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${soh}%`, backgroundColor: health.color }}
            />
          </div>
        )}
        {usable != null && latest && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-muted/50 p-2.5">
              <p className="text-muted-foreground">{t("dashboard.batteryEstimated")}</p>
              <p className="font-semibold mt-0.5">{latest.estimated_capacity_kwh!.toFixed(1)} kWh</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-2.5">
              <p className="text-muted-foreground">{t("dashboard.batteryOriginal")}</p>
              <p className="font-semibold mt-0.5">{usable.toFixed(1)} kWh</p>
            </div>
          </div>
        )}
        {sparkData.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Trend ({sparkData.length} mätningar)</p>
            <div className="flex items-end gap-1 h-8">
              {sparkData.map((d, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{
                    height: `${Math.max(10, d.value)}%`,
                    backgroundColor: i === sparkData.length - 1
                      ? (health?.color ?? "#3b82f6")
                      : (health?.color ?? "#3b82f6") + "55",
                  }}
                />
              ))}
            </div>
          </div>
        )}
        {!latest && (
          <p className="text-xs text-muted-foreground">{t("dashboard.noSnapshotData")}</p>
        )}
        {latest && (
          <p className="text-xs text-muted-foreground">{t("dashboard.batterySnapshot")}: {fmtDate(latest.snapped_at)}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Recent trips card ──────────────────────────────────────────
function RecentTripsCard({ trips, loading }: { trips: TripRow[]; loading: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const tagLabels: Record<TripTag, string> = {
    work: t("personal.tagWork"), commute: t("personal.tagCommute"),
    personal: t("personal.tagPersonal"), untagged: t("personal.tagUntagged"),
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardDescription>{t("dashboard.recentTrips")}</CardDescription>
            <CardTitle className="text-base font-semibold mt-0.5">Senaste 5 resorna</CardTitle>
          </div>
          <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => navigate("/personal")}>
            {t("dashboard.seeAll")}
            <IconChevronRight className="size-3.5" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : trips.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
            {t("dashboard.noTrips")}
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            {trips.map((trip, idx) => {
              const tag = (trip.tag ?? "untagged") as TripTag;
              const ts = TAG_STYLES[tag] ?? TAG_STYLES.untagged;
              return (
                <div
                  key={trip.id}
                  className={`flex items-center gap-3 px-4 py-3 border-b last:border-b-0 ${idx % 2 === 0 ? "bg-card" : "bg-muted/20"}`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${ts.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-sm font-medium leading-tight">
                      <span className="truncate max-w-28 text-foreground">
                        {trip.start_address?.split(",")[0] ?? "—"}
                      </span>
                      <IconArrowNarrowRight className="size-3 shrink-0 text-muted-foreground" />
                      <span className="truncate max-w-28 text-foreground">
                        {trip.end_address?.split(",")[0] ?? "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-muted-foreground">{fmtDate(trip.started_at)} · {fmtTime(trip.started_at)}</span>
                      <Badge variant="outline" className={`text-xs border h-4 px-1.5 ${ts.pill}`}>
                        {tagLabels[tag]}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold tabular-nums">{fmtKm(trip.distance_km)}</p>
                    {trip.cost_kr != null && trip.cost_kr > 0 && (
                      <p className="text-xs text-amber-600 tabular-nums">{fmtKr(trip.cost_kr)}</p>
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

// ── Main page ─────────────────────────────────────────────────
export function DashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [trips, setTrips]           = useState<TripRow[]>([]);
  const [vehicle, setVehicle]       = useState<VehicleRow | null>(null);
  const [telemetry, setTelemetry]   = useState<TelemetryRow[]>([]);
  const [snapshots, setSnapshots]   = useState<SnapshotRow[]>([]);
  const [recentTrips, setRecentTrips] = useState<TripRow[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    if (!user) return;

    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const rangeStart = monthStart < thirtyDaysAgo ? thirtyDaysAgo : monthStart;

    // Fetch all data in parallel
    Promise.all([
      // Monthly trips for stats + activity chart
      supabase
        .from("trips")
        .select("id, started_at, ended_at, start_address, end_address, distance_km, cost_kr, tag, energy_used_kwh, end_lat, end_lng")
        .eq("user_id", user.id)
        .is("superseded_by", null)
        .gte("started_at", rangeStart)
        .order("started_at", { ascending: true })
        .limit(500),
      // Recent 5 trips
      supabase
        .from("trips")
        .select("id, started_at, ended_at, start_address, end_address, distance_km, cost_kr, tag, energy_used_kwh, end_lat, end_lng")
        .eq("user_id", user.id)
        .is("superseded_by", null)
        .order("started_at", { ascending: false })
        .limit(5),
      // First vehicle
      supabase
        .from("vehicles")
        .select("id, display_name, model, trim, battery_kwh_usable, chemistry")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle(),
    ]).then(([tripsRes, recentRes, vehicleRes]) => {
      if (!tripsRes.error && tripsRes.data) setTrips(tripsRes.data as TripRow[]);
      if (!recentRes.error && recentRes.data) setRecentTrips(recentRes.data as TripRow[]);
      const v = vehicleRes.data as VehicleRow | null;
      if (v) {
        setVehicle(v);
        // Now fetch telemetry + battery snapshots for this vehicle
        Promise.all([
          supabase
            .from("vehicle_telemetry_cache")
            .select("signal, value, received_at")
            .eq("vehicle_id", v.id)
            .in("signal", ["Soc", "BatteryLevel", "Location", "VehicleLocation", "ChargeState", "Gear"]),
          supabase
            .from("battery_snapshots")
            .select("estimated_capacity_kwh, snapped_at")
            .eq("vehicle_id", v.id)
            .eq("user_id", user.id)
            .not("estimated_capacity_kwh", "is", null)
            .order("snapped_at", { ascending: false })
            .limit(8),
        ]).then(([telRes, snapRes]) => {
          if (!telRes.error && telRes.data) setTelemetry(telRes.data as TelemetryRow[]);
          if (!snapRes.error && snapRes.data) setSnapshots(snapRes.data as SnapshotRow[]);
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });
  }, [user]);

  const lastTripEnd = useMemo((): { lat: number; lng: number } | null => {
    for (const tr of recentTrips) {
      if (tr.end_lat != null && tr.end_lng != null) return { lat: tr.end_lat, lng: tr.end_lng };
    }
    return null;
  }, [recentTrips]);

  const untaggedCount = useMemo(
    () => trips.filter(tr => !tr.tag || tr.tag === "untagged").length,
    [trips],
  );

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "God morgon" : hour < 18 ? "God eftermiddag" : "God kväll";

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{greeting}!</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("dashboard.thisMonth")} · {new Date().toLocaleDateString("sv-SE", { month: "long", year: "numeric" })}
          </p>
        </div>
        {!loading && untaggedCount > 0 && (
          <button
            onClick={() => window.location.assign("/personal")}
            className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 hover:bg-amber-100 transition-colors cursor-pointer"
          >
            <IconTag className="size-3.5 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700 font-medium">
              {untaggedCount} {t("dashboard.untaggedAlert")} — {t("dashboard.seeAll")}
            </p>
          </button>
        )}
      </div>

      {/* KPI cards */}
      <KpiSectionCards trips={trips} loading={loading} />

      {/* Activity chart full width */}
      <ActivityChart trips={trips} loading={loading} />

      {/* Middle row: recent trips + vehicle status */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Recent trips (3/5) */}
        <div className="lg:col-span-3">
          <RecentTripsCard trips={recentTrips} loading={loading} />
        </div>
        {/* Vehicle status (2/5) */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <VehicleStatusCard
            vehicle={vehicle}
            telemetry={telemetry}
            lastTripEnd={lastTripEnd}
            loading={loading}
          />
          <BatteryHealthCard
            vehicle={vehicle}
            snapshots={snapshots}
            loading={loading}
          />
        </div>
      </div>
    </div>
  );
}
