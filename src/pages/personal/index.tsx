// PersonalDashboardPage — full redesign with trip detail sheet + Leaflet map
import { useState, useEffect, useMemo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter, CardAction } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  IconRoute,
  IconFileExport,
  IconBolt,
  IconBriefcase,
  IconArrowNarrowRight,
  IconDownload,
  IconCash,
  IconMapPin,
  IconChevronRight,
  IconCalendar,
  IconTrendingUp,
  IconCar,
  IconCircleCheck,
  IconAlertTriangle,
  IconTag,
} from "@tabler/icons-react";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
} from "recharts";
import L from "leaflet";
import { MapContainer, TileLayer, Marker } from "react-leaflet";

// Fix Leaflet default marker icons (broken in Vite/webpack bundles)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ── Types ─────────────────────────────────────────────────────
type TripTag = "work" | "commute" | "personal" | "untagged";

type TripRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  start_address: string | null;
  end_address: string | null;
  start_lat: number | null;
  start_lng: number | null;
  end_lat: number | null;
  end_lng: number | null;
  distance_km: number | null;
  energy_used_kwh: number | null;
  cost_kr: number | null;
  tag: TripTag;
  soc_start: number | null;
  soc_end: number | null;
  outside_temp_c: number | null;
  notes: string | null;
  raw_drive_state: Record<string, unknown> | null;
};

type Period = "week" | "month" | "quarter" | "year";

// ── Constants ─────────────────────────────────────────────────
const MILERSATTNING_PER_KM = 2.5;

const TAG_STYLES: Record<TripTag, { pill: string; dot: string; line: string }> = {
  work:     { pill: "bg-blue-50 text-blue-700 border-blue-200",    dot: "bg-blue-500",    line: "border-l-blue-500"    },
  commute:  { pill: "bg-amber-50 text-amber-700 border-amber-200", dot: "bg-amber-500",   line: "border-l-amber-500"   },
  personal: { pill: "bg-emerald-50 text-emerald-700 border-emerald-200", dot: "bg-emerald-500", line: "border-l-emerald-500" },
  untagged: { pill: "bg-gray-100 text-gray-500 border-gray-200",   dot: "bg-gray-400",    line: "border-l-gray-300"    },
};
const getTagStyle = (tag: string) => TAG_STYLES[(tag as TripTag)] ?? TAG_STYLES.untagged;

const TAG_GRAPH_COLORS: Record<TripTag, string> = {
  work: "#3b82f6", commute: "#f59e0b", personal: "#10b981", untagged: "#9ca3af",
};

// ── Helpers ───────────────────────────────────────────────────
export function getPeriodStart(period: Period): Date {
  const now = new Date();
  switch (period) {
    case "week": { const d = new Date(now); const dow = d.getDay(); d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1)); d.setHours(0,0,0,0); return d; }
    case "month":   return new Date(now.getFullYear(), now.getMonth(), 1);
    case "quarter": return new Date(now.getFullYear(), now.getMonth() - 2, 1);
    case "year":    return new Date(now.getFullYear(), 0, 1);
  }
}

function formatDateSection(isoDate: string): string {
  return new Date(isoDate + "T12:00:00").toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long" });
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}
function formatKm(km: number | null): string {
  if (km == null) return "—";
  return km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
}
function formatSek(kr: number | null): string {
  if (kr == null || kr === 0) return "";
  return `${Math.round(kr)} kr`;
}
function tripDuration(started_at: string, ended_at: string | null): string {
  if (!ended_at) return "";
  const mins = Math.round((new Date(ended_at).getTime() - new Date(started_at).getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60); const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
// ── Sparkline bar (inline mini chart for KPI cards) ───────────
function Sparkline({ data, color = "#3b82f6" }: { data: number[]; color?: string }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-0.5 h-8">
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm transition-all"
          style={{ height: `${Math.max(4, (v / max) * 100)}%`, backgroundColor: i === data.length - 1 ? color : color + "55" }}
        />
      ))}
    </div>
  );
}

