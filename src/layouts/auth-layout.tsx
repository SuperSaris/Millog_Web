import { Navigate, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth-context";

export function AuthLayout() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (user) {
    const mode = localStorage.getItem("millog-login-mode");
    const target = mode === "personal" ? "/personal" : "/dashboard";
    return <Navigate to={target} replace />;
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-muted/40 px-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Millog</h1>
        <p className="text-sm text-muted-foreground">{t("nav.fleetManagement")}</p>
      </div>
      <Outlet />
      <footer className="mt-12 text-center text-xs text-muted-foreground">
        {t("auth.copyright", { year: new Date().getFullYear() })}
      </footer>
    </div>
  );
}
