import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  IconDashboard,
  IconUsers,
  IconCar,
  IconClipboardCheck,
  IconFileText,
  IconSettings,
  IconLogout,
  IconSelector,
  IconBolt,
  IconLanguage,
} from "@tabler/icons-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/auth-context";
import { useOrg } from "@/contexts/org-context";

interface NavItem {
  titleKey: string;
  url: string;
  icon: React.ComponentType;
  /** Only show to these roles. undefined = show to everyone. */
  roles?: string[];
}

const navItems: NavItem[] = [
  { titleKey: "nav.overview",   url: "/dashboard",            icon: IconDashboard },
  { titleKey: "nav.drivers",    url: "/dashboard/drivers",    icon: IconUsers },
  { titleKey: "nav.vehicles",   url: "/dashboard/vehicles",   icon: IconCar },
  { titleKey: "nav.compliance", url: "/dashboard/compliance", icon: IconClipboardCheck },
  { titleKey: "nav.reports",    url: "/dashboard/reports",    icon: IconFileText },
  { titleKey: "nav.settings",   url: "/dashboard/settings",   icon: IconSettings, roles: ["admin"] },
];

function getInitials(email: string | undefined): string {
  if (!email) return "?";
  const name = email.split("@")[0] ?? "";
  return name.slice(0, 2).toUpperCase();
}

export function AppSidebar() {
  const { t, i18n } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { organization, role } = useOrg();

  const visibleItems = navItems.filter(
    (item) => !item.roles || (role && item.roles.includes(role)),
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" onClick={() => navigate("/dashboard")}>
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <IconBolt className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-bold">
                  {organization?.name ?? "Millog"}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {t("nav.fleetManagement")}
                </span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("nav.navigation")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleItems.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    tooltip={t(item.titleKey)}
                    isActive={location.pathname === item.url}
                    onClick={() => navigate(item.url)}
                  >
                    <item.icon />
                    <span>{t(item.titleKey)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarFallback className="rounded-lg bg-primary text-primary-foreground text-xs">
                      {getInitials(user?.email)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {user?.email?.split("@")[0]}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user?.email}
                    </span>
                  </div>
                  <IconSelector className="ml-auto size-4 shrink-0 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56 rounded-lg"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuItem
                  onClick={() => {
                    const next = i18n.language === "sv" ? "en" : "sv";
                    i18n.changeLanguage(next);
                    localStorage.setItem("millog-web-language", next);
                  }}
                >
                  <IconLanguage className="size-4" />
                  {i18n.language === "sv" ? "English" : "Svenska"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={signOut}
                >
                  <IconLogout className="size-4" />
                  {t("auth.logout")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