// ── KPI stat card ─────────────────────────────────────────────
function KpiCard({
  title, value, sub, trend, sparkData, icon: Icon, color = "#3b82f6",
}: {
  title: string; value: string; sub?: string; trend?: { pct: number; up: boolean };
  sparkData?: number[]; icon: React.ElementType<{ className?: string }>; color?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="rounded-lg p-2" style={{ backgroundColor: color + "18" }}>
            <Icon className="h-4 w-4" style={{ color }} />
          </div>
          {trend && (
            <span className={`text-xs font-medium flex items-center gap-0.5 ${trend.up ? "text-emerald-600" : "text-rose-500"}`}>
              {trend.up ? "↑" : "↓"} {Math.abs(trend.pct)}%
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mb-0.5">{title}</p>
        <p className="text-2xl font-bold tracking-tight leading-none">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
        {sparkData && <div className="mt-3"><Sparkline data={sparkData} color={color} /></div>}
      </CardContent>
    </Card>
  );
}

// ── Period selector ───────────────────────────────────────────
function PeriodSelect({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={v => onChange(v as Period)}>
      <SelectTrigger className="w-44 h-8 text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="week">{t("personal.periodWeek")}</SelectItem>
        <SelectItem value="month">{t("personal.periodMonth")}</SelectItem>
        <SelectItem value="quarter">{t("personal.periodQuarter")}</SelectItem>
        <SelectItem value="year">{t("personal.periodYear")}</SelectItem>
      </SelectContent>
    </Select>
  );
}

// ── Custom recharts tooltip ───────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-sm">
      <p className="font-medium capitalize">{label}</p>
      <p className="text-muted-foreground">{payload[0]?.value} km</p>
    </div>
  );
}

