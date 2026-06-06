/**
 * stats-calculations.ts — Shared statistics aggregation for Millog Web.
 *
 * SCALABILITY NOTE: All formulas operate purely on the canonical trip
 * schema columns (distance_km, energy_used_kwh, cost_kr, soc_start/end,
 * tag, started_at, ended_at). This means the calculations work identically
 * for Tesla, Polestar, Volvo, BMW — or any future OEM — as long as the
 * bridge normalises raw telemetry into the same schema. Never add OEM-
 * specific branches here; instead fix the bridge/ETL that writes the trips.
 *
 * Ported from mobile lib/stats-calculations.ts (canonical source).
 * Keep in sync when formulas change there.
 */

// ── Swedish tax & comparison constants ──────────────────────────────────────

/** Skatteverket milersättning 2025 rate: 25 kr/mil = 2.50 kr/km. */
export const DEFAULT_MILERSATTNING_PER_KM = 2.5;

export const PETROL_L_PER_100KM = 7.5;
export const PETROL_KR_PER_L_DEFAULT = 18.5;
export const DIESEL_L_PER_100KM = 6.5;
export const DIESEL_KR_PER_L_DEFAULT = 17.5;

/** kg CO₂ per litre of each fuel type */
export const CO2_PETROL_KG_PER_L = 2.31;
export const CO2_DIESEL_KG_PER_L = 2.68;

/**
 * Swedish grid CO₂ intensity: ~3 g/km for an EV (~98% fossil-free grid).
 * This constant is intentionally low — the Swedish grid is exceptional.
 * When Millog expands to other markets, this should be user/region-configurable.
 */
export const CO2_EV_SWEDEN_G_PER_KM = 3;

/** Median WLTP efficiency across Model 3/Y/S/X + Cybertruck. Used as fallback when
 *  vehicle spec isn't available — applies equally to any BEV OEM. */
export const DEFAULT_WLTP_KWH_PER_100KM = 14.0;

/** Derive g CO₂/km from fuel consumption + emission factor. */
export function co2GPerKm(fuelLPer100km: number, co2KgPerLiter: number): number {
  return (fuelLPer100km / 100) * co2KgPerLiter * 1000;
}

export const CO2_PETROL_G_PER_KM = co2GPerKm(PETROL_L_PER_100KM, CO2_PETROL_KG_PER_L); // ~173
export const CO2_DIESEL_G_PER_KM = co2GPerKm(DIESEL_L_PER_100KM, CO2_DIESEL_KG_PER_L); // ~174

// ── Period type + helpers ───────────────────────────────────────────────────

export type StatPeriod = "today" | "week" | "month" | "quarter" | "year" | "all" | "custom";

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function statPeriodStartDate(period: StatPeriod, customFrom?: Date): Date {
  const now = new Date();
  switch (period) {
    case "today":   return startOfLocalDay(now);
    case "week":    { const d = new Date(now); d.setDate(d.getDate() - 7);   return startOfLocalDay(d); }
    case "month":   { const d = new Date(now); d.setDate(d.getDate() - 30);  return startOfLocalDay(d); }
    case "quarter": { const d = new Date(now); d.setDate(d.getDate() - 90);  return startOfLocalDay(d); }
    case "year":    { const d = new Date(now); d.setDate(d.getDate() - 365); return startOfLocalDay(d); }
    case "custom":  return startOfLocalDay(customFrom ?? new Date(now.getTime() - 30 * 86400000));
    case "all": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 2);
      return startOfLocalDay(d);
    }
  }
}

export function statPeriodDayCount(
  period: StatPeriod,
  customFrom?: Date,
  customTo?: Date,
  trips?: { started_at: string }[],
): number {
  switch (period) {
    case "today":   return 1;
    case "week":    return 7;
    case "month":   return 30;
    case "quarter": return 90;
    case "year":    return 365;
    case "custom":
      if (customFrom && customTo)
        return Math.max(1, Math.ceil((customTo.getTime() - customFrom.getTime()) / 86400000));
      return 30;
    case "all": {
      if (trips && trips.length > 0) {
        const oldest = Math.min(...trips.map(t => new Date(t.started_at).getTime()));
        return Math.max(1, Math.ceil((Date.now() - oldest) / 86400000));
      }
      return 1;
    }
  }
}

