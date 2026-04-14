import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import { PersonalDashboardPage } from "@/pages/personal/index";
import { TripsPage } from "@/pages/personal/trips";
import { TripDetailPage } from "@/pages/personal/trip-detail";
import { StatisticsPage } from "@/pages/personal/statistics";
import { StatisticsEfficiencyPage } from "@/pages/personal/statistics-efficiency";
import { StatisticsDrivingPage } from "@/pages/personal/statistics-driving";
import { ExportPage } from "@/pages/personal/export";

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
              {/* Auth routes */}
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/signup/personal" element={<SignupPersonalPage />} />
              </Route>
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/accept-invite" element={<AcceptInvitePage />} />

              {/* Tesla OAuth callback — outside dashboard layout (no auth wrapper needed mid-OAuth) */}
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
                <Route index element={<PersonalDashboardPage />} />
                <Route path="trips" element={<TripsPage />} />
                <Route path="trips/:id" element={<TripDetailPage />} />
                <Route path="statistics" element={<StatisticsPage />} />
                <Route path="statistics/efficiency" element={<StatisticsEfficiencyPage />} />
                <Route path="statistics/driving" element={<StatisticsDrivingPage />} />
                <Route path="export" element={<ExportPage />} />
              </Route>

              {/* Default redirect */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </BrowserRouter>
          <Toaster />
          </OrgProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
