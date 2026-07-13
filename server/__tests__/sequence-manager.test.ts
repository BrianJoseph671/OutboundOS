import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockStorage, listGmailThreads } = vi.hoisted(() => ({
  mockStorage: {
    getActions: vi.fn(),
    getContact: vi.fn(),
    getDueSequenceSteps: vi.fn(),
    getInteractions: vi.fn(),
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
  listGmailThreads: vi.fn(),
}));

vi.mock("../storage", () => ({ storage: mockStorage }));
vi.mock("../services/gmailClient", () => ({ listGmailThreads }));

import {
  cancelSequence,
  checkReplyAndAutoComplete,
  createSequence,
  markStepSent,
  processDueSteps,
} from "../services/sequenceManager";

describe("sequenceManager critical ownership and write-ordering behavior", () => {
  beforeEach(() => {
    for (const value of Object.values(mockStorage)) {
      value.mockReset();
    }
    listGmailThreads.mockReset();

    mockStorage.getActions.mockResolvedValue([]);
    mockStorage.getInteractions.mockResolvedValue([]);
    mockStorage.getSequences.mockResolvedValue([]);
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

  it("dismisses pending sequence actions when a sequence is cancelled", async () => {
    mockStorage.getSequence.mockResolvedValue({
      id: "sequence-owned",
      userId: "user-a",
      contactId: "contact-owned",
      name: "Owned",
      status: "active",
    });
    mockStorage.getSequenceSteps.mockResolvedValue([
      { id: "step-1", status: "due" },
      { id: "step-2", status: "pending" },
    ]);
    mockStorage.getActions.mockResolvedValue([
      { id: "action-1", contactId: "contact-owned", reason: 'Step 1 of "Owned" is due' },
      { id: "action-2", contactId: "contact-owned", reason: 'Step 1 of "Other" is due' },
    ]);

    await cancelSequence("sequence-owned", "user-a");

    expect(mockStorage.updateAction).toHaveBeenCalledTimes(1);
    expect(mockStorage.updateAction).toHaveBeenCalledWith("action-1", "user-a", { status: "dismissed" });
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

  it("rejects sends when the step does not belong to the requested sequence", async () => {
    mockStorage.getSequenceStep.mockResolvedValue({
      id: "step-1",
      sequenceId: "sequence-other",
      stepNumber: 1,
      status: "due",
    });

    const result = await markStepSent("step-1", "user-a", undefined, undefined, "sequence-owned");

    expect(result).toBeUndefined();
    expect(mockStorage.getSequence).not.toHaveBeenCalled();
    expect(mockStorage.updateSequenceStep).not.toHaveBeenCalled();
  });

  it("only completes the action for the specific sequence step that was sent", async () => {
    mockStorage.getSequenceStep.mockResolvedValue({
      id: "step-1",
      sequenceId: "sequence-owned",
      stepNumber: 1,
      status: "due",
    });
    mockStorage.getSequence.mockResolvedValue({
      id: "sequence-owned",
      userId: "user-a",
      contactId: "contact-owned",
      name: "Owned",
      status: "active",
    });
    mockStorage.updateSequenceStep.mockResolvedValue({ id: "step-1", status: "sent" });
    mockStorage.getSequenceSteps.mockResolvedValue([
      { id: "step-1", stepNumber: 1, status: "sent" },
      { id: "step-2", stepNumber: 2, status: "due" },
    ]);
    mockStorage.getActions.mockResolvedValue([
      { id: "action-1", contactId: "contact-owned", reason: 'Step 1 of "Owned" is due' },
      { id: "action-2", contactId: "contact-owned", reason: 'Step 2 of "Owned" is due' },
    ]);

    await markStepSent("step-1", "user-a");

    expect(mockStorage.updateAction).toHaveBeenCalledTimes(1);
    expect(mockStorage.updateAction).toHaveBeenCalledWith("action-1", "user-a", { status: "completed" });
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

  it("does not auto-complete a sequence when sent steps have no thread id", async () => {
    mockStorage.getSequences.mockResolvedValue([
      { id: "sequence-owned", contactId: "contact-owned", status: "active", name: "Owned" },
    ]);
    mockStorage.getContact.mockResolvedValue({ id: "contact-owned", email: "reply@example.com" });
    mockStorage.getSequenceSteps.mockResolvedValue([
      {
        id: "step-1",
        sequenceId: "sequence-owned",
        status: "sent",
        sentAt: new Date("2026-06-18T10:00:00.000Z"),
        threadId: null,
      },
    ]);

    const completed = await checkReplyAndAutoComplete("user-a");

    expect(completed).toBe(0);
    expect(listGmailThreads).not.toHaveBeenCalled();
    expect(mockStorage.updateSequence).not.toHaveBeenCalled();
  });

  it("does not auto-complete from an unrelated stored inbound thread", async () => {
    mockStorage.getSequences.mockResolvedValue([
      { id: "sequence-owned", contactId: "contact-owned", status: "active", name: "Owned" },
    ]);
    mockStorage.getContact.mockResolvedValue({ id: "contact-owned", email: "reply@example.com" });
    mockStorage.getSequenceSteps.mockResolvedValue([
      {
        id: "step-1",
        sequenceId: "sequence-owned",
        status: "sent",
        sentAt: new Date("2026-06-18T10:00:00.000Z"),
        threadId: "thread-1",
      },
    ]);
    listGmailThreads.mockResolvedValue({ threads: [] });
    mockStorage.getInteractions.mockResolvedValue([
      {
        id: "interaction-1",
        contactId: "contact-owned",
        channel: "email",
        direction: "inbound",
        occurredAt: new Date("2026-06-19T10:00:00.000Z"),
        sourceId: "unrelated-thread",
      },
    ]);

    const completed = await checkReplyAndAutoComplete("user-a");

    expect(completed).toBe(0);
    expect(mockStorage.updateSequence).not.toHaveBeenCalled();
  });
});
