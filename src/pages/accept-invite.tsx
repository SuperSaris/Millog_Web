import { useState, useEffect, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Accept-invite page — driver lands here after clicking magic link.
 *
 * Supabase redirects: {SITE_URL}/accept-invite#access_token=...&type=invite
 * The SDK's `detectSessionInUrl: true` handles the token exchange automatically.
 * Once we have a session, the user sets their password.
 */
export function AcceptInvitePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    // Wait for Supabase to process the hash fragment and establish session
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === "SIGNED_IN" && session?.user) {
          setSessionReady(true);

          // Try to fetch the org name for welcome message
          const { data: member } = await supabase
            .from("organization_members")
            .select("organization_id")
            .eq("user_id", session.user.id)
            .limit(1)
            .maybeSingle();

          if (member) {
            const { data: org } = await supabase
              .from("organizations")
              .select("name")
              .eq("id", member.organization_id)
              .single();
            if (org) setOrgName(org.name);
          }
        }
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError(t("signup.passwordMismatch"));
      return;
    }

    if (password.length < 8) {
      setError(t("signup.passwordTooShort"));
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    // Update member status to active
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase
        .from("organization_members")
        .update({ status: "active", activated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("status", "invited");
    }

    setLoading(false);
    navigate("/personal");
  }

  if (!sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8">
            <Skeleton className="h-6 w-48" />
            <p className="text-sm text-muted-foreground">{t("invite.verifying")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t("invite.welcomeTitle")}</CardTitle>
          <CardDescription>
            {orgName
              ? t("invite.welcomeDescription", { org: orgName })
              : t("invite.setPasswordDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form id="set-password-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">{t("invite.newPassword")}</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t("signup.confirmPassword")}</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? t("common.loading") : t("invite.setPasswordButton")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
