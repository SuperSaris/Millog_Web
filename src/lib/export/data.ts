/**
 * lib/export/data.ts
 * Period helpers, trip fetching, summary building, and row building for export.
 * Security: all queries include .eq("user_id", userId) — explicit even with RLS.
 */
import { supabase } from "@/lib/supabase";
import type {
  CustomTag,
  ExportMoneyOptions,
  ExportPeriod,
  ExportSummary,
  ExportTagFilter,
  ExportTier,
  TierRow,
  TierXlsxRow,
  VehicleInfo,
  WebTripRow,
} from "./types";

// ── Helpers ──────────────────────────────────────────────────

/** Apply decimal separator to a string produced by toFixed(). */
export function applyDecSep(s: string, sep?: "." | ","): string {
  return sep === "," ? s.replace(".", ",") : s;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function periodToRange(period: ExportPeriod): { from: Date; to: Date } {
  const now = new Date();
  switch (period.kind) {
    case "denna_manad":
      return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
    case "forra_manaden":
      return {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
      };
    case "detta_ar":
      return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now) };
    case "forra_aret":
      return {
        from: new Date(now.getFullYear() - 1, 0, 1),
        to: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999),
      };
    case "custom":
      return { from: startOfDay(period.from), to: endOfDay(period.to) };
  }
}

function monthName(month: number, locale = "sv-SE"): string {
  const norm = ((month % 12) + 12) % 12;
  return new Date(2026, norm, 1).toLocaleDateString(locale, { month: "long" });
}

export function periodLabel(period: ExportPeriod, locale = "sv-SE"): string {
  const now = new Date();
  switch (period.kind) {
    case "denna_manad":
      return `${monthName(now.getMonth(), locale)} ${now.getFullYear()}`;
    case "forra_manaden": {
      const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return `${monthName(last.getMonth(), locale)} ${last.getFullYear()}`;
    }
    case "detta_ar":
      return String(now.getFullYear());
    case "forra_aret":
      return String(now.getFullYear() - 1);
    case "custom": {
      const fmt = (d: Date) =>
        d.toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
      return `${fmt(period.from)} – ${fmt(period.to)}`;
    }
  }
}

// ── Column definitions ────────────────────────────────────────

export const TIER1_COLS = [
  "Datum", "Startadress", "Slutadress", "AvstandKm",
  "MatarstartKm", "MatarslutKm", "Syfte", "Anteckning", "MilersattningBelopp",
] as const;

export const TIER2_EXTRA_COLS = [
  "Veckodag", "Starttid", "Sluttid", "VaraktighetMin",
  "BatteriStartPct", "BatteriSlutPct", "EnergiKwh", "ElkostnadBelopp", "EffektivitetKwh",
] as const;

export const TIER3_EXTRA_COLS = [
  "TempStartC", "StartLat", "StartLng", "SlutLat", "SlutLng", "Kalla", "Fordon",
] as const;

export function tierColumns(tier: ExportTier): readonly string[] {
  switch (tier) {
    case "skatteverket": return TIER1_COLS;
    case "standard":    return [...TIER1_COLS, ...TIER2_EXTRA_COLS];
    case "fullstandig": return [...TIER1_COLS, ...TIER2_EXTRA_COLS, ...TIER3_EXTRA_COLS];
  }
}

export const NUMERIC_COL_FORMATS: Record<string, string> = {
  AvstandKm: "#,##0.0",
  MatarstartKm: "#,##0.0",
  MatarslutKm: "#,##0.0",
  MilersattningBelopp: "#,##0.00",
  VaraktighetMin: "0",
  BatteriStartPct: "0.0",
  BatteriSlutPct: "0.0",
  EnergiKwh: "0.000",
  ElkostnadBelopp: "#,##0.00",
  EffektivitetKwh: "0.00",
  TempStartC: "0.0",
  StartLat: "0.000000",
  StartLng: "0.000000",
  SlutLat: "0.000000",
  SlutLng: "0.000000",
};

