import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

export function ReportsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Rapporter</h1>
        <p className="text-muted-foreground">
          Exportera körjournal, flottöversikt och skatteunderlag.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Körjournal</CardTitle>
            <CardDescription>Exportera fullständig körjournal per förare.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" disabled>
              <Download className="mr-2 h-4 w-4" />
              Exportera CSV
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Flottöversikt</CardTitle>
            <CardDescription>Sammanfattning av alla fordon och förare.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" disabled>
              <Download className="mr-2 h-4 w-4" />
              Exportera PDF
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Skatteunderlag</CardTitle>
            <CardDescription>Skatteverket-redo underlag för milersättning.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" disabled>
              <Download className="mr-2 h-4 w-4" />
              Exportera
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
