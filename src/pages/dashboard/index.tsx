import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface StatCardProps {
  title: string;
  value: string | number | null;
  loading?: boolean;
}

function StatCard({ title, value, loading }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <p className="text-2xl font-bold">{value ?? "—"}</p>
        )}
      </CardContent>
    </Card>
  );
}

function ChartSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-end gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton
              key={i}
              className="flex-1 rounded-md"
              style={{ height: `${60 + Math.random() * 100}px` }}
            />
          ))}
        </div>
        <div className="flex justify-between">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-8" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardPage() {
  // TODO: Replace with real data from useFleetStats hook
  const loading = false;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">Översikt</h1>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard title="Totala km" value={null} loading={loading} />
        <StatCard title="Elkostnad" value={null} loading={loading} />
        <StatCard title="Otaggade resor" value={null} loading={loading} />
        <StatCard title="Tjänsteresor km" value={null} loading={loading} />
        <StatCard title="Aktiva fordon" value={null} loading={loading} />
        <StatCard title="Förare" value={null} loading={loading} />
      </div>

      {loading ? (
        <ChartSkeleton />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Veckoöversikt</CardTitle>
          </CardHeader>
          <CardContent className="flex h-64 items-center justify-center text-muted-foreground">
            Diagram laddas här…
          </CardContent>
        </Card>
      )}
    </div>
  );
}
