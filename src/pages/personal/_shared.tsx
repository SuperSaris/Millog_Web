// _shared.tsx — reusable types, constants, helpers, and trip components for personal section
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth-context";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  IconRoute,
  IconBolt,
  IconBriefcase,
  IconArrowNarrowRight,
  IconCash,
  IconTemperature,
  IconGauge,
  IconClock,
  IconMap,
  IconPlayerPlay,
  IconPlayerStop,
  IconPlayerPause,
  IconBatteryCharging,
  IconChevronRight,
  IconCalendar,
  IconTrendingUp,
  IconLayersLinked,
  IconSearch,
  IconNote,
  IconX,
  IconChevronDown,
  IconFocusCentered,
  IconAlertTriangle,
  IconCheck,
} from "@tabler/icons-react";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import {
  aggregateStats,
  computeEfficiencyStats,
  computeChargingStats,
  computeWltpEfficiency,
  buildFuelComparison,
  contextNoteText,
  type StatPeriod,
  type ChargingSessionRow,
} from "@/lib/stats-calculations";
import L from "leaflet";
import { MapContainer, TileLayer, Polyline, Marker, useMap } from "react-leaflet";

// Leaflet icon fix (runs once on module load)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

// ── Types ────────────────────────────────────────────────────
export type TripTag = "work" | "commute" | "personal" | "untagged";
export type CustomTag = { id: string; name: string; color: string; is_work_tag: boolean };
export type CustomRange = { from: Date; to: Date };

export type TripRow = {
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
  tag: string;
  soc_start: number | null;
  soc_end: number | null;
  outside_temp_c: number | null;
  notes: string | null;
  raw_drive_state: Record<string, unknown> | null;
  // Telemetry columns
  odometer_start_km: number | null;
  odometer_end_km: number | null;
  tariff_kr_per_kwh_used: number | null;
  needs_review: boolean;
  // Trip source + merge metadata
  source: string | null;
  vehicle_id: string | null;
  superseded_by: string | null;
};

export type Period = "week" | "month" | "quarter" | "year";
// StatPeriod is the richer superset used by StatisticsTab — re-exported for consumers
export type { StatPeriod } from "@/lib/stats-calculations";

type LatLng = { lat: number; lng: number; speedKmh?: number; ts?: number; soc?: number };

// ── Constants ────────────────────────────────────────────────
export const MILERSATTNING_PER_KM = 2.5;

export const TAG_STYLES: Record<TripTag, { pill: string; dot: string; line: string }> = {
  work:     { pill: "bg-blue-50 text-blue-700 border-blue-200",           dot: "bg-blue-500",    line: "border-l-blue-500"    },
  commute:  { pill: "bg-amber-50 text-amber-700 border-amber-200",        dot: "bg-amber-500",   line: "border-l-amber-500"   },
  personal: { pill: "bg-emerald-50 text-emerald-700 border-emerald-200",  dot: "bg-emerald-500", line: "border-l-emerald-500" },
  untagged: { pill: "bg-gray-100 text-gray-500 border-gray-200",          dot: "bg-gray-400",    line: "border-l-gray-300"    },
};

export function getTagStyle(tag: string) {
  return TAG_STYLES[(tag as TripTag)] ?? TAG_STYLES.untagged;
}

export const TAG_GRAPH_COLORS: Record<TripTag, string> = {
  work: "#3b82f6", commute: "#f59e0b", personal: "#10b981", untagged: "#9ca3af",
};

// Map marker icons
export const startIcon = new L.DivIcon({
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#22c55e;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
  iconSize: [14, 14], iconAnchor: [7, 7], className: "",
});
export const endIcon = new L.DivIcon({
  html: `<div style="width:14px;height:14px;border-radius:50%;background:#ef4444;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>`,
  iconSize: [14, 14], iconAnchor: [7, 7], className: "",
});
const playheadIcon = new L.DivIcon({
  html: `<div style="width:12px;height:12px;border-radius:50%;background:#3b82f6;border:2px solid white;box-shadow:0 0 0 3px rgba(59,130,246,.35)"></div>`,
  iconSize: [12, 12], iconAnchor: [6, 6], className: "",
});
const legStopIcon = new L.DivIcon({
  html: `<div style="width:12px;height:12px;background:#f59e0b;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35);transform:rotate(45deg)"></div>`,
  iconSize: [12, 12], iconAnchor: [6, 6], className: "",
});

