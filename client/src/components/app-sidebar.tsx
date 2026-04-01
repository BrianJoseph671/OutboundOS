import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  SidebarRail,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  Users,
  FlaskConical,
  FileText,
  Settings,
  Zap,
  Upload,
  Brain,
  Heart,
  LogOut,
  ListTodo,
  BarChart3,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

const menuItems = [
  { title: "Actions", url: "/actions", icon: ListTodo },
  { title: "Prospect Research", url: "/prospect-research", icon: FlaskConical },
  { title: "Import Prospects", url: "/research-setup", icon: Upload },
  { title: "Contacts", url: "/contacts", icon: Users },
  { title: "Relationships", url: "/contacts", icon: Heart },
  { title: "Outreach Log", url: "/outreach-log", icon: FileText },
  { title: "ROI Dashboard", url: "/roi", icon: BarChart3 },
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Decisions", url: "/decisions", icon: Brain },
];

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { user, logout, isLoggingOut } = useAuth();

  const displayName = user?.displayName || user?.email || "User";
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <Zap className="w-4 h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-lg">Outbound OS</span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="pt-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const isActive =
                  location === item.url ||
                  (item.url !== "/" && location.startsWith(item.url)) ||
                  (item.url === "/contacts" && location === "/research-queue");
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      className="gap-3"
                    >
                      <Link href={item.url}>
                        <item.icon className="w-5 h-5" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3 border-t border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-3 w-full rounded-md px-2 py-2 hover:bg-sidebar-accent transition-colors text-left"
              data-testid="button-profile-menu"
            >
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                <span className="text-sm font-semibold text-primary-foreground">
                  {initials}
                </span>
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-sm font-medium truncate leading-tight">
                  {displayName}
                </span>
                {user?.email && user.displayName && (
                  <span className="text-xs text-muted-foreground truncate leading-tight">
                    {user.email}
                  </span>
                )}
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-52">
            <DropdownMenuItem
              onClick={() => setLocation("/settings")}
              className="gap-2 cursor-pointer"
              data-testid="menu-item-settings"
            >
              <Settings className="w-4 h-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={logout}
              disabled={isLoggingOut}
              className="gap-2 cursor-pointer text-destructive focus:text-destructive"
              data-testid="menu-item-logout"
            >
              <LogOut className="w-4 h-4" />
              {isLoggingOut ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