const SV_COLS: Record<string, string> = {
  Datum: "Datum",
  Startadress: "Startadress",
  Slutadress: "Slutadress",
  AvstandKm: "Avstånd (km)",
  MatarstartKm: "Mätarstart (km)",
  MatarslutKm: "Mätarslut (km)",
  Syfte: "Syfte",
  Anteckning: "Anteckning",
  MilersattningBelopp: "Milersättning (kr)",
  Veckodag: "Veckodag",
  Starttid: "Starttid",
  Sluttid: "Sluttid",
  VaraktighetMin: "Varaktighet (min)",
  BatteriStartPct: "Batteri start (%)",
  BatteriSlutPct: "Batteri slut (%)",
  EnergiKwh: "Energi (kWh)",
  ElkostnadBelopp: "Elkostnad (kr)",
  EffektivitetKwh: "Effektivitet (kWh/100km)",
  TempStartC: "Utetemp. (°C)",
  StartLat: "Start lat",
  StartLng: "Start lng",
  SlutLat: "Slut lat",
  SlutLng: "Slut lng",
  Kalla: "Källa",
  Fordon: "Fordon",
};

const EN_COLS: Record<string, string> = {
  Datum: "Date",
  Startadress: "Start address",
  Slutadress: "End address",
  AvstandKm: "Distance (km)",
  MatarstartKm: "Odometer start (km)",
  MatarslutKm: "Odometer end (km)",
  Syfte: "Purpose",
  Anteckning: "Note",
  MilersattningBelopp: "Reimbursement (kr)",
  Veckodag: "Weekday",
  Starttid: "Start time",
  Sluttid: "End time",
  VaraktighetMin: "Duration (min)",
  BatteriStartPct: "Battery start (%)",
  BatteriSlutPct: "Battery end (%)",
  EnergiKwh: "Energy (kWh)",
  ElkostnadBelopp: "Electricity cost (kr)",
  EffektivitetKwh: "Efficiency (kWh/100km)",
  TempStartC: "Outside temp. (°C)",
  StartLat: "Start lat",
  StartLng: "Start lng",
  SlutLat: "End lat",
  SlutLng: "End lng",
  Kalla: "Source",
  Fordon: "Vehicle",
};

export function columnLabels(opts?: ExportMoneyOptions): Record<string, string> {
  const lang = opts?.locale?.toLowerCase().startsWith("en") ? "en" : "sv";
  const base = lang === "en" ? EN_COLS : SV_COLS;
  const unit = opts?.distanceUnit ?? "km";
  const result = { ...base };
  if (unit === "mi") {
    result["AvstandKm"] = lang === "en" ? "Distance (mi)" : "Avstånd (mi)";
    result["MatarstartKm"] = lang === "en" ? "Odometer start (mi)" : "Mätarstart (mi)";
    result["MatarslutKm"] = lang === "en" ? "Odometer end (mi)" : "Mätarslut (mi)";
  }
  return result;
}

// ── Tag / source helpers ──────────────────────────────────────

const SV_WEEKDAYS = ["Sön", "Mån", "Tis", "Ons", "Tor", "Fre", "Lör"];
const EN_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function weekdayLabel(dayIndex: number, locale = "sv-SE"): string {
  const lang = locale.toLowerCase().startsWith("en") ? "en" : "sv";
  return lang === "en" ? (EN_WEEKDAYS[dayIndex] ?? "") : (SV_WEEKDAYS[dayIndex] ?? "");
}

export function tagLabel(tag: string, locale = "sv-SE"): string {
  const lang = locale.toLowerCase().startsWith("en") ? "en" : "sv";
  if (lang === "en") {
    switch (tag) {
      case "work":     return "Work";
      case "commute":  return "Commute";
      case "personal": return "Personal";
      case "untagged": return "Untagged";
    }
  } else {
    switch (tag) {
      case "work":     return "Tjänst";
      case "commute":  return "Pendling";
      case "personal": return "Privat";
      case "untagged": return "Otaggad";
    }
  }
  return tag;
}

export function sourceLabel(src: string | null, locale = "sv-SE"): string {
  const lang = locale.toLowerCase().startsWith("en") ? "en" : "sv";
  if (lang === "en") {
    switch (src) {
      case "telemetry":          return "Telemetry";
      case "phone_gps":          return "Phone GPS";
      case "manual":             return "Manual";
      case "merged_telemetry":   return "Merged telemetry";
    }
  } else {
    switch (src) {
      case "telemetry":          return "Telemetri";
      case "phone_gps":          return "Telefon-GPS";
      case "manual":             return "Manuell";
      case "merged_telemetry":   return "Sammanslagen telemetri";
    }
  }
  return src ?? "";
}

// ── Distance conversion ──────────────────────────────────────

export function convertDistanceFromKm(km: number, unit: "km" | "mi"): number {
  return unit === "mi" ? km * 0.621371 : km;
}

// ── Amount formatting ────────────────────────────────────────

