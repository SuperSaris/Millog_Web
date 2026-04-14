/**
 * /dashboard/vehicles/import
 *
 * Multi-brand, step-by-step vehicle onboarding wizard.
 *
 * Step 1 — Choose method:
 *   Card A: "Automatic import" (Tesla — full integration, OAuth + sync)
 *   Card B: "Manual entry"    (any brand — VIN + details form)
 *
 * Step 2 — Tesla path:   Connect account → fetch vehicles → select
 *          Manual path:   Enter VIN (brand auto-detected) → display name
 *
 * After completion → navigate back to /dashboard/vehicles.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth-context";
import { useOrg } from "@/contexts/org-context";
import { supabase } from "@/lib/supabase";
import {
  getBrandFromVin,
  type VehicleBrand,
} from "@/lib/vin-utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  IconArrowLeft,
  IconBrandTesla,
  IconCar,
  IconCheck,
  IconChevronRight,
  IconLoader2,
  IconPlus,
  IconSparkles,
  IconWifi,
} from "@tabler/icons-react";
import { toast } from "sonner";

/* ── PKCE helpers (Web Crypto API) ────────────────────────────────────────── */

const PKCE_VERIFIER_KEY = "tesla_pkce_verifier_fleet";

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function generatePkce(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const verifier = base64UrlEncode(array.buffer);
  const encoded = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  const challenge = base64UrlEncode(hash);
  return { verifier, challenge };
}

function buildTeslaAuthUrl(codeChallenge: string, state: string): string {
  const clientId = import.meta.env.VITE_TESLA_CLIENT_ID as string | undefined;
  const redirectUri =
    (import.meta.env.VITE_TESLA_WEB_REDIRECT_URI as string | undefined) ??
    `${window.location.origin}/tesla-callback`;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId ?? "",
    redirect_uri: redirectUri,
    scope:
      "openid offline_access vehicle_device_data vehicle_location vehicle_charging_cmds",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `https://auth.tesla.com/oauth2/v3/authorize?${params.toString()}`;
}

/* ── Wizard step type ─────────────────────────────────────────────────────── */

type WizardStep =
  | "method"
  | "tesla-connect"
  | "tesla-select"
  | "manual-form";

/* ── Step indicator ───────────────────────────────────────────────────────── */

