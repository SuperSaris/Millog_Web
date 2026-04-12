// _shared.tsx — reusable types, constants, helpers, and trip components for personal section
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
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
  IconDownload,
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
  IconFileExport,
  IconLayersLinked,
} from "@tabler/icons-react";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
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
  tag: TripTag;
  soc_start: number | null;
  soc_end: number | null;
  outside_temp_c: number | null;
  notes: string | null;
  raw_drive_state: Record<string, unknown> | null;
};

export type Period = "week" | "month" | "quarter" | "year";

type LatLng = { lat: number; lng: number };

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
      if (lat !== null && lng !== null) out.push({ lat, lng });
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
      if (lat !== null && lng !== null) out.push({ lat, lng });
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
export function MapBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length >= 2) {
      map.fitBounds(points.map(p => [p.lat, p.lng] as [number, number]), { padding: [24, 24] });
    } else if (points.length === 1) {
      const pt = points[0]!;
      map.setView([pt.lat, pt.lng], 14);
    }
  }, [points, map]);
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

// ── TripRouteMap ─────────────────────────────────────────────
type PlaySpeed = 0.5 | 1 | 2;
const SPEED_LABELS: Record<PlaySpeed, string> = { 0.5: "0.5×", 1: "1×", 2: "2×" };
const BASE_INTERVAL_MS = 60; // at 1×

