import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockStorage } = vi.hoisted(() => ({
  mockStorage: {
    getContact: vi.fn(),
    getSequenceTemplate: vi.fn(),
    getSequences: vi.fn(),
    createSequence: vi.fn(),
    createSequenceStep: vi.fn(),
    getDueSequenceSteps: vi.fn(),
    createAction: vi.fn(),
    updateSequenceStep: vi.fn(),
    getSequenceStep: vi.fn(),
    getSequence: vi.fn(),
    getSequenceSteps: vi.fn(),
    updateSequence: vi.fn(),
    getActions: vi.fn(),
    updateAction: vi.fn(),
  },
}));

vi.mock("../storage", () => ({ storage: mockStorage }));
vi.mock("../services/gmailClient", () => ({ listGmailThreads: vi.fn() }));

import {
  cancelSequence,
  createSequence,
  markStepSent,
  processDueSteps,
} from "../services/sequenceManager";

describe("sequenceManager critical ownership and write-ordering behavior", () => {
  beforeEach(() => {
    for (const value of Object.values(mockStorage)) {
      value.mockReset();
    }

    mockStorage.getActions.mockResolvedValue([]);
    mockStorage.updateSequence.mockImplementation(async (id, userId, data) => ({
      id,
      userId,
      contactId: "contact-owned",
      name: "Sequence",
      status: data.status,
    }));
  });

  it("rejects sequence creation for contacts outside the authenticated user before any write", async () => {
    mockStorage.getContact.mockResolvedValue(undefined);

    await expect(
      createSequence({
        userId: "user-a",
        contactId: "contact-b",
        name: "Bad bind",
        customSteps: [{ stepNumber: 1, delayDays: 0, instructions: "Send intro" }],
      }),
    ).rejects.toThrow("Contact not found");

    expect(mockStorage.getSequences).not.toHaveBeenCalled();
    expect(mockStorage.createSequence).not.toHaveBeenCalled();
    expect(mockStorage.updateSequenceStep).not.toHaveBeenCalled();
  });

  it("validates templates before cancelling an existing active sequence", async () => {
    mockStorage.getContact.mockResolvedValue({ id: "contact-owned", userId: "user-a" });
    mockStorage.getSequenceTemplate.mockResolvedValue(undefined);

    await expect(
      createSequence({
        userId: "user-a",
        contactId: "contact-owned",
        name: "Missing template",
        templateId: "template-missing",
      }),
    ).rejects.toThrow("Template not found");

    expect(mockStorage.getSequences).not.toHaveBeenCalled();
    expect(mockStorage.updateSequence).not.toHaveBeenCalled();
    expect(mockStorage.updateSequenceStep).not.toHaveBeenCalled();
    expect(mockStorage.createSequence).not.toHaveBeenCalled();
  });

  it("does not mutate sequence steps when cancel is requested by a non-owner", async () => {
    mockStorage.getSequence.mockResolvedValue(undefined);

    const result = await cancelSequence("sequence-victim", "attacker-user");

    expect(result).toBeUndefined();
    expect(mockStorage.getSequenceSteps).not.toHaveBeenCalled();
    expect(mockStorage.updateSequenceStep).not.toHaveBeenCalled();
    expect(mockStorage.updateSequence).not.toHaveBeenCalled();
  });

  it("cancels only after confirming sequence ownership", async () => {
    mockStorage.getSequence.mockResolvedValue({
      id: "sequence-owned",
      userId: "user-a",
      contactId: "contact-owned",
      name: "Owned",
      status: "active",
    });
    mockStorage.getSequenceSteps.mockResolvedValue([
      { id: "step-pending", sequenceId: "sequence-owned", status: "pending" },
      { id: "step-due", sequenceId: "sequence-owned", status: "due" },
      { id: "step-sent", sequenceId: "sequence-owned", status: "sent" },
    ]);

    await cancelSequence("sequence-owned", "user-a");

    expect(mockStorage.getSequence).toHaveBeenCalledWith("sequence-owned", "user-a");
    expect(mockStorage.updateSequenceStep).toHaveBeenCalledTimes(2);
    expect(mockStorage.updateSequenceStep).toHaveBeenCalledWith("step-pending", { status: "skipped" });
    expect(mockStorage.updateSequenceStep).toHaveBeenCalledWith("step-due", { status: "skipped" });
    expect(mockStorage.updateSequence).toHaveBeenCalledWith("sequence-owned", "user-a", { status: "cancelled" });
  });

  it("treats duplicate send calls as idempotent and does not reschedule next steps", async () => {
    const sentStep = {
      id: "step-sent",
      sequenceId: "sequence-owned",
      stepNumber: 1,
      status: "sent",
      sentAt: new Date("2026-06-01T00:00:00.000Z"),
    };
    mockStorage.getSequenceStep.mockResolvedValue(sentStep);
    mockStorage.getSequence.mockResolvedValue({
      id: "sequence-owned",
      userId: "user-a",
      contactId: "contact-owned",
      name: "Owned",
      status: "active",
    });

    const result = await markStepSent("step-sent", "user-a");

    expect(result).toBe(sentStep);
    expect(mockStorage.updateSequenceStep).not.toHaveBeenCalled();
    expect(mockStorage.getSequenceSteps).not.toHaveBeenCalled();
  });

  it("leaves a due step pending when action creation fails so it can be retried", async () => {
    mockStorage.getDueSequenceSteps.mockResolvedValue([
      {
        id: "step-due",
        contactId: "contact-owned",
        stepNumber: 1,
        sequenceName: "Owned",
      },
    ]);
    mockStorage.createAction.mockRejectedValue(new Error("temporary db failure"));

    const count = await processDueSteps("user-a");

    expect(count).toBe(0);
    expect(mockStorage.updateSequenceStep).not.toHaveBeenCalled();
  });
});
