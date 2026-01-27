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

  const resetState = useCallback(() => {
    setProgress(null);
    setCompletedContacts([]);
    setFailedContacts([]);
    setCurrentContact(null);
    setIsComplete(false);
  }, []);

  useEffect(() => {
    if (!jobId) {
      resetState();
      return;
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      ws.send(JSON.stringify({ type: "subscribe", jobId }));
    };

    ws.onmessage = (event) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);

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
            setProgress({
              completed: message.successCount,
              failed: message.failureCount,
              total: message.totalContacts,
              percentComplete: 100,
            });
            break;

          case "SUBSCRIBED":
            console.log(`[WebSocket] Subscribed to job ${message.jobId}`);
            break;
        }
      } catch (error) {
        console.error("[WebSocket] Failed to parse message:", error);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    ws.onerror = (error) => {
      console.error("[WebSocket] Error:", error);
      setIsConnected(false);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "unsubscribe", jobId }));
      }
      ws.close();
      wsRef.current = null;
    };
  }, [jobId, resetState]);

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
