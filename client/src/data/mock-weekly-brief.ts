import type { WeeklyBriefResponse } from "@shared/types/phase4";

const now = new Date();
const monday = new Date(now);
monday.setDate(now.getDate() - now.getDay() + 1);
const sunday = new Date(monday);
sunday.setDate(monday.getDate() + 6);

export const mockWeeklyBrief: WeeklyBriefResponse = {
  generatedAt: now.toISOString(),
  weekStart: monday.toISOString().slice(0, 10),
  weekEnd: sunday.toISOString().slice(0, 10),
  totalContacts: 9,
  categories: [
    {
      label: "Needs Follow-Up",
      contacts: [
        {
          contactId: "c-vince",
          contactName: "Vince Signori",
          company: "Acme Corp",
          tier: "hot",
          lastInteractionAt: new Date(Date.now() - 3 * 86400000).toISOString(),
          lastInteractionChannel: "email",
          pendingActions: 2,
          snippet: "CRO intro request pending since Mar 18 — no follow-up sent.",
        },
        {
          contactId: "c-sarah",
          contactName: "Sarah Chen",
          company: "TechStart",
          tier: "warm",
          lastInteractionAt: new Date(Date.now() - 5 * 86400000).toISOString(),
          lastInteractionChannel: "meeting",
          pendingActions: 1,
          snippet: "Quarterly review ended with open pricing question.",
        },
        {
          contactId: "c-mike",
          contactName: "Mike Rivera",
          company: "DataFlow",
          tier: "warm",
          lastInteractionAt: new Date(Date.now() - 2 * 86400000).toISOString(),
          lastInteractionChannel: "email",
          pendingActions: 1,
          snippet: "Waiting on partnership proposal response.",
        },
      ],
    },
    {
      label: "Going Cold",
      contacts: [
        {
          contactId: "c-alex",
          contactName: "Alex Thompson",
          company: "GrowthLabs",
          tier: "warm",
          lastInteractionAt: new Date(Date.now() - 18 * 86400000).toISOString(),
          lastInteractionChannel: "email",
          pendingActions: 0,
          snippet: "Last email 18 days ago — was warm, risk of going cold.",
        },
        {
          contactId: "c-jordan",
          contactName: "Jordan Lee",
          company: "ScaleUp Inc",
          tier: "hot",
          lastInteractionAt: new Date(Date.now() - 21 * 86400000).toISOString(),
          lastInteractionChannel: "meeting",
          pendingActions: 0,
          snippet: "Hot lead, no contact in 3 weeks. Re-engage before stale.",
        },
      ],
    },
    {
      label: "New This Week",
      contacts: [
        {
          contactId: "c-taylor",
          contactName: "Taylor Kim",
          company: "NovaTech",
          tier: "cool",
          lastInteractionAt: null,
          lastInteractionChannel: null,
          pendingActions: 0,
          snippet: "Added via CSV import on Monday.",
        },
        {
          contactId: "c-pat",
          contactName: "Pat Nguyen",
          company: "CloudBase",
          tier: "cool",
          lastInteractionAt: null,
          lastInteractionChannel: null,
          pendingActions: 1,
          snippet: "New contact from Granola meeting sync.",
        },
      ],
    },
    {
      label: "Recently Active",
      contacts: [
        {
          contactId: "c-robin",
          contactName: "Robin Walsh",
          company: "Amplify",
          tier: "hot",
          lastInteractionAt: new Date(Date.now() - 1 * 86400000).toISOString(),
          lastInteractionChannel: "meeting",
          pendingActions: 0,
          snippet: "Had a productive call yesterday — pipeline review.",
        },
        {
          contactId: "c-casey",
          contactName: "Casey Park",
          company: "Vertex AI",
          tier: "warm",
          lastInteractionAt: new Date(Date.now() - 2 * 86400000).toISOString(),
          lastInteractionChannel: "email",
          pendingActions: 0,
          snippet: "Email exchange about Q3 roadmap alignment.",
        },
      ],
    },
  ],
};