// ── Pure helpers ─────────────────────────────────────────────
export function getPeriodStart(period: Period): Date {
  const now = new Date();
  switch (period) {
    case "week": {
      const d = new Date(now);
      const dow = d.getDay();
      d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "month":   return new Date(now.getFullYear(), now.getMonth(), 1);
    case "quarter": return new Date(now.getFullYear(), now.getMonth() - 2, 1);
    case "year":    return new Date(now.getFullYear(), 0, 1);
  }
}

export function formatDateSection(isoDate: string): string {
  return new Date(isoDate + "T12:00:00").toLocaleDateString("sv-SE", {
    weekday: "long", day: "numeric", month: "long",
  });
}
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" });
}
export function formatKm(km: number | null): string {
  if (km == null) return "—";
  return km >= 10 ? `${Math.round(km)} km` : `${km.toFixed(1)} km`;
}
export function formatSek(kr: number | null): string {
  if (kr == null || kr === 0) return "";
  return `${Math.round(kr)} kr`;
}
export function fmtDate(iso: string): string {
  return new Date(iso + "T12:00").toLocaleDateString("sv-SE", { day: "numeric", month: "short" });
}
export function tripDuration(started_at: string, ended_at: string | null): string {
  if (!ended_at) return "";
  const mins = Math.round((new Date(ended_at).getTime() - new Date(started_at).getTime()) / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
export function extractRoutePoints(trip: TripRow): LatLng[] {
  const raw = trip.raw_drive_state;
  if (!raw) return [];

  function parseCoords(coords: unknown): LatLng[] {
    if (!Array.isArray(coords)) return [];
    const out: LatLng[] = [];
    for (const c of coords) {
      if (!c || typeof c !== "object") continue;
      const p = c as Record<string, unknown>;
      const lat = typeof p["lat"] === "number" ? p["lat"] : typeof p["latitude"] === "number" ? p["latitude"] : null;
      const lng = typeof p["lng"] === "number" ? p["lng"] : typeof p["longitude"] === "number" ? p["longitude"] : null;
      if (lat !== null && lng !== null) {
        const pt: LatLng = { lat, lng };
        if (typeof p["speed_kmh"] === "number") pt.speedKmh = p["speed_kmh"];
        if (typeof p["timestamp"] === "number") pt.ts = p["timestamp"];
        else if (typeof p["ts"] === "number")   pt.ts = p["ts"];
        if (typeof p["soc"] === "number") pt.soc = p["soc"];
        out.push(pt);
      }
    }
    return out;
  }

  const frags = raw["route_fragments"];
  if (Array.isArray(frags) && frags.length > 0) {
    const pts: LatLng[] = [];
    for (const frag of frags as unknown[]) {
      if (!frag || typeof frag !== "object") continue;
      pts.push(...parseCoords((frag as Record<string, unknown>)["coordinates"]));
    }
    if (pts.length > 0) return pts;
  }
  // Fallback: continuous route_points
  return parseCoords(raw["route_points"]);
}

export type TripLeg = {
  index: number;
  points: LatLng[];
  startAddress: string | null;
  endAddress: string | null;
  distanceKm: number | null;
  energyKwh: number | null;
  costKr: number | null;
  socStart: number | null;
  socEnd: number | null;
  startedAt: string | null;
  endedAt: string | null;
  tag: string;
};

export type TripGap = {
  index: number;
  /** Last point of the preceding leg — used to place the stop marker */
  pausePoint: LatLng | null;
  durationMin: number | null;
};

export function extractLegs(trip: TripRow): {
  legs: TripLeg[];
  gaps: TripGap[];
  allPoints: LatLng[];
} {
  const raw = trip.raw_drive_state;
  const empty = { legs: [], gaps: [], allPoints: [] };

  function parseCoords(coords: unknown): LatLng[] {
    if (!Array.isArray(coords)) return [];
    const out: LatLng[] = [];
    for (const c of coords) {
      if (!c || typeof c !== "object") continue;
      const p = c as Record<string, unknown>;
      const lat = typeof p["lat"] === "number" ? p["lat"] : typeof p["latitude"] === "number" ? p["latitude"] : null;
      const lng = typeof p["lng"] === "number" ? p["lng"] : typeof p["longitude"] === "number" ? p["longitude"] : null;
      if (lat !== null && lng !== null) {
        const pt: LatLng = { lat, lng };
        if (typeof p["speed_kmh"] === "number") pt.speedKmh = p["speed_kmh"];
        if (typeof p["timestamp"] === "number") pt.ts = p["timestamp"];
        else if (typeof p["ts"] === "number")   pt.ts = p["ts"];
        if (typeof p["soc"] === "number") pt.soc = p["soc"];
        out.push(pt);
      }
    }
    return out;
  }

  // ── Merged trips: use merged_legs metadata + route_fragments for coords ──
  if (raw && Array.isArray((raw as Record<string, unknown>)["merged_legs"])) {
    const mergedLegs = (raw as Record<string, unknown>)["merged_legs"] as Array<Record<string, unknown>>;
    const routeFragments = Array.isArray((raw as Record<string, unknown>)["route_fragments"])
      ? (raw as Record<string, unknown>)["route_fragments"] as Array<Record<string, unknown>>
      : [];
    const routeGaps = Array.isArray((raw as Record<string, unknown>)["route_gaps"])
      ? (raw as Record<string, unknown>)["route_gaps"] as Array<Record<string, unknown>>
      : [];

    const legs: TripLeg[] = mergedLegs.map((ml, i) => {
      const frag = routeFragments[i];
      const pts = frag ? parseCoords(frag["coordinates"]) : [];
      return {
        index: i,
        points: pts,
        startAddress: typeof ml["start_address"] === "string" ? ml["start_address"] : null,
        endAddress: typeof ml["end_address"] === "string" ? ml["end_address"] : null,
        distanceKm: typeof ml["distance_km"] === "number" ? ml["distance_km"] : null,
        energyKwh: typeof ml["energy_used_kwh"] === "number" ? ml["energy_used_kwh"] : null,
        costKr: typeof ml["cost_kr"] === "number" ? ml["cost_kr"] : null,
        socStart: typeof ml["soc_start"] === "number" ? ml["soc_start"] : null,
        socEnd: typeof ml["soc_end"] === "number" ? ml["soc_end"] : null,
        startedAt: typeof ml["started_at"] === "string" ? ml["started_at"] : null,
        endedAt: typeof ml["ended_at"] === "string" ? ml["ended_at"] : null,
        tag: typeof ml["tag"] === "string" ? ml["tag"] : "untagged",
      };
    });

    const gaps: TripGap[] = routeGaps.map((g, i) => {
      const prevLeg = legs[i];
      const lastPt = prevLeg && prevLeg.points.length > 0 ? prevLeg.points[prevLeg.points.length - 1]! : null;
      return {
        index: i,
        pausePoint: lastPt,
        durationMin:
          typeof g["durationMinutes"] === "number" ? g["durationMinutes"] :
          typeof g["duration_minutes"] === "number" ? g["duration_minutes"] : null,
      };
    });

    // Also derive gaps from leg timing when routeGaps is empty
    if (gaps.length === 0 && legs.length > 1) {
      for (let i = 0; i < legs.length - 1; i++) {
        const cur = legs[i]!;
        const nxt = legs[i + 1]!;
        let durationMin: number | null = null;
        if (cur.endedAt && nxt.startedAt) {
          durationMin = Math.round(
            (new Date(nxt.startedAt).getTime() - new Date(cur.endedAt).getTime()) / 60_000
          );
        }
        const lastPt2 = cur.points.length > 0 ? cur.points[cur.points.length - 1]! : null;
        gaps.push({ index: i, pausePoint: lastPt2, durationMin });
      }
    }

    const allPoints = legs.flatMap(l => l.points);
    return { legs, gaps, allPoints };
  }

  // ── Non-merged: single leg from route_fragments or route_points ──
  if (!raw) return empty;
  const allPoints = extractRoutePoints(trip);
  if (allPoints.length === 0) return empty;
  const singleLeg: TripLeg = {
    index: 0,
    points: allPoints,
    startAddress: trip.start_address,
    endAddress: trip.end_address,
    distanceKm: trip.distance_km,
    energyKwh: trip.energy_used_kwh,
    costKr: trip.cost_kr,
    socStart: trip.soc_start,
    socEnd: trip.soc_end,
    startedAt: trip.started_at,
    endedAt: trip.ended_at,
    tag: trip.tag,
  };
  return { legs: [singleLeg], gaps: [], allPoints };
}

// ── Map auto-fit ─────────────────────────────────────────────
export function MapBounds({ points, resetKey = 0 }: { points: LatLng[]; resetKey?: number }) {
  const map = useMap();
  useEffect(() => {
    if (points.length >= 2) {
      map.fitBounds(points.map(p => [p.lat, p.lng] as [number, number]), { padding: [24, 24] });
    } else if (points.length === 1) {
      const pt = points[0]!;
      map.setView([pt.lat, pt.lng], 14);
    }
  // resetKey intentionally included so a "fit to route" button can re-trigger the fit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, map]);
  return null;
}

// Centers the map on a moving point (used for follow-playhead mode)
function MapFollower({ point }: { point: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.setView([point.lat, point.lng], map.getZoom(), { animate: true, duration: 0.4 });
  }, [point, map]);
  return null;
}

// ── Sparkline ────────────────────────────────────────────────
export function Sparkline({ data, color = "#3b82f6" }: { data: number[]; color?: string }) {
  const max = Math.max(...data, 1);
  return (
    <div className="flex items-end gap-0.5 h-8">
      {data.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm transition-all"
          style={{
            height: `${Math.max(4, (v / max) * 100)}%`,
            backgroundColor: i === data.length - 1 ? color : color + "55",
          }}
        />
      ))}
    </div>
  );
}

// ── KpiCard ──────────────────────────────────────────────────
export function KpiCard({
  title, value, sub, trend, sparkData, icon: Icon, color = "#3b82f6",
}: {
  title: string; value: string; sub?: string;
  trend?: { pct: number; up: boolean };
  sparkData?: number[];
  icon: React.ElementType<{ className?: string }>;
  color?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-2">
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
        {sparkData && <div className="mt-2"><Sparkline data={sparkData} color={color} /></div>}
      </CardContent>
    </Card>
  );
}

// ── TripRouteMap ─────────────────────────────────────────────
type PlaySpeed = 0.5 | 1 | 2;
const SPEED_LABELS: Record<PlaySpeed, string> = { 0.5: "0.5×", 1: "1×", 2: "2×" };
const BASE_INTERVAL_MS = 60; // at 1×

const LEG_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"] as const;
const LEG_TAG_LABELS: Record<string, string> = {
  work: "Arbete", commute: "Pendling", personal: "Privat", untagged: "Omärkt",
};

export function TripRouteMap({ trip }: { trip: TripRow }) {
  const { legs, gaps, allPoints } = useMemo(() => extractLegs(trip), [trip.id]);
  const hasRoute = allPoints.length >= 2;
  const startPt = hasRoute ? allPoints[0]! : (trip.start_lat != null ? { lat: trip.start_lat!, lng: trip.start_lng! } : null);
  const endPt   = hasRoute ? allPoints[allPoints.length - 1]! : (trip.end_lat != null ? { lat: trip.end_lat!, lng: trip.end_lng! } : null);
  const isMerged = legs.length > 1;

  const [playing, setPlaying] = useState(false);
  const [playIdx, setPlayIdx] = useState(0);
  const [speed, setSpeed] = useState<PlaySpeed>(1);
  // followPlayhead: when true the map pans to keep the playhead centered
  const [followPlayhead, setFollowPlayhead] = useState(false);
  // showLegsPanel: overlay list of legs on the map (only relevant when isMerged)
  const [showLegsPanel, setShowLegsPanel] = useState(true);
  // resetViewKey: bump this to trigger MapBounds to re-fit the full route
  const [resetViewKey, setResetViewKey] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const STEP = Math.max(1, Math.floor(allPoints.length / 120));
  const scrubBarRef = useRef<HTMLDivElement>(null);

  const clearTick = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
  }, []);

  const startPlay = useCallback(() => { setPlayIdx(0); setPlaying(true); }, []);
  const pausePlay = useCallback(() => setPlaying(false), []);
  const resumePlay = useCallback(() => {
    if (playIdx >= allPoints.length - 1) setPlayIdx(0);
    setPlaying(true);
  }, [playIdx, allPoints.length]);
  const stopPlay = useCallback(() => {
    setPlaying(false);
    clearTick();
    setPlayIdx(allPoints.length - 1);
    setFollowPlayhead(false);
  }, [allPoints.length, clearTick]);

  useEffect(() => {
    clearTick();
    if (!playing) return;
    const interval = Math.round(BASE_INTERVAL_MS / speed);
    intervalRef.current = setInterval(() => {
      setPlayIdx(prev => {
        const next = prev + STEP;
        if (next >= allPoints.length) { setPlaying(false); return allPoints.length - 1; }
        return next;
      });
    }, interval);
    return clearTick;
  }, [playing, allPoints.length, STEP, speed, clearTick]);

  // Scrub: click on timeline bar to seek
  const handleScrubClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const newIdx = Math.round(pct * (allPoints.length - 1));
    setPlayIdx(newIdx);
    if (newIdx >= allPoints.length - 1) setPlaying(false);
  }, [allPoints.length]);

  const drawnPoints = allPoints.slice(0, playIdx + 1);
  const playhead = drawnPoints.length > 0 ? drawnPoints[drawnPoints.length - 1]! : null;
  const mapPoints = [startPt, endPt].filter(Boolean) as LatLng[];
  const progress = allPoints.length > 1 ? playIdx / (allPoints.length - 1) : 0;

  // Build per-leg segment boundaries for coloured timeline
  const legBoundaries = useMemo(() => {
    if (!isMerged) return [];
    const bounds: number[] = [0];
    let accumulated = 0;
    for (const leg of legs) {
      accumulated += leg.points.length;
      bounds.push(accumulated);
    }
    return bounds;
  }, [legs, isMerged]);

  // Build pause-stop markers for gaps (placed at the end of each leg's last point)
  const pauseMarkers = useMemo(() => {
    if (!isMerged) return [];
    return gaps
      .map(g => g.pausePoint)
      .filter((p): p is LatLng => p !== null);
  }, [gaps, isMerged]);

  if (!startPt && !endPt) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/30 rounded-xl">
        <div className="text-center">
          <IconMap className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">Ingen rutt tillgänglig</p>
        </div>
      </div>
    );
  }

  // The map fills its container fully. All controls are absolute overlays inside it.
  return (
    <div
      className="relative rounded-xl overflow-hidden border"
      style={{ height: "100%", minHeight: 520 }}
    >
      <MapContainer
        center={startPt ? [startPt.lat, startPt.lng] : [59.3, 18.0]}
        zoom={13}
        zoomControl={false}
        style={{ height: "100%", width: "100%" }}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        <MapBounds points={hasRoute ? allPoints : mapPoints} resetKey={resetViewKey} />
        {/* Follow mode: pan map to keep playhead in frame */}
        <MapFollower point={followPlayhead ? playhead : null} />

        {/* Drawn (played) route */}
        {hasRoute && (
          <Polyline
            positions={drawnPoints.map(p => [p.lat, p.lng])}
            pathOptions={{ color: "#3b82f6", weight: 3, opacity: 0.85 }}
          />
        )}
        {/* Remaining route (ghost) */}
        {hasRoute && playing && playIdx < allPoints.length - 1 && (
          <Polyline
            positions={allPoints.slice(playIdx).map(p => [p.lat, p.lng])}
            pathOptions={{ color: "#94a3b8", weight: 2, opacity: 0.35, dashArray: "4 4" }}
          />
        )}

        {startPt && <Marker position={[startPt.lat, startPt.lng]} icon={startIcon} />}
        {endPt && (!playing || playIdx >= allPoints.length - 1) && (
          <Marker position={[endPt.lat, endPt.lng]} icon={endIcon} />
        )}
        {playhead && playing && (
          <Marker position={[playhead.lat, playhead.lng]} icon={playheadIcon} />
        )}
        {pauseMarkers.map((pt, i) => (
          <Marker key={`pause-${i}`} position={[pt.lat, pt.lng]} icon={legStopIcon} />
        ))}
      </MapContainer>

      {/* ── TOP-RIGHT: map action buttons ── */}
      <div className="absolute top-3 right-3 z-1000 flex flex-col gap-1.5">
        {/* Fit-to-route */}
        <button
          className="w-8 h-8 rounded-lg bg-white/90 backdrop-blur-sm border shadow-sm flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => { setResetViewKey(k => k + 1); setFollowPlayhead(false); }}
          title="Zooma till rutten"
        >
          <IconRoute className="h-4 w-4" />
        </button>
        {/* Follow playhead toggle */}
        {hasRoute && (
          <button
            className={`w-8 h-8 rounded-lg backdrop-blur-sm border shadow-sm flex items-center justify-center transition-colors ${
              followPlayhead
                ? "bg-blue-500 border-blue-500 text-white"
                : "bg-white/90 text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setFollowPlayhead(f => !f)}
            title={followPlayhead ? "Sluta följa" : "Följ position"}
          >
            <IconFocusCentered className="h-4 w-4" />
          </button>
        )}
        {/* Show/hide etapper panel */}
        {isMerged && (
          <button
            className={`w-8 h-8 rounded-lg backdrop-blur-sm border shadow-sm flex items-center justify-center transition-colors ${
              showLegsPanel
                ? "bg-slate-800 border-slate-800 text-white"
                : "bg-white/90 text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setShowLegsPanel(s => !s)}
            title={showLegsPanel ? "Dölj etapper" : "Visa etapper"}
          >
            <IconLayersLinked className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── LEFT: etapper overlay — like Tesla nav waypoint list ── */}
      {isMerged && showLegsPanel && (
        <div
          className="absolute top-3 left-3 z-1000 w-56 flex flex-col bg-white/95 backdrop-blur-md border rounded-xl shadow-lg overflow-hidden"
          style={{ maxHeight: "calc(100% - 96px)" }}
        >
          <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
            <div className="flex items-center gap-1.5">
              <IconLayersLinked className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold">Etapper ({legs.length})</span>
            </div>
            <button
              className="text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded"
              onClick={() => setShowLegsPanel(false)}
            >
              <IconX className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="overflow-y-auto overflow-x-hidden overscroll-contain">
            {legs.map((leg, i) => {
              const dotColor = LEG_COLORS[i % LEG_COLORS.length]!;
              const legDuration =
                leg.startedAt && leg.endedAt
                  ? Math.round(
                      (new Date(leg.endedAt).getTime() - new Date(leg.startedAt).getTime()) / 60_000
                    )
                  : null;
              const gap = gaps[i];
              const isLast = i === legs.length - 1;
              const legTs = getTagStyle(leg.tag);
              return (
                <div key={i}>
                  <div className="px-3 py-2 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                      <span className="text-xs font-semibold">Etapp {i + 1}</span>
                      <span className={`text-[10px] px-1.5 py-0 rounded-full border ml-auto shrink-0 ${legTs.pill}`}>
                        {LEG_TAG_LABELS[leg.tag] ?? leg.tag}
                      </span>
                    </div>
                    {leg.startAddress && (
                      <p className="text-[11px] text-muted-foreground leading-snug mt-0.5 truncate pl-3.5">
                        {leg.startAddress.split(",")[0]}
                        {leg.endAddress ? ` \u2192 ${leg.endAddress.split(",")[0]}` : ""}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-0.5 pl-3.5 flex-wrap overflow-hidden">
                      {leg.distanceKm != null && (
                        <span className="text-[11px] text-muted-foreground">{formatKm(leg.distanceKm)}</span>
                      )}
                      {legDuration != null && (
                        <span className="text-[11px] text-muted-foreground">
                          {legDuration < 60
                            ? `${legDuration} min`
                            : `${Math.floor(legDuration / 60)} h ${legDuration % 60} min`}
                        </span>
                      )}
                      {leg.socStart != null && leg.socEnd != null && (
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {`${Math.round(leg.socStart)}% → ${Math.round(leg.socEnd)}%`}
                        </span>
                      )}
                    </div>
                  </div>
                  {gap && !isLast && (
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-50 border-y border-amber-100">
                      <span className="w-2 h-2 bg-amber-400 rotate-45 shrink-0" />
                      <span className="text-[10px] text-amber-700">
                        Stopp{gap.durationMin != null ? ` \u00b7 ${gap.durationMin} min` : ""}
                      </span>
                    </div>
                  )}
                  {!isLast && !gap && <Separator className="mx-3" />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── BOTTOM: playback + scrubber overlay ── */}
      {hasRoute && (
        <div className="absolute bottom-0 left-0 right-0 z-1000">
          <div className="bg-linear-to-t from-white/95 via-white/85 to-transparent pt-8 px-3 pb-3 space-y-2">
            {/* ── Live stats bar — dark mobile-style, updates per breadcrumb ── */}
            {(playing || playIdx > 0) && (() => {
              const pt = allPoints[playIdx] ?? allPoints[0];
              const total = Math.max(allPoints.length - 1, 1);
              const frac  = playIdx / total;

              // Time: use breadcrumb ts if available (already ms from Date.now()), else interpolate
              const startMs = trip.started_at ? new Date(trip.started_at).getTime() : null;
              const endMs   = trip.ended_at   ? new Date(trip.ended_at).getTime()   : null;
              const ptMs    = pt?.ts ? pt.ts : (startMs && endMs ? startMs + frac * (endMs - startMs) : null);
              const timeStr = ptMs
                ? new Date(ptMs).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                : null;

              // Drive time elapsed
              const elapsedMs = startMs && ptMs ? ptMs - startMs : null;
              const elapsedStr = elapsedMs != null && elapsedMs >= 0
                ? (() => { const s = Math.round(elapsedMs / 1000); const m = Math.floor(s / 60); const sec = s % 60; return `${m}:${String(sec).padStart(2, "0")}`; })()
                : null;

              // Speed: from breadcrumb field, or compute from last 2 points
              let speedKmh: number | null = pt?.speedKmh != null ? Math.round(pt.speedKmh) : null;
              if (speedKmh == null && playIdx > 0) {
                const prev = allPoints[playIdx - 1];
                if (prev && pt) {
                  const dLat = (pt.lat - prev.lat) * Math.PI / 180;
                  const dLng = (pt.lng - prev.lng) * Math.PI / 180;
                  const a = Math.sin(dLat/2)**2 + Math.cos(prev.lat*Math.PI/180)*Math.cos(pt.lat*Math.PI/180)*Math.sin(dLng/2)**2;
                  const distM = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                  const dtSec = prev.ts && pt.ts ? pt.ts - prev.ts : null;
                  if (dtSec && dtSec > 0) speedKmh = Math.round((distM / dtSec) * 3.6);
                }
              }

              // Distance covered so far (sum of segments up to playIdx)
              let distCovered = 0;
              for (let i = 1; i <= playIdx && i < allPoints.length; i++) {
                const a2 = allPoints[i-1]!, b2 = allPoints[i]!;
                const dLat2 = (b2.lat - a2.lat) * Math.PI / 180;
                const dLng2 = (b2.lng - a2.lng) * Math.PI / 180;
                const aa = Math.sin(dLat2/2)**2 + Math.cos(a2.lat*Math.PI/180)*Math.cos(b2.lat*Math.PI/180)*Math.sin(dLng2/2)**2;
                distCovered += 6371 * 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1-aa));
              }

              // SOC: from breadcrumb, else interpolate
              const currentSoc = pt?.soc != null
                ? Math.round(pt.soc)
                : (trip.soc_start != null && trip.soc_end != null
                    ? Math.round(trip.soc_start - frac * (trip.soc_start - trip.soc_end))
                    : null);

              const stats = [
                { value: speedKmh != null ? `${speedKmh}` : "—", unit: "KM/H" },
                { value: distCovered > 0 ? `${distCovered.toFixed(1)}` : "0.0", unit: "KM" },
                ...(timeStr    ? [{ value: timeStr, unit: "KLOCKSLAG" }] : []),
                ...(elapsedStr ? [{ value: elapsedStr, unit: "KÖRTID" }] : []),
                ...(currentSoc != null ? [{ value: `${currentSoc}%`, unit: "BATTERI" }] : []),
              ];

              return (
                <div className="flex items-center gap-2 flex-wrap">
                  {stats.map(({ value, unit }) => (
                    <div key={unit} className="flex flex-col items-center bg-white/90 backdrop-blur-sm rounded-xl px-3 py-1.5 shadow-sm border border-black/5 min-w-0">
                      <span className="text-[10px] font-medium text-muted-foreground leading-none mb-0.5 whitespace-nowrap">{unit}</span>
                      <span className="text-sm font-bold text-foreground leading-tight tabular-nums whitespace-nowrap">{value}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
            {/* Legend + speed on same row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3 pointer-events-none">
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />Start
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />Slut
                </span>
                {isMerged && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="inline-block w-2.5 h-2.5 bg-amber-400 rotate-45" />Stopp
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 select-none">
                {([0.5, 1, 2] as PlaySpeed[]).map(s => (
                  <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                      speed === s
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border bg-white/80 text-muted-foreground hover:border-foreground"
                    }`}
                  >
                    {SPEED_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
            {/* Scrubber */}
            <div
              ref={scrubBarRef}
              className="relative h-2 rounded-full overflow-hidden cursor-pointer bg-muted/70"
              onClick={handleScrubClick}
              title="Klicka för att hoppa till position"
            >
              {isMerged && legBoundaries.length > 1
                ? legBoundaries.slice(0, -1).map((start, i) => {
                    const end = legBoundaries[i + 1]!;
                    const total = allPoints.length;
                    const left = (start / total) * 100;
                    const width = ((end - start) / total) * 100;
                    const col = LEG_COLORS[i % LEG_COLORS.length]!;
                    const gapAfter = i < legs.length - 1;
                    return (
                      <div
                        key={i}
                        className="absolute top-0 h-full"
                        style={{ left: `${left}%`, width: `${width - (gapAfter ? 0.5 : 0)}%`, background: col, opacity: 0.4 }}
                      />
                    );
                  })
                : null}
              <div
                className="absolute top-0 left-0 h-full bg-blue-500 transition-none"
                style={{ width: `${progress * 100}%`, opacity: 0.85 }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-blue-500 shadow pointer-events-none"
                style={{ left: `calc(${progress * 100}% - 6px)` }}
              />
            </div>
            {/* Play controls */}
            <div className="flex items-center gap-2">
              {!playing ? (
                <Button
                  size="sm"
                  onClick={playIdx > 0 && playIdx < allPoints.length - 1 ? resumePlay : startPlay}
                  className="gap-1.5 h-7 text-xs"
                >
                  <IconPlayerPlay className="h-3.5 w-3.5" />
                  {playIdx > 0 && playIdx < allPoints.length - 1 ? "Fortsätt" : "Spela rutt"}
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={pausePlay} className="gap-1.5 h-7 text-xs bg-white/80">
                  <IconPlayerPause className="h-3.5 w-3.5" />Paus
                </Button>
              )}
              {playing && (
                <Button size="sm" variant="ghost" onClick={stopPlay} className="gap-1.5 h-7 text-xs text-muted-foreground">
                  <IconPlayerStop className="h-3.5 w-3.5" />
                </Button>
              )}
              <span className="text-xs text-muted-foreground ml-auto">
                {allPoints.length} punkter{isMerged ? ` \u00b7 ${legs.length} etapper` : ""}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Static legend when no route playback available */}
      {!hasRoute && (
        <div className="absolute bottom-3 left-3 z-1000 flex items-center gap-2 bg-white/90 backdrop-blur-sm border rounded-lg px-2.5 py-1.5 shadow-sm pointer-events-none">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-green-500" />Start
          </span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500" />Slut
          </span>
        </div>
      )}
    </div>
  );
}

// ── TripDetailSheet ──────────────────────────────────────────
export function TripDetailSheet({ trip, open, onClose, tagLabels }: {
  trip: TripRow | null; open: boolean; onClose: () => void;
  tagLabels: Record<TripTag, string>;
}) {
  if (!trip) return null;
  const tag = (trip.tag ?? "untagged") as TripTag;
  const ts = getTagStyle(tag);
  const label = tagLabels[tag] ?? trip.tag;
  const duration = tripDuration(trip.started_at, trip.ended_at);
  const efficiency = trip.energy_used_kwh && trip.distance_km && trip.distance_km > 0
    ? Math.round((trip.energy_used_kwh / trip.distance_km) * 100)
    : null;
  const { legs, gaps } = extractLegs(trip);
  const isMerged = legs.length > 1;

  // ── Stat group atom ──
  const StatItem = ({ icon: Icon, label: lbl, value, wide = false }: {
    icon: React.ElementType<{ className?: string }>;
    label: string; value: string; wide?: boolean;
  }) => (
    <div className={`flex items-start gap-2.5 ${wide ? "col-span-2" : ""}`}>
      <div className="mt-0.5 w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground leading-tight">{lbl}</p>
        <p className="text-sm font-semibold leading-snug truncate">{value}</p>
      </div>
    </div>
  );

  // ── Section header ──
  const SectionLabel = ({ title }: { title: string }) => (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 mb-2 mt-4 first:mt-0">{title}</p>
  );

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      {/* Inline style overrides the base data-[side=right]:sm:max-w-sm (higher specificity) */}
      <SheetContent
        side="right"
        style={{ width: "min(96vw, 1280px)", maxWidth: "min(96vw, 1280px)" }}
        className="p-0 overflow-hidden flex flex-col"
        showCloseButton
      >
        {/* ── Header ── */}
        <SheetHeader className="px-6 pt-5 pb-4 border-b shrink-0">
          <div className="flex items-center gap-3 pr-8">
            <Badge className={`border text-xs shrink-0 ${ts.pill}`} variant="outline">{label}</Badge>
            {isMerged && (
              <Badge variant="outline" className="border text-xs shrink-0 bg-blue-50 text-blue-700 border-blue-200 gap-1">
                <IconLayersLinked className="h-3 w-3" />{legs.length} etapper
              </Badge>
            )}
            <SheetTitle className="text-base font-semibold truncate">
              {trip.start_address?.split(",")[0] ?? "Okänd"} → {trip.end_address?.split(",")[0] ?? "Okänd"}
            </SheetTitle>
          </div>
          <p className="text-sm text-muted-foreground">
            {new Date(trip.started_at).toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            {" · "}{formatTime(trip.started_at)}
            {trip.ended_at ? ` – ${formatTime(trip.ended_at)}` : ""}
            {duration ? ` (${duration})` : ""}
          </p>
        </SheetHeader>

        {/* ── Mobile-style stats bar ── */}
        <div className="shrink-0 bg-zinc-900 px-4 py-3 flex items-center justify-around gap-2">
          {[
            { value: formatKm(trip.distance_km),       unit: "DISTANS" },
            { value: formatTime(trip.started_at),       unit: "AVRESETID" },
            { value: duration || "—",                   unit: "RESTID" },
            ...(trip.energy_used_kwh != null
              ? [{ value: `${trip.energy_used_kwh.toFixed(1)} kWh`, unit: "ENERGI" }]
              : []),
            ...(trip.soc_start != null && trip.soc_end != null
              ? [{ value: `${Math.round(trip.soc_start)}→${Math.round(trip.soc_end)}%`, unit: "BATTERI" }]
              : []),
            ...(efficiency != null
              ? [{ value: `${efficiency} Wh/km`, unit: "FÖRBRUKNING" }]
              : []),
          ].map(({ value, unit }) => (
            <div key={unit} className="flex flex-col items-center min-w-0">
              <span className="text-white text-base font-bold leading-tight tabular-nums tracking-tight whitespace-nowrap">{value}</span>
              <span className="text-zinc-400 text-[9px] font-semibold tracking-widest mt-0.5 whitespace-nowrap">{unit}</span>
            </div>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">

          {/* Left / top: grouped stats panel */}
          <div className="w-full md:w-80 shrink-0 md:border-r overflow-y-auto border-b md:border-b-0 px-5 py-4">

            {/* ① Route */}
            <SectionLabel title="Rutt" />
            <div className="flex items-center gap-2 text-sm mb-1">
              <div className="flex flex-col items-center gap-1 shrink-0">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500 block" />
                <span className="w-px flex-1 bg-border block h-5" />
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 block" />
              </div>
              <div className="min-w-0 flex flex-col gap-1">
                <p className="text-sm leading-tight truncate font-medium">{trip.start_address ?? "—"}</p>
                <p className="text-sm leading-tight truncate text-muted-foreground">{trip.end_address ?? "—"}</p>
              </div>
            </div>

            {/* ② Tid & distans */}
            <SectionLabel title="Tid & distans" />
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              <StatItem icon={IconClock}  label="Avresetid"  value={formatTime(trip.started_at)} />
              <StatItem icon={IconClock}  label="Ankomsttid" value={trip.ended_at ? formatTime(trip.ended_at) : "—"} />
              <StatItem icon={IconRoute}  label="Distans"    value={formatKm(trip.distance_km)} />
              <StatItem icon={IconClock}  label="Restid"     value={duration || "—"} />
            </div>

            {/* ③ Energi & kostnad */}
            {(trip.energy_used_kwh != null || trip.cost_kr != null || efficiency != null) && (
              <>
                <SectionLabel title="Energi & kostnad" />
                <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                  {trip.energy_used_kwh != null && (
                    <StatItem icon={IconBolt} label="Energi" value={`${trip.energy_used_kwh.toFixed(2)} kWh`} />
                  )}
                  {trip.cost_kr != null && (
                    <StatItem icon={IconCash} label="Elkostnad" value={`${trip.cost_kr.toFixed(2)} kr`} />
                  )}
                  {efficiency != null && (
                    <StatItem icon={IconGauge} label="Förbrukning" value={`${efficiency} Wh/km`} />
                  )}
                </div>
              </>
            )}

            {/* ④ Batteri */}
            {trip.soc_start != null && trip.soc_end != null && (
              <>
                <SectionLabel title="Batteri" />
                <div className="p-3 rounded-xl bg-muted/50 border">
                  <div className="flex items-center gap-2 mb-2">
                    <IconBatteryCharging className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground">SOC under resa</span>
                    <span className="ml-auto text-xs text-rose-500 font-medium">−{trip.soc_start - trip.soc_end}%</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold w-8 text-right">{trip.soc_start}%</span>
                    <div className="relative flex-1 h-3 rounded-full bg-background overflow-hidden border">
                      {/* Full bar (start) */}
                      <div className="absolute inset-0 rounded-full bg-green-200" style={{ width: `${trip.soc_start}%` }} />
                      {/* Used portion */}
                      <div className="absolute inset-0 rounded-full bg-green-500" style={{ width: `${trip.soc_end}%` }} />
                    </div>
                    <span className="text-sm font-bold w-8 text-muted-foreground">{trip.soc_end}%</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-muted-foreground">Start</span>
                    <span className="text-[10px] text-muted-foreground">Slut</span>
                  </div>
                </div>
              </>
            )}

            {/* ⑤ Förhållanden */}
            {trip.outside_temp_c != null && (
              <>
                <SectionLabel title="Förhållanden" />
                <div className="flex flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 text-xs border rounded-full px-2.5 py-1 bg-muted/40">
                    <IconTemperature className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{trip.outside_temp_c.toFixed(1)} °C</span>
                  </div>
                </div>
              </>
            )}

            {/* ⑥ Anteckning */}
            {trip.notes && (
              <>
                <SectionLabel title="Anteckning" />
                <p className="text-sm text-muted-foreground leading-relaxed border rounded-lg p-2.5 bg-muted/30 italic">
                  {trip.notes}
                </p>
              </>
            )}

            {/* ⑦ Etapper — only for merged trips */}
            {isMerged && (
              <>
                <SectionLabel title={`Etapper (${legs.length})`} />
                <div className="space-y-0">
                  {legs.map((leg, i) => {
                    const legDuration = leg.startedAt && leg.endedAt
                      ? Math.round((new Date(leg.endedAt).getTime() - new Date(leg.startedAt).getTime()) / 60_000)
                      : null;
                    const legEfficiency = leg.energyKwh != null && leg.distanceKm != null && leg.distanceKm > 0
                      ? Math.round((leg.energyKwh / leg.distanceKm) * 100)
                      : null;
                    const gap = gaps[i]; // gap AFTER this leg (before next)
                    const isLast = i === legs.length - 1;
                    const legTagStyle = getTagStyle(leg.tag);
                    const legColors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"];
                    const dotColor = legColors[i % legColors.length]!;

                    return (
                      <div key={i}>
                        {/* Leg card */}
                        <div className="relative pl-5">
                          {/* Vertical connector line */}
                          {!isLast && (
                            <div className="absolute left-1.5 top-6 bottom-0 w-px bg-border" />
                          )}
                          {/* Dot */}
                          <div
                            className="absolute left-0 top-3 w-3.5 h-3.5 rounded-full border-2 border-white shadow-sm"
                            style={{ background: dotColor }}
                          />
                          <div className="pb-1 pt-2">
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-xs font-semibold">Etapp {i + 1}</span>
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 border ${legTagStyle.pill}`}>
                                {tagLabels[leg.tag as TripTag] ?? leg.tag}
                              </Badge>
                            </div>
                            {leg.startAddress && (
                              <p className="text-xs text-muted-foreground truncate">
                                {leg.startAddress.split(",")[0]}
                                {leg.endAddress ? ` → ${leg.endAddress.split(",")[0]}` : ""}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                              {leg.distanceKm != null && (
                                <span className="text-xs text-muted-foreground">{formatKm(leg.distanceKm)}</span>
                              )}
                              {legDuration != null && (
                                <span className="text-xs text-muted-foreground">
                                  {legDuration < 60 ? `${legDuration} min` : `${Math.floor(legDuration / 60)} h ${legDuration % 60} min`}
                                </span>
                              )}
                              {legEfficiency != null && (
                                <span className="text-xs text-muted-foreground">{legEfficiency} Wh/km</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Gap / pause stop between legs */}
                        {gap && !isLast && (
                          <div className="relative pl-5 py-1">
                            <div className="absolute left-1.5 top-0 bottom-0 w-px bg-border" />
                            <div className="absolute left-0.75 top-1/2 -translate-y-1/2 w-2 h-2 bg-amber-400 rotate-45" />
                            <p className="text-[10px] text-muted-foreground/70 italic pl-1">
                              Stopp{gap.durationMin != null ? ` · ${gap.durationMin} min` : ""}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Right / bottom: map panel */}
          <div className="flex-1 p-4 flex flex-col gap-3 min-h-0 overflow-hidden" style={{ minHeight: 320 }}>
            <TripRouteMap trip={trip} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── PeriodSelect ─────────────────────────────────────────────
export function PeriodSelect({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const { t } = useTranslation();
  return (
    <Select value={value} onValueChange={v => onChange(v as Period)}>
      <SelectTrigger className="w-44 h-8 text-sm"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="week">{t("personal.periodWeek")}</SelectItem>
        <SelectItem value="month">{t("personal.periodMonth")}</SelectItem>
        <SelectItem value="quarter">{t("personal.periodQuarter")}</SelectItem>
        <SelectItem value="year">{t("personal.periodYear")}</SelectItem>
      </SelectContent>
    </Select>
  );
}

// ── PeriodCalendarPicker ─────────────────────────────────────
const PERIOD_PRESETS: { value: Period; label: string }[] = [
  { value: "week",    label: "Vecka" },
  { value: "month",   label: "Månad" },
  { value: "quarter", label: "Kvartal" },
  { value: "year",    label: "År" },
];

export function PeriodCalendarPicker({
  value, onChange, customRange, onCustomRangeChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
  customRange: CustomRange | null;
  onCustomRangeChange: (r: CustomRange | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [calRange, setCalRange] = useState<DateRange | undefined>(
    customRange ? { from: customRange.from, to: customRange.to } : undefined
  );

  function selectPreset(p: Period) {
    onChange(p);
    onCustomRangeChange(null);
    setCalRange(undefined);
    setOpen(false);
  }

  function handleCalSelect(range: DateRange | undefined) {
    setCalRange(range);
    if (range?.from && range?.to) {
      onCustomRangeChange({ from: range.from, to: range.to });
      setOpen(false);
    }
  }

  const triggerLabel = customRange
    ? `${format(customRange.from, "d MMM", { locale: sv })} – ${format(customRange.to, "d MMM", { locale: sv })}`
    : PERIOD_PRESETS.find(p => p.value === value)?.label ?? "Period";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-sm font-normal gap-1.5">
          <IconCalendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {triggerLabel}
          <IconChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        {/* Quick presets */}
        <div className="flex gap-1 p-3 pb-2 border-b">
          {PERIOD_PRESETS.map(p => (
            <Button
              key={p.value}
              variant={!customRange && value === p.value ? "default" : "ghost"}
              size="sm"
              className="h-7 text-xs px-3"
              onClick={() => selectPreset(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>
        {/* Calendar range picker */}
        <Calendar
          mode="range"
          selected={calRange}
          onSelect={handleCalSelect}
          locale={sv}
          numberOfMonths={1}
          disabled={{ after: new Date() }}
        />
        {/* Clear custom range */}
        {customRange && (
          <div className="p-2 pt-0 border-t flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => { onCustomRangeChange(null); setCalRange(undefined); setOpen(false); }}
            >
              Rensa val
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ── TagPicker — compact pill trigger → popover grid ─────────
// Used on each trip row for quick inline tagging.
export type TagDef = { name: string; label: string; color: string };

function TagPicker({
  value,
  tagDefs,
  onChange,
}: {
  value: string;
  tagDefs: TagDef[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = tagDefs.find(t => t.name === value) ?? tagDefs.find(t => t.name === "untagged")!;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-semibold border transition-colors hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
          style={{
            backgroundColor: current.color + "22",
            borderColor: current.color + "55",
            color: current.color,
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: current.color }}
          />
          {current.label}
          <IconChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        side="bottom"
        sideOffset={6}
        className="p-1.5 w-48 rounded-xl shadow-xl"
      >
        <div className="flex flex-col gap-0.5">
          {tagDefs.map(td => {
            const active = td.name === value;
            return (
              <button
                key={td.name}
                className={cn(
                  "flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm transition-colors text-left",
                  active
                    ? "font-semibold"
                    : "text-foreground hover:bg-muted/60"
                )}
                style={active ? { backgroundColor: td.color + "18", color: td.color } : {}}
                onClick={() => { onChange(td.name); setOpen(false); }}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0 ring-1 ring-white/60"
                  style={{ backgroundColor: td.color }}
                />
                <span className="flex-1 truncate">{td.label}</span>
                {active && <IconCheck className="h-3.5 w-3.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── TagPickerFull — full-width grid for merging ─────────────
export function TagPickerFull({
  value,
  tagDefs,
  onChange,
  disabled,
}: {
  value: string;
  tagDefs: TagDef[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-1.5",
        tagDefs.length <= 4 ? "grid-cols-4" : "grid-cols-5"
      )}
    >
      {tagDefs.map(td => {
        const active = td.name === value;
        return (
          <button
            key={td.name}
            disabled={disabled}
            onClick={() => onChange(td.name)}
            className={cn(
              "flex flex-col items-center justify-center gap-1.5 px-1.5 py-3 rounded-xl border text-[11px] font-medium transition-all focus:outline-none focus-visible:ring-2 leading-tight",
              active
                ? "border-2 ring-0"
                : "border-border hover:border-muted-foreground/40 hover:bg-muted/30",
              disabled && "opacity-50 cursor-not-allowed"
            )}
            style={
              active
                ? {
                    backgroundColor: td.color + "1a",
                    borderColor: td.color,
                    color: td.color,
                  }
                : { color: "var(--muted-foreground)" }
            }
          >
            <span
              className="w-4 h-4 rounded-full ring-2 ring-white/40 shrink-0"
              style={{ backgroundColor: td.color }}
            />
            <span className="w-full text-center leading-tight wrap-break-word hyphens-auto">{td.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── TripsTab ─────────────────────────────────────────────────
export const SYSTEM_TAGS: TripTag[] = ["work", "commute", "personal", "untagged"];
export const SYSTEM_TAG_COLORS: Record<string, string> = {
  work: "#3b82f6", commute: "#f59e0b", personal: "#10b981", untagged: "#9ca3af",
};

export function TripsTab({
  trips: initialTrips, loading, loadingMore, hasMore, onLoadMore,
  periodTotals, period, onPeriodChange, onSelect,
  customTags = [], customRange, onCustomRangeChange, onRefresh: _onRefresh,
}: {
  trips: TripRow[]; loading: boolean; period: Period;
  loadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => void;
  periodTotals?: { count: number; km: number; kr: number } | null;
  onPeriodChange: (p: Period) => void; onSelect: (t: TripRow) => void;
  customTags?: CustomTag[];
  customRange: CustomRange | null;
  onCustomRangeChange: (r: CustomRange | null) => void;
  onRefresh?: () => void;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tagFilter, setTagFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [tagOverrides, setTagOverrides] = useState<Record<string, string>>({});

  // ── Selection + merge state ──────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkTagging, setBulkTagging] = useState(false);

  // Reset overrides when trips list refreshes
  useEffect(() => { setTagOverrides({}); }, [initialTrips]);

  // System + custom tags unified list
  const allTagDefs = useMemo(() => [
    ...SYSTEM_TAGS.map(name => ({
      name,
      label: { work: t("personal.tagWork"), commute: t("personal.tagCommute"), personal: t("personal.tagPersonal"), untagged: t("personal.tagUntagged") }[name] ?? name,
      color: SYSTEM_TAG_COLORS[name] ?? "#9ca3af",
    })),
    ...customTags.map(ct => ({ name: ct.name, label: ct.name, color: ct.color })),
  ], [customTags, t]);

  const knownTagNames = useMemo(() => new Set(allTagDefs.map(d => d.name)), [allTagDefs]);

  const getTagColor = useCallback(
    (name: string) => allTagDefs.find(d => d.name === name)?.color ?? SYSTEM_TAG_COLORS.untagged,
    [allTagDefs]
  );

  const resolveTag = useCallback(
    (trip: TripRow) => {
      const raw = tagOverrides[trip.id] ?? trip.tag;
      return knownTagNames.has(raw) ? raw : "untagged";
    },
    [tagOverrides, knownTagNames]
  );

  // Optimistic tag save
  async function handleTagChange(tripId: string, newTag: string, prevTag: string) {
    if (!user) return;
    setTagOverrides(prev => ({ ...prev, [tripId]: newTag }));
    const { error } = await supabase
      .from("trips")
      .update({ tag: newTag })
      .eq("id", tripId)
      .eq("user_id", user.id);
    if (error) setTagOverrides(prev => ({ ...prev, [tripId]: prevTag }));
  }

  const trips = useMemo(() =>
    initialTrips.map(tr => tagOverrides[tr.id] ? { ...tr, tag: tagOverrides[tr.id]! } : tr),
  [initialTrips, tagOverrides]);

  const untaggedCount = useMemo(() =>
    trips.filter(tr => tr.tag === "untagged" || !knownTagNames.has(tr.tag)).length,
  [trips, knownTagNames]);

  const needsReviewCount = useMemo(() =>
    trips.filter(tr => tr.needs_review).length,
  [trips]);

  // ── Selection helpers ────────────────────────────────────────
  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setBulkTagOpen(false);
  }

  // ── Bulk tag ─────────────────────────────────────────────────
  async function handleBulkTag(newTag: string) {
    if (!user || selectedIds.size === 0) return;
    setBulkTagging(true);
    const ids = Array.from(selectedIds);
    // Optimistic
    setTagOverrides(prev => {
      const next = { ...prev };
      for (const id of ids) next[id] = newTag;
      return next;
    });
    const { error } = await supabase
      .from("trips")
      .update({ tag: newTag, needs_review: false })
      .in("id", ids)
      .eq("user_id", user.id);
    if (error) {
      // Revert
      setTagOverrides(prev => {
        const next = { ...prev };
        for (const id of ids) delete next[id];
        return next;
      });
    }
    setBulkTagging(false);
    setBulkTagOpen(false);
    exitSelectionMode();
  }

  // ── Merge ── navigate to review page ─────────────────────────
  function handleOpenMergePage() {
    const selectedTrips = trips.filter(tr => selectedIds.has(tr.id));
    navigate("/personal/trips/merge", { state: { trips: selectedTrips, customTags } });
    exitSelectionMode();
  }

  const q = search.trim().toLowerCase();

  const groups = useMemo(() => {
    let filtered = tagFilter === "all" ? trips : trips.filter(tr => {
      const eff = knownTagNames.has(tr.tag) ? tr.tag : "untagged";
      return eff === tagFilter;
    });
    if (q) {
      filtered = filtered.filter(tr =>
        (tr.start_address ?? "").toLowerCase().includes(q) ||
        (tr.end_address   ?? "").toLowerCase().includes(q) ||
        (tr.notes         ?? "").toLowerCase().includes(q)
      );
    }
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
  }, [trips, tagFilter, q, knownTagNames]);

  // When periodTotals is provided (from a server aggregate query) and no local search is active,
  // use the authoritative server count/km/kr — these cover ALL trips in the period, not just the
  // loaded page. Fall back to client-sum when searching (server totals don't reflect the search).
  const summaryDisplay = useMemo(() => {
    if (periodTotals && !q) {
      return { count: periodTotals.count, km: periodTotals.km, kr: periodTotals.kr, partial: false };
    }
    const all = groups.flatMap(g => g.trips);
    return {
      count: all.length,
      km: all.reduce((s, tr) => s + (tr.distance_km ?? 0), 0),
      kr: all.reduce((s, tr) => s + (tr.cost_kr ?? 0), 0),
      partial: !!hasMore && !q,
    };
  }, [periodTotals, q, groups, hasMore]);

  return (
    <div className="space-y-3">
      {/* ── Filter bar ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <PeriodCalendarPicker
          value={period}
          onChange={onPeriodChange}
          customRange={customRange}
          onCustomRangeChange={onCustomRangeChange}
        />
        <Select value={tagFilter} onValueChange={setTagFilter}>
          <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              <span className="flex items-center gap-2">
                {t("personal.filterAll")}
                {untaggedCount > 0 && (
                  <span className="ml-auto text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full px-1.5 py-0">{untaggedCount}</span>
                )}
              </span>
            </SelectItem>
            {allTagDefs.map(td => (
              <SelectItem key={td.name} value={td.name}>
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: td.color }} />
                  {td.label}
                  {td.name === "untagged" && untaggedCount > 0 && (
                    <span className="ml-auto text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full px-1.5 py-0">{untaggedCount}</span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Search */}
        <div className="relative flex-1 min-w-40">
          <IconSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            className="h-8 pl-8 pr-7 text-sm"
            placeholder="Sök adress eller anteckning…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setSearch("")}
            >
              <IconX className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {/* Select button — enters selection/merge mode */}
        {!loading && trips.length >= 2 && !selectionMode && (
          <button
            className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground border rounded-lg transition-colors shrink-0"
            onClick={() => setSelectionMode(true)}
          >
            Välj
          </button>
        )}
        {selectionMode && (
          <button
            className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground border rounded-lg transition-colors shrink-0"
            onClick={exitSelectionMode}
          >
            <IconX className="h-3.5 w-3.5 inline mr-1" />
            Avbryt
          </button>
        )}
      </div>

      {/* ── needs_review banner ── */}
      {!loading && needsReviewCount > 0 && !selectionMode && (
        <button
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-left hover:bg-amber-100 transition-colors group"
          onClick={() => setTagFilter(tagFilter === "untagged" ? "all" : "untagged")}
        >
          <IconAlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-amber-800">
              {needsReviewCount} {needsReviewCount === 1 ? "resa behöver märkas" : "resor behöver märkas"}
            </span>
            <p className="text-xs text-amber-600/80 leading-tight">Klicka för att filtrera på omärkta resor</p>
          </div>
          <IconChevronRight className="h-4 w-4 text-amber-400 group-hover:text-amber-600 transition-colors shrink-0" />
        </button>
      )}

      {/* ── Summary bar ── */}
      {!loading && trips.length > 0 && !selectionMode && (
        <p className="text-xs text-muted-foreground/70 tabular-nums">
          {summaryDisplay.partial && <span title="Visar första sidan — ladda fler för exakt antal">~</span>}
          {summaryDisplay.count} {summaryDisplay.count === 1 ? "resa" : "resor"}
          {" · "}{formatKm(summaryDisplay.km)}
          {summaryDisplay.kr > 0 && <> · {Math.round(summaryDisplay.kr)} kr</>}
        </p>
      )}
      {selectionMode && (
        <p className="text-xs text-muted-foreground/70">
          {selectedIds.size === 0 ? "Klicka på resor för att välja" : `${selectedIds.size} ${selectedIds.size === 1 ? "resa vald" : "resor valda"}`}
        </p>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
            <IconRoute className="h-7 w-7 text-muted-foreground/40" />
          </div>
          <p className="text-sm text-muted-foreground">
            {q ? `Inga resor matchar "${search}"` : t("personal.noTrips")}
          </p>
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
                  const eff = resolveTag(trip);
                  const tagColor = getTagColor(eff);
                  const cost = formatSek(trip.cost_kr);
                  const dur = tripDuration(trip.started_at, trip.ended_at);
                  const isSelected = selectedIds.has(trip.id);
                  return (
                    <div
                      key={trip.id}
                      className={`flex items-center gap-3 px-4 py-3.5 border-b last:border-b-0 transition-colors group ${
                        isSelected ? "bg-blue-50" : "hover:bg-muted/40"
                      }`}
                      style={{ borderLeftWidth: 3, borderLeftStyle: "solid", borderLeftColor: isSelected ? "#3b82f6" : tagColor }}
                    >
                      {/* Selection checkbox */}
                      {selectionMode && (
                        <button
                          className={`w-5 h-5 rounded border shrink-0 flex items-center justify-center transition-colors ${
                            isSelected ? "bg-blue-500 border-blue-500" : "border-gray-300 hover:border-blue-400"
                          }`}
                          onClick={() => toggleSelect(trip.id)}
                        >
                          {isSelected && <IconCheck className="h-3 w-3 text-white" />}
                        </button>
                      )}
                      <button
                        className="flex-1 min-w-0 text-left"
                        onClick={() => selectionMode ? toggleSelect(trip.id) : onSelect(trip)}
                      >
                        <div className="flex items-center gap-1.5 text-sm font-medium leading-tight mb-1">
                          <span className="truncate max-w-36 text-foreground">{trip.start_address?.split(",")[0] ?? "Okänd"}</span>
                          <IconArrowNarrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate max-w-36 text-foreground">{trip.end_address?.split(",")[0] ?? "Okänd"}</span>
                          {trip.notes && <IconNote className="h-3 w-3 shrink-0 text-muted-foreground/50 ml-0.5" title={trip.notes} />}
                          {trip.needs_review && (
                            <IconAlertTriangle className="h-3 w-3 shrink-0 text-amber-500 ml-0.5" title="Behöver märkas" />
                          )}
                          {trip.source === "user_merged" && (
                            <IconLayersLinked className="h-3 w-3 shrink-0 text-blue-400 ml-0.5" title="Sammanslagen resa" />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {formatTime(trip.started_at)}{trip.ended_at ? ` – ${formatTime(trip.ended_at)}` : ""}
                          </span>
                          {dur && <span className="text-xs text-muted-foreground">· {dur}</span>}
                        </div>
                      </button>

                      {/* Inline quick-tag picker — hidden in selection mode */}
                      {!selectionMode && (
                        <div className="shrink-0" onClick={e => e.stopPropagation()}>
                          <TagPicker
                            value={eff}
                            tagDefs={allTagDefs}
                            onChange={v => handleTagChange(trip.id, v, eff)}
                          />
                        </div>
                      )}

                      {/* Metrics */}
                      <button className="text-right shrink-0" onClick={() => selectionMode ? toggleSelect(trip.id) : onSelect(trip)}>
                        <p className="text-sm font-semibold tabular-nums">{formatKm(trip.distance_km)}</p>
                        {cost && <p className="text-xs text-muted-foreground tabular-nums">{cost}</p>}
                        {trip.energy_used_kwh != null && (
                          <p className="text-xs text-blue-500 tabular-nums">{trip.energy_used_kwh.toFixed(1)} kWh</p>
                        )}
                      </button>
                      {!selectionMode && (
                        <IconChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" onClick={() => onSelect(trip)} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Load more ── */}
      {!loading && hasMore && !selectionMode && (
        <div className="flex justify-center pt-2 pb-4">
          <button
            className="text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            onClick={onLoadMore}
            disabled={loadingMore}
          >
            {loadingMore ? "Laddar…" : "Ladda fler resor"}
          </button>
        </div>
      )}

      {/* ── Floating selection action bar ── */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="sticky bottom-4 z-50 flex justify-center">
          <div className="flex items-center gap-2 bg-foreground text-background rounded-2xl px-4 py-2.5 shadow-xl border">
            <span className="text-sm font-medium tabular-nums mr-1">
              {selectedIds.size} {selectedIds.size === 1 ? "vald" : "valda"}
            </span>
            {/* Bulk tag */}
            <div className="relative">
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs gap-1.5 bg-white/10 hover:bg-white/20 text-background border-white/20"
                onClick={() => setBulkTagOpen(b => !b)}
                disabled={bulkTagging}
              >
                Tagga alla
              </Button>
              {bulkTagOpen && (
                <div className="absolute bottom-9 left-0 rounded-xl border bg-background shadow-xl min-w-36 overflow-hidden z-50">
                  {allTagDefs.map(td => (
                    <button
                      key={td.name}
                      className="flex items-center gap-2.5 w-full px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-foreground"
                      onClick={() => handleBulkTag(td.name)}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: td.color }} />
                      {td.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Merge — only if ≥2 selected */}
            {selectedIds.size >= 2 && (
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs gap-1.5 bg-blue-500 hover:bg-blue-600 text-white border-blue-500"
                onClick={handleOpenMergePage}
              >
                <IconLayersLinked className="h-3.5 w-3.5" />
                Slå ihop
              </Button>
            )}
            <button
              className="h-7 w-7 flex items-center justify-center rounded-lg text-background/70 hover:text-background transition-colors"
              onClick={exitSelectionMode}
            >
              <IconX className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Merge is handled by /personal/trips/merge route */}
    </div>
  );
}

// ── StatisticsTab ────────────────────────────────────────────
// Scalability note: This component is OEM-agnostic. All calculations delegate
// to stats-calculations.ts which operates on canonical schema columns only.
// Adding Polestar/Volvo/BMW support = zero changes here; only the bridge
// normalisation layer needs updating.

type VehicleSpec = { battery_kwh_usable: number | null; battery_range_km_wltp: number | null };

/** Collapsible stat card wrapper with optional footer note */
function StatCard({
  title, icon: Icon, iconColor = "#3b82f6", note, href, children,
}: {
  title: string;
  icon: React.ElementType<{ className?: string; style?: React.CSSProperties }>;
  iconColor?: string;
  note?: string;
  href?: string;
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <Card
      className={cn("overflow-hidden", href && "cursor-pointer hover:ring-2 hover:ring-border transition-all")}
      onClick={href ? () => navigate(href) : undefined}
      role={href ? "button" : undefined}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: iconColor + "1a" }}>
            <Icon className="h-4 w-4" style={{ color: iconColor }} />
          </span>
          <CardTitle className="text-sm font-semibold">{title}</CardTitle>
          {href && <IconChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto" />}
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">{children}</CardContent>
      {note && (
        <div className="px-4 pb-3">
          <p className="text-[11px] text-muted-foreground">{note}</p>
        </div>
      )}
    </Card>
  );
}

/** Two-column grid metric row */
function StatRow({ label, value, sub, valueColor }: { label: string; value: string; sub?: string; valueColor?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground shrink-0">{label}</span>
      <span className="text-xs font-semibold tabular-nums text-right" style={valueColor ? { color: valueColor } : undefined}>
        {value}{sub ? <span className="text-[11px] font-normal text-muted-foreground ml-1.5">· {sub}</span> : null}
      </span>
    </div>
  );
}

/** Horizontal progress bar with label and value */
function ProgressBar({ label, pct, color, value }: { label: string; pct: number; color: string; value?: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        {value && <span className="font-medium tabular-nums">{value}</span>}
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min(100, pct * 100)}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// Period pill bar — richer than the old dropdown
const STAT_PERIOD_PILLS: { value: StatPeriod; label: string }[] = [
  { value: "week",    label: "7 dagar" },
  { value: "month",  label: "30 dagar" },
  { value: "quarter",label: "90 dagar" },
  { value: "year",   label: "12 mån" },
  { value: "all",    label: "Alla" },
];

function StatPeriodPills({
  value, onChange, customRange, onCustomRangeChange,
}: {
  value: StatPeriod;
  onChange: (p: StatPeriod) => void;
  customRange: CustomRange | null;
  onCustomRangeChange: (r: CustomRange | null) => void;
}) {
  return (
    <PeriodCalendarPicker
      value={value as Period}
      onChange={p => onChange(p as StatPeriod)}
      customRange={customRange}
      onCustomRangeChange={onCustomRangeChange}
    />
  );
}

export function StatisticsTab({
  trips, chargingSessions = [], customTags = [], vehicle = null,
  loading, period, customRange = null, onPeriodChange, onCustomRangeChange,
}: {
  trips: TripRow[];
  chargingSessions?: ChargingSessionRow[];
  customTags?: CustomTag[];
  vehicle?: VehicleSpec | null;
  loading: boolean;
  period: StatPeriod;
  customRange?: CustomRange | null;
  onPeriodChange: (p: StatPeriod) => void;
  onCustomRangeChange?: (r: CustomRange | null) => void;
}) {
  const { t } = useTranslation();
  const [fuelConfig, setFuelConfig] = useState({
    petrolKrPerL: 18.5, petrolLPer100km: 7.5, dieselKrPerL: 17.5, dieselLPer100km: 6.5,
  });
  const [showFuelConfig, setShowFuelConfig] = useState(false);

  const fuel = useMemo(() => buildFuelComparison(
    fuelConfig.petrolKrPerL, fuelConfig.petrolLPer100km,
    fuelConfig.dieselKrPerL, fuelConfig.dieselLPer100km,
  ), [fuelConfig]);

  const wltpSpec = useMemo(() => computeWltpEfficiency(vehicle), [vehicle]);

  // All stats derived from the canonical aggregation function — same for any OEM
  const stats = useMemo(() => aggregateStats(trips, {
    milersattningPerKm: MILERSATTNING_PER_KM,
    fuel,
    period,
    customFrom: customRange?.from,
    customTo: customRange?.to,
    customTags: customTags.map(ct => ({ id: ct.id, name: ct.name, is_work_tag: ct.is_work_tag })),
  }), [trips, fuel, period, customRange, customTags]);

  const effStats = useMemo(() => computeEfficiencyStats(trips, wltpSpec), [trips, wltpSpec]);
  const chargingStats = useMemo(() => computeChargingStats(chargingSessions, trips), [chargingSessions, trips]);

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

  // Tag distribution data for pie chart — system + custom tags
  const tagDistData = useMemo(() => {
    const rows: { name: string; km: number; count: number; color: string }[] = [
      { name: t("personal.tagWork"),     km: stats.work.km,     count: stats.work.count,     color: TAG_GRAPH_COLORS.work     },
      { name: t("personal.tagCommute"),  km: stats.commute.km,  count: stats.commute.count,  color: TAG_GRAPH_COLORS.commute  },
      { name: t("personal.tagPersonal"), km: stats.personal.km, count: stats.personal.count, color: TAG_GRAPH_COLORS.personal },
      { name: t("personal.tagUntagged"), km: stats.untagged.km, count: stats.untagged.count, color: TAG_GRAPH_COLORS.untagged },
    ];
    for (const ct of customTags) {
      const s = stats.customTagStats.get(ct.name);
      if (s && (s.count > 0 || s.km > 0)) rows.push({ name: ct.name, km: s.km, count: s.count, color: ct.color });
    }
    return rows.filter(r => r.count > 0 || r.km > 0);
  }, [stats, customTags, t]);

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="flex gap-2 flex-wrap">
          {STAT_PERIOD_PILLS.map(p => <div key={p.value} className="h-8 w-20 rounded-lg bg-muted animate-pulse" />)}
        </div>
        <Skeleton className="h-12 rounded-xl w-full" />
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-44 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const note = contextNoteText(stats.totalKm, stats.tripCount, period);

  // Drive style badge based on avg speed
  const driveStyleBadge = stats.avgSpeedKmh > 70
    ? { label: "Motorvägskörare", color: "#EF5350" }
    : stats.avgSpeedKmh > 45
    ? { label: "Blandkörare", color: "#FF9800" }
    : { label: "Stadskörare", color: "#42A5F5" };

  const effColor = effStats && effStats.vsSpec != null && effStats.wltpSpec != null
    ? effStats.vsSpec <= 0 ? "#10b981"
    : effStats.vsSpec <= effStats.wltpSpec * 0.2 ? "#f59e0b"
    : "#ef4444"
    : undefined;

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <StatPeriodPills
        value={period}
        onChange={onPeriodChange}
        customRange={customRange ?? null}
        onCustomRangeChange={onCustomRangeChange ?? (() => {})}
      />

      {/* Compact KPI strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border bg-muted/40 px-4 py-3">
        {/* Total km */}
        <div className="flex items-center gap-2.5">
          <span className="rounded-md p-1.5 shrink-0" style={{ background: "#3b82f620" }}>
            <IconRoute className="h-4 w-4" style={{ color: "#3b82f6" }} />
          </span>
          <div>
            <p className="text-[11px] text-muted-foreground leading-tight">{t("personal.totalKm")}</p>
            <p className="text-sm font-bold tabular-nums leading-snug">
              {Math.round(stats.totalKm).toLocaleString("sv-SE")} km
              <span className="text-[11px] font-normal text-muted-foreground ml-1">· {stats.tripCount} resor</span>
            </p>
          </div>
        </div>
        <div className="h-7 w-px bg-border hidden sm:block shrink-0" />
        {/* Milersättning */}
        <div className="flex items-center gap-2.5">
          <span className="rounded-md p-1.5 shrink-0" style={{ background: "#8b5cf620" }}>
            <IconBriefcase className="h-4 w-4" style={{ color: "#8b5cf6" }} />
          </span>
          <div>
            <p className="text-[11px] text-muted-foreground leading-tight">{t("personal.statCardTaxDeduction")}</p>
            <p className="text-sm font-bold tabular-nums leading-snug">
              {stats.taxDeduction > 0 ? `${Math.round(stats.taxDeduction).toLocaleString("sv-SE")} kr` : "—"}
              <span className="text-[11px] font-normal text-muted-foreground ml-1">· {Math.round(stats.taxKm)} km</span>
            </p>
          </div>
        </div>
        <div className="h-7 w-px bg-border hidden sm:block shrink-0" />
        {/* El-kostnad */}
        <div className="flex items-center gap-2.5">
          <span className="rounded-md p-1.5 shrink-0" style={{ background: "#f59e0b20" }}>
            <IconBolt className="h-4 w-4" style={{ color: "#f59e0b" }} />
          </span>
          <div>
            <p className="text-[11px] text-muted-foreground leading-tight">{t("personal.electricityCost")}</p>
            <p className="text-sm font-bold tabular-nums leading-snug">
              {stats.totalCost > 0 ? `${Math.round(stats.totalCost).toLocaleString("sv-SE")} kr` : "—"}
              {stats.totalKwh > 0 && <span className="text-[11px] font-normal text-muted-foreground ml-1">· {stats.totalKwh.toFixed(1)} kWh</span>}
            </p>
          </div>
        </div>
        <div className="h-7 w-px bg-border hidden sm:block shrink-0" />
        {/* Snittförbrukning */}
        <div className="flex items-center gap-2.5">
          <span className="rounded-md p-1.5 shrink-0" style={{ background: (effColor ?? "#10b981") + "20" }}>
            <IconTrendingUp className="h-4 w-4" style={{ color: effColor ?? "#10b981" }} />
          </span>
          <div>
            <p className="text-[11px] text-muted-foreground leading-tight">{t("personal.statCardAvgConsumption")}</p>
            <p className="text-sm font-bold tabular-nums leading-snug" style={effColor ? { color: effColor } : undefined}>
              {stats.avgEfficiency > 0 ? `${stats.avgEfficiency.toFixed(1)} kWh/100km` : "—"}
              {effStats && effStats.wltpSpec != null && <span className="text-[11px] font-normal text-muted-foreground ml-1" style={{ color: undefined }}>· WLTP {effStats.wltpSpec.toFixed(1)}</span>}
            </p>
          </div>
        </div>
      </div>

      {/* Monthly km chart + tag distribution */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">{t("personal.monthlyKm")}</CardTitle>
              <IconTrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="pt-0 pb-4">
            {chartData.length === 0 ? (
              <div className="flex items-center justify-center h-44">
                <p className="text-sm text-muted-foreground">{t("personal.noData")}</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="blueGradStat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.18} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={40} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="rounded-lg border bg-background px-3 py-2 shadow-md text-sm">
                          <p className="font-medium capitalize">{label}</p>
                          <p className="text-muted-foreground">{(payload[0] as any)?.value} km</p>
                        </div>
                      );
                    }}
                    cursor={{ stroke: "rgba(0,0,0,0.06)", strokeWidth: 28 }}
                  />
                  <Area dataKey="km" stroke="#3b82f6" strokeWidth={2} fill="url(#blueGradStat)" dot={{ fill: "#3b82f6", r: 3 }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ── Tag distribution ── */}
        <StatCard title={t("personal.statCardDistribution")} icon={IconRoute} iconColor="#3b82f6" note={note}>
          {tagDistData.length === 0 ? (
            <p className="text-xs text-muted-foreground">Inga resor denna period</p>
          ) : (
            <div className="flex gap-3 items-start">
              <PieChart width={80} height={80}>
                <Pie data={tagDistData} dataKey="km" cx={36} cy={36} innerRadius={20} outerRadius={34} paddingAngle={2}>
                  {tagDistData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
              </PieChart>
              <div className="flex-1 space-y-1.5 min-w-0 pt-0.5">
                {tagDistData.map(row => (
                  <div key={row.name} className="flex items-center justify-between gap-1 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
                      <span className="text-xs truncate">{row.name}</span>
                    </div>
                    <span className="text-xs tabular-nums shrink-0 ml-2">
                      <span className="font-semibold">{Math.round(row.km)} km</span>
                      <span className="text-[11px] text-muted-foreground ml-1">· {row.count}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </StatCard>
      </div>

      {/* ── Stat cards grid ── */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">

        {/* ── 1. Milersättning ── */}
        <StatCard title={t("personal.statCardTaxDeduction")} icon={IconBriefcase} iconColor="#8b5cf6" note={note}>
          <div className="text-center py-1">
            <p className="text-3xl font-bold tabular-nums" style={{ color: "#8b5cf6" }}>
              {stats.taxDeduction > 0 ? `${Math.round(stats.taxDeduction).toLocaleString("sv-SE")} kr` : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {stats.taxTripCount} tjänsteresor · {Math.round(stats.taxKm)} km
            </p>
          </div>
          <div className="pt-1 space-y-2">
            <StatRow label="Arbete" value={`${Math.round(stats.work.km)} km`} sub={`${stats.work.count} resor`} valueColor="#3b82f6" />
            <StatRow label="Pendling" value={`${Math.round(stats.commute.km)} km`} sub={`${stats.commute.count} resor`} valueColor="#f59e0b" />
            {customTags.filter(ct => ct.is_work_tag).map(ct => {
              const s = stats.customTagStats.get(ct.name);
              if (!s || s.count === 0) return null;
              return <StatRow key={ct.id} label={ct.name} value={`${Math.round(s.km)} km`} sub={`${s.count} resor`} valueColor={ct.color} />;
            })}
            <div className="border-t pt-2">
              <StatRow label="Ersättning per km" value={`${MILERSATTNING_PER_KM} kr/km`} />
            </div>
          </div>
        </StatCard>

        {/* ── 2. Energieffektivitet ── */}
        <StatCard title={t("personal.statCardEfficiency")} icon={IconBolt} iconColor={effColor ?? "#10b981"} note={note} href={`/personal/statistics/efficiency?period=${period}`}>
          {!effStats ? (
            <p className="text-xs text-muted-foreground">Inte tillräckligt med energidata</p>
          ) : (
            <>
              <div className="text-center py-1">
                <p className="text-3xl font-bold tabular-nums" style={{ color: effColor }}>
                  {effStats.avgKwhPer100.toFixed(1)} <span className="text-base font-normal">kWh/100km</span>
                </p>
                <p className="text-xs mt-0.5" style={{ color: effStats.vsSpec != null && effStats.vsSpec <= 0 ? "#10b981" : "#f59e0b" }}>
                  {effStats.vsSpec == null
                    ? "WLTP-jämförelse saknas"
                    : effStats.vsSpec <= 0 ? `${Math.abs(effStats.vsSpec).toFixed(1)} kWh under WLTP ↓` : `${effStats.vsSpec.toFixed(1)} kWh över WLTP ↑`}
                </p>
              </div>
              <div className="space-y-2">
                <StatRow label="WLTP spec" value={effStats.wltpSpec != null ? `${effStats.wltpSpec.toFixed(1)} kWh/100km` : "—"} />
                <StatRow label="Bästa resa" value={`${effStats.bestKwhPer100.toFixed(1)} kWh/100km`} valueColor="#10b981" />
                <StatRow label="Sämsta resa" value={`${effStats.worstKwhPer100.toFixed(1)} kWh/100km`} valueColor="#ef4444" />
                {effStats.avgSocDelta != null && <StatRow label="Snitt SoC-tapp" value={`${effStats.avgSocDelta.toFixed(1)}%`} />}
                {effStats.avgCostPerKm != null && <StatRow label="kr/km" value={`${effStats.avgCostPerKm.toFixed(2)} kr`} />}
                <StatRow label="Resor med energidata" value={`${effStats.tripCount}`} />
              </div>
            </>
          )}
        </StatCard>

        {/* ── 3. Körmönster ── */}
        <StatCard title={t("personal.statCardDriving")} icon={IconTrendingUp} iconColor="#06b6d4" note={note} href={`/personal/statistics/driving?period=${period}`}>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "km/resa",    value: stats.tripCount > 0 ? `${stats.avgTripKm.toFixed(0)} km` : "—" },
              { label: "Längsta resa", value: stats.longestTripKm > 0 ? `${Math.round(stats.longestTripKm)} km` : "—" },
              { label: "Körtid totalt", value: stats.totalDriveMin > 0 ? (stats.totalDriveMin >= 60 ? `${Math.floor(stats.totalDriveMin/60)} h ${stats.totalDriveMin%60} min` : `${stats.totalDriveMin} min`) : "—" },
              { label: "km/dag",     value: stats.periodDays > 0 ? `${(stats.totalKm / stats.periodDays).toFixed(1)} km` : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="rounded-lg bg-muted/50 px-2 py-1.5">
                <p className="text-[11px] text-muted-foreground">{label}</p>
                <p className="text-sm font-bold tabular-nums mt-0.5">{value}</p>
              </div>
            ))}
          </div>
          <div className="pt-1">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="text-xs font-medium">Körstil</span>
              <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: driveStyleBadge.color + "22", color: driveStyleBadge.color }}>
                {driveStyleBadge.label}
              </span>
            </div>
            {/* Time-of-day activity bars */}
            {(() => {
              const buckets = [
                { label: "Morgon",  hours: [5,6,7,8],          color: "#FF9800" },
                { label: "Dag",     hours: [9,10,11,12,13,14,15], color: "#42A5F5" },
                { label: "Kväll",   hours: [16,17,18,19,20],   color: "#AB47BC" },
                { label: "Natt",    hours: [21,22,23,0,1,2,3,4], color: "#78909C" },
              ];
              const counts = buckets.map(b => trips.filter(tr => b.hours.includes(new Date(tr.started_at).getHours())).length);
              const maxCount = Math.max(...counts, 1);
              return (
                <div className="space-y-1">
                  {buckets.map((b, i) => (
                    <ProgressBar key={b.label} label={b.label} pct={(counts[i] ?? 0) / maxCount} color={b.color} value={(counts[i] ?? 0) > 0 ? `${counts[i] ?? 0} resor` : undefined} />
                  ))}
                </div>
              );
            })()}
          </div>
        </StatCard>

        {/* ── 4. Bränslebesparingar ── */}
        <StatCard title={t("personal.statCardFuelSavings")} icon={IconCash} iconColor="#10b981" note={note}>
          <div className="text-center py-1">
            <p className="text-3xl font-bold tabular-nums" style={{ color: stats.savingsVsPetrol >= 0 ? "#10b981" : "#ef4444" }}>
              {stats.totalKm > 0 ? `${Math.round(stats.savingsVsPetrol).toLocaleString("sv-SE")} kr` : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Besparing vs bensin</p>
          </div>
          <div className="space-y-2">
            <StatRow label="Elkostnad (EV)" value={stats.totalCost > 0 ? `${Math.round(stats.totalCost)} kr` : "—"} valueColor="#10b981" />
            <StatRow label="Motsv. bensinkostnad" value={stats.totalKm > 0 ? `${Math.round(stats.petrolEquivalent)} kr` : "—"} />
            <StatRow label="Motsv. dieselkostnad" value={stats.totalKm > 0 ? `${Math.round(stats.dieselEquivalent)} kr` : "—"} />
          </div>
          {/* Comparison bars */}
          {stats.totalKm > 0 && (() => {
            const max = Math.max(stats.totalCost, stats.petrolEquivalent, stats.dieselEquivalent, 1);
            return (
              <div className="space-y-1.5 pt-1">
                <ProgressBar label="EV" pct={stats.totalCost / max} color="#10b981" value={stats.totalCost > 0 ? `${(stats.totalCost / stats.totalKm).toFixed(2)} kr/km` : ""} />
                <ProgressBar label="Bensin" pct={stats.petrolEquivalent / max} color="#f97316" value={`${fuel.petrol.krPerKm.toFixed(2)} kr/km`} />
                <ProgressBar label="Diesel" pct={stats.dieselEquivalent / max} color="#eab308" value={`${fuel.diesel.krPerKm.toFixed(2)} kr/km`} />
              </div>
            );
          })()}
          {/* Fuel price config */}
          <button
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors mt-1"
            onClick={() => setShowFuelConfig(s => !s)}
          >
            {showFuelConfig ? "Dölj inställningar ▲" : "Justera bränslepriser ▼"}
          </button>
          {showFuelConfig && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              {([
                { key: "petrolKrPerL",     label: "Bensin kr/L" },
                { key: "petrolLPer100km",  label: "Bensin L/100km" },
                { key: "dieselKrPerL",     label: "Diesel kr/L" },
                { key: "dieselLPer100km",  label: "Diesel L/100km" },
              ] as const).map(({ key, label }) => (
                <div key={key} className="space-y-0.5">
                  <label className="text-[11px] text-muted-foreground">{label}</label>
                  <input
                    type="number" step="0.1" min="0"
                    value={fuelConfig[key]}
                    onChange={e => setFuelConfig(fc => ({ ...fc, [key]: parseFloat(e.target.value) || 0 }))}
                    className="w-full h-7 rounded border bg-background px-2 text-xs tabular-nums"
                  />
                </div>
              ))}
            </div>
          )}
        </StatCard>

        {/* ── 5. Miljöpåverkan ── */}
        <StatCard title={t("personal.statCardEnvironment")} icon={IconBolt} iconColor="#22c55e" note={note}>
          <div className="text-center py-1">
            <p className="text-3xl font-bold tabular-nums" style={{ color: "#22c55e" }}>
              {stats.totalKm > 0 ? `${Math.round(stats.co2SavedKgVsPetrol)} kg` : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">CO₂ sparat vs bensin</p>
          </div>
          <div className="space-y-2">
            <StatRow label="CO₂ sparat vs diesel" value={stats.totalKm > 0 ? `${Math.round(stats.co2SavedKgVsDiesel)} kg` : "—"} valueColor="#22c55e" />
            <StatRow label="Bensinkört CO₂" value={stats.totalKm > 0 ? `${Math.round(stats.totalKm * fuel.petrol.co2GPerKm / 1000)} kg` : "—"} />
            <StatRow label="Din Tesla CO₂" value={stats.totalKm > 0 ? `${Math.round(stats.totalKm * 3 / 1000)} kg` : "—"} sub="Sv. elnät 3 g/km" />
            {stats.co2SavedKgVsPetrol > 0 && stats.periodDays > 0 && (
              <StatRow
                label="Trädsekvivalent/år"
                value={`${((stats.co2SavedKgVsPetrol / stats.periodDays * 365) / 22).toFixed(1)} träd`}
                valueColor="#22c55e"
              />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <div className="rounded-lg bg-emerald-50 px-2 py-1.5 text-center">
              <p className="text-[11px] text-emerald-600">Din bil</p>
              <p className="text-sm font-bold text-emerald-700 tabular-nums">{stats.totalKm > 0 ? `${Math.round(stats.totalKm * 3 / 1000)} kg` : "—"}</p>
            </div>
            <div className="rounded-lg bg-red-50 px-2 py-1.5 text-center">
              <p className="text-[11px] text-red-600">Bensinbil</p>
              <p className="text-sm font-bold text-red-700 tabular-nums">{stats.totalKm > 0 ? `${Math.round(stats.totalKm * fuel.petrol.co2GPerKm / 1000)} kg` : "—"}</p>
            </div>
          </div>
        </StatCard>

        {/* ── 6. Laddningsbeteende ── */}
        <StatCard title={t("personal.statCardCharging")} icon={IconBolt} iconColor="#f59e0b" note={note}>
          {!chargingStats.hasSocData && !chargingStats.hasChargingData ? (
            <p className="text-xs text-muted-foreground">Ingen laddningsdata för perioden</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-muted/50 px-2 py-1.5 text-center">
                  <p className="text-[11px] text-muted-foreground">Avgångsbatteri</p>
                  <p className="text-base font-bold tabular-nums">
                    {chargingStats.avgDepartureSoc != null ? `${Math.round(chargingStats.avgDepartureSoc)}%` : "—"}
                  </p>
                </div>
                <div className="rounded-lg bg-muted/50 px-2 py-1.5 text-center">
                  <p className="text-[11px] text-muted-foreground">Ankomstbatteri</p>
                  <p
                    className="text-base font-bold tabular-nums"
                    style={{ color: chargingStats.avgArrivalSoc != null
                      ? chargingStats.avgArrivalSoc >= 40 ? "#10b981" : chargingStats.avgArrivalSoc >= 20 ? "#f59e0b" : "#ef4444"
                      : undefined }}
                  >
                    {chargingStats.avgArrivalSoc != null ? `${Math.round(chargingStats.avgArrivalSoc)}%` : "—"}
                  </p>
                </div>
              </div>
              {chargingStats.hasChargingData && (
                <div className="space-y-2">
                  <StatRow label="Total laddkostnad" value={`${Math.round(chargingStats.totalChargeCost).toLocaleString("sv-SE")} kr`} />
                  <StatRow label="Total laddenergi" value={`${chargingStats.totalEnergyKwh.toFixed(1)} kWh`} />
                  <StatRow label="Antal laddningar" value={`${chargingStats.sessionCount}`} />
                  {chargingStats.totalChargeCost > 0 && (
                    <>
                      <ProgressBar label="Hemladdning" pct={chargingStats.homeCostPct} color="#10b981" value={`${Math.round(chargingStats.homeCost)} kr`} />
                      <ProgressBar label="Snabbladdning" pct={chargingStats.scCostPct} color="#ef4444" value={`${Math.round(chargingStats.superchargerCost)} kr`} />
                    </>
                  )}
                </div>
              )}
              {chargingStats.lowBatteryArrivals > 0 && (
                <p className="text-[11px] text-amber-600 flex items-center gap-1">
                  <span>⚠</span>
                  {chargingStats.lowBatteryArrivals} ankomst{chargingStats.lowBatteryArrivals !== 1 ? "er" : ""} under 20%
                </p>
              )}
            </>
          )}
        </StatCard>
      </div>
    </div>
  );
}

// ── (ExportTab removed — replaced by full ExportPage in export.tsx) ─────────
