import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
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
import { IconCircleCheck, IconLock } from "@tabler/icons-react";

export function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: err } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      {
        redirectTo: `${window.location.origin}/reset-password`,
      },
    );

    // Always show the success state regardless of whether the email exists.
    // This prevents user enumeration (OWASP: Broken Authentication).
    if (err) {
      // Log for internal debugging but don't expose to user
      console.warn("[ForgotPassword] resetPasswordForEmail error", err.message);
    }

    setLoading(false);
    setSent(true);
  }

  if (sent) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <IconCircleCheck className="mb-2 h-12 w-12 text-green-500" />
          <CardTitle>{t("auth.resetEmailSentTitle")}</CardTitle>
          <CardDescription>{t("auth.resetEmailSentDescription")}</CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link
            to="/login"
            className="text-sm font-medium text-primary hover:underline"
          >
            {t("auth.backToLogin")}
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <div className="flex items-center gap-2">
          <IconLock className="h-5 w-5 text-primary" />
          <CardTitle>{t("auth.forgotPasswordTitle")}</CardTitle>
        </div>
        <CardDescription>{t("auth.forgotPasswordDescription")}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              placeholder="anna@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("auth.sendingResetEmail") : t("auth.sendResetEmail")}
          </Button>
          <Link
            to="/login"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {t("auth.backToLogin")}
          </Link>
        </CardFooter>
      </form>
    </Card>
  );
}
