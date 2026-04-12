import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";

function ComplianceTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-4 border-b pb-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      ))}
    </div>
  );
}

export function CompliancePage() {
  const { t } = useTranslation();
  // TODO: Replace with real data from useCompliance hook
  const loading = false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("compliance.title")}</h1>
        <p className="text-muted-foreground">
          {t("compliance.description")}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("compliance.untaggedTrips")}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <ComplianceTableSkeleton />
          ) : (
            <p className="text-muted-foreground">{t("compliance.allTagged")}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
