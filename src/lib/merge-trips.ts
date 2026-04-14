/**
 * Trip merging/unmerging logic for the web app.
 * Ported from Millog mobile (lib/merge-trips.ts) — same Supabase schema.
 * Supercharger / stops columns omitted (not used in the web UI).
 */

import { supabase } from "@/lib/supabase";
import type { TripRow } from "@/pages/personal/_shared";

// ── Types ────────────────────────────────────────────────────

/** Summary of one leg inside a merged trip (stored in raw_drive_state.merged_legs). */
export type MergedLeg = {
  trip_id: string;
  started_at: string;
  ended_at: string | null;
  start_address: string | null;
  end_address: string | null;
  distance_km: number | null;
  energy_used_kwh: number | null;
  cost_kr: number | null;
  soc_start: number | null;
  soc_end: number | null;
  odometer_start_km: number | null;
  odometer_end_km: number | null;
  tag: string;
};

// ── Constants ────────────────────────────────────────────────

export const MAX_MERGE_TRIPS = 15;

// ── Validation ───────────────────────────────────────────────

export function validateMergeSelection(trips: TripRow[]): string | null {
  if (trips.length < 2) return "Välj minst 2 resor att slå ihop.";
  if (trips.length > MAX_MERGE_TRIPS)
    return `Maximalt ${MAX_MERGE_TRIPS} resor kan slås ihop.`;
  const vehicleIds = new Set(trips.map(t => t.vehicle_id).filter(Boolean));
  if (vehicleIds.size > 1) return "Alla resor måste tillhöra samma fordon.";
  return null;
}

// ── Merge ────────────────────────────────────────────────────

