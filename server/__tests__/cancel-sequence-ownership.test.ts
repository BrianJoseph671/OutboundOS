import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getSequence,
  getSequenceSteps,
  updateSequenceStep,
  updateSequence,
} = vi.hoisted(() => ({
  getSequence: vi.fn(),
  getSequenceSteps: vi.fn(),
  updateSequenceStep: vi.fn(),
  updateSequence: vi.fn(),
}));

vi.mock("../storage", () => ({
  storage: {
    getSequence,
    getSequenceSteps,
    updateSequenceStep,
    updateSequence,
  },
}));

vi.mock("../services/gmailClient", () => ({
  listGmailThreads: vi.fn(),
}));

import { cancelSequence } from "../services/sequenceManager";

describe("cancelSequence ownership", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not skip steps when the sequence belongs to another user", async () => {
    getSequence.mockResolvedValue(undefined);
    getSequenceSteps.mockResolvedValue([{ id: "step-1", status: "pending" }]);

    const result = await cancelSequence("seq-other", "attacker");

    expect(result).toBeUndefined();
    expect(getSequenceSteps).not.toHaveBeenCalled();
    expect(updateSequenceStep).not.toHaveBeenCalled();
    expect(updateSequence).not.toHaveBeenCalled();
  });

  it("skips pending steps only after confirming the caller owns the sequence", async () => {
    getSequence.mockResolvedValue({ id: "seq-1", userId: "owner" });
    getSequenceSteps.mockResolvedValue([
      { id: "step-1", status: "pending" },
      { id: "step-2", status: "sent" },
    ]);
    updateSequenceStep.mockResolvedValue({ id: "step-1", status: "skipped" });
    updateSequence.mockResolvedValue({ id: "seq-1", status: "cancelled" });

    const result = await cancelSequence("seq-1", "owner");

    expect(getSequence).toHaveBeenCalledWith("seq-1", "owner");
    expect(updateSequenceStep).toHaveBeenCalledTimes(1);
    expect(updateSequenceStep).toHaveBeenCalledWith("step-1", { status: "skipped" });
    expect(updateSequence).toHaveBeenCalledWith("seq-1", "owner", { status: "cancelled" });
    expect(result?.status).toBe("cancelled");
  });
});
