import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  IconRoute,
  IconFileText,
  IconBolt,
  IconTag,
  IconChargingPile,
  IconBattery2,
  IconBrandApple,
  IconShieldCheck,
} from "@tabler/icons-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";

/* ── Feature card ─────────────────────────────────────── */

function FeatureCard({
  icon: Icon,
  title,
  body,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <h3 className="mb-2 font-semibold text-foreground">{title}</h3>
      <p className="text-sm leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

/* ── App landing page ─────────────────────────────────── */

export function AppLandingPage() {
  const { t } = useTranslation();
  const year = new Date().getFullYear();

  const features = [
    { icon: IconRoute, titleKey: "appLanding.feature1Title", bodyKey: "appLanding.feature1Body" },
    { icon: IconFileText, titleKey: "appLanding.feature2Title", bodyKey: "appLanding.feature2Body" },
    { icon: IconBolt, titleKey: "appLanding.feature3Title", bodyKey: "appLanding.feature3Body" },
    { icon: IconTag, titleKey: "appLanding.feature4Title", bodyKey: "appLanding.feature4Body" },
    { icon: IconChargingPile, titleKey: "appLanding.feature5Title", bodyKey: "appLanding.feature5Body" },
    { icon: IconBattery2, titleKey: "appLanding.feature6Title", bodyKey: "appLanding.feature6Body" },
  ] as const;

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-bold text-foreground">Millog</span>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Button asChild variant="outline" size="sm">
              <Link to="/login">{t("appLanding.signIn")}</Link>
            </Button>
            <Button asChild size="sm">
              <a
                href="https://apps.apple.com/app/millog/id6504255773"
                target="_blank"
                rel="noopener noreferrer"
              >
                <IconBrandApple className="mr-1.5 h-4 w-4" />
                {t("appLanding.downloadCta")}
              </a>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 pb-20 pt-20 text-center">
        <Badge variant="secondary" className="mb-6 text-xs">
          {t("appLanding.trialBadge")}
        </Badge>
        <h1 className="text-4xl font-bold leading-tight tracking-tight text-foreground sm:text-5xl md:text-6xl">
          {t("appLanding.heroTitle")}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          {t("appLanding.heroSubtitle")}
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="gap-2">
            <a
              href="https://apps.apple.com/app/millog/id6504255773"
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconBrandApple className="h-5 w-5" />
              {t("appLanding.downloadCta")}
            </a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/pricing">{t("appLanding.learnMore")}</Link>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          iOS · {t("appLanding.trialBadge")}
        </p>
      </section>

      {/* Features */}
      <section className="border-t bg-muted/20 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon, titleKey, bodyKey }) => (
              <FeatureCard
                key={titleKey}
                icon={icon}
                title={t(titleKey)}
                body={t(bodyKey)}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Compatible vehicles */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="mb-8 text-2xl font-bold text-foreground">
            {t("appLanding.compatTitle")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-6 text-left">
              <p className="font-semibold text-foreground">
                {t("appLanding.compatTesla")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("appLanding.compatTeslaSub")}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 text-left">
              <p className="font-semibold text-foreground">
                {t("appLanding.compatEnode")}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("appLanding.compatEnodeSub")}
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            {t("appLanding.compatMore")}
          </p>
        </div>
      </section>

      {/* Trust strip */}
      <section className="border-t py-12">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-center gap-6 px-6 text-center sm:flex-row sm:text-left">
          <div className="flex items-center gap-3">
            <IconShieldCheck className="h-6 w-6 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {t("pricing.trustSecurity")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("pricing.trustSecurityDesc")}
              </p>
            </div>
          </div>
          <div className="hidden h-10 w-px bg-border sm:block" />
          <div className="flex items-center gap-3">
            <IconFileText className="h-6 w-6 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {t("pricing.trustTax")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("pricing.trustTaxDesc")}
              </p>
            </div>
          </div>
          <div className="hidden h-10 w-px bg-border sm:block" />
          <div className="flex items-center gap-3">
            <IconRoute className="h-6 w-6 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                {t("pricing.trustAuto")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("pricing.trustAutoDesc")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t bg-primary/5 py-20">
        <div className="mx-auto max-w-xl px-6 text-center">
          <h2 className="text-2xl font-bold text-foreground">
            {t("appLanding.ctaTitle")}
          </h2>
          <p className="mt-3 text-muted-foreground">{t("appLanding.ctaBody")}</p>
          <Button asChild size="lg" className="mt-8 gap-2">
            <a
              href="https://apps.apple.com/app/millog/id6504255773"
              target="_blank"
              rel="noopener noreferrer"
            >
              <IconBrandApple className="h-5 w-5" />
              {t("appLanding.downloadCta")}
            </a>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-6 text-xs text-muted-foreground sm:flex-row">
          <p>{t("appLanding.footerCopyright", { year })}</p>
          <div className="flex gap-5">
            <Link to="/privacy" className="hover:text-foreground">
              {t("appLanding.footerPrivacy")}
            </Link>
            <Link to="/support" className="hover:text-foreground">
              {t("appLanding.footerSupport")}
            </Link>
            <Link to="/pricing" className="hover:text-foreground">
              {t("pricing.title")}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
