import { useState, useCallback, type FormEvent, type ReactNode } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  IconBuilding,
  IconUser,
  IconEye,
  IconTag,
  IconCheck,
  IconChevronRight,
  IconChevronLeft,
  IconRocket,
  IconInfoCircle,
  IconShieldCheck,
  IconCar,
  IconRoute,
  IconChartBar,
  IconBolt,
  IconMapPin,
  IconLoader,
  IconCircleCheck,
  IconSettings,
} from "@tabler/icons-react";

/* ══════════════════════════════════════════════════════════
   Multi-step onboarding wizard for B2B fleet admins.

   Steps:
   1. Organization info (name, org number, billing email)
   2. Admin account (full name, email, password)
   3. Driver visibility — what drivers can see in the app
   4. Trip tagging defaults — default tag, required tagging
   5. Review & create — summary of all choices, then submit
   ══════════════════════════════════════════════════════════ */

const TOTAL_STEPS = 5;

/* ── Types ─────────────────────────────────────────────── */

interface OrgInfo {
  companyName: string;
  orgNumber: string;
  billingEmail: string;
}

interface AdminInfo {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}

interface VisibilitySettings {
  driversCanSeeTrips: boolean;
  driversCanSeeStatistics: boolean;
  driversCanSeeEnergyCost: boolean;
  driversCanSeeMap: boolean;
  driversCanExport: boolean;
  driversCanTagOwnTrips: boolean;
}

interface TaggingSettings {
  defaultTag: "none" | "work" | "commute" | "personal";
  requireTagging: boolean;
  enableCustomTags: boolean;
}

/* ── Step indicator ────────────────────────────────────── */

