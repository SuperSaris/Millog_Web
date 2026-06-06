import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  IconCheck,
  IconBolt,
  IconRoute,
  IconBuilding,
  IconShieldCheck,
  IconFileText,
  IconMapPin,
} from "@tabler/icons-react";

/* ── Feature list items ────────────────────────────────── */

function FeatureItem({ label }: { label: string }) {
  return (
    <li className="flex items-center gap-2 text-sm">
      <IconCheck className="h-4 w-4 shrink-0 text-green-500" />
      {label}
    </li>
  );
}

/* ── Plan card ─────────────────────────────────────────── */

interface PlanCardProps {
  name: string;
  price: string;
  originalPrice?: string;
  period: string;
  saving?: string;
  discountPercent?: string;
  description: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
  highlighted?: boolean;
  badge?: string;
  limitedOfferBadge?: string;
  trialNote: string;
}

function PlanCard({
  name, price, originalPrice, period, saving, discountPercent, description, features,
  ctaLabel, ctaHref, highlighted, badge, limitedOfferBadge, trialNote,
}: PlanCardProps) {
  return (
    <div
      className={`relative flex flex-col rounded-2xl border p-6 ${
        highlighted
          ? "border-primary bg-primary/5 shadow-lg"
          : "border-border bg-card"
      }`}
    >
      {limitedOfferBadge && (
        <span className="absolute -top-3 right-4 rounded-full border border-sky-400/60 bg-sky-400/15 px-2.5 py-0.5 text-[10px] font-semibold text-sky-600 dark:text-sky-300">
          {limitedOfferBadge}
        </span>
      )}
      {badge && (
        <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 px-3">
          {badge}
        </Badge>
      )}
      <div className="mb-4">
        <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">{name}</p>
        <div className="mt-1 flex items-end gap-2">
          <span className="text-4xl font-bold">{price}</span>
          <span className="mb-1 text-sm text-muted-foreground">{period}</span>
          {discountPercent && (
            <span className="mb-1 rounded-md bg-green-500/15 px-1.5 py-0.5 text-xs font-bold text-green-600 dark:text-green-400">
              {discountPercent}
            </span>
          )}
        </div>
        {originalPrice && (
          <p className="mt-0.5 text-xs text-muted-foreground line-through">{originalPrice} {period}</p>
        )}
        {saving && (
          <p className="mt-1 text-xs font-medium text-green-600 dark:text-green-400">{saving}</p>
        )}
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      </div>

      <ul className="mb-6 flex-1 space-y-2">
        {features.map((f) => (
          <FeatureItem key={f} label={f} />
        ))}
      </ul>

      <Button asChild className="w-full" variant={highlighted ? "default" : "outline"}>
        <Link to={ctaHref}>{ctaLabel}</Link>
      </Button>

      <p className="mt-3 text-center text-xs text-muted-foreground">{trialNote}</p>
    </div>
  );
}

/* ── Pricing page ──────────────────────────────────────── */

