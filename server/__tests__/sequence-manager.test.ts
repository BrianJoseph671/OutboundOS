import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockStorage } = vi.hoisted(() => ({
  mockStorage: {
    getActions: vi.fn(),
    getContact: vi.fn(),
    getDueSequenceSteps: vi.fn(),
    getSequence: vi.fn(),
    getSequences: vi.fn(),
    getSequenceStep: vi.fn(),
    getSequenceSteps: vi.fn(),
    getSequenceTemplate: vi.fn(),
    createAction: vi.fn(),
    createSequence: vi.fn(),
    createSequenceStep: vi.fn(),
    updateAction: vi.fn(),
    updateSequence: vi.fn(),
    updateSequenceStep: vi.fn(),
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

describe("sequenceManager ownership and write ordering", () => {
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
    expect(mockStorage.createSequenceStep).not.toHaveBeenCalled();
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
    expect(mockStorage.getSequence).toHaveBeenCalledWith("sequence-victim", "attacker-user");
    expect(mockStorage.getSequenceSteps).not.toHaveBeenCalled();
    expect(mockStorage.updateSequenceStep).not.toHaveBeenCalled();
    expect(mockStorage.updateSequence).not.toHaveBeenCalled();
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