function amountForExport(kr: number, opts?: ExportMoneyOptions): string {
  // Web version always uses SEK, applies decimal separator
  return applyDecSep(kr.toFixed(2), opts?.decimalSeparator);
}

// ── Date/time formatting ──────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return (
    d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return (
    String(d.getHours()).padStart(2, "0") + ":" +
    String(d.getMinutes()).padStart(2, "0")
  );
}

// ── Supabase fetch ────────────────────────────────────────────

export type FetchExportTripsOptions = {
  userId: string;
  vehicleId: string | null;
  period: ExportPeriod;
  tagFilter: ExportTagFilter;
};

export async function fetchExportTrips(opts: FetchExportTripsOptions): Promise<WebTripRow[]> {
  const { userId, vehicleId, period, tagFilter } = opts;
  const { from, to } = periodToRange(period);

  const tags: string[] = [];
  if (tagFilter.work)     tags.push("work");
  if (tagFilter.commute)  tags.push("commute");
  if (tagFilter.personal) tags.push("personal");
  if (tagFilter.untagged) tags.push("untagged");
  for (const [name, enabled] of Object.entries(tagFilter.customTags ?? {})) {
    if (enabled) tags.push(name);
  }
  if (tags.length === 0) return [];

  let query = supabase
    .from("trips")
    .select(
      "id, started_at, ended_at, start_address, end_address, start_lat, start_lng, end_lat, end_lng, distance_km, energy_used_kwh, cost_kr, tag, soc_start, soc_end, outside_temp_c, notes, odometer_start_km, odometer_end_km, needs_review, source, vehicle_id, superseded_by",
    )
    .eq("user_id", userId)
    .is("superseded_by", null)
    .eq("needs_review", false)
    .in("tag", tags)
    .gte("started_at", from.toISOString())
    .lte("started_at", to.toISOString())
    .order("started_at", { ascending: true });

  if (vehicleId) {
    query = query.eq("vehicle_id", vehicleId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as WebTripRow[]) ?? [];
}

export async function fetchVehicles(userId: string): Promise<VehicleInfo[]> {
  const { data } = await supabase
    .from("vehicles")
    .select("id, display_name, model, vin")
    .eq("user_id", userId)
    .is("removed_at", null)
    .order("created_at");
  return (data as VehicleInfo[]) ?? [];
}

export async function fetchCustomTags(userId: string): Promise<CustomTag[]> {
  const { data } = await supabase
    .from("trip_custom_tags")
    .select("id, name, color, is_work_tag")
    .eq("user_id", userId)
    .order("name");
  return (data as CustomTag[]) ?? [];
}

export async function countTripsInReview(
  userId: string,
  vehicleId: string | null,
  period: ExportPeriod,
): Promise<number> {
  const { from, to } = periodToRange(period);
  let q = supabase
    .from("trips")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("needs_review", true)
    .is("superseded_by", null)
    .gte("started_at", from.toISOString())
    .lte("started_at", to.toISOString());
  if (vehicleId) q = q.eq("vehicle_id", vehicleId);
  const { count } = await q;
  return count ?? 0;
}

// ── Summary building ──────────────────────────────────────────

export function buildSummary(
  trips: WebTripRow[],
  milersattningPerKm: number,
  customTags?: CustomTag[],
): ExportSummary {
  const workTagNames = new Set<string>(["work"]);
  for (const ct of customTags ?? []) {
    if (ct.is_work_tag) workTagNames.add(ct.name);
  }

  let workTrips = 0, commuteTrips = 0, personalTrips = 0, untaggedTrips = 0;
  let workKm = 0, commuteKm = 0, personalKm = 0;
  let totalKm = 0, totalEnergy = 0, totalCost = 0;
  let hasEnergy = false, hasCost = false;

  for (const trip of trips) {
    const km = trip.distance_km ?? 0;
    totalKm += km;
    if (trip.energy_used_kwh != null) { totalEnergy += trip.energy_used_kwh; hasEnergy = true; }
    if (trip.cost_kr != null)          { totalCost  += trip.cost_kr;           hasCost   = true; }

    if (workTagNames.has(trip.tag ?? "untagged")) {
      workTrips++; workKm += km;
    } else if (trip.tag === "commute") {
      commuteTrips++; commuteKm += km;
    } else if (trip.tag === "personal") {
      personalTrips++; personalKm += km;
    } else {
      untaggedTrips++;
    }
  }

  return {
    totalTrips: trips.length,
    workTrips, commuteTrips, personalTrips, untaggedTrips,
    totalKm, workKm, commuteKm, personalKm,
    milersattningKr: workKm * milersattningPerKm,
    totalEnergyKwh: hasEnergy ? totalEnergy : null,
    totalCostKr:    hasCost   ? totalCost   : null,
  };
}

// ── Row building ──────────────────────────────────────────────

export function buildRow(
  trip: WebTripRow,
  tier: ExportTier,
  milersattningPerKm: number,
  vehicle: VehicleInfo | null,
  opts?: ExportMoneyOptions,
  customTags?: CustomTag[],
): TierRow {
  const workTagNames = new Set<string>(["work"]);
  for (const ct of customTags ?? []) { if (ct.is_work_tag) workTagNames.add(ct.name); }

  const odomDeltaKm =
    trip.odometer_start_km != null && trip.odometer_end_km != null && trip.odometer_end_km > trip.odometer_start_km
      ? trip.odometer_end_km - trip.odometer_start_km
      : null;
  const rawKm = odomDeltaKm != null && (trip.distance_km == null || odomDeltaKm > trip.distance_km)
    ? odomDeltaKm
    : (trip.distance_km ?? 0);
  const unit = opts?.distanceUnit ?? "km";
  const dist = convertDistanceFromKm(rawKm, unit);
  const started = new Date(trip.started_at);
  const ended   = trip.ended_at ? new Date(trip.ended_at) : null;
  const durationMin = ended ? Math.round((ended.getTime() - started.getTime()) / 60000) : null;
  const efficiency =
    trip.energy_used_kwh != null && rawKm > 0
      ? applyDecSep(((trip.energy_used_kwh / rawKm) * 100).toFixed(2), opts?.decimalSeparator)
      : "";
  const locale = opts?.locale ?? "sv-SE";

  const row: TierRow = {
    Datum:       formatDate(trip.started_at),
    Startadress: trip.start_address ?? "",
    Slutadress:  trip.end_address ?? "",
    AvstandKm:   dist > 0 ? applyDecSep(dist.toFixed(1), opts?.decimalSeparator) : "",
    MatarstartKm: trip.odometer_start_km != null ? applyDecSep(convertDistanceFromKm(trip.odometer_start_km, unit).toFixed(1), opts?.decimalSeparator) : "",
    MatarslutKm:  trip.odometer_end_km   != null ? applyDecSep(convertDistanceFromKm(trip.odometer_end_km,   unit).toFixed(1), opts?.decimalSeparator) : "",
    Syfte:       tagLabel(trip.tag, locale),
    Anteckning:  trip.notes ?? "",
    MilersattningBelopp: workTagNames.has(trip.tag ?? "untagged") ? amountForExport(rawKm * milersattningPerKm, opts) : "",
  };

  if (tier === "standard" || tier === "fullstandig") {
    row.Veckodag      = weekdayLabel(started.getDay(), locale);
    row.Starttid      = formatTime(trip.started_at);
    row.Sluttid       = trip.ended_at ? formatTime(trip.ended_at) : "";
    row.VaraktighetMin = durationMin != null ? String(durationMin) : "";
    row.BatteriStartPct = trip.soc_start != null ? applyDecSep(trip.soc_start.toFixed(1), opts?.decimalSeparator) : "";
    row.BatteriSlutPct  = trip.soc_end   != null ? applyDecSep(trip.soc_end.toFixed(1),   opts?.decimalSeparator) : "";
    row.EnergiKwh      = trip.energy_used_kwh != null ? applyDecSep(trip.energy_used_kwh.toFixed(3), opts?.decimalSeparator) : "";
    row.ElkostnadBelopp = trip.cost_kr != null ? amountForExport(trip.cost_kr, opts) : "";
    row.EffektivitetKwh = efficiency;
  }

  if (tier === "fullstandig") {
    const vinSuffix   = vehicle?.vin ? vehicle.vin.slice(-4) : "";
    const vehicleName = vehicle ? (vehicle.display_name || vehicle.model || "Tesla") : "";
    row.TempStartC = trip.outside_temp_c != null ? applyDecSep(trip.outside_temp_c.toFixed(1), opts?.decimalSeparator) : "";
    row.StartLat   = trip.start_lat != null ? String(trip.start_lat) : "";
    row.StartLng   = trip.start_lng != null ? String(trip.start_lng) : "";
    row.SlutLat    = trip.end_lat   != null ? String(trip.end_lat)   : "";
    row.SlutLng    = trip.end_lng   != null ? String(trip.end_lng)   : "";
    row.Kalla      = sourceLabel(trip.source, locale);
    row.Fordon     = vinSuffix ? `${vehicleName} (..${vinSuffix})` : vehicleName;
  }

  return row;
}

export function buildXlsxRow(
  trip: WebTripRow,
  tier: ExportTier,
  milersattningPerKm: number,
  vehicle: VehicleInfo | null,
  opts?: ExportMoneyOptions,
  customTags?: CustomTag[],
): TierXlsxRow {
  const workTagNames = new Set<string>(["work"]);
  for (const ct of customTags ?? []) { if (ct.is_work_tag) workTagNames.add(ct.name); }

  const odomDeltaKm =
    trip.odometer_start_km != null && trip.odometer_end_km != null && trip.odometer_end_km > trip.odometer_start_km
      ? trip.odometer_end_km - trip.odometer_start_km
      : null;
  const rawKm = odomDeltaKm != null && (trip.distance_km == null || odomDeltaKm > trip.distance_km)
    ? odomDeltaKm
    : (trip.distance_km ?? 0);
  const unit   = opts?.distanceUnit ?? "km";
  const dist   = convertDistanceFromKm(rawKm, unit);
  const started = new Date(trip.started_at);
  const ended   = trip.ended_at ? new Date(trip.ended_at) : null;
  const durationMin = ended ? Math.round((ended.getTime() - started.getTime()) / 60000) : null;
  const locale  = opts?.locale ?? "sv-SE";

  const row: TierXlsxRow = {
    Datum:       formatDate(trip.started_at),
    Startadress: trip.start_address ?? "",
    Slutadress:  trip.end_address ?? "",
    AvstandKm:   dist > 0 ? parseFloat(dist.toFixed(1)) : "",
    MatarstartKm: trip.odometer_start_km != null ? parseFloat(convertDistanceFromKm(trip.odometer_start_km, unit).toFixed(1)) : "",
    MatarslutKm:  trip.odometer_end_km   != null ? parseFloat(convertDistanceFromKm(trip.odometer_end_km,   unit).toFixed(1)) : "",
    Syfte:       tagLabel(trip.tag, locale),
    Anteckning:  trip.notes ?? "",
    MilersattningBelopp: workTagNames.has(trip.tag ?? "untagged") ? parseFloat((rawKm * milersattningPerKm).toFixed(2)) : "",
  };

  if (tier === "standard" || tier === "fullstandig") {
    row.Veckodag       = weekdayLabel(started.getDay(), locale);
    row.Starttid       = formatTime(trip.started_at);
    row.Sluttid        = trip.ended_at ? formatTime(trip.ended_at) : "";
    row.VaraktighetMin = durationMin != null ? durationMin : "";
    row.BatteriStartPct = trip.soc_start != null ? parseFloat(trip.soc_start.toFixed(1)) : "";
    row.BatteriSlutPct  = trip.soc_end   != null ? parseFloat(trip.soc_end.toFixed(1))   : "";
    row.EnergiKwh       = trip.energy_used_kwh != null ? parseFloat(trip.energy_used_kwh.toFixed(3)) : "";
    row.ElkostnadBelopp = trip.cost_kr != null ? parseFloat(trip.cost_kr.toFixed(2)) : "";
    row.EffektivitetKwh = trip.energy_used_kwh != null && rawKm > 0
      ? parseFloat(((trip.energy_used_kwh / rawKm) * 100).toFixed(2))
      : "";
  }

  if (tier === "fullstandig") {
    const vinSuffix   = vehicle?.vin ? vehicle.vin.slice(-4) : "";
    const vehicleName = vehicle ? (vehicle.display_name || vehicle.model || "Tesla") : "";
    row.TempStartC = trip.outside_temp_c != null ? parseFloat(trip.outside_temp_c.toFixed(1)) : "";
    row.StartLat   = trip.start_lat != null ? trip.start_lat : "";
    row.StartLng   = trip.start_lng != null ? trip.start_lng : "";
    row.SlutLat    = trip.end_lat   != null ? trip.end_lat   : "";
    row.SlutLng    = trip.end_lng   != null ? trip.end_lng   : "";
    row.Kalla      = sourceLabel(trip.source, locale);
    row.Fordon     = vinSuffix ? `${vehicleName} (..${vinSuffix})` : vehicleName;
  }

  return row;
}