export function TripRouteMap({ trip }: { trip: TripRow }) {
  const { legs, gaps, allPoints } = useMemo(() => extractLegs(trip), [trip.id]);
  const hasRoute = allPoints.length >= 2;
  const startPt = hasRoute ? allPoints[0]! : (trip.start_lat != null ? { lat: trip.start_lat!, lng: trip.start_lng! } : null);
  const endPt   = hasRoute ? allPoints[allPoints.length - 1]! : (trip.end_lat != null ? { lat: trip.end_lat!, lng: trip.end_lng! } : null);
  const isMerged = legs.length > 1;

  const [playing, setPlaying] = useState(false);
  const [playIdx, setPlayIdx] = useState(0);
  const [speed, setSpeed] = useState<PlaySpeed>(1);
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

  return (
    <div className="flex-1 flex flex-col gap-2 min-h-0">
      {/* Map canvas */}
      <div className="flex-1 rounded-xl overflow-hidden border relative" style={{ minHeight: 300 }}>
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
          <MapBounds points={hasRoute ? allPoints : mapPoints} />

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
          {/* Leg stop markers (diamond) — shown always on merged trips */}
          {pauseMarkers.map((pt, i) => (
            <Marker key={`pause-${i}`} position={[pt.lat, pt.lng]} icon={legStopIcon} />
          ))}
        </MapContainer>

        {/* Legend */}
        <div className="absolute bottom-3 left-3 flex items-center gap-2 bg-white/90 backdrop-blur-sm border rounded-lg px-2.5 py-1.5 shadow-sm pointer-events-none">
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
      </div>

      {/* Playback controls + scrubber */}
      {hasRoute && (
        <div className="space-y-1.5">
          {/* Timeline scrubber with per-leg segments */}
          <div
            ref={scrubBarRef}
            className="relative h-2 rounded-full overflow-hidden cursor-pointer bg-muted"
            onClick={handleScrubClick}
            title="Klicka för att hoppa till position"
          >
            {isMerged && legBoundaries.length > 1 ? (
              /* Coloured segments per leg */
              legBoundaries.slice(0, -1).map((start, i) => {
                const end = legBoundaries[i + 1]!;
                const total = allPoints.length;
                const left = (start / total) * 100;
                const width = ((end - start) / total) * 100;
                const legColors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"];
                const col = legColors[i % legColors.length]!;
                const gapAfter = i < legs.length - 1;
                return (
                  <div
                    key={i}
                    className="absolute top-0 h-full"
                    style={{ left: `${left}%`, width: `${width - (gapAfter ? 0.5 : 0)}%`, background: col, opacity: 0.4 }}
                  />
                );
              })
            ) : null}
            {/* Played portion overlay */}
            <div
              className="absolute top-0 left-0 h-full bg-blue-500 transition-none"
              style={{ width: `${progress * 100}%`, opacity: 0.85 }}
            />
            {/* Scrub handle */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-blue-500 shadow pointer-events-none"
              style={{ left: `calc(${progress * 100}% - 6px)` }}
            />
          </div>

          {/* Buttons row */}
          <div className="flex items-center gap-2">
            {!playing ? (
              <Button size="sm" onClick={playIdx > 0 && playIdx < allPoints.length - 1 ? resumePlay : startPlay} className="gap-1.5">
                <IconPlayerPlay className="h-3.5 w-3.5" />
                {playIdx > 0 && playIdx < allPoints.length - 1 ? "Fortsätt" : "Spela rutt"}
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={pausePlay} className="gap-1.5">
                <IconPlayerPause className="h-3.5 w-3.5" />Paus
              </Button>
            )}
            {playing && (
              <Button size="sm" variant="ghost" onClick={stopPlay} className="gap-1.5 text-muted-foreground">
                <IconPlayerStop className="h-3.5 w-3.5" />
              </Button>
            )}

            {/* Speed selector */}
            <div className="flex items-center gap-1 ml-1 select-none">
              {([0.5, 1, 2] as PlaySpeed[]).map(s => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                    speed === s
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border text-muted-foreground hover:border-foreground"
                  }`}
                >
                  {SPEED_LABELS[s]}
                </button>
              ))}
            </div>

            <span className="text-xs text-muted-foreground ml-auto">
              {allPoints.length} koordinater{isMerged ? ` · ${legs.length} etapper` : ""}
            </span>
          </div>
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

// ── TripsTab ─────────────────────────────────────────────────
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
          <SelectTrigger className="w-36 h-8 text-sm"><SelectValue /></SelectTrigger>
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
                          <span className="truncate max-w-40 text-foreground">{trip.start_address?.split(",")[0] ?? "Okänd"}</span>
                          <IconArrowNarrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="truncate max-w-40 text-foreground">{trip.end_address?.split(",")[0] ?? "Okänd"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {formatTime(trip.started_at)}{trip.ended_at ? ` – ${formatTime(trip.ended_at)}` : ""}
                          </span>
                          {dur && <span className="text-xs text-muted-foreground">· {dur}</span>}
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

// ── StatisticsTab ────────────────────────────────────────────
export function StatisticsTab({ trips, loading, period, onPeriodChange }: {
  trips: TripRow[]; loading: boolean; period: Period; onPeriodChange: (p: Period) => void;
}) {
  const { t } = useTranslation();

  const stats = useMemo(() => {
    const totalKm  = trips.reduce((s, tr) => s + (tr.distance_km ?? 0), 0);
    const workKm   = trips.filter(tr => tr.tag === "work" || tr.tag === "commute").reduce((s, tr) => s + (tr.distance_km ?? 0), 0);
    const elCost   = trips.reduce((s, tr) => s + (tr.cost_kr ?? 0), 0);
    const milerKr  = workKm * MILERSATTNING_PER_KM;
    const totalKwh = trips.reduce((s, tr) => s + (tr.energy_used_kwh ?? 0), 0);
    const tagCounts: Record<TripTag, number> = { work: 0, commute: 0, personal: 0, untagged: 0 };
    for (const tr of trips) {
      const tag = (tr.tag ?? "untagged") as TripTag;
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
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
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, { label, km }]) => ({ month: label, km: Math.round(km) }));
  }, [trips]);

  const sparkData = chartData.map(d => d.km);
  const totalTrips = trips.length;

  const tagRows: { key: TripTag; label: string }[] = [
    { key: "work",     label: t("personal.tagWork")     },
    { key: "commute",  label: t("personal.tagCommute")  },
    { key: "personal", label: t("personal.tagPersonal") },
    { key: "untagged", label: t("personal.tagUntagged") },
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
      <PeriodSelect value={period} onChange={onPeriodChange} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title={t("personal.totalKm")}        value={`${Math.round(stats.totalKm).toLocaleString("sv-SE")} km`}     sub={`${totalTrips} ${t("personal.tripsCount").toLowerCase()}`} icon={IconRoute}     color="#3b82f6" sparkData={sparkData} />
        <KpiCard title={t("personal.workKm")}         value={`${Math.round(stats.workKm).toLocaleString("sv-SE")} km`}      sub={`${t("personal.tagWork")} + ${t("personal.tagCommute")}`}  icon={IconBriefcase} color="#8b5cf6" />
        <KpiCard title={t("personal.electricityCost")} value={stats.elCost > 0 ? `${Math.round(stats.elCost).toLocaleString("sv-SE")} kr` : "—"} sub={stats.totalKwh > 0 ? `${stats.totalKwh.toFixed(1)} kWh totalt` : undefined} icon={IconBolt} color="#f59e0b" />
        <KpiCard title={t("personal.milersattning")}  value={stats.milerKr > 0 ? `${Math.round(stats.milerKr).toLocaleString("sv-SE")} kr` : "—"} sub={`${MILERSATTNING_PER_KM} kr/km`} icon={IconCash} color="#10b981" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">{t("personal.monthlyKm")}</CardTitle>
              <IconTrendingUp className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <div className="px-6 pb-6">
            {chartData.length === 0 ? (
              <div className="flex items-center justify-center h-44">
                <p className="text-sm text-muted-foreground">{t("personal.noData")}</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
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
          </div>
        </Card>
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

// ── ExportTab ────────────────────────────────────────────────
export function ExportTab({ trips, period, onPeriodChange }: {
  trips: TripRow[]; period: Period; onPeriodChange: (p: Period) => void;
}) {
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
            { key: "pdf",  label: "PDF",   icon: IconFileExport },
            { key: "xlsx", label: "Excel", icon: IconDownload   },
            { key: "csv",  label: "CSV",   icon: IconDownload   },
          ] as const).map(({ key, label, icon: Icon }) => (
            <Button key={key} variant="outline" className="flex-1 gap-2" disabled>
              <Icon className="h-4 w-4" />{label}
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