export function statPeriodLabel(period: StatPeriod): string {
  switch (period) {
    case "today":   return "idag";
    case "week":    return "senaste 7 dagarna";
    case "month":   return "senaste 30 dagarna";
    case "quarter": return "senaste 90 dagarna";
    case "year":    return "senaste 12 mån";
    case "custom":  return "vald period";
    case "all":     return "alla resor";
  }
}

export function contextNoteText(totalKm: number, tripCount: number, period: StatPeriod): string {
  return `Baserat på ${Math.round(totalKm).toLocaleString("sv-SE")} km · ${tripCount} resor · ${statPeriodLabel(period)}`;
}

// ── Fuel comparison config ──────────────────────────────────────────────────

export type FuelComparison = {
  petrol: { krPerL: number; lPer100km: number; krPerKm: number; co2GPerKm: number };
  diesel: { krPerL: number; lPer100km: number; krPerKm: number; co2GPerKm: number };
};

export function buildFuelComparison(
  petrolKrPerL = PETROL_KR_PER_L_DEFAULT,
  petrolLPer100km = PETROL_L_PER_100KM,
  dieselKrPerL = DIESEL_KR_PER_L_DEFAULT,
  dieselLPer100km = DIESEL_L_PER_100KM,
): FuelComparison {
  return {
    petrol: {
      krPerL: petrolKrPerL, lPer100km: petrolLPer100km,
      krPerKm: (petrolLPer100km / 100) * petrolKrPerL,
      co2GPerKm: co2GPerKm(petrolLPer100km, CO2_PETROL_KG_PER_L),
    },
    diesel: {
      krPerL: dieselKrPerL, lPer100km: dieselLPer100km,
      krPerKm: (dieselLPer100km / 100) * dieselKrPerL,
      co2GPerKm: co2GPerKm(dieselLPer100km, CO2_DIESEL_KG_PER_L),
    },
  };
}

// ── Minimal trip shape required by all aggregation functions ───────────────
// Using generics keeps this library OEM-agnostic: it doesn't care whether
// the row came from a Tesla, Polestar, or BMW — only these columns matter.

export type StatTripRow = {
  id: string;
  started_at: string;
  ended_at: string | null;
  distance_km: number | null;
  energy_used_kwh: number | null;
  cost_kr: number | null;
  tag: string;
  soc_start: number | null;
  soc_end: number | null;
  source?: string | null;
  raw_drive_state?: Record<string, unknown> | null;
};

export type CustomTagInfo = { id: string; name: string; is_work_tag: boolean };

// ── Output types ────────────────────────────────────────────────────────────

export type TagStats = { count: number; km: number };

export type AggregatedStats = {
  tripCount: number;
  totalKm: number;
  totalKwh: number;
  totalCost: number;
  work: TagStats;
  commute: TagStats;
  personal: TagStats;
  untagged: TagStats;
  customTagStats: Map<string, TagStats>;
  avgEfficiency: number;
  evCostPerKm: number;
  totalDriveMin: number;
  avgTripKm: number;
  longestTripKm: number;
  taxKm: number;
  taxTripCount: number;
  taxDeduction: number;
  petrolEquivalent: number;
  dieselEquivalent: number;
  savingsVsPetrol: number;
  savingsVsDiesel: number;
  co2SavedKgVsPetrol: number;
  co2SavedKgVsDiesel: number;
  periodDays: number;
  avgSpeedKmh: number;
};

export type EfficiencyStats = {
  avgKwhPer100: number;
  bestKwhPer100: number;
  worstKwhPer100: number;
  avgSocDelta: number | null;
  avgCostPerKm: number | null;
  totalKwh: number;
  totalKm: number;
  tripCount: number;
  wltpSpec: number | null;
  vsSpec: number | null;
};

