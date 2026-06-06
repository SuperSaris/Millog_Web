/**
 * lib/export/types.ts
 * Shared types for the web export module.
 */

export type ExportTier = "skatteverket" | "standard" | "fullstandig";

export type ExportTagFilter = {
  work: boolean;
  commute: boolean;
  personal: boolean;
  untagged: boolean;
  /** Custom tag name → enabled */
  customTags: Record<string, boolean>;
};

export type ExportPeriod =
  | { kind: "denna_manad" }
  | { kind: "forra_manaden" }
  | { kind: "detta_ar" }
  | { kind: "forra_aret" }
  | { kind: "custom"; from: Date; to: Date };

export type ExportSummary = {
  totalTrips: number;
  workTrips: number;
  commuteTrips: number;
  personalTrips: number;
  untaggedTrips: number;
  totalKm: number;
  workKm: number;
  commuteKm: number;
  personalKm: number;
  milersattningKr: number;
  totalEnergyKwh: number | null;
  totalCostKr: number | null;
};

export type ExportMoneyOptions = {
  currency?: "SEK" | "EUR" | "USD" | "GBP";
  locale?: string;
  distanceUnit?: "km" | "mi";
  /** Override decimal separator in exported file. "." = dot, "," = comma. */
  decimalSeparator?: "." | ",";
};

export type CustomTag = {
  id: string;
  name: string;
  color: string;
  is_work_tag: boolean;
};

export type VehicleInfo = {
  id: string;
  display_name: string | null;
  model: string | null;
  vin: string | null;
};

/** Flat row used for CSV / string-formatted Excel cells */
export type TierRow = Record<string, string>;

/** Row for type-safe Excel (numeric cols stay as numbers) */
export type TierXlsxRow = Record<string, string | number>;

export type WebTripRow = {
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
  odometer_start_km: number | null;
  odometer_end_km: number | null;
  needs_review: boolean;
  source: string | null;
  vehicle_id: string | null;
  superseded_by: string | null;
};

export type ExportPrefs = {
  format: "pdf" | "xlsx" | "csv";
  decimalSeparator: "." | ",";
  tagFilter: ExportTagFilter;
  tier: ExportTier;
  periodKind: ExportPeriod["kind"];
};
