import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTranslation } from "react-i18next";

function VehicleCardSkeleton() {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      </CardContent>
    </Card>
  );
}

export function VehiclesPage() {
  const { t } = useTranslation();
  // TODO: Replace with real data from useVehicles hook
  const loading = false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("vehicles.title")}</h1>
        <p className="text-muted-foreground">
          {t("vehicles.description")}
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <VehicleCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("vehicles.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">{t("vehicles.noVehicles")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
