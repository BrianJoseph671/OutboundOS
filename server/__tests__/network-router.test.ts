import { beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import request from "supertest";

const { mockStorage, mockPrepareIndexReviewSession, mockRunIncrementalSync } = vi.hoisted(() => ({
  mockStorage: {
    getUser: vi.fn(),
    getLatestNetworkIndexJob: vi.fn(),
    getNetworkIndexJob: vi.fn(),
    getLatestPendingIndexReviewSession: vi.fn(),
  },
  mockPrepareIndexReviewSession: vi.fn(),
  mockRunIncrementalSync: vi.fn(),
}));

vi.mock("../storage", () => ({
  storage: mockStorage,
}));

vi.mock("../services/networkIndexer", () => ({
  prepareIndexReviewSession: mockPrepareIndexReviewSession,
  runIncrementalSync: mockRunIncrementalSync,
}));

import { networkRouter } from "../routes/network";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: "user-1" } as Express.User;
    next();
  });
  app.use("/api/network", networkRouter);
  return app;
}

const completedJob = {
  id: "job-completed",
  status: "completed",
  threadsScanned: 12,
  contactsFound: 3,
  contactsUpdated: 3,
  errors: [],
  startedAt: new Date("2026-05-12T10:00:00Z"),
  completedAt: new Date("2026-05-12T10:02:00Z"),
};

const pendingJob = {
  id: "job-pending",
  status: "pending_review",
  threadsScanned: 50,
  contactsFound: 10,
  contactsUpdated: 0,
  errors: [],
  startedAt: new Date("2026-05-12T09:00:00Z"),
  completedAt: null,
};

const pendingSession = {
  id: "session-pending",
  jobId: "job-pending",
  status: "pending_review",
  createdAt: new Date("2026-05-12T09:03:00Z"),
};

describe("networkRouter pending review protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.getUser.mockResolvedValue({ id: "user-1", email: "user@example.com" });
    mockStorage.getLatestNetworkIndexJob.mockResolvedValue(completedJob);
    mockStorage.getNetworkIndexJob.mockResolvedValue(pendingJob);
    mockStorage.getLatestPendingIndexReviewSession.mockResolvedValue(pendingSession);
    mockPrepareIndexReviewSession.mockResolvedValue({
      sessionId: "new-session",
      jobId: "new-job",
      typeCount: 0,
      autoAcceptedCount: 0,
      totalClassifiedCount: 0,
      calendarPrioritizedCount: 0,
    });
    mockRunIncrementalSync.mockResolvedValue(undefined);
  });

  it("blocks a new full index when any review session is still pending", async () => {
    const app = createApp();

    const res = await request(app).post("/api/network/index");

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      error: "A review is pending for your latest index run",
      jobId: "job-pending",
      sessionId: "session-pending",
    });
    expect(mockPrepareIndexReviewSession).not.toHaveBeenCalled();
  });

  it("blocks incremental sync while an index review is pending", async () => {
    const app = createApp();

    const res = await request(app).post("/api/network/sync");

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({
      error: "Complete your pending index review before syncing",
      jobId: "job-pending",
      sessionId: "session-pending",
    });
    expect(mockRunIncrementalSync).not.toHaveBeenCalled();
  });

  it("reports the pending review job instead of a newer completed sync job", async () => {
    const app = createApp();

    const res = await request(app).get("/api/network/status");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      jobId: "job-pending",
      sessionId: "session-pending",
      status: "pending_review",
      threadsScanned: 50,
      contactsFound: 10,
    });
    expect(mockStorage.getNetworkIndexJob).toHaveBeenCalledWith("job-pending", "user-1");
  });
});