export type ChargingSessionRow = {
  energy_added_kwh: number | null;
  cost_kr: number | null;
  is_home: boolean;
  charger_type: string | null;
  start_battery_pct: number | null;
  end_battery_pct: number | null;
  started_at: string;
};

export type ChargingStats = {
  avgDepartureSoc: number | null;
  avgArrivalSoc: number | null;
  lowBatteryArrivals: number;
  homeCost: number;
  superchargerCost: number;
  totalChargeCost: number;
  homeCostPct: number;
  scCostPct: number;
  totalEnergyKwh: number;
  sessionCount: number;
  hasSocData: boolean;
  hasChargingData: boolean;
};

// ── WLTP helper ─────────────────────────────────────────────────────────────

/**
 * Derive WLTP efficiency (kWh/100km) from the vehicle DB row.
 * Returns null when battery_kwh_usable or battery_range_km_wltp is missing
 * — callers must render "—" or hide WLTP comparisons. We deliberately do NOT
 * fall back to a constant: a wrong baseline misleads the user.
 */
export function computeWltpEfficiency(
  vehicle: { battery_kwh_usable: number | null; battery_range_km_wltp: number | null } | null,
): number | null {
  if (
    vehicle?.battery_kwh_usable != null && vehicle.battery_kwh_usable > 0 &&
    vehicle?.battery_range_km_wltp != null && vehicle.battery_range_km_wltp > 0
  ) {
    return (vehicle.battery_kwh_usable / vehicle.battery_range_km_wltp) * 100;
  }
  return null;
}

// ── Main aggregation ─────────────────────────────────────────────────────────

export function aggregateStats(
  trips: StatTripRow[],
  opts: {
    milersattningPerKm: number;
    fuel: FuelComparison;
    period: StatPeriod;
    customFrom?: Date;
    customTo?: Date;
    customTags?: CustomTagInfo[];
  },
): AggregatedStats {
  const totalKm   = trips.reduce((s, t) => s + (t.distance_km ?? 0), 0);
  const totalCost = trips.reduce((s, t) => s + (t.cost_kr ?? 0), 0);

  // Efficiency — only trips with valid energy data
  const effTrips = trips.filter(
    t => t.distance_km != null && t.distance_km > 0 && t.energy_used_kwh != null && t.energy_used_kwh > 0,
  );
  const totalKwh  = effTrips.reduce((s, t) => s + t.energy_used_kwh!, 0);
  const effTotalKm = effTrips.reduce((s, t) => s + t.distance_km!, 0);
  const avgEfficiency = effTotalKm > 0 ? (totalKwh / effTotalKm) * 100 : 0;
  const evCostPerKm   = totalKm > 0 ? totalCost / totalKm : 0;

  const byTag = (tag: string): TagStats => {
    const filtered = trips.filter(t => t.tag === tag);
    return { count: filtered.length, km: filtered.reduce((s, t) => s + (t.distance_km ?? 0), 0) };
  };

  // Custom tag stats
  const customTagStats = new Map<string, TagStats>();
  for (const ct of opts.customTags ?? []) {
    customTagStats.set(ct.name, byTag(ct.name));
  }

  // Driving time
  const totalDriveMs = trips.reduce((s, t) => {
    if (!t.ended_at) return s;
    return s + (new Date(t.ended_at).getTime() - new Date(t.started_at).getTime());
  }, 0);
  const totalDriveMin = Math.round(totalDriveMs / 60000);

  const avgTripKm    = trips.length > 0 ? totalKm / trips.length : 0;
  const longestTripKm = trips.reduce((max, t) => Math.max(max, t.distance_km ?? 0), 0);

  // Tax deduction — system "work" tag always included; custom tags with is_work_tag
  const workTagNames = new Set<string>(["work"]);
  for (const ct of opts.customTags ?? []) {
    if (ct.is_work_tag) workTagNames.add(ct.name);
  }

  let taxKm = 0;
  let taxTripCount = 0;
  for (const trip of trips) {
    // For user-merged trips, use per-leg tags for accurate milersättning attribution
    const legs = (trip.raw_drive_state as any)?.merged_legs as
      | Array<{ tag?: string; distance_km?: number | null }>
      | undefined;
    if (trip.source === "user_merged" && legs && legs.length > 0) {
      const taxLegs = legs.filter(l => workTagNames.has(l.tag ?? "untagged"));
      taxKm += taxLegs.reduce((s, l) => s + (l.distance_km ?? 0), 0);
      if (taxLegs.length > 0) taxTripCount += 1;
    } else {
      if (workTagNames.has(trip.tag ?? "untagged")) {
        taxKm += trip.distance_km ?? 0;
        taxTripCount += 1;
      }
    }
  }
  const taxDeduction = taxKm * opts.milersattningPerKm;

  // Savings vs fossil
  const petrolEquivalent  = totalKm * opts.fuel.petrol.krPerKm;
  const dieselEquivalent  = totalKm * opts.fuel.diesel.krPerKm;
  const savingsVsPetrol   = petrolEquivalent - totalCost;
  const savingsVsDiesel   = dieselEquivalent - totalCost;

  // CO₂ savings — delta between fossil emission factor and Swedish EV grid
  const co2SavedKgVsPetrol = (totalKm * (opts.fuel.petrol.co2GPerKm - CO2_EV_SWEDEN_G_PER_KM)) / 1000;
  const co2SavedKgVsDiesel = (totalKm * (opts.fuel.diesel.co2GPerKm - CO2_EV_SWEDEN_G_PER_KM)) / 1000;

  const periodDays = statPeriodDayCount(opts.period, opts.customFrom, opts.customTo, trips);

  return {
    tripCount: trips.length,
    totalKm, totalKwh, totalCost,
    work: byTag("work"), commute: byTag("commute"), personal: byTag("personal"), untagged: byTag("untagged"),
    customTagStats,
    avgEfficiency, evCostPerKm,
    totalDriveMin, avgTripKm, longestTripKm,
    taxKm, taxTripCount, taxDeduction,
    petrolEquivalent, dieselEquivalent,
    savingsVsPetrol, savingsVsDiesel,
    co2SavedKgVsPetrol, co2SavedKgVsDiesel,
    periodDays,
    avgSpeedKmh: totalDriveMin > 0 ? totalKm / (totalDriveMin / 60) : 0,
  };
}

