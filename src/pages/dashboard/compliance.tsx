import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

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
  // TODO: Replace with real data from useCompliance hook
  const loading = false;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Efterlevnad</h1>
        <p className="text-muted-foreground">
          Se vilka förare som har otaggade resor och skicka påminnelser.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Otaggade resor</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <ComplianceTableSkeleton />
          ) : (
            <p className="text-muted-foreground">Alla resor är taggade!</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
