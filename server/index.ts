import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { setupWebSocket } from "./websocket";

const app = express();
const httpServer = createServer(app);

setupWebSocket(httpServer);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ limit: "10mb", extended: false }));

// Debug middleware for webhook requests
app.use("/api/webhooks", (req, res, next) => {
  console.log(
    `[WEBHOOK DEBUG] ${req.method} ${req.path} - Body:`,
    req.body ? "present" : "missing",
  );
  next();
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // Port from env (default 5000). In development bind to localhost for Windows compatibility;
  // production (e.g. Replit) can bind to 0.0.0.0. reusePort is Unix-only.
  const port = parseInt(process.env.PORT || "5000", 10);
  const isProduction = process.env.NODE_ENV === "production";
  const listenOptions: { port: number; host: string; reusePort?: boolean } = {
    port,
    host: isProduction ? "0.0.0.0" : "127.0.0.1",
  };
  if (isProduction) listenOptions.reusePort = true;
  httpServer.listen(listenOptions, () => {
    const host = listenOptions.host;
    log(`serving on port ${port}`);
    if (!isProduction) {
      log(`Open in your browser: http://${host}:${port} (use a system browser like Chrome or Edge, not Cursor's embedded browser)`);
    }
  });
})();
