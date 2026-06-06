import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth-context";
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
import { IconBuilding, IconUser } from "@tabler/icons-react";

type LoginMode = "choose" | "org" | "personal";

export function LoginPage() {
  const { t } = useTranslation();
  const { signIn } = useAuth();
  const [searchParams] = useSearchParams();
  const initialMode = (searchParams.get("mode") as LoginMode) || "choose";
  const [mode, setMode] = useState<LoginMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: err } = await signIn(email, password);
    if (err) {
      setError(err);
    }
    // After successful login, auth-context triggers redirect.
    // Stored in localStorage (not sessionStorage) so it survives browser close/reopen.
    if (!err) {
      localStorage.setItem("millog-login-mode", mode);
    }
    setLoading(false);
  }

  if (mode === "choose") {
    return (
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-semibold">{t("auth.chooseLoginType")}</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Card
            className="cursor-pointer transition-colors hover:border-primary"
            onClick={() => setMode("org")}
          >
            <CardHeader className="items-center text-center">
              <IconBuilding className="h-10 w-10 text-primary" />
              <CardTitle className="text-base">{t("auth.orgLogin")}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-center text-sm text-muted-foreground">
                {t("auth.orgDescription")}
              </p>
            </CardContent>
          </Card>
          <Card
            className="cursor-pointer transition-colors hover:border-primary"
            onClick={() => setMode("personal")}
          >
            <CardHeader className="items-center text-center">
              <IconUser className="h-10 w-10 text-primary" />
              <CardTitle className="text-base">
                {t("auth.personalLogin")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-center text-sm text-muted-foreground">
                {t("auth.personalDescription")}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{t("auth.loginTitle")}</CardTitle>
        <CardDescription>{t("auth.loginDescription")}</CardDescription>
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
              placeholder="namn@foretag.se"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("auth.loggingIn") : t("auth.loginButton")}
          </Button>
          <div className="flex items-center justify-between w-full">
            <button
              type="button"
              className="text-sm text-muted-foreground hover:underline"
              onClick={() => setMode("choose")}
            >
              ← {t("auth.chooseLoginType")}
            </button>
            <Link
              to="/forgot-password"
              className="text-sm text-muted-foreground hover:underline"
            >
              {t("auth.forgotPassword")}
            </Link>
          </div>
          <div className="text-sm text-center text-muted-foreground">
            {t("auth.noAccount")}{" "}
            <Link
              to={mode === "org" ? "/signup" : "/signup/personal"}
              className="font-medium text-primary hover:underline"
            >
              {mode === "org"
                ? t("auth.createOrgAccount")
                : t("auth.createPersonalAccount")}
            </Link>
          </div>
        </CardFooter>
      </form>
    </Card>
  );
}
