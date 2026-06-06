/**
 * pages/personal/export.tsx
 * Production-grade körjournal export page.
 * Features: period picker + custom date range, tag filters (incl. custom tags),
 * detail tier, format (PDF / Excel / CSV), decimal separator, cookie persistence.
 * Architecture: read-only Supabase queries with user_id filter. No Tesla API calls.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { format as fnsFormat } from "date-fns";
import { sv as dateFnsSv } from "date-fns/locale";
import type { DateRange } from "react-day-picker";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import {
  IconCalendar,
  IconChevronDown,
  IconFileExport,
  IconFileSpreadsheet,
  IconAlertTriangle,
  IconCheck,
  IconDownload,
} from "@tabler/icons-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Skeleton } from "@/components/ui/skeleton";

// Export utilities
import { buildCSV }      from "@/lib/export/csv";
import { buildXLSX }     from "@/lib/export/xlsx";
import { buildPDFHTML }  from "@/lib/export/pdf-html";
import { downloadCSV, downloadXLSX, printHTML } from "@/lib/export/download";
import { loadExportPrefs, saveExportPrefs }      from "@/lib/export/prefs";
import {
  fetchExportTrips,
  fetchVehicles,
  fetchCustomTags,
  countTripsInReview,
  buildSummary,
  periodLabel,
  periodToRange,
} from "@/lib/export/data";
import type {
  CustomTag,
  ExportPeriod,
  ExportPrefs,
  ExportTagFilter,
  ExportTier,
  VehicleInfo,
  WebTripRow,
} from "@/lib/export/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types / constants
// ─────────────────────────────────────────────────────────────────────────────

type ShareFormat = "pdf" | "xlsx" | "csv";
type Step = "period" | "tags" | "tier" | "format";

const STEPS: Step[] = ["period", "tags", "tier", "format"];

const DEFAULT_TAG_FILTER: ExportTagFilter = {
  work: true,
  commute: true,
  personal: false,
  untagged: false,
  customTags: {},
};

const DEFAULT_PREFS: ExportPrefs = {
  format: "pdf",
  decimalSeparator: ",",
  tagFilter: DEFAULT_TAG_FILTER,
  tier: "skatteverket",
  periodKind: "detta_ar",
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatFilename(prefix: string, period: ExportPeriod): string {
  const { from, to } = periodToRange(period);
  const d = (date: Date) =>
    date.getFullYear() +
    "-" +
    String(date.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getDate()).padStart(2, "0");
  return `${prefix}_${d(from)}_${d(to)}`;
}

function getLocale(lang: string): string {
  switch (lang) {
    case "en": return "en-US";
    case "de": return "de-DE";
    default:   return "sv-SE";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StepHeader({
  step,
  activeStep,
  label,
  summary,
  onClick,
}: {
  step: Step;
  activeStep: Step;
  label: string;
  summary?: string;
  onClick: () => void;
}) {
  const stepIndex   = STEPS.indexOf(step);
  const activeIndex = STEPS.indexOf(activeStep);
  const isDone   = stepIndex < activeIndex;
  const isActive = step === activeStep;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-xl px-4 py-3 text-left transition-colors",
        isActive
          ? "bg-primary/5 border border-primary/20"
          : "border border-border hover:bg-muted/40",
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
            isDone || isActive
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {isDone ? <IconCheck className="h-3 w-3" /> : stepIndex + 1}
        </div>
        <div>
          <p className={cn("text-sm font-medium", isActive && "text-primary")}>{label}</p>
          {!isActive && summary && (
            <p className="text-xs text-muted-foreground">{summary}</p>
          )}
        </div>
      </div>
      <IconChevronDown
        className={cn(
          "h-4 w-4 text-muted-foreground transition-transform",
          isActive && "rotate-180",
        )}
      />
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground first:mt-0">
      {children}
    </p>
  );
}

function OptionRow({
  label,
  description,
  checked,
  onChange,
  color,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <div className="flex items-center gap-2.5 min-w-0">
        {color && (
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium leading-none">{label}</p>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function RadioRow({
  label,
  description,
  selected,
  onSelect,
}: {
  label: string;
  description?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-colors",
        selected ? "bg-primary/8 ring-1 ring-primary/30" : "hover:bg-muted/40",
      )}
    >
      <div>
        <p className="text-sm font-medium">{label}</p>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div
        className={cn(
          "ml-3 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
          selected ? "border-primary bg-primary" : "border-muted-foreground/40",
        )}
      >
        {selected && <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
      </div>
    </button>
  );
}

function FormatCard({
  label,
  description,
  icon: Icon,
  selected,
  onSelect,
}: {
  label: string;
  description: string;
  icon: React.ElementType<{ className?: string }>;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition-all",
        selected
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border hover:border-primary/40 hover:bg-muted/30",
      )}
    >
      <div className={cn("rounded-lg p-2", selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-xs text-muted-foreground leading-snug">{description}</p>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview banner
// ─────────────────────────────────────────────────────────────────────────────

function PreviewBanner({
  trips,
  loading,
  reviewCount,
  milersattningPerKm,
  customTags,
}: {
  trips: WebTripRow[];
  loading: boolean;
  reviewCount: number;
  milersattningPerKm: number;
  customTags: CustomTag[];
}) {
  const { t, i18n } = useTranslation();
  const summary = useMemo(
    () => (trips.length > 0 ? buildSummary(trips, milersattningPerKm, customTags) : null),
    [trips, milersattningPerKm, customTags],
  );
  const locale = getLocale(i18n.language);

  if (loading) {
    return (
      <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-3 w-32" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="rounded-xl border bg-muted/20 p-4 text-center">
        <p className="text-sm text-muted-foreground">{t("export.noTripsInPeriod")}</p>
      </div>
    );
  }

  const fmtKm    = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtMoney = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">{t("export.preview.trips")}</p>
          <p className="text-lg font-bold tabular-nums">{summary.totalTrips}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t("export.preview.totalKm")}</p>
          <p className="text-lg font-bold tabular-nums">{fmtKm(summary.totalKm)} km</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t("export.preview.workKm")}</p>
          <p className="text-lg font-bold tabular-nums">{fmtKm(summary.workKm)} km</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{t("export.preview.reimbursement")}</p>
          <p className="text-lg font-bold tabular-nums">{fmtMoney(summary.milersattningKr)} kr</p>
        </div>
      </div>

      {reviewCount > 0 && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900 dark:text-amber-400">
          <IconAlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <p className="text-xs">{t("export.reviewWarning", { count: reviewCount })}</p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export function ExportPage() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const locale = getLocale(i18n.language);

  // ── Profile data ────────────────────────────────────────────
  const [milersattningPerKm, setMilersattningPerKm] = useState(2.5);
  const [userName, setUserName] = useState<string>("");

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("profiles")
      .select("milersattning_kr_per_km, full_name")
      .eq("id", userId)
      .single()
      .then(({ data }) => {
        if (data?.milersattning_kr_per_km != null) {
          setMilersattningPerKm(Number(data.milersattning_kr_per_km));
        }
        if (data?.full_name) setUserName(data.full_name as string);
      });
  }, [userId]);

  // ── Vehicles + custom tags ───────────────────────────────────
  const [vehicles, setVehicles]       = useState<VehicleInfo[]>([]);
  const [customTags, setCustomTags]   = useState<CustomTag[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    Promise.all([fetchVehicles(userId), fetchCustomTags(userId)]).then(([veh, tags]) => {
      setVehicles(veh);
      setCustomTags(tags);
      setDataLoading(false);
    });
  }, [userId]);

  // ── Preferences (cookie-backed) ──────────────────────────────
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [periodKind, setPeriodKind]   = useState<ExportPeriod["kind"]>(DEFAULT_PREFS.periodKind);
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);
  const [tagFilter, setTagFilter]     = useState<ExportTagFilter>(DEFAULT_TAG_FILTER);
  const [tier, setTier]               = useState<ExportTier>(DEFAULT_PREFS.tier);
  const [format, setFormat]           = useState<ShareFormat>(DEFAULT_PREFS.format);
  const [decimalSeparator, setDecimalSeparator] = useState<"." | ",">(DEFAULT_PREFS.decimalSeparator);

  useEffect(() => {
    if (!userId) return;
    const saved = loadExportPrefs(userId);
    if (saved) {
      if (saved.format)           setFormat(saved.format);
      if (saved.decimalSeparator) setDecimalSeparator(saved.decimalSeparator);
      if (saved.tagFilter)        setTagFilter(prev => ({ ...prev, ...saved.tagFilter }));
      if (saved.tier)             setTier(saved.tier);
      if (saved.periodKind && saved.periodKind !== "custom") setPeriodKind(saved.periodKind);
    }
    setPrefsLoaded(true);
  }, [userId]);

  // Persist prefs whenever they change (guard with prefsLoaded to avoid overwriting on init)
  const persistedRef = useRef(false);
  useEffect(() => {
    if (!userId || !prefsLoaded) return;
    persistedRef.current = true;
    saveExportPrefs(userId, { format, decimalSeparator, tagFilter, tier, periodKind });
  }, [userId, prefsLoaded, format, decimalSeparator, tagFilter, tier, periodKind]);

  // ── Current period object ────────────────────────────────────
  const currentPeriod = useMemo((): ExportPeriod => {
    if (periodKind === "custom" && customRange?.from) {
      return { kind: "custom", from: customRange.from, to: customRange.to ?? customRange.from };
    }
    if (periodKind === "custom") return { kind: "detta_ar" };
    return { kind: periodKind } as ExportPeriod;
  }, [periodKind, customRange]);

  // ── Trip preview ─────────────────────────────────────────────
  const [previewTrips, setPreviewTrips]     = useState<WebTripRow[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [reviewCount, setReviewCount]       = useState(0);

  const fetchPreview = useCallback(async () => {
    if (!userId) return;
    setPreviewLoading(true);
    try {
      const [trips, rv] = await Promise.all([
        fetchExportTrips({ userId, vehicleId: selectedVehicleId, period: currentPeriod, tagFilter }),
        countTripsInReview(userId, selectedVehicleId, currentPeriod),
      ]);
      setPreviewTrips(trips);
      setReviewCount(rv);
    } catch {
      setPreviewTrips([]);
    } finally {
      setPreviewLoading(false);
    }
  }, [userId, selectedVehicleId, currentPeriod, tagFilter]);

  useEffect(() => {
    const timer = setTimeout(fetchPreview, 350);
    return () => clearTimeout(timer);
  }, [fetchPreview]);

  // ── Step navigation ──────────────────────────────────────────
  const [activeStep, setActiveStep] = useState<Step>("period");

  // ── Export action ────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);

  const vehicle = useMemo(
    () => vehicles.find(v => v.id === selectedVehicleId) ?? vehicles[0] ?? null,
    [vehicles, selectedVehicleId],
  );

  const displayUserName = userName || user?.email || t("export.unknownUser");

  async function handleExport() {
    if (previewTrips.length === 0) {
      toast.error(t("export.noTripsToExport"));
      return;
    }
    setExporting(true);
    try {
      const label    = periodLabel(currentPeriod, locale);
      const opts     = { locale, decimalSeparator };
      const filename = formatFilename("Korjournal", currentPeriod);

      if (format === "pdf") {
        const html = buildPDFHTML(
          previewTrips, tier, milersattningPerKm,
          vehicle, label, displayUserName, reviewCount, opts, customTags,
        );
        printHTML(html);
        toast.success(t("export.pdfOpened"));
      } else if (format === "xlsx") {
        const data = buildXLSX(
          previewTrips, tier, milersattningPerKm,
          vehicle, label, displayUserName, opts, customTags,
        );
        downloadXLSX(data, filename + ".xlsx");
        toast.success(t("export.downloadStarted"));
      } else {
        const csv = buildCSV(
          previewTrips, tier, milersattningPerKm,
          vehicle, opts, customTags,
        );
        downloadCSV(csv, filename + ".csv");
        toast.success(t("export.downloadStarted"));
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("export.exportFailed"));
    } finally {
      setExporting(false);
    }
  }

  // ── Static option lists ──────────────────────────────────────
  const periodOptions: { key: ExportPeriod["kind"]; label: string }[] = [
    { key: "denna_manad",   label: t("export.periods.thisMonth") },
    { key: "forra_manaden", label: t("export.periods.lastMonth") },
    { key: "detta_ar",      label: t("export.periods.thisYear")  },
    { key: "forra_aret",    label: t("export.periods.lastYear")  },
    { key: "custom",        label: t("export.periods.custom")    },
  ];

  const tierOptions: { key: ExportTier; label: string; description: string }[] = [
    { key: "skatteverket", label: t("export.tiers.skatteverket.label"), description: t("export.tiers.skatteverket.description") },
    { key: "standard",     label: t("export.tiers.standard.label"),     description: t("export.tiers.standard.description")     },
    { key: "fullstandig",  label: t("export.tiers.fullstandig.label"),  description: t("export.tiers.fullstandig.description")  },
  ];

  const builtInTagItems: {
    key: keyof Omit<ExportTagFilter, "customTags">;
    label: string;
    description: string;
    color: string;
  }[] = [
    { key: "work",     label: t("export.tags.work.label"),     description: t("export.tags.work.description"),     color: "#3b82f6" },
    { key: "commute",  label: t("export.tags.commute.label"),  description: t("export.tags.commute.description"),  color: "#f59e0b" },
    { key: "personal", label: t("export.tags.personal.label"), description: t("export.tags.personal.description"), color: "#10b981" },
    { key: "untagged", label: t("export.tags.untagged.label"), description: t("export.tags.untagged.description"), color: "#9ca3af" },
  ];

  // Step summary strings (shown in collapsed step headers)
  const periodSummary =
    periodOptions.find(o => o.key === periodKind)?.label ??
    (periodKind === "custom" && customRange?.from
      ? fnsFormat(customRange.from, "d MMM yyyy", { locale: dateFnsSv })
      : "");

  const tagSummary = [
    tagFilter.work     && t("export.tags.work.label"),
    tagFilter.commute  && t("export.tags.commute.label"),
    tagFilter.personal && t("export.tags.personal.label"),
    tagFilter.untagged && t("export.tags.untagged.label"),
    ...Object.entries(tagFilter.customTags)
      .filter(([, v]) => v)
      .map(([k]) => k),
  ]
    .filter(Boolean)
    .join(", ") || t("export.noTagsSelected");

  const tierSummary  = tierOptions.find(o => o.key === tier)?.label ?? "";
  const formatLabel  = format === "pdf" ? "PDF" : format === "xlsx" ? "Excel" : "CSV";

  // ── Loading skeleton ─────────────────────────────────────────
  if (dataLoading) {
    return (
      <div className="max-w-2xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-14 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6 pb-16">

      {/* Page header */}
      <div>
        <h2 className="text-xl font-bold">{t("personal.exportTitle")}</h2>
        <p className="text-sm text-muted-foreground mt-1">{t("personal.exportDescription")}</p>
      </div>

      {/* Live preview banner — always visible */}
      <PreviewBanner
        trips={previewTrips}
        loading={previewLoading}
        reviewCount={reviewCount}
        milersattningPerKm={milersattningPerKm}
        customTags={customTags}
      />

      {/* ── Step 1: Period ─────────────────────────────────── */}
      <div className="space-y-2">
        <StepHeader
          step="period"
          activeStep={activeStep}
          label={t("export.steps.period")}
          summary={periodSummary}
          onClick={() => setActiveStep(activeStep === "period" ? "tags" : "period")}
        />

        {activeStep === "period" && (
          <div className="rounded-xl border bg-card p-4 space-y-1">

            {/* Vehicle selector (only when user has multiple vehicles) */}
            {vehicles.length > 1 && (
              <>
                <SectionLabel>{t("export.sections.vehicle")}</SectionLabel>
                <div className="flex flex-col gap-0.5 mb-3">
                  <RadioRow
                    label={t("export.allVehicles")}
                    selected={selectedVehicleId === null}
                    onSelect={() => setSelectedVehicleId(null)}
                  />
                  {vehicles.map(v => (
                    <RadioRow
                      key={v.id}
                      label={v.display_name || v.model || "Tesla"}
                      selected={selectedVehicleId === v.id}
                      onSelect={() => setSelectedVehicleId(v.id)}
                    />
                  ))}
                </div>
                <Separator className="my-3" />
              </>
            )}

            <SectionLabel>{t("export.sections.period")}</SectionLabel>
            <div className="flex flex-col gap-0.5">
              {periodOptions.map(opt => (
                <RadioRow
                  key={opt.key}
                  label={opt.label}
                  selected={periodKind === opt.key}
                  onSelect={() => setPeriodKind(opt.key)}
                />
              ))}
            </div>

            {/* Custom date range picker */}
            {periodKind === "custom" && (
              <div className="mt-3 pt-3 border-t space-y-2">
                <SectionLabel>{t("export.customRange")}</SectionLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start gap-2 text-sm font-normal">
                      <IconCalendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {customRange?.from ? (
                        customRange.to && customRange.to !== customRange.from ? (
                          <>
                            {fnsFormat(customRange.from, "d MMM yyyy", { locale: dateFnsSv })}
                            {" – "}
                            {fnsFormat(customRange.to, "d MMM yyyy", { locale: dateFnsSv })}
                          </>
                        ) : (
                          fnsFormat(customRange.from, "d MMM yyyy", { locale: dateFnsSv })
                        )
                      ) : (
                        <span className="text-muted-foreground">{t("export.selectDateRange")}</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      selected={customRange}
                      onSelect={setCustomRange}
                      numberOfMonths={2}
                      disabled={{ after: new Date() }}
                    />
                  </PopoverContent>
                </Popover>
              </div>
            )}

            <div className="pt-4">
              <Button size="sm" className="w-full" onClick={() => setActiveStep("tags")}>
                {t("export.next")}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Step 2: Tags ───────────────────────────────────── */}
      <div className="space-y-2">
        <StepHeader
          step="tags"
          activeStep={activeStep}
          label={t("export.steps.tags")}
          summary={tagSummary}
          onClick={() => setActiveStep(activeStep === "tags" ? "tier" : "tags")}
        />

        {activeStep === "tags" && (
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <SectionLabel>{t("export.sections.includeTrips")}</SectionLabel>

            <div className="divide-y divide-border/50">
              {builtInTagItems.map(item => (
                <OptionRow
                  key={item.key}
                  label={item.label}
                  description={item.description}
                  checked={tagFilter[item.key]}
                  onChange={v => setTagFilter(prev => ({ ...prev, [item.key]: v }))}
                  color={item.color}
                />
              ))}
            </div>

            {customTags.length > 0 && (
              <>
                <SectionLabel>{t("export.sections.customTags")}</SectionLabel>
                <div className="divide-y divide-border/50">
                  {customTags.map(ct => (
                    <OptionRow
                      key={ct.id}
                      label={ct.name}
                      description={ct.is_work_tag ? t("export.workTagHint") : undefined}
                      checked={tagFilter.customTags[ct.name] ?? false}
                      onChange={v =>
                        setTagFilter(prev => ({
                          ...prev,
                          customTags: { ...prev.customTags, [ct.name]: v },
                        }))
                      }
                      color={ct.color}
                    />
                  ))}
                </div>
              </>
            )}

            <div className="pt-4">
              <Button size="sm" className="w-full" onClick={() => setActiveStep("tier")}>
                {t("export.next")}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Step 3: Detail tier ────────────────────────────── */}
      <div className="space-y-2">
        <StepHeader
          step="tier"
          activeStep={activeStep}
          label={t("export.steps.tier")}
          summary={tierSummary}
          onClick={() => setActiveStep(activeStep === "tier" ? "format" : "tier")}
        />

        {activeStep === "tier" && (
          <div className="rounded-xl border bg-card p-4 space-y-1">
            <SectionLabel>{t("export.sections.tier")}</SectionLabel>
            <div className="flex flex-col gap-0.5">
              {tierOptions.map(opt => (
                <RadioRow
                  key={opt.key}
                  label={opt.label}
                  description={opt.description}
                  selected={tier === opt.key}
                  onSelect={() => setTier(opt.key)}
                />
              ))}
            </div>

            <div className="pt-4">
              <Button size="sm" className="w-full" onClick={() => setActiveStep("format")}>
                {t("export.next")}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ── Step 4: Format + Export ───────────────────────── */}
      <div className="space-y-2">
        <StepHeader
          step="format"
          activeStep={activeStep}
          label={t("export.steps.format")}
          summary={formatLabel}
          onClick={() => setActiveStep("format")}
        />

        {activeStep === "format" && (
          <div className="rounded-xl border bg-card p-4 space-y-4">

            {/* Format cards */}
            <div>
              <SectionLabel>{t("export.sections.format")}</SectionLabel>
              <div className="grid grid-cols-3 gap-3">
                <FormatCard
                  label="PDF"
                  description={t("export.format.pdf.description")}
                  icon={IconFileExport}
                  selected={format === "pdf"}
                  onSelect={() => setFormat("pdf")}
                />
                <FormatCard
                  label="Excel"
                  description={t("export.format.xlsx.description")}
                  icon={IconFileSpreadsheet}
                  selected={format === "xlsx"}
                  onSelect={() => setFormat("xlsx")}
                />
                <FormatCard
                  label="CSV"
                  description={t("export.format.csv.description")}
                  icon={IconDownload}
                  selected={format === "csv"}
                  onSelect={() => setFormat("csv")}
                />
              </div>
            </div>

            {/* Decimal separator preference (Excel / CSV only — persisted to cookie) */}
            {(format === "xlsx" || format === "csv") && (
              <div>
                <SectionLabel>{t("export.sections.decimalSeparator")}</SectionLabel>
                <p className="text-xs text-muted-foreground mb-2">{t("export.decimalSeparatorHint")}</p>
                <div className="flex gap-2">
                  {([
                    { value: "," as const, example: "10,00", label: t("export.decimalComma") },
                    { value: "." as const, example: "10.00", label: t("export.decimalDot")   },
                  ]).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDecimalSeparator(opt.value)}
                      className={cn(
                        "flex flex-1 flex-col items-center gap-1 rounded-lg border px-4 py-2.5 text-sm transition-all",
                        decimalSeparator === opt.value
                          ? "border-primary bg-primary/5 font-semibold text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40",
                      )}
                    >
                      <span className="font-mono text-base font-bold">{opt.example}</span>
                      <span className="text-xs">{opt.label}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{t("export.decimalSeparatorNote")}</p>
              </div>
            )}

            {/* Export button */}
            <Button
              size="lg"
              className="w-full gap-2"
              disabled={exporting || previewTrips.length === 0 || previewLoading}
              onClick={handleExport}
            >
              {exporting ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  {t("export.exporting")}
                </span>
              ) : (
                <>
                  <IconDownload className="h-4 w-4" />
                  {format === "pdf"
                    ? t("export.exportPdf")
                    : format === "xlsx"
                      ? t("export.exportXlsx")
                      : t("export.exportCsv")}
                  {previewTrips.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {previewTrips.length}
                    </Badge>
                  )}
                </>
              )}
            </Button>

            {format === "pdf" && (
              <p className="text-xs text-muted-foreground text-center">{t("export.pdfHint")}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
