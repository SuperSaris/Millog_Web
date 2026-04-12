import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/auth-context";
import { AuthLayout } from "@/layouts/auth-layout";
import { DashboardLayout } from "@/layouts/dashboard-layout";
import { PersonalLayout } from "@/layouts/personal-layout";
import { LoginPage } from "@/pages/login";
import { DashboardPage } from "@/pages/dashboard/index";
import { DriversPage } from "@/pages/dashboard/drivers";
import { VehiclesPage } from "@/pages/dashboard/vehicles";
import { CompliancePage } from "@/pages/dashboard/compliance";
import { ReportsPage } from "@/pages/dashboard/reports";
import { SettingsPage } from "@/pages/dashboard/settings";
import { PersonalDashboardPage } from "@/pages/personal/index";
import { TripsPage } from "@/pages/personal/trips";
import { TripDetailPage } from "@/pages/personal/trip-detail";
import { StatisticsPage } from "@/pages/personal/statistics";
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
          <BrowserRouter>
            <Routes>
              {/* Auth routes */}
              <Route element={<AuthLayout />}>
                <Route path="/login" element={<LoginPage />} />
              </Route>

              {/* Dashboard routes (protected — fleet/org) */}
              <Route path="/dashboard" element={<DashboardLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="drivers" element={<DriversPage />} />
                <Route path="vehicles" element={<VehiclesPage />} />
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
                <Route path="export" element={<ExportPage />} />
              </Route>

              {/* Default redirect */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </BrowserRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
