// Trip detail page — full page view for a single trip
// Route: /personal/trips/:id
import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  IconArrowLeft,
  IconBolt,
  IconCash,
  IconClock,
  IconGauge,
  IconRoute,
  IconBatteryCharging,
  IconTemperature,
  IconLayersLinked,
  IconNote,
  IconAlertCircle,
  IconPencil,
  IconCheck,
  IconX,
  IconCar,
  IconCoins,
  IconAlertTriangle,
  IconTrash,
  IconChevronDown,
  IconChevronUp,
} from "@tabler/icons-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TripRouteMap,
  extractLegs,
  getTagStyle,
  formatTime,
  tripDuration,
  formatKm,
  MILERSATTNING_PER_KM,
  type TripRow,
  type TripTag,
} from "./_shared";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

// ── Skeleton ─────────────────────────────────────────────────
function TripDetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 pb-4 border-b">
        <Skeleton className="h-8 w-20 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-5 w-64 rounded" />
          <Skeleton className="h-4 w-44 rounded" />
        </div>
      </div>
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="lg:w-96 space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
        <Skeleton className="flex-1 rounded-2xl" style={{ minHeight: 480 }} />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export function TripDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [trip, setTrip] = useState<TripRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Local editable state — synced from trip after load
  const [localTag, setLocalTag] = useState<TripTag | null>(null);
  const [isSavingTag, setIsSavingTag] = useState(false);
  const [noteEditing, setNoteEditing] = useState(false);
  const [noteValue, setNoteValue] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  // Unmerge state
  const [unmergeConfirm, setUnmergeConfirm] = useState(false);
  const [unmerging, setUnmerging] = useState(false);
  // Delete state
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Köranalys expand state
  const [driveStatsOpen, setDriveStatsOpen] = useState(false);

  useEffect(() => {
    if (!id || !user) return;
    setLoading(true);
    setNotFound(false);
    supabase
      .from("trips")
      .select(
        "id, started_at, ended_at, start_address, end_address, start_lat, start_lng, end_lat, end_lng, distance_km, energy_used_kwh, cost_kr, tag, soc_start, soc_end, outside_temp_c, notes, raw_drive_state, odometer_start_km, odometer_end_km, tariff_kr_per_kwh_used, needs_review, source, vehicle_id"
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) { setNotFound(true); }
        else { setTrip(data as TripRow); }
        setLoading(false);
      });
  }, [id, user]);

  const tagLabels: Record<TripTag, string> = {
    work: t("personal.tagWork"),
    commute: t("personal.tagCommute"),
    personal: t("personal.tagPersonal"),
    untagged: t("personal.tagUntagged"),
  };

  // Sync local editable state when trip data loads
  useEffect(() => {
    if (trip) {
      setLocalTag((trip.tag ?? "untagged") as TripTag);
      setNoteValue(trip.notes ?? "");
    }
  }, [trip?.id]);

  // Tag update — optimistic, reverts on error; also clears needs_review
  async function handleTagChange(newTag: string) {
    if (!trip || !user || newTag === localTag) return;
    const prev = localTag;
    setLocalTag(newTag as TripTag);
    setIsSavingTag(true);
    const updatePayload: Record<string, unknown> = { tag: newTag };
    if (trip.needs_review && newTag !== "untagged") updatePayload.needs_review = false;
    const { error } = await supabase
      .from("trips")
      .update(updatePayload)
      .eq("id", trip.id)
      .eq("user_id", user.id);
    if (error) setLocalTag(prev);
    else setTrip(t => t ? { ...t, tag: newTag as TripTag, needs_review: newTag !== "untagged" ? false : t.needs_review } : t);
    setIsSavingTag(false);
  }

  // Unmerge handler
  async function handleUnmerge() {
    if (!trip || !user) return;
    setUnmerging(true);
    try {
      const { unmergeTrips } = await import("@/lib/merge-trips");
      await unmergeTrips(trip.id, user.id);
      navigate(-1);
    } catch {
      setUnmergeConfirm(false);
    } finally {
      setUnmerging(false);
    }
  }

  // Delete handler
  async function handleDelete() {
    if (!trip || !user) return;
    setDeleting(true);
    const { error } = await supabase
      .from("trips")
      .delete()
      .eq("id", trip.id)
      .eq("user_id", user.id);
    if (!error) {
      navigate(-1);
    } else {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }

  // Note save
  async function handleNoteSave() {
    if (!trip || !user) return;
    setIsSavingNote(true);
    const trimmed = noteValue.trim();
    const { error } = await supabase
      .from("trips")
      .update({ notes: trimmed || null })
      .eq("id", trip.id)
      .eq("user_id", user.id);
    if (!error) {
      setTrip(t => t ? { ...t, notes: trimmed || null } : t);
      setNoteEditing(false);
    }
    setIsSavingNote(false);
  }

  // useMemo must be called unconditionally — before any early returns
  const { legs } = useMemo(
    () => (trip ? extractLegs(trip) : { legs: [], gaps: [] }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trip?.id]
  );
  const isMerged = legs.length > 1;

  if (loading) return <TripDetailSkeleton />;

  if (notFound || !trip) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
          <IconAlertCircle className="h-7 w-7 text-muted-foreground/50" />
        </div>
        <div>
          <p className="text-sm font-semibold">Resan hittades inte</p>
          <p className="text-sm text-muted-foreground mt-0.5">Den kan ha tagits bort eller tillhör ett annat konto.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/personal/trips")}>
          <IconArrowLeft className="h-4 w-4 mr-1" />Tillbaka till resor
        </Button>
      </div>
    );
  }

  const currentTag = (localTag ?? trip.tag ?? "untagged") as TripTag;
  const ts = getTagStyle(currentTag);
  const duration = tripDuration(trip.started_at, trip.ended_at);
  const efficiency =
    trip.energy_used_kwh && trip.distance_km && trip.distance_km > 0
      ? Math.round((trip.energy_used_kwh / trip.distance_km) * 100)
      : null;
  const avgSpeedKmh =
    trip.distance_km && trip.ended_at
      ? Math.round(
          trip.distance_km /
            ((new Date(trip.ended_at).getTime() - new Date(trip.started_at).getTime()) / 3_600_000)
        )
      : null;
  const milersattning =
    (currentTag === "work" || currentTag === "commute") && trip.distance_km
      ? trip.distance_km * MILERSATTNING_PER_KM
      : null;

  const tagOptions: Array<{ key: TripTag; label: string }> = [
    { key: "work",     label: tagLabels.work },
    { key: "commute",  label: tagLabels.commute },
    { key: "personal", label: tagLabels.personal },
    { key: "untagged", label: tagLabels.untagged },
  ];

  // ── Reusable atoms ────────────────────────────────────────
  const StatItem = ({
    icon: Icon, label, value,
  }: {
    icon: React.ElementType<{ className?: string }>; label: string; value: string;
  }) => (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 w-7 h-7 rounded-md bg-muted flex items-center justify-center shrink-0">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
        <p className="text-sm font-semibold leading-snug">{value}</p>
      </div>
    </div>
  );

  const SectionLabel = ({ title }: { title: string }) => (
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 pt-5 pb-2 first:pt-0">
      {title}
    </p>
  );

  return (
    <div className="space-y-4">
      {/* ── Page header ─────────────────────────────────── */}
      <div className="flex items-start gap-3 pb-4 border-b">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mt-0.5 shrink-0"
          onClick={() => navigate(-1)}
        >
          <IconArrowLeft className="h-4 w-4 mr-1" />
          Tillbaka
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <Select
              value={currentTag}
              onValueChange={handleTagChange}
              disabled={isSavingTag}
            >
              <SelectTrigger
                className={`h-auto py-0.5 px-2.5 rounded-full text-xs font-medium border w-auto gap-1.5 shadow-none focus:ring-0 ${ts.pill}`}
              >
                <SelectValue />
                {isSavingTag && <span className="text-[10px] opacity-50 ml-1">...</span>}
              </SelectTrigger>
              <SelectContent>
                {tagOptions.map(({ key, label }) => {
                  const s = getTagStyle(key);
                  return (
                    <SelectItem key={key} value={key} className="text-sm">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full inline-block ${s.dot}`} />
                        {label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {isMerged && (
              <Badge
                variant="outline"
                className="border text-xs bg-blue-50 text-blue-700 border-blue-200 gap-1"
              >
                <IconLayersLinked className="h-3 w-3" />
                {legs.length} etapper
              </Badge>
            )}
            {trip.needs_review && (
              <Badge
                variant="outline"
                className="border text-xs bg-amber-50 text-amber-700 border-amber-200 gap-1"
              >
                <IconAlertTriangle className="h-3 w-3" />
                Behöver märkas
              </Badge>
            )}
          </div>
          <h1 className="text-xl font-bold leading-tight">
            {trip.start_address?.split(",")[0] ?? "Okänd"}{" "}
            <span className="text-muted-foreground font-normal">→</span>{" "}
            {trip.end_address?.split(",")[0] ?? "Okänd"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date(trip.started_at).toLocaleDateString("sv-SE", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
            {" · "}
            {formatTime(trip.started_at)}
            {trip.ended_at ? ` – ${formatTime(trip.ended_at)}` : ""}
            {duration ? ` (${duration})` : ""}
          </p>
        </div>
        {/* ── Header action buttons ── */}
        <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
          {/* Unmerge button — only for user_merged trips */}
          {trip.source === "user_merged" && (
            <>
              {unmergeConfirm ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Slå isär?</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-xs"
                    onClick={handleUnmerge}
                    disabled={unmerging}
                  >
                    {unmerging ? "…" : "Ja"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setUnmergeConfirm(false)} disabled={unmerging}>
                    Avbryt
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => setUnmergeConfirm(true)}
                >
                  <IconLayersLinked className="h-3.5 w-3.5" />
                  Slå isär
                </Button>
              )}
            </>
          )}
          {/* Delete button */}
          {deleteConfirm ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Ta bort?</span>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-xs"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? "…" : "Ja"}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDeleteConfirm(false)} disabled={deleting}>
                Avbryt
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => setDeleteConfirm(true)}
              title="Ta bort resa"
            >
              <IconTrash className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* ── Two-column body ──────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-5">

        {/* ── LEFT: stats panel ── order-2 on mobile (map shows first) */}
        <div className="lg:w-96 shrink-0 order-2 lg:order-1">

          {/* ① Rutt */}
          <SectionLabel title="Rutt" />
          <div className="flex items-start gap-2.5">
            <div className="flex flex-col items-center shrink-0 mt-1">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 block" />
              <span className="w-px bg-border block flex-1" style={{ minHeight: 24 }} />
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 block" />
            </div>
            <div className="min-w-0 flex flex-col gap-3">
              <div className="min-w-0">
                <p className="text-sm leading-snug font-medium truncate">
                  {trip.start_address ?? "—"}
                </p>
                {trip.odometer_start_km != null && (
                  <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                    {Math.round(trip.odometer_start_km).toLocaleString("sv-SE")} km
                  </p>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm leading-snug text-muted-foreground truncate">
                  {trip.end_address ?? "—"}
                </p>
                {trip.odometer_end_km != null && (
                  <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                    {Math.round(trip.odometer_end_km).toLocaleString("sv-SE")} km
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ② Tid & distans */}
          <SectionLabel title="Tid & distans" />
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            <StatItem icon={IconClock} label="Avresetid"     value={formatTime(trip.started_at)} />
            <StatItem icon={IconClock} label="Ankomsttid"    value={trip.ended_at ? formatTime(trip.ended_at) : "—"} />
            <StatItem icon={IconRoute} label="Distans"       value={formatKm(trip.distance_km)} />
            <StatItem icon={IconClock} label="Restid"        value={duration || "—"} />
            {avgSpeedKmh != null && (
              <StatItem icon={IconCar} label="Medelhastighet" value={`${avgSpeedKmh} km/h`} />
            )}
          </div>

          {/* ③ Energi & kostnad */}
          {(trip.energy_used_kwh != null || trip.cost_kr != null || efficiency != null) && (
            <>
              <SectionLabel title="Energi & kostnad" />
              <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                {trip.energy_used_kwh != null && (
                  <StatItem icon={IconBolt}  label="Energi"      value={`${trip.energy_used_kwh.toFixed(2)} kWh`} />
                )}
                {trip.cost_kr != null && (
                  <StatItem icon={IconCash}  label="Elkostnad"   value={`${trip.cost_kr.toFixed(2)} kr`} />
                )}
                {efficiency != null && (
                  <StatItem icon={IconGauge} label="Förbrukning" value={`${efficiency} Wh/km`} />
                )}
              </div>              {trip.tariff_kr_per_kwh_used != null && (
                <p className="text-[10px] text-muted-foreground/60 mt-2">
                  Beräknat med {trip.tariff_kr_per_kwh_used.toFixed(2)} kr/kWh
                </p>
              )}
            </>
          )}

          {/* ③b Milersättning — only for work/commute trips */}
          {milersattning != null && (
            <>
              <SectionLabel title="Milersättning" />
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-md bg-emerald-100 flex items-center justify-center shrink-0">
                      <IconCoins className="h-3.5 w-3.5 text-emerald-600" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-emerald-800">Underlag för milersättning</p>
                      <p className="text-[10px] text-emerald-600/80">
                        {formatKm(trip.distance_km)} × {MILERSATTNING_PER_KM} kr/km
                      </p>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-emerald-700 tabular-nums shrink-0">
                    {milersattning.toFixed(2)} kr
                  </span>
                </div>
              </div>            </>
          )}

          {/* ④ Batteri */}
          {trip.soc_start != null && trip.soc_end != null && (
            <>
              <SectionLabel title="Batteri" />
              <div className="p-3 rounded-xl bg-muted/50 border">
                <div className="flex items-center gap-2 mb-3">
                  <IconBatteryCharging className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">SOC under resa</span>
                  <span className="ml-auto text-xs text-muted-foreground font-medium">
                    −{Math.round(trip.soc_start - trip.soc_end)}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold w-10 shrink-0 text-right tabular-nums">
                    {Math.round(trip.soc_start)}%
                  </span>
                  <div className="relative flex-1 h-3 rounded-full bg-background overflow-hidden border">
                    <div
                      className="absolute inset-0 rounded-full bg-green-200"
                      style={{ width: `${Math.round(trip.soc_start)}%` }}
                    />
                    <div
                      className="absolute inset-0 rounded-full bg-green-500"
                      style={{ width: `${Math.round(trip.soc_end)}%` }}
                    />
                  </div>
                  <span className="text-sm font-bold w-10 shrink-0 text-muted-foreground tabular-nums">
                    {Math.round(trip.soc_end)}%
                  </span>
                </div>
                <div className="flex justify-between mt-1.5">
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
              <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                <StatItem icon={IconTemperature} label="Temperatur" value={`${trip.outside_temp_c.toFixed(1)} °C`} />
              </div>
            </>
          )}

          {/* ⑤b Köranalys — collapsible section, only for telemetry trips with speed data */}
          {(() => {
            const raw = trip.raw_drive_state;
            const speedPoints: number[] = [];
            if (raw && Array.isArray((raw as Record<string,unknown>)["route_points"])) {
              for (const p of (raw as Record<string,unknown>)["route_points"] as unknown[]) {
                const pt = p as Record<string,unknown>;
                if (typeof pt["speed_kmh"] === "number") speedPoints.push(pt["speed_kmh"] as number);
              }
            }
            const hasSpeedData = speedPoints.length >= 10;
            if (!hasSpeedData) return null;

            const BANDS = [
              { key: "city",    label: "Stad",     color: "#4FC3F7", minKmh: 0,   maxKmh: 50  },
              { key: "mixed",   label: "Blandat",  color: "#FFB74D", minKmh: 50,  maxKmh: 90  },
              { key: "road",    label: "Landsväg", color: "#66BB6A", minKmh: 90,  maxKmh: 110 },
              { key: "highway", label: "Motorväg", color: "#EF5350", minKmh: 110, maxKmh: Infinity },
            ];
            const total = speedPoints.length;
            const bandCounts = BANDS.map(b => ({
              ...b,
              count: speedPoints.filter(s => s >= b.minKmh && s < b.maxKmh).length,
            }));
            const pieData = bandCounts.filter(b => b.count > 0).map(b => ({ name: b.label, value: b.count, color: b.color }));
            const maxSpeed = Math.max(...speedPoints);
            const avgSpeed = Math.round(speedPoints.reduce((s, v) => s + v, 0) / total);
            const idlePct = Math.round((speedPoints.filter(s => s < 3).length / total) * 100);
            const highwayPct = Math.round(((bandCounts.find(b => b.key === "highway")?.count ?? 0) / total) * 100);

            return (
              <>
                <button
                  className="flex items-center justify-between w-full pt-5 pb-2 first:pt-0 group"
                  onClick={() => setDriveStatsOpen(o => !o)}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    Köranalys
                  </p>
                  {driveStatsOpen
                    ? <IconChevronUp className="h-3.5 w-3.5 text-muted-foreground/50" />
                    : <IconChevronDown className="h-3.5 w-3.5 text-muted-foreground/50" />}
                </button>
                {driveStatsOpen && (
                  <div className="space-y-3">
                    {/* Stats row */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                      <StatItem icon={IconGauge} label="Maxhastighet"   value={`${Math.round(maxSpeed)} km/h`} />
                      <StatItem icon={IconGauge} label="Medelhastighet" value={`${avgSpeed} km/h`} />
                      <StatItem icon={IconClock} label="Stillestånd"    value={`${idlePct}%`} />
                      <StatItem icon={IconRoute} label="Motorväg"       value={`${highwayPct}%`} />
                    </div>
                    {/* Speed band distribution bars */}
                    <div className="space-y-2">
                      {bandCounts.map(band => {
                        const pct = total > 0 ? Math.round((band.count / total) * 100) : 0;
                        return (
                          <div key={band.key} className="flex items-center gap-2">
                            <span className="text-[11px] text-muted-foreground w-16 shrink-0">{band.label}</span>
                            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${pct}%`, backgroundColor: band.color }}
                              />
                            </div>
                            <span className="text-[11px] text-muted-foreground w-8 text-right tabular-nums shrink-0">{pct}%</span>
                          </div>
                        );
                      })}
                    </div>
                    {/* Mini donut chart */}
                    {pieData.length > 0 && (
                      <div className="flex items-center justify-center">
                        <ResponsiveContainer width={120} height={120}>
                          <PieChart>
                            <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={32} outerRadius={50} paddingAngle={2} startAngle={90} endAngle={-270}>
                              {pieData.map((entry, i) => (
                                <Cell key={i} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              content={({ active, payload }) => {
                                if (!active || !payload?.length) return null;
                                const d = payload[0]!;
                                const pct = Math.round(((d.value as number) / total) * 100);
                                return (
                                  <div className="rounded-lg border bg-background px-2.5 py-1.5 shadow-md text-xs">
                                    <p className="font-medium">{d.name}</p>
                                    <p className="text-muted-foreground">{pct}%</p>
                                  </div>
                                );
                              }}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                )}
              </>
            );
          })()}

          {/* ⑥ Anteckning */}
          <>
            <div className="flex items-center justify-between pt-5 pb-2 first:pt-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">Anteckning</p>
              {!noteEditing && (
                <button
                  onClick={() => setNoteEditing(true)}
                  className="text-muted-foreground/50 hover:text-muted-foreground transition-colors p-0.5 rounded"
                  title={trip.notes ? "Redigera anteckning" : "Lägg till anteckning"}
                >
                  <IconPencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {noteEditing ? (
              <div className="space-y-2">
                <textarea
                  className="w-full text-sm border rounded-lg p-2.5 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring min-h-20"
                  value={noteValue}
                  onChange={e => setNoteValue(e.target.value)}
                  placeholder="Skriv en anteckning..."
                  autoFocus
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleNoteSave} disabled={isSavingNote}>
                    <IconCheck className="h-3.5 w-3.5 mr-1" />
                    {isSavingNote ? "Sparar..." : "Spara"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => { setNoteEditing(false); setNoteValue(trip.notes ?? ""); }}
                    disabled={isSavingNote}
                  >
                    <IconX className="h-3.5 w-3.5 mr-1" />Avbryt
                  </Button>
                </div>
              </div>
            ) : trip.notes ? (
              <div className="flex items-start gap-2">
                <IconNote className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground leading-relaxed italic">{trip.notes}</p>
              </div>
            ) : (
              <button
                onClick={() => setNoteEditing(true)}
                className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors flex items-center gap-1.5"
              >
                <IconPencil className="h-3.5 w-3.5" />
                Lägg till anteckning
              </button>
            )}
          </>

          {/* ⑦ Etapper are shown as an overlay panel on the map itself — see TripRouteMap */}
        </div>

        {/* ── RIGHT: map ── order-1 on mobile (shows above stats) */}
        <div
          className="flex-1 order-1 lg:order-2"
          style={{ minHeight: "max(65vh, 520px)" }}
        >
          <TripRouteMap trip={trip} />
        </div>
      </div>
    </div>
  );
}
