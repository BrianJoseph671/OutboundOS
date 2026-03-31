/**
 * Phase 2 — Mock action data for the Actions Page.
 * Shape matches the ActionCard interface and the GET /api/actions API response.
 * Used during development before the real API is wired up.
 */

import type { ActionCard } from '@shared/types/actions';

// Reference date: 2026-03-31 (today)
const now = new Date('2026-03-31T00:00:00.000Z');

const daysAgo = (n: number): string => {
  const d = new Date(now);
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

const daysFromNow = (n: number): string => {
  const d = new Date(now);
  d.setDate(d.getDate() + n);
  return d.toISOString();
};

export const mockActions: ActionCard[] = [
  // -------------------------------------------------------------------------
  // PENDING actions (ordered by priority DESC, then createdAt DESC)
  // -------------------------------------------------------------------------
  {
    id: 'act-001',
    userId: 'user-brian',
    contactId: 'contact-vince',
    actionType: 'follow_up',
    triggerInteractionId: 'int-001',
    priority: 3,
    status: 'pending',
    snoozedUntil: null,
    reason: 'Meeting on March 25 — no follow-up sent',
    createdAt: daysAgo(6),
    completedAt: null,
    contactName: 'Vince Signori',
    contactCompany: 'LangChain',
    contactEmail: 'vince@langchain.ai',
  },
  {
    id: 'act-002',
    userId: 'user-brian',
    contactId: 'contact-andrei',
    actionType: 'follow_up',
    triggerInteractionId: 'int-002',
    priority: 2,
    status: 'pending',
    snoozedUntil: null,
    reason: 'Replied to your cold email 3 days ago — no response sent yet',
    createdAt: daysAgo(3),
    completedAt: null,
    contactName: 'Andrei Gheorghe',
    contactCompany: 'Anthropic',
    contactEmail: 'andrei@anthropic.com',
  },
  {
    id: 'act-003',
    userId: 'user-brian',
    contactId: 'contact-noah',
    actionType: 'open_thread',
    triggerInteractionId: 'int-003',
    priority: 2,
    status: 'pending',
    snoozedUntil: null,
    reason: 'Mentioned a potential intro to their PM team — thread left open',
    createdAt: daysAgo(5),
    completedAt: null,
    contactName: 'Noah Lovati',
    contactCompany: 'Notion',
    contactEmail: 'noah@notion.so',
  },
  {
    id: 'act-004',
    userId: 'user-brian',
    contactId: 'contact-paul',
    actionType: 'reconnect',
    triggerInteractionId: null,
    priority: 1,
    status: 'pending',
    snoozedUntil: null,
    reason: 'No contact in 21 days — warm relationship cooling',
    createdAt: daysAgo(2),
    completedAt: null,
    contactName: 'Paul Dornier',
    contactCompany: 'Mistral AI',
    contactEmail: 'paul.dornier@mistral.ai',
  },
  {
    id: 'act-005',
    userId: 'user-brian',
    contactId: 'contact-aron',
    actionType: 'follow_up',
    triggerInteractionId: 'int-004',
    priority: 1,
    status: 'pending',
    snoozedUntil: null,
    reason: 'Granola summary flagged an open question about pricing — needs reply',
    createdAt: daysAgo(1),
    completedAt: null,
    contactName: 'Aron Schwartz',
    contactCompany: 'Linear',
    contactEmail: 'aron@linear.app',
  },
  {
    id: 'act-006',
    userId: 'user-brian',
    contactId: 'contact-sean',
    actionType: 'new_contact',
    triggerInteractionId: 'int-005',
    priority: 1,
    status: 'pending',
    snoozedUntil: null,
    reason: 'Met at YC Demo Day — add to Rolodex while still fresh',
    createdAt: daysAgo(1),
    completedAt: null,
    contactName: 'Sean Duryee',
    contactCompany: 'Y Combinator',
    contactEmail: 'sean@ycombinator.com',
  },
  {
    id: 'act-007',
    userId: 'user-brian',
    contactId: 'contact-maya',
    actionType: 'open_thread',
    triggerInteractionId: 'int-006',
    priority: 1,
    status: 'pending',
    snoozedUntil: null,
    reason: 'Calendar invite accepted — waiting on agenda confirmation',
    createdAt: daysAgo(2),
    completedAt: null,
    contactName: 'Maya Patel',
    contactCompany: 'Cohere',
    contactEmail: 'maya@cohere.com',
  },

  // -------------------------------------------------------------------------
  // SNOOZED (1 entry — snoozedUntil is in the future)
  // -------------------------------------------------------------------------
  {
    id: 'act-008',
    userId: 'user-brian',
    contactId: 'contact-george',
    actionType: 'reconnect',
    triggerInteractionId: null,
    priority: 0,
    status: 'snoozed',
    snoozedUntil: daysFromNow(3),
    reason: 'No contact in 18 days — snoozed to follow up after Q2 planning wraps',
    createdAt: daysAgo(4),
    completedAt: null,
    contactName: 'George Gardner',
    contactCompany: 'Sequoia Capital',
    contactEmail: 'george@sequoiacap.com',
  },

  // -------------------------------------------------------------------------
  // DISMISSED (1 entry)
  // -------------------------------------------------------------------------
  {
    id: 'act-009',
    userId: 'user-brian',
    contactId: 'contact-alex',
    actionType: 'follow_up',
    triggerInteractionId: 'int-007',
    priority: 0,
    status: 'dismissed',
    snoozedUntil: null,
    reason: 'Received automated response — no real engagement',
    createdAt: daysAgo(10),
    completedAt: daysAgo(9),
    contactName: 'Alex Rivera',
    contactCompany: 'Salesforce',
    contactEmail: 'alex.rivera@salesforce.com',
  },

  // -------------------------------------------------------------------------
  // COMPLETED (1 entry)
  // -------------------------------------------------------------------------
  {
    id: 'act-010',
    userId: 'user-brian',
    contactId: 'contact-vince',
    actionType: 'follow_up',
    triggerInteractionId: 'int-008',
    priority: 2,
    status: 'completed',
    snoozedUntil: null,
    reason: 'Sent follow-up after SF meetup — marked complete after reply received',
    createdAt: daysAgo(14),
    completedAt: daysAgo(7),
    contactName: 'Vince Signori',
    contactCompany: 'LangChain',
    contactEmail: 'vince@langchain.ai',
  },
];

/**
 * Returns only the pending mock actions (snoozedUntil is null or in the past).
 * Mirrors the default GET /api/actions?status=pending behaviour.
 */
export const pendingMockActions: ActionCard[] = mockActions
  .filter(
    (a) =>
      a.status === 'pending' &&
      (a.snoozedUntil === null || new Date(a.snoozedUntil) <= new Date()),
  )
  .sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
