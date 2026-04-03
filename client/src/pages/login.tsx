import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { GoogleIcon } from "@/components/icons/google-icon";
import type { AuthUser } from "@/hooks/useAuth";

/** Only allow same-origin paths (prevents open redirects). */
function getSafeNext(): string {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("next");
  if (!raw) return "/";
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return "/";
  }
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return "/";
  if (decoded.includes("://")) return "/";
  return decoded.split("#")[0] || "/";
}

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ email: "", password: "", displayName: "" });

  const { data: authConfig } = useQuery<{ googleEnabled: boolean }>({
    queryKey: ["/api/auth/config"],
  });

  const { data: existingUser, isLoading: authLoading } = useQuery<AuthUser | null>({
    queryKey: ["/auth/me"],
    queryFn: getQueryFn<AuthUser | null>({ on401: "returnNull" }),
    retry: false,
  });

  useEffect(() => {
    if (!authLoading && existingUser) {
      setLocation(getSafeNext());
    }
  }, [authLoading, existingUser, setLocation]);

  const loginMutation = useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      apiRequest("POST", "/api/auth/login", data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/auth/me"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation(getSafeNext());
    },
    onError: async (err: any) => {
      const msg = err?.message || "Login failed. Check your email and password.";
      toast({ title: "Login failed", description: msg, variant: "destructive" });
    },
  });

  const registerMutation = useMutation({
    mutationFn: (data: { email: string; password: string; displayName: string }) =>
      apiRequest("POST", "/api/auth/register", data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/auth/me"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setLocation(getSafeNext());
    },
    onError: async (err: any) => {
      const msg = err?.message || "Registration failed.";
      toast({ title: "Registration failed", description: msg, variant: "destructive" });
    },
  });

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginForm.email || !loginForm.password) {
      toast({ title: "Missing fields", description: "Please enter your email and password.", variant: "destructive" });
      return;
    }
    loginMutation.mutate(loginForm);
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerForm.email || !registerForm.password) {
      toast({ title: "Missing fields", description: "Please enter your email and password.", variant: "destructive" });
      return;
    }
    registerMutation.mutate(registerForm);
  };

  const handleGoogleLogin = () => {
    const next = encodeURIComponent(getSafeNext());
    const url = `/api/auth/google?next=${next}`;
    try {
      if (window.top && window.top !== window) {
        window.top.location.href = url;
        return;
      }
    } catch (_e) {
    }
    window.location.href = url;
  };

  const googleEnabled = authConfig?.googleEnabled;

  if (authLoading || existingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-5">
            <img
              src="/brand/outbound-os-logo.svg"
              alt="Outbound OS"
              className="h-14 w-auto max-w-[220px] object-contain mx-auto"
              width={220}
              height={56}
            />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Outbound OS</h1>
          <p className="text-muted-foreground mt-2">Your outreach management platform</p>
        </div>

        <Tabs defaultValue="login">
          <TabsList className="w-full mb-6">
            <TabsTrigger value="login" className="flex-1" data-testid="tab-login">Sign In</TabsTrigger>
            <TabsTrigger value="register" className="flex-1" data-testid="tab-register">Create Account</TabsTrigger>
          </TabsList>

          <TabsContent value="login">
            <Card>
              <CardHeader>
                <CardTitle>Welcome back</CardTitle>
                <CardDescription>Sign in to your account to continue</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {googleEnabled && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={handleGoogleLogin}
                      data-testid="button-login-google"
                    >
                      <GoogleIcon className="w-4 h-4 mr-2" />
                      Sign in with Google
                    </Button>
                    <div className="flex items-center gap-2">
                      <Separator className="flex-1" />
                      <span className="text-xs text-muted-foreground">or</span>
                      <Separator className="flex-1" />
                    </div>
                  </>
                )}
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="you@example.com"
                      value={loginForm.email}
                      onChange={(e) => setLoginForm(f => ({ ...f, email: e.target.value }))}
                      data-testid="input-login-email"
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="••••••••"
                      value={loginForm.password}
                      onChange={(e) => setLoginForm(f => ({ ...f, password: e.target.value }))}
                      data-testid="input-login-password"
                      autoComplete="current-password"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={loginMutation.isPending}
                    data-testid="button-login-submit"
                  >
                    {loginMutation.isPending ? "Signing in…" : "Sign In"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="register">
            <Card>
              <CardHeader>
                <CardTitle>Create an account</CardTitle>
                <CardDescription>Get started with Outbound OS today</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {googleEnabled && (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={handleGoogleLogin}
                      data-testid="button-register-google"
                    >
                      <GoogleIcon className="w-4 h-4 mr-2" />
                      Sign up with Google
                    </Button>
                    <div className="flex items-center gap-2">
                      <Separator className="flex-1" />
                      <span className="text-xs text-muted-foreground">or</span>
                      <Separator className="flex-1" />
                    </div>
                  </>
                )}
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-name">Your name</Label>
                    <Input
                      id="register-name"
                      type="text"
                      placeholder="Jane Smith"
                      value={registerForm.displayName}
                      onChange={(e) => setRegisterForm(f => ({ ...f, displayName: e.target.value }))}
                      data-testid="input-register-name"
                      autoComplete="name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-email">Email</Label>
                    <Input
                      id="register-email"
                      type="email"
                      placeholder="you@example.com"
                      value={registerForm.email}
                      onChange={(e) => setRegisterForm(f => ({ ...f, email: e.target.value }))}
                      data-testid="input-register-email"
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="register-password">Password</Label>
                    <Input
                      id="register-password"
                      type="password"
                      placeholder="Choose a strong password (8+ characters)"
                      value={registerForm.password}
                      onChange={(e) => setRegisterForm(f => ({ ...f, password: e.target.value }))}
                      data-testid="input-register-password"
                      autoComplete="new-password"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={registerMutation.isPending}
                    data-testid="button-register-submit"
                  >
                    {registerMutation.isPending ? "Creating account…" : "Create Account"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
