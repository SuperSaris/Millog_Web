import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import { Skeleton } from "@/components/ui/skeleton";
import { IconCircleCheck, IconAlertCircle, IconLock } from "@tabler/icons-react";

type PageState = "waiting" | "ready" | "success" | "expired";

export function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [pageState, setPageState] = useState<PageState>("waiting");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase SDK's detectSessionInUrl: true handles the hash fragment
    // automatically. We listen for PASSWORD_RECOVERY to know when it's done.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setPageState("ready");
      }
      // If the token was already consumed or invalid, no event fires →
      // we time out after 8s and show the expired state.
    });

    const timeout = setTimeout(() => {
      setPageState((prev) => (prev === "waiting" ? "expired" : prev));
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t("auth.passwordMismatch"));
      return;
    }
    if (password.length < 8) {
      setError(t("auth.passwordTooShort"));
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    // Sign out so user re-authenticates with new password (prevents session confusion)
    await supabase.auth.signOut();
    setPageState("success");
  }

  // ── Loading: waiting for Supabase to parse the hash ──────────
  if (pageState === "waiting") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-4 w-60 mt-1" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    );
  }

  // ── Expired or invalid token ──────────────────────────────────
  if (pageState === "expired") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <IconAlertCircle className="mb-2 h-12 w-12 text-destructive" />
          <CardTitle>{t("auth.resetLinkExpiredTitle")}</CardTitle>
          <CardDescription>{t("auth.resetLinkExpiredDescription")}</CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col gap-3">
          <Button asChild className="w-full">
            <Link to="/forgot-password">{t("auth.requestNewLink")}</Link>
          </Button>
          <Link
            to="/login"
            className="text-sm text-muted-foreground hover:underline"
          >
            {t("auth.backToLogin")}
          </Link>
        </CardFooter>
      </Card>
    );
  }

  // ── Success ───────────────────────────────────────────────────
  if (pageState === "success") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <IconCircleCheck className="mb-2 h-12 w-12 text-green-500" />
          <CardTitle>{t("auth.resetSuccessTitle")}</CardTitle>
          <CardDescription>{t("auth.resetSuccessDescription")}</CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Button onClick={() => navigate("/login")} className="w-full">
            {t("auth.loginButton")}
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // ── Ready: show new-password form ─────────────────────────────
  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <IconLock className="h-5 w-5 text-primary" />
          <CardTitle>{t("auth.resetPasswordTitle")}</CardTitle>
        </div>
        <CardDescription>{t("auth.resetPasswordDescription")}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.newPassword")}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              autoFocus
              minLength={8}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t("auth.confirmPassword")}</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("auth.passwordMinLength")}
          </p>
        </CardContent>
        <CardFooter>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("auth.savingPassword") : t("auth.saveNewPassword")}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
