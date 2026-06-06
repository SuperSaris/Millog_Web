import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { IconX } from "@tabler/icons-react";

export function CheckoutCancelPage() {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm text-center">
        <CardHeader className="items-center">
          <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <IconX className="h-7 w-7 text-muted-foreground" />
          </div>
          <CardTitle>{t("billing.checkoutCancelTitle")}</CardTitle>
          <CardDescription>{t("billing.checkoutCancelDescription")}</CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col gap-3">
          <Button asChild className="w-full">
            <Link to="/pricing">{t("billing.viewPlans")}</Link>
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link to="/">{t("common.back")}</Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
