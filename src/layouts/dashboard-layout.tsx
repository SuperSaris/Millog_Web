import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/auth-context";
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

const breadcrumbMap: Record<string, string> = {
  "/dashboard": "Översikt",
  "/dashboard/drivers": "Förare",
  "/dashboard/vehicles": "Fordon",
  "/dashboard/compliance": "Efterlevnad",
  "/dashboard/reports": "Rapporter",
  "/dashboard/settings": "Inställningar",
};

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
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const pathSegments = location.pathname.split("/").filter(Boolean);
  const breadcrumbs = pathSegments.map((_, i) => {
    const path = "/" + pathSegments.slice(0, i + 1).join("/");
    return { path, label: breadcrumbMap[path] ?? pathSegments[i] ?? "" };
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
                  <BreadcrumbItem key={crumb.path}>
                    {i < breadcrumbs.length - 1 ? (
                      <>
                        <BreadcrumbLink href={crumb.path}>
                          {crumb.label}
                        </BreadcrumbLink>
                        <BreadcrumbSeparator />
                      </>
                    ) : (
                      <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
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
