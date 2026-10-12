/**
 * Gmail thread ids are hexadecimal. Draft fallbacks store ids like
 * `local-thread-<ms>` or `thread-<ms>`, which are not Gmail threads.
 */
export function isGmailThreadId(threadId: string): boolean {
  return /^[0-9a-f]+$/i.test(threadId);
}

export function gmailThreadIds(threadIds: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const threadId of threadIds) {
    if (!threadId || !isGmailThreadId(threadId) || seen.has(threadId)) continue;
    seen.add(threadId);
    ids.push(threadId);
  }
  return ids;
}

function extractEmailAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim().toLowerCase();
}

/**
 * Gmail `before:YYYY/MM/DD` excludes that calendar day, so the search end
 * must be the next UTC day to include mail received today. The start is the
 * send time so a reply from an earlier day is still in the window.
 */
export function replyLookupWindow(lastSentAt: Date, now = new Date()): { start_date: string; end_date: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return {
    start_date: lastSentAt.toISOString(),
    end_date: end.toISOString(),
  };
}

export function threadHasContactReplyAfter(
  thread: { messages?: Array<{ from?: string; sent_at?: string }> },
  contactEmail: string,
  lastSentAt: Date,
): boolean {
  const contact = contactEmail.trim().toLowerCase();
  const sentAt = lastSentAt.getTime();
  return (thread.messages || []).some((msg) => {
    if (extractEmailAddress(msg.from || "") !== contact) return false;
    const msgDate = msg.sent_at ? Date.parse(msg.sent_at) : NaN;
    return !Number.isNaN(msgDate) && msgDate > sentAt;
  });
}

/** Due-step reasons are `Step N of "<sequence name>" is due`. */
export function actionMatchesSequence(reason: string, sequenceName: string): boolean {
  return reason.includes(`"${sequenceName}"`);
}
