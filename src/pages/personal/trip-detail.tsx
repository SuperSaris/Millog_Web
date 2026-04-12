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
} from "@tabler/icons-react";
import {
  TripRouteMap,
  extractLegs,
  getTagStyle,
  formatTime,
  tripDuration,
  formatKm,
  type TripRow,
  type TripTag,
} from "./_shared";

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

  useEffect(() => {
    if (!id || !user) return;
    setLoading(true);
    setNotFound(false);
    supabase
      .from("trips")
      .select(
        "id, started_at, ended_at, start_address, end_address, start_lat, start_lng, end_lat, end_lng, distance_km, energy_used_kwh, cost_kr, tag, soc_start, soc_end, outside_temp_c, notes, raw_drive_state"
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

  // useMemo must be called unconditionally — before any early returns
  const { legs, gaps } = useMemo(
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

  const tag = (trip.tag ?? "untagged") as TripTag;
  const ts = getTagStyle(tag);
  const tagLabel = tagLabels[tag] ?? trip.tag;
  const duration = tripDuration(trip.started_at, trip.ended_at);
  const efficiency =
    trip.energy_used_kwh && trip.distance_km && trip.distance_km > 0
      ? Math.round((trip.energy_used_kwh / trip.distance_km) * 100)
      : null;

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
    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 pt-4 pb-1.5 first:pt-0">
      {title}
    </p>
  );

  const legColors = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444"];

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
            <Badge className={`border text-xs ${ts.pill}`} variant="outline">
              {tagLabel}
            </Badge>
            {isMerged && (
              <Badge
                variant="outline"
                className="border text-xs bg-blue-50 text-blue-700 border-blue-200 gap-1"
              >
                <IconLayersLinked className="h-3 w-3" />
                {legs.length} etapper
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
      </div>

      {/* ── Two-column body ──────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-5">

        {/* ── LEFT: stats panel ── order-2 on mobile (map shows first) */}
        <div className="lg:w-96 shrink-0 order-2 lg:order-1">

          {/* ① Rutt */}
          <SectionLabel title="Rutt" />
          <div className="flex items-start gap-2 mb-1">
            <div className="flex flex-col items-center gap-1 shrink-0 mt-1">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 block" />
              <span className="w-px flex-1 bg-border block h-4" />
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 block" />
            </div>
            <div className="min-w-0 flex flex-col gap-1.5">
              <p className="text-sm leading-tight truncate font-medium">
                {trip.start_address ?? "—"}
              </p>
              <p className="text-sm leading-tight truncate text-muted-foreground">
                {trip.end_address ?? "—"}
              </p>
            </div>
          </div>

          {/* ② Tid & distans */}
          <SectionLabel title="Tid & distans" />
          <div className="grid grid-cols-2 gap-x-3 gap-y-3">
            <StatItem icon={IconClock} label="Avresetid"  value={formatTime(trip.started_at)} />
            <StatItem icon={IconClock} label="Ankomsttid" value={trip.ended_at ? formatTime(trip.ended_at) : "—"} />
            <StatItem icon={IconRoute} label="Distans"    value={formatKm(trip.distance_km)} />
            <StatItem icon={IconClock} label="Restid"     value={duration || "—"} />
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
                  <span className="ml-auto text-xs text-rose-500 font-medium">
                    −{trip.soc_start - trip.soc_end}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold w-8 text-right">{trip.soc_start}%</span>
                  <div className="relative flex-1 h-3 rounded-full bg-background overflow-hidden border">
                    <div
                      className="absolute inset-0 rounded-full bg-green-200"
                      style={{ width: `${trip.soc_start}%` }}
                    />
                    <div
                      className="absolute inset-0 rounded-full bg-green-500"
                      style={{ width: `${trip.soc_end}%` }}
                    />
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
              <div className="flex items-start gap-2">
                <IconNote className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground leading-relaxed italic">{trip.notes}</p>
              </div>
            </>
          )}

          {/* ⑦ Etapper */}
          {isMerged && (
            <>
              <SectionLabel title={`Etapper (${legs.length})`} />
              <div className="space-y-0">
                {legs.map((leg, i) => {
                  const legDuration =
                    leg.startedAt && leg.endedAt
                      ? Math.round(
                          (new Date(leg.endedAt).getTime() -
                            new Date(leg.startedAt).getTime()) /
                            60_000
                        )
                      : null;
                  const legEfficiency =
                    leg.energyKwh != null &&
                    leg.distanceKm != null &&
                    leg.distanceKm > 0
                      ? Math.round((leg.energyKwh / leg.distanceKm) * 100)
                      : null;
                  const gap = gaps[i];
                  const isLast = i === legs.length - 1;
                  const dotColor = legColors[i % legColors.length]!;
                  const legTagStyle = getTagStyle(leg.tag);

                  return (
                    <div key={i}>
                      <div className="relative pl-5">
                        {!isLast && (
                          <div className="absolute left-1.5 top-6 bottom-0 w-px bg-border" />
                        )}
                        <div
                          className="absolute left-0 top-3 w-3.5 h-3.5 rounded-full border-2 border-background shadow-sm"
                          style={{ background: dotColor }}
                        />
                        <div className="pb-1 pt-2">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-xs font-semibold">Etapp {i + 1}</span>
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 h-4 border ${legTagStyle.pill}`}
                            >
                              {tagLabels[leg.tag as TripTag] ?? leg.tag}
                            </Badge>
                          </div>
                          {leg.startAddress && (
                            <p className="text-xs text-muted-foreground truncate">
                              {leg.startAddress.split(",")[0]}
                              {leg.endAddress
                                ? ` → ${leg.endAddress.split(",")[0]}`
                                : ""}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-x-3 gap-y-0 mt-0.5">
                            {leg.distanceKm != null && (
                              <span className="text-xs text-muted-foreground">
                                {formatKm(leg.distanceKm)}
                              </span>
                            )}
                            {legDuration != null && (
                              <span className="text-xs text-muted-foreground">
                                {legDuration < 60
                                  ? `${legDuration} min`
                                  : `${Math.floor(legDuration / 60)} h ${legDuration % 60} min`}
                              </span>
                            )}
                            {legEfficiency != null && (
                              <span className="text-xs text-muted-foreground">
                                {legEfficiency} Wh/km
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {gap && !isLast && (
                        <div className="relative pl-5 py-0.5">
                          <div className="absolute left-1.5 top-0 bottom-0 w-px bg-border" />
                          <div className="absolute left-0.75 top-1/2 -translate-y-1/2 w-2 h-2 bg-amber-400 rotate-45" />
                          <p className="text-[10px] text-muted-foreground/70 italic pl-1">
                            Stopp
                            {gap.durationMin != null ? ` · ${gap.durationMin} min` : ""}
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

        {/* ── RIGHT: map ── order-1 on mobile (shows above stats) */}
        <div
          className="flex-1 order-1 lg:order-2 flex flex-col rounded-xl overflow-hidden border"
          style={{ minHeight: "min(70vh, 680px)" }}
        >
          <TripRouteMap trip={trip} />
        </div>
      </div>
    </div>
  );
}
