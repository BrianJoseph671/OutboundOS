import { useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient, getQueryFn, apiRequest } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { Loader2, LogOut } from "lucide-react";
import Dashboard from "@/pages/dashboard";
import Contacts from "@/pages/contacts";
import ActionsPage from "@/pages/actions";
import ActionDetailPage from "@/pages/action-detail";
import DraftWorkspace from "@/pages/draft-workspace";
import OutreachLog from "@/pages/outreach-log";
import ProspectResearch from "@/pages/prospect-research";
import ResearchSetup from "@/pages/research-setup";
import ResearchQueue from "@/pages/research-queue";
import Decisions from "@/pages/decisions";
import Settings from "@/pages/settings";
import WeeklyBriefPage from "@/pages/weekly-brief";
import RoiDashboardPage from "@/pages/roi-dashboard";
import NotFound from "@/pages/not-found";

/** Shape returned by GET /auth/me (password is omitted server-side) */
type AuthUser = {
  id: string;
  username: string;
  email: string | null;
  fullName: string | null;
  googleId: string | null;
  avatarUrl: string | null;
  createdAt: string;
};

function Router() {
  return (
    <Switch>
      <Route path="/actions/:id/draft" component={DraftWorkspace} />
      <Route path="/actions/:id" component={ActionDetailPage} />
      <Route path="/actions" component={ActionsPage} />
      <Route path="/" component={Dashboard} />
      <Route path="/contacts" component={Contacts} />
      <Route path="/outreach-log" component={OutreachLog} />
      <Route path="/prospect-research" component={ProspectResearch} />
      <Route path="/research-setup" component={ResearchSetup} />
      <Route path="/research-queue" component={ResearchQueue} />
      <Route path="/decisions" component={Decisions} />
      <Route path="/weekly-brief" component={WeeklyBriefPage} />
      <Route path="/roi" component={RoiDashboardPage} />
      <Route path="/settings" component={Settings} />
      <Route component={NotFound} />
    </Switch>
  );
}

/**
 * Centered full-screen loading spinner — shown while /auth/me is resolving
 * or while the browser is being redirected to /auth/google.
 */
function LoadingScreen() {
  return (
    <div className="flex h-screen w-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

/**
 * Centered full-screen error state — shown when /auth/me fails with a
 * non-401 error (e.g. network failure, 500). Provides a retry button so
 * the user is never stuck on an infinite loading spinner.
 */
function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex h-screen w-full flex-col items-center justify-center gap-4">
      <p className="text-sm text-muted-foreground">
        Unable to connect. Please check your connection and try again.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}

/**
 * AppShell is rendered only for authenticated users.
 * It receives the resolved user object so the header can display user info
 * and provide a logout action.
 */
function AppShell({ user }: { user: AuthUser }) {
  const style = {
    "--sidebar-width": "15rem",
    "--sidebar-width-icon": "3rem",
  };

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/auth/logout");
    } catch {
      // Proceed with redirect even if the server call fails
    }
    window.location.href = "/auth/google";
  };

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full overflow-hidden">
        <AppSidebar />
        <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">
          <header className="flex items-center justify-between gap-4 px-4 py-3 border-b bg-background sticky top-0 z-50 shrink-0">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <div className="flex items-center gap-2">
              <ThemeToggle />
              {user.fullName && (
                <span className="text-sm text-muted-foreground hidden sm:inline">
                  {user.fullName}
                </span>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="text-muted-foreground hover:text-foreground"
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4 mr-1" />
                Logout
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-auto px-6 py-6 min-h-0">
            <Router />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

/**
 * AuthGate: fetches /auth/me on mount.
 * - While loading → shows a centered spinner
 * - On 401 (user === null) → redirects to /auth/google
 * - On non-401 error (network failure, 500, etc.) → shows error UI with retry
 * - On 200 (user present) → renders the full app shell
 */
function AuthGate() {
  const {
    data: user,
    isLoading,
    isError,
    refetch,
  } = useQuery<AuthUser | null>({
    queryKey: ["/auth/me"],
    queryFn: getQueryFn<AuthUser | null>({ on401: "returnNull" }),
    retry: false,
    staleTime: 5 * 60 * 1000, // cache for 5 min so page refreshes stay fast
  });

  // Redirect unauthenticated users after the query resolves.
  // Using useEffect avoids calling window.location in render (safer in StrictMode).
  useEffect(() => {
    if (!isLoading && user === null) {
      window.location.href = "/auth/google";
    }
  }, [isLoading, user]);

  // Non-401 error (network failure, 500, etc.) — show error UI with retry
  if (isError) {
    return <ErrorScreen onRetry={() => void refetch()} />;
  }

  // Still fetching or about to redirect — show spinner
  if (isLoading || user === null || user === undefined) {
    return <LoadingScreen />;
  }

  return <AppShell user={user} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthGate />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
