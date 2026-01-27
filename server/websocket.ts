import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { batchProcessor } from "./services/batchProcessor";

interface ClientSubscription {
  ws: WebSocket;
  jobIds: Set<string>;
}

const clients: Map<WebSocket, ClientSubscription> = new Map();
const jobSubscribers: Map<string, Set<WebSocket>> = new Map();

export function setupWebSocket(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws: WebSocket) => {
    console.log("[WebSocket] Client connected");

    clients.set(ws, { ws, jobIds: new Set() });

    ws.on("message", (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === "subscribe" && message.jobId) {
          subscribeToJob(ws, message.jobId);
        } else if (message.type === "unsubscribe" && message.jobId) {
          unsubscribeFromJob(ws, message.jobId);
        }
      } catch (error) {
        console.error("[WebSocket] Invalid message:", error);
      }
    });

    ws.on("close", () => {
      console.log("[WebSocket] Client disconnected");
      cleanupClient(ws);
    });

    ws.on("error", (error) => {
      console.error("[WebSocket] Error:", error);
      cleanupClient(ws);
    });
  });

  batchProcessor.on("progress", (data) => {
    broadcastToJob(data.jobId, {
      type: "PROGRESS",
      jobId: data.jobId,
      progress: {
        completed: data.successCount,
        failed: data.failureCount,
        total: data.totalContacts,
        percentComplete: data.percentComplete,
      },
    });
  });

  batchProcessor.on("contact:start", (data) => {
    broadcastToJob(data.jobId, {
      type: "CONTACT_START",
      jobId: data.jobId,
      contactId: data.contactId,
      contactName: data.contactName,
    });
  });

  batchProcessor.on("contact:complete", (data) => {
    broadcastToJob(data.jobId, {
      type: "CONTACT_COMPLETE",
      jobId: data.jobId,
      contactId: data.contactId,
      contactName: data.contactName,
      result: data.research,
    });
  });

  batchProcessor.on("contact:failed", (data) => {
    broadcastToJob(data.jobId, {
      type: "CONTACT_FAILED",
      jobId: data.jobId,
      contactId: data.contactId,
      contactName: data.contactName,
      error: data.error,
    });
  });

  batchProcessor.on("job:complete", (data) => {
    broadcastToJob(data.jobId, {
      type: "JOB_COMPLETE",
      jobId: data.jobId,
      status: data.status,
      successCount: data.successCount,
      failureCount: data.failureCount,
      totalContacts: data.totalContacts,
    });
  });

  console.log("[WebSocket] Server initialized on /ws");

  return wss;
}

function subscribeToJob(ws: WebSocket, jobId: string): void {
  const client = clients.get(ws);
  if (!client) return;

  client.jobIds.add(jobId);

  if (!jobSubscribers.has(jobId)) {
    jobSubscribers.set(jobId, new Set());
  }
  jobSubscribers.get(jobId)!.add(ws);

  ws.send(JSON.stringify({
    type: "SUBSCRIBED",
    jobId,
  }));

  console.log(`[WebSocket] Client subscribed to job ${jobId}`);
}

function unsubscribeFromJob(ws: WebSocket, jobId: string): void {
  const client = clients.get(ws);
  if (!client) return;

  client.jobIds.delete(jobId);

  const subscribers = jobSubscribers.get(jobId);
  if (subscribers) {
    subscribers.delete(ws);
    if (subscribers.size === 0) {
      jobSubscribers.delete(jobId);
    }
  }

  console.log(`[WebSocket] Client unsubscribed from job ${jobId}`);
}

function cleanupClient(ws: WebSocket): void {
  const client = clients.get(ws);
  if (!client) return;

  Array.from(client.jobIds).forEach((jobId) => {
    const subscribers = jobSubscribers.get(jobId);
    if (subscribers) {
      subscribers.delete(ws);
      if (subscribers.size === 0) {
        jobSubscribers.delete(jobId);
      }
    }
  });

  clients.delete(ws);
}

function broadcastToJob(jobId: string, message: object): void {
  const subscribers = jobSubscribers.get(jobId);
  
  console.log(`[WebSocket] Broadcasting to job ${jobId}, subscribers: ${subscribers?.size || 0}`);
  
  if (!subscribers || subscribers.size === 0) {
    console.log(`[WebSocket] No subscribers for job ${jobId}`);
    return;
  }

  const payload = JSON.stringify(message);

  Array.from(subscribers).forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
      console.log(`[WebSocket] Sent message to client for job ${jobId}`);
    } else {
      console.log(`[WebSocket] Client not ready (state: ${ws.readyState})`);
    }
  });
}

export default setupWebSocket;
