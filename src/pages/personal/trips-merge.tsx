/**
 * TripsMergePage — full-page merge review for selected trips.
 *
 * Receives trip data via React Router location state:
 *   navigate("/personal/trips/merge", { state: { trips, customTags } })
 *
 * After successful merge, navigates back to /personal/trips (which remounts
 * and re-fetches, giving naturally fresh data).
 */

import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import {
  IconArrowLeft,
  IconLayersLinked,
  IconAlertCircle,
  IconBolt,
  IconRoute,
  IconCoinFilled,
  IconBattery4,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import {
  type TripRow,
  type CustomTag,
  type TagDef,
  SYSTEM_TAGS,
  SYSTEM_TAG_COLORS,
  TagPickerFull,
  formatTime,
  formatKm,
  formatSek,
  tripDuration,
} from "./_shared";

// ── Types ────────────────────────────────────────────────────

type PageState = {
  trips: TripRow[];
  customTags: CustomTag[];
};

// ── Helpers ──────────────────────────────────────────────────

function mostFrequentTag(trips: TripRow[]): string {
  const counts: Record<string, number> = {};
  for (const tr of trips) {
    const tag = tr.tag || "untagged";
    counts[tag] = (counts[tag] ?? 0) + 1;
  }
  return (
    Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "untagged"
  );
}

function svDateLong(iso: string): string {
  return new Date(iso).toLocaleDateString("sv-SE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// ── TripReviewCard ───────────────────────────────────────────

function TripReviewCard({
  trip,
  allTagDefs,
}: {
  trip: TripRow;
  allTagDefs: TagDef[];
}) {
  const tagDef = allTagDefs.find((d) => d.name === trip.tag) ?? allTagDefs.find((d) => d.name === "untagged");
  const tagColor = tagDef?.color ?? "#9ca3af";
  const tagLabel = tagDef?.label ?? trip.tag;
  const dur = tripDuration(trip.started_at, trip.ended_at ?? "");
  const isAlreadyMerged = trip.source === "user_merged";
  const dateStr = svDateLong(trip.started_at);

  return (
    <div className="rounded-xl border overflow-hidden bg-card">
      {/* Colored top stripe */}
      <div className="h-1 w-full" style={{ backgroundColor: tagColor }} />

      <div className="px-5 py-4 space-y-3">
        {/* Row 1: date + badges */}
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold capitalize leading-snug">{dateStr}</span>
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium border"
              style={{
                color: tagColor,
                backgroundColor: tagColor + "18",
                borderColor: tagColor + "40",
              }}
            >
              {tagLabel}
            </span>
            {isAlreadyMerged && (
              <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-800">
                <IconLayersLinked className="w-3 h-3" />
                Sammanslagen
              </span>
            )}
          </div>
        </div>

        {/* Row 2: times + duration */}
        <div className="text-xs text-muted-foreground">
          {formatTime(trip.started_at)}
          {trip.ended_at ? ` – ${formatTime(trip.ended_at)}` : ""}
          {dur ? ` · ${dur}` : ""}
        </div>

        {/* Route visual */}
        <div className="flex items-start gap-3">
          <div className="flex flex-col items-center pt-1 shrink-0 gap-0">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
            <span className="w-px flex-1 min-h-5 bg-border mx-auto" />
            <span className="w-2.5 h-2.5 rounded-full bg-red-400 shrink-0" />
          </div>
          <div className="flex flex-col gap-4 min-w-0 flex-1">
            <p className="text-sm leading-snug wrap-break-word">
              {trip.start_address ?? "Okänd startadress"}
            </p>
            <p className="text-sm text-muted-foreground leading-snug wrap-break-word">
              {trip.end_address ?? "Okänd slutadress"}
            </p>
          </div>
        </div>

        {/* Metrics */}
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground pt-1 border-t">
          {trip.distance_km != null && (
            <span className="flex items-center gap-1">
              <IconRoute className="w-3.5 h-3.5 shrink-0" />
              {formatKm(trip.distance_km)}
            </span>
          )}
          {trip.energy_used_kwh != null && (
            <span className="flex items-center gap-1">
              <IconBolt className="w-3.5 h-3.5 shrink-0" />
              {trip.energy_used_kwh.toFixed(1)} kWh
            </span>
          )}
          {trip.cost_kr != null && (
            <span className="flex items-center gap-1">
              <IconCoinFilled className="w-3.5 h-3.5 shrink-0" />
              {formatSek(trip.cost_kr)}
            </span>
          )}
          {trip.soc_start != null && trip.soc_end != null && (
            <span className="flex items-center gap-1">
              <IconBattery4 className="w-3.5 h-3.5 shrink-0" />
              {trip.soc_start}% → {trip.soc_end}%
            </span>
          )}
        </div>

        {/* Notes */}
        {trip.notes && (
          <p className="text-xs text-muted-foreground italic leading-snug">{trip.notes}</p>
        )}
      </div>
    </div>
  );
}

// ── TripsMergePage ───────────────────────────────────────────

export function TripsMergePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { user } = useAuth();

  const pageState = location.state as PageState | null;

  // Redirect if accessed directly without state
  if (!pageState?.trips?.length) {
    navigate("/personal/trips", { replace: true });
    return null;
  }

  const { trips, customTags = [] } = pageState;

  const allTagDefs: TagDef[] = [
    ...SYSTEM_TAGS.map((name) => ({
      name,
      label: {
        work: t("personal.tagWork"),
        commute: t("personal.tagCommute"),
        personal: t("personal.tagPersonal"),
        untagged: t("personal.tagUntagged"),
      }[name] ?? name,
      color: SYSTEM_TAG_COLORS[name] ?? "#9ca3af",
    })),
    ...customTags.map((ct) => ({ name: ct.name, label: ct.name, color: ct.color })),
  ];

  const [mergeTag, setMergeTag] = useState<string>(() => mostFrequentTag(trips));
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);

  // Sort chronologically for review
  const sortedTrips = [...trips].sort((a, b) => a.started_at.localeCompare(b.started_at));

  // Summary totals
  const totalKm = trips.reduce((s, tr) => s + (tr.distance_km ?? 0), 0);
  const totalEnergy = trips.reduce((s, tr) => s + (tr.energy_used_kwh ?? 0), 0);
  const totalCost = trips.reduce((s, tr) => s + (tr.cost_kr ?? 0), 0);

  async function handleMerge() {
    if (!user) return;
    const { validateMergeSelection, mergeTrips } = await import("@/lib/merge-trips");
    const err = validateMergeSelection(trips);
    if (err) { setMergeError(err); return; }
    setMerging(true);
    setMergeError(null);
    try {
      await mergeTrips(trips, mergeTag, user.id);
      navigate("/personal/trips", { replace: true });
    } catch (e) {
      setMergeError((e as Error).message);
      setMerging(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Sticky top bar */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-muted transition-colors shrink-0"
          aria-label="Gå tillbaka"
        >
          <IconArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-tight truncate">
            Slå ihop {trips.length} resor
          </h1>
          <p className="text-xs text-muted-foreground">Granska ingående resor och välj etikett</p>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 max-w-2xl mx-auto w-full px-4 py-6 space-y-8 pb-32">
        {/* Summary chips */}
        <div className="grid grid-cols-3 divide-x rounded-2xl border overflow-hidden bg-muted/30">
          <div className="flex flex-col items-center gap-0.5 px-3 py-3">
            <span className="text-lg font-semibold">{formatKm(totalKm)}</span>
            <span className="text-xs text-muted-foreground">Totalt</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 px-3 py-3">
            <span className="text-lg font-semibold">{totalEnergy.toFixed(1)} kWh</span>
            <span className="text-xs text-muted-foreground">Energi</span>
          </div>
          <div className="flex flex-col items-center gap-0.5 px-3 py-3">
            <span className="text-lg font-semibold">{formatSek(totalCost)}</span>
            <span className="text-xs text-muted-foreground">Kostnad</span>
          </div>
        </div>

        {/* Trips section */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">
            Ingående resor
          </h2>
          <div className="space-y-3">
            {sortedTrips.map((tr) => (
              <TripReviewCard key={tr.id} trip={tr} allTagDefs={allTagDefs} />
            ))}
          </div>
        </section>

        {/* Tag picker section */}
        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">
            Etikett för sammanslagen resa
          </h2>
          <TagPickerFull value={mergeTag} tagDefs={allTagDefs} onChange={setMergeTag} />
        </section>

        {/* Error */}
        {mergeError && (
          <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <IconAlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            {mergeError}
          </div>
        )}
      </div>

      {/* Sticky bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-10 border-t bg-background/95 backdrop-blur-sm px-4 py-4 flex flex-col gap-2 max-w-2xl mx-auto">
        <Button
          onClick={handleMerge}
          disabled={merging}
          className={cn("w-full h-12 text-base font-semibold rounded-xl")}
        >
          {merging ? "Slår ihop…" : `Bekräfta sammanslagning`}
        </Button>
        <button
          onClick={() => navigate(-1)}
          className="text-xs text-center text-muted-foreground hover:text-foreground transition-colors py-1"
        >
          Avbryt och gå tillbaka
        </button>
      </div>
    </div>
  );
}