function StepIndicator({
  steps,
  current,
}: {
  steps: Array<{ key: string; label: string }>;
  current: number;
}) {
  return (
    <div className="flex items-center gap-2" role="navigation" aria-label="Steps">
      {steps.map((step, i) => (
        <div key={step.key} className="flex items-center gap-2">
          {i > 0 && (
            <div
              className={`h-px w-6 sm:w-10 ${
                i <= current ? "bg-primary" : "bg-muted-foreground/30"
              }`}
            />
          )}
          <div className="flex items-center gap-1.5">
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                i < current
                  ? "bg-primary text-primary-foreground"
                  : i === current
                    ? "bg-primary text-primary-foreground"
                    : "border-2 border-muted-foreground/40 text-muted-foreground"
              }`}
            >
              {i < current ? (
                <IconCheck className="h-3.5 w-3.5" />
              ) : (
                i + 1
              )}
            </div>
            <span
              className={`hidden text-xs font-medium sm:inline ${
                i <= current
                  ? "text-foreground"
                  : "text-muted-foreground/70"
              }`}
            >
              {step.label}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Brand badge ──────────────────────────────────────────────────────────── */

function BrandBadge({ brand }: { brand: VehicleBrand }) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${brand.color}`}
    >
      {brand.key === "tesla" && (
        <IconBrandTesla className="mr-1 h-3 w-3" />
      )}
      {brand.name}
    </span>
  );
}

/* ── Discovered vehicle row (Tesla import) ────────────────────────────────── */

interface DiscoveredVehicle {
  vin: string;
  displayName: string;
  model: string | null;
  alreadyInFleet: boolean;
  brand: VehicleBrand;
}

function VehicleRow({
  vehicle,
  selected,
  onToggle,
}: {
  vehicle: DiscoveredVehicle;
  selected: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={vehicle.alreadyInFleet ? undefined : onToggle}
      disabled={vehicle.alreadyInFleet}
      className={[
        "flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-all",
        vehicle.alreadyInFleet
          ? "cursor-default opacity-50"
          : selected
            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
            : "hover:bg-muted/50 hover:border-muted-foreground/20",
      ].join(" ")}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
        <IconCar className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium">
            {vehicle.displayName || vehicle.model || t("vehicles.unnamed")}
          </p>
          <BrandBadge brand={vehicle.brand} />
        </div>
        <p className="text-xs text-muted-foreground">
          VIN ···{vehicle.vin.slice(-6)}
        </p>
      </div>
      {vehicle.alreadyInFleet ? (
        <Badge variant="secondary" className="shrink-0">
          <IconCheck className="mr-1 h-3 w-3" />
          {t("vehicles.alreadyAdded")}
        </Badge>
      ) : selected ? (
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary transition-transform scale-110">
          <IconCheck className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
      ) : (
        <div className="h-6 w-6 shrink-0 rounded-full border-2 transition-colors" />
      )}
    </button>
  );
}

/* ── Main Page ─────────────────────────────────────────────────────────────── */

export function ImportVehiclesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const { organization } = useOrg();

  const [step, setStep] = useState<WizardStep>("method");
  const [discovered, setDiscovered] = useState<DiscoveredVehicle[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // Manual form state
  const [manualVin, setManualVin] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualReg, setManualReg] = useState("");
  const [isManualAdding, setIsManualAdding] = useState(false);

  const clientId = import.meta.env.VITE_TESLA_CLIENT_ID as string | undefined;
  const isConfigured = !!clientId;
  const detectedBrand = useMemo(() => getBrandFromVin(manualVin), [manualVin]);
  const manualVinValid = manualVin.replace(/\s/g, "").length === 17;

  // Step labels for the indicator
  const stepLabels = useMemo(
    () => [
      { key: "method", label: t("vehicles.wizStepMethod") },
      { key: "details", label: t("vehicles.wizStepDetails") },
      { key: "done", label: t("vehicles.wizStepDone") },
    ],
    [t],
  );

  const currentStepIdx =
    step === "method"
      ? 0
      : step === "tesla-connect" || step === "tesla-select" || step === "manual-form"
        ? 1
        : 0;

  /* ── Fetch vehicles from Tesla (via Edge Function) ─────────── */
  const fetchDiscoveredVehicles = useCallback(async () => {
    if (!user || !organization) return;
    setIsSyncing(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "fleet-sync-vehicles",
        { body: {} },
      );
      if (fnError) throw new Error(fnError.message);

      const teslaVehicles = (data?.vehicles ?? []) as Array<{
        vin: string;
        display_name: string;
        model: string | null;
      }>;

      // Check which vehicles are already in the org's fleet
      const vins = teslaVehicles.map((v) => v.vin);
      const { data: existingRows } =
        vins.length > 0
          ? await supabase
              .from("vehicles")
              .select("vin, organization_vehicles(organization_id)")
              .in("vin", vins)
          : { data: [] };

      const orgVehicleVins = new Set(
        ((existingRows ?? []) as Array<Record<string, unknown>>)
          .filter((v) => {
            const ovList = v.organization_vehicles as
              | Array<Record<string, unknown>>
              | null;
            return ovList?.some(
              (ov) => ov.organization_id === organization.id,
            );
          })
          .map((v) => v.vin as string),
      );

      setDiscovered(
        teslaVehicles.map((v) => ({
          vin: v.vin,
          displayName: v.display_name,
          model: v.model,
          alreadyInFleet: orgVehicleVins.has(v.vin),
          brand: getBrandFromVin(v.vin),
        })),
      );
      setStep("tesla-select");
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("common.error");
      if (msg.toLowerCase().includes("no token") || msg.includes("401")) {
        setStep("tesla-connect");
      } else {
        setError(msg);
        setStep("tesla-connect");
      }
    } finally {
      setIsSyncing(false);
    }
  }, [user, organization, t]);

  /* ── Handle OAuth callback (returned from Tesla) ────────────── */
  useEffect(() => {
    const code = searchParams.get("code");
    if (!code || !user || !organization) return;

    const state = searchParams.get("state");
    const storedState = sessionStorage.getItem("tesla_oauth_state_fleet");
    if (state && storedState && state !== storedState) {
      setError(t("vehicles.importErrorState"));
      return;
    }
    sessionStorage.removeItem("tesla_oauth_state_fleet");

    const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
    if (!verifier) {
      setError(t("vehicles.importErrorPkce"));
      return;
    }

    setIsSyncing(true);

    const redirectUri =
      (import.meta.env.VITE_TESLA_WEB_REDIRECT_URI as string | undefined) ??
      `${window.location.origin}/tesla-callback`;

    supabase.functions
      .invoke("tesla-token-exchange", {
        body: { code, code_verifier: verifier, redirect_uri: redirectUri },
      })
      .then(({ error: fnError }) => {
        sessionStorage.removeItem(PKCE_VERIFIER_KEY);
        if (fnError) {
          setError(fnError.message);
          setIsSyncing(false);
          setStep("tesla-connect");
        } else {
          window.history.replaceState({}, "", window.location.pathname);
          fetchDiscoveredVehicles();
        }
      });
  }, []); // once on mount

  /* ── On "Tesla import" card click — go to connect step ─────── */
  function handleChooseTesla() {
    setStep("tesla-connect");
  }

  /* ── Start Tesla OAuth ──────────────────────────────────────── */
  async function handleConnectTesla() {
    const { verifier, challenge } = await generatePkce();
    const state =
      Math.random().toString(36).slice(2) +
      Math.random().toString(36).slice(2);
    sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
    sessionStorage.setItem("tesla_oauth_state_fleet", state);
    window.location.href = buildTeslaAuthUrl(challenge, state);
  }

  /* ── Add selected Tesla vehicles ─────────────────────────────── */
  async function handleAddTeslaVehicles() {
    if (!user || !organization || selected.size === 0) return;
    setIsAdding(true);
    setError(null);

    let addedCount = 0;
    for (const vin of selected) {
      try {
        const { data: vRow } = await supabase
          .from("vehicles")
          .select("id")
          .eq("vin", vin)
          .eq("user_id", user.id)
          .maybeSingle();

        if (!vRow) continue;

        await supabase.from("organization_vehicles").upsert(
          {
            organization_id: organization.id,
            vehicle_id: vRow.id,
            pool_car: false,
          },
          { onConflict: "organization_id,vehicle_id" },
        );
        addedCount++;
      } catch {
        // keep going
      }
    }

    setIsAdding(false);
    toast.success(t("vehicles.vehiclesAddedCount", { count: addedCount }));
    navigate("/dashboard/vehicles");
  }

  /* ── Add manual vehicle ──────────────────────────────────── */
  async function handleAddManualVehicle() {
    if (!user || !organization || !manualVinValid) return;
    setIsManualAdding(true);
    setError(null);

    const cleanVin = manualVin.replace(/\s/g, "").toUpperCase();

    try {
      // Check if vehicle already exists
      const { data: existing } = await supabase
        .from("vehicles")
        .select("id")
        .eq("vin", cleanVin)
        .maybeSingle();

      let vehicleId: string;

      if (existing) {
        vehicleId = existing.id;
      } else {
        // Create vehicle record
        const { data: newVehicle, error: insertErr } = await supabase
          .from("vehicles")
          .insert({
            user_id: user.id,
            vin: cleanVin,
            display_name: manualName.trim() || null,
          })
          .select("id")
          .single();

        if (insertErr) throw new Error(insertErr.message);
        vehicleId = newVehicle.id;
      }

      // Create organization_vehicles row
      await supabase.from("organization_vehicles").upsert(
        {
          organization_id: organization.id,
          vehicle_id: vehicleId,
          display_label: manualName.trim() || null,
          pool_car: false,
        },
        { onConflict: "organization_id,vehicle_id" },
      );

      toast.success(t("vehicles.vehicleAddedManual"));
      navigate("/dashboard/vehicles");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.error"));
    } finally {
      setIsManualAdding(false);
    }
  }

  function toggleVehicle(vin: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(vin)) next.delete(vin);
      else next.add(vin);
      return next;
    });
  }

  function selectAll() {
    const available = discovered
      .filter((v) => !v.alreadyInFleet)
      .map((v) => v.vin);
    setSelected(new Set(available));
  }

  const availableToAdd = discovered.filter((v) => !v.alreadyInFleet);

  /* ══════════════════════════════════════════════════════════════════════════ */
  /* RENDER                                                                    */
  /* ══════════════════════════════════════════════════════════════════════════ */

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header + back button (hidden on method step — breadcrumb covers it) */}
      <div className="flex items-center gap-3">
        {step !== "method" && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setStep("method")}
          >
            <IconArrowLeft className="h-4 w-4" />
          </Button>
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            {t("vehicles.wizTitle")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("vehicles.wizSubtitle")}
          </p>
        </div>
      </div>

      {/* Step indicator */}
      <StepIndicator steps={stepLabels} current={currentStepIdx} />

      {/* Error */}
      {error && (
        <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => setError(null)}
          >
            {t("common.close")}
          </button>
        </div>
      )}

      {/* ────────── STEP: METHOD SELECTION ────────── */}
      {step === "method" && (
        <div className="space-y-4">
          {/* Tesla import card */}
          <button
            type="button"
            onClick={handleChooseTesla}
            className="group relative w-full rounded-xl border-2 border-transparent bg-card p-5 text-left shadow-sm ring-1 ring-border transition-all hover:ring-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-500/10">
                <IconBrandTesla className="h-6 w-6 text-red-500" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">
                    {t("vehicles.methodTeslaTitle")}
                  </h3>
                  <Badge
                    variant="secondary"
                    className="bg-green-500/10 text-green-700 dark:text-green-400"
                  >
                    <IconSparkles className="mr-1 h-3 w-3" />
                    {t("vehicles.methodTeslaRecommended")}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("vehicles.methodTeslaDescription")}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-xs">
                    <IconWifi className="mr-1 h-3 w-3" />
                    {t("vehicles.featureAutoTrips")}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {t("vehicles.featureEnergy")}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {t("vehicles.featureRealtime")}
                  </Badge>
                </div>
              </div>
              <IconChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            {isSyncing && (
              <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-background/80">
                <IconLoader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            )}
          </button>

          {/* Manual entry card */}
          <button
            type="button"
            onClick={() => setStep("manual-form")}
            className="group w-full rounded-xl border bg-card p-5 text-left shadow-sm ring-1 ring-border transition-all hover:ring-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                <IconCar className="h-6 w-6 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold">
                  {t("vehicles.methodManualTitle")}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("vehicles.methodManualDescription")}
                </p>
              </div>
              <IconChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
          </button>
        </div>
      )}

      {/* ────────── STEP: TESLA CONNECT ────────── */}
      {step === "tesla-connect" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconBrandTesla className="h-5 w-5 text-red-500" />
              {t("vehicles.teslaConnectTitle")}
            </CardTitle>
            <CardDescription>
              {t("vehicles.teslaConnectDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isConfigured ? (
              <div className="rounded-lg bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                {t("vehicles.importNotConfigured")}
              </div>
            ) : (
              <>
                <div className="rounded-lg bg-muted p-4">
                  <p className="text-sm font-medium">
                    {t("vehicles.teslaConnectStepsTitle")}
                  </p>
                  <ol className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                    <li className="flex gap-2">
                      <span className="shrink-0 font-semibold text-foreground">
                        1.
                      </span>
                      {t("vehicles.teslaConnectStep1")}
                    </li>
                    <li className="flex gap-2">
                      <span className="shrink-0 font-semibold text-foreground">
                        2.
                      </span>
                      {t("vehicles.teslaConnectStep2")}
                    </li>
                    <li className="flex gap-2">
                      <span className="shrink-0 font-semibold text-foreground">
                        3.
                      </span>
                      {t("vehicles.teslaConnectStep3")}
                    </li>
                  </ol>
                </div>
                <Button onClick={handleConnectTesla} className="w-full sm:w-auto">
                  <IconBrandTesla className="mr-2 h-4 w-4" />
                  {t("vehicles.importConnectButton")}
                </Button>

                {/* Returning users: skip re-auth, load already-connected fleet */}
                <p className="text-xs text-muted-foreground">
                  {t("vehicles.teslaAlreadyConnected")}{" "}
                  <button
                    type="button"
                    disabled={isSyncing}
                    className="underline hover:text-foreground disabled:opacity-50"
                    onClick={fetchDiscoveredVehicles}
                  >
                    {isSyncing ? (
                      <span className="inline-flex items-center gap-1">
                        <IconLoader2 className="h-3 w-3 animate-spin" />
                        {t("vehicles.importExchangingToken")}
                      </span>
                    ) : (
                      t("vehicles.teslaLoadVehicles")
                    )}
                  </button>
                </p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ────────── STEP: TESLA SELECT ────────── */}
      {step === "tesla-select" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t("vehicles.teslaSelectTitle")}</CardTitle>
                <CardDescription>
                  {t("vehicles.teslaSelectDescription", {
                    total: discovered.length,
                    available: availableToAdd.length,
                  })}
                </CardDescription>
              </div>
              {availableToAdd.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={selectAll}
                  className="shrink-0"
                >
                  {t("vehicles.selectAll")}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {discovered.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t("vehicles.importNoneFound")}
              </p>
            ) : (
              <>
                {discovered.map((v) => (
                  <VehicleRow
                    key={v.vin}
                    vehicle={v}
                    selected={selected.has(v.vin)}
                    onToggle={() => toggleVehicle(v.vin)}
                  />
                ))}

                {/* Selection summary bar */}
                <div className="mt-4 flex items-center justify-between rounded-lg bg-muted px-4 py-3">
                  <div className="text-sm">
                    {selected.size > 0 ? (
                      <span className="font-medium">
                        {t("vehicles.importSelectedCount", {
                          count: selected.size,
                        })}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {t("vehicles.importSelectHint")}
                      </span>
                    )}
                  </div>
                  <Button
                    onClick={handleAddTeslaVehicles}
                    disabled={selected.size === 0 || isAdding}
                  >
                    {isAdding ? (
                      <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <IconPlus className="mr-2 h-4 w-4" />
                    )}
                    {t("vehicles.importAddSelected")}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Reconnect link when on Tesla select step */}
      {step === "tesla-select" && isConfigured && (
        <p className="text-xs text-muted-foreground">
          {t("vehicles.importDifferentAccount")}{" "}
          <button
            type="button"
            className="underline hover:text-foreground"
            onClick={handleConnectTesla}
          >
            {t("vehicles.importReconnect")}
          </button>
        </p>
      )}

      {/* ────────── STEP: MANUAL FORM ────────── */}
      {step === "manual-form" && (
        <Card>
          <CardHeader>
            <CardTitle>{t("vehicles.manualFormTitle")}</CardTitle>
            <CardDescription>
              {t("vehicles.manualFormDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* VIN field with brand detection */}
            <div className="space-y-1.5">
              <Label htmlFor="vin">{t("vehicles.manualVinLabel")}</Label>
              <div className="relative">
                <Input
                  id="vin"
                  placeholder="WVWZZZ3CZWE123456"
                  value={manualVin}
                  onChange={(e) => setManualVin(e.target.value.toUpperCase())}
                  maxLength={17}
                  className="pr-24 font-mono tracking-wider"
                />
                {manualVin.length >= 3 && (
                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                    <BrandBadge brand={detectedBrand} />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {t("vehicles.manualVinHint")}
                </p>
                <p
                  className={`text-xs ${
                    manualVin.length === 17
                      ? "text-green-600"
                      : "text-muted-foreground"
                  }`}
                >
                  {manualVin.replace(/\s/g, "").length}/17
                </p>
              </div>
            </div>

            {/* Display name */}
            <div className="space-y-1.5">
              <Label htmlFor="display-name">
                {t("vehicles.manualNameLabel")}
              </Label>
              <Input
                id="display-name"
                placeholder={t("vehicles.manualNamePlaceholder")}
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                maxLength={80}
              />
              <p className="text-xs text-muted-foreground">
                {t("vehicles.manualNameHint")}
              </p>
            </div>

            {/* Registration number (Swedish plate) */}
            <div className="space-y-1.5">
              <Label htmlFor="reg-num">
                {t("vehicles.manualRegLabel")}
              </Label>
              <Input
                id="reg-num"
                placeholder="ABC 123"
                value={manualReg}
                onChange={(e) => setManualReg(e.target.value.toUpperCase())}
                maxLength={10}
                className="font-mono tracking-wider"
              />
              <p className="text-xs text-muted-foreground">
                {t("vehicles.manualRegHint")}
              </p>
            </div>

            {/* Brand auto-detected preview */}
            {manualVin.length >= 3 && detectedBrand.key !== "unknown" && (
              <div className="flex items-center gap-2 rounded-lg bg-muted p-3">
                <IconCheck className="h-4 w-4 text-green-600" />
                <span className="text-sm">
                  {t("vehicles.manualBrandDetected", {
                    brand: detectedBrand.name,
                  })}
                </span>
                <BrandBadge brand={detectedBrand} />
              </div>
            )}

            {/* Submit */}
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep("method")}>
                {t("common.back")}
              </Button>
              <Button
                onClick={handleAddManualVehicle}
                disabled={!manualVinValid || isManualAdding}
              >
                {isManualAdding ? (
                  <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <IconPlus className="mr-2 h-4 w-4" />
                )}
                {t("vehicles.manualAddButton")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