function StepIndicator({
  currentStep,
  labels,
  completedSteps,
}: {
  currentStep: number;
  labels: string[];
  completedSteps: Set<number>;
}) {
  return (
    <div className="flex items-center justify-center gap-1 md:gap-2 mb-8">
      {labels.map((label, i) => {
        const step = i + 1;
        const isActive = step === currentStep;
        const isCompleted = completedSteps.has(step);

        return (
          <div key={step} className="flex items-center gap-1 md:gap-2">
            {i > 0 && (
              <div
                className={`h-px w-4 md:w-8 transition-colors ${
                  isCompleted || isActive ? "bg-primary" : "bg-muted"
                }`}
              />
            )}
            <div className="flex flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground ring-2 ring-primary/30 ring-offset-2 ring-offset-background"
                    : isCompleted
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {isCompleted && !isActive ? (
                  <IconCheck className="h-4 w-4" />
                ) : (
                  step
                )}
              </div>
              <span
                className={`hidden md:block text-[10px] max-w-[80px] text-center leading-tight ${
                  isActive
                    ? "text-foreground font-medium"
                    : "text-muted-foreground"
                }`}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Info legend ───────────────────────────────────────── */

function Legend({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-sm text-muted-foreground">
      <IconInfoCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
      <span>{children}</span>
    </div>
  );
}

/* ── Toggle setting row ────────────────────────────────── */

function SettingToggle({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:bg-accent/50 has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border-input accent-primary"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

/* ── Radio option row ──────────────────────────────────── */

function RadioOption({
  name,
  value,
  currentValue,
  label,
  description,
  onChange,
}: {
  name: string;
  value: string;
  currentValue: string;
  label: string;
  description?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:bg-accent/50 has-[:checked]:border-primary/40 has-[:checked]:bg-primary/5">
      <input
        type="radio"
        name={name}
        value={value}
        checked={currentValue === value}
        onChange={() => onChange(value)}
        className="mt-1 h-4 w-4 accent-primary"
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{label}</div>
        {description && (
          <div className="text-xs text-muted-foreground">{description}</div>
        )}
      </div>
    </label>
  );
}

/* ── Review row ────────────────────────────────────────── */

function ReviewRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-sm text-muted-foreground shrink-0">{label}</span>
      <span className="text-sm font-medium text-right">{value}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════
   Main SignupPage
   ══════════════════════════════════════════════════════════ */

export function SignupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  /* step tracking */
  const [step, setStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  /* step 1 */
  const [orgInfo, setOrgInfo] = useState<OrgInfo>({
    companyName: "",
    orgNumber: "",
    billingEmail: "",
  });

  /* step 2 */
  const [adminInfo, setAdminInfo] = useState<AdminInfo>({
    fullName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });

  /* step 3 */
  const [visibility, setVisibility] = useState<VisibilitySettings>({
    driversCanSeeTrips: true,
    driversCanSeeStatistics: true,
    driversCanSeeEnergyCost: false,
    driversCanSeeMap: true,
    driversCanExport: false,
    driversCanTagOwnTrips: true,
  });

  /* step 4 */
  const [tagging, setTagging] = useState<TaggingSettings>({
    defaultTag: "none",
    requireTagging: false,
    enableCustomTags: false,
  });

  /* global */
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const stepLabels = [
    t("setup.stepOrg"),
    t("setup.stepAdmin"),
    t("setup.stepVisibility"),
    t("setup.stepTagging"),
    t("setup.stepReview"),
  ];

  const markCompleted = useCallback(
    (s: number) => setCompletedSteps((prev) => new Set([...prev, s])),
    [],
  );

  const goNext = useCallback(() => {
    markCompleted(step);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
    setError(null);
  }, [step, markCompleted]);

  const goBack = useCallback(() => {
    setStep((s) => Math.max(s - 1, 1));
    setError(null);
  }, []);

  /* ── Validation ─────────────────────────────────────── */
  function validateStep1(): boolean {
    if (!orgInfo.companyName.trim()) {
      setError(t("setup.errorCompanyRequired"));
      return false;
    }
    setError(null);
    return true;
  }

  function validateStep2(): boolean {
    if (!adminInfo.fullName.trim()) {
      setError(t("setup.errorNameRequired"));
      return false;
    }
    if (!adminInfo.email.trim()) {
      setError(t("setup.errorEmailRequired"));
      return false;
    }
    if (adminInfo.password.length < 8) {
      setError(t("signup.passwordTooShort"));
      return false;
    }
    if (adminInfo.password !== adminInfo.confirmPassword) {
      setError(t("signup.passwordMismatch"));
      return false;
    }
    setError(null);
    return true;
  }

  function handleNext() {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    goNext();
  }

  /* ── Submit ─────────────────────────────────────────── */
  const [authCreated, setAuthCreated] = useState(false);

  async function createOrg() {
    setError(null);
    setLoading(true);
    const { error: fnError } = await supabase.functions.invoke("fleet-create-org", {
      body: {
        company_name: orgInfo.companyName.trim(),
        org_number: orgInfo.orgNumber.trim() || null,
        billing_email: (orgInfo.billingEmail.trim() || adminInfo.email).trim(),
        settings: { visibility, tagging },
      },
    });
    if (fnError) {
      setError(t("signup.orgCreationFailedRetry"));
      setLoading(false);
      return false;
    }
    return true;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // 1. Create auth user (skip if already created from a previous attempt)
    if (!authCreated) {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: adminInfo.email.trim(),
        password: adminInfo.password,
        options: {
          data: {
            full_name: adminInfo.fullName.trim(),
            company_name: orgInfo.companyName.trim(),
          },
        },
      });

      if (authError) {
        setError(authError.message);
        setLoading(false);
        return;
      }

      if (!authData.user) {
        setError(t("signup.orgCreationFailed"));
        setLoading(false);
        return;
      }

      setAuthCreated(true);
    }

    // 2. Create org + membership via Edge Function
    const ok = await createOrg();
    if (!ok) return;

    setLoading(false);
    markCompleted(TOTAL_STEPS);
    setDone(true);
  }

  /* ── Toggle helpers ─────────────────────────────────── */
  const setVis = useCallback(
    <K extends keyof VisibilitySettings>(key: K, val: VisibilitySettings[K]) =>
      setVisibility((prev) => ({ ...prev, [key]: val })),
    [],
  );

  const setTag = useCallback(
    <K extends keyof TaggingSettings>(key: K, val: TaggingSettings[K]) =>
      setTagging((prev) => ({ ...prev, [key]: val })),
    [],
  );

  /* ══════════════════════════════════════════════════════
     Success screen
     ══════════════════════════════════════════════════════ */
  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-lg text-center">
          <CardHeader className="pb-2">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
              <IconCircleCheck className="h-10 w-10 text-green-500" />
            </div>
            <CardTitle className="text-2xl">{t("setup.successTitle")}</CardTitle>
            <CardDescription className="text-base">
              {t("setup.successDescription", { company: orgInfo.companyName })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-4 text-left space-y-2">
              <p className="text-sm font-medium">{t("setup.successNextSteps")}</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-center gap-2">
                  <IconUser className="h-4 w-4 text-primary shrink-0" />
                  {t("setup.successStep1")}
                </li>
                <li className="flex items-center gap-2">
                  <IconCar className="h-4 w-4 text-primary shrink-0" />
                  {t("setup.successStep2")}
                </li>
                <li className="flex items-center gap-2">
                  <IconSettings className="h-4 w-4 text-primary shrink-0" />
                  {t("setup.successStep3")}
                </li>
              </ul>
            </div>
          </CardContent>
          <CardFooter>
            <Button onClick={() => navigate("/dashboard")} className="w-full gap-2">
              <IconRocket className="h-4 w-4" />
              {t("setup.goToDashboard")}
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  /* ══════════════════════════════════════════════════════
     Wizard
     ══════════════════════════════════════════════════════ */
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-2xl">
        {/* Branding */}
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight">{t("setup.wizardTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("setup.wizardSubtitle")}</p>
        </div>

        <StepIndicator
          currentStep={step}
          labels={stepLabels}
          completedSteps={completedSteps}
        />

        <Card>
          {/* ── STEP 1: Organisation ──────────────────────── */}
          {step === 1 && (
            <>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <IconBuilding className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle>{t("setup.orgTitle")}</CardTitle>
                    <CardDescription>{t("setup.orgDescription")}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="company">{t("setup.companyName")}</Label>
                  <Input
                    id="company"
                    value={orgInfo.companyName}
                    onChange={(e) => setOrgInfo({ ...orgInfo, companyName: e.target.value })}
                    placeholder={t("setup.companyPlaceholder")}
                    autoFocus
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="orgNumber">
                    {t("setup.orgNumber")}
                    <span className="ml-1 text-xs text-muted-foreground font-normal">
                      ({t("setup.optional")})
                    </span>
                  </Label>
                  <Input
                    id="orgNumber"
                    value={orgInfo.orgNumber}
                    onChange={(e) => setOrgInfo({ ...orgInfo, orgNumber: e.target.value })}
                    placeholder="556123-4567"
                  />
                  <p className="text-xs text-muted-foreground">{t("setup.orgNumberHint")}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="billingEmail">
                    {t("setup.billingEmail")}
                    <span className="ml-1 text-xs text-muted-foreground font-normal">
                      ({t("setup.optional")})
                    </span>
                  </Label>
                  <Input
                    id="billingEmail"
                    type="email"
                    value={orgInfo.billingEmail}
                    onChange={(e) => setOrgInfo({ ...orgInfo, billingEmail: e.target.value })}
                    placeholder={t("setup.billingEmailPlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground">{t("setup.billingEmailHint")}</p>
                </div>

                <Legend>{t("setup.orgLegend")}</Legend>

                {error && <p className="text-sm text-destructive">{error}</p>}
              </CardContent>
            </>
          )}

          {/* ── STEP 2: Admin account ─────────────────────── */}
          {step === 2 && (
            <>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <IconShieldCheck className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle>{t("setup.adminTitle")}</CardTitle>
                    <CardDescription>{t("setup.adminDescription")}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">{t("setup.fullName")}</Label>
                  <Input
                    id="fullName"
                    value={adminInfo.fullName}
                    onChange={(e) => setAdminInfo({ ...adminInfo, fullName: e.target.value })}
                    placeholder={t("setup.fullNamePlaceholder")}
                    autoFocus
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">{t("auth.email")}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={adminInfo.email}
                    onChange={(e) => setAdminInfo({ ...adminInfo, email: e.target.value })}
                    placeholder={t("setup.emailPlaceholder")}
                    required
                    autoComplete="email"
                  />
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="password">{t("auth.password")}</Label>
                  <Input
                    id="password"
                    type="password"
                    value={adminInfo.password}
                    onChange={(e) => setAdminInfo({ ...adminInfo, password: e.target.value })}
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                  <p className="text-xs text-muted-foreground">{t("setup.passwordHint")}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">{t("signup.confirmPassword")}</Label>
                  <Input
                    id="confirmPassword"
                    type="password"
                    value={adminInfo.confirmPassword}
                    onChange={(e) => setAdminInfo({ ...adminInfo, confirmPassword: e.target.value })}
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>

                <Legend>{t("setup.adminLegend")}</Legend>

                {error && <p className="text-sm text-destructive">{error}</p>}
              </CardContent>
            </>
          )}

          {/* ── STEP 3: Driver visibility ─────────────────── */}
          {step === 3 && (
            <>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <IconEye className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle>{t("setup.visibilityTitle")}</CardTitle>
                    <CardDescription>{t("setup.visibilityDescription")}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <Legend>{t("setup.visibilityLegend")}</Legend>

                <SettingToggle
                  icon={<IconRoute className="h-4 w-4" />}
                  label={t("setup.visTrips")}
                  description={t("setup.visTripsDesc")}
                  checked={visibility.driversCanSeeTrips}
                  onChange={(v) => setVis("driversCanSeeTrips", v)}
                />

                <SettingToggle
                  icon={<IconChartBar className="h-4 w-4" />}
                  label={t("setup.visStatistics")}
                  description={t("setup.visStatisticsDesc")}
                  checked={visibility.driversCanSeeStatistics}
                  onChange={(v) => setVis("driversCanSeeStatistics", v)}
                />

                <SettingToggle
                  icon={<IconBolt className="h-4 w-4" />}
                  label={t("setup.visEnergyCost")}
                  description={t("setup.visEnergyCostDesc")}
                  checked={visibility.driversCanSeeEnergyCost}
                  onChange={(v) => setVis("driversCanSeeEnergyCost", v)}
                />

                <SettingToggle
                  icon={<IconMapPin className="h-4 w-4" />}
                  label={t("setup.visMap")}
                  description={t("setup.visMapDesc")}
                  checked={visibility.driversCanSeeMap}
                  onChange={(v) => setVis("driversCanSeeMap", v)}
                />

                <SettingToggle
                  icon={<IconTag className="h-4 w-4" />}
                  label={t("setup.visTagging")}
                  description={t("setup.visTaggingDesc")}
                  checked={visibility.driversCanTagOwnTrips}
                  onChange={(v) => setVis("driversCanTagOwnTrips", v)}
                />

                <SettingToggle
                  icon={<IconChartBar className="h-4 w-4" />}
                  label={t("setup.visExport")}
                  description={t("setup.visExportDesc")}
                  checked={visibility.driversCanExport}
                  onChange={(v) => setVis("driversCanExport", v)}
                />

                {error && <p className="text-sm text-destructive">{error}</p>}
              </CardContent>
            </>
          )}

          {/* ── STEP 4: Tagging defaults ──────────────────── */}
          {step === 4 && (
            <>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <IconTag className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle>{t("setup.taggingTitle")}</CardTitle>
                    <CardDescription>{t("setup.taggingDescription")}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Legend>{t("setup.taggingLegend")}</Legend>

                <div className="space-y-2">
                  <Label className="text-sm font-medium">{t("setup.defaultTagLabel")}</Label>
                  <p className="text-xs text-muted-foreground mb-2">{t("setup.defaultTagHint")}</p>
                  <div className="space-y-2">
                    <RadioOption
                      name="defaultTag"
                      value="none"
                      currentValue={tagging.defaultTag}
                      label={t("setup.tagNone")}
                      description={t("setup.tagNoneDesc")}
                      onChange={(v) => setTag("defaultTag", v as TaggingSettings["defaultTag"])}
                    />
                    <RadioOption
                      name="defaultTag"
                      value="work"
                      currentValue={tagging.defaultTag}
                      label={t("setup.tagWork")}
                      description={t("setup.tagWorkDesc")}
                      onChange={(v) => setTag("defaultTag", v as TaggingSettings["defaultTag"])}
                    />
                    <RadioOption
                      name="defaultTag"
                      value="commute"
                      currentValue={tagging.defaultTag}
                      label={t("setup.tagCommute")}
                      description={t("setup.tagCommuteDesc")}
                      onChange={(v) => setTag("defaultTag", v as TaggingSettings["defaultTag"])}
                    />
                    <RadioOption
                      name="defaultTag"
                      value="personal"
                      currentValue={tagging.defaultTag}
                      label={t("setup.tagPersonal")}
                      description={t("setup.tagPersonalDesc")}
                      onChange={(v) => setTag("defaultTag", v as TaggingSettings["defaultTag"])}
                    />
                  </div>
                </div>

                <Separator />

                <SettingToggle
                  icon={<IconShieldCheck className="h-4 w-4" />}
                  label={t("setup.requireTagging")}
                  description={t("setup.requireTaggingDesc")}
                  checked={tagging.requireTagging}
                  onChange={(v) => setTag("requireTagging", v)}
                />

                <SettingToggle
                  icon={<IconTag className="h-4 w-4" />}
                  label={t("setup.enableCustomTags")}
                  description={t("setup.enableCustomTagsDesc")}
                  checked={tagging.enableCustomTags}
                  onChange={(v) => setTag("enableCustomTags", v)}
                />

                {error && <p className="text-sm text-destructive">{error}</p>}
              </CardContent>
            </>
          )}

          {/* ── STEP 5: Review & create ───────────────────── */}
          {step === 5 && (
            <>
              <CardHeader>
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <IconCheck className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle>{t("setup.reviewTitle")}</CardTitle>
                    <CardDescription>{t("setup.reviewDescription")}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Organization */}
                <div className="rounded-lg border p-4 space-y-1">
                  <div className="flex items-center gap-2 mb-2">
                    <IconBuilding className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">{t("setup.reviewOrgSection")}</span>
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="ml-auto text-xs text-primary hover:underline"
                    >
                      {t("common.edit")}
                    </button>
                  </div>
                  <ReviewRow label={t("setup.companyName")} value={orgInfo.companyName} />
                  {orgInfo.orgNumber && (
                    <ReviewRow label={t("setup.orgNumber")} value={orgInfo.orgNumber} />
                  )}
                  {orgInfo.billingEmail && (
                    <ReviewRow label={t("setup.billingEmail")} value={orgInfo.billingEmail} />
                  )}
                </div>

                {/* Admin */}
                <div className="rounded-lg border p-4 space-y-1">
                  <div className="flex items-center gap-2 mb-2">
                    <IconShieldCheck className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">{t("setup.reviewAdminSection")}</span>
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="ml-auto text-xs text-primary hover:underline"
                    >
                      {t("common.edit")}
                    </button>
                  </div>
                  <ReviewRow label={t("setup.fullName")} value={adminInfo.fullName} />
                  <ReviewRow label={t("auth.email")} value={adminInfo.email} />
                  <ReviewRow label={t("auth.password")} value="••••••••" />
                </div>

                {/* Visibility */}
                <div className="rounded-lg border p-4 space-y-1">
                  <div className="flex items-center gap-2 mb-2">
                    <IconEye className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">{t("setup.reviewVisSection")}</span>
                    <button
                      type="button"
                      onClick={() => setStep(3)}
                      className="ml-auto text-xs text-primary hover:underline"
                    >
                      {t("common.edit")}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {visibility.driversCanSeeTrips && (
                      <Badge variant="secondary">{t("setup.visTrips")}</Badge>
                    )}
                    {visibility.driversCanSeeStatistics && (
                      <Badge variant="secondary">{t("setup.visStatistics")}</Badge>
                    )}
                    {visibility.driversCanSeeEnergyCost && (
                      <Badge variant="secondary">{t("setup.visEnergyCost")}</Badge>
                    )}
                    {visibility.driversCanSeeMap && (
                      <Badge variant="secondary">{t("setup.visMap")}</Badge>
                    )}
                    {visibility.driversCanTagOwnTrips && (
                      <Badge variant="secondary">{t("setup.visTagging")}</Badge>
                    )}
                    {visibility.driversCanExport && (
                      <Badge variant="secondary">{t("setup.visExport")}</Badge>
                    )}
                  </div>
                </div>

                {/* Tagging */}
                <div className="rounded-lg border p-4 space-y-1">
                  <div className="flex items-center gap-2 mb-2">
                    <IconTag className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">{t("setup.reviewTagSection")}</span>
                    <button
                      type="button"
                      onClick={() => setStep(4)}
                      className="ml-auto text-xs text-primary hover:underline"
                    >
                      {t("common.edit")}
                    </button>
                  </div>
                  <ReviewRow
                    label={t("setup.defaultTagLabel")}
                    value={
                      tagging.defaultTag === "none"
                        ? t("setup.tagNone")
                        : tagging.defaultTag === "work"
                        ? t("setup.tagWork")
                        : tagging.defaultTag === "commute"
                        ? t("setup.tagCommute")
                        : t("setup.tagPersonal")
                    }
                  />
                  <ReviewRow
                    label={t("setup.requireTagging")}
                    value={tagging.requireTagging ? t("setup.yes") : t("setup.no")}
                  />
                  <ReviewRow
                    label={t("setup.enableCustomTags")}
                    value={tagging.enableCustomTags ? t("setup.yes") : t("setup.no")}
                  />
                </div>

                <Legend>{t("setup.reviewLegend")}</Legend>

                {error && (
                  <div className="space-y-2">
                    <p className="text-sm text-destructive">{error}</p>
                    {authCreated && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          const ok = await createOrg();
                          if (ok) {
                            setLoading(false);
                            markCompleted(TOTAL_STEPS);
                            setDone(true);
                          }
                        }}
                        disabled={loading}
                      >
                        {t("signup.retryCreateOrg")}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </>
          )}

          {/* ── Footer ────────────────────────────────────── */}
          <CardFooter className="flex items-center justify-between gap-3 pt-4">
            <div>
              {step > 1 && (
                <Button variant="ghost" type="button" onClick={goBack} className="gap-1">
                  <IconChevronLeft className="h-4 w-4" />
                  {t("setup.back")}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {step === 1 && (
                <p className="text-xs text-muted-foreground mr-2">
                  {t("signup.hasAccount")}{" "}
                  <Link to="/login" className="underline hover:text-foreground">
                    {t("auth.login")}
                  </Link>
                </p>
              )}
              {step < TOTAL_STEPS ? (
                <Button type="button" onClick={handleNext} className="gap-1">
                  {t("setup.next")}
                  <IconChevronRight className="h-4 w-4" />
                </Button>
              ) : (
                <form onSubmit={handleSubmit}>
                  <Button type="submit" disabled={loading} className="gap-1">
                    {loading ? (
                      <>
                        <IconLoader className="h-4 w-4 animate-spin" />
                        {t("setup.creating")}
                      </>
                    ) : (
                      <>
                        <IconRocket className="h-4 w-4" />
                        {t("setup.createOrg")}
                      </>
                    )}
                  </Button>
                </form>
              )}
            </div>
          </CardFooter>
        </Card>

        {/* Mobile step counter */}
        <p className="md:hidden mt-4 text-center text-xs text-muted-foreground">
          {t("setup.stepOf", { current: step, total: TOTAL_STEPS })}
        </p>
      </div>
    </div>
  );
}
