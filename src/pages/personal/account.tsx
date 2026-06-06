import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth-context";
import { useSubscription } from "@/hooks/use-subscription";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LanguageSwitcher } from "@/components/language-switcher";
import {
  IconCreditCard,
  IconUser,
  IconAlertTriangle,
  IconLanguage,
  IconTag,
  IconRuler2,
  IconCash,
  IconBolt,
  IconCar,
  IconCheck,
  IconSparkles,
  IconShieldCheck,
  IconFileText,
  IconMapPin,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { SettingsTagsSection }          from "./settings-tags";
import { SettingsUnitsSection }         from "./settings-units";
import { SettingsReimbursementSection } from "./settings-reimbursement";
import { SettingsElectricitySection }   from "./settings-electricity";
import { SettingsVehiclesSection }      from "./settings-vehicles";

/* ── Billing Section ───────────────────────────────────── */

function PersonalBillingSection() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const sub = useSubscription();
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [loadingCheckout, setLoadingCheckout] = useState<string | null>(null);

  async function openPortal() {
    if (!session) return;
    setLoadingPortal(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-customer-portal", {
        body: { user_type: "personal" },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error || !data?.url) throw new Error(error?.message ?? t("billing.portalError"));
      window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("billing.portalError"));
      setLoadingPortal(false);
    }
  }

  async function startCheckout(plan: "personal_monthly" | "personal_annual") {
    if (!session) return;
    setLoadingCheckout(plan);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-create-checkout", {
        body: { plan, user_type: "personal" },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error || !data?.url) throw new Error(error?.message ?? t("billing.checkoutError"));
      window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("billing.checkoutError"));
      setLoadingCheckout(null);
    }
  }

  const formatDate = (iso: string | null) =>
    iso ? new Intl.DateTimeFormat("sv-SE", { dateStyle: "long" }).format(new Date(iso)) : "—";

  if (sub.loading) {
    return (
      <div className="space-y-4 py-8">
        <div className="mx-auto h-16 w-16 animate-pulse rounded-full bg-muted" />
        <div className="mx-auto h-6 w-48 animate-pulse rounded bg-muted" />
        <div className="mx-auto h-4 w-64 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  /* ── Active subscription view ─────────────────────────── */
  if (sub.isActive || sub.isPastDue) {
    const statusBadgeVariant = (): "default" | "secondary" | "destructive" | "outline" => {
      switch (sub.status) {
        case "active":   return "default";
        case "trialing": return "secondary";
        case "past_due":
        case "unpaid":   return "destructive";
        default:         return "outline";
      }
    };

    return (
      <div className="space-y-4">
        {sub.isPastDue && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
            <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="flex-1 space-y-1">
              <p className="text-sm font-medium text-destructive">{t("billing.pastDueTitle")}</p>
              <p className="text-sm text-destructive/80">{t("billing.pastDueDescription")}</p>
              <Button size="sm" variant="destructive" onClick={openPortal} disabled={loadingPortal} className="mt-2">
                {loadingPortal ? t("common.loading") : t("billing.updatePaymentMethod")}
              </Button>
            </div>
          </div>
        )}
        {sub.trialEndingSoon && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
            <IconAlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
              {t("billing.trialEndingSoon", { days: sub.daysUntilExpiry })}
            </p>
          </div>
        )}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconCreditCard className="h-5 w-5 text-primary" />
                <CardTitle>{t("billing.subscriptionTitle")}</CardTitle>
              </div>
              <Badge variant={statusBadgeVariant()}>
                {t(`billing.status_${sub.status}` as "billing.status_active")}
              </Badge>
            </div>
            <CardDescription>{t("billing.subscriptionDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground">{t("billing.plan")}</p>
                <p className="font-medium">
                  {sub.plan
                    ? t(`billing.planName_${sub.plan}` as "billing.planName_personal_monthly")
                    : "—"}
                </p>
              </div>
              {sub.isTrialing && sub.trialEndsAt && (
                <div>
                  <p className="text-muted-foreground">{t("billing.trialEnds")}</p>
                  <p className="font-medium">{formatDate(sub.trialEndsAt)}</p>
                </div>
              )}
              {!sub.isTrialing && sub.currentPeriodEnd && (
                <div>
                  <p className="text-muted-foreground">{t("billing.nextBilling")}</p>
                  <p className="font-medium">{formatDate(sub.currentPeriodEnd)}</p>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button variant="outline" onClick={openPortal} disabled={loadingPortal}>
                {loadingPortal ? t("common.loading") : t("billing.manageSubscription")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("billing.portalHelp")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  /* ── Upsell view — pricing-page style ─────────────────── */
  const features = [
    t("pricing.featPersonalTrips"),
    t("pricing.featPersonalStats"),
    t("pricing.featPersonalExport"),
    t("pricing.featPersonalTax"),
    t("pricing.featPersonalCost"),
    t("pricing.featFleetTelemetry").replace("Realtime", "Realtid"), // reuse "Realtidstelemetri"
  ];

  const trustItems = [
    { icon: IconShieldCheck, titleKey: "pricing.trustSecurity", descKey: "pricing.trustSecurityDesc" },
    { icon: IconFileText,    titleKey: "pricing.trustTax",      descKey: "pricing.trustTaxDesc" },
    { icon: IconMapPin,      titleKey: "pricing.trustAuto",     descKey: "pricing.trustAutoDesc" },
  ] as const;

  return (
    <div className="space-y-10">
      {/* ── Hero ──────────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-5 pt-6 text-center">
        {/* Animated bolt */}
        <div className="relative flex h-24 w-24 items-center justify-center">
          <span className="absolute h-16 w-16 animate-ping rounded-full bg-primary/20 animation-duration-[2s]" />
          <span className="absolute h-16 w-16 animate-ping rounded-full bg-primary/15 animation-duration-[2s] [animation-delay:0.8s]" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/30">
            <IconBolt className="h-8 w-8 text-primary-foreground" />
          </div>
        </div>
        <div className="space-y-2">
          <Badge variant="secondary" className="mb-1">
            {t("pricing.trialBadge", { days: 14 })}
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight">
            {t("billing.premiumHeroTitle")}
          </h2>
          <p className="mx-auto max-w-md text-muted-foreground">
            {t("billing.premiumHeroSubtitle")}
          </p>
        </div>
      </div>

      {/* ── What's included ───────────────────────────────── */}
      <div>
        <p className="mb-4 text-center text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          {t("billing.whatsIncluded")}
        </p>
        <div className="mx-auto grid max-w-2xl grid-cols-1 gap-x-10 gap-y-3 sm:grid-cols-2 rounded-xl border bg-muted/20 px-8 py-6">
          {features.map((f) => (
            <div key={f} className="flex items-center gap-2.5 text-sm">
              <IconCheck className="h-4 w-4 shrink-0 text-green-500" />
              {f}
            </div>
          ))}
        </div>
      </div>

      {/* ── Plan cards ────────────────────────────────────── */}
      <div className="mx-auto grid max-w-2xl gap-4 sm:grid-cols-2">
        {/* Monthly */}
        <div className="relative flex flex-col rounded-2xl border bg-card p-6">
          <span className="absolute -top-3 right-4 rounded-full border border-sky-400/60 bg-sky-400/15 px-2.5 py-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-300">
            {t("pricing.limitedOffer")}
          </span>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {t("billing.planName_personal_monthly")}
          </p>
          <div className="mt-2 flex items-end gap-1">
            <span className="text-4xl font-bold">49</span>
            <span className="mb-1 text-sm text-muted-foreground">{t("pricing.perMonth")}</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground line-through">79 {t("pricing.perMonth")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t("billing.cancelAnytime")}</p>
          <Button
            className="mt-6 w-full"
            variant="outline"
            onClick={() => startCheckout("personal_monthly")}
            disabled={loadingCheckout !== null}
          >
            {loadingCheckout === "personal_monthly" ? t("common.loading") : t("billing.startTrial")}
          </Button>
        </div>

        {/* Annual — highlighted */}
        <div className="relative flex flex-col rounded-2xl border border-primary/40 bg-primary/5 p-6 shadow-sm">
          <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 gap-1 px-3">
            <IconSparkles className="h-3 w-3" />
            {t("billing.bestValue")}
          </Badge>
          <span className="absolute -top-3 right-4 rounded-full border border-sky-400/60 bg-sky-400/15 px-2.5 py-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-300">
            {t("pricing.limitedOffer")}
          </span>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {t("billing.planName_personal_annual")}
          </p>
          <div className="mt-2 flex items-end gap-2">
            <span className="text-4xl font-bold">549</span>
            <span className="mb-1 text-sm text-muted-foreground">{t("pricing.perYear")}</span>
            <span className="mb-1 rounded-md bg-green-500/15 px-1.5 py-0.5 text-xs font-bold text-green-600 dark:text-green-400">-42%</span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground line-through">949 {t("pricing.perYear")}</p>
          <p className="mt-1 text-xs font-medium text-green-600 dark:text-green-400">
            {t("pricing.annualSaving", { amount: 399 })}
          </p>
          <Button
            className="mt-6 w-full"
            onClick={() => startCheckout("personal_annual")}
            disabled={loadingCheckout !== null}
          >
            {loadingCheckout === "personal_annual" ? t("common.loading") : t("billing.startTrial")}
          </Button>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {t("billing.trialExplain", { days: 14 })}
      </p>

      {/* ── Trust strip ───────────────────────────────────── */}
      <div className="border-t pt-8">
        <div className="grid gap-6 sm:grid-cols-3">
          {trustItems.map(({ icon: Icon, titleKey, descKey }) => (
            <div key={titleKey} className="flex flex-col gap-1.5">
              <Icon className="h-5 w-5 text-primary" />
              <p className="text-sm font-semibold">{t(titleKey)}</p>
              <p className="text-xs text-muted-foreground">{t(descKey)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Personal Account Page ─────────────────────────────── */

export function PersonalAccountPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("personal.account")}</h1>
        <p className="text-muted-foreground">{t("personal.accountDescription")}</p>
      </div>

      <Tabs defaultValue="billing">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="billing">
            <IconCreditCard className="mr-1.5 h-4 w-4" />
            {t("settings.tabBilling")}
          </TabsTrigger>
          <TabsTrigger value="profile">
            <IconUser className="mr-1.5 h-4 w-4" />
            {t("personal.profileTab")}
          </TabsTrigger>
          <TabsTrigger value="language">
            <IconLanguage className="mr-1.5 h-4 w-4" />
            {t("settings.language")}
          </TabsTrigger>
          <TabsTrigger value="tags">
            <IconTag className="mr-1.5 h-4 w-4" />
            {t("settings.tagsTab")}
          </TabsTrigger>
          <TabsTrigger value="units">
            <IconRuler2 className="mr-1.5 h-4 w-4" />
            {t("settings.unitsTab")}
          </TabsTrigger>
          <TabsTrigger value="reimbursement">
            <IconCash className="mr-1.5 h-4 w-4" />
            {t("settings.reimbursementTab")}
          </TabsTrigger>
          <TabsTrigger value="electricity">
            <IconBolt className="mr-1.5 h-4 w-4" />
            {t("settings.electricityTab")}
          </TabsTrigger>
          <TabsTrigger value="vehicles">
            <IconCar className="mr-1.5 h-4 w-4" />
            {t("settings.vehiclesTab")}
          </TabsTrigger>
        </TabsList>

        {/* ── Billing tab ─────────────────────────── */}
        <TabsContent value="billing" className="mt-4">
          <PersonalBillingSection />
        </TabsContent>

        {/* ── Profile tab ─────────────────────────── */}
        <TabsContent value="profile" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <IconUser className="h-5 w-5 text-primary" />
                <CardTitle>{t("personal.profileTab")}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-muted-foreground">{t("auth.email")}</p>
                <p className="font-medium">{user?.email ?? "—"}</p>
              </div>
              <p className="text-xs text-muted-foreground">{t("personal.profileNote")}</p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Language tab ─────────────────────────── */}
        <TabsContent value="language" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("settings.language")}</CardTitle>
              <CardDescription>{t("settings.languageDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <LanguageSwitcher />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tags tab ─────────────────────────── */}
        <TabsContent value="tags" className="mt-4">
          <SettingsTagsSection />
        </TabsContent>

        {/* ── Units tab ─────────────────────────── */}
        <TabsContent value="units" className="mt-4">
          <SettingsUnitsSection />
        </TabsContent>

        {/* ── Reimbursement tab ─────────────────────────── */}
        <TabsContent value="reimbursement" className="mt-4">
          <SettingsReimbursementSection />
        </TabsContent>

        {/* ── Electricity tab ─────────────────────────── */}
        <TabsContent value="electricity" className="mt-4">
          <SettingsElectricitySection />
        </TabsContent>

        {/* ── Vehicles tab ─────────────────────────── */}
        <TabsContent value="vehicles" className="mt-4">
          <SettingsVehiclesSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}