export async function mergeTrips(
  trips: TripRow[],
  tag: string,
  userId: string,
): Promise<TripRow> {
  const validationError = validateMergeSelection(trips);
  if (validationError) throw new Error(validationError);

  // Expand any user_merged trips in the selection — replace them with their component legs
  let allTrips: TripRow[] = trips.filter(t => t.source !== "user_merged");
  const oldMergedTripIds: string[] = [];

  for (const mergedTrip of trips.filter(t => t.source === "user_merged")) {
    const { data: components } = await supabase
      .from("trips")
      .select(
        "id, vehicle_id, source, started_at, ended_at, start_address, end_address, " +
        "start_lat, start_lng, end_lat, end_lng, distance_km, energy_used_kwh, cost_kr, " +
        "soc_start, soc_end, odometer_start_km, odometer_end_km, tag, needs_review, superseded_by",
      )
      .eq("superseded_by", mergedTrip.id)
      .eq("user_id", userId);
    if (components && components.length > 0) {
      allTrips = [...allTrips, ...(components as unknown as TripRow[])];
      oldMergedTripIds.push(mergedTrip.id);
    }
  }

  if (allTrips.length < 2) throw new Error("Välj minst 2 resor att slå ihop.");
  if (allTrips.length > MAX_MERGE_TRIPS)
    throw new Error(`Maximalt ${MAX_MERGE_TRIPS} resor kan slås ihop.`);

  // Sort chronologically
  const sorted = [...allTrips].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime(),
  );

  const first = sorted[0]!;
  const last  = sorted[sorted.length - 1]!;

  // Aggregate metrics
  const totalDistance = sorted.reduce((sum, t) => sum + (t.distance_km ?? 0), 0);
  const totalEnergy   = sorted.reduce((sum, t) => sum + (t.energy_used_kwh ?? 0), 0);
  const totalCost     = sorted.reduce((sum, t) => sum + (t.cost_kr ?? 0), 0);

  // Build per-leg summaries (stored in raw_drive_state.merged_legs)
  const mergedLegs: MergedLeg[] = sorted.map(t => ({
    trip_id:          t.id,
    started_at:       t.started_at,
    ended_at:         t.ended_at,
    start_address:    t.start_address,
    end_address:      t.end_address,
    distance_km:      t.distance_km,
    energy_used_kwh:  t.energy_used_kwh,
    cost_kr:          t.cost_kr,
    soc_start:        t.soc_start,
    soc_end:          t.soc_end,
    odometer_start_km: t.odometer_start_km,
    odometer_end_km:  t.odometer_end_km,
    tag:              t.tag,
  }));

  // Fetch route data from component trips
  // (raw_drive_state is intentionally excluded from list SELECT — fetch it now)
  const componentIds = sorted.map(t => t.id);
  const { data: routeRows } = await supabase
    .from("trips")
    .select("id, raw_drive_state, outside_temp_c")
    .in("id", componentIds)
    .eq("user_id", userId);

  type RouteRow = { raw_drive_state: Record<string, unknown> | null; outside_temp_c: number | null };
  const routeById = new Map<string, RouteRow>();
  if (routeRows) {
    for (const row of routeRows) {
      routeById.set(row.id, {
        raw_drive_state: row.raw_drive_state && typeof row.raw_drive_state === "object"
          ? (row.raw_drive_state as Record<string, unknown>)
          : null,
        outside_temp_c: (row.outside_temp_c ?? null) as number | null,
      });
    }
  }

  // Distance-weighted average outside temperature
  const legsWithTemp = sorted.filter(t => routeById.get(t.id)?.outside_temp_c != null && (t.distance_km ?? 0) > 0);
  const numerator    = legsWithTemp.reduce((sum, t) => sum + routeById.get(t.id)!.outside_temp_c! * (t.distance_km ?? 0), 0);
  const denominator  = legsWithTemp.reduce((sum, t) => sum + (t.distance_km ?? 0), 0);
  const mergedOutsideTemp = denominator > 0 ? parseFloat((numerator / denominator).toFixed(2)) : null;

  // Combine route_fragments, route_gaps, and route_points from all legs
  const allFragments:   unknown[] = [];
  const allGaps:        unknown[] = [];
  const allRoutePoints: unknown[] = [];
  let fragCounter = 0;
  let gapCounter  = 0;

  for (let i = 0; i < sorted.length; i++) {
    const t   = sorted[i]!;
    const raw = routeById.get(t.id)?.raw_drive_state;

    const hasFragments  = raw && Array.isArray(raw.route_fragments) && (raw.route_fragments as unknown[]).length > 0;
    const hasRoutePoints = raw && Array.isArray(raw.route_points)  && (raw.route_points  as unknown[]).length >= 2;

    if (hasFragments) {
      for (const frag of raw.route_fragments as unknown[]) {
        fragCounter++;
        allFragments.push({ ...(frag as object), id: `merged-frag-${fragCounter}` });
      }
    } else if (hasRoutePoints) {
      // Synthesise a fragment from route_points for consistent display
      fragCounter++;
      allFragments.push({
        id: `merged-frag-${fragCounter}`,
        label: `Etapp ${i + 1}`,
        confidence: "high",
        coordinates: raw.route_points,
        observed: true,
      });
    }

    if (raw && Array.isArray(raw.route_gaps)) {
      for (const gap of raw.route_gaps as unknown[]) {
        gapCounter++;
        allGaps.push({ ...(gap as object), id: `merged-gap-${gapCounter}` });
      }
    }

    if (raw && Array.isArray(raw.route_points)) {
      allRoutePoints.push(...(raw.route_points as unknown[]));
    }
  }

  const mergedRawDriveState: Record<string, unknown> = { merged_legs: mergedLegs };
  if (allFragments.length   > 0) mergedRawDriveState.route_fragments = allFragments;
  if (allGaps.length        > 0) mergedRawDriveState.route_gaps      = allGaps;
  if (allRoutePoints.length > 0) mergedRawDriveState.route_points    = allRoutePoints;

  // Insert merged trip
  const { data: inserted, error: insertError } = await supabase
    .from("trips")
    .insert({
      user_id:           userId,
      vehicle_id:        first.vehicle_id,
      started_at:        first.started_at,
      ended_at:          last.ended_at,
      start_address:     first.start_address,
      end_address:       last.end_address,
      start_lat:         first.start_lat,
      start_lng:         first.start_lng,
      end_lat:           last.end_lat,
      end_lng:           last.end_lng,
      distance_km:       totalDistance > 0 ? totalDistance : null,
      energy_used_kwh:   totalEnergy   > 0 ? totalEnergy   : null,
      cost_kr:           totalCost     > 0 ? totalCost     : null,
      outside_temp_c:    mergedOutsideTemp,
      soc_start:         first.soc_start,
      soc_end:           last.soc_end,
      odometer_start_km: first.odometer_start_km,
      odometer_end_km:   last.odometer_end_km,
      tag,
      source:            "user_merged",
      raw_drive_state:   mergedRawDriveState,
    })
    .select()
    .single();

  if (insertError || !inserted) {
    throw new Error(`Kunde inte skapa den sammanslagna resan: ${insertError?.message ?? "okänt fel"}`);
  }

  // Mark component trips as superseded
  const { error: updateError } = await supabase
    .from("trips")
    .update({ superseded_by: (inserted as { id: string }).id, tag })
    .in("id", componentIds)
    .eq("user_id", userId);

  if (updateError) {
    // Rollback — delete the orphaned merged trip
    await supabase.from("trips").delete().eq("id", (inserted as { id: string }).id).eq("user_id", userId);
    throw new Error(`Kunde inte dölja ursprungliga resor: ${updateError.message}`);
  }

  // Clean up old user_merged trips that were expanded
  if (oldMergedTripIds.length > 0) {
    await supabase.from("trips").delete().in("id", oldMergedTripIds).eq("user_id", userId);
  }

  return inserted as unknown as TripRow;
}

// ── Unmerge ──────────────────────────────────────────────────

export async function unmergeTrips(mergedTripId: string, userId: string): Promise<void> {
  // Restore component trips
  const { error: restoreError } = await supabase
    .from("trips")
    .update({ superseded_by: null })
    .eq("superseded_by", mergedTripId)
    .eq("user_id", userId);

  if (restoreError) {
    throw new Error(`Kunde inte återställa delresorna: ${restoreError.message}`);
  }

  // Delete merged trip
  const { error: deleteError } = await supabase
    .from("trips")
    .delete()
    .eq("id", mergedTripId)
    .eq("user_id", userId);

  if (deleteError) {
    throw new Error(
      `Delresorna återställdes, men den sammanslagna resan kunde inte raderas: ${deleteError.message}`,
    );
  }
}
