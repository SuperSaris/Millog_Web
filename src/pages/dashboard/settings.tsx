import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

export function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Inställningar</h1>
        <p className="text-muted-foreground">
          Hantera organisation, taggar, administratörer och fakturering.
        </p>
      </div>

      <Separator />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Organisation</CardTitle>
            <CardDescription>Namn, adress och organisationsnummer.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Kommer snart.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Taggar</CardTitle>
            <CardDescription>Hantera anpassade taggar för resor.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Kommer snart.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Administratörer</CardTitle>
            <CardDescription>Bjud in och hantera administratörer.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Kommer snart.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fakturering</CardTitle>
            <CardDescription>Prenumeration och betalningshistorik.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Kommer snart.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
