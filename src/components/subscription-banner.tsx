import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth-context";
import { useSubscription } from "@/hooks/use-subscription";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { IconAlertTriangle, IconX } from "@tabler/icons-react";
import { toast } from "sonner";

/**
 * SubscriptionBanner — shown at the top of protected layouts when billing needs attention.
 *
 * Shows for:
 * - past_due: "Payment failed, update your card"
 * - unpaid: same
 * - trialing + ending soon (≤7 days): "X days left in trial"
 *
 * Dismissable for the session (stores in sessionStorage).
 * For past_due this is NOT dismissable — too important.
 */
export function SubscriptionBanner() {
  const { t } = useTranslation();
  const { session } = useAuth();
  const sub = useSubscription();
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem("millog-trial-banner-dismissed") === "true",
  );
  const [loadingPortal, setLoadingPortal] = useState(false);

  async function openPortal() {
    if (!session) return;
    setLoadingPortal(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-customer-portal", {
        body: { user_type: sub.userType },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error || !data?.url) throw new Error(error?.message ?? t("billing.portalError"));
      window.location.href = data.url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("billing.portalError"));
      setLoadingPortal(false);
    }
  }

  // Past due — critical, non-dismissable
  if (sub.isPastDue) {
    return (
      <div className="flex items-center gap-3 border-b border-destructive/30 bg-destructive/10 px-4 py-2.5">
        <IconAlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
        <p className="flex-1 text-sm font-medium text-destructive">
          {t("billing.pastDueBanner")}
        </p>
        <Button
          size="sm"
          variant="destructive"
          onClick={openPortal}
          disabled={loadingPortal}
          className="h-7 px-3 text-xs"
        >
          {loadingPortal ? t("common.loading") : t("billing.updatePaymentMethod")}
        </Button>
      </div>
    );
  }

  // Trial ending soon — dismissable
  if (sub.trialEndingSoon && !dismissed) {
    return (
      <div className="flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2.5">
        <IconAlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <p className="flex-1 text-sm font-medium text-amber-700 dark:text-amber-300">
          {t("billing.trialEndingSoon", { days: sub.daysUntilExpiry })}
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={openPortal}
          disabled={loadingPortal}
          className="h-7 px-3 text-xs text-amber-700 dark:text-amber-300"
        >
          {loadingPortal ? t("common.loading") : t("billing.addPaymentMethod")}
        </Button>
        <button
          type="button"
          aria-label={t("common.close")}
          onClick={() => {
            sessionStorage.setItem("millog-trial-banner-dismissed", "true");
            setDismissed(true);
          }}
          className="rounded p-0.5 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
        >
          <IconX className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return null;
}