// ── Grouped trip list ─────────────────────────────────────────
export function TripsTab({ trips, loading, period, onPeriodChange, onSelect }: {
  trips: TripRow[]; loading: boolean; period: Period;
  onPeriodChange: (p: Period) => void; onSelect: (t: TripRow) => void;
}) {
  const { t } = useTranslation();
  const [tagFilter, setTagFilter] = useState("all");

  const tagLabels: Record<TripTag, string> = {
    work: t("personal.tagWork"), commute: t("personal.tagCommute"),
    personal: t("personal.tagPersonal"), untagged: t("personal.tagUntagged"),
  };

  const groups = useMemo(() => {
    const filtered = tagFilter === "all" ? trips : trips.filter(tr => tr.tag === tagFilter);
    const m = new Map<string, TripRow[]>();
    for (const trip of filtered) {
      const key = trip.started_at.slice(0, 10);
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(trip);
    }
    return Array.from(m.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dateKey, dayTrips]) => ({
        dateKey,
        label: formatDateSection(dateKey),
        trips: dayTrips.sort((a, b) => b.started_at.localeCompare(a.started_at)),
        totalKm: dayTrips.reduce((s, tr) => s + (tr.distance_km ?? 0), 0),
      }));
  }, [trips, tagFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <PeriodSelect value={period} onChange={onPeriodChange} />
        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger className="w-36 h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("personal.filterAll")}</SelectItem>
            <SelectItem value="work">{t("personal.tagWork")}</SelectItem>
            <SelectItem value="commute">{t("personal.tagCommute")}</SelectItem>
            <SelectItem value="personal">{t("personal.tagPersonal")}</SelectItem>
            <SelectItem value="untagged">{t("personal.tagUntagged")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
            <IconRoute className="h-7 w-7 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground">{t("personal.noTrips")}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(group => (
            <div key={group.dateKey}>
              <div className="flex items-center gap-3 mb-2 px-0.5">
                <div className="flex items-center gap-1.5">
                  <IconCalendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-sm font-semibold capitalize">{group.label}</span>
                </div>
                <div className="flex-1 h-px bg-border" />
                <span className="text-sm text-muted-foreground font-medium tabular-nums">{formatKm(group.totalKm)}</span>
              </div>

              <div className="rounded-xl border overflow-hidden">
                {group.trips.map(trip => {
                  const tag = (trip.tag ?? "untagged") as TripTag;
                  const ts = getTagStyle(tag);
                  const cost = formatSek(trip.cost_kr);
                  const dur = tripDuration(trip.started_at, trip.ended_at);
                  return (
                    <button
                      key={trip.id}
                      onClick={() => onSelect(trip)}
                      className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-muted/50 transition-colors text-left border-l-[3px] ${ts.line} border-b last:border-b-0 group`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 text-sm font-medium leading-tight mb-1">
                          <span className="truncate max-w-40 text-foreground">
                            {trip.start_address?.split(",")[0] ?? "Okänd"}
                          </span>
                          <IconArrowNarrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate max-w-40 text-foreground">
                            {trip.end_address?.split(",")[0] ?? "Okänd"}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {formatTime(trip.started_at)}
                            {trip.ended_at ? ` – ${formatTime(trip.ended_at)}` : ""}
                          </span>
                          {dur && <span className="text-xs text-muted-foreground">·  {dur}</span>}
                          <Badge className={`text-xs border h-4 px-1.5 ${ts.pill}`} variant="outline">
                            {tagLabels[tag] ?? tag}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold tabular-nums">{formatKm(trip.distance_km)}</p>
                        {cost && <p className="text-xs text-muted-foreground tabular-nums">{cost}</p>}
                        {trip.energy_used_kwh != null && (
                          <p className="text-xs text-blue-500 tabular-nums">{trip.energy_used_kwh.toFixed(1)} kWh</p>
                        )}
                      </div>
                      <IconChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Statistics tab ────────────────────────────────────────────
export function StatisticsTab({ trips, loading, period, onPeriodChange }: {
  trips: TripRow[]; loading: boolean; period: Period; onPeriodChange: (p: Period) => void;
}) {
  const { t } = useTranslation();

  const stats = useMemo(() => {
    const totalKm   = trips.reduce((s, tr) => s + (tr.distance_km ?? 0), 0);
    const workKm    = trips.filter(tr => tr.tag === "work" || tr.tag === "commute").reduce((s, tr) => s + (tr.distance_km ?? 0), 0);
    const elCost    = trips.reduce((s, tr) => s + (tr.cost_kr ?? 0), 0);
    const milerKr   = workKm * MILERSATTNING_PER_KM;
    const totalKwh  = trips.reduce((s, tr) => s + (tr.energy_used_kwh ?? 0), 0);
    const tagCounts: Record<TripTag, number> = { work: 0, commute: 0, personal: 0, untagged: 0 };
    for (const tr of trips) { const tag = (tr.tag ?? "untagged") as TripTag; tagCounts[tag] = (tagCounts[tag] ?? 0) + 1; }
    return { totalKm, workKm, elCost, milerKr, totalKwh, tagCounts };
  }, [trips]);

  const chartData = useMemo(() => {
    const byMonth = new Map<string, { label: string; km: number }>();
    for (const tr of trips) {
      const d = new Date(tr.started_at);
      const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("sv-SE", { month: "short" });
      const ex = byMonth.get(sortKey);
      byMonth.set(sortKey, { label, km: (ex?.km ?? 0) + (tr.distance_km ?? 0) });
    }
    return Array.from(byMonth.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, { label, km }]) => ({ month: label, km: Math.round(km) }));
  }, [trips]);

  const sparkData = chartData.map(d => d.km);
  const totalTrips = trips.length;

  const tagRows: { key: TripTag; label: string }[] = [
    { key: "work",     label: t("personal.tagWork")      },
    { key: "commute",  label: t("personal.tagCommute")   },
    { key: "personal", label: t("personal.tagPersonal")  },
    { key: "untagged", label: t("personal.tagUntagged")  },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <PeriodSelect value={period} onChange={onPeriodChange} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <Skeleton className="h-60 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <PeriodSelect value={period} onChange={onPeriodChange} />
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title={t("personal.totalKm")}        value={`${Math.round(stats.totalKm).toLocaleString("sv-SE")} km`}     sub={`${totalTrips} ${t("personal.tripsCount").toLowerCase()}`} icon={IconRoute}     color="#3b82f6" sparkData={sparkData} />
        <KpiCard title={t("personal.workKm")}         value={`${Math.round(stats.workKm).toLocaleString("sv-SE")} km`}      sub={`${t("personal.tagWork")} + ${t("personal.tagCommute")}`}  icon={IconBriefcase} color="#8b5cf6" />
        <KpiCard title={t("personal.electricityCost")} value={stats.elCost > 0 ? `${Math.round(stats.elCost).toLocaleString("sv-SE")} kr` : "—"} sub={stats.totalKwh > 0 ? `${stats.totalKwh.toFixed(1)} kWh totalt` : undefined} icon={IconBolt} color="#f59e0b" />
        <KpiCard title={t("personal.milersattning")}  value={stats.milerKr > 0 ? `${Math.round(stats.milerKr).toLocaleString("sv-SE")} kr` : "—"} sub={`${MILERSATTNING_PER_KM} kr/km`} icon={IconCash} color="#10b981" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Bar chart */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">{t("personal.monthlyKm")}</CardTitle>
              <IconTrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            {chartData.length === 0 ? (
              <div className="flex items-center justify-center h-44">
                <p className="text-sm text-muted-foreground">{t("personal.noData")}</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="blueGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(240 4.8% 95.9%)", strokeWidth: 32 }} />
                  <Area dataKey="km" stroke="#3b82f6" strokeWidth={2} fill="url(#blueGrad)" dot={{ fill: "#3b82f6", r: 3 }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Tag breakdown */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">{t("personal.tagBreakdown")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tagRows.map(({ key, label }) => {
              const count = stats.tagCounts[key] ?? 0;
              const pct = totalTrips > 0 ? Math.round((count / totalTrips) * 100) : 0;
              const ts = getTagStyle(key);
              return (
                <div key={key} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${ts.dot}`} />
                      <span className="text-xs font-medium">{label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground tabular-nums">{count} ({pct}%)</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: TAG_GRAPH_COLORS[key] }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Export tab ────────────────────────────────────────────────
export function ExportTab({ trips, period, onPeriodChange }: { trips: TripRow[]; period: Period; onPeriodChange: (p: Period) => void }) {
  const { t } = useTranslation();
  const [tagFilter, setTagFilter] = useState("all");
  const filtered = tagFilter === "work" ? trips.filter(tr => tr.tag === "work" || tr.tag === "commute") : trips;
  const totalKm = filtered.reduce((s, tr) => s + (tr.distance_km ?? 0), 0);

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h3 className="text-base font-semibold">{t("personal.exportTitle")}</h3>
        <p className="text-sm text-muted-foreground mt-1">{t("personal.exportDescription")}</p>
      </div>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Period</label>
          <PeriodSelect value={period} onChange={onPeriodChange} />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("personal.exportFilterLabel")}</label>
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="w-48 h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("personal.exportTagAll")}</SelectItem>
              <SelectItem value="work">{t("personal.exportTagWork")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {filtered.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {filtered.length} {t("personal.exportSummaryTrips")}, {Math.round(totalKm).toLocaleString("sv-SE")} {t("personal.exportSummaryKm")}
          </p>
        )}
      </div>
      <Separator />
      <div className="space-y-3">
        <p className="text-sm font-medium">Format</p>
        <div className="flex gap-3">
          {([
            { key: "pdf", label: "PDF", icon: IconFileExport },
            { key: "xlsx", label: "Excel", icon: IconDownload },
            { key: "csv", label: "CSV", icon: IconDownload },
          ] as const).map(({ key, label, icon: Icon }) => (
            <Button key={key} variant="outline" className="flex-1 gap-2" disabled>
              <Icon className="h-4 w-4" />
              {label}
            </Button>
          ))}
        </div>
      </div>
      <div className="rounded-xl bg-muted/50 border p-4">
        <p className="text-sm text-muted-foreground">{t("personal.exportComingSoon")}</p>
      </div>
    </div>
  );
}

// ── Vehicle types ────────────────────────────────────────────
type VehicleRow = {
  id: string; display_name: string | null; model: string | null;
  trim: string | null; battery_kwh_usable: number | null; chemistry: string | null;
};
type TelemetryRow = { signal: string; value: unknown; received_at: string };
type SnapshotRow   = { estimated_capacity_kwh: number | null; snapped_at: string };

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
  const lat = typeof v["latitude"] === "number" ? v["latitude"] : typeof v["lat"] === "number" ? v["lat"] : null;
  const lng = typeof v["longitude"] === "number" ? v["longitude"] : typeof v["lng"] === "number" ? v["lng"] : null;
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
function getSoHInfo(soh: number): { label: string; color: string } {
  if (soh >= 95) return { label: "Utmärkt",    color: "#22c55e" };
  if (soh >= 88) return { label: "Mycket bra", color: "#84cc16" };
  if (soh >= 80) return { label: "Bra",        color: "#f59e0b" };
  if (soh >= 70) return { label: "Acceptabel", color: "#f97316" };
  return             { label: "Låg",         color: "#ef4444" };
}

// Car icon for parking map
const carIcon = new L.DivIcon({
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#3b82f6;border:3px solid white;box-shadow:0 0 0 3px rgba(59,130,246,.35),0 2px 6px rgba(0,0,0,.3)"></div>`,
  iconSize: [14, 14], iconAnchor: [7, 7], className: "",
});

// ── Activity chart ────────────────────────────────────────────
function ActivityChart({ trips, loading }: { trips: TripRow[]; loading: boolean }) {
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
      label: new Date(date + "T12:00").toLocaleDateString("sv-SE", { day: "numeric", month: "short" }),
      km: Math.round(km),
    }));
  }, [trips]);
  const totalKm = trips.reduce((s, tr) => s + (tr.distance_km ?? 0), 0);
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardDescription>Körda km per dag</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums">
              {Math.round(totalKm).toLocaleString("sv-SE")} km
            </CardTitle>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <IconTrendingUp className="size-3.5" />Senaste 30 dagarna
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-40 w-full rounded-xl" />
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="kmGradOv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={4} />
              <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "hsl(240 4.8% 95.9%)", strokeWidth: 28 }} />
              <Area dataKey="km" stroke="#3b82f6" strokeWidth={2} fill="url(#kmGradOv)" dot={false} activeDot={{ r: 4, fill: "#3b82f6" }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ── My car card ───────────────────────────────────────────────
function MyCarCard({ vehicle, telemetry, lastTripEnd, loading }: {
  vehicle: VehicleRow | null; telemetry: TelemetryRow[];
  lastTripEnd: { lat: number; lng: number } | null; loading: boolean;
}) {
  const socSignal      = telemetry.find(s => s.signal === "Soc" || s.signal === "BatteryLevel");
  const locationSignal = telemetry.find(s => s.signal === "Location" || s.signal === "VehicleLocation");
  const chargeSignal   = telemetry.find(s => s.signal === "ChargeState");
  const soc         = socSignal      ? signalNum(socSignal.value)           : null;
  const location    = locationSignal ? signalLocation(locationSignal.value) : null;
  const mapLocation = location ?? lastTripEnd;
  const chargeState = chargeSignal   ? signalStr(chargeSignal.value)        : null;
  const isCharging  = chargeState?.toLowerCase().includes("charging") && !chargeState?.toLowerCase().includes("complete");
  const isFull      = chargeState?.toLowerCase().includes("complete");
  const battColor   = soc != null ? (soc >= 70 ? "#22c55e" : soc >= 40 ? "#f59e0b" : "#ef4444") : "#9ca3af";
  const statusLabel = isCharging ? "Laddar" : isFull ? "Fulladdad" : "Parkerad";
  const statusColor = isCharging ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-100 text-gray-500 border-gray-200";
  if (loading) return <Skeleton className="h-64 rounded-2xl" />;
  if (!vehicle) return (
    <Card><CardContent className="flex flex-col items-center justify-center h-48 gap-3">
      <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
        <IconCar className="size-6 text-muted-foreground/40" />
      </div>
      <p className="text-sm text-muted-foreground">Ingen bil ansluten</p>
    </CardContent></Card>
  );
  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardDescription>Min bil</CardDescription>
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
        <div className="flex items-center gap-4">
          {soc != null ? (
            <BatteryRing pct={soc} color={battColor} />
          ) : (
            <div className="rounded-full border-[7px] border-muted flex items-center justify-center" style={{ width: 84, height: 84 }}>
              <span className="text-xs text-muted-foreground">—</span>
            </div>
          )}
          <div className="space-y-1">
            <p className="text-sm font-medium">Batteri</p>
            {soc != null && <p className="text-2xl font-bold tabular-nums" style={{ color: battColor }}>{soc}%</p>}
            {vehicle.battery_kwh_usable != null && (
              <p className="text-xs text-muted-foreground">{vehicle.battery_kwh_usable} kWh kapacitet</p>
            )}
          </div>
        </div>
        {mapLocation ? (
          <div className="rounded-xl overflow-hidden border" style={{ height: 160 }}>
            <MapContainer
              center={[mapLocation.lat, mapLocation.lng]}
              zoom={15} scrollWheelZoom={false} dragging={false}
              zoomControl={false} attributionControl={false}
              style={{ height: "100%", width: "100%" }}
            >
              <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
              <Marker position={[mapLocation.lat, mapLocation.lng]} icon={carIcon} />
            </MapContainer>
          </div>
        ) : (
          <div className="rounded-xl bg-muted/30 border flex items-center justify-center gap-2" style={{ height: 100 }}>
            <IconMapPin className="size-4 text-muted-foreground/40" />
            <span className="text-xs text-muted-foreground">Position okänd</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Battery health card ───────────────────────────────────────
function BatteryHealthCard({ vehicle, snapshots, loading }: {
  vehicle: VehicleRow | null; snapshots: SnapshotRow[]; loading: boolean;
}) {
  const latest   = snapshots.find(s => s.estimated_capacity_kwh != null);
  const usable   = vehicle?.battery_kwh_usable ?? null;
  const soh      = latest && usable ? Math.round((latest.estimated_capacity_kwh! / usable) * 100) : null;
  const health   = soh != null ? getSoHInfo(soh) : null;
  const sparkVals = snapshots.filter(s => s.estimated_capacity_kwh != null).slice(0, 5).reverse()
    .map(s => (usable ? Math.round((s.estimated_capacity_kwh! / usable) * 100) : 0));
  if (loading) return <Skeleton className="h-48 rounded-2xl" />;
  return (
    <Card className="@container/card">
      <CardHeader>
        <CardDescription>Batterihälsa</CardDescription>
        <CardTitle className="text-2xl font-semibold tabular-nums @[200px]/card:text-3xl">
          {soh != null ? `${soh}%` : "—"}
        </CardTitle>
        {health && (
          <CardAction>
            <Badge variant="outline" className="text-xs border flex items-center gap-1"
              style={{ color: health.color, borderColor: health.color + "44", backgroundColor: health.color + "10" }}>
              {soh != null && soh >= 80 ? <IconCircleCheck className="size-3" /> : <IconAlertTriangle className="size-3" />}
              {health.label}
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {health && soh != null && (
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${soh}%`, backgroundColor: health.color }} />
          </div>
        )}
        {usable != null && latest && (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-muted/50 p-2.5">
              <p className="text-muted-foreground">Uppskattad</p>
              <p className="font-semibold mt-0.5">{latest.estimated_capacity_kwh!.toFixed(1)} kWh</p>
            </div>
            <div className="rounded-lg bg-muted/50 p-2.5">
              <p className="text-muted-foreground">Original</p>
              <p className="font-semibold mt-0.5">{usable.toFixed(1)} kWh</p>
            </div>
          </div>
        )}
        {sparkVals.length > 0 && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Trend ({sparkVals.length} mätningar)</p>
            <div className="flex items-end gap-1 h-8">
              {sparkVals.map((v, i) => (
                <div key={i} className="flex-1 rounded-sm"
                  style={{ height: `${Math.max(10, v)}%`, backgroundColor: i === sparkVals.length - 1 ? (health?.color ?? "#3b82f6") : (health?.color ?? "#3b82f6") + "55" }}
                />
              ))}
            </div>
          </div>
        )}
        {!latest && <p className="text-xs text-muted-foreground">Ingen hälsodata ännu</p>}
      </CardContent>
    </Card>
  );
}

// ── Recent trips preview ──────────────────────────────────────
function RecentTripsCard({ trips, loading, onSelect }: {
  trips: TripRow[]; loading: boolean; onSelect: (t: TripRow) => void;
}) {
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
            <CardDescription>Mina senaste resor</CardDescription>
            <CardTitle className="text-base font-semibold mt-0.5">Senaste {trips.length || 5}</CardTitle>
          </div>
          <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => navigate("/personal/trips")}>
            Visa alla <IconChevronRight className="size-3.5" />
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
            Inga resor hittades
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            {trips.map((trip, idx) => {
              const tag = (trip.tag ?? "untagged") as TripTag;
              const ts  = TAG_STYLES[tag] ?? TAG_STYLES.untagged;
              const dur = tripDuration(trip.started_at, trip.ended_at);
              const dateStr = new Date(trip.started_at).toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
              return (
                <button key={trip.id} onClick={() => onSelect(trip)}
                  className={`w-full flex items-center gap-3 px-4 py-3 border-b last:border-b-0 hover:bg-muted/50 transition-colors text-left group ${idx % 2 === 0 ? "bg-card" : "bg-muted/20"}`}
                >
                  <span className={`w-2 h-2 rounded-full shrink-0 ${ts.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-sm font-medium leading-tight">
                      <span className="truncate max-w-28">{trip.start_address?.split(",")[0] ?? "—"}</span>
                      <IconArrowNarrowRight className="size-3 shrink-0 text-muted-foreground" />
                      <span className="truncate max-w-28">{trip.end_address?.split(",")[0] ?? "—"}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-muted-foreground">{dateStr} · {formatTime(trip.started_at)}</span>
                      {dur && <span className="text-xs text-muted-foreground">· {dur}</span>}
                      <Badge variant="outline" className={`text-xs border h-4 px-1.5 ${ts.pill}`}>{tagLabels[tag]}</Badge>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold tabular-nums">{formatKm(trip.distance_km)}</p>
                    {trip.cost_kr != null && trip.cost_kr > 0 && (
                      <p className="text-xs text-amber-600 tabular-nums">{formatSek(trip.cost_kr)}</p>
                    )}
                  </div>
                  <IconChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
      {!loading && trips.length > 0 && (
        <CardFooter className="pt-0">
          <Button variant="outline" size="sm" className="w-full" onClick={() => navigate("/personal/trips")}>
            Se alla mina resor
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

// ── Main page ─────────────────────────────────────────────────
export function PersonalDashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [trips, setTrips]             = useState<TripRow[]>([]);
  const [recentTrips, setRecentTrips] = useState<TripRow[]>([]);
  const [vehicle, setVehicle]         = useState<VehicleRow | null>(null);
  const [telemetry, setTelemetry]     = useState<TelemetryRow[]>([]);
  const [snapshots, setSnapshots]     = useState<SnapshotRow[]>([]);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    if (!user) return;
    const rangeStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    Promise.all([
      supabase
        .from("trips")
        .select("id, started_at, ended_at, start_address, end_address, start_lat, start_lng, end_lat, end_lng, distance_km, energy_used_kwh, cost_kr, tag, soc_start, soc_end, outside_temp_c, notes, raw_drive_state")
        .eq("user_id", user.id)
        .is("superseded_by", null)
        .gte("started_at", rangeStart)
        .order("started_at", { ascending: true })
        .limit(500),
      supabase
        .from("trips")
        .select("id, started_at, ended_at, start_address, end_address, start_lat, start_lng, end_lat, end_lng, distance_km, energy_used_kwh, cost_kr, tag, soc_start, soc_end, outside_temp_c, notes, raw_drive_state")
        .eq("user_id", user.id)
        .is("superseded_by", null)
        .order("started_at", { ascending: false })
        .limit(5),
      supabase
        .from("vehicles")
        .select("id, display_name, model, trim, battery_kwh_usable, chemistry")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle(),
    ]).then(([tripsRes, recentRes, vehicleRes]) => {
      if (!tripsRes.error  && tripsRes.data)  setTrips(tripsRes.data as TripRow[]);
      if (!recentRes.error && recentRes.data) setRecentTrips(recentRes.data as TripRow[]);
      const v = vehicleRes.data as VehicleRow | null;
      if (v) {
        setVehicle(v);
        Promise.all([
          supabase
            .from("vehicle_telemetry_cache")
            .select("signal, value, received_at")
            .eq("vehicle_id", v.id)
            .in("signal", ["Soc", "BatteryLevel", "Location", "VehicleLocation", "ChargeState"]),
          supabase
            .from("battery_snapshots")
            .select("estimated_capacity_kwh, snapped_at")
            .eq("vehicle_id", v.id)
            .eq("user_id", user.id)
            .not("estimated_capacity_kwh", "is", null)
            .order("snapped_at", { ascending: false })
            .limit(8),
        ]).then(([telRes, snapRes]) => {
          if (!telRes.error  && telRes.data)  setTelemetry(telRes.data  as TelemetryRow[]);
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

  const handleSelect = useCallback((trip: TripRow) => {
    navigate(`/personal/trips/${trip.id}`);
  }, [navigate]);

  const stats = useMemo(() => {
    const totalKm  = trips.reduce((s, tr) => s + (tr.distance_km ?? 0), 0);
    const workKm   = trips.filter(tr => tr.tag === "work" || tr.tag === "commute").reduce((s, tr) => s + (tr.distance_km ?? 0), 0);
    const elCost   = trips.reduce((s, tr) => s + (tr.cost_kr ?? 0), 0);
    const milerKr  = workKm * MILERSATTNING_PER_KM;
    const untagged = trips.filter(tr => !tr.tag || tr.tag === "untagged").length;
    return { totalKm, workKm, elCost, milerKr, untagged };
  }, [trips]);

  const hour     = new Date().getHours();
  const greeting = hour < 12 ? "God morgon" : hour < 18 ? "God eftermiddag" : "God kväll";

  const kpiCards = [
    {
      desc: t("personal.totalKm"),
      value: formatKm(stats.totalKm),
      sub: `${trips.length} resor (30 dagar)`,
      icon: <IconRoute className="size-4" />, color: "#3b82f6",
    },
    {
      desc: "Tjänstekörning",
      value: formatKm(stats.workKm),
      sub: stats.milerKr > 0 ? `${Math.round(stats.milerKr).toLocaleString("sv-SE")} kr milersättning` : "Inget att redovisa",
      icon: <IconBriefcase className="size-4" />, color: "#8b5cf6",
    },
    {
      desc: t("personal.electricityCost"),
      value: stats.elCost > 0 ? `${Math.round(stats.elCost).toLocaleString("sv-SE")} kr` : "—",
      sub: "Senaste 30 dagarna",
      icon: <IconBolt className="size-4" />, color: "#f59e0b",
    },
    {
      desc: "Taggningsstatus",
      value: stats.untagged === 0 ? "Alla taggade" : `${stats.untagged} otaggade`,
      sub: stats.untagged === 0 ? "Bra jobbat!" : "Tagga för skatteunderlag",
      icon: stats.untagged === 0 ? <IconCircleCheck className="size-4" /> : <IconTag className="size-4" />,
      color: stats.untagged === 0 ? "#22c55e" : "#ef4444",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{greeting}!</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString("sv-SE", { month: "long", year: "numeric", day: "numeric" })}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpiCards.map(c => (
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
      )}

      <ActivityChart trips={trips} loading={loading} />

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <RecentTripsCard trips={recentTrips} loading={loading} onSelect={handleSelect} />
        </div>
        <div className="lg:col-span-2 flex flex-col gap-4">
          <MyCarCard vehicle={vehicle} telemetry={telemetry} lastTripEnd={lastTripEnd} loading={loading} />
          <BatteryHealthCard vehicle={vehicle} snapshots={snapshots} loading={loading} />
        </div>
      </div>
    </div>
  );
}
