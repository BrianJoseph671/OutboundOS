import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ExternalLink, Unplug, RefreshCw, AlertCircle } from "lucide-react";

interface IntegrationCardProps {
  provider: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  connected: boolean;
  accountId?: string | null;
  scopes?: string | null;
  viaGoogle?: boolean;
  onStatusChange?: () => void;
  onSync?: () => void;
  isSyncing?: boolean;
}

export function IntegrationCard({
  provider,
  name,
  description,
  icon,
  connected,
  accountId,
  viaGoogle,
  onStatusChange,
  onSync,
  isSyncing,
}: IntegrationCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [connecting, setConnecting] = useState(false);

  const connectMutation = useMutation({
    mutationFn: async () => {
      setConnecting(true);
      const res = await fetch(`/api/integrations/${provider}/connect`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `Failed to connect ${name}`);
      }
      return data;
    },
    onSuccess: (data) => {
      if (data.authorizationUrl) {
        window.location.href = data.authorizationUrl;
      } else if (data.connected) {
        queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
        toast({ title: `${name} connected` });
        onStatusChange?.();
        setConnecting(false);
      }
    },
    onError: (error: Error) => {
      setConnecting(false);
      toast({
        title: `Failed to connect ${name}`,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/integrations/${provider}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/integrations"] });
      toast({ title: `${name} disconnected` });
      onStatusChange?.();
    },
    onError: (error: Error) => {
      toast({
        title: `Failed to disconnect ${name}`,
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
            {icon}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-medium">{name}</span>
              {connected && (
                <Badge variant="secondary" className="text-xs">Connected</Badge>
              )}
              {viaGoogle && connected && (
                <Badge variant="outline" className="text-xs text-muted-foreground">via Google</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{description}</p>
            {connected && accountId && (
              <p className="text-xs text-muted-foreground mt-0.5">{accountId}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {connected ? (
            <>
              {onSync && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSync}
                  disabled={isSyncing}
                  data-testid={`button-sync-${provider}`}
                >
                  {isSyncing ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Sync
                </Button>
              )}
              {!viaGoogle && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                  className="text-destructive hover:text-destructive"
                  data-testid={`button-disconnect-${provider}`}
                >
                  {disconnectMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Unplug className="h-4 w-4 mr-2" />
                  )}
                  Disconnect
                </Button>
              )}
            </>
          ) : (
            <Button
              size="sm"
              onClick={() => connectMutation.mutate()}
              disabled={connecting || connectMutation.isPending}
              data-testid={`button-connect-${provider}`}
            >
              {connecting || connectMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <ExternalLink className="h-4 w-4 mr-2" />
              )}
              Connect
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
