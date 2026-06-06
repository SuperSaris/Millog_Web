import React from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth-context";
import { PersonalSidebar } from "@/components/personal-sidebar";
import { SubscriptionBanner } from "@/components/subscription-banner";
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
  "/personal":            "nav.personalHome",
  "/personal/trips":      "nav.myTrips",
  "/personal/statistics": "personal.statistics",
  "/personal/export":     "personal.export",
};

function PersonalSkeleton() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full">
        <div className="hidden w-64 flex-col gap-4 border-r p-4 md:flex">
          <div className="flex items-center gap-3 px-2">
            <Skeleton className="h-8 w-8 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <div className="space-y-1">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 rounded-md px-3 py-2">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
        <div className="flex-1 p-6">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-xl border p-6">
                <Skeleton className="mb-3 h-4 w-24" />
                <Skeleton className="h-8 w-16" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}

export function PersonalLayout() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PersonalSkeleton />;
  if (!user) return <Navigate to="/login?mode=personal" replace />;

  // Build breadcrumb: always start with "Hem", add child if not on root
  const isTripDetail =
    location.pathname.startsWith("/personal/trips/") &&
    location.pathname.length > "/personal/trips/".length;
  const childKey = breadcrumbKeys[location.pathname];
  const breadcrumbs = [
    { path: "/personal", label: t("nav.personalHome"), isLeaf: location.pathname === "/personal" },
    ...(isTripDetail
      ? [
          { path: "/personal/trips", label: t("nav.myTrips"), isLeaf: false },
          { path: location.pathname, label: t("personal.tripDetail"), isLeaf: true },
        ]
      : location.pathname !== "/personal" && childKey
        ? [{ path: location.pathname, label: t(childKey), isLeaf: true }]
        : []),
  ];

  return (
    <SidebarProvider>
      <PersonalSidebar />
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
                      {!crumb.isLeaf ? (
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
        <SubscriptionBanner />
        <main className="flex flex-1 flex-col gap-4 p-4 pt-0">
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
