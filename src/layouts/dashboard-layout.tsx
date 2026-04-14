import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth-context";
import { useOrg } from "@/contexts/org-context";
import { AppSidebar } from "@/components/app-sidebar";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

const breadcrumbKeys: Record<string, string> = {
  "/dashboard": "nav.overview",
  "/dashboard/drivers": "nav.drivers",
  "/dashboard/drivers/invite": "drivers.inviteTitle",
  "/dashboard/vehicles": "nav.vehicles",
  "/dashboard/vehicles/import": "vehicles.wizTitle",
  "/dashboard/compliance": "nav.compliance",
  "/dashboard/reports": "nav.reports",
  "/dashboard/settings": "nav.settings",
};

/** Match /dashboard/drivers/:uuid pattern for detail breadcrumbs */
const DRIVER_DETAIL_RE = /^\/dashboard\/drivers\/[0-9a-f-]+$/i;

function DashboardSkeleton() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        {/* Sidebar skeleton */}
        <div className="hidden w-64 flex-col gap-4 border-r p-4 md:flex">
          <div className="flex items-center gap-3 px-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <Separator />
          <div className="space-y-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-md px-3 py-2">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
        {/* Content skeleton */}
        <div className="flex-1 p-6">
          <div className="space-y-6">
            <Skeleton className="h-8 w-48" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl border p-6">
                  <Skeleton className="mb-3 h-4 w-24" />
                  <Skeleton className="h-8 w-16" />
                </div>
              ))}
            </div>
            <div className="rounded-xl border p-6">
              <Skeleton className="mb-4 h-5 w-32" />
              <Skeleton className="h-48 w-full" />
            </div>
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}

export function DashboardLayout() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const { loading: orgLoading } = useOrg();
  const location = useLocation();

  if (loading || orgLoading) {
    return <DashboardSkeleton />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const pathSegments = location.pathname.split("/").filter(Boolean);
  const isDriverDetail = DRIVER_DETAIL_RE.test(location.pathname);
  const breadcrumbs = pathSegments.map((_, i) => {
    const path = "/" + pathSegments.slice(0, i + 1).join("/");
    const key = breadcrumbKeys[path];
    if (key) return { path, label: t(key) };
    // Driver detail page: last segment is UUID — show "Förare" label
    if (isDriverDetail && i === pathSegments.length - 1) {
      return { path, label: t("drivers.detail") };
    }
    return { path, label: pathSegments[i] ?? "" };
  });

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                {breadcrumbs.map((crumb, i) => (
                  <React.Fragment key={crumb.path}>
                    <BreadcrumbItem>
                      {i < breadcrumbs.length - 1 ? (
                        <BreadcrumbLink href={crumb.path}>{crumb.label}</BreadcrumbLink>
                      ) : (
                        <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                      )}
                    </BreadcrumbItem>
                    {i < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
                  </React.Fragment>
                ))}
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