// ── Efficiency detail ────────────────────────────────────────────────────────

export function computeEfficiencyStats(trips: StatTripRow[], wltpSpec: number | null): EfficiencyStats | null {
  const valid = trips.filter(
    t => t.distance_km != null && t.distance_km > 1 && t.energy_used_kwh != null && t.energy_used_kwh > 0,
  );
  if (valid.length === 0) return null;

  const perTrip = valid.map(t => ({
    kwhPer100: (t.energy_used_kwh! / t.distance_km!) * 100,
    km: t.distance_km!,
    kwh: t.energy_used_kwh!,
    socDelta: t.soc_start != null && t.soc_end != null ? t.soc_start - t.soc_end : null,
    cost: t.cost_kr,
  }));

  const totalKm   = perTrip.reduce((s, t) => s + t.km, 0);
  const totalKwh  = perTrip.reduce((s, t) => s + t.kwh, 0);
  const avgKwhPer100 = totalKm > 0 ? (totalKwh / totalKm) * 100 : 0;

  const best  = perTrip.reduce((b, t) => t.kwhPer100 < b.kwhPer100 ? t : b);
  const worst = perTrip.reduce((w, t) => t.kwhPer100 > w.kwhPer100 ? t : w);

  const socTrips = perTrip.filter(t => t.socDelta != null);
  const avgSocDelta = socTrips.length > 0
    ? socTrips.reduce((s, t) => s + t.socDelta!, 0) / socTrips.length
    : null;

  const costTrips = perTrip.filter(t => t.cost != null && t.cost > 0);
  const avgCostPerKm = costTrips.length > 0
    ? costTrips.reduce((s, t) => s + t.cost!, 0) / costTrips.reduce((s, t) => s + t.km, 0)
    : null;

  return {
    avgKwhPer100, bestKwhPer100: best.kwhPer100, worstKwhPer100: worst.kwhPer100,
    avgSocDelta, avgCostPerKm,
    totalKwh, totalKm, tripCount: valid.length,
    wltpSpec, vsSpec: wltpSpec != null ? avgKwhPer100 - wltpSpec : null,
  };
}

