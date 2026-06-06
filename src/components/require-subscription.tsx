import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useSubscription } from "@/hooks/use-subscription";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { IconLock, IconSparkles } from "@tabler/icons-react";

interface RequireSubscriptionProps {
  children: ReactNode;
  /** Override the redirect URL shown on the upgrade prompt */
  upgradeHref?: string;
}

/**
 * RequireSubscription — gates content behind an active subscription.
 *
 * Active/trialing  → renders children normally.
 * Loading          → renders a skeleton placeholder.
 * Inactive         → renders the real page content blurred + non-interactive
 *                    in the background, with a centred frosted lock card on top.
 *                    This lets users see what they're missing before upgrading.
 */
export function RequireSubscription({ children, upgradeHref }: RequireSubscriptionProps) {
  const { t } = useTranslation();
  const sub = useSubscription();

  if (sub.loading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-48 w-full" />
        <div className="grid grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      </div>
    );
  }

  if (sub.isActive) {
    return <>{children}</>;
  }

  const href = upgradeHref ?? (sub.userType === "fleet" ? "/dashboard/settings?tab=billing" : "/personal/account?tab=billing");
  const isCanceled = sub.status === "canceled";

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Real content — blurred + non-interactive so users see what they're missing */}
      <div
        className="pointer-events-none select-none blur-sm brightness-95 saturate-50"
        aria-hidden="true"
      >
        {children}
      </div>

      {/* Full-screen gradient fade to draw eye toward the lock card */}
      <div className="absolute inset-0 bg-linear-to-b from-background/0 via-background/40 to-background/80 pointer-events-none" />

      {/* Lock card — horizontally centred, ~1/3 down the page */}
      <div className="absolute inset-0 flex items-start justify-center pt-[18vh] p-6">
        <div className="w-full max-w-sm rounded-2xl border bg-background/95 backdrop-blur-md shadow-2xl p-8 flex flex-col items-center gap-5 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <IconLock className="h-7 w-7 text-muted-foreground" />
          </div>

          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold leading-tight">
              {isCanceled ? t("billing.gateCanceled") : t("billing.gateTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("billing.gateDescription")}
            </p>
            {isCanceled && sub.currentPeriodEnd && (
              <p className="text-xs text-muted-foreground">
                {t("billing.accessEndedOn", {
                  date: new Intl.DateTimeFormat("sv-SE", { dateStyle: "long" }).format(
                    new Date(sub.currentPeriodEnd),
                  ),
                })}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 w-full">
            <Button asChild className="w-full gap-2">
              <Link to={href}>
                <IconSparkles className="h-4 w-4" />
                {isCanceled ? t("billing.resubscribe") : t("billing.startTrial")}
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link to="/pricing">{t("billing.viewPlans")}</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
