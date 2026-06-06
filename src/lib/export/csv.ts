/**
 * lib/export/csv.ts
 * Builds a UTF-8 CSV string from trip rows.
 */
import type { CustomTag, ExportMoneyOptions, ExportSummary, ExportTier, TierRow, VehicleInfo, WebTripRow } from "./types";
import { applyDecSep, buildRow, buildSummary, columnLabels, tierColumns } from "./data";

function escapeCell(value: string, fieldSep: string): string {
  if (value.includes(fieldSep) || value.includes('"') || value.includes("\n")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function rowToCSV(keys: readonly string[], row: TierRow, fieldSep: string): string {
  return keys.map(k => escapeCell(row[k] ?? "", fieldSep)).join(fieldSep);
}

function headerRow(keys: readonly string[], opts?: ExportMoneyOptions): string {
  const labels  = columnLabels(opts);
  const fieldSep = opts?.decimalSeparator === "." ? "," : ";";
  return keys.map(k => escapeCell(labels[k] ?? k, fieldSep)).join(fieldSep);
}

function summarySection(
  summary: ExportSummary,
  _milersattningPerKm: number,
  opts?: ExportMoneyOptions,
): string {
  const fs = opts?.decimalSeparator === "." ? "," : ";";
  const sep = opts?.decimalSeparator;
  const fmtKm = (n: number) =>
    applyDecSep((opts?.distanceUnit === "mi" ? n * 0.621371 : n).toFixed(1), sep) + " " + (opts?.distanceUnit ?? "km");
  const money = (n: number) => applyDecSep(n.toFixed(2), sep) + " kr";

  const isEn = opts?.locale?.toLowerCase().startsWith("en");
  const T = isEn ? {
    csvSummary: "Summary",
    category: "Category",
    numberOfTrips: "Trips",
    totalDistance: "Distance",
    reimbursement: "Reimbursement",
    work: "Work",
    commute: "Commute",
    personal: "Personal",
    untaggedExcluded: "Untagged (excluded)",
    total: "Total",
    totalEnergy: "Total energy",
    totalCost: "Total electricity cost",
  } : {
    csvSummary: "Sammanfattning",
    category: "Kategori",
    numberOfTrips: "Resor",
    totalDistance: "Avstånd",
    reimbursement: "Milersättning",
    work: "Tjänst",
    commute: "Pendling",
    personal: "Privat",
    untaggedExcluded: "Otaggade (exkluderade)",
    total: "Totalt",
    totalEnergy: "Total energi",
    totalCost: "Total elkostnad",
  };

  const lines = [
    "",
    T.csvSummary,
    "",
    `${T.category}${fs}${T.numberOfTrips}${fs}${T.totalDistance}${fs}${T.reimbursement}`,
    `${T.work}${fs}${summary.workTrips}${fs}${fmtKm(summary.workKm)}${fs}${money(summary.milersattningKr)}`,
    `${T.commute}${fs}${summary.commuteTrips}${fs}${fmtKm(summary.commuteKm)}${fs}`,
    `${T.personal}${fs}${summary.personalTrips}${fs}${fmtKm(summary.personalKm)}${fs}`,
  ];
  if (summary.untaggedTrips > 0) {
    lines.push(`${T.untaggedExcluded}${fs}${summary.untaggedTrips}${fs}${fs}`);
  }
  lines.push("");
  lines.push(`${T.total}${fs}${summary.totalTrips}${fs}${fmtKm(summary.totalKm)}`);
  if (summary.totalEnergyKwh != null) {
    lines.push(`${T.totalEnergy}${fs}${applyDecSep(summary.totalEnergyKwh.toFixed(2), sep)} kWh`);
  }
  if (summary.totalCostKr != null) {
    lines.push(`${T.totalCost}${fs}${money(summary.totalCostKr)}`);
  }
  return lines.join("\n");
}

export function buildCSV(
  trips: WebTripRow[],
  tier: ExportTier,
  milersattningPerKm: number,
  vehicle: VehicleInfo | null,
  opts?: ExportMoneyOptions,
  customTags?: CustomTag[],
): string {
  const cols    = tierColumns(tier);
  const summary = buildSummary(trips, milersattningPerKm, customTags);
  const fieldSep = opts?.decimalSeparator === "." ? "," : ";";

  const rows: string[] = [
    headerRow(cols, opts),
    ...trips.map(t => rowToCSV(cols, buildRow(t, tier, milersattningPerKm, vehicle, opts, customTags), fieldSep)),
    summarySection(summary, milersattningPerKm, opts),
  ];
  return rows.join("\n");
}
