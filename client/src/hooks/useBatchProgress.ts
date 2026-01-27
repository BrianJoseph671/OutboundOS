import { useState, useEffect, useRef, useCallback } from "react";

export interface BatchProgress {
  completed: number;
  failed: number;
  total: number;
  percentComplete: number;
}

export interface CompletedContact {
  contactId: string;
  contactName: string;
  result: Record<string, unknown>;
}

export interface FailedContact {
  contactId: string;
  contactName: string;
  error: string;
}

export interface ProcessingContact {
  contactId: string;
  contactName: string;
}

interface ProgressMessage {
  type: "PROGRESS";
  jobId: string;
  progress: BatchProgress;
}

interface ContactStartMessage {
  type: "CONTACT_START";
  jobId: string;
  contactId: string;
  contactName: string;
}

interface ContactCompleteMessage {
  type: "CONTACT_COMPLETE";
  jobId: string;
  contactId: string;
  contactName: string;
  result: Record<string, unknown>;
}

interface ContactFailedMessage {
  type: "CONTACT_FAILED";
  jobId: string;
  contactId: string;
  contactName: string;
  error: string;
}

interface JobCompleteMessage {
  type: "JOB_COMPLETE";
  jobId: string;
  status: string;
  successCount: number;
  failureCount: number;
  totalContacts: number;
}

interface SubscribedMessage {
  type: "SUBSCRIBED";
  jobId: string;
}

type WebSocketMessage =
  | ProgressMessage
  | ContactStartMessage
  | ContactCompleteMessage
  | ContactFailedMessage
  | JobCompleteMessage
  | SubscribedMessage;

interface UseBatchProgressResult {
  progress: BatchProgress | null;
  completedContacts: CompletedContact[];
  failedContacts: FailedContact[];
  currentContact: ProcessingContact | null;
  isComplete: boolean;
  isConnected: boolean;
}

export function useBatchProgress(jobId: string | null): UseBatchProgressResult {
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [completedContacts, setCompletedContacts] = useState<CompletedContact[]>([]);
  const [failedContacts, setFailedContacts] = useState<FailedContact[]>([]);
  const [currentContact, setCurrentContact] = useState<ProcessingContact | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const wsFailedRef = useRef(false);

  const resetState = useCallback(() => {
    setProgress(null);
    setCompletedContacts([]);
    setFailedContacts([]);
    setCurrentContact(null);
    setIsComplete(false);
    wsFailedRef.current = false;
  }, []);

  // Fallback polling when WebSocket fails
  const startPolling = useCallback((jobIdToPolL: string) => {
    if (pollingRef.current) return;
    
    console.log("[useBatchProgress] Starting fallback polling");
    
    pollingRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/batch/${jobIdToPolL}/status`);
        if (!response.ok) return;
        
        const data = await response.json();
        console.log("[useBatchProgress] Poll response:", data);
        
        if (data.status === "completed" || data.status === "failed") {
          setIsComplete(true);
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
        }
        
        setProgress({
          completed: data.successCount || 0,
          failed: data.failureCount || 0,
          total: data.totalContacts || 0,
          percentComplete: data.totalContacts ? Math.round((data.processedContacts / data.totalContacts) * 100) : 0,
        });
      } catch (error) {
        console.error("[useBatchProgress] Polling error:", error);
      }
    }, 2000);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!jobId) {
      resetState();
      stopPolling();
      return;
    }

    console.log(`[useBatchProgress] Connecting to WebSocket for job ${jobId}`);

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    // Set a timeout to start polling if WebSocket doesn't connect
    const connectionTimeout = setTimeout(() => {
      if (!isConnected && !wsFailedRef.current) {
        console.log("[useBatchProgress] WebSocket connection timeout, starting fallback polling");
        wsFailedRef.current = true;
        startPolling(jobId);
      }
    }, 5000);

    ws.onopen = () => {
      console.log("[useBatchProgress] WebSocket connected");
      clearTimeout(connectionTimeout);
      setIsConnected(true);
      ws.send(JSON.stringify({ type: "subscribe", jobId }));
      stopPolling(); // Stop polling if we get WebSocket working
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);
        console.log("[useBatchProgress] Received message:", message.type, message);

        switch (message.type) {
          case "PROGRESS":
            setProgress(message.progress);
            break;

          case "CONTACT_START":
            setCurrentContact({
              contactId: message.contactId,
              contactName: message.contactName,
            });
            break;

          case "CONTACT_COMPLETE":
            setCurrentContact(null);
            setCompletedContacts((prev) => [
              ...prev,
              {
                contactId: message.contactId,
                contactName: message.contactName,
                result: message.result,
              },
            ]);
            break;

          case "CONTACT_FAILED":
            setCurrentContact(null);
            setFailedContacts((prev) => [
              ...prev,
              {
                contactId: message.contactId,
                contactName: message.contactName,
                error: message.error,
              },
            ]);
            break;

          case "JOB_COMPLETE":
            setIsComplete(true);
            setCurrentContact(null);
            setProgress({
              completed: message.successCount,
              failed: message.failureCount,
              total: message.totalContacts,
              percentComplete: 100,
            });
            break;

          case "SUBSCRIBED":
            console.log(`[useBatchProgress] Subscribed to job ${message.jobId}`);
            break;
        }
      } catch (error) {
        console.error("[useBatchProgress] Failed to parse message:", error);
      }
    };

    ws.onclose = () => {
      console.log("[useBatchProgress] WebSocket closed");
      setIsConnected(false);
      // Start polling as fallback if WebSocket closes unexpectedly
      if (!isComplete && !wsFailedRef.current) {
        wsFailedRef.current = true;
        startPolling(jobId);
      }
    };

    ws.onerror = (error) => {
      console.error("[useBatchProgress] WebSocket error:", error);
      setIsConnected(false);
      // Start polling as fallback
      if (!wsFailedRef.current) {
        wsFailedRef.current = true;
        startPolling(jobId);
      }
    };

    return () => {
      clearTimeout(connectionTimeout);
      stopPolling();
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "unsubscribe", jobId }));
      }
      ws.close();
      wsRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  return {
    progress,
    completedContacts,
    failedContacts,
    currentContact,
    isComplete,
    isConnected,
  };
}

export default useBatchProgress;
