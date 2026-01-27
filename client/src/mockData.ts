// Mock data for Decisions page - Outbound OS

export interface DecisionItem {
  id: string;
  actionType: "follow_up_email" | "switch_to_linkedin" | "call" | "pause";
  personName: string;
  title: string;
  company: string;
  reason: string;
  channelRecommended: "Email" | "LinkedIn" | "Call" | "Pause";
  priority: "High" | "Medium" | "Low";
  lastTouchDate: string;
  suggestedSubject: string;
  suggestedBody: string;
  approved?: boolean;
}

export interface ActivityEvent {
  id: string;
  time: string;
  type: "positive_reply" | "bounce" | "marked_cold" | "opened" | "scheduled" | "unparked";
  text: string;
  details: string;
}

export interface ParkedLead {
  id: string;
  personName: string;
  company: string;
  reason: string;
  parkedUntil: string;
}

export const initialDecisions: DecisionItem[] = [
  {
    id: "dec-1",
    actionType: "switch_to_linkedin",
    personName: "Jyoti Bansal",
    title: "CEO & Co-Founder",
    company: "Harness",
    reason: "No reply after 6 days",
    channelRecommended: "LinkedIn",
    priority: "High",
    lastTouchDate: "Jan 21, 2026",
    suggestedSubject: "Quick question about Harness growth",
    suggestedBody: `Hi Jyoti,

I noticed Harness recently expanded into the security space with the Traceable acquisition. Impressive move.

I help engineering leaders reduce deployment friction without adding headcount. Would love to share a few ideas that might be relevant as you scale.

Open to a quick chat this week?

Best,
[Your name]`,
  },
  {
    id: "dec-2",
    actionType: "follow_up_email",
    personName: "Jean Namkung",
    title: "VP, Strategy and Operations",
    company: "Pinterest",
    reason: "Opened twice, no response",
    channelRecommended: "Email",
    priority: "Medium",
    lastTouchDate: "Jan 23, 2026",
    suggestedSubject: "Re: Operational efficiency at Pinterest",
    suggestedBody: `Hi Jean,

Following up on my note from last week. I noticed you opened it a couple of times so wanted to make sure it did not get buried.

Happy to share a quick case study on how similar ops leaders have streamlined cross-functional planning. No pressure, just thought it might be useful.

Let me know if 15 minutes works this week.

Best,
[Your name]`,
  },
  {
    id: "dec-3",
    actionType: "pause",
    personName: "Jose Mancera",
    title: "Machine Learning Engineer",
    company: "LinkedIn",
    reason: "Not the right contact for this topic",
    channelRecommended: "Pause",
    priority: "Low",
    lastTouchDate: "Jan 19, 2026",
    suggestedSubject: "",
    suggestedBody: `This contact appears to be an individual contributor focused on ML engineering. Consider pivoting to a manager or director-level contact in the ML platform team who owns budget and vendor decisions.

Recommended next step: Research LinkedIn's ML Platform team leadership and identify a more suitable contact.`,
  },
];

export const initialActivityFeed: ActivityEvent[] = [
  {
    id: "evt-1",
    time: "12:14 PM",
    type: "positive_reply",
    text: "Positive reply from MacKenna Kelleher",
    details: "MacKenna replied: 'Thanks for reaching out! I am currently evaluating solutions in this space. Let us set up a call next week to discuss further.'",
  },
  {
    id: "evt-2",
    time: "11:42 AM",
    type: "opened",
    text: "Nicolette Nigos-Loredo opened your email",
    details: "Email subject 'Campus recruiting at scale' was opened 3 times from San Francisco, CA. Last open was 11:42 AM today.",
  },
  {
    id: "evt-3",
    time: "10:05 AM",
    type: "scheduled",
    text: "Meeting scheduled with Annie Williams",
    details: "30-minute discovery call scheduled for Thursday, Jan 30 at 2:00 PM PST. Calendar invite sent to both parties.",
  },
  {
    id: "evt-4",
    time: "Yesterday",
    type: "bounce",
    text: "Email bounced for Jyoti Bansal",
    details: "The email address jyoti@harness.io returned a hard bounce. Consider using LinkedIn or finding an alternative email address.",
  },
  {
    id: "evt-5",
    time: "Yesterday",
    type: "marked_cold",
    text: "Jean Namkung marked as cold",
    details: "After 4 touchpoints with no engagement, this lead was automatically marked as cold. Will resurface in 30 days.",
  },
  {
    id: "evt-6",
    time: "2 days ago",
    type: "opened",
    text: "Jose Mancera opened your LinkedIn message",
    details: "LinkedIn connection request and message were viewed. No response yet. Consider a follow-up in 3 days.",
  },
];

export const initialParkedLeads: ParkedLead[] = [
  {
    id: "park-1",
    personName: "MacKenna Kelleher",
    company: "Datadog",
    reason: "Out of office until February",
    parkedUntil: "Feb 10, 2026",
  },
  {
    id: "park-2",
    personName: "Nicolette Nigos-Loredo",
    company: "Datadog",
    reason: "Budget cycle ends Q1",
    parkedUntil: "Apr 1, 2026",
  },
  {
    id: "park-3",
    personName: "Annie Williams",
    company: "LinkedIn",
    reason: "Recently changed roles",
    parkedUntil: "Mar 15, 2026",
  },
  {
    id: "park-4",
    personName: "Jyoti Bansal",
    company: "Harness",
    reason: "Conference season, low response rate",
    parkedUntil: "Feb 20, 2026",
  },
  {
    id: "park-5",
    personName: "Jean Namkung",
    company: "Pinterest",
    reason: "Internal reorg in progress",
    parkedUntil: "Mar 1, 2026",
  },
];
