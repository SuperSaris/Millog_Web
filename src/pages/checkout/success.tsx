import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Lottie from "lottie-react";
import sandyLoading from "@/assets/animations/sandy-loading.json";
import celebration from "@/assets/animations/Celebration.json";

/**
 * Post-Stripe-Checkout success landing page.
 *
 * Stripe redirects here with ?session_id=cs_... after a successful checkout.
 * The subscription may not be reflected in our DB yet (webhook hasn't fired).
 * We poll `refreshProfile` + org subscription status for up to 10 seconds,
 * then show success regardless (subscription will appear on next page load).
 */
export function CheckoutSuccessPage() {
  const { t } = useTranslation();
  const { refreshProfile } = useAuth();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get("session_id");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 5;
    const interval = setInterval(async () => {
      attempts++;
      await refreshProfile();
      // After 5 attempts (~10s) give up polling and show success anyway
      if (attempts >= maxAttempts) {
        clearInterval(interval);
        setReady(true);
      }
    }, 2000);

    // Always show success after 10s regardless
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setReady(true);
    }, 10_000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [refreshProfile]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader className="items-center">
          {ready ? (
            <Lottie animationData={celebration} loop={false} className="mx-auto h-32 w-32" />
          ) : (
            <Lottie animationData={sandyLoading} loop className="mx-auto h-32 w-32" />
          )}
          <CardTitle>
            {ready ? t("billing.checkoutSuccessTitle") : t("billing.checkoutActivating")}
          </CardTitle>
          <CardDescription>
            {ready
              ? t("billing.checkoutSuccessDescription")
              : t("billing.checkoutActivatingDescription")}
          </CardDescription>
        </CardHeader>
        {sessionId && (
          <CardContent>
            <p className="text-xs text-muted-foreground">
              {t("billing.checkoutRef")}: <span className="font-mono">{sessionId.slice(0, 20)}…</span>
            </p>
          </CardContent>
        )}
        {ready && (
          <CardFooter className="flex flex-col gap-3">
            <Button asChild className="w-full">
              <Link to="/personal">{t("billing.goToDashboard")}</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link to="/dashboard">{t("billing.goToFleetDashboard")}</Link>
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
