import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/auth-context";
import { OrgProvider } from "@/contexts/org-context";
import { AuthLayout } from "@/layouts/auth-layout";
import { DashboardLayout } from "@/layouts/dashboard-layout";
import { PersonalLayout } from "@/layouts/personal-layout";
import { LoginPage } from "@/pages/login";
import { SignupPage } from "@/pages/signup";
import { SignupPersonalPage } from "@/pages/signup-personal";
import { AcceptInvitePage } from "@/pages/accept-invite";
import { ForgotPasswordPage } from "@/pages/forgot-password";
import { ResetPasswordPage } from "@/pages/reset-password";
import { PricingPage } from "@/pages/pricing";
import { CheckoutSuccessPage } from "@/pages/checkout/success";
import { CheckoutCancelPage } from "@/pages/checkout/cancel";
import { DashboardPage } from "@/pages/dashboard/index";
import { DriversPage } from "@/pages/dashboard/drivers";
import { DriverDetailPage } from "@/pages/dashboard/driver-detail";
import { VehiclesPage } from "@/pages/dashboard/vehicles";
import { CompliancePage } from "@/pages/dashboard/compliance";
import { ReportsPage } from "@/pages/dashboard/reports";
import { SettingsPage } from "@/pages/dashboard/settings";
import { InviteDriverPage } from "@/pages/dashboard/drivers/invite";
import { ImportVehiclesPage } from "@/pages/dashboard/vehicles/import";
import { TeslaCallbackPage } from "@/pages/tesla-callback";
import { PrivacyPage } from "@/pages/privacy";
import { SupportPage } from "@/pages/support";
import { AppLandingPage } from "@/pages/app-landing";
import { PersonalDashboardPage } from "@/pages/personal/index";
import { TripsPage } from "@/pages/personal/trips";
import { TripsMergePage } from "@/pages/personal/trips-merge";
import { TripDetailPage } from "@/pages/personal/trip-detail";
import { StatisticsPage } from "@/pages/personal/statistics";
import { StatisticsEfficiencyPage } from "@/pages/personal/statistics-efficiency";
import { StatisticsDrivingPage } from "@/pages/personal/statistics-driving";
import { ExportPage } from "@/pages/personal/export";
import { PersonalAccountPage } from "@/pages/personal/account";
import { RequireSubscription } from "@/components/require-subscription";

/** Gates all gated personal routes behind an active subscription. */
function SubscriptionGate() {
  return (
    <RequireSubscription>
      <Outlet />
    </RequireSubscription>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <OrgProvider>
          <BrowserRouter>
            <Routes>
              {/* Public pages */}
              <Route path="/" element={<AppLandingPage />} />
              <Route path="/app" element={<AppLandingPage />} />
              <Route path="/support" element={<SupportPage />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/checkout/success" element={<CheckoutSuccessPage />} />
              <Route path="/checkout/cancel" element={<CheckoutCancelPage />} />

              {/* Auth routes */}
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup/personal" element={<SignupPersonalPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
              </Route>
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/accept-invite" element={<AcceptInvitePage />} />

              {/* Tesla OAuth callback — outside dashboard layout */}
              <Route path="/tesla-callback" element={<TeslaCallbackPage />} />

              {/* Dashboard routes (protected — fleet/org) */}
              <Route path="/dashboard" element={<DashboardLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="drivers" element={<DriversPage />} />
                <Route path="drivers/invite" element={<InviteDriverPage />} />
                <Route path="drivers/:id" element={<DriverDetailPage />} />
                <Route path="vehicles" element={<VehiclesPage />} />
                <Route path="vehicles/import" element={<ImportVehiclesPage />} />
                <Route path="compliance" element={<CompliancePage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>

              {/* Personal routes (protected — individual users) */}
              <Route path="/personal" element={<PersonalLayout />}>
                {/* Account is always accessible — user needs it to subscribe/manage billing */}
                <Route path="account" element={<PersonalAccountPage />} />
                {/* Everything else requires an active subscription */}
                <Route element={<SubscriptionGate />}>
                  <Route index element={<PersonalDashboardPage />} />
                  <Route path="trips" element={<TripsPage />} />
                  <Route path="trips/merge" element={<TripsMergePage />} />
                  <Route path="trips/:id" element={<TripDetailPage />} />
                  <Route path="statistics" element={<StatisticsPage />} />
                  <Route path="statistics/efficiency" element={<StatisticsEfficiencyPage />} />
                  <Route path="statistics/driving" element={<StatisticsDrivingPage />} />
                  <Route path="export" element={<ExportPage />} />
                </Route>
              </Route>

              {/* Default redirect */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
          <Toaster />
          </OrgProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
