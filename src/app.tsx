import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/auth-context";
import { AuthLayout } from "@/layouts/auth-layout";
import { DashboardLayout } from "@/layouts/dashboard-layout";
import { LoginPage } from "@/pages/login";
import { DashboardPage } from "@/pages/dashboard/index";
import { DriversPage } from "@/pages/dashboard/drivers";
import { VehiclesPage } from "@/pages/dashboard/vehicles";
import { CompliancePage } from "@/pages/dashboard/compliance";
import { ReportsPage } from "@/pages/dashboard/reports";
import { SettingsPage } from "@/pages/dashboard/settings";

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

              {/* Dashboard routes (protected) */}
              <Route path="/dashboard" element={<DashboardLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="drivers" element={<DriversPage />} />
                <Route path="vehicles" element={<VehiclesPage />} />
                <Route path="compliance" element={<CompliancePage />} />
                <Route path="reports" element={<ReportsPage />} />
                <Route path="settings" element={<SettingsPage />} />
              </Route>

              {/* Default redirect */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