export function PricingPage() {
  const { t } = useTranslation();

  const personalFeatures = [
    t("pricing.featPersonalTrips"),
    t("pricing.featPersonalStats"),
    t("pricing.featPersonalExport"),
    t("pricing.featPersonalTax"),
    t("pricing.featPersonalCost"),
  ];

  const fleetFeatures = [
    t("pricing.featFleetDrivers"),
    t("pricing.featFleetVehicles"),
    t("pricing.featFleetCompliance"),
    t("pricing.featFleetReports"),
    t("pricing.featFleetTelemetry"),
    t("pricing.featFleetAdmin"),
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="border-b">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2 font-semibold text-lg">
            <IconBolt className="h-5 w-5 text-primary" />
            Millog
          </Link>
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/login">{t("auth.login")}</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/signup/personal">{t("auth.createPersonalAccount")}</Link>
            </Button>
          </div>
        </div>
      </div>

      {/* ── Hero ───────────────────────────────────────── */}
      <div className="mx-auto max-w-5xl px-4 py-16 text-center">
        <Badge variant="secondary" className="mb-4">{t("pricing.trialBadge", { days: 14 })}</Badge>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          {t("pricing.title")}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground text-lg">
          {t("pricing.subtitle")}
        </p>
      </div>

      {/* ── Personal plans ─────────────────────────────── */}
      <div className="mx-auto max-w-5xl px-4 pb-12">
        <div className="mb-6 flex items-center gap-3">
          <IconRoute className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">{t("pricing.sectionPersonal")}</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <PlanCard
            name={t("billing.planName_personal_monthly")}
            price="49"
            originalPrice="79"
            period={t("pricing.perMonth")}
            description={t("pricing.personalMonthlyDesc")}
            features={personalFeatures}
            ctaLabel={t("billing.startTrial")}
            ctaHref="/signup/personal"
            limitedOfferBadge={t("pricing.limitedOffer")}
            trialNote={t("billing.trialExplain", { days: 14 })}
          />
          <PlanCard
            name={t("billing.planName_personal_annual")}
            price="549"
            originalPrice="949"
            discountPercent="-42%"
            period={t("pricing.perYear")}
            saving={t("pricing.annualSaving", { amount: 399 })}
            description={t("pricing.personalAnnualDesc")}
            features={personalFeatures}
            ctaLabel={t("billing.startTrial")}
            ctaHref="/signup/personal"
            highlighted
            badge={t("billing.bestValue")}
            limitedOfferBadge={t("pricing.limitedOffer")}
            trialNote={t("billing.trialExplain", { days: 14 })}
          />
        </div>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {t("pricing.mobileNote")}
        </p>
      </div>

      {/* ── Fleet plan ─────────────────────────────────── */}
      <div className="mx-auto max-w-5xl px-4 pb-16">
        <div className="mb-6 flex items-center gap-3">
          <IconBuilding className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">{t("pricing.sectionFleet")}</h2>
        </div>

        <div className="rounded-2xl border bg-card p-6 sm:p-8">
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
                {t("billing.planName_fleet_monthly")}
              </p>
              <div className="mt-2 flex items-end gap-1">
                <span className="text-4xl font-bold">129</span>
                <span className="mb-1 text-sm text-muted-foreground">{t("pricing.perVehicleMonth")}</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{t("pricing.fleetDesc")}</p>
              <p className="mt-4 text-xs text-muted-foreground">{t("pricing.fleetPriceNote")}</p>

              <div className="mt-6 flex flex-col gap-3">
                <Button asChild>
                  <Link to="/signup">{t("pricing.createFleetAccount")}</Link>
                </Button>
                <p className="text-xs text-muted-foreground">
                  {t("billing.trialExplain", { days: 14 })}
                </p>
              </div>
            </div>

            <ul className="space-y-2">
              {fleetFeatures.map((f) => (
                <FeatureItem key={f} label={f} />
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* ── FAQ / trust ────────────────────────────────── */}
      <div className="border-t bg-muted/30">
        <div className="mx-auto grid max-w-5xl gap-6 px-4 py-12 sm:grid-cols-3">
          {[
            { icon: IconShieldCheck, titleKey: "pricing.trustSecurity", descKey: "pricing.trustSecurityDesc" },
            { icon: IconFileText,    titleKey: "pricing.trustTax",      descKey: "pricing.trustTaxDesc" },
            { icon: IconMapPin,      titleKey: "pricing.trustAuto",     descKey: "pricing.trustAutoDesc" },
          ].map(({ icon: Icon, titleKey, descKey }) => (
            <div key={titleKey} className="flex flex-col gap-2">
              <Icon className="h-6 w-6 text-primary" />
              <p className="font-semibold text-sm">{t(titleKey as "pricing.trustSecurity")}</p>
              <p className="text-xs text-muted-foreground">{t(descKey as "pricing.trustSecurityDesc")}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Footer ─────────────────────────────────────── */}
      <div className="border-t">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 text-xs text-muted-foreground">
          <span>{t("auth.copyright", { year: new Date().getFullYear() })}</span>
          <div className="flex gap-4">
            <Link to="/login" className="hover:underline">{t("auth.login")}</Link>
            <Link to="/signup" className="hover:underline">{t("auth.createOrgAccount")}</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
