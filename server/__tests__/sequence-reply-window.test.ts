import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSequencesMock = vi.fn();
const getContactMock = vi.fn();
const getSequenceStepsMock = vi.fn();
const updateSequenceStepMock = vi.fn();
const updateSequenceMock = vi.fn();
const getInteractionsMock = vi.fn();
const listGmailThreadsMock = vi.fn();

vi.mock("../storage", () => ({
  storage: {
    getSequences: getSequencesMock,
    getContact: getContactMock,
    getSequenceSteps: getSequenceStepsMock,
    updateSequenceStep: updateSequenceStepMock,
    updateSequence: updateSequenceMock,
    getInteractions: getInteractionsMock,
  },
}));

vi.mock("../services/gmailClient", () => ({
  listGmailThreads: listGmailThreadsMock,
}));

describe("sequence reply detection Gmail window", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-06T13:00:00.000Z"));

    getSequencesMock.mockResolvedValue([
      { id: "seq-1", contactId: "contact-1", name: "Networking", status: "active" },
    ]);
    getContactMock.mockResolvedValue({ id: "contact-1", email: "alice@example.com" });
    getSequenceStepsMock.mockResolvedValue([
      {
        id: "step-1",
        sequenceId: "seq-1",
        status: "sent",
        sentAt: new Date("2026-07-04T10:00:00.000Z"),
        threadId: "thread-1",
      },
    ]);
    listGmailThreadsMock.mockResolvedValue({
      threads: [
        {
          thread_id: "thread-1",
          messages: [
            {
              from: "Alice <alice@example.com>",
              sent_at: "2026-07-05T09:00:00.000Z",
            },
          ],
        },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pads Gmail date filters around last sent time so replies are not excluded", async () => {
    const { checkReplyAndAutoComplete } = await import("../services/sequenceManager");

    await expect(checkReplyAndAutoComplete("user-1")).resolves.toBe(1);

    const filters = listGmailThreadsMock.mock.calls[0][1];
    expect(filters.start_date).toBe("2026-07-03T10:00:00.000Z");
    expect(filters.end_date).toBe("2026-07-07T13:00:00.000Z");
    expect(updateSequenceMock).toHaveBeenCalledWith("seq-1", "user-1", { status: "completed" });
  });
});