// ── Charging stats ───────────────────────────────────────────────────────────

export function computeChargingStats(
  sessions: ChargingSessionRow[],
  trips: StatTripRow[],
): ChargingStats {
  const withDep = trips.filter(t => t.soc_start != null);
  const withArr = trips.filter(t => t.soc_end != null);

  const avgDepartureSoc = withDep.length > 0
    ? withDep.reduce((s, t) => s + t.soc_start!, 0) / withDep.length : null;
  const avgArrivalSoc = withArr.length > 0
    ? withArr.reduce((s, t) => s + t.soc_end!, 0) / withArr.length : null;

  const lowBatteryArrivals = trips.filter(t => t.soc_end != null && t.soc_end < 20).length;

  // Home vs DC fast-charger split
  const homeSessions = sessions.filter(s => s.is_home);
  const scSessions   = sessions.filter(s => s.charger_type === "DC" || (!s.is_home && s.charger_type !== "AC"));

  const homeCost         = homeSessions.reduce((s, c) => s + (c.cost_kr ?? 0), 0);
  const superchargerCost = scSessions.reduce((s, c) => s + (c.cost_kr ?? 0), 0);
  const totalChargeCost  = sessions.reduce((s, c) => s + (c.cost_kr ?? 0), 0);
  const totalEnergyKwh   = sessions.reduce((s, c) => s + (c.energy_added_kwh ?? 0), 0);

  return {
    avgDepartureSoc, avgArrivalSoc, lowBatteryArrivals,
    homeCost, superchargerCost, totalChargeCost,
    homeCostPct: totalChargeCost > 0 ? homeCost / totalChargeCost : 0,
    scCostPct:   totalChargeCost > 0 ? superchargerCost / totalChargeCost : 0,
    totalEnergyKwh, sessionCount: sessions.length,
    hasSocData: withDep.length > 0 || withArr.length > 0,
    hasChargingData: sessions.length > 0,
  };
}

// ── Speed band analysis ──────────────────────────────────────────────────────
// Works on any OEM's route_points array — just needs { speed_kmh } per point.

export type SpeedBands = {
  city:    { pct: number; label: string; color: string };
  mixed:   { pct: number; label: string; color: string };
  country: { pct: number; label: string; color: string };
  highway: { pct: number; label: string; color: string };
  /** seconds or sample-count of idle (speed < 3 km/h) */
  idlePct:    number;
  highwayPct: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
};

export function computeSpeedBands(routePoints: Array<{ speed_kmh: number }>): SpeedBands | null {
  if (routePoints.length < 10) return null;
  const speeds = routePoints.map(p => p.speed_kmh);
  const n = speeds.length;
  const city    = speeds.filter(s => s >= 0  && s < 50).length;
  const mixed   = speeds.filter(s => s >= 50 && s < 90).length;
  const country = speeds.filter(s => s >= 90 && s < 110).length;
  const highway = speeds.filter(s => s >= 110).length;
  const idle    = speeds.filter(s => s < 3).length;
  const maxSpeedKmh = Math.max(...speeds);
  const avgSpeedKmh = speeds.reduce((s, v) => s + v, 0) / n;

  return {
    city:    { pct: city    / n, label: "Stad",       color: "#4FC3F7" },
    mixed:   { pct: mixed   / n, label: "Blandat",    color: "#FFB74D" },
    country: { pct: country / n, label: "Landsväg",   color: "#66BB6A" },
    highway: { pct: highway / n, label: "Motorväg",   color: "#EF5350" },
    idlePct:    idle    / n,
    highwayPct: highway / n,
    maxSpeedKmh,
    avgSpeedKmh,
  };
}
