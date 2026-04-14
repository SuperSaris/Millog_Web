/**
 * /tesla-callback
 *
 * Tesla OAuth redirect handler for the web portal.
 *
 * Flow:
 *  1. Tesla redirects here with ?code=...&state=...
 *  2. We exchange the code (+ PKCE verifier from sessionStorage) via the
 *     tesla-token-exchange Edge Function (shared with the mobile app).
 *  3. Tokens are stored in tesla_tokens for the current user.
 *  4. We navigate to /dashboard/vehicles/import where the import flow continues.
 *
 * Note: The redirect_uri registered in the Tesla developer console must match
 * VITE_TESLA_WEB_REDIRECT_URI (production: https://app.millogapp.se/tesla-callback).
 */

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { IconBrandTesla, IconLoader2 } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";

const PKCE_VERIFIER_KEY = "tesla_pkce_verifier_fleet";

export function TeslaCallbackPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      setError(t("vehicles.importErrorTesla", { error: errorParam }));
      return;
    }

    if (!code) {
      setError(t("vehicles.importErrorNoCode"));
      return;
    }

    // CSRF check
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
        } else {
          navigate("/dashboard/vehicles/import", { replace: true });
        }
      });
  }, []); // runs once on mount

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-4">
        <IconBrandTesla className="h-12 w-12 text-muted-foreground" />
        <p className="text-center text-sm text-destructive max-w-sm">{error}</p>
        <Button
          variant="outline"
          onClick={() => navigate("/dashboard/vehicles/import")}
        >
          {t("common.goBack")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <IconBrandTesla className="h-12 w-12 text-muted-foreground" />
      <div className="flex items-center gap-2 text-muted-foreground">
        <IconLoader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">{t("vehicles.importExchangingToken")}</span>
      </div>
    </div>
  );
}
