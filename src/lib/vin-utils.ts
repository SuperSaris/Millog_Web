/**
 * VIN (Vehicle Identification Number) utilities.
 *
 * Positions 1–3 of the VIN form the WMI (World Manufacturer Identifier).
 * We use a prefix-match approach so one WMI entry can cover multiple
 * manufacturer codes from the same brand.
 */

export interface VehicleBrand {
  key: string;       // machine key: "tesla", "volvo", etc.
  name: string;      // display name: "Tesla", "Volvo", etc.
  color: string;     // tailwind-friendly badge color class
}

// Sorted longest-prefix-first so "5YJ" matches before "5Y"
const WMI_MAP: Array<{ prefix: string; brand: VehicleBrand }> = [
  // Tesla
  { prefix: "5YJ", brand: { key: "tesla", name: "Tesla", color: "bg-red-500/15 text-red-700 dark:text-red-400" } },
  { prefix: "7SA", brand: { key: "tesla", name: "Tesla", color: "bg-red-500/15 text-red-700 dark:text-red-400" } },
  { prefix: "SFZ", brand: { key: "tesla", name: "Tesla", color: "bg-red-500/15 text-red-700 dark:text-red-400" } },
  { prefix: "LRW", brand: { key: "tesla", name: "Tesla", color: "bg-red-500/15 text-red-700 dark:text-red-400" } },
  { prefix: "XP7", brand: { key: "tesla", name: "Tesla", color: "bg-red-500/15 text-red-700 dark:text-red-400" } },

  // Volvo
  { prefix: "YV1", brand: { key: "volvo", name: "Volvo", color: "bg-blue-500/15 text-blue-700 dark:text-blue-400" } },
  { prefix: "LYV", brand: { key: "volvo", name: "Volvo", color: "bg-blue-500/15 text-blue-700 dark:text-blue-400" } },

  // Polestar
  { prefix: "LPS", brand: { key: "polestar", name: "Polestar", color: "bg-amber-500/15 text-amber-700 dark:text-amber-400" } },

  // BMW
  { prefix: "WBA", brand: { key: "bmw", name: "BMW", color: "bg-sky-500/15 text-sky-700 dark:text-sky-400" } },
  { prefix: "WBS", brand: { key: "bmw", name: "BMW", color: "bg-sky-500/15 text-sky-700 dark:text-sky-400" } },
  { prefix: "WBY", brand: { key: "bmw", name: "BMW", color: "bg-sky-500/15 text-sky-700 dark:text-sky-400" } },
  { prefix: "WBW", brand: { key: "bmw", name: "BMW", color: "bg-sky-500/15 text-sky-700 dark:text-sky-400" } },
  { prefix: "WBX", brand: { key: "bmw", name: "BMW", color: "bg-sky-500/15 text-sky-700 dark:text-sky-400" } },

  // Mercedes-Benz
  { prefix: "WDB", brand: { key: "mercedes", name: "Mercedes-Benz", color: "bg-slate-500/15 text-slate-700 dark:text-slate-300" } },
  { prefix: "WDC", brand: { key: "mercedes", name: "Mercedes-Benz", color: "bg-slate-500/15 text-slate-700 dark:text-slate-300" } },
  { prefix: "WDD", brand: { key: "mercedes", name: "Mercedes-Benz", color: "bg-slate-500/15 text-slate-700 dark:text-slate-300" } },
  { prefix: "W1K", brand: { key: "mercedes", name: "Mercedes-Benz", color: "bg-slate-500/15 text-slate-700 dark:text-slate-300" } },
  { prefix: "W1N", brand: { key: "mercedes", name: "Mercedes-Benz", color: "bg-slate-500/15 text-slate-700 dark:text-slate-300" } },
  { prefix: "W1V", brand: { key: "mercedes", name: "Mercedes-Benz", color: "bg-slate-500/15 text-slate-700 dark:text-slate-300" } },

  // Audi
  { prefix: "WAU", brand: { key: "audi", name: "Audi", color: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300" } },
  { prefix: "WUA", brand: { key: "audi", name: "Audi", color: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300" } },

  // Volkswagen
  { prefix: "WVW", brand: { key: "volkswagen", name: "Volkswagen", color: "bg-blue-600/15 text-blue-800 dark:text-blue-300" } },
  { prefix: "WV1", brand: { key: "volkswagen", name: "Volkswagen", color: "bg-blue-600/15 text-blue-800 dark:text-blue-300" } },
  { prefix: "WV2", brand: { key: "volkswagen", name: "Volkswagen", color: "bg-blue-600/15 text-blue-800 dark:text-blue-300" } },
  { prefix: "3VW", brand: { key: "volkswagen", name: "Volkswagen", color: "bg-blue-600/15 text-blue-800 dark:text-blue-300" } },

  // Porsche
  { prefix: "WP0", brand: { key: "porsche", name: "Porsche", color: "bg-red-600/15 text-red-800 dark:text-red-300" } },
  { prefix: "WP1", brand: { key: "porsche", name: "Porsche", color: "bg-red-600/15 text-red-800 dark:text-red-300" } },

  // Mazda
  { prefix: "JM1", brand: { key: "mazda", name: "Mazda", color: "bg-rose-500/15 text-rose-700 dark:text-rose-400" } },
  { prefix: "JM3", brand: { key: "mazda", name: "Mazda", color: "bg-rose-500/15 text-rose-700 dark:text-rose-400" } },
  { prefix: "3MZ", brand: { key: "mazda", name: "Mazda", color: "bg-rose-500/15 text-rose-700 dark:text-rose-400" } },

  // Toyota
  { prefix: "JTD", brand: { key: "toyota", name: "Toyota", color: "bg-red-500/15 text-red-700 dark:text-red-400" } },
  { prefix: "JTE", brand: { key: "toyota", name: "Toyota", color: "bg-red-500/15 text-red-700 dark:text-red-400" } },
  { prefix: "JTN", brand: { key: "toyota", name: "Toyota", color: "bg-red-500/15 text-red-700 dark:text-red-400" } },

  // Hyundai
  { prefix: "KMH", brand: { key: "hyundai", name: "Hyundai", color: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400" } },
  { prefix: "5NM", brand: { key: "hyundai", name: "Hyundai", color: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-400" } },

  // Kia
  { prefix: "KNA", brand: { key: "kia", name: "Kia", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" } },
  { prefix: "KNC", brand: { key: "kia", name: "Kia", color: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" } },

  // Ford
  { prefix: "WF0", brand: { key: "ford", name: "Ford", color: "bg-blue-500/15 text-blue-700 dark:text-blue-400" } },
  { prefix: "1FA", brand: { key: "ford", name: "Ford", color: "bg-blue-500/15 text-blue-700 dark:text-blue-400" } },

  // Nissan
  { prefix: "JN1", brand: { key: "nissan", name: "Nissan", color: "bg-gray-500/15 text-gray-700 dark:text-gray-300" } },

  // Renault
  { prefix: "VF1", brand: { key: "renault", name: "Renault", color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-500" } },

  // Škoda
  { prefix: "TMB", brand: { key: "skoda", name: "Škoda", color: "bg-green-500/15 text-green-700 dark:text-green-400" } },

  // SEAT / CUPRA
  { prefix: "VSS", brand: { key: "cupra", name: "CUPRA", color: "bg-orange-500/15 text-orange-700 dark:text-orange-400" } },

  // Fiat
  { prefix: "ZFA", brand: { key: "fiat", name: "Fiat", color: "bg-red-600/15 text-red-800 dark:text-red-300" } },

  // Jaguar
  { prefix: "SAJ", brand: { key: "jaguar", name: "Jaguar", color: "bg-green-600/15 text-green-800 dark:text-green-300" } },

  // Land Rover
  { prefix: "SAL", brand: { key: "landrover", name: "Land Rover", color: "bg-green-700/15 text-green-800 dark:text-green-300" } },

  // MG
  { prefix: "LSJ", brand: { key: "mg", name: "MG", color: "bg-red-500/15 text-red-700 dark:text-red-400" } },

  // BYD
  { prefix: "LGB", brand: { key: "byd", name: "BYD", color: "bg-teal-500/15 text-teal-700 dark:text-teal-400" } },
];

const UNKNOWN_BRAND: VehicleBrand = {
  key: "unknown",
  name: "Okänt",
  color: "bg-muted text-muted-foreground",
};

/**
 * Decode the vehicle brand from a VIN string.
 * Returns match from the WMI prefix table, or a generic "unknown" brand.
 */
export function getBrandFromVin(vin: string | null | undefined): VehicleBrand {
  if (!vin || vin.length < 3) return UNKNOWN_BRAND;
  const upper = vin.toUpperCase();
  for (const entry of WMI_MAP) {
    if (upper.startsWith(entry.prefix)) return entry.brand;
  }
  return UNKNOWN_BRAND;
}

/**
 * Get the set of unique brand keys from a list of VINs.
 * Useful for building dynamic brand filter tabs.
 */
export function getUniqueBrands(vins: (string | null | undefined)[]): VehicleBrand[] {
  const seen = new Set<string>();
  const brands: VehicleBrand[] = [];
  for (const vin of vins) {
    const brand = getBrandFromVin(vin);
    if (brand.key !== "unknown" && !seen.has(brand.key)) {
      seen.add(brand.key);
      brands.push(brand);
    }
  }
  return brands.sort((a, b) => a.name.localeCompare(b.name));
}

/** All supported brand names for displaying the brand grid on the import page. */
export const SUPPORTED_BRANDS: VehicleBrand[] = (() => {
  const seen = new Set<string>();
  const result: VehicleBrand[] = [];
  for (const entry of WMI_MAP) {
    if (!seen.has(entry.brand.key)) {
      seen.add(entry.brand.key);
      result.push(entry.brand);
    }
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
})();
