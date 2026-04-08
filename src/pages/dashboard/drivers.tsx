import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { UserPlus } from "lucide-react";

function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-4 border-b pb-2">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

export function DriversPage() {
  // TODO: Replace with real data from useDrivers hook
  const loading = false;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Förare</h1>
          <p className="text-muted-foreground">
            Hantera förare i din organisation.
          </p>
        </div>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          Bjud in förare
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Alla förare</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <TableSkeleton />
          ) : (
            <p className="text-muted-foreground">Inga förare tillagda ännu.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
