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
import { IconCircleCheck, IconUser } from "@tabler/icons-react";

export function SignupPersonalPage() {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: name } },
    });

    if (err) {
      setError(err.message);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  }

  if (success) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <IconCircleCheck className="mb-2 h-12 w-12 text-green-500" />
          <CardTitle>{t("auth.signUpSuccess")}</CardTitle>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link
            to="/login?mode=personal"
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
          <IconUser className="h-5 w-5 text-primary" />
          <CardTitle>{t("auth.signUpPersonalTitle")}</CardTitle>
        </div>
        <CardDescription>{t("auth.signUpPersonalDescription")}</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="name">{t("auth.fullName")}</Label>
            <Input
              id="name"
              type="text"
              placeholder={t("auth.fullNamePlaceholder")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>
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
              autoComplete="new-password"
              minLength={8}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? t("auth.signingUp") : t("auth.signUpButton")}
          </Button>
          <p className="text-sm text-muted-foreground">
            {t("auth.alreadyHaveAccount")}{" "}
            <Link
              to="/login?mode=personal"
              className="font-medium text-primary hover:underline"
            >
              {t("auth.backToLogin")}
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
